#!/usr/bin/env node
/** Executable hireable discovery-assessment operation; no external dependencies. */
import { auditDiscovery } from "../src/discovery-audit.mjs";

async function main(args = process.argv.slice(2)) {
  const origin = args.find((arg) => !arg.startsWith("--")) ?? "https://koios.news";
  const strict = args.includes("--strict");
  const profile = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : "news";
  const cadenceOption = args.find(arg=>arg.startsWith("--daily-article-target="));
  const dailyArticleTarget = cadenceOption===undefined?undefined:Number(cadenceOption.slice("--daily-article-target=".length));
  // Reader-help is an expressly selected site obligation, not a default
  // requirement for every news publisher or human ability/language.
  const option = name => args.find(arg=>arg.startsWith("--"+name+"="))?.slice(name.length+3);
  const helpHref=option("reader-help-href"),helpLabel=option("reader-help-label"),
    helpBefore=option("reader-help-before");
  if([helpHref,helpLabel,helpBefore].some(x=>x!==undefined) &&
     [helpHref,helpLabel,helpBefore].some(x=>x===undefined))
    throw new TypeError("reader help needs href, label and before together");
  const readerHelp = helpHref===undefined ? null :
    {href:helpHref,label:helpLabel,before:helpBefore};
  const report = await auditDiscovery({ origin, profile,
    ...(dailyArticleTarget===undefined?{}:{dailyArticleTarget}),readerHelp });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (strict) {
    if (report.decision.criticalFailures.length) process.exitCode = 2;
    else if (report.decision.criticalUnknowns.length) process.exitCode = 3;
    else if (report.decision.readerHelp.status === "fail") process.exitCode = 6;
    else if (report.decision.readerHelp.status === "unknown") process.exitCode = 7;
    else if (report.decision.publicationCadence.status === "fail") process.exitCode = 4;
    else if (report.decision.publicationCadence.status === "unknown") process.exitCode = 5;
  }
}

main().catch((error) => {
  process.stderr.write("publisher-discovery-assessment: " + (error?.message ?? String(error)) + "\n");
  process.exitCode = 64;
});
