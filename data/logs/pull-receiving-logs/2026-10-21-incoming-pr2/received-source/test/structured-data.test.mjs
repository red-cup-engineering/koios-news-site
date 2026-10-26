import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProperty } from "../src/build.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function jsonLdObjects(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)]
    .map((match) => JSON.parse(match[1]));
}

test("article structured data exposes accepted source citations", () => {
  const scratch = mkdtempSync(join(tmpdir(), "news-property-structured-data-"));
  try {
    const contentDir = join(scratch, "content");
    const outputDir = join(scratch, "public");
    cpSync(join(here, "fixtures", "content"), contentDir, { recursive: true });
    const property = JSON.parse(readFileSync(join(here, "fixtures", "property.json"), "utf8"));
    buildProperty({ property, contentDir, outputDir, asOf: new Date("2026-07-20T00:00:00Z") });

    const html = readFileSync(join(outputDir, "posts", "ai-compute-bottleneck-power-problem", "index.html"), "utf8");
    const article = jsonLdObjects(html).find((object) => object["@type"] === "NewsArticle");

    assert.ok(article, "article page must include NewsArticle JSON-LD");
    const homeHtml = readFileSync(join(outputDir, "index.html"), "utf8");
    const homeObjects = jsonLdObjects(homeHtml).flat();
    const publisher = homeObjects.find((object) => object["@type"] === "NewsMediaOrganization");
    const website = homeObjects.find((object) => object["@type"] === "WebSite");
    assert.ok(publisher, "home has actual publication entity");
    assert.ok(website, "home has a distinct, source-derived website entity");
    assert.equal(publisher["@id"], "https://koios.news/#publisher");
    assert.equal(website["@id"], "https://koios.news/#website");
    assert.deepEqual(website.publisher, { "@id": publisher["@id"] });
    assert.equal(publisher.url, "https://koios.news/");
    assert.equal(article.publisher["@id"], publisher["@id"]);

    const records = JSON.parse(readFileSync(join(outputDir, "posts", "ai-compute-bottleneck-power-problem", "citation.json"), "utf8"));
    assert.equal(records.length, 1);
    const citation = records[0];
    assert.equal(citation.type, "article-newspaper");
    assert.equal(citation.URL, article.url);
    assert.equal(citation.title, article.headline);
    assert.deepEqual(citation.author, [{literal:article.author.name}]);
    assert.deepEqual(citation.issued['date-parts'][0], article.datePublished.slice(0,10).split('-').map(Number));
    assert.equal(citation.DOI, undefined);
    assert.equal(citation.ISSN, undefined);
    assert.match(html, /name="citation_title"/u);
    assert.match(html, /name="citation_publication_date"/u);
    assert.match(html, /Cite this article \(CSL-JSON\)/u);
    assert.ok(JSON.parse(readFileSync(join(outputDir, "citations.json"), "utf8")).some(item=>item.id===citation.id));
    // Canonical page identity, public readability and source-controlled rights
    // must be projected into structured data, never guessed by an SEO bot.
    assert.deepEqual(article.mainEntityOfPage, { "@type": "WebPage",
      "@id": "https://koios.news/posts/ai-compute-bottleneck-power-problem/" });
    assert.equal(article.isAccessibleForFree, true);
    assert.equal(article.license, "https://creativecommons.org/licenses/by/4.0/");
    assert.deepEqual(article.citation, [
      "https://www.technologyreview.com/2026/06/19/1139313/a-startup-claims-it-broke-through-a-bottleneck-thats-holding-back-llms/",
      "https://www.theregister.com/systems/2026/06/19/tensordyne-makes-a-big-bet-on-log-math-to-beat-nvidia/5258662",
      "https://www.technologyreview.com/2026/06/16/1138591/data-center-online-quickly-electric-grid-flex/",
      "https://spectrum.ieee.org/orbital-data-centers-heat",
      "https://www.theregister.com/software/2026/05/05/openai-exec-says-it-will-burn-50b-on-compute-this-year/5226088",
    ]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// Original Content Engineering #20 / emsenn/newswire: receive the ordinary
// site's Ninjs artifact, not a parallel wire renderer or an editorial grant.
function withNinjsBuild(run) {
  const scratch = mkdtempSync(join(tmpdir(), "news-property-ninjs-"));
  try {
    const contentDir = join(scratch, "content");
    cpSync(join(here, "fixtures", "content"), contentDir, { recursive: true });
    const property = JSON.parse(readFileSync(join(here, "fixtures", "property.json"), "utf8"));
    property.masthead = { ...property.masthead,
      publisher: { name: "The original publisher", url: "https://publisher.example/" } };
    const build = (name = "public") => {
      const outputDir = join(scratch, name);
      buildProperty({ property, contentDir, outputDir, asOf: new Date("2026-07-20T00:00:00Z") });
      return { outputDir, items: JSON.parse(readFileSync(join(outputDir, "ninjs.json"), "utf8")) };
    };
    run({ scratch, property, contentDir, build });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

test("ordinary Ninjs artifact preserves source metadata and canonical identity", () => {
  withNinjsBuild(({ build }) => {
    const { items } = build();
    const item = items.find((item) => item.uri === "https://koios.news/posts/hello-world");
    assert.ok(item);
    assert.equal(item.by, "Nik Koios");
    assert.equal(item.language, "en");
    assert.equal(item.firstCreated, "2025-02-15T00:00:00Z");
    assert.match(item.bodies[0].value, /Koios.News/);
    assert.ok(item.subjects.some((subject) => subject.rel === "section" && subject.name === "technology"));
    assert.ok(item.subjects.some((subject) => subject.rel === "keyword" && subject.name === "autonomous newsroom"));
    assert.ok(item.subjects.some((subject) => subject.rel === "category" && subject.name === "Newsroom"));
    assert.deepEqual(item.organisations, [{ name: "The original publisher", rel: "publisher", uri: "https://publisher.example/" }]);
    assert.deepEqual(item.altIds, [{ role: "original-permalink", value: "https://koios.news/2025/02/15/hello-world/" }]);
    assert.equal(item.guid, undefined, "Ninjs 3.2 uses uri; do not invent an unsupported guid field");
  });
});

test("a corrected Ninjs artifact keeps its identity and first publication time", () => {
  withNinjsBuild(({ contentDir, property, build }) => {
    property.masthead.publisher = "The source publisher";
    const before = build("before").items.find((item) => item.uri.endsWith("/hello-world"));
    const path = join(contentDir, "posts", "hello-world.md");
    const source = readFileSync(path, "utf8");
    writeFileSync(path, source.replace('draft: false', 'draft: false\nmodified: "2026-07-19T12:00:00Z"') + "\nA witnessed correction to this source.\n");
    const after = build("after").items.filter((item) => item.uri === before.uri);
    assert.equal(after.length, 1);
    assert.equal(after[0].firstCreated, before.firstCreated);
    assert.deepEqual(after[0].altIds, before.altIds);
    assert.deepEqual(after[0].organisations, [{ name: "The source publisher", rel: "publisher" }]);
    assert.equal(after[0].versionCreated, "2026-07-19T12:00:00.000Z");
    assert.notEqual(after[0].versionCreated, before.versionCreated);
    assert.match(after[0].bodies[0].value, /A witnessed correction/);
  });
});

test("withheld source stays outside Ninjs and the existing feed surfaces", () => {
  withNinjsBuild(({ contentDir, build }) => {
    const before = build("before-withholding");
    assert.ok(before.items.some((item) => item.uri.endsWith("/hello-world")), "the same source was present before withholding");
    const path = join(contentDir, "posts", "hello-world.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("draft: false", "draft: true"));
    const { items, outputDir } = build();
    assert.ok(!items.some((item) => item.uri.endsWith("/hello-world")));
    for (const file of ["feed.xml", "feed.atom", "feed.json"]) {
      assert.ok(!readFileSync(join(outputDir, file), "utf8").includes("https://koios.news/posts/hello-world"), file);
    }
  });
});

test("forged published front matter cannot bypass the existing required publication ledger", () => {
  withNinjsBuild(({ property, build }) => {
    property.content = { ...property.content, requirePublishedLedger: true };
    assert.throws(() => build(), /Unreviewed content cannot publish from frontmatter/);
  });
});
