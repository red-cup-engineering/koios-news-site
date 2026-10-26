import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHomePage, renderSectionPage } from "../src/render/templates.mjs";

const property = Object.freeze({
  name: "Koios.News", origin: "https://koios.news", language: "en", locale: "en_US",
  tagline: "Source-linked reporting", sections: [{ slug: "world", title: "World" }],
});
const asOf = new Date("2026-10-26T16:00:00Z");
const story = Object.freeze({
  slug: "current-report", title: "Current <report> & its evidence", description: "A reported development.",
  section: "world", sectionTitle: "World", date: "2026-10-26", author: "World Desk",
});
const h1s = html => [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gu)].map(match => match[1]);

test("the rendered home gives its lead report one primary heading and retains card styling", () => {
  const html = renderHomePage({ property, posts: [story, { ...story, slug: "second-report", title: "Second report" }], asOf });
  assert.deepEqual(h1s(html), ['<a href="/posts/current-report/">Current &lt;report&gt; &amp; its evidence</a>']);
  assert.match(html, /<article class="story story--lead">[\s\S]*?<h1 class="story__head">/u);
  assert.match(html, /<h2 class="story__head"><a href="\/posts\/second-report\/">Second report<\/a><\/h2>/u);
});

test("empty, stale-only and future-only homes retain an honest primary heading", () => {
  for (const posts of [[], [{ ...story, date: "2026-09-01" }], [{ ...story, date: "2026-10-27" }]]) {
    const html = renderHomePage({ property, posts, asOf });
    assert.deepEqual(h1s(html), ["Latest reporting"]);
    assert.match(html, /No reports published in the past 30 days/u);
    assert.doesNotMatch(html, /class="story story--lead"/u);
  }
});

test("section pages retain their section heading and subordinate story headings", () => {
  const html = renderSectionPage({ property, section: property.sections[0], posts: [story], page: 1 });
  assert.deepEqual(h1s(html), ["World"]);
  assert.match(html, /<h2 class="story__head"><a href="\/posts\/current-report\/">/u);
});
