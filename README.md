# Koios.News website

<!-- 561-group-standards:badges:start -->
[![Causeway Services](https://img.shields.io/badge/561%20Group-Causeway%20Services-115e69)](https://github.com/causeway-services)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-115e69)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/causeway-services/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

`@causeway-services/koios-news-site` is the **original Koios.News public
website renderer and guarded Cloudflare release carrier**. Its current,
writable publishing application is
[causeway-services/koios.news](https://github.com/causeway-services/koios.news),
which selects this repository at `services/website`, owns the original
property configuration, independently accepted content/data inputs and
`config/website-release.json` package/version/integrity selection. The
historical [causeway-services/koios-news](https://github.com/causeway-services/koios-news)
repository is **archived**. Its former GitHub Actions `site.yml` and October
18 release receipts are retained history, **not current publishing authority**.

A push to this website source **does not automatically update** either
application's Git submodule, publish an immutable registry package, select it
in the current application, install a native Guix/LAGOON release or update
the public Cloudflare Worker. Treat those as distinct real receiving steps.

`src/build.mjs` and `src/render` are the original rendering implementation,
recovered from engineering's `news-property` application. They consume the
declared text, theming, HTML metadata and RDF providers from an admitted,
immutable runtime with exact independently accepted inputs. Current operation
requires the native
[Cold Red Gate Koios composition](https://github.com/561-group/cold-red-gate-services-section/tree/main/deployment/applications/koios),
original site package custody, Cloudflare preview/rollback and separate public
readback. Wrangler remains pinned. This source does not copy a second renderer
or make substitute public articles. Metadata changes preserve actual article
source/rights/editorial authority and corrections, as specified by the
[current application](https://github.com/causeway-services/koios.news/blob/main/README.md).

## Publisher discovery and crawl-economy services (Tunesday, 2026-10-13)

This publisher is both a consumer and a test property for a reusable **public-web
discovery and answer-citation assessment service**. Its programmatic contract lives
in the existing rendering package, not in a parallel scraper, ephemeral checklist,
or imitation of a search engine. The owning newsroom remains
[causeway-services/koios.news](https://github.com/causeway-services/koios.news);
the live content/data ledger and its editorial admission are unchanged.

### Working service: evidence, not a synthetic SEO score

From this repository, the dependency-free operation is:

    node --test test/discovery-audit.test.mjs
    node scripts/audit-discovery.mjs https://koios.news --strict --daily-article-target=20

The original Koios correction/help service additionally has an explicitly
situated public-reader requirement: one named `Report a problem` anchor in
the primary navigation, ordered before `Masthead`. Observe this on the
**actual public homepage**, without any extra HTTP request or a guessed
editor/custodian, by selecting the same source-owned requirement:

```sh
node scripts/audit-discovery.mjs https://koios.news --strict \
  --daily-article-target=20 \
  --reader-help-href=/corrections/#report-an-error \
  --reader-help-label='Report a problem' \
  --reader-help-before=/masthead/
```

The existing scheduled production observer uses this same selection. It
records the help-navigation result independently of news cadence and search
eligibility; a missing link is not a proven WCAG violation, a screen-reader
assessment, an installed editor, consented mailbox delivery, acknowledged
report or a completed correction. The help check is **not** an unconditional
requirement of the generic website or news publisher profile. It is only
evaluated when all three source-owned arguments are supplied. W3C
Understanding SC 3.2.6 concerns consistent placement *where help is
repeated*, not an obligation to offer help on every site.

For another publisher with the same news-property route conventions:

    node scripts/audit-discovery.mjs https://publisher.example --strict

For a general website, including a prospective external customer with no newsroom:

    node scripts/audit-discovery.mjs https://customer.example --profile website --strict

The website profile assesses public HTTP, canonical/indexability, optional robots
and sitemap discovery; it does not demand Koios-specific article/feeds/masthead
or mistake absence of optional discovery files for a violation. A representative
same-origin page may be given through articleUrl in the API, even when its route
is not an article. Operators may purchase a recurring read-only evaluation without
granting the audit bot account access; actual indexing, citations, Cloudflare
eligibility and paid requests still require separately authorized evidence.

The exported operation, available as the package's discovery-audit entrypoint,
is auditDiscovery({origin, fetchImpl, observedAt, articleUrl}). A consumer
may bind it to a supervised operation via the 561 Group typed message/operation
substrate. The assessment is non-destructive and emits
web-discovery.assessment/v1, not HTML, a sales promise, or an invented rank.
It uses same-origin HTTP reads and returns observations, measured findings,
source standards, critical failures/unknowns, and explicitly unverified claims.
A failed probe is not counted as zero citations or a confirmed indexing failure.
The operation **does not** have Search Console, Cloudflare zone, Webmaster Tools,
or crawler payment authority. No billing or paid crawl is attempted.

The initial profile is *news-property publishers*: it expects an HTML homepage,
a sitemap, news sitemap, robots file, feed, masthead, standards, corrections,
and a representative article under /posts/{slug}/. Those are *our* publishing
contract, not universal legal requirements for every site. Before offering
a generic-site audit, lift the news-specific profile to the shared
computer-web website service, retaining profiles instead of telling a shop
that its missing /news-sitemap.xml is an SEO fault.

The GitHub-hosted discovery workflow tests all parsing/assessment invariants
on PRs and main. Its scheduled Tuesday run also independently probes
koios.news from outside the Guix publication host. It is deliberately
read-only, does not require the intermittently troubled Cold Red Gate
runner, and records outcomes in the GitHub Actions job and run summary.
A green test run means the *assessor code* worked; only a green *production
receiving* run with observations implies the sampled site looked healthy.
A passing sample does not establish site-wide conformance.

### Science: acceptance constraints and false-proxy avoidance

The causal chain for discovery is **authoritative article + attributable
evidence + correct canonical and indexable HTTP representation + allowed crawl
+ indexed URL + relevant retrieval + actually cited output**. Each arrow is
a separate observation, not a permission to infer subsequent steps.
A source digest proves which bytes were admitted; it does not prove the
journalistic claim. A citation in a NewsArticle JSON-LD proves the publisher
links a source; it does not prove a generative answer engine cites that page.
A site being crawlable does not prove the bot actually crawled it. An HTTP 402
alone does not prove paid delivery or an actual invoice.

Represent each finding as a typed claim with:
subject (origin and optionally canonical article), predicate (test id),
value (pass/fail/unknown/unverified with measured data), witnessed time,
instrument (HTTP or authorized provider source), specification URI,
reproducible route and content provenance, and confidence/limits.
That is the natural SignCell/SCA/SEN input for a later SEAVT sequence,
SignGraph joins and SignCraft proof obligation. Do not invent a second
ontological hierarchy for a website tool. The JSON report is currently
a transport projection of those observations; the typed Semioverse
adapter and persistent authoritative admission must reuse the parent
engineering standards rather than write an independent receipt graveyard.

Useful measurements include: independently observed HTTP 200 and canonical,
noindex avoidance, same-origin URLs, verified news dates and bylines,
structured NewsArticle/NewsMediaOrganization with original-source
citations, readable article text, link/facet/metadata correctness, and
dated corrections. Monitor each route class and each published edition,
not just the homepage. Distinguish requirements from preferred practices.
For example, Google News Article markup is recommended to clarify dates,
authors and story details; it does not guarantee Google News placement.
An empty news sitemap is valid when no posts were published in its
rolling two-day window. Text-only pages should remain useful to readers
independent of JavaScript or dynamic ads.

### Publication cadence is a separate, independently falsifiable duty

The reusable news profile accepts `dailyArticleTarget`, and the Koios first-party
CI invokes it with 20 NEW article URLs per 24 hours. The external observer
checks unique news-sitemap publication dates, treats malformed/unavailable
evidence as unknown (not zero), and reports the actual deficit. It can fail
its publisher-cadence gate even while canonical HTML, NewsArticle JSON-LD
and news-sitemap shape pass. This is deliberately **not** a Google ranking
rule: Google permits an empty news sitemap when no new articles appeared
in the prior two days. The count is only a **site-declared** signal, not proof
that articles were accepted in the newsroom or actually delivered. Production
recovery requires the signed published ledger and independent URL receiving.
Never synthesize recent dates or dummy articles to satisfy this check.

### Operational gates: real SEO and agent search

1. **Delivery**: first receive the public website build successfully and
   verify release manifest digests against served assets. Do not declare a
   healthy news service from a passing GitHub code test. Production publication
   and the last new article timestamp are independent availability objectives.
   Current deployment is owned by the active Koios application's native
   Guix/LAGOON admission and the Cloudflare koios-news-primary carrier;
   never deploy an unadmitted copied
   renderer or edit production content without the parent editorial law.
2. **Crawl**: externally verify 200 on the canonical homepage and a current
   article, robots and XML sitemaps, 301s for legacy routes, feed dates,
   redirects/canonical, WAF and actual verified search-bot access. Private
   account status and authenticated crawler classifications are not observable
   from an anonymous external GET. Archive/section/source/author internal links
   should make the supported articles navigable even without a sitemap.
3. **Search**: use Google Search Console page indexing and performance,
   URL Inspection where justified, Google News/Discover reports if present,
   and Bing Webmaster Tools crawls/indexing/IndexNow acceptance. Persist source
   coverage and report aggregation windows. Do not confuse URL submitted to
   IndexNow with an indexed URL, nor repeated publication with new value.
4. **Answer citations / GEO / AEO**: Google's own AI Overviews/AI Mode guide
   specifies standard SEO, *not* mandatory llms.txt, AI-only tags, or artificial
   schema. Bing Webmaster Tools AI Performance (public preview from Feb 2026)
   reports total citations and cited pages for its supported AI experiences,
   not a generalized rank in every model. Build representative, reproducible
   question panels only where account/provider terms allow. Record prompt,
   locale, language, date, engine, answer, source citation link, URL match,
   repeat count, and exact provenance. Separate mention, source found,
   explicit citation, referral, engagement, and conversion.
5. **Editorial advantage**: every report needs original, checked sources,
   genuinely useful synthesizing analysis, revision dates, author/desk and
   publisher identity, corrections, and no hidden citation or keyword stuffing.
   Improve reporting in the governing newsroom rather than writing page prose
   to satisfy an automated keyword oracle.
6. **Revenue**: attribution and reuse permissions (including the existing CC
   licenses) are article-specific. The existing Koios Intelligence Briefing
   sold via market.561.group's x402 path is a separate paid API product.
   Search crawling, AI training crawling, and authenticated product purchases
   have different audiences and valid licenses. Their receipts must never be
   combined into a false proof of entitlement.

### Cloudflare Pay Per Crawl: eligibility and safe rollout

The actual static renderer emits one Cloudflare Workers `_headers` rule on
`/posts/:slug/`, not the old greedy `/posts/*`. Cloudflare's route placeholder
matches only one article slug: citation and other nested machine resources do
not inherit the origin article price header. This only quotes a price. It does
**not** enable an account, enroll a domain, change payment rules, guarantee free
crawl of other paths, collect money or establish a billable response. If the
zone-wide default action is Charge, Cloudflare Configuration Rules must disable
Pay Per Crawl for the intended free homepage, categories, navigation, feeds,
citation resources and API discovery; the absence of this header does not
create that exemption. Search engine crawlers must remain Allow under the
provider's verified category, rather than blocking or charging them.
Cloudflare documents this matching syntax at
https://developers.cloudflare.com/workers/static-assets/headers/ and the zone
pricing distinction at
https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/use-pay-per-crawl-as-site-owner/advanced-configuration/

Cloudflare's Pay Per Crawl is in **closed beta** as of 2026-10-13.
Technical readiness is not enrollment; without the zone's authorized
settings/Stripe flow and observed charging transactions, its status is
unverified. Cloudflare acts as Merchant of Record. This protocol uses
Web Bot Auth, price/payment request and response headers such as crawler-price
and crawler-charged, and HTTP 402 challenges, **not** a generic x402 payment
challenge. The existing market.561.group x402 product can coexist with it,
but is neither proof of eligibility nor a payment adapter.

For the existing authorized account and exact production zone:

- Establish Cloudflare beta enrollment and which bot identities are actually
  Web Bot Auth-verified; confirm zone permissions, crawler classification,
  analytics and the Cloudflare-managed Stripe payout procedure.
- Preserve **Allow** for verified *search-engine crawlers* (Googlebot,
  Bingbot, and other engines identified by Cloudflare as search engines),
  and the pages needed for free discovery. Cloudflare explicitly warns
  that charging or blocking search-engine crawlers can harm indexing.
  Never substitute a string-matched User-Agent for verified identity.
- Evaluate **Charge** for permitted non-search AI crawlers with valid
  contracts, and **Block** only where legal/editorial/access rules require.
  Observe request volume, charge success, payment dispute/refund exposure,
  402/200 breakdown, crawler reaction, and any crawl/search regression.
- Leave robots.txt, sitemap.xml, security.txt, .well-known/security.txt
  and crawlers.json free as Cloudflare requires. Use zone configuration
  rules to preserve free homepage, category/author/navigation and other
  chosen lead-generation routes; price an explicitly selected licensed
  premium subset first. Cloudflare supports dynamic pricing via origin or
  Worker crawler-price headers with cf-pay-per-crawl request context.
- Before enabling Charge, verify licensing for the content and the
  interplay with publicly displayed article syndication rights.
  A CC BY page remains CC BY; a paywall cannot revoke the license.
  Determine whether revenue is for delivered bandwidth/structured access
  rather than claiming exclusive rights where none exist.
- Run canary probes *as an authorized verified crawler* and compare real
  Cloudflare delivery and payout records to origin/service metrics; do not
  manufacture a charged receipt from local HTTP response mocks. Protect
  budgets and handle Cloudflare's payment headers in Web Bot Auth signatures
  for any 561 Group **buyer** crawlers.

Sources:
- Google AI features: https://developers.google.com/search/docs/appearance/ai-features
- Google NewsArticle: https://developers.google.com/search/docs/appearance/structured-data/article
- Google News sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
- Bing AI Performance: https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
- Cloudflare protocol/beta: https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/
- Cloudflare allowed bots: https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/use-pay-per-crawl-as-site-owner/select-crawlers-to-charge/
- Cloudflare free paths: https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/faq/
- Cloudflare path exceptions and dynamic pricing: https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/use-pay-per-crawl-as-site-owner/advanced-configuration/

### Bing AI citations and Topics Portfolio: October 13, 2026 evidence law

Microsoft's October 13 [Topics Portfolio (Beta) announcement](https://blogs.bing.com/webmaster/2026/10/introducing-topics-portfolio-beta-in-ai-performance/)
extends the supported [AI Performance](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c)
dashboard with actual site-relative thematic evidence. This is a **dated
instrument capability**, not an observed reading for Koios.News. No Bing
Webmaster Tools account-derived statistic is presently admitted into this
repo or the production feedback. It would be scientifically false to treat
published article category counts as AI Search presence or to impute a
"citation share" from a missing account.

The native site-discovery service shall distinguish these measurement types
and retain the original Bing semantics whenever authorized observations
become available:

| Reading | Observable quantity | Limit |
|---|---|---|
| URL citation | Bing-supplied count of explicit citations to canonical page URLs | Only supported Copilot/Bing/partner experiences, not every agent/model |
| Grounding query | Query text or grouped query associated with cited site content | Not a user's original request and not a search ranking |
| Topic portfolio | AI-classified clusters of grounded queries with publisher presence | May be absent for insufficient volume; classification may be wrong |
| Topic size | Approximate ecosystem-wide citations within a topic/window | Not exact site traffic, people or impressions |
| Sites cited | Approximate distinct sites surfaced within topic | Not competitors' revenue or a causal difficulty estimate |
| Opportunity query | Bing-observed query where other sites appear and ours does not | May be branded to someone else; volume deliberately approximate |
| Citation share | Available supported-interface comparison of site's cited presence | Denominator and date range must travel with the reading |

The evaluator shall keep absent sources `unknown`, not zero. Any production
or customer-custody adapter shall preserve the queried verified Bing property
identity, consent and access level, dashboard feature/version, view interval,
query/topic identifier, site URL, fetch/observation time, disclosure/rounding,
original grouping, and classification uncertainty. Contested cluster labels
may be simultaneously recorded as observed and challenged, with neither
erasing the underlying observation. These are ordinary source/claim/evidence
relations in the existing SignCell/SEN/SEAVT apparatus: do not invent a
second parallel ontology or overwrite a source's testimony with inferred
"truth". No automated crawler is authorized to scrape private dashboard
pages using customer credentials without an explicit service contract.

**Experimental receiving contract.** A customer commission should establish
the matched domain, topical scope, locales, languages, engines, one or more
visible baseline windows, query-panel provenance and a control. The provider
can rank interventions only after independently testing public URLs for
canonical, indexability, source-backed content and exact publication date.
Search Console and Bing Webmaster Tools supply indexing/citation observations
under consent; Cloudflare supplies verified bot classifications and request
economics under separate zone authority. A measurement before/after a
metadata change is correlation, not an estimate of incremental citation
lift. Prefer contemporaneous control pages or staggered rollout, identical
measurement windows, search-surface changes logged as confounders, uncertainty
intervals and an explicit `not-identifiable` conclusion when controls fail.
Record observed **citation**, resulting **referral** (where attributable),
customer **engagement** and paid **conversion** as four separate outcomes,
never as one invented visibility score. Report spend on provider accounts,
compute, human review and data access separately from crawl/purchase
receipts. Internal agent work has a service purchase order and a receiver,
not an unsigned line in a promotional dashboard.

The hireable product's current admitted capability is the dependency-free
public `web-discovery.assessment/v1` inspector with distinct `news` and
`website` profiles. Its commercial order is **not** fulfilled by merely
passing the source test: the accepting customer must actually receive a
dated report containing observed URLs, request outcomes, specifications,
provenance and limitations. A deeper AI-citation measurement is a different
contract requiring verifiable customer Bing data. Pay Per Crawl enablement
is a third, optional zone-owner contract; it cannot be bundled into an
unqualified "AI Search boost", sold as guaranteed rankings, or represented
by an HTTP 402 without Web Bot Auth and an independently observed settlement.

This separation is especially important for Koios.News: the public corpus
is stale despite healthy website builds; restoring source-backed NEWS
publication is a necessary quality input to the acquisition and citation
chain, not something a synthetic GEO intervention can replace.

### Market comparison and hireable delivery contract

Actual existing commercial peers are not thin meta-tag checkers.
Ahrefs Brand Radar measures mentions, citations, impressions, found-in
and AI share of voice, with aggregations and an API; Peec AI offers
query/prompt comparison and share-of-voice; Profound exposes page-level
citation and crawler analysis. This first implementation does **not**
meet those analytics products in breadth, much less beat them. To compete
credibly, add authorized Search Console/Bing/Cloudflare inputs, robust
prompt sampling and repeatability, cited-page and competitor attribution,
per-engine/locale/time segmentations, intervention-versus-control
experiments, cohort-level lift, conversion/revenue joins, and financial
ROI with uncertainty intervals. Source-referenced, independently received
interventions and low-cost self-hostability are plausible differentiators,
not a demonstrated win today.

The present hireable engagement is a **read-only publisher discovery
inspection**: input a public origin, return the typed report and links
to observed failing public surfaces, optionally propose a repair. Rights
to write to the customer's site, access to analytics, search account
permissions, Cloudflare beta eligibility, API quotas, privacy and billing
are separate explicit contracts. Do not advertise unattended multi-tenant
SaaS until authentication, isolation, scheduling, limits, privacy retention,
pricing and audited billing exist. Commercial comparison must use matched
domains, queries, sampling schedule, crawler identity, independent receiver
and observation intervals. The goal is to meet-then-beat measured customer
outcomes, not to accumulate "SEO check" percentages.

### Remaining defects and admission requirements

This branch supplies the assessor and an independent observer.
It does not itself repair outages, issue new news articles, modify Cloudflare
zone charging, assert search-engine index status, or certify a paid-crawl
transaction. Follow-ups in the owning newsroom should wire conformance
sampling to verified live deployment, instrument real account observations,
project rights fields into JSON-LD, implement a rights-aware Cloudflare canary
in its existing Guix/Worker operations only *after beta admission*, and
publish qualified jobs through the existing public-web services organization.

### Newswire artifact preservation

The existing `buildProperty` output `ninjs.json` retains the article's canonical
URI, original publication time, correction time, byline, language and body.
A source-authored original permalink remains an `altIds` entry.
Its Ninjs 3.2 `subjects` carry source section, keyword and category metadata;
`organisations` carries the property's declared masthead publisher (or the
property name). A correction preserves the URI and first-created time.
This recovers the corresponding `emsenn/newswire` projection obligation in
[Content Engineering #20](https://github.com/red-cup-engineering/computer-content-engineering-services-section/issues/20).

The renderer does not grant editorial authority. The ordinary build's existing
draft filter and required published-ledger rule remain in force, and the
current Koios application still verifies and consumes its independent
publication grant before candidate formation. Ninjs metadata is a serialization
of admitted source; it does not prove the article's claims or live delivery.
Ninjs 3.2 uses `uri` for item identity; no unsupported legacy `guid` is added.
The former Rete workspace/serve contract and repository rehoming remain open
on the original work.
