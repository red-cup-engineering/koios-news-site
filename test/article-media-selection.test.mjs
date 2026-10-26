import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {readPublicationImage,selectPublicationImages,prepareArticleMedia,renderOgCard} from '../src/images.mjs';

const fixture=fileURLToPath(new URL('./fixtures/images/hero-fixture.png',import.meta.url));
const property={name:'Koios.News',origin:'https://koios.news'};
const post={slug:'evidence-and-story',title:'How evidence connects a source and a story',sourceDigest:'a'.repeat(64)};

test('the original compositor provides an informative, deterministic measured card without changing input assets',async()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-original-card-'));
  try{
    const first=(await prepareArticleMedia({posts:[post],property,contentRoot:root,palette:{accent:'#000088'}})).get(post.slug);
    const second=(await prepareArticleMedia({posts:[post],property,contentRoot:root,palette:{accent:'#000088'}})).get(post.slug);
    assert.deepEqual(first.social.bytes,second.social.bytes);
    assert.equal(first.social.alt,`Headline card: ${post.title}`);
    const metadata=await sharp(first.social.bytes).metadata();
    assert.equal(metadata.format,'png');assert.equal(metadata.width,1200);assert.equal(metadata.height,630);
    assert.match(first.social.path,/^assets\/og\/evidence-and-story\.[a-f0-9]{16}\.png$/u);
    assert.deepEqual(readdirSync(root),[],'the admitted content root remains unchanged');
    const changed=await renderOgCard({headline:'A different story',propertyName:property.name});
    assert.notDeepEqual(first.social.bytes,changed.buffer);
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('an actual hero is measured from the selected bytes and takes priority over the property default',async()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-actual-hero-'));
  try{
    mkdirSync(join(root,'assets/images'),{recursive:true});
    cpSync(fixture,join(root,'assets/images/photo.png'));
    const article={...post,image:'/assets/images/photo.png'};
    const prepared=(await prepareArticleMedia({posts:[article],property:{...property,images:{defaultOgImage:'/assets/missing-default.png'}},contentRoot:root})).get(post.slug);
    assert.equal(prepared.social.url,'https://koios.news/assets/images/photo.png');
    assert.equal(prepared.hero.width,40);assert.equal(prepared.hero.height,30);
    assert.deepEqual(prepared.social.bytes,readFileSync(fixture));
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('an admitted per-article card overrides the hero without changing either original',async()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-card-override-'));
  try{
    mkdirSync(join(root,'assets/images'),{recursive:true});mkdirSync(join(root,'assets/og'),{recursive:true});
    cpSync(fixture,join(root,'assets/images/photo.png'));cpSync(fixture,join(root,'assets/og',post.slug+'.png'));
    const article={...post,image:'/assets/images/photo.png'};
    const prepared=(await prepareArticleMedia({posts:[article],property,contentRoot:root})).get(post.slug);
    assert.equal(prepared.social.url,`https://koios.news/assets/og/${post.slug}.png`);
    assert.deepEqual(prepared.social.bytes,readFileSync(fixture));
    assert.equal(prepared.social.width,40);assert.equal(prepared.social.height,30);
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('measured dimensions follow the displayed EXIF orientation while preserving original photographic bytes',async()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-oriented-image-'));
  try{
    mkdirSync(join(root,'assets/images'),{recursive:true});
    const bytes=await sharp(fixture).jpeg().withMetadata({orientation:6}).toBuffer();
    writeFileSync(join(root,'assets/images/portrait.jpg'),bytes);
    const article={...post,image:'/assets/images/portrait.jpg'};
    const prepared=(await prepareArticleMedia({posts:[article],property,contentRoot:root})).get(post.slug);
    assert.equal(prepared.hero.width,30);assert.equal(prepared.hero.height,40);
    assert.deepEqual(prepared.hero.bytes,bytes);
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('mislabelled and unreadable raster assets cannot be advertised with invented dimensions',async()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-raster-format-'));
  try{
    mkdirSync(join(root,'assets/images'),{recursive:true});
    cpSync(fixture,join(root,'assets/images/mislabelled.jpg'));
    writeFileSync(join(root,'assets/images/broken.png'),'This is not an image.');
    for(const name of ['mislabelled.jpg','broken.png']){
      await assert.rejects(()=>prepareArticleMedia({posts:[{...post,image:`/assets/images/${name}`}],property,contentRoot:root}));
    }
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('private, remote, encoded, and escaped media URLs cannot become public image assets',()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-media-boundary-'));
  try{
    mkdirSync(join(root,'assets'),{recursive:true});mkdirSync(join(root,'private'),{recursive:true});
    cpSync(fixture,join(root,'assets/a.png'));cpSync(fixture,join(root,'private.png'));cpSync(fixture,join(root,'private/a.png'));
    assert.deepEqual(readPublicationImage('/assets/a.png',{origin:property.origin,contentRoot:root}).bytes,readFileSync(fixture));
    for(const value of ['https://127.0.0.1/assets/a.png','https://elsewhere.example/assets/a.png',
      'https://private:secret@koios.news/assets/a.png','/assets/a.png?token=private','/assets/a.png#fragment','/assets/../private.png',
      '/assets/%2e%2e/private.png','file:///private.png','data:image/png;base64,a','/private/a.png','/assets/missing.png']){
      assert.throws(()=>readPublicationImage(value,{origin:property.origin,contentRoot:root}),
        /same-origin raster asset inside \/assets\//);
    }
    const content=join(root,'content');mkdirSync(join(content,'assets'),{recursive:true});
    cpSync(fixture,join(root,'outside.png'));symlinkSync(join(root,'outside.png'),join(content,'assets','leak.png'));
    assert.throws(()=>readPublicationImage('/assets/leak.png',{origin:property.origin,contentRoot:content}),/same-origin raster asset/);
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('prepared media refuses changed manuscript or asset bytes before the renderer can seal them',async()=>{
  const root=mkdtempSync(join(tmpdir(),'koios-media-revision-'));
  try{
    mkdirSync(join(root,'assets/images'),{recursive:true});
    const path=join(root,'assets/images/supplied.png');cpSync(fixture,path);
    const article={...post,image:'/assets/images/supplied.png'};
    const prepared=(await prepareArticleMedia({posts:[article],property,contentRoot:root})).get(post.slug);
    assert.throws(()=>selectPublicationImages({post:{...article,sourceDigest:'b'.repeat(64)},property,contentRoot:root,prepared}),/inputs changed/);
    writeFileSync(path,Buffer.concat([readFileSync(path),Buffer.from('changed')]));
    assert.throws(()=>selectPublicationImages({post:article,property,contentRoot:root,prepared}),/inputs changed/);
  }finally{rmSync(root,{recursive:true,force:true})}
});
