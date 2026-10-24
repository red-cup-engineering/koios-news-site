import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyCorrectionsReceiving as verify} from '../scripts/verify-corrections-receiving.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const escapeHtml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const intake='<h2 id="report-an-error">Report an error or accessibility problem</h2>'+
  '<p>Readers can <a href="mailto:nik@koios.news?subject=Koios.News%20correction%20or%20accessibility%20report">email Koios.News</a> about a factual error or an accessibility barrier. Please do not email sensitive personal information; email delivery and editorial acknowledgement are separate.</p>';
const correction = {article:{slug:'public-report',title:'A <public> & report'},date:'2026-10-10',
  note:'Corrected <claim> & citation.'};

function fixture({rows=[correction],html,registerPatch={},manifestPatch={},statuses={},redirect,omitIntake=false,intakeHtml=intake}={}){
  const register={kind:'producing-content.correction-register',correctionCount:rows.length,
    articleCount:new Set(rows.map(x=>x.article.slug)).size,corrections:rows,...registerPatch};
  const entries=rows.map(x=>'<li><time datetime="'+x.date+'">'+x.date+'</time>: <a href="/posts/'+x.article.slug+'/">'+
    escapeHtml(x.article.title)+'</a> — '+escapeHtml(x.note)+'</li>').join('');
  let page=html??('<h2 id="published-corrections">Published corrections</h2>'+
    '<p><a href="/corrections.json">JSON</a></p>'+
    (rows.length?'<ol aria-labelledby="published-corrections">'+entries+'</ol>':
    '<p>No corrections are listed in this publication record. This is not evidence that every article is error-free.</p>'));
  page=(omitIntake?'':intakeHtml)+page;
  const json=JSON.stringify(register);
  const manifest=JSON.stringify({kind:'news-property.build-manifest/v1',artifacts:[
    {file:'corrections.json',sha256:hash(json)},{file:'corrections/index.html',sha256:hash(page)}],...manifestPatch});
  const files={'/manifest.json':manifest,'/corrections.json':json,'/corrections/':page};
  return async url=>{
    const path=new URL(url).pathname;
    return {status:statuses[path]??(path in files?200:404),
      ...(redirect&&path==='/corrections/'?{url:'https://wrong.example/'}:{}),
      arrayBuffer:async()=>Buffer.from(files[path]||'')};
  };
}
async function fails(fetcher,pattern){
  await assert.rejects(()=>verify('https://koios.news/',{fetcher}),new RegExp(pattern));
}
test('independent reader + JSON and sealed manifest agree',async()=>{
  const r=await verify('https://koios.news/',{fetcher:fixture()});
  assert.equal(r.received,true);assert.equal(r.intakeLinkPublished,true);
  assert.equal(r.mailboxDelivery,'not-assayed');assert.equal(r.editorialAcknowledgement,'not-assayed');
  assert.equal(r.correctionCount,1);assert.equal(r.verifiedAssets,2);
});
test('empty register is allowed only with uncertainty notice',async()=>{
  const r=await verify('https://koios.news/',{fetcher:fixture({rows:[]})});
  assert.equal(r.correctionCount,0);
});
test('HTTP 404 on public HTML cannot be treated as an empty register',async()=>{
  await fails(fixture({statuses:{'/corrections/':404}}),'HTTP 404');
});
test('obsolete cached reader markup is rejected even when HTTP 200',async()=>{
  const fetcher=fixture(), obsolete='<h2>Old register</h2>';
  await fails(async url=>{
    const response=await fetcher(url);
    return new URL(url).pathname==='/corrections/'?
      {...response,arrayBuffer:async()=>Buffer.from(obsolete)}:response;
  },'reader bytes differ');
});
test('tampered JSON is rejected against the manifest',async()=>{
  const fetcher=fixture();
  await fails(async url=>{
    const response=await fetcher(url);
    return new URL(url).pathname==='/corrections.json'?
      {...response,arrayBuffer:async()=>Buffer.from((await response.arrayBuffer()).toString().replace('Corrected <claim> & citation.','Tampered correction'))}:response;
  },'reader bytes differ');
});
test('HTML omitting the admitted correction fails despite consistent digest',async()=>{
  await fails(fixture({html:'<h2 id="published-corrections">Published corrections</h2><a href="/corrections.json">JSON</a><ol aria-labelledby="published-corrections"></ol>'}),'counts differ');
});
test('an empty register cannot imply error-free articles',async()=>{
  await fails(fixture({rows:[],html:'<h2 id="published-corrections">Published corrections</h2><a href="/corrections.json">JSON</a><p>No mistakes ever.</p>'}),'uncertainty disclosure');
});
test('inconsistent correctionCount fails',async()=>{
  await fails(fixture({registerPatch:{correctionCount:2}}),'correctionCount');
});
test('fabricated calendar day fails',async()=>{
  await fails(fixture({rows:[{...correction,date:'2026-02-30'}]}),'invalid correction');
});
test('redirected reader route fails',async()=>{
  await fails(fixture({redirect:true}),'redirected');
});
test('HTTP origins are rejected',async()=>{
  await assert.rejects(()=>verify('http://koios.news/'),/HTTPS origin/);
});

test('public reader missing correction intake refuses even with matching manifest',async()=>{
  await fails(fixture({omitIntake:true}),'reader intake missing');
});

const markerText={
  reportHeading:'id="report-an-error"',
  mailtoRoute:'href="mailto:nik@koios.news?subject=',
  privacyWarning:'Please do not email sensitive personal information',
  editorialBoundary:'email delivery and editorial acknowledgement are separate',
};
for(const [missing,text] of Object.entries(markerText)){
  test('intake refusal reports only sealed digests, byte lengths and marker booleans: '+missing,async()=>{
    const secret='PRIVATE_BODY_SENTINEL_73';
    const inner=fixture({intakeHtml:intake.replace(text,'omitted')+secret});
    const assets={},requests=[];
    const fetcher=async(url,options)=>{
      requests.push({url,options});
      const response=await inner(url),body=await response.arrayBuffer();
      const file=new URL(url).pathname.slice(1)||'';
      assets[file==='corrections/'?'corrections/index.html':file]={sha256:hash(body),bytes:body.length};
      return response;
    };
    await assert.rejects(()=>verify('https://koios.news/',{fetcher}),error=>{
      assert.equal(error.constructor,Error);
      assert.equal(error.message,'CORRECTIONS_NOT_RECEIVED: reader intake missing or privacy boundary omitted');
      assert.deepEqual(error.diagnostics,{assets,intakeMarkers:Object.fromEntries(
        Object.keys(markerText).map(key=>[key,key!==missing]))});
      assert.equal(JSON.stringify(error.diagnostics).includes(secret),false);
      assert.equal(JSON.stringify(error.diagnostics).includes('https://'),false);
      assert.ok(Object.isFrozen(error.diagnostics));
      assert.ok(Object.isFrozen(error.diagnostics.assets));
      assert.ok(Object.isFrozen(error.diagnostics.intakeMarkers));
      for(const asset of Object.values(error.diagnostics.assets))assert.ok(Object.isFrozen(asset));
      assert.throws(()=>{error.diagnostics.intakeMarkers[missing]=true;},TypeError);
      assert.throws(()=>{error.diagnostics.assets['manifest.json'].sha256='changed';},TypeError);
      assert.throws(()=>{error.diagnostics={secret};},TypeError);
      return true;
    });
    assert.deepEqual(requests.map(row=>new URL(row.url).pathname),['/manifest.json','/corrections.json','/corrections/']);
    for(const {options} of requests)assert.deepEqual(options,{cache:'no-store',redirect:'error',headers:{'cache-control':'no-cache'}});
  });
}
test('success result remains free of failure diagnostics',async()=>{
  const result=await verify('https://koios.news/',{fetcher:fixture()});
  assert.deepEqual(Object.keys(result),['received','publicSurfaceReceived','intakeLinkPublished',
    'mailboxDelivery','editorialAcknowledgement','origin','manifestSha256','correctionCount',
    'articleCount','verifiedAssets','scope']);
});
test('earlier HTTP refusal does not attach intake diagnostics',async()=>{
  await assert.rejects(()=>verify('https://koios.news/',{fetcher:fixture({statuses:{'/corrections/':404}})}),error=>{
    assert.equal(error.message,'CORRECTIONS_NOT_RECEIVED: /corrections/ HTTP 404');
    assert.equal(Object.hasOwn(error,'diagnostics'),false);return true;
  });
});
test('CLI preserves exit 1 and error text while emitting only allowlisted diagnostics',async()=>{
  const files={},inner=fixture({omitIntake:true});
  for(const path of ['/manifest.json','/corrections.json','/corrections/'])
    files[path]=(await (await inner('https://koios.news'+path)).arrayBuffer()).toString('base64');
  const script=new URL('../scripts/verify-corrections-receiving.mjs',import.meta.url);
  const program=`process.argv[1]=${JSON.stringify(fileURLToPath(script))};
    const files=${JSON.stringify(files)};
    globalThis.fetch=async url=>({status:200,url,arrayBuffer:async()=>Buffer.from(files[new URL(url).pathname],'base64')});
    await import(${JSON.stringify(script.href)});`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:5000});
  assert.equal(run.error,undefined);assert.equal(run.status,1);assert.equal(run.stdout,'');
  const lines=run.stderr.trim().split('\n');assert.equal(lines.length,2);
  assert.equal(lines[0],'CORRECTIONS_NOT_RECEIVED: reader intake missing or privacy boundary omitted');
  const expectedAssets=Object.fromEntries(Object.entries(files).map(([path,encoded])=>{
    const body=Buffer.from(encoded,'base64');
    return [path==='/corrections/'?'corrections/index.html':path.slice(1),{sha256:hash(body),bytes:body.length}];
  }));
  assert.deepEqual(JSON.parse(lines[1]),{diagnostics:{assets:expectedAssets,
    intakeMarkers:Object.fromEntries(Object.keys(markerText).map(key=>[key,false]))}});
});

for(const payload of ['data','getter']){
test('CLI ignores arbitrary provider diagnostics without reading them: '+payload,()=>{
  const script=new URL('../scripts/verify-corrections-receiving.mjs',import.meta.url);
  const program=`process.argv[1]=${JSON.stringify(fileURLToPath(script))};
    globalThis.fetch=async()=>({get status(){
      const error=new Error('provider status failure');
      ${payload==='data' ? "error.diagnostics={body:'PRIVATE_DIAGNOSTIC_SENTINEL'};" : "Object.defineProperty(error,'diagnostics',{get(){throw new Error('PRIVATE_DIAGNOSTIC_SENTINEL');}});"}
      throw error;
    }});
    await import(${JSON.stringify(script.href)});`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:5000});
  assert.equal(run.error,undefined);assert.equal(run.status,1);assert.equal(run.stdout,'');
  assert.equal(run.stderr,'CORRECTIONS_NOT_RECEIVED: /manifest.json response metadata unavailable\n');
});
}

for(const failure of ['serialization','output']){
  test('CLI preserves original refusal and exit 1 when diagnostic '+failure+' fails',async()=>{
    const files={},inner=fixture({omitIntake:true});
    for(const path of ['/manifest.json','/corrections.json','/corrections/'])
      files[path]=(await (await inner('https://koios.news'+path)).arrayBuffer()).toString('base64');
    const script=new URL('../scripts/verify-corrections-receiving.mjs',import.meta.url);
    const program=`process.argv[1]=${JSON.stringify(fileURLToPath(script))};
      const files=${JSON.stringify(files)};
      globalThis.fetch=async url=>({status:200,url,arrayBuffer:async()=>Buffer.from(files[new URL(url).pathname],'base64')});
      const originalError=console.error;
      console.error=(...args)=>{
        originalError(...args);
        ${failure==='serialization' ? "JSON.stringify=()=>{throw new Error('PRIVATE_EMISSION_FAILURE');};" : "console.error=()=>{throw new Error('PRIVATE_EMISSION_FAILURE');};"}
      };
      await import(${JSON.stringify(script.href)});`;
    const run=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:5000});
    assert.equal(run.error,undefined);assert.equal(run.status,1);assert.equal(run.stdout,'');
    assert.equal(run.stderr,'CORRECTIONS_NOT_RECEIVED: reader intake missing or privacy boundary omitted\n');
  });
}


// A genuine receiving failure may carry private transport tokens, mailbox paths
// or partial pages in its exception. Neither the API nor CLI may copy it.
for (const stage of ["transport", "status", "url", "body"]) {
  test("independent corrections receiver keeps provider exceptions private: " + stage, async () => {
    const sentinel = "PRIVATE_PROVIDER_CONTENT_DO_NOT_PUBLISH";
    const ordinary = fixture();
    const fetcher = async requestedUrl => {
      const response = await ordinary(requestedUrl);
      if (new URL(requestedUrl).pathname !== "/manifest.json") return response;
      if (stage === "transport") throw new Error(sentinel);
      if (stage === "status") return {
        ...response, get status() { throw new Error(sentinel); },
      };
      if (stage === "url") return {
        ...response, get url() { throw new Error(sentinel); },
      };
      return {
        ...response, arrayBuffer: async () => { throw new Error(sentinel); },
      };
    };
    const expected = stage === "transport"
      ? "CORRECTIONS_NOT_RECEIVED: /manifest.json transport unavailable"
      : stage === "body"
        ? "CORRECTIONS_NOT_RECEIVED: /manifest.json body read unavailable"
        : "CORRECTIONS_NOT_RECEIVED: /manifest.json response metadata unavailable";
    await assert.rejects(
      () => verify("https://koios.news/", { fetcher }),
      error => {
        assert.equal(error.message, expected);
        assert.equal(Object.hasOwn(error, "diagnostics"), false);
        assert.equal(JSON.stringify(error).includes(sentinel), false);
        return true;
      },
    );
  });
}

test('malformed origin without disclosing private token or touching network',async()=>{
  const sentinel='PRIVATE_PROVIDER_CONTENT_DO_NOT_PUBLISH';
  let fetches=0;
  const fetcher=async()=>{ fetches++; throw new Error('network should be unused'); };
  for(const origin of ['https://['+sentinel+'/',{toString(){throw new Error(sentinel);}}]){
    await assert.rejects(()=>verify(origin,{fetcher}),error=>{
      assert.equal(error.message,'CORRECTIONS_NOT_RECEIVED: requires an HTTPS origin root');
      assert.equal(error.message.includes(sentinel),false);
      assert.equal(Object.hasOwn(error,'diagnostics'),false);
      return true;
    });
  }
  assert.equal(fetches,0);
});

test('CLI malformed origin preserves fixed refusal without echoing supplied URL',()=>{
  const sentinel='PRIVATE_PROVIDER_CONTENT_DO_NOT_PUBLISH';
  const script=new URL('../scripts/verify-corrections-receiving.mjs',import.meta.url);
  const program=`process.argv[1]=${JSON.stringify(fileURLToPath(script))};
    process.argv[2]=${JSON.stringify('https://['+sentinel+'/')};
    globalThis.fetch=async()=>{throw new Error('unexpected network call');};
    await import(${JSON.stringify(script.href)});`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:5000});
  assert.equal(run.error,undefined);
  assert.equal(run.status,1);
  assert.equal(run.stdout,'');
  assert.equal(run.stderr,'CORRECTIONS_NOT_RECEIVED: requires an HTTPS origin root\n');
  assert.equal(run.stderr.includes(sentinel),false);
});
