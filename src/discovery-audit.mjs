/**
 * Publisher search, news, and agent-discovery conformance assessment.
 * This is a read-only hireable service. It never purchases content,
 * impersonates a verified crawler, or claims search placement from HTML.
 *
 * Inputs: HTTPS origin, injectable HTTP fetch, optional article URL and clock.
 * Output: web-discovery.assessment/v1 with measurements, evidence, and
 * explicit unknown or unverified states. No secret or durable scratch files.
 */
const standards = Object.freeze({
  search: "https://developers.google.com/search/docs/appearance/ai-features",
  article: "https://developers.google.com/search/docs/appearance/structured-data/article",
  headings: "https://www.w3.org/WAI/tutorials/page-structure/headings/",
  sitemap: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
  news: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap",
  crawl: "https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/",
  citation: "https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/",
});


const MAX_DISCOVERY_RESPONSE_BYTES = 2_000_000;

/** Decode a bounded response from a real streaming Fetch body.
 * Reject oversized bodies rather than parse truncated content as a valid
 * sitemap, canonical, or publisher article. Unit-test transports may expose
 * only Response.text(); production Fetch provides body.getReader().
 */
async function boundedDiscoveryText(response) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAX_DISCOVERY_RESPONSE_BYTES)
    throw new RangeError("discovery response exceeds bounded body size");
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let total = 0, text = "";
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array))
          throw new TypeError("HTTP response body must contain byte chunks");
        total += value.byteLength;
        if (total > MAX_DISCOVERY_RESPONSE_BYTES)
          throw new RangeError("discovery response exceeds bounded body size");
        text += decoder.decode(value, {stream:true});
      }
      return text + decoder.decode();
    } catch (error) {
      await reader.cancel?.().catch?.(() => {});
      throw error;
    } finally {
      reader.releaseLock?.();
    }
  }
  // Compatibility with deliberately injected test/transport fixtures. An
  // external customer ingress must supply a real network-controlled Fetch.
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_DISCOVERY_RESPONSE_BYTES)
    throw new RangeError("discovery response exceeds bounded body size");
  return text;
}

function bareOrigin(input) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new TypeError("origin must be a bare HTTPS origin");
  // A customer-controlled URL must never directly address an internal
  // machine or arbitrary port. Network-layer DNS and resolved-address
  // verification remains the responsibility of the injected HTTP transport:
  // hostname syntax alone cannot defend against DNS rebinding.
  const host = url.hostname.toLowerCase();
  if (url.port || host.startsWith("[") || /^[0-9.]+$/u.test(host) ||
      /(?:^|\.)(?:localhost|local|internal)$/u.test(host) || host.endsWith(".home.arpa"))
    throw new TypeError("origin must be a public HTTPS hostname on its standard port");
  return url.origin;
}

function attribute(tag, name) {
  const expression = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "iu");
  const match = expression.exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

function elements(html, tag) {
  return [...html.matchAll(new RegExp("<" + tag + "\\b[^>]*>", "giu"))].map((match) => match[0]);
}

function canonicalLink(html) {
  return elements(html, "link").filter((tag) => (attribute(tag, "rel") ?? "").split(/\s+/u).includes("canonical"))
    .map((tag) => attribute(tag, "href")).find(Boolean) ?? null;
}

function meta(html, name) {
  return elements(html, "meta").filter((tag) =>
    [attribute(tag, "name"), attribute(tag, "property")].some((value) => value?.toLowerCase() === name))
    .map((tag) => attribute(tag, "content")).find((value) => value !== null) ?? null;
}

function jsonLd(html) {
  const objects = [];
  let errors = 0;
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)) {
    if ((attribute(script[1], "type") ?? "").toLowerCase() !== "application/ld+json") continue;
    try {
      const decoded = JSON.parse(script[2]);
      for (const item of Array.isArray(decoded) ? decoded : [decoded]) {
        if (!item || typeof item !== "object") continue;
        objects.push(item);
        if (Array.isArray(item["@graph"])) objects.push(...item["@graph"]);
      }
    } catch { errors++; }
  }
  return { objects, errors };
}

function isType(record, name) {
  return (Array.isArray(record?.["@type"]) ? record["@type"] : [record?.["@type"]]).includes(name);
}

function locations(xml) {
  return [...xml.matchAll(/<(?:\w+:)?loc\b[^>]*>([^<]+)<\/(?:\w+:)?loc\s*>/giu)]
    .map((match) => match[1].replaceAll("&amp;", "&").trim());
}

function equalUrl(actual, expected) {
  try { return new URL(actual).href === new URL(expected).href; } catch { return false; }
}

/** An entity fragment on the canonical homepage; an off-site @id is not
 * evidence that this publisher owns the claimed URL. */
function homeEntityId(value, origin) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.origin === origin && parsed.pathname === "/" &&
      parsed.search === "" && parsed.hash.length > 1;
  } catch { return false; }
}

/** Independently inspect the actual homepage HTML rather than deriving
 * schema identity from our source or assuming a source merge deployed.
 * An Organization node alone does not prove a Website-to-publisher link.
 */
export function inspectPublisherGraph(html, origin) {
  const ld = jsonLd(html);
  const publisher = ld.objects.find(record =>
    (isType(record, "NewsMediaOrganization") || isType(record, "Organization")) &&
      equalUrl(record?.url, origin + "/")) ?? null;
  const website = ld.objects.find(record =>
    isType(record, "WebSite") && equalUrl(record?.url, origin + "/")) ?? null;
  const publisherId = publisher?.["@id"] ?? null;
  const websiteId = website?.["@id"] ?? null;
  const websitePublisherId = website?.publisher?.["@id"] ?? null;
  const publisherName = publisher?.name ?? null;
  return {
    publisherId, publisherName, websiteId, websitePublisherId,
    parsingErrors: ld.errors,
    linked: ld.errors === 0 && typeof publisherName === "string" &&
      publisherName.trim().length > 0 &&
      homeEntityId(publisherId, origin) && homeEntityId(websiteId, origin) &&
      publisherId !== websiteId && websitePublisherId === publisherId,
  };
}

/** Public news sitemap observation. These are *advertised URLs*, not a proof
 * of editorial approval, delivery, indexing, or a fulfilled commercial quota.
 * Duplicate locations never multiply output; invalid dates/addresses result
 * in unknown evidence instead of being counted as zero.
 */
export function observeNewsSitemapCadence(xml,{origin,observedAt,dailyArticleTarget}={}){
 if(!Number.isSafeInteger(dailyArticleTarget)||dailyArticleTarget<1)
  throw new TypeError("daily article target must be a positive integer");
 if(!(observedAt instanceof Date)||!Number.isFinite(observedAt.getTime()))
  throw new TypeError("observedAt must be a valid Date");
 if(typeof xml!=="string"||!/<(?:\w+:)?urlset\b/iu.test(xml))
  return {status:"unknown",reason:"news-sitemap-shape-unverified",dailyArticleTarget,advertisedNewArticleUrlsLast24h:null};
 const now=observedAt.getTime(),since=now-86400000;
 const seen=new Set(),invalid=[],outsideWindow=[];
 const urls=[...xml.matchAll(/<(?:\w+:)?url\b[^>]*>([\s\S]*?)<\/(?:\w+:)?url\s*>/giu)];
 for(const [,entry] of urls){
  const loc=/<(?:\w+:)?loc\b[^>]*>([^<]+)<\/(?:\w+:)?loc\s*>/iu.exec(entry)?.[1];
  const dates=[...entry.matchAll(/<(?:\w+:)?publication_date\b[^>]*>([^<]+)<\/(?:\w+:)?publication_date\s*>/giu)];
  let address,instant;
  try{address=new URL(loc?.replaceAll("&amp;","&"));}catch{}
  if(!address||address.origin!==origin||dates.length!==1||
    !Number.isFinite(instant=Date.parse(dates[0][1].trim()))||instant>now){
   invalid.push(loc??"missing-loc");continue;
  }
  if(instant<now-172800000)outsideWindow.push(address.href);
  if(instant>=since)seen.add(address.href);
 }
 // A syntactically incomplete sitemap must not become a false zero count.
 if(invalid.length>0||urls.length!==locations(xml).length)return{
  status:"unknown",reason:"news-sitemap-entry-invalid",
  dailyArticleTarget,advertisedNewArticleUrlsLast24h:null,
  invalidEntries:invalid.length,parsedEntries:urls.length
 };
 const count=seen.size;
 return{status:count>=dailyArticleTarget?"pass":"fail",
   dailyArticleTarget,advertisedNewArticleUrlsLast24h:count,
   deficit:Math.max(0,dailyArticleTarget-count),
   outsideGoogleNewsWindow:outsideWindow.length,
   evidenceKind:"declared-news-sitemap-urls-not-verified-releases"
 };
}

export function inspectArticle(html) {
  const ld = jsonLd(html);
  const article = ld.objects.find((record) => isType(record, "NewsArticle") || isType(record, "Article"));
  const author = Array.isArray(article?.author) ? article.author[0] : article?.author;
  return {
    canonical: canonicalLink(html),
    robots: meta(html, "robots"),
    openGraphUrl: meta(html, "og:url"),
    structuredDataErrors: ld.errors,
    article: article ? {
      type: article["@type"], headline: article.headline ?? null, url: article.url ?? null,
      published: article.datePublished ?? null, modified: article.dateModified ?? null,
      author: author?.name ?? null, authorUrl: author?.url ?? null,
      publisher: article.publisher?.name ?? null,
      publisherId: article.publisher?.["@id"] ?? null,
      publisherUrl: article.publisher?.url ?? null,
      citations: Array.isArray(article.citation) ? article.citation.length : article.citation ? 1 : 0,
      license: article.license ?? null, free: article.isAccessibleForFree ?? null,
    } : null,
  };
}

export async function auditDiscovery({ origin, fetchImpl = fetch, observedAt = new Date(), articleUrl, profile = "news", dailyArticleTarget } = {}) {
  if(dailyArticleTarget!==undefined&&(!Number.isSafeInteger(dailyArticleTarget)||dailyArticleTarget<1||profile!=="news"))
    throw new TypeError("dailyArticleTarget is a positive integer for the news profile only");
  if (!["news", "website"].includes(profile)) throw new TypeError("discovery profile must be news or website");
  const newsProfile = profile === "news";
  const site = bareOrigin(origin);
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) throw new TypeError("invalid observedAt");
  const results = {};
  const findings = [];
  const record = (id, state, description, spec, evidence = null, critical = false) => {
    findings.push({ id, state, description, specification: standards[spec], evidence, critical });
  };
  const probe = async (key, path) => {
    const url = new URL(path, site);
    if (url.origin !== site) throw new TypeError("refusing cross-origin audit target");
    try {
      const response = await fetchImpl(url.href, {
        method: "GET", redirect: "manual",
        headers: { accept: "text/html, application/xml, text/plain;q=0.8" },
        signal: AbortSignal.timeout(12000),
      });
      results[key] = { url: url.href, status: response.status,
        mediaType: response.headers?.get?.("content-type") ?? null,
        body: response.status === 200 ? await boundedDiscoveryText(response) : "" };
    } catch (error) {
      results[key] = { url: url.href, status: null, mediaType: null, body: "",
        error: String(error?.message ?? error) };
    }
  };
  const paths = {
    home: "/", robots: "/robots.txt", sitemap: "/sitemap.xml",
    ...(newsProfile ? {
      newsSitemap: "/news-sitemap.xml", feed: "/feed.xml", masthead: "/masthead/",
      standards: "/standards/", corrections: "/corrections/",
    } : {}),
  };
  await Promise.all(Object.entries(paths).map(([key, path]) => probe(key, path)));
  const httpCheck = (key, spec, critical = false) => {
    const observation = results[key];
    record(key + "-http", observation.status === 200 ? "pass" : observation.status === null ? "unknown" : "fail",
      key + " is publicly available with HTTP 200", spec,
      { url: observation.url, status: observation.status, error: observation.error ?? null }, critical);
  };
  httpCheck("home", "search", true);
  // Google does not require a robots file, a sitemap, or a news-property route
  // for a general website. Their absence is not a general search violation.
  httpCheck("robots", "search", newsProfile);
  httpCheck("sitemap", "sitemap", newsProfile);
  if (newsProfile) {
    httpCheck("newsSitemap", "news");
    httpCheck("feed", "search");
    httpCheck("masthead", "article");
    httpCheck("standards", "article");
    httpCheck("corrections", "article");
  }
  const stateIf = (key, assertion) => results[key].status !== 200 ? "unknown" : assertion ? "pass" : "fail";
  record("home-canonical", stateIf("home", equalUrl(canonicalLink(results.home.body), site + "/")),
    "Home declares the canonical HTTPS origin", "search", { found: canonicalLink(results.home.body) }, true);
  record("home-indexable", stateIf("home", !/\bnoindex\b/iu.test(meta(results.home.body, "robots") ?? "")),
    "Home does not declare noindex", "search", { found: meta(results.home.body, "robots") }, true);
  // This is a source-HTML structure observation, not a ranking or complete
  // accessibility verdict. Ignore inert text that happens to contain tags.
  const headingMarkup = results.home.body
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "");
  const primaryHeadings = [...headingMarkup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/giu)]
    .map((match) => match[1].replace(/<[^>]*>/gu, "").trim()).filter(Boolean);
  record("home-primary-heading", stateIf("home", primaryHeadings.length > 0),
    "Home declares a nonempty primary heading for its content; source markup alone does not prove accessibility or search placement",
    "headings", { count: primaryHeadings.length });
  const homeLd = jsonLd(results.home.body);
  const hasOrganization = homeLd.objects.some((item) =>
    isType(item, "NewsMediaOrganization") || isType(item, "Organization"));
  record("publisher-identity", newsProfile ? stateIf("home", hasOrganization)
    : results.home.status !== 200 ? "unknown" : hasOrganization ? "pass" : "unverified",
    newsProfile ? "Publisher has structured identity" : "Organization identity is declared when applicable, not a universal indexing requirement",
    "article", { parsingErrors: homeLd.errors });
  const publisherGraph = newsProfile ? inspectPublisherGraph(results.home.body, site) : null;
  if (newsProfile) {
    record("publisher-graph-linkage", stateIf("home", publisherGraph.linked),
      "Public homepage WebSite identifies the same canonical NewsMediaOrganization through a stable @id",
      "article", publisherGraph);
    if (results.home.status === 200) results.home.inspection = { publisherGraph };
  }
  record("robots-sitemap", stateIf("robots", results.robots.body.includes(site + "/sitemap.xml")),
    "Robots announces canonical sitemap", "sitemap");
  const blanketBlock = /^user-agent:\s*\*\s*$(?:(?!user-agent:)[\s\S])*?^disallow:\s*\/\s*$/imu.test(results.robots.body);
  record("robots-default-block", stateIf("robots", !blanketBlock),
    "No apparent default-group full-site robots block (individual rules require further inspection)",
    "search", { blanketBlock }, results.robots.status === 200);
  const allLocations = locations(results.sitemap.body);
  const internal = allLocations.filter((location) => {
    try { return new URL(location).origin === site; } catch { return false; }
  });
  record("sitemap-addresses", stateIf("sitemap", allLocations.length > 0 && internal.length === allLocations.length),
    "Sitemap has same-origin resolvable locations", "sitemap", { total: allLocations.length, internal: internal.length },
    newsProfile && results.sitemap.status === 200);
  let publicationCadence={status:"not-assessed",reason:"daily-article-target-not-configured"};
  if(newsProfile&&dailyArticleTarget!==undefined){
    publicationCadence=results.newsSitemap.status!==200
      ? {status:"unknown",reason:"news-sitemap-unavailable",dailyArticleTarget,advertisedNewArticleUrlsLast24h:null}
      : observeNewsSitemapCadence(results.newsSitemap.body,{origin:site,observedAt,dailyArticleTarget});
    record("newsroom-publishing-cadence",publicationCadence.status,
      "Advertised NEW news article URLs over 24h meet the publisher's own declared daily target; an independent published ledger and public receiving remain required",
      "news",publicationCadence);
  }
  if (newsProfile) {
    record("news-sitemap-shape", stateIf("newsSitemap", /<(?:\w+:)?urlset\b/iu.test(results.newsSitemap.body)),
      "News sitemap has a URL-set root; an empty 48-hour news window is allowed", "news",
      { entries: locations(results.newsSitemap.body).length });
    record("feed-shape", stateIf("feed", /<(rss|feed)\b/iu.test(results.feed.body)),
      "Syndication feed has a recognizable XML root", "search");
  }

  let sample = articleUrl;
  if (!sample) sample = allLocations.find((value) => {
    try {
      const url = new URL(value);
      return url.origin === site && (newsProfile ? /^\/posts\/[a-z0-9-]+\/$/u.test(url.pathname) : url.pathname !== "/");
    } catch { return false; }
  });
  if (sample) {
    const target = new URL(sample, site);
    if (target.origin !== site || (newsProfile && !/^\/posts\/[a-z0-9-]+\/$/u.test(target.pathname)))
      throw new TypeError(newsProfile ? "articleUrl must be a same-origin /posts/<slug>/ URL"
        : "articleUrl must be a same-origin page URL");
    sample = target.href;
    const sampleKey = newsProfile ? "article" : "page";
    await probe(sampleKey, sample);
    httpCheck(sampleKey, newsProfile ? "article" : "search", true);
    const inspected = inspectArticle(results[sampleKey].body);
    const article = inspected.article;
    record(sampleKey + "-canonical", stateIf(sampleKey, equalUrl(inspected.canonical, sample)),
      "Sample URL canonically identifies itself", "search", { canonical: inspected.canonical, expected: sample }, true);
    record(sampleKey + "-indexable", stateIf(sampleKey, !/\bnoindex\b/iu.test(inspected.robots ?? "")),
      "Sample URL does not declare noindex", "search", { robots: inspected.robots }, true);
    if (newsProfile) {
      record("newsarticle-jsonld", stateIf("article", article !== null && inspected.structuredDataErrors === 0),
        "Article includes parseable NewsArticle/Article JSON-LD", "article", { errors: inspected.structuredDataErrors }, true);
      record("article-authorship", stateIf("article", Boolean(article?.author && article?.authorUrl && article?.publisher)),
        "Structured article names an author, author URL and publisher", "article");
      record("article-publisher-linkage",
        results.home.status !== 200 || results.article.status !== 200 ? "unknown" :
          publisherGraph.linked && article?.publisherId === publisherGraph.publisherId &&
          article?.publisher === publisherGraph.publisherName &&
          equalUrl(article?.publisherUrl, site + "/") ? "pass" : "fail",
        "Public NewsArticle points to the same source-backed publisher @id as the live homepage",
        "article", { expectedPublisherId: publisherGraph.publisherId,
          observedPublisherId: article?.publisherId ?? null,
          publisherName: article?.publisher ?? null, publisherUrl: article?.publisherUrl ?? null });
      record("article-dates", stateIf("article", Boolean(article?.published && article?.modified &&
        Number.isFinite(Date.parse(article.published)) && Number.isFinite(Date.parse(article.modified)))),
        "Structured article dates are parseable", "article");
      record("article-sources", stateIf("article", (article?.citations ?? 0) > 0),
        "Sample article has explicit externally inspectable citations", "article", { citations: article?.citations ?? 0 });
      record("article-license", results.article.status !== 200 ? "unknown" : article?.license ? "pass" : "unverified",
        "Article license is machine-readable if declared and checked against editorial rights", "article",
        { declared: article?.license ?? null });
    }
    results[sampleKey].inspection = inspected;
  } else if (newsProfile) {
    record("article-sample", results.sitemap.status === 200 ? "fail" : "unknown",
      "A /posts/<slug>/ page can be selected from the sitemap", "sitemap");
  }

  record("cloudflare-pay-per-crawl", "unverified",
    "Requires Cloudflare closed-beta admission, zone controls, charging policy, Web Bot Auth and payout verification",
    "crawl", { protocol: "Cloudflare-specific crawler-price HTTP 402; not interchangeable with x402" });
  record("ai-answer-citations", "unverified",
    "Bing AI Performance and relevant search-console evidence are required to establish actual model citations",
    "citation");
  const criticalFailures = findings.filter((item) => item.critical && item.state === "fail").map((item) => item.id);
  const criticalUnknowns = findings.filter((item) => item.critical && item.state === "unknown").map((item) => item.id);
  const observations = Object.fromEntries(Object.entries(results).map(([key, value]) => [key, {
    url: value.url, status: value.status, mediaType: value.mediaType,
    ...(value.error ? { error: value.error } : {}),
    ...(value.inspection ? { inspection: value.inspection } : {}),
  }]));
  return Object.freeze({
    kind: "web-discovery.assessment/v1", origin: site, profile, observedAt: observedAt.toISOString(),
    standards, observations, findings,
    decision: { technicalDiscoverySampleReady: criticalFailures.length === 0 && criticalUnknowns.length === 0,
      payPerCrawlEligible: "unverified", searchPlacementProven: false, agentCitationProven: false,
      publicationCadence, criticalFailures, criticalUnknowns },
    limitations: [
      "An HTML audit cannot prove indexing, ranking, Google News inclusion, Bing citations or crawler payment.",
      "An ordinary HTTP user agent cannot establish authenticated bot or WAF behavior.",
      "This is a sampled external audit, not a full-site, account-level or contract-rights assessment.",
      "The news profile applies additional publisher-specific route and attribution obligations; website mode never treats a missing news sitemap, feed, or masthead as an indexing failure.",
      "A publisher-defined daily cadence is separate from technical crawl eligibility; a news sitemap only advertises URLs, never proves signed editorial acceptance or actual article delivery.",
    ],
  });
}
