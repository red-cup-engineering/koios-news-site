import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Original Red Cup Verdaccio provider declares these house namespaces private:
// red-cup-engineering/verdaccio-engineering-services-section
// content/config/cold-red-gate.yaml. Do not make npmjs a private fallback.
const HOUSE_SCOPES=Object.freeze([
  '@561-group','@causeway-services','@coesite-operations','@emsenn',
  '@emsweb','@harmonious-union','@koios-news','@lenticule-science',
  '@red-cup-engineering','@red-cup-science','@rsc-quiescent',
  '@turntide-islands','@union-officer-academy',
]);
const PUBLIC='https://registry.npmjs.org/';
const HOUSE='https://registry.561.group/';

function readConfig(source){
  const values=new Map();
  for(const line of source.split(/\r?\n/u)){
    const raw=line.trim();
    if(!raw||raw.startsWith('#'))continue;
    const equals=raw.indexOf('=');
    if(equals<1)throw new Error('invalid npmrc entry');
    const key=raw.slice(0,equals).trim(),value=raw.slice(equals+1).trim();
    if(values.has(key)||!value)throw new Error('duplicate or empty npmrc entry: '+key);
    values.set(key,value);
  }
  return values;
}
function receiveRoutes(content){
  const routes=readConfig(content);
  assert.equal(routes.get('registry'),PUBLIC,'public dependencies never depend on the house mirror');
  for(const scope of HOUSE_SCOPES)
    assert.equal(routes.get(scope+':registry'),HOUSE,scope+' must remain private');
  assert.equal(routes.size,HOUSE_SCOPES.length+1,'no unqualified third registry or scope');
  return routes;
}

test('public npm packages route directly; every original private house scope stays private',()=>{
  const source=readFileSync(new URL('../.npmrc',import.meta.url),'utf8');
  const routes=receiveRoutes(source);
  const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  // Published packages still go to the original canonical house registry.
  assert.equal(manifest.publishConfig.registry,HOUSE);
  for(const name of Object.keys(manifest.dependencies)){
    if(!name.startsWith('@'))continue;
    const scope=name.slice(0,name.indexOf('/'));
    if(HOUSE_SCOPES.includes(scope))
      assert.equal(routes.get(scope+':registry'),HOUSE,name+' private dependency cannot leak to npmjs');
  }
  // These two legacy unscoped house package names are deliberately not part
  // of this site's dependency closure; npmrc has no per-name registry key.
  for(const name of ['ephemeral-computer-machine-services-section',
    'persistent-computer-machine-services-section'])
    assert.equal(Object.hasOwn(manifest.dependencies,name),false);
});

test('reject accidental public fallback, private default and duplicate routing',()=>{
  const good=readFileSync(new URL('../.npmrc',import.meta.url),'utf8');
  assert.throws(()=>receiveRoutes(good.replace('registry='+PUBLIC,'registry='+HOUSE)),
    /public dependencies/u);
  assert.throws(()=>receiveRoutes(good.replace(
    '@red-cup-engineering:registry='+HOUSE,
    '@red-cup-engineering:registry='+PUBLIC)),/must remain private/u);
  assert.throws(()=>receiveRoutes(good+'registry='+PUBLIC+'\n'),
    /duplicate/u);
  assert.throws(()=>receiveRoutes(good+'@unauthorized:registry='+HOUSE+'\n'),
    /unqualified third registry/u);
});
