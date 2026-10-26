/**
 * Document `<head>` construction: title/description/canonical, complete
 * NewsArticle and NewsMediaOrganization JSON-LD, Open Graph and Twitter Card
 * metadata, robots and favicon/manifest links, `fediverse:creator` and
 * `rel=me`, and RSS/Atom/JSON Feed alternates. Every function here returns a
 * string or plain object; assembly into a full document happens in
 * `templates.mjs`.
 */
import { escapeHtml } from "./markdown.mjs";
import { socialMetaTags as pageSocialMetaTags, webAppManifest } from "@red-cup-engineering/html-engineering-services-section/page-metadata";
import { creativeWork, organization, renderJsonLdScript } from "@red-cup-engineering/computer-triplet-serialized-content-engineering-services-section/schema-org";

/**
 * @param {string} origin absolute origin, e.g. "https://koios.news"
 * @param {string} path site-relative path beginning with "/"
 * @returns {string}
 */
export function absoluteUrl(origin, path) {
  return new URL(path, origin).toString();
}

/**
 * @typedef {object} HeadContext
 * @property {string} title the document `<title>`
 * @property {string} [socialTitle] the Open Graph and Twitter title; defaults to `title`
 * @property {string} description
 * @property {string} canonical absolute canonical URL
 * @property {string} [ogType] "website" or "article"; defaults to "website"
 * @property {string} [ogImage] absolute image URL
 * @property {string} [ogImageAlt] description of the selected image
 * @property {number} [ogImageWidth]
 * @property {number} [ogImageHeight]
 * @property {string} [locale]
 * @property {string} siteName
 * @property {string} [articlePublishedTime]
 * @property {string} [articleModifiedTime]
 * @property {string} [articleSection]
 * @property {string[]} [articleTags]
 * @property {object} [jsonLd] a single JSON-LD object or an array of them
 * @property {string} [fediverseCreator]
 * @property {string} [actorUrl] the property's ActivityPub actor, linked rel=me
 */

/**
 * Render the Open Graph and Twitter Card meta tags for a page.
 * @param {HeadContext} ctx
 * @returns {string}
 */
export function socialMetaTags(ctx) {
  return pageSocialMetaTags({
    type: ctx.ogType ?? "website", siteName: ctx.siteName, title: ctx.socialTitle ?? ctx.title, description: ctx.description, url: ctx.canonical, locale: ctx.locale,
    ...(ctx.ogImage ? { images: [{ url: ctx.ogImage, ...(ctx.ogImageAlt ? { alt: ctx.ogImageAlt } : {}),
      ...(ctx.ogImageWidth ? { width: ctx.ogImageWidth } : {}), ...(ctx.ogImageHeight ? { height: ctx.ogImageHeight } : {}) }] } : {}),
    publishedTime: ctx.articlePublishedTime, modifiedTime: ctx.articleModifiedTime, section: ctx.articleSection, tags: ctx.articleTags,
  });
}

/** An ImageObject node; width and height only when they are known facts. */
function imageObject(image) {
  return { "@type": "ImageObject", url: image.url, ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}), ...(image.creditText ? { creditText: image.creditText } : {}) };
}

/**
 * Build a complete `NewsArticle` JSON-LD object.
 * @param {object} input
 * @param {string} input.headline
 * @param {string} input.url
 * @param {string} [input.image] absolute image URL
 * @param {{url:string,width?:number,height?:number,creditText?:string}[]} [input.images] Selected article images; wins over `image`
 * @param {string} input.datePublished ISO 8601 instant with zone
 * @param {string} input.dateModified ISO 8601 instant with zone
 * @param {{name:string,url?:string,type?:string,jobTitle?:string,description?:string,sameAs?:string[]}} input.author
 * @param {{name:string,url:string,logo:string|{url:string,width?:number,height?:number}}} input.publisher
 * @param {string} [input.description]
 * @param {string} [input.articleSection]
 * @param {string} [input.inLanguage]
 * @param {string[]} [input.keywords]
 * @param {{url:string}[]} [input.citations]
 * @param {string} [input.licenseUrl] HTTPS rights declaration from accepted manuscript
 * @param {string} [input.speakableSelector] CSS selector of the text a voice assistant may read aloud
 * @returns {object}
 */
export function newsArticleJsonLd(input) {
  const citations = [...new Set((input.citations ?? []).map((citation) => citation.url).filter(Boolean))];
  const logo = typeof input.publisher.logo === "string" ? { url: input.publisher.logo } : input.publisher.logo;
  const author = input.author;
  return {
    ...creativeWork({
      type: "NewsArticle", url: input.url, headline: input.headline, image: input.image, datePublished: input.datePublished, dateModified: input.dateModified,
      author: input.author, publisher: input.publisher, description: input.description, articleSection: input.articleSection, keywords: input.keywords,
    }),
    ...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
    ...(input.articleSection ? { articleSection: input.articleSection } : {}),
    // The same entities as the page's visible byline, with the properties a
    // knowledge graph needs to resolve them: a profile URL, a role, and sameAs.
    author: {
      "@type": author.type === "Organization" ? "Organization" : "Person", name: author.name,
      ...(author.url ? { url: author.url } : {}),
      ...(author.jobTitle ? { jobTitle: author.jobTitle } : {}),
      ...(author.description ? { description: author.description } : {}),
      ...(author.sameAs?.length ? { sameAs: author.sameAs } : {}),
    },
    publisher: { "@type": "Organization", ...(input.publisher.id ? { "@id": input.publisher.id } : {}), name: input.publisher.name, url: input.publisher.url, ...(logo ? { logo: imageObject(logo) } : {}) },
    ...(input.images?.length ? { image: input.images.map(imageObject) } : {}),
    // Identifiers and rights are projections of already-admitted editorial data,
    // not newly inferred licenses or subscription requirements.
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    isAccessibleForFree: true,
    ...(input.speakableSelector ? { speakable: { "@type": "SpeakableSpecification", cssSelector: [input.speakableSelector] } } : {}),
    ...(input.licenseUrl ? { license: input.licenseUrl } : {}),
    ...(citations.length ? { citation: citations } : {}),
  };
}

/**
 * A schema.org BreadcrumbList for a page's trail, in order, from the site root.
 * @param {{name:string,url:string}[]} trail
 * @returns {object}
 */
export function breadcrumbListJsonLd(trail) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.url })),
  };
}

/**
 * The home page's WebSite node, with a SearchAction aimed at the property's
 * own client-side search page (`/search/?q=...`).
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.url site root, with trailing slash
 * @param {string} input.searchUrlTemplate absolute URL containing `{search_term_string}`
 * @param {string} [input.inLanguage]
 * @param {string} [input.description]
 * @returns {object}
 */
export function webSiteJsonLd(input) {
  return {
    "@context": "https://schema.org", "@type": "WebSite", "@id": `${input.url}#website`, name: input.name, url: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
    ...(input.publisherId ? { publisher: { "@id": input.publisherId } } : {}),
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: input.searchUrlTemplate }, "query-input": "required name=search_term_string" },
  };
}

/**
 * An author's ProfilePage, with the author as its main entity.
 * @param {object} input
 * @param {string} input.url canonical profile URL
 * @param {string} [input.dateModified] newest revision among the author's articles
 * @param {{name:string,type?:string,jobTitle?:string,description?:string,sameAs?:string[],knowsAbout?:string[]}} input.entity
 * @param {{name:string,url:string}} input.worksFor
 * @returns {object}
 */
export function profilePageJsonLd(input) {
  const entity = input.entity;
  return {
    "@context": "https://schema.org", "@type": "ProfilePage", "@id": `${input.url}#profile`, url: input.url,
    name: entity.name, ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    mainEntity: {
      "@type": entity.type === "Organization" ? "Organization" : "Person", "@id": `${input.url}#author`, name: entity.name, url: input.url,
      ...(entity.jobTitle ? { jobTitle: entity.jobTitle } : {}),
      ...(entity.description ? { description: entity.description } : {}),
      ...(entity.sameAs?.length ? { sameAs: entity.sameAs } : {}),
      ...(entity.knowsAbout?.length ? { knowsAbout: entity.knowsAbout } : {}),
      worksFor: { "@type": "NewsMediaOrganization", name: input.worksFor.name, url: input.worksFor.url },
    },
  };
}

/**
 * Build the home page's `NewsMediaOrganization` JSON-LD object.
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.url
 * @param {string} input.logo absolute logo URL
 * @returns {object}
 */
export function newsMediaOrganizationJsonLd(input) {
  return organization(input, { type: "NewsMediaOrganization", context: true });
}

/**
 * Render a JSON-LD object or array of objects as a `<script>` tag.
 * @param {object|object[]} jsonLd
 * @returns {string}
 */
export function jsonLdScript(jsonLd) {
  return renderJsonLdScript(jsonLd, 0);
}

/**
 * Render the feed alternate `<link>` tags shared by every page.
 * @param {string} siteName
 * @returns {string}
 */
export function feedAlternateTags(siteName) {
  const name = escapeHtml(siteName);
  return [
    `<link rel="alternate" type="application/rss+xml" title="${name} RSS" href="/feed.xml">`,
    `<link rel="alternate" type="application/atom+xml" title="${name} Atom" href="/feed.atom">`,
    `<link rel="alternate" type="application/feed+json" title="${name} JSON Feed" href="/feed.json">`,
  ].join("\n");
}

/**
 * Render the favicon-set and web-manifest `<link>` tags. `favicon.ico` and
 * `apple-touch-icon.png` are raster images (image generation lives outside
 * this renderer, per the specification's images section) and are linked
 * unconditionally; the SVG favicon and the manifest are generated by this
 * module and always exist in a build's output.
 * @returns {string}
 */
export function faviconLinkTags() {
  return [
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/manifest.webmanifest">`,
  ].join("\n");
}

/**
 * Generate a deterministic SVG favicon: the property's accent color behind
 * the first letter of its name.
 * @param {string} siteName
 * @param {string} accent a CSS color
 * @param {string} ink a CSS color, used for the glyph
 * @returns {string}
 */
export function faviconSvg(siteName, accent, ink) {
  const initial = escapeHtml((siteName.trim()[0] ?? "N").toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escapeHtml(siteName)}">` +
    `<rect width="64" height="64" fill="${escapeHtml(accent)}"/>` +
    `<text x="32" y="45" font-family="Georgia, serif" font-size="40" font-weight="700" text-anchor="middle" fill="${escapeHtml(ink)}">${initial}</text>` +
    `</svg>\n`;
}

/**
 * Build the property's web app manifest.
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.accent
 * @param {string} input.surface
 * @returns {object}
 */
export function webManifest(input) {
  return webAppManifest({ name: input.name, shortName: input.name, backgroundColor: input.surface, themeColor: input.accent,
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }, { src: "/logo.png", sizes: "512x512", type: "image/png" }] });
}

/**
 * Render the small set of head tags every page shares: charset/viewport are
 * supplied by the caller's document skeleton, so this covers title,
 * description, canonical, robots, favicon set, feed alternates, social
 * metadata, and optional `fediverse:creator` / `rel=me`.
 * @param {HeadContext} ctx
 * @returns {string}
 */
export function renderHeadTags(ctx) {
  const parts = [
    `<title>${escapeHtml(ctx.title)}</title>`,
    ctx.description ? `<meta name="description" content="${escapeHtml(ctx.description)}">` : "",
    `<link rel="canonical" href="${escapeHtml(ctx.canonical)}">`,
    `<meta name="robots" content="${ctx.noindex ? "noindex, follow" : "max-snippet:-1, max-image-preview:large, max-video-preview:-1"}">`,
    faviconLinkTags(),
    feedAlternateTags(ctx.siteName),
    socialMetaTags(ctx),
    ctx.fediverseCreator ? `<meta name="fediverse:creator" content="${escapeHtml(ctx.fediverseCreator)}">` : "",
    ctx.actorUrl ? `<link rel="me" href="${escapeHtml(ctx.actorUrl)}">` : "",
    ...(ctx.citation ? Object.entries({citation_title:ctx.citation.title,
      citation_author:ctx.citation.author, citation_publication_date:ctx.citation.published?.slice(0,10).replaceAll('-','/'),
      citation_public_url:ctx.citation.url, citation_language:ctx.citation.language,
      citation_publisher:ctx.citation.publication}).filter(([,value])=>value).map(([name,value])=>
        `<meta name="${name}" content="${escapeHtml(value)}">`) : []),
    ctx.citation ? `<link rel="alternate" type="application/vnd.citationstyles.csl+json" title="Citation" href="${escapeHtml(ctx.citation.recordUrl)}">` : "",
    ctx.jsonLd ? jsonLdScript(ctx.jsonLd) : "",
  ];
  return parts.filter(Boolean).join("\n");
}
