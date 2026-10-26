/** Admitted time-based article media: source declarations and exact local bytes.
 * Encoding, transcript accuracy and editorial rights remain the producing
 * media/editorial owners' claims; this receiver does not transcode or infer them.
 */
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { readPublicationAsset } from "./publication-assets.mjs";

// The existing Cloudflare Pages receiver accepts at most 25 MiB per asset.
export const MAX_PUBLICATION_MEDIA_BYTES = 25 * 1024 * 1024;
const FORMATS = Object.freeze({
  "audio/mpeg": { type: "AudioObject", extensions: ["mp3"], signature: bytes =>
    bytes.length > 10 && (bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0)) },
  "audio/mp4": { type: "AudioObject", extensions: ["m4a"], signature: bytes => bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp" },
  "audio/ogg": { type: "AudioObject", extensions: ["ogg", "opus"], signature: bytes => bytes.length > 27 && bytes.toString("ascii", 0, 4) === "OggS" },
  "audio/wav": { type: "AudioObject", extensions: ["wav"], signature: bytes => bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE" },
  "video/mp4": { type: "VideoObject", extensions: ["mp4"], signature: bytes => bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp" },
  "video/webm": { type: "VideoObject", extensions: ["webm"], signature: bytes => bytes.length > 4 && bytes.readUInt32BE(0) === 0x1a45dfa3 },
});
const MEDIA_FIELDS = new Set(["@type", "name", "description", "contentUrl", "encodingFormat", "sha256", "transcript", "inLanguage", "creditText", "license", "caption"]);
const CAPTION_FIELDS = new Set(["@type", "name", "contentUrl", "encodingFormat", "sha256", "inLanguage"]);
const INVALID_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function text(value, field) {
  if (typeof value !== "string" || !value.trim() || !value.isWellFormed() || INVALID_TEXT.test(value))
    throw new TypeError(`${field} must be nonempty Unicode text without invalid control characters`);
  return value.trim();
}

function record(value, fields, field) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.has(key)))
    throw new TypeError(`${field} must use the supported schema.org media fields`);
}

function digest(value, field) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError(`${field} must bind the exact asset SHA-256`);
  return value;
}

function language(value, field) {
  const tag = text(value, field);
  try {
    const [canonical] = Intl.getCanonicalLocales(tag);
    if (!canonical) throw new Error("empty language");
    return canonical;
  } catch { throw new TypeError(`${field} must be a BCP 47 language tag`); }
}

function captionRecord(value, field) {
  record(value, CAPTION_FIELDS, field);
  if (value["@type"] !== "MediaObject" || value.encodingFormat !== "text/vtt")
    throw new TypeError(`${field} must be a text/vtt MediaObject`);
  return Object.freeze({ "@type": "MediaObject", name: text(value.name, `${field}.name`),
    contentUrl: text(value.contentUrl, `${field}.contentUrl`), encodingFormat: "text/vtt",
    sha256: digest(value.sha256, `${field}.sha256`), inLanguage: language(value.inLanguage, `${field}.inLanguage`) });
}

/** The manuscript is the sole selection source; no directory scan adds media. */
export function parsePublicationMedia(value, file) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError(`${file}: media must be a JSON array of schema.org media objects`);
  const seen = new Set();
  return Object.freeze(value.map((item, index) => {
    const field = `${file}: media[${index}]`;
    record(item, MEDIA_FIELDS, field);
    const format = Object.hasOwn(FORMATS, item.encodingFormat) ? FORMATS[item.encodingFormat] : undefined;
    if (!format || item["@type"] !== format.type) throw new TypeError(`${field} needs a supported matching media type and encodingFormat`);
    const contentUrl = text(item.contentUrl, `${field}.contentUrl`);
    if (seen.has(contentUrl)) throw new TypeError(`${field} repeats an already selected media URL`);
    seen.add(contentUrl);
    const license = text(item.license, `${field}.license`);
    let licenseUrl;
    try { licenseUrl = new URL(license); } catch { throw new TypeError(`${field}.license must be an absolute HTTPS URL`); }
    if (licenseUrl.protocol !== "https:" || licenseUrl.username || licenseUrl.password)
      throw new TypeError(`${field}.license must be an absolute HTTPS URL without credentials`);
    if (item["@type"] === "VideoObject" && item.caption === undefined)
      throw new TypeError(`${field}: video requires an admitted timed WebVTT caption asset`);
    return Object.freeze({ "@type": item["@type"], name: text(item.name, `${field}.name`), contentUrl,
      encodingFormat: item.encodingFormat, sha256: digest(item.sha256, `${field}.sha256`),
      transcript: text(item.transcript, `${field}.transcript`), inLanguage: language(item.inLanguage, `${field}.inLanguage`),
      creditText: text(item.creditText, `${field}.creditText`), license: licenseUrl.href,
      ...(item.description === undefined ? {} : { description: text(item.description, `${field}.description`) }),
      ...(item.caption === undefined ? {} : { caption: captionRecord(item.caption, `${field}.caption`) }) });
  }));
}

/** A deliberately narrow, plain-text caption profile of WebVTT.
 * No STYLE, REGION, cue settings or markup is silently reinterpreted.
 * Accuracy, completeness and synchronization require media-owner receiving.
 */
export function validatePublicationCaptions(bytes) {
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\r\n?/gu, "\n"); }
  catch { throw new TypeError("Publication captions must be valid UTF-8 WebVTT"); }
  const blocks = source.split(/\n{2,}/u);
  if (!/^WEBVTT(?:[ \t][^\n]*)?$/u.test(blocks[0]) || blocks[0].includes("-->") || INVALID_TEXT.test(source))
    throw new TypeError("Publication captions require a WebVTT header and timed plain-text cues");
  let count = 0, priorStart = -1;
  const identifiers = new Set();
  const timestamp = value => {
    const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/u.exec(value);
    if (!match) return NaN;
    return ((Number(match[1] ?? 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
  };
  for (const block of blocks.slice(1)) {
    if (!block.trim()) continue;
    if (/^NOTE(?:[ \t\n]|$)/u.test(block)) {
      if (block.includes("-->")) throw new TypeError("Publication caption comments cannot contain a cue arrow");
      continue;
    }
    const lines = block.replace(/\n$/u, "").split("\n");
    const timingIndex = lines[0].includes("-->") ? 0 : 1;
    const match = /^(\S+)[ \t]+-->[ \t]+(\S+)$/u.exec(lines[timingIndex] ?? "");
    const start = match ? timestamp(match[1]) : NaN, end = match ? timestamp(match[2]) : NaN;
    const payload = lines.slice(timingIndex + 1).join("\n");
    if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || start < priorStart ||
        !payload.trim() || /[<>]/u.test(payload) || /&(?!amp;|lt;|gt;|lrm;|rlm;|nbsp;)/u.test(payload) ||
        (timingIndex === 1 && (!lines[0].trim() || /[<>]/u.test(lines[0]) || identifiers.has(lines[0]))))
      throw new TypeError("Publication captions require ordered, nonempty timed plain-text WebVTT cues");
    if (timingIndex === 1) identifiers.add(lines[0]);
    count += 1; priorStart = start;
  }
  if (!count) throw new TypeError("Publication captions require at least one timed cue");
  return count;
}

/** Receive selected bytes once, then use those same bytes in every projection. */
export function receivePublicationMedia(media, { origin, contentRoot }) {
  const files = [];
  const receive = (selection, extensions) => {
    const asset = readPublicationAsset(selection.contentUrl, { origin, contentRoot, extensions,
      maxBytes: MAX_PUBLICATION_MEDIA_BYTES, label: "Publication media" });
    if (!asset.bytes.length || sha256Hex(asset.bytes) !== selection.sha256)
      throw new Error("Publication media bytes differ from the admitted SHA-256 or are empty");
    files.push(asset);
    return asset;
  };
  const received = media.map(item => {
    const format = FORMATS[item.encodingFormat], asset = receive(item, format.extensions);
    if (!format.signature(asset.bytes)) throw new TypeError("Publication media container signature does not match its declared encodingFormat");
    let caption;
    if (item.caption) {
      const captions = receive(item.caption, ["vtt"]);
      validatePublicationCaptions(captions.bytes);
      caption = { ...item.caption, contentUrl: captions.url, contentSize: `${captions.bytes.length} bytes` };
    }
    return Object.freeze({ ...item, contentUrl: asset.url, contentSize: `${asset.bytes.length} bytes`,
      ...(caption ? { caption: Object.freeze(caption) } : {}) });
  });
  return { media: Object.freeze(received), files };
}
