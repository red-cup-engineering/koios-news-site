import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPropertyWithMedia, parsePost } from "../src/build.mjs";
import { MAX_PUBLICATION_MEDIA_BYTES, parsePublicationMedia, validatePublicationCaptions } from "../src/publication-media.mjs";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
const recordings = JSON.parse(readFileSync(join(fixtures, "media/recordings.json"), "utf8"));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const captions = Buffer.from("WEBVTT\n\nfirst\n00:00.000 --> 00:00.500\n[A test tone sounds.]\n");
const canonical = "https://koios.news/posts/media-receiving/";
const instant = "2026-10-26T12:00:00.000Z";

function selectedMedia() {
  const caption = { "@type": "MediaObject", name: "English captions", inLanguage: "en", encodingFormat: "text/vtt",
    contentUrl: "/assets/recordings/tone.vtt", sha256: sha256(captions) };
  return recordings.map(recording => ({ "@type": recording.file.endsWith(".wav") ? "AudioObject" : "VideoObject",
    name: recording.file.endsWith(".wav") ? "Audio test recording" : "Video test recording",
    contentUrl: `/assets/recordings/${recording.file}`,
    encodingFormat: recording.file.endsWith(".wav") ? "audio/wav" : "video/mp4", sha256: recording.sha256,
    transcript: recording.file.endsWith(".wav") ? "[A 440 Hz test tone sounds for half a second.]" :
      "[A blue test frame remains on screen while a test tone sounds for half a second.]",
    inLanguage: "en", creditText: "Koios.News synthetic test fixture", license: "https://creativecommons.org/publicdomain/zero/1.0/",
    ...(recording.file.endsWith(".mp4") ? { caption } : {}) }));
}

function sourceFor(media = selectedMedia()) {
  return `---\ntitle: Receive an accessible recording\nslug: media-receiving\ndate: 2026-10-26\nsection: technology\ndraft: false\n` +
    (media === undefined ? "" : `media: ${JSON.stringify(media)}\n`) +
    `---\nA reported article with independently admitted media.\n`;
}

async function withPublication(run) {
  const root = mkdtempSync(join(tmpdir(), "koios-audiovisual-"));
  try {
    const contentDir = join(root, "content"), publishedPostsDir = join(root, "ledger"), outputDir = join(root, "public");
    mkdirSync(join(contentDir, "posts"), { recursive: true });
    mkdirSync(join(contentDir, "assets/recordings"), { recursive: true });
    mkdirSync(publishedPostsDir);
    for (const recording of recordings) {
      const bytes = Buffer.from(recording.base64, "base64");
      assert.equal(bytes.length, recording.byteLength);
      assert.equal(sha256(bytes), recording.sha256);
      writeFileSync(join(contentDir, "assets/recordings", recording.file), bytes);
    }
    writeFileSync(join(contentDir, "assets/recordings/tone.vtt"), captions);
    writeFileSync(join(contentDir, "assets/recordings/unselected.wav"), Buffer.from("Private unselected neighbor"));
    const property = JSON.parse(readFileSync(join(fixtures, "property.json"), "utf8"));
    property.content = { root: contentDir, publishedPosts: "ledger", requirePublishedLedger: true };
    delete property.images.defaultOgImage;
    const sourcePath = join(contentDir, "posts/media-receiving.md"), ledgerPath = join(publishedPostsDir, "media-receiving.md");
    const admit = source => { writeFileSync(sourcePath, source); writeFileSync(ledgerPath, source); };
    admit(sourceFor());
    const options = { property, contentDir, publishedPostsDir, outputDir, asOf: new Date(instant) };
    await run({ root, property, contentDir, publishedPostsDir, outputDir, sourcePath, ledgerPath, admit,
      build: () => buildPropertyWithMedia(options) });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function articleGraph(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)]
    .flatMap(match => [JSON.parse(match[1])].flat()).find(item => item["@type"] === "NewsArticle");
}

function assertReceived(publication) {
  const { outputDir, contentDir, sourcePath, ledgerPath, originalSource } = publication;
  const html = readFileSync(join(outputDir, "posts/media-receiving/index.html"), "utf8");
  const graph = articleGraph(html), manifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
  assert.equal(manifest.publishedPostCount, 1);
  for (const [name, type] of [["tone.wav", "audio/wav"], ["tone.mp4", "video/mp4"], ["tone.vtt", "text/vtt"]]) {
    const path = `assets/recordings/${name}`, source = readFileSync(join(contentDir, path)), output = readFileSync(join(outputDir, path));
    assert.deepEqual(output, source, `${name} is the exact admitted asset`);
    const artifact = manifest.artifacts.find(item => item.file === path);
    assert.equal(artifact.sha256, sha256(source), `${name} is sealed in the actual publication manifest`);
    assert.ok(readFileSync(join(outputDir, "_headers"), "utf8").includes(`/assets/*.${name.split(".").at(-1)}\n  Content-Type: ${type}\n`));
  }
  assert.equal(existsSync(join(outputDir, "assets/recordings/unselected.wav")), false);
  assert.deepEqual(readFileSync(sourcePath), originalSource);
  assert.deepEqual(readFileSync(ledgerPath), originalSource);
  assert.match(html, /<audio controls preload="none"[^>]*>/u);
  assert.match(html, /<video controls preload="none" playsinline[^>]*>/u);
  assert.match(html, /<track kind="captions" src="https:\/\/koios.news\/assets\/recordings\/tone.vtt" srclang="en" label="English captions" default>/u);
  assert.doesNotMatch(html, /<audio[^>]*autoplay|<video[^>]*autoplay/u);
  for (const item of selectedMedia()) {
    assert.ok(html.includes(item.transcript));
    assert.ok(html.includes(item.creditText));
    assert.ok(html.includes(item.license));
  }
  assert.equal(graph.audio.length, 1); assert.equal(graph.video.length, 1);
  for (const [index, item] of [...graph.audio, ...graph.video].entries()) {
    const selected = selectedMedia()[index], bytes = readFileSync(join(contentDir, selected.contentUrl));
    assert.equal(item.contentUrl, `https://koios.news${selected.contentUrl}`);
    assert.equal(item.sha256, selected.sha256); assert.equal(item.contentSize, `${bytes.length} bytes`);
    assert.equal(item.transcript, selected.transcript);
    assert.deepEqual(item.associatedArticle, { "@type": "NewsArticle", "@id": canonical });
    for (const unsupported of ["duration", "width", "height", "uploadDate"]) assert.equal(item[unsupported], undefined);
  }
  assert.equal(graph.video[0].caption.sha256, sha256(captions));
  assert.equal(graph.video[0].caption.contentSize, `${captions.length} bytes`);
  const json = JSON.parse(readFileSync(join(outputDir, "feed.json"), "utf8")), item = json.items.find(item => item.url === canonical);
  const rss = readFileSync(join(outputDir, "feed.xml"), "utf8"), atom = readFileSync(join(outputDir, "feed.atom"), "utf8");
  for (const body of [item.content_html, rss, atom]) {
    for (const path of ["tone.wav", "tone.mp4", "tone.vtt"]) assert.ok(body.includes(`https://koios.news/assets/recordings/${path}`));
    assert.ok(body.includes("Read transcript")); assert.ok(body.includes("Download captions"));
    assert.ok(body.includes(`${canonical}#article-media-1-transcript`));
    assert.ok(body.includes("A blue test frame remains on screen"));
  }
  assert.match(item.content_html, /<audio controls preload="none"/u);
  assert.equal(item.attachments, undefined); assert.doesNotMatch(rss, /<enclosure\b/u); assert.doesNotMatch(atom, /rel="enclosure"/u);
  const home = readFileSync(join(outputDir, "index.html"), "utf8");
  const lead = home.match(/<div class="front-page__lead">([\s\S]*?)<aside/u)?.[1];
  assert.match(lead, /<img[^>]*fetchpriority="high"/u);
  assert.doesNotMatch(lead, /loading="lazy"/u);
}

test("the configured publication entrance seals real recordings and captions, with accessible article, schema and all feed projections", async () => {
  await withPublication(async publication => {
    const { root, property, outputDir, sourcePath } = publication;
    const config = join(root, "property.json"); writeFileSync(config, JSON.stringify(property));
    const originalSource = readFileSync(sourcePath);
    const cli = fileURLToPath(new URL("../scripts/build-property.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [cli, config, outputDir, "--as-of", instant], { encoding: "utf8",
      env: { ...process.env, NEWS_PROPERTY_STATE_ROOT: root, NEWS_PROPERTY_CONTENT_ROOT: property.content.root } });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).publishedPostCount, 1);
    assertReceived({ ...publication, originalSource });
  });
});

test("transcripts remain visible escaped text while unchanged reports without media still build", async () => {
  await withPublication(async ({ admit, build, outputDir }) => {
    const audio = selectedMedia()[0];
    audio.transcript = "<script>alert('test')</script> & quoted text\n\n[End of test recording.]";
    admit(sourceFor([audio])); await build();
    const html = readFileSync(join(outputDir, "posts/media-receiving/index.html"), "utf8");
    assert.match(html, /&lt;script&gt;alert\(&#39;test&#39;\)&lt;\/script&gt; &amp; quoted text/u);
    assert.doesNotMatch(html, /<script>alert/u);
    assert.match(html, /<p>\[End of test recording\.\]<\/p>/u);
    assert.equal(articleGraph(html).video, undefined);
  });
  await withPublication(async ({ admit, build, outputDir }) => {
    admit(sourceFor([]).replace(/^media: .*\n/mu, "")); await build();
    const html = readFileSync(join(outputDir, "posts/media-receiving/index.html"), "utf8");
    assert.doesNotMatch(html, /<audio\b|<video\b/u); assert.equal(articleGraph(html).audio, undefined);
    const manifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
    assert.equal(manifest.artifacts.some(item => item.file.startsWith("assets/recordings/")), false);
  });
});

test("selected bytes, caption syntax and media custody refuse before any output is published", async t => {
  const cases = [
    ["changed media bytes", ({ contentDir }) => writeFileSync(join(contentDir, "assets/recordings/tone.wav"), "changed"), /SHA-256/u],
    ["changed caption bytes", ({ contentDir }) => writeFileSync(join(contentDir, "assets/recordings/tone.vtt"), "changed"), /SHA-256/u],
    ["invalid UTF-8 captions", ({ contentDir, admit }) => {
      const bytes = Buffer.from([0xff, 0xfe]), media = selectedMedia(); media[1].caption.sha256 = sha256(bytes);
      writeFileSync(join(contentDir, "assets/recordings/tone.vtt"), bytes); admit(sourceFor(media));
    }, /UTF-8/u],
    ["missing transcript", ({ admit }) => { const media = selectedMedia(); delete media[0].transcript; admit(sourceFor(media)); }, /transcript/u],
    ["missing timed video captions", ({ admit }) => { const media = selectedMedia(); delete media[1].caption; admit(sourceFor(media)); }, /video requires/u],
    ["unsupported duration claim", ({ admit }) => { const media = selectedMedia(); media[0].duration = "PT1S"; admit(sourceFor(media)); }, /supported schema.org/u],
    ["mismatched MIME and extension", ({ admit }) => { const media = selectedMedia(); media[0].encodingFormat = "audio/mpeg"; admit(sourceFor(media)); }, /same-origin asset/u],
    ["contradictory container signature", ({ contentDir, admit }) => {
      const bytes = Buffer.from("This is text, not audio."), media = selectedMedia(); media[0].sha256 = sha256(bytes);
      writeFileSync(join(contentDir, "assets/recordings/tone.wav"), bytes); admit(sourceFor(media));
    }, /container signature/u],
    ["oversize local asset", ({ contentDir }) => truncateSync(join(contentDir, "assets/recordings/tone.wav"), MAX_PUBLICATION_MEDIA_BYTES + 1), /publication asset limit/u],
    ["remote recording URL", ({ admit }) => { const media = selectedMedia(); media[0].contentUrl = "https://elsewhere.example/assets/tone.wav"; admit(sourceFor(media)); }, /same-origin asset/u],
    ["private path", ({ contentDir, admit }) => {
      cpSync(join(contentDir, "assets/recordings/tone.wav"), join(contentDir, "private.wav"));
      const media = selectedMedia(); media[0].contentUrl = "/assets/../private.wav"; admit(sourceFor(media));
    }, /same-origin asset/u],
    ["escaping symlink", ({ root, contentDir }) => {
      const path = join(contentDir, "assets/recordings/tone.wav"), outside = join(root, "private.wav");
      cpSync(path, outside); rmSync(path); symlinkSync(outside, path);
    }, /same-origin asset/u],
    ["unadmitted transcript change", ({ sourcePath }) => writeFileSync(sourcePath, sourceFor().replace("440 Hz", "changed")), /Unreviewed content/u],
  ];
  for (const [name, change, error] of cases) await t.test(name, async () => {
    await withPublication(async publication => {
      change(publication); await assert.rejects(publication.build, error);
      assert.equal(existsSync(publication.outputDir), false, "refusal cannot leave a partly public build");
    });
  });
});

test("the plain-text WebVTT profile accepts overlap and rejects malformed cues without altering their bytes", () => {
  const valid = Buffer.from("\ufeffWEBVTT\r\n\r\nNOTE Test captions\r\n\r\nfirst\r\n00:00.000 --> 00:00.500\r\n[A tone sounds.]\r\n\r\nsecond\r\n00:00.200 --> 00:00.400\r\n[Two valid overlapping cues.]\r\n");
  const before = Buffer.from(valid); assert.equal(validatePublicationCaptions(valid), 2); assert.deepEqual(valid, before);
  for (const cue of [
    "00:00.500 --> 00:00.100\nReversed.",
    "00:00.000 --> 00:00.000\nZero length.",
    "00:60.000 --> 00:61.000\nInvalid timestamp.",
    "00:00.300 --> 00:00.500\nLater start.\n\n00:00.100 --> 00:00.200\nEarlier start.",
    "00:00.000 --> 00:00.500",
    "00:00.000 --> 00:00.500\n<script>Unsafe profile.</script>",
    "00:00.000 --> 00:00.500 position:50%\nUnsupported settings.",
    "same\n00:00.000 --> 00:00.200\nOne.\n\nsame\n00:00.200 --> 00:00.500\nTwo.",
    "NOTE Invalid --> comment\n\n00:00.000 --> 00:00.500\nCaption.",
  ]) assert.throws(() => validatePublicationCaptions(Buffer.from(`WEBVTT\n\n${cue}\n`)), /Publication caption/u);
});

test("media declarations bind the original manuscript digest and cannot add executable or unverified metadata", () => {
  const source = sourceFor(), post = parsePost(source, "media-receiving.md");
  assert.equal(post.sourceDigest, sha256(source));
  assert.deepEqual(post.media, selectedMedia());
  assert.equal(Object.isFrozen(post.media), true);
  for (const alter of [
    item => { item.transcript = "\ud800"; }, item => { item.name = "\u0000"; },
    item => { item.inLanguage = "en invalid"; }, item => { item.license = "javascript:alert(1)"; },
    item => { item.sha256 = "not a digest"; }, item => { item.encodingFormat = "application/octet-stream"; },
  ]) {
    const media = selectedMedia(); alter(media[0]); assert.throws(() => parsePublicationMedia(media, "media-receiving.md"));
  }
});
