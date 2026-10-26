
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const code="/home/emsenn/info/lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-operating-system-services-section/data/logs/computer-deployment-fabrication-logs/20261019-bcf-tagged-release/coordination/schema-family-208a22f7-v2/code-artifact-installed-modes-v1/native-shared-consumer-installation-v1/native-result/code/recipient";
const {planReleaseWave,releaseBumpAllowsChange}=await import(code+'/src/release-wave.mjs');
const {readRegistryPackage}=await import(code+'/src/registry.mjs');
const out="/home/emsenn/info/lib/emsenn/services/561-group/services/public-services-section/services/public-media-services-section/services/public-news-media-services-section/sites/koios.news/services/website/data/logs/application-release-receiving-logs/2026-10-21-published-owned-ci-v1";
const manifest=JSON.parse(fs.readFileSync(out+'/app-package.decoded'));
const originalConfig=JSON.parse(fs.readFileSync(out+'/release-config.decoded'));
const registry=await readRegistryPackage('https://registry.561.group/',manifest.name);
if(!registry.reachable||!registry.found||!registry.packument?.versions)throw new Error('original canonical version index unreceived');
fs.writeFileSync(out+'/actual-original-application-canonical-metadata-v2.json',JSON.stringify(registry,null,2)+'\n',{flag:'wx'});
const versions=new Set(Object.keys(registry.packument.versions));
const plan=planReleaseWave([{name:manifest.name,version:manifest.version,private:false,manifest}],[manifest.name],new Map([[manifest.name,versions]]));
fs.writeFileSync(out+'/original-code-selected-application-release-plan-v2.json',JSON.stringify({plan,fromPublished:versions.has(manifest.version),occupiedVersions:versions.size,patchAllowsChange:releaseBumpAllowsChange(manifest.version,'patch','nonbreaking'),source:'d0859ddd3d6cdfea593800570d6c6050d87c4bef',provider:'original qualified Code23'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({keys:Object.keys(registry),plan}));
