import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProperty } from "../src/build.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function buildFixture() {
  const scratch = mkdtempSync(join(tmpdir(), "news-property-trust-pages-"));
  const contentDir = join(scratch, "content");
  const outputDir = join(scratch, "public");
  cpSync(join(here, "fixtures", "content"), contentDir, { recursive: true });
  const property = JSON.parse(readFileSync(join(here, "fixtures", "property.json"), "utf8"));
  buildProperty({ property, contentDir, outputDir, asOf: new Date("2026-07-20T00:00:00Z") });
  return { scratch, outputDir };
}

test("static trust pages disclose ownership, funding, and AI-assisted process", () => {
  const { scratch, outputDir } = buildFixture();
  try {
    const about = readFileSync(join(outputDir, "about", "index.html"), "utf8");
    const standards = readFileSync(join(outputDir, "standards", "index.html"), "utf8");
    const standardsJson = JSON.parse(readFileSync(join(outputDir, "standards.json"), "utf8"));

    assert.match(about, /id="ownership"/);
    assert.match(about, /owned and published by The 561 Group/);
    assert.match(about, /advertising and offers paid products/);
    assert.match(standards, /Software and AI agents may assist source research/);
    assert.match(standards, /independent acceptance/);
    assert.ok(standardsJson.policies.includes("Disclose software and AI assistance in the publication method."));
    assert.deepEqual(standardsJson.ownership, {
      publisher: "Nik Koios",
      owner: "The 561 Group",
      funding: "The 561 Group funds this publication. Koios.News also carries advertising and offers paid products; those revenue paths do not buy editorial coverage.",
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the shared skip link targets one programmatically focusable main landmark on public trust surfaces", () => {
  const { scratch, outputDir } = buildFixture();
  try {
    for (const relative of ["index.html", "about/index.html", "standards/index.html", "corrections/index.html"]) {
      const html = readFileSync(join(outputDir, relative), "utf8");
      const skip = '<a class="skip-to-content" href="#main-content">Skip to content</a>';
      const main = '<main id="main-content" tabindex="-1" role="main">';
      assert.ok(html.includes(skip), relative + ": missing keyboard skip affordance");
      assert.ok(html.includes(main), relative + ": missing focusable main landmark");
      assert.ok(html.indexOf(skip) < html.indexOf(main), relative + ": skip link must precede main");
      assert.equal((html.match(/id="main-content"/gu) ?? []).length, 1,
        relative + ": ambiguous duplicate main anchor");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("public pages offer one stable primary-navigation link to the existing reader remedy", () => {
  const { scratch, outputDir } = buildFixture();
  try {
    const remedy = '<a href="/corrections/#report-an-error">Report a problem</a>';
    for (const relative of ["index.html", "about/index.html", "standards/index.html", "corrections/index.html"]) {
      const html = readFileSync(join(outputDir, relative), "utf8");
      const primary = /<nav aria-label="Primary">([\s\S]*?)<\/nav>/u.exec(html)?.[1];
      assert.ok(primary, relative + ": missing landmark-labelled primary navigation");
      assert.equal(primary.split(remedy).length - 1, 1,
        relative + ": help must be a single direct link in primary navigation");
      assert.ok(primary.indexOf(remedy) < primary.indexOf('<a href="/masthead/">Masthead</a>'),
        relative + ": help link moved relative to the masthead");
    }
    const corrections = readFileSync(join(outputDir, "corrections", "index.html"), "utf8");
    assert.match(corrections, /id="report-an-error"/u,
      "the shared help link must resolve to the existing public intake instructions");
    assert.match(corrections, /accessibility barrier/u,
      "the target must continue to offer accessibility reports as well as factual corrections");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("withdrawn article notices retain accessible focus, noindex, canonical address and no advertising", () => {
  const scratch = mkdtempSync(join(tmpdir(), "news-property-withdrawn-assurance-"));
  const contentDir = join(scratch, "content");
  const outputDir = join(scratch, "public");
  try {
    cpSync(join(here, "fixtures", "content"), contentDir, { recursive: true });
    writeFileSync(join(contentDir, "posts", "withdrawn-source.md"), `---
title: Withdrawn Source
date: 2026-07-10
draft: true
withdrawn: true
section: technology
---
This withdrawn draft's original manuscript must not be exposed on the notice.
`);
    const property = JSON.parse(readFileSync(join(here, "fixtures", "property.json"), "utf8"));
    buildProperty({ property, contentDir, outputDir, asOf: new Date("2026-07-20T00:00:00Z") });
    const notice = readFileSync(join(outputDir, "posts", "withdrawn-source", "index.html"), "utf8");
    const published = readFileSync(join(outputDir, "index.html"), "utf8");
    const skip = '<a class="skip-to-content" href="#main-content">Skip to content</a>';
    const main = '<main id="main-content" tabindex="-1" role="main">';
    assert.ok(notice.includes(skip), "withdrawn address must retain keyboard skip link");
    assert.ok(notice.includes(main), "withdrawn address must retain programmatically focusable main");
    assert.ok(notice.indexOf(skip) < notice.indexOf(main), "skip target must follow its link");
    assert.equal((notice.match(/id="main-content"/gu) ?? []).length, 1);
    assert.match(notice, /<meta name="robots" content="noindex, follow">/u);
    assert.match(notice, /<link rel="canonical" href="https:\/\/koios\.news\/posts\/withdrawn-source\/">/u);
    assert.match(notice, /<link rel="stylesheet" href="\/assets\/(?:h\/site\.[0-9a-f]{16}|site)\.css">/u);
    assert.match(notice, /<a href="\/corrections\/">Corrections<\/a>/u);
    assert.match(notice, /<a href="\/archive\/">Browse published articles<\/a>/u);
    assert.doesNotMatch(notice, /data-slot=|data-aa=|\/assets\/house-ad\.js|<iframe/gu,
      "unavailable article notices must not request or render advertisements");
    assert.doesNotMatch(notice, /NewsArticle|original manuscript must not be exposed/u,
      "an unavailable notice must not publish a draft or a NewsArticle claim");
    assert.match(published, /data-slot="header"/u,
      "normal published pages retain the original advertising capability");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
