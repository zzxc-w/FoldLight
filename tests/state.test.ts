import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validateStudy, readStudy, writeStudy, readPresets, writePresets, defaultLight } from '../src/state.ts';
test('study preferences round-trip valid themes, models, and anime settings',()=>{
  for(const theme of ['dark','light','system'] as const){
    const input={...defaults,theme,model:'bust',mode:'anime',navigation:'pan',animeRim:0.8,animeHighlight:0.4,transparentExport:true};
    assert.deepEqual(validateStudy(input),input);
  }
});
test('malformed persisted controls cannot create invalid or unexpected settings',()=>{
  const invalid={theme:['dark'],mode:['anime'],navigation:['pan'],model:'unknown-model',count:2.5,bands:4.5,depth:Infinity,fill:-1,ground:'true',color:'red',animeRim:8,transparentExport:1,unknown:'ignored'};
  assert.deepEqual(validateStudy(invalid),defaults);
  for(const value of [null,42,'dark',[],{__proto__:null}])assert.deepEqual(validateStudy(value),defaults);
  const repaired=validateStudy({theme:'light',depth:0.4,count:10,color:'#AbC123',gravity:NaN});
  assert.equal(repaired.theme,'light');assert.equal(repaired.depth,0.4);assert.equal(repaired.gravity,defaults.gravity);
  repaired.depth=0.6;assert.equal(defaults.depth,0.23,'defaults are not mutated');
});
test('rotation is validated and a session-only import falls back to a usable reference',()=>{
  const result=validateStudy({...defaults,model:'imported',modelRotationX:181,modelRotationY:45,modelRotationZ:-180,silhouette:true,wireframe:true});
  assert.equal(result.model,defaults.model);assert.equal(result.modelRotationX,0);assert.equal(result.modelRotationY,45);assert.equal(result.modelRotationZ,-180);assert.equal(result.silhouette,true);
});
test('local persistence recovers from missing/corrupted/blocked storage and keeps lighting library separate',()=>{
  const data=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>data.set(key,value)}});
  try{
    assert.deepEqual(readStudy(),defaults);
    const study={...defaults,theme:'light' as const,mode:'anime' as const};writeStudy(study);assert.deepEqual(readStudy(),study);
    writeStudy({...study,model:'imported',modelRotationY:90});const fallback=readStudy();assert.equal(fallback.model,defaults.model);assert.equal(fallback.modelRotationY,0);assert.equal(fallback.mode,'anime');writeStudy(study);
    writePresets([{id:'sample',name:'Warm key',lighting:{...defaultLight}}]);assert.equal(readPresets().length,1);assert.deepEqual(readStudy(),study);
    data.set('foldlight.study.v2','{broken json');assert.deepEqual(readStudy(),defaults);
    data.set('foldlight.presets.v1',JSON.stringify([{id:'sample',name:'Invalid',lighting:{...defaultLight,intensity:Infinity}}]));assert.deepEqual(readPresets(),[]);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage blocked');}});
    assert.deepEqual(readStudy(),defaults);assert.deepEqual(readPresets(),[]);assert.throws(()=>writeStudy(study));
  }finally{delete (globalThis as {localStorage?: unknown}).localStorage;}
});
