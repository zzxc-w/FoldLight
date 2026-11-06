import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
let publicDirectory = '';
function publicAssets(directory: string, prefix = ''): Array<{ path: string; content: Buffer }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = prefix + entry.name;
    return entry.isDirectory() ? publicAssets(join(directory, entry.name), path + '/') : [{ path, content: readFileSync(join(directory, entry.name)) }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}
export default defineConfig({
  base: './',
  plugins: [{
    name: 'foldlight-offline',
    configResolved(config) { publicDirectory = config.publicDir; },
    generateBundle(_options, bundle) {
      const assets = publicAssets(publicDirectory);
      const files = ['./', './index.html', ...assets.map(a=>'./'+a.path), ...Object.keys(bundle).filter(f=>!f.endsWith('.map')).map(f=>'./'+f)];
      const hash = createHash('sha256').update(JSON.stringify(Object.entries(bundle).map(([k,v])=>[k,v.type==='chunk'?v.code:v.source])));
      for (const asset of assets) hash.update(asset.path).update(asset.content);
      const version = hash.digest('hex').slice(0,12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const PREFIX='foldlight:'+encodeURIComponent(self.registration.scope)+':';
const CACHE=PREFIX+'${version}';
const ASSETS=${JSON.stringify([...new Set(files)])};
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request,{ignoreVary:true}).then(cached=>cached||fetch(event.request).catch(error=>{if(event.request.mode==='navigate')return cache.match('./index.html',{ignoreVary:true});throw error;}))));
});` });
    }
  }]
});
