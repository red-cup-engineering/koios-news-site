import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildConfiguredPropertyWithMedia} from '../scripts/build-property.mjs';
import {stagedArtifacts} from '../src/build.mjs';

const cli=fileURLToPath(new URL('../scripts/build-property.mjs', import.meta.url));
const property=fileURLToPath(new URL('./fixtures/property.json', import.meta.url));
const instant='2026-07-20T00:00:00.000Z';
function run(args) {return spawnSync(process.execPath, [cli, ...args], {encoding:'utf8'});}
function configuredProperty(root) {
  const value=JSON.parse(readFileSync(property,'utf8'));
  value.content={...value.content,root:fileURLToPath(new URL('./fixtures/content',import.meta.url))};
  const path=join(root,'property.json');writeFileSync(path,JSON.stringify(value));return path;
}

test('the original two-argument build invocation remains supported',()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-build-cli-'));
  try {
    const result=run([configuredProperty(root),join(root,'public')]);
    assert.equal(result.status,0,result.stderr);
    assert.ok(JSON.parse(result.stdout).publishedPostCount>0);
    const index=readFileSync(join(root,"public","index.html"),"utf8");
    assert.match(index,/data-property="koios-news"/u,"ad slot uses the campaign catalog property key");
    const advertising=readFileSync(join(root,"public","advertise","index.html"),"utf8");
    assert.match(advertising,/First-party contextual placements/u);
    assert.match(advertising,/<link rel="canonical" href="https:\/\/koios\.news\/advertise\/"/u);
    assert.match(advertising,/<meta name="description" content="See configured advertising channels and how to propose a contextual placement on Koios\.News, with independent editorial safeguards\."/u);
    assert.match(advertising,/https:\/\/561\.group\/contact\//u);
    assert.match(index,/<a href="\/advertise\/">Advertise<\/a>/u);
    const sitemap=readFileSync(join(root,"public","sitemap.xml"),"utf8");
    assert.match(sitemap,/https:\/\/koios\.news\/advertise\//u);
    const privacy=readFileSync(join(root,"public","privacy","index.html"),"utf8");
    assert.match(privacy,/configured ad server with the slot and page topic/u);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('the explicit build instant reaches the measured publication entrance byte-for-byte',async()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-build-cli-'));
  try {
    const output=join(root,'public'),expected=join(root,'expected'),config=configuredProperty(root);
    const result=run([config,output,'--as-of',instant]);
    assert.equal(result.status,0,result.stderr);
    await buildConfiguredPropertyWithMedia(config,expected,{asOf:new Date(instant)});
    const files=stagedArtifacts(expected).map(x=>x.file);
    assert.deepEqual(stagedArtifacts(output).map(x=>x.file),files);
    for(const file of files) assert.ok(readFileSync(join(output,file)).equals(readFileSync(join(expected,file))),file);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('missing, repeated, unknown and malformed time options are rejected before building',()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-build-cli-'));
  try {
    for(const flags of [
      ['--as-of'],['--as-of',instant,'--as-of',instant],['--unknown',instant],
      ['--as-of','2026-02-30T00:00:00.000Z'],['--as-of','2026-13-01T00:00:00.000Z'],
      ['--as-of','2026-07-20T24:00:00.000Z'],['--as-of','2026-07-20T00:00:00Z'],
      ['--as-of','2026-07-20T00:00:00.000+00:00'],['--as-of','not-a-date'],
    ]) {
      const result=run([property,join(root,'public'),...flags]);
      assert.equal(result.status,1,JSON.stringify(flags));
      assert.match(result.stderr,/usage:|--as-of/);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('advertising frames do not disclose the reader\'s article as referrer',()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-ad-privacy-'));
  try {
    const config=configuredProperty(root);
    const settings=JSON.parse(readFileSync(config,'utf8'));
    settings.monetization.aads={units:['12345','2382512'],header:'12345',footer:'12345',inArticle:['12345']};
    writeFileSync(config,JSON.stringify(settings));
    const result=run([config,join(root,'public'),'--as-of',instant]);
    assert.equal(result.status,0,result.stderr);
    const html=readFileSync(join(root,'public','index.html'),'utf8');
    assert.match(html,/data-aa="12345"/);
    assert.match(html,/referrerpolicy="no-referrer"/);
    assert.doesNotMatch(html,/referrerpolicy="strict-origin-when-cross-origin"/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('unassigned paid slots use the original house inventory without aborting the publication build',()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-partial-ads-'));
  try {
    const config=configuredProperty(root);
    const settings=JSON.parse(readFileSync(config,'utf8'));
    settings.monetization.aads={units:['12345','2382512'],footer:'12345'};
    writeFileSync(config,JSON.stringify(settings));
    const result=run([config,join(root,'public'),'--as-of',instant]);
    assert.equal(result.status,0,result.stderr);
    const html=readFileSync(join(root,'public','index.html'),'utf8');
    assert.match(html,/data-slot="header"[^>]+data-ad-server="https:\/\/ads\.561\.group"/u);
    assert.match(html,/data-aa="12345"/u);
    assert.match(html,/referrerpolicy="no-referrer"/u);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('an individually authorized article ad remains usable without a generic in-article unit',()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-article-ad-'));
  try {
    const config=configuredProperty(root);
    const settings=JSON.parse(readFileSync(config,'utf8'));
    settings.monetization.aads={
      units:['2382512'],
      verification:{slug:'hello-world',historicalArticleUnit:'2382512'}
    };
    writeFileSync(config,JSON.stringify(settings));
    const result=run([config,join(root,'public'),'--as-of',instant]);
    assert.equal(result.status,0,result.stderr);
    const original=readFileSync(join(root,'public','2025','02','15','hello-world','index.html'),'utf8');
    assert.match(original,/data-aa="2382512"/u);
    assert.match(original,/referrerpolicy="no-referrer"/u);
    const home=readFileSync(join(root,'public','index.html'),'utf8');
    assert.match(home,/data-slot="header"[^>]+data-ad-server="https:\/\/ads\.561\.group"/u);
  } finally {rmSync(root,{recursive:true,force:true});}
});
