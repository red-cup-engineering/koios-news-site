import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { buildProperty } from "../src/build.mjs";
import { resolvePublicationInstants, DAY_ONLY_HOUR_UTC } from "../src/publication-instants.mjs";
import { documentTitle } from "../src/render/templates.mjs";
import { FEED_ITEM_LIMIT } from "../src/render/feeds.mjs";
import { renderNewsSitemap } from "../src/render/sitemaps.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureProperty = () => JSON.parse(readFileSync(join(here, "fixtures", "property.json"), "utf8"));
const ASOF = new Date("2026-06-20T06:00:00Z");
const ARTICLE = "ai-compute-bottleneck-power-problem";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Build the fixture site (optionally altered) and hand back a reader over the output. */
function site({ mutateProperty, mutateContent, evidence, asOf = ASOF } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), "koios-seo-standards-"));
  const contentDir = join(scratch, "content");
  const outputDir = join(scratch, "public");
  cpSync(join(here, "fixtures", "content"), contentDir, { recursive: true });
  const property = fixtureProperty();
  mutateProperty?.(property);
  mutateContent?.(contentDir);
  let publicationEvidenceDir;
  if (evidence) {
    publicationEvidenceDir = join(scratch, "evidence");
    for (const [slug, digest, record] of evidence) {
      mkdirSync(join(publicationEvidenceDir, slug, digest), { recursive: true });
      writeFileSync(join(publicationEvidenceDir, slug, digest, "publication.json"), JSON.stringify({ slug, sourceSha256: digest, ...record }));
    }
  }
  buildProperty({ property, contentDir, outputDir, publicationEvidenceDir, asOf });
  return {
    outputDir,
    read: (path) => readFileSync(join(outputDir, path), "utf8"),
    bytes: (path) => readFileSync(join(outputDir, path)),
    exists: (path) => existsSync(join(outputDir, path)),
    cleanup: () => rmSync(scratch, { recursive: true, force: true }),
  };
}

function withSite(options, fn) {
  const built = site(options);
  try { return fn(built); } finally { built.cleanup(); }
}

const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)]
  .flatMap((match) => { const value = JSON.parse(match[1]); return Array.isArray(value) ? value : [value]; });
const ofType = (html, type) => jsonLd(html).find((object) => object["@type"] === type);
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

test("publication instants come from front matter, then recorded evidence, then noon UTC of the recorded day", () => {
  const post = { date: "2026-06-19", sourceDigest: "a".repeat(64) };
  const fallback = resolvePublicationInstants(post);
  assert.equal(fallback.publishedInstant, `2026-06-19T${DAY_ONLY_HOUR_UTC}`);
  assert.equal(fallback.publishedPrecision, "day");
  assert.equal(fallback.modifiedInstant, fallback.publishedInstant);

  const evidence = [
    { sourceSha256: "b".repeat(64), acceptedAt: "2026-06-19T08:00:00Z", renderedAt: "2026-06-19T08:05:00Z" },
    { sourceSha256: "a".repeat(64), acceptedAt: "2026-06-21T09:00:00Z", renderedAt: "2026-06-21T09:01:00Z" },
  ];
  const recorded = resolvePublicationInstants(post, evidence);
  assert.equal(recorded.publishedInstant, "2026-06-19T08:05:00Z");
  assert.equal(recorded.publishedSource, "publication-evidence");
  assert.equal(recorded.modifiedInstant, "2026-06-21T09:01:00Z", "the revision is the render of the exact source digest");

  const claimed = resolvePublicationInstants({ ...post, publishedAt: "2026-06-19T14:30:00Z", modified: "2026-06-20" }, evidence);
  assert.equal(claimed.publishedInstant, "2026-06-19T14:30:00Z");
  assert.equal(claimed.publishedSource, "front-matter");
  assert.ok(claimed.modifiedInstant >= claimed.publishedInstant);
});

test("every article date is a full UTC instant: JSON-LD, Open Graph, <time>, RSS, Atom, JSON Feed, ninjs and the news sitemap", () => {
  const evidence = [[ARTICLE, "c".repeat(64), { acceptedAt: "2026-06-19T15:10:00Z", renderedAt: "2026-06-19T15:12:30Z" }]];
  withSite({ evidence }, (built) => {
    const html = built.read(`posts/${ARTICLE}/index.html`);
    const article = ofType(html, "NewsArticle");
    // The fixture post has a `modified: 2026-06-20` day, so the instant is noon UTC of that day.
    assert.equal(article.datePublished, "2026-06-19T15:12:30Z");
    assert.match(article.dateModified, INSTANT);
    assert.ok(article.dateModified >= article.datePublished);
    assert.match(html, /<meta property="article:published_time" content="2026-06-19T15:12:30Z"/u);
    assert.match(html, /<meta property="article:modified_time" content="2026-06-20T12:00:00Z"/u);
    assert.match(html, /<time class="dt-published" datetime="2026-06-19T15:12:30Z">June 19, 2026 at 15:12 UTC<\/time>/u);
    assert.match(html, /<time class="dt-updated" datetime="2026-06-20T12:00:00Z">/u);
    assert.doesNotMatch(html, /datePublished":"\d{4}-\d{2}-\d{2}"/u);

    const rss = built.read("feed.xml");
    assert.match(rss, /<pubDate>Fri, 19 Jun 2026 15:12:30 GMT<\/pubDate>/u);
    assert.match(built.read("feed.atom"), /<published>2026-06-19T15:12:30Z<\/published>/u);
    assert.ok(JSON.parse(built.read("feed.json")).items.some((item) => item.date_published === "2026-06-19T15:12:30Z"));
    const ninjs = JSON.parse(built.read("ninjs.json"));
    assert.ok(JSON.stringify(ninjs).includes("2026-06-19T15:12:30Z"));

    // A day-only article is reported at noon UTC and shows the day alone.
    const day = built.read("posts/hello-world/index.html");
    assert.match(day, /<time class="dt-published" datetime="2025-02-15T12:00:00Z">February 15, 2025<\/time>/u);
    assert.doesNotMatch(day, /dt-updated/u);
    assert.doesNotMatch(day, /T00:00:00Z/u);
  });
});

test("the news sitemap is static: it lists exactly the articles whose publication instant is inside the 48 hours before the build", () => {
  const posts = [
    { slug: "fresh", title: "Fresh", publishedInstant: "2026-06-20T04:00:00Z" },
    { slug: "edge", title: "Edge", publishedInstant: "2026-06-18T06:00:00Z" },
    { slug: "stale", title: "Stale", publishedInstant: "2026-06-18T05:59:59Z" },
    { slug: "future", title: "Future", publishedInstant: "2026-06-20T06:00:01Z" },
  ];
  const xml = renderNewsSitemap(posts, fixtureProperty(), ASOF);
  assert.match(xml, /\/posts\/fresh\//u);
  assert.match(xml, /\/posts\/edge\//u);
  assert.doesNotMatch(xml, /\/posts\/stale\//u);
  assert.doesNotMatch(xml, /\/posts\/future\//u);
  assert.match(xml, /<news:publication_date>2026-06-20T04:00:00(?:\.000)?Z<\/news:publication_date>/u);
  assert.equal(renderNewsSitemap(posts, fixtureProperty(), ASOF), xml, "same build time, same bytes");
});

test("sitemap lastmod is the revision instant for articles and the newest member revision for hubs; static pages have none", () => {
  withSite({}, (built) => {
    const xml = built.read("sitemap.xml");
    const lastmod = (path) => new RegExp(`<loc>https://koios\\.news${path}</loc>\\s*(?:<lastmod>([^<]*)</lastmod>)?`, "u").exec(xml)?.[1];
    assert.equal(lastmod(`/posts/${ARTICLE}/`), "2026-06-20T12:00:00Z");
    assert.equal(lastmod("/"), "2026-07-01T12:00:00Z", "home is as new as its newest article");
    assert.equal(lastmod("/sections/technology/"), "2026-06-20T12:00:00Z");
    assert.equal(lastmod("/sections/world/"), "2026-07-01T12:00:00Z");
    assert.equal(lastmod("/archive/2025/"), "2025-02-17T12:00:00Z");
    assert.equal(lastmod("/standards/"), undefined);
    assert.equal(lastmod("/contact/"), undefined);
    assert.ok(xml.includes("<loc>https://koios.news/contact/</loc>"));
  });
});

test("tags held by one article are noindex and absent from the sitemap; tags held by two or more stay indexed", () => {
  withSite({
    mutateContent(contentDir) {
      const file = join(contentDir, "posts", "hello-world.md");
      writeFileSync(file, readFileSync(file, "utf8").replace(/^keywords:.*$/mu, "keywords: [\"shared tag\", \"only-here tag\"]"));
      const other = join(contentDir, "posts", "gate-audit-explainer.md");
      writeFileSync(other, readFileSync(other, "utf8").replace(/^keywords:.*$/mu, "keywords: [\"shared tag\"]"));
    },
  }, (built) => {
    const thin = built.read("tags/only-here-tag/index.html");
    assert.match(thin, /<meta name="robots" content="noindex/u);
    const shared = built.read("tags/shared-tag/index.html");
    assert.doesNotMatch(shared, /noindex/u);
    const sitemap = built.read("sitemap.xml");
    assert.doesNotMatch(sitemap, /\/tags\/only-here-tag\//u);
    assert.match(sitemap, /\/tags\/shared-tag\//u);
    assert.ok(built.exists("tags/only-here-tag/index.html"), "the thin page remains for readers");
  });
});

test("an article page carries a trimmed title, bare social titles, a breadcrumb, a speakable dek and honest article section", () => {
  const long = "A Remarkably Long Headline About The Deterministic Gates That Decide Whether A Newsroom Publishes";
  assert.ok(long.length > 60);
  assert.equal(documentTitle("Short headline", "Koios.News"), "Short headline – Koios.News");
  assert.equal(documentTitle(long, "Koios.News"), documentTitle(long, "Koios.News"));
  assert.ok(documentTitle(long, "Koios.News").length <= 60);
  assert.ok(documentTitle("Medium length headline that is fairly long for a tab", "Koios.News").length <= 60);

  withSite({}, (built) => {
    const html = built.read(`posts/${ARTICLE}/index.html`);
    const headline = ofType(html, "NewsArticle").headline;
    assert.match(html, /<title>[^<]{1,60}<\/title>/u);
    assert.ok(html.includes(`<meta property="og:title" content="${headline}"`));
    assert.ok(html.includes(`<meta name="twitter:title" content="${headline}"`));
    assert.equal(ofType(html, "NewsArticle").articleSection, "Technology");
    const crumbs = ofType(html, "BreadcrumbList").itemListElement;
    assert.deepEqual(crumbs.map((item) => item.name), ["Home", "Technology", headline]);
    assert.deepEqual(crumbs.map((item) => item.position), [1, 2, 3]);
    assert.equal(crumbs[2].item, `https://koios.news/posts/${ARTICLE}/`);
    // `.article-dek` is only declared speakable on a page that renders one.
    const withDek = ofType(html, "NewsArticle").speakable;
    assert.equal(html.includes('class="article-dek"'), withDek !== undefined);
    if (withDek) assert.deepEqual(withDek.cssSelector, [".article-dek"]);
  });
});

test("a synchronous render without editorial raster media does not label provenance fingerprint crops as article images", () => {
  withSite({mutateProperty:property=>{delete property.images.defaultOgImage;}}, (built) => {
    const images = ofType(built.read(`posts/${ARTICLE}/index.html`), "NewsArticle").image;
    assert.equal(images,undefined);
    assert.ok(built.exists(`fingerprints/${ARTICLE}.json`));
    assert.ok(built.exists(`fingerprints/${ARTICLE}.png`));
    assert.doesNotMatch(built.read(`posts/${ARTICLE}/index.html`),/<meta (?:property="og:image"|name="twitter:image")/u);
  });
});

test("the publisher logo is a deterministic raster PNG referenced by the home page, articles, feeds and manifest", () => {
  const first = site();
  const second = site();
  try {
    const logo = first.bytes("logo.png");
    assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(logo.readUInt32BE(16), 512);
    assert.equal(logo.readUInt32BE(20), 512);
    assert.equal(sha(logo), sha(second.bytes("logo.png")));
    const org = ofType(first.read("index.html"), "NewsMediaOrganization");
    assert.deepEqual(org.logo, { "@type": "ImageObject", url: "https://koios.news/logo.png", width: 512, height: 512 });
    assert.equal(ofType(first.read(`posts/${ARTICLE}/index.html`), "NewsArticle").publisher.logo.url, "https://koios.news/logo.png");
    assert.match(first.read("feed.xml"), /<image><url>https:\/\/koios\.news\/logo\.png<\/url>/u);
    assert.ok(JSON.parse(first.read("manifest.webmanifest")).icons.some((icon) => icon.src === "/logo.png" && icon.type === "image/png"));
  } finally { first.cleanup(); second.cleanup(); }
});

test("the home page declares a WebSite with a SearchAction aimed at the search page", () => {
  withSite({}, (built) => {
    const website = ofType(built.read("index.html"), "WebSite");
    assert.equal(website.url, "https://koios.news/");
    assert.equal(website.potentialAction["@type"], "SearchAction");
    assert.equal(website.potentialAction.target.urlTemplate, "https://koios.news/search/?q={search_term_string}");
    assert.equal(website.potentialAction["query-input"], "required name=search_term_string");
  });
});

test("the byline links the same author URL as the JSON-LD, and the author page is a ProfilePage with an AI-authorship statement", () => {
  withSite({}, (built) => {
    const html = built.read(`posts/${ARTICLE}/index.html`);
    const article = ofType(html, "NewsArticle");
    assert.match(html, /<a class="p-author" href="\/authors\/nik-koios\/">Nik Koios<\/a>/u);
    assert.equal(article.author.url, "https://koios.news/authors/nik-koios/");
    assert.equal(article.author.jobTitle, "AI Editor-in-Chief");
    assert.deepEqual(article.author.sameAs, ["https://bsky.app/profile/koios.news"]);

    const page = built.read("authors/nik-koios/index.html");
    const profile = ofType(page, "ProfilePage");
    assert.equal(profile.mainEntity.name, "Nik Koios");
    assert.equal(profile.mainEntity.jobTitle, "AI Editor-in-Chief");
    assert.deepEqual(profile.mainEntity.sameAs, ["https://bsky.app/profile/koios.news"]);
    assert.ok(profile.mainEntity.knowsAbout.includes("Technology"));
    assert.equal(profile.mainEntity.worksFor.name, "Koios.News");
    assert.match(profile.dateModified, INSTANT);
    assert.match(page, /AI authorship\.<\/strong> Nik Koios is the AI Editor-in-Chief of Koios\.News\. Nik Koios is an artificial-intelligence editorial character, not a human journalist\./u);
    assert.match(html, /<p class="article-disclosure"><strong>AI disclosure\.<\/strong>[^<]*Nik Koios, the AI Editor-in-Chief of Koios\.News, an artificial-intelligence character[^<]*<a href="\/standards\/">How we report<\/a> · <a href="\/corrections\/#report-an-error">/u);
  });
});

test("a desk byline has one canonical address, the desk page, and its author address is a 301 to it", () => {
  withSite({
    mutateContent(contentDir) {
      const file = join(contentDir, "posts", "gate-audit-explainer.md");
      writeFileSync(file, readFileSync(file, "utf8").replace(/^author:.*$/mu, 'author: "Koios.News World Desk"'));
    },
  }, (built) => {
    const html = built.read("posts/gate-audit-explainer/index.html");
    const article = ofType(html, "NewsArticle");
    assert.match(html, /<a class="p-author" href="\/desks\/world\/">Koios\.News World Desk<\/a>/u);
    assert.equal(article.author["@type"], "Organization");
    assert.equal(article.author.url, "https://koios.news/desks/world/");
    assert.equal(built.exists("authors/koios-news-world-desk/index.html"), false);
    const redirects = built.read("_redirects").split("\n");
    assert.ok(redirects.includes("/authors/koios-news-world-desk/ /desks/world/ 301"));
    assert.ok(built.exists("desks/world/index.html"));
  });
});

test("llms.txt and llms-full.txt index the publication for answer engines without reproducing article bodies", () => {
  withSite({}, (built) => {
    const brief = built.read("llms.txt");
    assert.match(brief, /^# Koios\.News\n\n> General news with systems-analysis depth\./u);
    assert.doesNotMatch(brief, /\[object Object\]/u);
    assert.match(brief, /\[Standards\]\(https:\/\/koios\.news\/standards\/\)/u);
    assert.match(brief, /\[Full article index\]\(https:\/\/koios\.news\/llms-full\.txt\)/u);
    assert.match(brief, new RegExp(`\\(https://koios\\.news/posts/${ARTICLE}/\\)`, "u"));
    const full = built.read("llms-full.txt");
    for (const slug of ["hello-world", "gate-audit-explainer", ARTICLE, "assisted-tree-migration-climate-change-solutions"]) {
      assert.ok(full.includes(`https://koios.news/posts/${slug}/`), `${slug} is indexed`);
    }
    assert.match(full, /published 2026-06-19T12:00:00Z/u);
    assert.match(full, /nik-koios/u);
    assert.ok(full.length < 20_000, "an index, not a corpus");
    assert.ok(built.read("manifest.json").includes('"llms.txt"') && built.read("manifest.json").includes('"llms-full.txt"'));
  });
});

test("robots.txt names each AI crawler with an explicit allow group and keeps both sitemaps", () => {
  withSite({}, (built) => {
    const robots = built.read("robots.txt");
    for (const agent of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "*"]) {
      assert.match(robots, new RegExp(`User-agent: ${agent.replace("*", "\\*")}\\nAllow: /\\n`, "u"), agent);
    }
    assert.match(robots, /Sitemap: https:\/\/koios\.news\/sitemap\.xml/u);
    assert.match(robots, /Sitemap: https:\/\/koios\.news\/news-sitemap\.xml/u);
  });
});

test("content-addressed assets are immutable and the legacy names stay mutable and published", () => {
  withSite({}, (built) => {
    const headers = built.read("_headers");
    assert.match(headers, /\n\/assets\/h\/\*\n  Cache-Control: public, max-age=31536000, immutable\n/u);
    assert.match(headers, /\n\/fingerprints\/h\/\*\n  Cache-Control: public, max-age=31536000, immutable\n/u);
    assert.equal(headers.match(/Cache-Control:/gu)?.length, 2, "nothing mutable is declared immutable");
    assert.doesNotMatch(headers, /\n\/assets\/\*\n|\n\/fingerprints\/\*\n/u);

    const home = built.read("index.html");
    const css = /href="(\/assets\/h\/site\.([0-9a-f]{16})\.css)"/u.exec(home);
    assert.ok(css, "pages link the hashed stylesheet");
    assert.equal(sha(built.bytes(css[1].slice(1))).slice(0, 16), css[2], "the name is the digest of the bytes");
    for (const legacy of ["assets/site.css", "assets/search.js", "assets/share.js", "assets/house-ad.js"]) {
      assert.ok(built.exists(legacy), `${legacy} stays published`);
    }
    assert.equal(sha(built.bytes("assets/site.css")), sha(built.bytes(css[1].slice(1))));
    assert.match(built.read("search/index.html"), /src="\/assets\/h\/search\.[0-9a-f]{16}\.js"/u);
    for (const slug of ["hello-world", ARTICLE]) for (const ext of ["json", "svg", "png"]) assert.ok(built.exists(`fingerprints/${slug}.${ext}`));
  });
});

test("feeds carry the newest 30 items and RSS declares the committed publishing rate", () => {
  assert.equal(FEED_ITEM_LIMIT, 30);
  withSite({
    mutateContent(contentDir) {
      const template = readFileSync(join(contentDir, "posts", "hello-world.md"), "utf8");
      for (let index = 0; index < 34; index += 1) {
        const slug = `bulk-post-${String(index).padStart(2, "0")}`;
        const day = String(1 + (index % 28)).padStart(2, "0");
        writeFileSync(join(contentDir, "posts", `${slug}.md`), template
          .replace(/^title:.*$/mu, `title: "Bulk post ${index}"`)
          .replace(/^date:.*$/mu, `date: 2026-05-${day}`)
          .replace(/original_permalink:.*\n/u, "")
          .replace(/^slug:.*\n/mu, "") + "\n");
      }
    },
  }, (built) => {
    const rss = built.read("feed.xml");
    assert.equal(rss.match(/<item>/gu)?.length, FEED_ITEM_LIMIT);
    assert.equal(JSON.parse(built.read("feed.json")).items.length, FEED_ITEM_LIMIT);
    assert.equal(built.read("feed.atom").match(/<entry>/gu)?.length, FEED_ITEM_LIMIT);
    assert.match(rss, /xmlns:sy="http:\/\/purl\.org\/rss\/1\.0\/modules\/syndication\/"/u);
    assert.match(rss, /<sy:updatePeriod>daily<\/sy:updatePeriod>\s*<sy:updateFrequency>20<\/sy:updateFrequency>/u);
    assert.ok(built.read("sitemap.xml").includes("/posts/bulk-post-33/"), "the sitemap still lists everything");
  });
});

test("a property without a daily article target declares no feed rate", () => {
  withSite({ mutateProperty(property) { delete property.cadence.dailyArticleTarget; } }, (built) => {
    assert.doesNotMatch(built.read("feed.xml"), /sy:update|syndication\/"/u);
  });
});

test("hero images reserve their space and load first; the ad follows the lede and reserves its height", () => {
  withSite({}, (built) => {
    const html = built.read(`posts/${ARTICLE}/index.html`);
    assert.match(html, /<img src="[^"]+" alt="[^"]*" width="1200" height="675" fetchpriority="high" decoding="async">/u);
    const content = html.slice(html.indexOf('<div class="e-content">'));
    const firstParagraphEnd = content.indexOf("</p>");
    const ad = content.indexOf("house-ad");
    if (ad >= 0) assert.ok(ad > firstParagraphEnd, "the advertisement comes after the first paragraph");
    const lede = html.slice(0, html.indexOf('<div class="e-content">'));
    assert.doesNotMatch(lede.slice(lede.indexOf("<main")), /house-ad/u, "no advertisement above the lede");
  });
});

// <main role="main"> is kept: the preview probe and the trust-page tests match its exact bytes.
test("landmarks have no redundant roles and every repeated landmark is named", () => {
  withSite({}, (built) => {
    for (const path of ["index.html", `posts/${ARTICLE}/index.html`, "authors/nik-koios/index.html", "standards/index.html", "search/index.html"]) {
      const html = built.read(path);
      assert.doesNotMatch(html, /<(?:header|footer|nav)\b[^>]*\brole="(?:banner|contentinfo|navigation)"/u, path);
      const navs = html.match(/<nav\b[^>]*>/gu) ?? [];
      for (const nav of navs) assert.match(nav, /aria-label="[^"]+"/u, `${path}: ${nav}`);
      for (const aside of html.match(/<aside\b[^>]*>/gu) ?? []) assert.match(aside, /aria-label="[^"]+"/u, `${path}: ${aside}`);
    }
    assert.match(built.read("search/index.html"), /<form id="search-form" class="search-form" role="search" aria-label="Search Koios\.News">/u);
  });
});

test("/contact/ states how to reach the newsroom and report an error, with ContactPage structured data", () => {
  withSite({}, (built) => {
    const html = built.read("contact/index.html");
    assert.match(html, /<title>Contact – Koios\.News<\/title>/u);
    assert.match(html, /href="mailto:nik@koios\.news"/u);
    assert.match(html, /href="\/corrections\/#report-an-error"/u);
    assert.match(html, /not guaranteed/u);
    const page = ofType(html, "ContactPage");
    assert.equal(page.url, "https://koios.news/contact/");
    assert.equal(page.about.contactPoint[0].email, "nik@koios.news");
    assert.match(built.read("index.html"), /href="\/contact\/"/u);
  });
});

test("every public listing of an article agrees with the article's own publication instant", () => {
  withSite({}, (built) => {
    const operations = JSON.parse(built.read("operations.json"));
    assert.match(operations.newestPublished, INSTANT);
    const audit = JSON.parse(built.read("newswire-audit.json"));
    for (const entry of audit.posts) assert.match(entry.published, INSTANT, entry.slug);
    const slugs = readdirSync(join(built.outputDir, "posts"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
    assert.ok(slugs >= 4);
  });
});
