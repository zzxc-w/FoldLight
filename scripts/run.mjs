// Direct Node entry point for environments whose npm script PATH omits Node.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const commands={dev:[['node_modules/vite/bin/vite.js','--host','127.0.0.1']],preview:[['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1']],build:[['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build']],test:[['node_modules/tsx/dist/cli.mjs','--test','tests/geometry.test.ts','tests/state.test.ts','tests/import-model.test.ts','tests/interaction.test.ts']],browser:[['tests/browser.mjs']]};
const task=process.argv[2]||'dev';if(!commands[task]){console.error('Usage: node scripts/run.mjs dev|build|preview|test|browser');process.exit(1);}
for(const args of commands[task]){
  const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[...args,...process.argv.slice(3)],{cwd:root,stdio:'inherit'});child.on('error',reject);child.on('exit',resolve);});
  if(exit!==0)process.exit(exit||1);
}
