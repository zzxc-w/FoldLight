import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { objFixture, stlFixture, glbFixture, gltfFixtures, remoteGltfFixture, invalidFixture } from './import-fixtures.mjs';
const url=process.env.TEST_URL||'http://127.0.0.1:5173/';
const out=new URL('../test-results/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const errors=[],checks=[];
const recordConsole=message=>{const text=message.text();if(message.type()==='error'||/INVALID_OPERATION|vertex buffer.*(?:too small|not big enough)/i.test(text))errors.push(text);};
const check=(name,fn)=>fn().then(()=>{checks.push(name);console.log(`PASS ${name}`);});
const hash=b=>createHash('sha256').update(b).digest('hex');
const direction=s=>s.camera.map((v,i)=>v-s.target[i]);
const near=(a,b,epsilon=1e-5)=>a.every((v,i)=>Math.abs(v-b[i])<epsilon);
async function openPanel(page,id){await page.locator(`${id}>summary`).evaluate(el=>el.parentElement.open=true);}
async function revealControl(page,selector){await page.locator(selector).evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});}
async function uploadModel(page,files){
  await page.locator('#import-open').click();await page.locator('#model-files').setInputFiles(files);await page.locator('#import-submit').click();
  await page.waitForFunction(()=>window.foldlightDiagnostics().settings.model==='imported'&&!document.querySelector('#import-dialog').open);
  await page.waitForTimeout(100);
}
// PNG screenshots/exports use 8-bit RGB/RGBA. Decode filter rows to inspect real alpha.
function pngPixels(png){
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),channels=png[25]===6?4:3;
  assert.equal(png[24],8,'8-bit PNG expected');assert.ok([2,6].includes(png[25]));
  const blocks=[];for(let o=8;o<png.length;){const length=png.readUInt32BE(o),type=png.toString('ascii',o+4,o+8);if(type==='IDAT')blocks.push(png.subarray(o+8,o+8+length));o+=length+12;}
  const raw=inflateSync(Buffer.concat(blocks)),stride=width*channels,pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const a=x>=channels?pixels[y*stride+x-channels]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;const add=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+add)&255;}}
  return{width,height,channels,pixels};
}
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',recordConsole);
  await page.goto(url);await page.waitForFunction(()=>window.foldlightDiagnostics);await page.waitForTimeout(600);
  const state=()=>page.evaluate(()=>window.foldlightDiagnostics());
  const shot=()=>page.locator('#viewport>canvas').screenshot();
  await check('light/dark/device theme overrides persist and follow device changes',async()=>{
    const resolvedTheme=expected=>page.waitForFunction(value=>document.documentElement.dataset.theme===value,expected);
    await openPanel(page,'#scene-panel');await page.emulateMedia({colorScheme:'light'});
    await page.locator('#theme-select').selectOption('system');await resolvedTheme('light');
    await page.emulateMedia({colorScheme:'dark'});await resolvedTheme('dark');
    await page.locator('#theme-select').selectOption('light');await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.waitForTimeout(200);
    await page.screenshot({path:new URL('light-theme.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    await page.locator('#theme-select').selectOption('dark');await page.reload();await page.waitForFunction(()=>window.foldlightDiagnostics);assert.equal((await state()).settings.theme,'dark');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await openPanel(page,'#scene-panel');await page.locator('#theme-select').selectOption('dark');await page.emulateMedia({colorScheme:'light'});assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.locator('#theme-select').selectOption('system');await resolvedTheme('light');await page.emulateMedia({colorScheme:'dark'});await resolvedTheme('dark');
  });
  await page.screenshot({path:new URL('desktop.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
  await check('all fold presets produce distinct visible renderings',async()=>{
    const shots=new Set();
    for(const type of ['pipe','zigzag','spiral','diaper','tension']){
      await page.locator(`[data-model="${type}"]`).click();await page.waitForTimeout(150);
      assert.equal((await state()).settings.model,type);shots.add(hash(await shot()));
      await page.screenshot({path:new URL(`fold-${type}.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    }
    assert.equal(shots.size,5);
  });
  await check('fold controls change rendered surface',async()=>{
    const before=hash(await shot());
    await page.locator('#depth').fill('0.6');await page.waitForTimeout(150);
    assert.equal((await state()).settings.depth,0.6);assert.notEqual(hash(await shot()),before);
  });
  await check('detailed shirt geometry waits during input and updates on slider release',async()=>{
    await page.locator('#model-select').selectOption('shirt');await page.waitForTimeout(150);
    const before=(await state()).memory.triangles;
    const during=await page.locator('#depth').evaluate(el=>{el.value='0.61';el.dispatchEvent(new Event('input',{bubbles:true}));return window.foldlightDiagnostics().memory.triangles;});
    assert.equal(during,before,'Input leaves the existing surface responsive while dragging');
    await page.locator('#depth').dispatchEvent('change');
    await page.waitForFunction(previous=>window.foldlightDiagnostics().memory.triangles!==previous,before);
    assert.equal((await state()).settings.depth,0.61);
    await page.locator('#depth').fill('0.23');await page.locator('#model-select').selectOption('diaper');
  });
  await check('lighting updates shading without allocating geometry',async()=>{
    const before=hash(await shot()),memory=(await state()).memory.geometries;
    await page.locator('#azimuth').fill('75');await page.waitForTimeout(100);
    assert.notEqual(hash(await shot()),before);assert.equal((await state()).memory.geometries,memory);
  });
  await check('cel bands and threshold are adjustable; normals and facing modes render',async()=>{
    await page.locator('[data-model="diaper"]').click();await page.locator('[data-mode="cel"]').click();
    await page.locator('#bands').fill('2');const two=hash(await shot());
    await page.locator('#bands').fill('5');assert.notEqual(hash(await shot()),two);
    const before=hash(await shot());await page.locator('#threshold').fill('0.8');assert.notEqual(hash(await shot()),before);
    await page.screenshot({path:new URL('cel.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    await page.locator('[data-mode="normal"]').click();assert.notEqual(hash(await shot()),two);
    await page.screenshot({path:new URL('normals.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    await page.locator('[data-key="facing"]').check();await page.waitForTimeout(100);
    await page.screenshot({path:new URL('facing.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    await page.locator('[data-key="facing"]').uncheck();await page.locator('[data-mode="clay"]').click();
  });
  await check('camera orbit, wheel zoom, pan, views, and projection work',async()=>{
    const r=await page.locator('#viewport').boundingBox(),x=r.x+r.width*.6,y=r.y+r.height*.43;
    const initial=await state();await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+50,{steps:12});await page.mouse.up();await page.waitForTimeout(400);
    assert.notDeepEqual((await state()).camera,initial.camera);
    const before=await state();await page.mouse.wheel(0,-300);await page.waitForTimeout(400);assert.notDeepEqual((await state()).camera,before.camera);
    const target=(await state()).target;await page.mouse.down({button:'right'});await page.mouse.move(x+60,y,{steps:8});await page.mouse.up({button:'right'});await page.waitForTimeout(350);assert.notDeepEqual((await state()).target,target);
    for(const view of ['front','side','back','quarter']){await page.locator(`[data-view="${view}"]`).click();await page.waitForTimeout(100);}
    await page.locator('#projection').click();assert.equal((await state()).projection,'OrthographicCamera');await page.locator('#projection').click();assert.equal((await state()).projection,'PerspectiveCamera');
  });
  await check('pan tool moves in screen space; reset settles and projection preserves scale',async()=>{
    await page.locator('#camera-reset').click();await page.locator('[data-nav="pan"]').click();
    const r=await page.locator('#viewport').boundingBox(),x=r.x+r.width*.62,y=r.y+r.height*.45;
    const before=await state();await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+75,y+35,{steps:8});await page.mouse.up();await page.waitForTimeout(250);
    const after=await state();assert.notDeepEqual(after.target,before.target);assert.ok(near(direction(before),direction(after),0.02),'Pan retains viewing direction');
    await page.locator('.move-controls>summary').click();const nudged=(await state()).target;await page.locator('[data-pan="left"]').click();assert.notDeepEqual((await state()).target,nudged);
    const distant=await state();await page.locator('#zoom-in').click();assert.ok(Math.hypot(...direction(await state()))<Math.hypot(...direction(distant)));await page.locator('#zoom-out').click();
    await page.locator('[data-nav="orbit"]').click();await page.locator('#camera-reset').click();const reset=await state();await page.waitForTimeout(350);assert.ok(near((await state()).camera,reset.camera),'Reset has no residual drift');
    const perspective=await state();await page.locator('#projection').click();await page.locator('#projection').click();assert.ok(near((await state()).camera,perspective.camera,0.02),'Projection round-trip preserves framing');
  });
  await check('anime mode adds controllable highlights and rim; values mode remains usable',async()=>{
    await page.locator('#model-select').selectOption('head');await page.locator('[data-mode="cel"]').click();const cel=hash(await shot());
    await page.locator('[data-mode="anime"]').click();await openPanel(page,'#appearance-panel');assert.notEqual(hash(await shot()),cel);
    await page.locator('#animeRim').fill('0');await page.locator('#animeHighlight').fill('0');const matte=hash(await shot());
    await page.locator('#animeRim').fill('1');await page.locator('#animeHighlight').fill('1');assert.notEqual(hash(await shot()),matte);
    await page.screenshot({path:new URL('anime-head.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    await page.locator('[data-key="values"]').check();assert.notEqual(hash(await shot()),matte);await page.locator('[data-key="values"]').uncheck();
    await page.locator('[data-mode="clay"]').click();await page.locator('#model-select').selectOption('diaper');
  });
  await check('pointer light gizmo updates azimuth/elevation',async()=>{
    const before=(await state()).settings,g=await page.locator('#light-gizmo').boundingBox();
    await page.mouse.move(g.x+g.width/2,g.y+g.height/2);await page.mouse.down();await page.mouse.move(g.x+g.width/2+60,g.y+g.height/2-30,{steps:10});await page.mouse.up();
    const after=(await state()).settings;assert.notEqual(after.azimuth,before.azimuth);assert.notEqual(after.elevation,before.elevation);
  });
  await check('light dragging is camera-relative without a grab jump or camera movement',async()=>{
    for(const view of ['front','back','side']){
      await page.locator(`[data-view="${view}"]`).click();await page.waitForTimeout(100);
      const before=await state(),g=await page.locator('#light-gizmo').boundingBox(),x=g.x+g.width/2,y=g.y+g.height/2;
      await page.mouse.move(x,y);await page.mouse.down();assert.match(await page.locator('#light-gizmo').getAttribute('class'),/dragging/);const grab=await state();assert.equal(grab.settings.azimuth,before.settings.azimuth);assert.equal(grab.settings.elevation,before.settings.elevation);
      await page.mouse.move(x+25,y-15,{steps:8});await page.mouse.up();const after=await state();assert.ok(near(after.camera,before.camera));assert.ok(near(after.target,before.target));assert.ok(after.settings.elevation>=5&&after.settings.elevation<=85);assert.ok(after.settings.azimuth>=-180&&after.settings.azimuth<180);assert.notDeepEqual([after.settings.azimuth,after.settings.elevation],[before.settings.azimuth,before.settings.elevation]);
    }
    await page.locator('#camera-reset').click();
  });
  await check('preset save, reload, load, and delete persist',async()=>{
    const saved=(await state()).settings;await page.locator('#presets-open').click();await page.locator('#preset-name').fill('Browser QA light');await page.locator('#save-form button').click();await page.locator('[data-close="preset-dialog"]').click();
    await page.reload();await page.waitForFunction(()=>window.foldlightDiagnostics);await page.locator('#presets-open').click();await page.getByRole('button',{name:'Load',exact:true}).click();
    assert.equal((await state()).settings.azimuth,saved.azimuth);assert.equal((await state()).settings.intensity,saved.intensity);
    await page.locator('#presets-open').click();await page.getByRole('button',{name:'Delete Browser QA light'}).click();assert.equal(await page.locator('.preset-row').count(),0);await page.locator('[data-close="preset-dialog"]').click();
  });
  await check('model switching and mode switching do not grow GPU resources',async()=>{
    const models=['sphere','cube','cylinder','head','sleeve','skirt','hair','pipe','zigzag','spiral','diaper','tension','bust','hand','shirt','scarf'];
    for(const type of models){await page.locator('#model-select').selectOption(type);await page.waitForTimeout(40);}
    await page.locator('#model-select').selectOption('diaper');await page.waitForTimeout(100);const baseline=(await state()).memory;
    for(let i=0;i<2;i++)for(const type of models){await page.locator('#model-select').selectOption(type);await page.waitForTimeout(40);}
    for(const mode of ['anime','normal','cel','clay']){await page.locator(`[data-mode="${mode}"]`).click();await page.waitForTimeout(60);}
    await page.locator('#model-select').selectOption('diaper');await page.waitForTimeout(100);const after=(await state()).memory;
    assert.ok(after.geometries<=baseline.geometries+1,JSON.stringify({baseline,after}));assert.ok(after.textures<=baseline.textures+1);
  });
  await check('new drawing models render and study controls survive reload',async()=>{
    const shots=new Set();for(const model of ['bust','hand','shirt','scarf']){await page.locator('#model-select').selectOption(model);await page.waitForTimeout(100);shots.add(hash(await shot()));await page.screenshot({path:new URL(`model-${model}.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1')});}assert.equal(shots.size,4);
    await page.locator('[data-mode="anime"]').click();await page.reload();await page.waitForFunction(()=>window.foldlightDiagnostics);assert.equal((await state()).settings.model,'scarf');assert.equal((await state()).settings.mode,'anime');await page.locator('[data-mode="clay"]').click();await page.locator('#model-select').selectOption('diaper');
  });
  await check('local OBJ, STL, GLB, and glTF with sidecars import as drawing references',async()=>{
    for(const [files,format] of [[objFixture(),'obj'],[stlFixture(),'stl'],[glbFixture(),'glb'],[gltfFixtures(),'gltf']]){
      await uploadModel(page,files);const imported=(await state()).imported;
      assert.ok(imported,'Import metadata is available');assert.equal(imported.format.toLowerCase(),format);assert.ok(imported.triangles>0);assert.ok(imported.vertices>=4);
      const bounds=(await state()).modelBounds;assert.ok(Math.abs(bounds.min[1]+1.6)<1e-4,'Imported reference is grounded');assert.ok(Math.abs(Math.max(...bounds.size)-3.2)<1e-4,'Source scale is normalized');
      assert.equal(await page.locator('#model-select').inputValue(),'imported');
      await page.screenshot({path:new URL(`import-${format}.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    }
  });
  await check('imported geometry shares shading modes, rotation, silhouette, and wireframe tools',async()=>{
    await uploadModel(page,objFixture());const modes=new Set();
    for(const mode of ['clay','cel','anime','normal']){await page.locator(`[data-mode="${mode}"]`).click();modes.add(hash(await shot()));}
    assert.equal(modes.size,4,'Study rendering modes remain distinct on imported geometry');
    await page.locator('[data-mode="clay"]').click();await revealControl(page,'#modelRotationY');
    const original=hash(await shot());await page.locator('#modelRotationY').fill('75');assert.notEqual(hash(await shot()),original);assert.equal((await state()).settings.modelRotationY,75);assert.ok(Math.abs((await state()).modelBounds.min[1]+1.6)<1e-4,'Rotation keeps the model above the ground');
    await page.locator('#reset-model-rotation').click();assert.equal((await state()).settings.modelRotationY,0);
    await revealControl(page,'[data-key="silhouette"]');await page.locator('[data-key="silhouette"]').check();const silhouette=hash(await shot());assert.notEqual(silhouette,original);await page.locator('[data-key="silhouette"]').uncheck();
    await revealControl(page,'[data-key="wireframe"]');await page.locator('[data-key="wireframe"]').check();assert.notEqual(hash(await shot()),original);await page.locator('[data-key="wireframe"]').uncheck();
  });
  await check('visible model tools move, rotate and scale geometry without moving the camera',async()=>{
    await uploadModel(page,objFixture());assert.ok(await page.locator('.model-transform-tools').isVisible());
    const box=await page.locator('#viewport').boundingBox(),x=box.x+box.width*.56,y=box.y+box.height*.48;
    const drag=async(dx,dy)=>{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:10});await page.mouse.up();};
    await page.locator('[data-tool="translate"]').click();const before=await state();await drag(65,-35);const moved=await state();assert.ok(!near(moved.modelTransform.position,before.modelTransform.position));assert.ok(near(moved.camera,before.camera));assert.ok(near(moved.target,before.target));
    await page.locator('[data-tool="rotate"]').click();const rotation=(await state()).modelTransform.quaternion;await drag(75,40);assert.ok(!near((await state()).modelTransform.quaternion,rotation));assert.ok(near((await state()).camera,before.camera));
    await page.locator('[data-tool="scale"]').click();await drag(35,-35);const scaled=await state();assert.ok(scaled.settings.modelScale>1);assert.ok(scaled.modelTransform.scale.every(v=>Math.abs(v-scaled.settings.modelScale)<1e-7));assert.equal(scaled.memory.modelGeometries,before.memory.modelGeometries);
    await page.locator('#transform-numbers').click();await page.locator('input[type=number][data-key="modelScale"]').fill('1.25');assert.equal((await state()).settings.modelScale,1.25);
    await page.locator('input[type=number][data-key="modelPositionX"]').fill('1.5');assert.equal((await state()).settings.modelPositionX,1.5);
    await page.locator('[data-turn="X:-90"]').click();await page.locator('#ground-model').click();assert.ok(Math.abs((await state()).modelBounds.min[1]+1.78)<1e-4);
    const saved=(await state()).settings;await page.locator('#model-select').selectOption('sphere');assert.equal((await state()).settings.modelScale,1);assert.equal((await state()).settings.modelPositionX,0);
    await page.locator('#model-select').selectOption('imported');assert.equal((await state()).settings.modelScale,saved.modelScale);assert.equal((await state()).settings.modelPositionX,saved.modelPositionX);assert.equal((await state()).settings.modelRotationX,saved.modelRotationX);
    await page.locator('#transform-open').click();await page.screenshot({path:new URL('model-transform-tools.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    await page.locator('#reset-model-transform').click();const reset=await state();assert.equal(reset.settings.modelScale,1);assert.equal(reset.settings.modelPositionX,0);assert.equal(reset.settings.modelRotationX,0);assert.ok(Math.abs(reset.modelBounds.min[1]+1.6)<1e-4);
    for(const scale of ['0.1','5']){await page.locator('input[type=number][data-key="modelScale"]').fill(scale);await page.locator('#frame-view').click();await page.locator('#projection').click();const a=await state();await page.locator('#projection').click();const b=await state();assert.ok(near(a.target,b.target));assert.equal(b.settings.modelScale,Number(scale));assert.ok((await shot()).length>5000);}
    await page.locator('#reset-model-transform').click();await page.locator('#frame-view').click();
    await page.locator('[data-tool="view"]').click();const original=(await state()).camera;await drag(60,20);assert.ok(!near((await state()).camera,original),'View restores orbit');await page.locator('#camera-reset').click();
  });
  await check('failed and remote imports keep the previous model and perform no external fetch',async()=>{
    const before=(await state()).imported,requests=[];const record=request=>{if(request.url().includes('foldlight-test.invalid'))requests.push(request.url());};page.on('request',record);
    for(const fixture of [invalidFixture(),remoteGltfFixture()]){
      await page.locator('#import-open').click();await page.locator('#model-files').setInputFiles(fixture);await page.locator('#import-submit').click();
      await page.waitForFunction(()=>!document.querySelector('#import-submit').disabled&&document.querySelector('#import-status').textContent.trim().length>0);
      assert.equal((await state()).settings.model,'imported');assert.deepEqual((await state()).imported,before);assert.ok(await page.locator('#import-dialog').isVisible());
      await page.locator('[data-close="import-dialog"]').click();
    }
    page.off('request',record);assert.deepEqual(requests,[]);
  });
  await check('cancelled slow imports cannot replace a newer successful model',async()=>{
    await page.evaluate(()=>{window.foldlightOriginalFileRead=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){const result=window.foldlightOriginalFileRead.call(this);return this.name==='slow.obj'?new Promise((resolve,reject)=>setTimeout(()=>result.then(resolve,reject),500)):result;};});
    try{
      await page.locator('#import-open').click();await page.locator('#model-files').setInputFiles(objFixture('slow.obj'));await page.locator('#import-submit').click();await page.locator('[data-close="import-dialog"]').click();
      await uploadModel(page,glbFixture());const current=(await state()).imported;await page.waitForTimeout(650);assert.deepEqual((await state()).imported,current);assert.equal(current.name,'hierarchy.glb');
    }finally{await page.evaluate(()=>{File.prototype.arrayBuffer=window.foldlightOriginalFileRead;delete window.foldlightOriginalFileRead;});}
  });
  await check('model switching retains imports and replacement/removal releases GPU geometry',async()=>{
    await page.locator('#model-select').selectOption('diaper');assert.ok((await state()).imported,'Built-ins retain the session import');await page.locator('#model-select').selectOption('imported');await page.waitForTimeout(100);
    const baseline=(await state()).memory;
    for(let cycle=0;cycle<2;cycle++)for(const fixture of [objFixture(`replacement-${cycle}.obj`),glbFixture(),stlFixture()])await uploadModel(page,fixture);
    const after=(await state()).memory;assert.ok(after.geometries<=baseline.geometries+1,JSON.stringify({baseline,after}));assert.ok(after.textures<=baseline.textures+1);
    await page.locator('#model-select').selectOption('diaper');await page.locator('#model-select').selectOption('imported');
    await revealControl(page,'#remove-import');await page.locator('#remove-import').click();await page.waitForTimeout(100);assert.equal((await state()).imported,null);assert.notEqual((await state()).settings.model,'imported');assert.equal(await page.locator('#imported-group').evaluate(el=>el.hidden),true);
  });
  await check('imported references export to PNG and fall back usefully after reload',async()=>{
    await uploadModel(page,glbFixture());const pending=page.waitForEvent('download');await page.locator('#export').click();const download=await pending;
    const destination=new URL('export-imported.png',out).pathname.replace(/^\/([A-Z]:)/,'$1');await download.saveAs(destination);const png=await readFile(destination);assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(Math.max(png.readUInt32BE(16),png.readUInt32BE(20)),3200);
    await page.reload();await page.waitForFunction(()=>window.foldlightDiagnostics);assert.equal((await state()).imported,null);assert.notEqual((await state()).settings.model,'imported');assert.ok((await state()).memory.triangles>0);
    await page.locator('#model-select').selectOption('diaper');
  });
  await check('PNG exports a high-resolution image without UI',async()=>{
    const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
    const destination=new URL('export.png',out).pathname.replace(/^\/([A-Z]:)/,'$1');await download.saveAs(destination);const png=await readFile(destination);
    assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(Math.max(png.readUInt32BE(16),png.readUInt32BE(20)),3200);assert.ok(png.length>15000);
  });
  await check('export ends active model drags and rejects light drags without disabling the camera',async()=>{
    await page.locator('#transform-open').click();await page.locator('[data-tool="translate"]').click();
    const r=await page.locator('#viewport').boundingBox(),x=r.x+r.width*.55,y=r.y+r.height*.5;
    await page.evaluate(()=>{
      const original=HTMLCanvasElement.prototype.toBlob;
      window.releaseExport=null;
      HTMLCanvasElement.prototype.toBlob=function(callback,...args){original.call(this,blob=>{window.releaseExport=()=>callback(blob);},...args);};
      window.restoreExport=()=>{HTMLCanvasElement.prototype.toBlob=original;};
    });
    try{
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+15,y+10);
      const downloadPromise=page.waitForEvent('download');await page.locator('#export').evaluate(button=>button.click());await page.mouse.up();
      await page.waitForFunction(()=>typeof window.releaseExport==='function');const settings=(await state()).settings,g=await page.locator('#light-gizmo').boundingBox();
      await page.mouse.move(g.x+g.width/2,g.y+g.height/2);await page.mouse.down();await page.mouse.move(g.x+g.width/2+30,g.y+g.height/2-20);await page.mouse.up();
      assert.equal((await state()).settings.azimuth,settings.azimuth);assert.equal((await state()).settings.elevation,settings.elevation);
      await page.evaluate(()=>window.releaseExport());await downloadPromise;await page.waitForFunction(()=>!document.querySelector('#export').disabled);
    }finally{await page.evaluate(()=>window.restoreExport());}
    const idle=await state();await page.mouse.move(x,y);await page.mouse.wheel(0,-120);await page.waitForTimeout(100);assert.ok(!near((await state()).camera,idle.camera),'Idle wheel zoom remains enabled before changing tools');
    await page.locator('[data-tool="view"]').click();const before=await state();await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+50,y+20,{steps:6});await page.mouse.up();assert.ok(!near((await state()).camera,before.camera));await page.locator('#reset-all').click();
  });
  await check('outlines, grid, ground, and reduced quality work',async()=>{
    await openPanel(page,'#appearance-panel');await page.locator('[data-key="outline"]').check();
    await openPanel(page,'#scene-panel');await page.locator('[data-key="grid"]').check();await page.locator('[data-key="ground"]').uncheck();
    const full=(await state()).memory.triangles;await page.locator('[data-key="reduced"]').check();await page.waitForTimeout(150);assert.ok((await state()).memory.triangles<full*.5);
    await page.screenshot({path:new URL('tools.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});await page.locator('#reset-all').click();
  });
  await check('transparent PNG has transparent background and opaque model pixels',async()=>{
    await openPanel(page,'#scene-panel');await page.locator('[data-key="transparentExport"]').check();
    const pending=page.waitForEvent('download');await page.locator('#export').click();const download=await pending,path=new URL('export-transparent.png',out).pathname.replace(/^\/([A-Z]:)/,'$1');await download.saveAs(path);
    const decoded=pngPixels(await readFile(path));assert.equal(decoded.channels,4);assert.equal(decoded.pixels[3],0,'Corner is transparent');let opaque=0;for(let i=3;i<decoded.pixels.length;i+=4)if(decoded.pixels[i]>240)opaque++;assert.ok(opaque>10000,'Model remains opaque');await page.locator('[data-key="transparentExport"]').uncheck();
  });
  await check('cel shading does not emit colored light when every scene light is off',async()=>{
    await page.locator('[data-mode="cel"]').click();await revealControl(page,'#intensity');await page.locator('#intensity').fill('0');await page.locator('#fill').fill('0');await revealControl(page,'[data-key="secondary"]');await page.locator('[data-key="secondary"]').uncheck();
    await revealControl(page,'[data-key="outline"]');await page.locator('[data-key="outline"]').uncheck();await revealControl(page,'[data-key="transparentExport"]');await page.locator('[data-key="transparentExport"]').check();
    const pending=page.waitForEvent('download');await page.locator('#export').click();const download=await pending,path=new URL('export-unlit-cel.png',out).pathname.replace(/^\/([A-Z]:)/,'$1');await download.saveAs(path);
    const decoded=pngPixels(await readFile(path));let count=0,total=0;for(let i=0;i<decoded.pixels.length;i+=4)if(decoded.pixels[i+3]>240){count++;total+=decoded.pixels[i]+decoded.pixels[i+1]+decoded.pixels[i+2];}
    assert.ok(count>10000);assert.ok(total/count<3,'An unlit cel surface stays black rather than self-illuminating');await page.locator('#reset-all').click();
  });
  await check('keyboard shortcuts do not change study while editing controls',async()=>{
    await page.locator('#presets-open').click();await page.locator('#preset-name').fill('1234 f');await page.locator('#preset-name').press('4');assert.equal((await state()).settings.mode,'clay');await page.locator('[data-close="preset-dialog"]').click();
    await page.locator('#viewport>canvas').focus();await page.keyboard.press('4');assert.equal((await state()).settings.mode,'anime');await page.keyboard.press('1');assert.equal((await state()).settings.mode,'clay');
  });
  await check('WebGL context loss shows recovery notice and restores rendering',async()=>{
    const supported=await page.locator('#viewport>canvas').evaluate(canvas=>{
      const gl=canvas.getContext('webgl2'),extension=gl?.getExtension('WEBGL_lose_context');if(!extension)return false;
      window.foldlightTestContextExtension=extension;extension.loseContext();return true;
    });
    assert.ok(supported,'Chrome exposes the context-loss extension');await page.locator('#context-notice').waitFor({state:'visible'});
    await page.evaluate(()=>window.foldlightTestContextExtension.restoreContext());await page.locator('#context-notice').waitFor({state:'hidden'});await page.waitForTimeout(150);
    assert.ok((await state()).memory.triangles>0);await page.locator('#azimuth').fill('20');assert.ok((await shot()).length>10000);
  });
  if(process.env.TEST_OFFLINE==='1')await check('production service worker caches app and supports offline reload',async()=>{
    await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !!r?.active;});
    await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.foldlightDiagnostics);assert.equal(await page.locator('#study-title').textContent(),'Diaper folds');
    await uploadModel(page,objFixture('offline.obj'));assert.equal((await state()).imported.name,'offline.obj');await revealControl(page,'#remove-import');await page.locator('#remove-import').click();await context.setOffline(false);
  });
  if(process.env.TEST_OFFLINE==='1')await check('service worker cleanup keeps other installation scopes intact',async()=>{
    const source=await(await context.request.get(new URL('sw.js',url).href)).text(),scope=new URL('./',url).href,prefix='foldlight:'+encodeURIComponent(scope)+':';
    const foreign='foldlight:'+encodeURIComponent(new URL('another-install/',url).href)+':old',keys=[prefix+'old',foreign,'other-app-cache'],removed=[],events={};let activation;
    runInNewContext(source,{self:{registration:{scope},location:new URL('sw.js',url),clients:{claim:async()=>{}},addEventListener:(type,fn)=>events[type]=fn},caches:{keys:async()=>keys,delete:async key=>{removed.push(key);return true;}},URL});
    events.activate({waitUntil:p=>activation=p});await activation;assert.deepEqual(removed,[prefix+'old']);
  });
  await check('tablet touch orbit and pinch zoom work in Chromium emulation',async()=>{
    const touch=await browser.newContext({viewport:{width:820,height:1180},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});const tablet=await touch.newPage();
    tablet.on('pageerror',e=>errors.push(e.message));tablet.on('console',recordConsole);await tablet.goto(url);await tablet.waitForFunction(()=>window.foldlightDiagnostics);
    const cdp=await touch.newCDPSession(tablet),initial=await tablet.evaluate(()=>window.foldlightDiagnostics().camera);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:550,y:500}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:650,y:550}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tablet.waitForTimeout(300);assert.notDeepEqual(await tablet.evaluate(()=>window.foldlightDiagnostics().camera),initial);
    const before=await tablet.evaluate(()=>window.foldlightDiagnostics().camera);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:420,y:600},{x:620,y:600}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:350,y:600},{x:690,y:600}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tablet.waitForTimeout(300);assert.notDeepEqual(await tablet.evaluate(()=>window.foldlightDiagnostics().camera),before);
    await tablet.locator('#camera-reset').tap();await tablet.waitForTimeout(100);await tablet.screenshot({path:new URL('tablet.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});await tablet.locator('#inspector-toggle').tap();assert.ok(await tablet.locator('.inspector').isVisible());
    await tablet.locator('#settings-close').tap();
    await uploadModel(tablet,objFixture('touch.obj'));await tablet.locator('[data-tool="translate"]').tap();const touchBefore=await tablet.evaluate(()=>window.foldlightDiagnostics());
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:480,y:550}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:530,y:510}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const touchMoved=await tablet.evaluate(()=>window.foldlightDiagnostics());assert.ok(!near(touchMoved.modelTransform.position,touchBefore.modelTransform.position));assert.ok(near(touchMoved.camera,touchBefore.camera));
    await tablet.locator('[data-tool="rotate"]').tap();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:480,y:550}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:530,y:580}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(!near((await tablet.evaluate(()=>window.foldlightDiagnostics())).modelTransform.quaternion,touchMoved.modelTransform.quaternion));
    await tablet.locator('[data-tool="scale"]').tap();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:480,y:550}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:510,y:520}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok((await tablet.evaluate(()=>window.foldlightDiagnostics())).settings.modelScale>1);
    await tablet.locator('[data-tool="view"]').tap();await tablet.setViewportSize({width:390,height:844});await tablet.screenshot({path:new URL('mobile.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
    assert.ok(await tablet.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await tablet.locator('#inspector-toggle').tap();await tablet.screenshot({path:new URL('mobile-controls.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});await touch.close();
  });
  assert.deepEqual(errors,[],`Browser errors: ${errors.join('\n')}`);
  checks.push('no JavaScript or shader errors');console.log('PASS no JavaScript or shader errors');
  await writeFile(new URL('browser-report.json',out),JSON.stringify({url,browser:await browser.version(),checks,errors},null,2));
}finally{await browser.close();}
