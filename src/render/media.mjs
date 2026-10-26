/** Accessible projections of already received media; no I/O or acquisition. */
import { escapeHtml } from "./markdown.mjs";

/** Native controls and visible alternatives also survive feed sanitizers. */
export function renderPublicationMedia(media = [], { articleUrl = "" } = {}) {
  return media.map((item, index) => {
    const id = `article-media-${index + 1}`, video = item["@type"] === "VideoObject", tag = video ? "video" : "audio";
    const source = `<source src="${escapeHtml(item.contentUrl)}" type="${escapeHtml(item.encodingFormat)}">`;
    const caption = item.caption ? `<track kind="captions" src="${escapeHtml(item.caption.contentUrl)}" srclang="${escapeHtml(item.caption.inLanguage)}" label="${escapeHtml(item.caption.name)}" default>` : "";
    const download = `<a href="${escapeHtml(item.contentUrl)}" download>Download ${video ? "video" : "audio"}</a>`;
    const paragraphs = item.transcript.split(/\n{2,}/u).map(paragraph => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
    return `<section class="article-media" aria-labelledby="${id}-title" lang="${escapeHtml(item.inLanguage)}">` +
      `<h2 id="${id}-title">${escapeHtml(item.name)}</h2>` +
      (item.description ? `<p>${escapeHtml(item.description)}</p>` : "") +
      `<${tag} controls preload="none"${video ? " playsinline" : ""} aria-labelledby="${id}-title" aria-describedby="${id}-alternatives">${source}${caption}${download}</${tag}>` +
      `<p class="article-media-links" id="${id}-alternatives"><a href="${escapeHtml(articleUrl)}#${id}-transcript">Read transcript</a> · ${download}${item.caption ? ` · <a href="${escapeHtml(item.caption.contentUrl)}" download>Download captions (${escapeHtml(item.caption.name)})</a>` : ""}</p>` +
      `<p class="article-media-credit">${escapeHtml(item.creditText)} · <a href="${escapeHtml(item.license)}">Media license</a></p>` +
      `<div class="article-media-transcript" id="${id}-transcript"><h3>Transcript</h3>${paragraphs}</div></section>`;
  }).join("");
}

/** Project only facts held by the accepted source and the byte receiver.
 * Codec, duration, dimensions and upload dates are not inferred from filenames.
 */
export function publicationMediaJsonLd(media = [], articleUrl) {
  const nodes = media.map((item, index) => ({ ...item,
    "@id": `${articleUrl}#article-media-${index + 1}`,
    associatedArticle: { "@type": "NewsArticle", "@id": articleUrl },
  }));
  const audio = nodes.filter(item => item["@type"] === "AudioObject");
  const video = nodes.filter(item => item["@type"] === "VideoObject");
  return { ...(audio.length ? { audio } : {}), ...(video.length ? { video } : {}) };
}
