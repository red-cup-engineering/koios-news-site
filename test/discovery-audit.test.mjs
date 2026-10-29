import { test } from "node:test";
import assert from "node:assert/strict";
import { auditDiscovery, inspectArticle, inspectPublisherGraph, inspectReaderHelp } from "../src/discovery-audit.mjs";

const origin = "https://koios.news";
const articleUrl = origin + "/posts/proven-story/";
const article = [
  "<!doctype html><html><head>",
  '<link rel="canonical" href="https://koios.news/posts/proven-story/">',
  '<meta name="robots" content="max-snippet:-1, max-image-preview:large">',
  '<meta property="og:url" content="https://koios.news/posts/proven-story/">',
  '<script type="application/ld+json">' + JSON.stringify({
    "@context": "https://schema.org", "@type": "NewsArticle",
    headline: "Proven story", url: articleUrl, datePublished: "2026-10-10",
    dateModified: "2026-10-11", publisher: { "@type": "Organization", name: "Koios.News" },
    author: { "@type": "Organization", name: "Koios.News Desk", url: origin + "/desks/technology/" },
    citation: ["https://example.org/original-source"],
    license: "https://creativecommons.org/licenses/by/4.0/", isAccessibleForFree: true,
  }) + "</script></head><body><h1>Proven story</h1></body></html>",
].join("");
const home = '<!doctype html><html><head><link rel="canonical" href="https://koios.news/">' +
  '<meta name="robots" content="max-snippet:-1">' +
  '<script type="application/ld+json">' + JSON.stringify({
    "@context": "https://schema.org", "@type": "NewsMediaOrganization", name: "Koios.News",
    url: origin + "/",
  }) + "</script></head></html>";
const paths = Object.freeze({
  "/": home,
  "/robots.txt": "User-agent: *\nAllow: /\nSitemap: https://koios.news/sitemap.xml\n",
  "/sitemap.xml": '<?xml version="1.0"?><urlset><url><loc>' + articleUrl +
    "</loc></url><url><loc>https://koios.news/</loc></url></urlset>",
  "/news-sitemap.xml": '<?xml version="1.0"?><urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"></urlset>',
  "/feed.xml": '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>',
  "/masthead/": "<html><h1>Masthead</h1></html>",
  "/standards/": "<html><h1>Editorial standards</h1></html>",
  "/corrections/": "<html><h1>Corrections</h1></html>",
  "/posts/proven-story/": article,
});
const fakeFetch = (overrides = {}) => async (url, options) => {
  assert.equal(options.method, "GET");
  assert.equal(options.redirect, "manual");
  const path = new URL(url).pathname;
  const value = Object.hasOwn(overrides, path) ? overrides[path] : paths[path];
  if (value instanceof Error) throw value;
  const status = typeof value === "object" && value !== null ? value.status : value === undefined ? 404 : 200;
  const body = typeof value === "object" && value !== null ? value.body ?? "" : value;
  return { status, headers: { get: () => "text/html; charset=utf-8" }, text: async () => body };
};
const run = (overrides = {}, options = {}) => auditDiscovery({
  origin, fetchImpl: fakeFetch(overrides), observedAt: new Date("2026-10-13T12:00:00Z"), ...options,
});
const finding = (report, id) => report.findings.find((row) => row.id === id);

test("publisher discovery returns a reusable typed report with explicit uncertainty", async () => {
  const result = await run();
  assert.equal(result.kind, "web-discovery.assessment/v1");
  assert.equal(result.observedAt, "2026-10-13T12:00:00.000Z");
  assert.equal(result.decision.technicalDiscoverySampleReady, true);
  assert.equal(result.decision.payPerCrawlEligible, "unverified");
  assert.equal(result.decision.searchPlacementProven, false);
  assert.equal(result.decision.agentCitationProven, false);
  assert.equal(finding(result, "news-sitemap-shape").state, "pass");
  assert.equal(finding(result, "article-sources").evidence.citations, 1);
  assert.equal(finding(result, "article-license").state, "pass");
  assert.equal(finding(result, "cloudflare-pay-per-crawl").state, "unverified");
  assert.equal(Object.keys(result.observations).length, 9);
});

test("primary-heading observation detects the live homepage gap without inventing an indexing failure", async () => {
  const missing = await run();
  assert.equal(finding(missing, "home-primary-heading").state, "fail");
  assert.equal(finding(missing, "home-primary-heading").critical, false);
  assert.equal(missing.decision.technicalDiscoverySampleReady, true);
  const present = await run({ "/": home + '<main><h1><a href="/posts/proven-story/">Proven story</a></h1></main>' });
  assert.equal(finding(present, "home-primary-heading").state, "pass");
  assert.equal(finding(present, "home-primary-heading").evidence.count, 1);
  const empty = await run({ "/": home + '<h1>  <span></span> </h1>' });
  assert.equal(finding(empty, "home-primary-heading").state, "fail");
  const inert = await run({ "/": home + '<!-- <h1>Comment</h1> --><script>"<h1>Script</h1>"</script><template><h1>Template</h1></template>' });
  assert.equal(finding(inert, "home-primary-heading").state, "fail");
  const unobserved = await run({ "/": new Error("Provider unobservable") });
  assert.equal(finding(unobserved, "home-primary-heading").state, "unknown");
});

test("explicit Koios primary reader-help contract is observed from the same homepage without a new HTTP probe",async()=>{
  const readerHelp={href:"/corrections/#report-an-error",label:"Report a problem",before:"/masthead/"};
  const primary='<nav aria-label="Primary"><a href="/search/">Search</a>' +
    '<a href="/corrections/#report-an-error">Report a problem</a>' +
    '<a href="/masthead/">Masthead</a></nav>';
  const visits=[];
  const fetchImpl=async(url,options)=>{visits.push(new URL(url).pathname);
    return fakeFetch({"/":home+primary})(url,options);};
  const valid=await auditDiscovery({origin,readerHelp,fetchImpl,observedAt:new Date("2026-10-29T21:00:00Z")});
  assert.equal(valid.decision.readerHelp.status,"pass");
  const reading=finding(valid,"reader-help-navigation");
  assert.equal(reading.state,"pass");
  assert.equal(reading.evidence.matchingLinks,1);
  assert.equal(reading.evidence.correctlyOrdered,true);
  assert.equal(reading.critical,false,"reader help is distinct from indexability");
  assert.equal(valid.decision.technicalDiscoverySampleReady,true);
  assert.equal(visits.filter(path=>path==="/").length,1,"the original home GET is reused");

  const missed=await run({}, {readerHelp});
  assert.equal(finding(missed,"reader-help-navigation").state,"fail");
  assert.equal(missed.decision.readerHelp.status,"fail");
  assert.equal(missed.decision.technicalDiscoverySampleReady,true,
    "uninstalled help navigation is not a fabricated indexing failure");
  const unrequested=await run();
  assert.equal(finding(unrequested,"reader-help-navigation"),undefined);
  assert.equal(unrequested.decision.readerHelp.status,"not-assessed");
});

test("false, duplicated, inconsistent and inert help URLs cannot qualify public help",async()=>{
  const config={href:"/corrections/#report-an-error",label:"Report a problem",before:"/masthead/"};
  const good='<nav aria-label="Primary">' +
    '<a href="/search/">Search</a>' +
    '<a href="/corrections/#report-an-error">Report a problem</a>' +
    '<a href="/masthead/">Masthead</a></nav>';
  assert.equal(inspectReaderHelp(good,origin,config).linked,true);
  const controls=[
    good.replace('>Report a problem</a>','>Contact the newsroom</a>'),
    good.replace('href="/corrections/#report-an-error"','href="https://other.example/corrections/#report-an-error"'),
    good.replace('href="/corrections/#report-an-error"','href="/corrections/#incorrect"'),
    good.replace('<a href="/masthead/">Masthead</a>','') + '<a href="/masthead/">Masthead</a>',
    good.replace('<a href="/corrections/#report-an-error">Report a problem</a>','') +
      '<a href="/corrections/#report-an-error">Report a problem</a>',
    good.replace('<a href="/masthead/">Masthead</a>',
      '<a href="/corrections/#report-an-error">Report a problem</a><a href="/masthead/">Masthead</a>'),
    good.replace('aria-label="Primary"','aria-label="Footer"'),
    '<!--'+good+'-->',
    '<template>'+good+'</template>',
    good.replace('>Report a problem</a>',' aria-label="Unrelated task">Report a problem</a>'),
  ];
  for(const [index,html]of controls.entries()){
    const observed=inspectReaderHelp(html,origin,config);
    assert.equal(observed.linked,false,"control "+index+" must refuse");
    const report=await run({"/":home+html},{readerHelp:config});
    assert.equal(finding(report,"reader-help-navigation").state,"fail","control "+index);
  }
});

test("public help admission rejects foreign, ambiguous and partially declared requirements",async()=>{
  const good={href:"/corrections/#report-an-error",label:"Report a problem",before:"/masthead/"};
  for(const bad of [
    {...good,href:"https://other.example/corrections/#report-an-error"},
    {...good,href:"//other.example/corrections/#report-an-error"},
    {...good,href:"/corrections/?token=secret#report-an-error"},
    {...good,before:"/masthead/?next=/private"},
    {...good,label:""},
    {...good,label:"x".repeat(129)},
    {href:good.href,label:good.label},
  ]){
    await assert.rejects(run({}, {readerHelp:bad}), /reader help/u);
  }
  const unknown=await run({"/":new Error("Homepage unavailable")},{readerHelp:good});
  assert.equal(finding(unknown,"reader-help-navigation").state,"unknown");
  assert.equal(unknown.decision.readerHelp.status,"unknown");
  const siteMode=await run({"/":home+
    '<nav aria-label="Primary"><a href="/corrections/#report-an-error">Report a problem</a><a href="/masthead/">Masthead</a></nav>'},
    {profile:"website",readerHelp:good});
  assert.equal(siteMode.decision.readerHelp.status,"pass",
    "explicit requirements are situated; the generic website profile has no invented Koios default");
});

test("public homepage and article identify one source-owned publisher; mere Organization is insufficient", async () => {
  const publisherId = origin + "/#publisher";
  const publisher = { "@context":"https://schema.org", "@type":"NewsMediaOrganization",
    "@id":publisherId, name:"Koios.News", url:origin+"/" };
  const website = { "@context":"https://schema.org", "@type":"WebSite",
    "@id":origin+"/#website", name:"Koios.News", url:origin+"/",
    publisher:{ "@id":publisherId } };
  const linkedHome = '<html><head><link rel="canonical" href="'+origin+'/">' +
    '<script type="application/ld+json">'+JSON.stringify([publisher, website])+'</script></head></html>';
  const linkedArticle = article.replace(
    '"publisher":{"@type":"Organization","name":"Koios.News"}',
    '"publisher":{"@type":"Organization","@id":"'+publisherId+'","name":"Koios.News","url":"'+origin+'/"}');
  assert.notEqual(article, linkedArticle, "article fixture must include the exact publisher field");
  const linked = inspectPublisherGraph(linkedHome,origin);
  assert.equal(linked.linked,true);
  assert.equal(linked.publisherId,publisherId);
  assert.equal(linked.websiteId,origin+"/#website");
  const report = await run({ "/":linkedHome, "/posts/proven-story/":linkedArticle });
  assert.equal(finding(report,"publisher-graph-linkage").state,"pass");
  assert.equal(finding(report,"article-publisher-linkage").state,"pass");
  assert.equal(report.observations.home.inspection.publisherGraph.linked,true);
  assert.equal(report.observations.article.inspection.article.publisherId,publisherId);
  assert.equal(report.decision.technicalDiscoverySampleReady,true);

  const oldHome = await run();
  assert.equal(finding(oldHome,"publisher-identity").state,"pass");
  assert.equal(finding(oldHome,"publisher-graph-linkage").state,"fail");
  assert.equal(finding(oldHome,"article-publisher-linkage").state,"fail");
  assert.equal(oldHome.decision.technicalDiscoverySampleReady,true,
    "missing publisher relation is not itself proof of crawl exclusion");
});

test("publisher graph rejects wrong-site, conflicting and unconnected IDs", async () => {
  const org = { "@type":"NewsMediaOrganization", "@id":origin+"/#publisher",
    name:"Koios.News", url:origin+"/" };
  const website = { "@type":"WebSite", "@id":origin+"/#website", url:origin+"/",
    name:"Koios.News", publisher:{ "@id":origin+"/#publisher" } };
  const asHtml=(a,b)=>'<script type="application/ld+json">'+
    JSON.stringify({ "@context":"https://schema.org", "@graph":[a,b] })+'</script>';
  assert.equal(inspectPublisherGraph(asHtml(org,website),origin).linked,true);
  assert.equal(inspectPublisherGraph(asHtml(org,{...website,publisher:{"@id":origin+"/#wrong"}}),origin).linked,false);
  assert.equal(inspectPublisherGraph(asHtml({...org,"@id":"https://unrelated.example/#publisher"},website),origin).linked,false);
  assert.equal(inspectPublisherGraph(asHtml(org,{...website,"@id":origin+"/#publisher"}),origin).linked,false);
  assert.equal(inspectPublisherGraph(asHtml(org,{...website,url:"https://unrelated.example/"}),origin).linked,false);
  assert.equal(inspectPublisherGraph('<script type="application/ld+json">{bad</script>',origin).linked,false);
  const home = '<link rel="canonical" href="'+origin+'/">'+asHtml(org,website);
  const noArticleId=await run({"/":home});
  assert.equal(finding(noArticleId,"publisher-graph-linkage").state,"pass");
  assert.equal(finding(noArticleId,"article-publisher-linkage").state,"fail");
  const missingHome=await run({"/":new Error("Provider unobservable")});
  assert.equal(finding(missingHome,"publisher-graph-linkage").state,"unknown");
  assert.equal(finding(missingHome,"article-publisher-linkage").state,"unknown");
});

test("an empty news sitemap is valid when the 48-hour publication window is empty", async () => {
  const result = await run();
  assert.equal(finding(result, "news-sitemap-shape").state, "pass");
  assert.equal(finding(result, "news-sitemap-shape").evidence.entries, 0);
});

test("article sample may be supplied without changing sitemap URLs", async () => {
  const result = await run({ "/sitemap.xml": "<?xml version='1.0'?><urlset><url><loc>https://koios.news/</loc></url></urlset>" },
    { articleUrl });
  assert.equal(finding(result, "article-http").state, "pass");
});

test("rejects unsafe origins and cross-origin sample targets", async () => {
  for (const candidate of ["http://koios.news", "https://user:pass@koios.news", "https://koios.news/path", "https://koios.news?x=1"]) {
    await assert.rejects(() => auditDiscovery({ origin: candidate, fetchImpl: fakeFetch() }), /bare HTTPS origin/);
  }
  await assert.rejects(() => run({}, { articleUrl: "https://attacker.example/posts/test/" }), /same-origin/);
  await assert.rejects(() => run({}, { articleUrl: origin + "/api/token" }), /same-origin/);
});

test("does not follow offsite redirects or authorize a payment during assessment", async () => {
  const report = await run({ "/posts/proven-story/": { status: 402, body: "" } });
  assert.equal(finding(report, "article-http").state, "fail");
  assert.equal(finding(report, "article-canonical").state, "unknown");
  assert.equal(report.decision.technicalDiscoverySampleReady, false);
});

test("website outage is an unknown observation, never a passing zero or a fake index penalty", async () => {
  const report = await run({ "/": new Error("DNS unavailable") });
  assert.equal(finding(report, "home-http").state, "unknown");
  assert.equal(finding(report, "home-canonical").state, "unknown");
  assert.deepEqual(report.decision.criticalUnknowns.includes("home-http"), true);
  assert.equal(report.decision.technicalDiscoverySampleReady, false);
  assert.match(report.observations.home.error, /DNS unavailable/);
});

test("default robots blanket block is an explicit critical failure", async () => {
  const report = await run({ "/robots.txt": "User-agent: *\nDisallow: /\nSitemap: https://koios.news/sitemap.xml\n" });
  assert.equal(finding(report, "robots-default-block").state, "fail");
  assert.ok(report.decision.criticalFailures.includes("robots-default-block"));
});

test("robots rules for partial directories do not look like a site-wide block", async () => {
  const report = await run({ "/robots.txt": "User-agent: *\nDisallow: /search/\nSitemap: https://koios.news/sitemap.xml\n" });
  assert.equal(finding(report, "robots-default-block").state, "pass");
});

test("detects cross-site and malformed sitemap URL entries", async () => {
  const report = await run({ "/sitemap.xml": "<urlset><url><loc>https://hostile.example/posts/x/</loc></url>" +
    "<url><loc>this is not a url</loc></url></urlset>" }, { articleUrl });
  assert.equal(finding(report, "sitemap-addresses").state, "fail");
});

test("schema parse errors do not masquerade as an absent or valid NewsArticle", async () => {
  const result = inspectArticle('<script type="application/ld+json">{ broken </script>');
  assert.equal(result.structuredDataErrors, 1);
  assert.equal(result.article, null);
});

test("JSON-LD @graph objects, arrays, and single quotes in HTML attributes are supported", async () => {
  const page = "<link href='" + articleUrl + "' rel='canonical'>" +
    "<meta content='noindex, follow' name='robots'>" +
    "<script type='application/ld+json'>" + JSON.stringify({ "@graph": [{ "@type": "NewsArticle",
      headline: "Story", datePublished: "2026-10-13" }] }) + "</script>";
  const inspected = inspectArticle(page);
  assert.equal(inspected.canonical, articleUrl);
  assert.equal(inspected.article.headline, "Story");
  assert.equal(inspected.robots, "noindex, follow");
});

test("checks article noindex and broken canonical independently", async () => {
  const blocked = article.replace("max-snippet:-1", "noindex, follow").replace(
    'href="https://koios.news/posts/proven-story/"', 'href="https://koios.news/posts/wrong/"');
  const report = await run({ "/posts/proven-story/": blocked });
  assert.equal(finding(report, "article-indexable").state, "fail");
  assert.equal(finding(report, "article-canonical").state, "fail");
});

test("missing cited evidence is a reported quality gap, not proof of a search ranking", async () => {
  const uncited = article.replace('"citation":["https://example.org/original-source"],', "");
  const report = await run({ "/posts/proven-story/": uncited });
  assert.equal(finding(report, "article-sources").state, "fail");
  assert.equal(report.decision.agentCitationProven, false);
});

test("unavailable licensing is unverified rather than spuriously deemed proprietary", async () => {
  const withoutLicense = article.replace('"license":"https://creativecommons.org/licenses/by/4.0/",', "");
  const report = await run({ "/posts/proven-story/": withoutLicense });
  assert.equal(finding(report, "article-license").state, "unverified");
});

test("network audit is read-only and only probes same-origin URLs", async () => {
  const touched = [];
  await auditDiscovery({ origin, observedAt: new Date("2026-10-13"), fetchImpl: async (url, options) => {
    touched.push(url);
    assert.equal(options.method, "GET");
    assert.equal(new URL(url).origin, origin);
    return fakeFetch()(url, options);
  } });
  assert.equal(touched.length, 9);
});

test("hireable generic website profile does not impose newsroom-only routes", async () => {
  const nonNewsOrigin = "https://publisher.example";
  const site = '<html><head><link rel="canonical" href="' + nonNewsOrigin +
    '/"><meta name="robots" content="index, follow"></head><body>Public facts</body></html>';
  const report = await auditDiscovery({
    origin: nonNewsOrigin, profile: "website", observedAt: new Date("2026-10-13T12:00:00Z"),
    fetchImpl: async (url) => ({
      status: new URL(url).pathname === "/" ? 200 : 404,
      headers: {get:()=> "text/html"}, text:async()=>site,
    }),
  });
  assert.equal(report.profile, "website");
  assert.equal(report.decision.technicalDiscoverySampleReady, true);
  assert.deepEqual(Object.keys(report.observations).sort(),["home","robots","sitemap"].sort());
  assert.equal(report.findings.some(row=>row.id==="news-sitemap-shape"), false);
  assert.equal(report.findings.some(row=>row.id==="feed-http"), false);
  assert.equal(finding(report,"publisher-identity").state, "unverified");
  assert.equal(finding(report,"robots-http").critical, false);
  assert.equal(finding(report,"sitemap-http").critical, false);
});

test("generic page sample must be same-origin and can be non-news path", async () => {
  const site = "https://publisher.example";
  const html = '<link rel="canonical" href="' + site + '/about/"><meta name="robots" content="index">';
  const report = await auditDiscovery({origin:site,profile:"website",articleUrl:site+"/about/",
    fetchImpl:async (url)=>({status:200,headers:{get:()=>"text/html"},
      text:async()=>new URL(url).pathname==="/about/"?html:
        '<link rel="canonical" href="'+site+'/">'}),
  });
  assert.equal(finding(report,"page-canonical").state,"pass");
  assert.equal(finding(report,"page-indexable").state,"pass");
  assert.equal(report.findings.some(row=>row.id==="newsarticle-jsonld"),false);
  await assert.rejects(()=>auditDiscovery({origin:site,profile:"website",
    articleUrl:"https://attacker.example/about/",fetchImpl:async()=>{throw new Error("should not fetch")}}),/same-origin/);
  await assert.rejects(()=>auditDiscovery({origin:site,profile:"unqualified"}),/profile/);
});

test("generic sample noindex is a real failure, but missing optional files are not", async () => {
  const site="https://publisher.example";
  const report=await auditDiscovery({origin:site,profile:"website",articleUrl:site+"/about/",
    fetchImpl:async (url)=>{
      const path=new URL(url).pathname;
      return {status:["/","/about/"].includes(path)?200:404,
        headers:{get:()=>"text/html"},text:async()=>path==="/about/"?
          '<link rel="canonical" href="'+site+'/about/"><meta name="robots" content="noindex">':
          '<link rel="canonical" href="'+site+'/">'};
    },
  });
  assert.deepEqual(report.decision.criticalFailures,["page-indexable"]);
});

test("publisher cadence is an explicit failure even when the technical Google News sitemap is correctly empty", async () => {
  const report=await run({}, {dailyArticleTarget:20});
  assert.equal(report.decision.technicalDiscoverySampleReady,true);
  assert.equal(finding(report,"news-sitemap-shape").state,"pass");
  assert.equal(finding(report,"newsroom-publishing-cadence").state,"fail");
  assert.equal(report.decision.publicationCadence.advertisedNewArticleUrlsLast24h,0);
  assert.equal(report.decision.publicationCadence.deficit,20);
});

test("cadence counts distinct canonical news URLs in the publisher's last 24 hours", async () => {
  const date="2026-10-13T11:30:00Z";
  const item=(slug,at)=>'<url><loc>https://koios.news/posts/'+slug+
    '/</loc><news:news><news:publication_date>'+at+'</news:publication_date></news:news></url>';
  const xml='<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'+
    item("new-a",date)+item("new-a",date)+
    item("new-b","2026-10-13T07:00:00Z")+
    item("old","2026-10-11T02:00:00Z")+"</urlset>";
  const report=await run({"/news-sitemap.xml":xml},{dailyArticleTarget:2});
  assert.equal(report.decision.publicationCadence.status,"pass");
  assert.equal(report.decision.publicationCadence.advertisedNewArticleUrlsLast24h,2);
  assert.equal(report.decision.publicationCadence.outsideGoogleNewsWindow,1);
  assert.equal(report.decision.technicalDiscoverySampleReady,true);
});

test("malformed, missing or future-dated publication entries are unknown, not zero", async () => {
  const bad='<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'+
    '<url><loc>https://koios.news/posts/new-a/</loc></url></urlset>';
  const invalid=await run({"/news-sitemap.xml":bad},{dailyArticleTarget:20});
  assert.equal(invalid.decision.publicationCadence.status,"unknown");
  assert.equal(invalid.decision.publicationCadence.advertisedNewArticleUrlsLast24h,null);
  const missing=await run({"/news-sitemap.xml":{status:503}},{dailyArticleTarget:20});
  assert.equal(missing.decision.publicationCadence.status,"unknown");
  assert.equal(missing.decision.publicationCadence.advertisedNewArticleUrlsLast24h,null);
  const future=await run({"/news-sitemap.xml":bad.replace("</url>",'<news:publication_date>2027-01-01T00:00:00Z</news:publication_date></url>')},{dailyArticleTarget:20});
  assert.equal(future.decision.publicationCadence.status,"unknown");
});

test("cadence cannot be used to invent general website SEO requirements",async()=>{
  await assert.rejects(()=>run({}, {profile:"website",dailyArticleTarget:20}),/news profile only/);
  await assert.rejects(()=>run({}, {dailyArticleTarget:0}),/positive integer/);
  assert.equal((await run({})).decision.publicationCadence.status,"not-assessed");
});


test("public audit origin cannot target obvious private network origins", async () => {
  for (const origin of [
    "https://127.0.0.1", "https://169.254.169.254", "https://[::1]",
    "https://localhost", "https://metadata.localhost", "https://portal.internal",
    "https://printer.local", "https://example.com:8443", "https://service.home.arpa",
  ]) await assert.rejects(() => auditDiscovery({origin,fetchImpl:async()=>{throw new Error("must not fetch");}}),
    /public HTTPS hostname/);
});

test("bounded real-stream reading rejects a huge response and preserves unknown evidence", async () => {
  const oversized = new Uint8Array(2_000_001).fill(97);
  let cancelCount = 0, usedFallback = false;
  const report = await auditDiscovery({ origin, profile:"website", fetchImpl:async (url) => {
    if(new URL(url).pathname!=="/") return {status:404,headers:{get:()=>null},text:async()=>""};
    let read = false;
    return {status:200,headers:{get:()=>null},
      body:{getReader:()=>({read:async()=>read?{done:true}:{done:false,value:(read=true,oversized)},
        cancel:async()=>{cancelCount++;},releaseLock:()=>{}})},
      text:async()=>{usedFallback=true;throw new Error("body buffering is unsafe");}};
  }});
  assert.equal(finding(report,"home-http").state,"unknown");
  assert.match(report.observations.home.error,/bounded body size/);
  assert.equal(usedFallback,false);
  assert.equal(cancelCount,1);
});

test("streaming article assessment preserves complete small UTF-8 and explicit source identity", async () => {
  const encoder = new TextEncoder();
  const html = '<link rel="canonical" href="https://koios.news/">';
  const bytes = encoder.encode(html), half=Math.floor(bytes.length/2);
  const responseText = async (url) => {
    if(new URL(url).pathname!=="/") return fakeFetch()(url,{method:"GET",redirect:"manual"});
    let index=0;
    return {status:200,headers:{get:()=>null},body:{getReader:()=>({
      read:async()=>index++===0?{done:false,value:bytes.slice(0,half)}:
        index===2?{done:false,value:bytes.slice(half)}:{done:true},
      releaseLock:()=>{}})},text:async()=>{throw new Error("no text fallback");}};
  };
  const report = await auditDiscovery({origin,profile:"website",fetchImpl:responseText});
  assert.equal(finding(report,"home-canonical").state,"pass");
});
