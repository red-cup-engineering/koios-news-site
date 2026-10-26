/**
 * Independent HTTP receiving assay for Koios.News public corrections.
 * Checks the actual reader response and JSON bytes against the live manifest.
 * It does not prove a reported correction is true or invent customer acceptance.
 */
import {createHash} from 'node:crypto';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const trustedDiagnostics=new WeakMap();
const fail = (reason,diagnostics) => {
  const error=new Error('CORRECTIONS_NOT_RECEIVED: '+reason);
  if(diagnostics!==undefined){
    for(const asset of Object.values(diagnostics.assets))Object.freeze(asset);
    Object.freeze(diagnostics.assets);
    Object.freeze(diagnostics.intakeMarkers);
    Object.freeze(diagnostics);
    Object.defineProperty(error,'diagnostics',{value:diagnostics,enumerable:true});
    trustedDiagnostics.set(error,diagnostics);
  }
  throw error;
};
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export async function verifyCorrectionsReceiving(origin,{fetcher=globalThis.fetch}={}) {
  // Provider-supplied or operator-pasted invalid origins can embed private tokens.
  // URL's own TypeError may repeat that input; emit only our original fixed refusal.
  let root;
  try { root=new URL(origin); }
  catch { fail('requires an HTTPS origin root'); }
  if(root.protocol!=='https:'||root.pathname!=='/'||root.search||root.hash||root.username||root.password)
    fail('requires an HTTPS origin root');
  const paths={'manifest.json':'/manifest.json','corrections.json':'/corrections.json',
    'corrections/index.html':'/corrections/'};
  const bytes={};
  for(const [file,path] of Object.entries(paths)){
    const url=new URL(path,root).href;
    let response;
    try {response=await fetcher(url,{cache:'no-store',redirect:'error',headers:{'cache-control':'no-cache'}});}
    catch {fail(path+' transport unavailable');}
    // Transport/provider errors may include confidential tokens, mail paths or
    // response fragments. Keep stage identity without echoing provider messages.
    let status,receivedUrl;
    try {status=response?.status;receivedUrl=response?.url;}
    catch {fail(path+' response metadata unavailable');}
    if(!Number.isInteger(status)||status<100||status>599)fail(path+' invalid HTTP status');
    if(status!==200)fail(path+' HTTP '+status);
    if(receivedUrl&&receivedUrl!==url)fail(path+' redirected unexpectedly');
    try {bytes[file]=Buffer.from(await response.arrayBuffer());}
    catch {fail(path+' body read unavailable');}
  }
  let manifest,register;
  try {manifest=JSON.parse(bytes['manifest.json'].toString('utf8'));}
  catch {fail('manifest is not JSON');}
  try {register=JSON.parse(bytes['corrections.json'].toString('utf8'));}
  catch {fail('corrections register is not JSON');}
  if(manifest?.kind!=='news-property.build-manifest/v1'||!Array.isArray(manifest.artifacts))
    fail('unrecognized manifest');
  if(register?.kind!=='producing-content.correction-register'||!Array.isArray(register.corrections))
    fail('unrecognized register');
  for(const file of ['corrections.json','corrections/index.html']){
    const matches=manifest.artifacts.filter(x=>x.file===file);
    if(matches.length!==1||!/^[a-f0-9]{64}$/.test(matches[0].sha256||''))
      fail(file+' is not uniquely sealed in manifest');
    if(sha256(bytes[file])!==matches[0].sha256)
      fail(file+' reader bytes differ from manifest');
  }
  const corrections=register.corrections;
  if(!Number.isInteger(register.correctionCount)||register.correctionCount!==corrections.length)
    fail('correctionCount does not match register');
  const slugs=new Set(),expected=[];
  for(const [index,row] of corrections.entries()){
    const slug=row?.article?.slug,title=row?.article?.title,date=row?.date,note=row?.note;
    if(typeof slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      ||typeof title!=='string'||!title.trim()||typeof note!=='string'||!note.trim()
      ||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)
      ||Number.isNaN(Date.parse(date+'T00:00:00Z'))
      ||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
      fail('invalid correction at index '+index);
    slugs.add(slug);
    expected.push('<li><time datetime="'+esc(date)+'">'+esc(date)+'</time>: <a href="/posts/'+slug+'/">'+esc(title)+'</a> — '+esc(note)+'</li>');
  }
  if(register.articleCount!==slugs.size)fail('articleCount does not match register');
  const html=bytes['corrections/index.html'].toString('utf8');
  const intakeMarkers={
    reportHeading:html.includes('id="report-an-error"'),
    mailtoRoute:html.includes('href="mailto:nik@koios.news?subject='),
    privacyWarning:html.includes('Please do not email sensitive personal information'),
    editorialBoundary:html.includes('email delivery and editorial acknowledgement are separate'),
  };
  if(Object.values(intakeMarkers).some(present=>!present))
    fail('reader intake missing or privacy boundary omitted',{
      assets:Object.fromEntries(Object.keys(paths).map(file=>[file,{
        sha256:sha256(bytes[file]),bytes:bytes[file].length,
      }])),
      intakeMarkers,
    });

  if(!html.includes('href="/corrections.json"')||!html.includes('id="published-corrections"'))
    fail('reader page lacks visible corrections heading or JSON link');
  if(expected.length===0){
    if(!html.includes('No corrections are listed')||
      !html.includes('not evidence that every article is error-free'))
      fail('empty register omits uncertainty disclosure');
  }else{
    const match=html.match(/<ol aria-labelledby="published-corrections">([\s\S]*?)<\/ol>/);
    if(!match)fail('visible corrections list missing');
    if((match[1].match(/<li>/g)||[]).length!==expected.length)
      fail('HTML and JSON correction counts differ');
    for(const entry of expected)if(!match[1].includes(entry))
      fail('HTML omitted or altered a correction');
  }
  return {received:true,publicSurfaceReceived:true,intakeLinkPublished:true,
    mailboxDelivery:'not-assayed',editorialAcknowledgement:'not-assayed',
    origin:root.origin,manifestSha256:sha256(bytes['manifest.json']),
    correctionCount:corrections.length,articleCount:slugs.size,verifiedAssets:2,
    scope:'independent HTTP/HTML/JSON/manifest receiving; not mail or editorial acceptance'};
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  try {console.log(JSON.stringify(await verifyCorrectionsReceiving(process.argv[2]||'https://koios.news/')));}
  catch(error){
    process.exitCode=1;
    console.error(error.message);
    const diagnostics=trustedDiagnostics.get(error);
    if(diagnostics!==undefined){
      try {console.error(JSON.stringify({diagnostics}));}
      catch { /* Optional diagnostics must not replace the original refusal. */ }
    }
  }
}
