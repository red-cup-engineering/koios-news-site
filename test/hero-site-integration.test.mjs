import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildProperty,buildPropertyWithMedia} from '../src/build.mjs';

const fixtures=join(dirname(fileURLToPath(import.meta.url)),'fixtures');
function withArticleHero({imageAlt,imageCredit},fn){
  const root=mkdtempSync(join(tmpdir(),'koios-hero-assurance-'));
  try{
    const contentDir=join(root,'content'),outputDir=join(root,'public');
    cpSync(join(fixtures,'content'),contentDir,{recursive:true});
    const postPath=join(contentDir,'posts','hello-world.md');
    const original=readFileSync(postPath,'utf8');
    mkdirSync(join(contentDir,'assets','images'),{recursive:true});
    cpSync(join(fixtures,'images','hero-fixture.png'),join(contentDir,'assets','images','supplied.png'));
    const fields=['image: "/assets/images/supplied.png"',...(imageAlt===undefined?[]:[`imageAlt: "${imageAlt}"`]),
      ...(imageCredit===undefined?[]:[`imageCredit: "${imageCredit}"`])];
    assert.ok(original.includes('section: "technology"'));
    writeFileSync(postPath,original.replace('section: "technology"', 'section: "technology"\n'+fields.join('\n')));
    const property=JSON.parse(readFileSync(join(fixtures,'property.json'),'utf8'));
    buildProperty({property,contentDir,outputDir,asOf:new Date('2026-07-20T00:00:00Z')});
    return fn({html:readFileSync(join(outputDir,'posts','hello-world','index.html'),'utf8'),outputDir});
  }finally{rmSync(root,{recursive:true,force:true})}
}
test('generic article hero is replaced at build time by existing deterministic art',()=>{
  withArticleHero({imageAlt:'Illustration for Hello World From Koios.News',imageCredit:'Credit for rejected image'},({html,outputDir})=>{
    assert.doesNotMatch(html,/alt="Illustration for Hello World From Koios.News"/);
    assert.match(html,/src="\/assets\/article-art\/hello-world.svg"/);
    assert.match(html,/Deterministic geometric article art/);
    assert.doesNotMatch(html,/Credit for rejected image/);
    assert.ok(existsSync(join(outputDir,'assets','article-art','hello-world.svg')));
  });
});

const articleGraph=html=>[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)]
  .flatMap(match=>[JSON.parse(match[1])].flat()).find(item=>item['@type']==='NewsArticle');
const meta=(html,key)=>html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];

async function withPreparedSite({hero=false,override=false,heroPath='/assets/images/supplied.png',publishedDate}={},receive){
  const root=mkdtempSync(join(tmpdir(),'koios-publication-media-'));
  try{
    const contentDir=join(root,'content'),outputDir=join(root,'public');
    cpSync(join(fixtures,'content'),contentDir,{recursive:true});
    const property=JSON.parse(readFileSync(join(fixtures,'property.json'),'utf8'));
    delete property.images.defaultOgImage;
    const sourcePath=join(contentDir,'posts','hello-world.md');
    if(hero){
      mkdirSync(join(contentDir,'assets','images'),{recursive:true});
      cpSync(join(fixtures,'images','hero-fixture.png'),join(contentDir,'assets','images','supplied.png'));
      writeFileSync(sourcePath,readFileSync(sourcePath,'utf8').replace('section: "technology"',
        'section: "technology"\nimage: '+JSON.stringify(heroPath)+'\nimageAlt: "A solid green test image"\nimageCredit: "Fixture author, CC BY"'));
    }
    if(publishedDate)writeFileSync(sourcePath,readFileSync(sourcePath,'utf8').replace(/^date: .*$/mu,`date: ${publishedDate}`));
    if(override){
      mkdirSync(join(contentDir,'assets','og'),{recursive:true});
      cpSync(join(fixtures,'content','assets','og','gate-audit-explainer.png'),join(contentDir,'assets','og','hello-world.png'));
    }
    const original=readFileSync(sourcePath);
    const result=await buildPropertyWithMedia({property,contentDir,outputDir,asOf:new Date('2026-07-20T00:00:00Z')});
    assert.deepEqual(readFileSync(sourcePath),original,'media preparation must not rewrite the admitted manuscript');
    await receive({root,property,contentDir,outputDir,result,
      html:readFileSync(join(outputDir,'posts','hello-world','index.html'),'utf8')});
  }finally{rmSync(root,{recursive:true,force:true})}
}

test('production build seals an informative card and shares it consistently without advertising a fingerprint as an image',async()=>{
  await withPreparedSite({},async({outputDir,html})=>{
    const image=meta(html,'og:image'),graph=articleGraph(html);
    assert.match(image,/^https:\/\/koios\.news\/assets\/og\/hello-world\.[a-f0-9]{16}\.png$/u);
    assert.equal(meta(html,'twitter:image'),image);
    assert.equal(meta(html,'og:image:width'),'1200');
    assert.equal(meta(html,'og:image:height'),'630');
    assert.match(meta(html,'og:image:alt'),/^Headline card: /u);
    assert.deepEqual(graph.image,[{'@type':'ImageObject',url:image,width:1200,height:630}]);
    const feed=JSON.parse(readFileSync(join(outputDir,'feed.json'),'utf8'));
    const item=feed.items.find(item=>item.url.endsWith('/posts/hello-world/'));
    assert.equal(item.image,image);
    assert.ok(item.content_html.includes(`<img src="${image}" alt="${meta(html,'og:image:alt')}" width="1200" height="630"`));
    assert.match(item.content_html,/<figcaption>Headline graphic; no documentary image accompanies this report\.<\/figcaption>/u);
    assert.ok(readFileSync(join(outputDir,'feed.xml'),'utf8').includes(image));
    assert.ok(readFileSync(join(outputDir,'feed.atom'),'utf8').includes(image));
    const relative=new URL(image).pathname.slice(1),bytes=readFileSync(join(outputDir,relative));
    const manifest=JSON.parse(readFileSync(join(outputDir,'manifest.json'),'utf8'));
    assert.equal(manifest.artifacts.find(asset=>asset.file===relative).sha256,
      createHash('sha256').update(bytes).digest('hex'));
    assert.ok(existsSync(join(outputDir,'fingerprints','hello-world.json')),'provenance remains available');
    assert.match(html,/Headline graphic; no documentary image accompanies this report\./u);
  });
});

test('actual credited hero bytes reach the sealed build, social metadata, and image schema with measured dimensions',async()=>{
  await withPreparedSite({hero:true},async({outputDir,contentDir,html})=>{
    const image='https://koios.news/assets/images/supplied.png';
    assert.deepEqual(readFileSync(join(outputDir,'assets/images/supplied.png')),
      readFileSync(join(contentDir,'assets/images/supplied.png')));
    assert.equal(meta(html,'og:image'),image);
    assert.equal(meta(html,'og:image:alt'),'A solid green test image');
    const entry=articleGraph(html).image[0];
    assert.equal(entry.url,image);assert.equal(entry.creditText,'Fixture author, CC BY');
    assert.equal(entry.width,40);assert.equal(entry.height,30);
    assert.ok(html.includes(`width="${entry.width}" height="${entry.height}" fetchpriority="high"`));
    assert.match(html,/<figcaption>Fixture author, CC BY<\/figcaption>/u);
    assert.doesNotMatch(html,/no documentary image accompanies/u);
    const feed=JSON.parse(readFileSync(join(outputDir,'feed.json'),'utf8'));
    const content=feed.items.find(item=>item.url.endsWith('/posts/hello-world/')).content_html;
    assert.ok(content.includes(`<img src="${image}" alt="A solid green test image" width="40" height="30"`));
    assert.match(content,/<figcaption>Fixture author, CC BY<\/figcaption>/u);
    assert.ok(readFileSync(join(outputDir,'feed.atom'),'utf8').includes(image));
  });
});

test('an existing per-article card is preserved as the explicit social-image selection',async()=>{
  await withPreparedSite({hero:true,override:true},async({outputDir,contentDir,html})=>{
    const image='https://koios.news/assets/og/hello-world.png';
    assert.equal(meta(html,'og:image'),image);
    assert.deepEqual(readFileSync(join(outputDir,'assets/og/hello-world.png')),
      readFileSync(join(contentDir,'assets/og/hello-world.png')));
    assert.deepEqual(articleGraph(html).image.map(item=>item.url),
      ['https://koios.news/assets/images/supplied.png',image]);
    const feed=JSON.parse(readFileSync(join(outputDir,'feed.json'),'utf8'));
    const content=feed.items.find(item=>item.url.endsWith('/posts/hello-world/')).content_html;
    assert.ok(content.includes(`<img src="${image}" alt="" width="1" height="1"`));
    assert.doesNotMatch(content,/Fixture author, CC BY|A solid green test image/u,'a different OG card must not inherit the hero credit or alternative');
    assert.ok(readFileSync(join(outputDir,'feed.atom'),'utf8').includes(image));
  });
});

test('a supplied relative asset resolves to the same published image on article and listing pages',async()=>{
  // The home page displays an image for its lead, so this synthetic item must be newest.
  await withPreparedSite({hero:true,heroPath:'assets/images/supplied.png',publishedDate:'2026-07-19'},async({html,outputDir})=>{
    const image=html.match(/<figure class="article-hero"><img src="([^"]+)"/u)?.[1];
    assert.equal(image,'/assets/images/supplied.png');
    assert.equal(new URL(image,'https://koios.news/posts/hello-world/').href,meta(html,'og:image'));
    assert.match(readFileSync(join(outputDir,'index.html'),'utf8'),/src="\/assets\/images\/supplied\.png"/u);
  });
});

test('supplied image is preserved with descriptive alt and its proper credit',()=>{
  withArticleHero({imageAlt:'A detailed photograph of a printed newsroom newspaper',imageCredit:'Rights holder, CC BY'},({html})=>{
    assert.match(html,/src="\/assets\/images\/supplied.png"/);
    assert.match(html,/alt="A detailed photograph of a printed newsroom newspaper"/);
    assert.match(html,/Rights holder, CC BY/);
  });
});
