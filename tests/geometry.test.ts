import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFabric, createModel, surfacePoint, defaultFold, foldTypes, modelTypes, type FoldSettings } from '../src/geometry.ts';

test('all five folds are deterministic, finite 3D meshes with distinct silhouettes and normals', () => {
  const signatures = new Set<string>();
  for (const type of foldTypes) {
    const a = createFabric(type, defaultFold, true), b = createFabric(type, defaultFold, true);
    assert.deepEqual(a.getAttribute('position').array, b.getAttribute('position').array);
    const p = a.getAttribute('position'), n = a.getAttribute('normal');
    assert.ok([...p.array].every(Number.isFinite));
    assert.ok([...n.array].every(Number.isFinite));
    a.computeBoundingBox(); const box=a.boundingBox!;
    assert.ok(box.max.z-box.min.z>0.15, `${type} has real depth`);
    assert.ok(box.max.x-box.min.x>1, `${type} has useful width`);
    assert.ok(Math.abs(box.min.y+1.6)<1e-5, `${type} stays above ground`);
    const directions = new Set<string>();
    for(let i=0;i<n.count;i+=17){
      assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<0.01);
      directions.add([n.getX(i),n.getY(i),n.getZ(i)].map(v=>v.toFixed(1)).join(','));
    }
    assert.ok(directions.size>15, `${type} changes surface direction meaningfully`);
    signatures.add(Array.from(p.array).filter((_,i)=>i%157===0).map(v=>v.toFixed(4)).join(','));
    a.dispose(); b.dispose();
  }
  assert.equal(signatures.size,5);
});

test('fabric is a joined shell: every indexed edge is shared by two faces', () => {
  for(const type of foldTypes){
    const g=createFabric(type,defaultFold,true), idx=g.index!.array, edges=new Map<string,number>();
    for(let i=0;i<idx.length;i+=3) for(const [a,b] of [[idx[i],idx[i+1]],[idx[i+1],idx[i+2]],[idx[i+2],idx[i]]]){
      const key=a<b?`${a},${b}`:`${b},${a}`; edges.set(key,(edges.get(key)||0)+1);
    }
    assert.ok([...edges.values()].every(v=>v===2), `${type} has no open indexed edges`);
    g.dispose();
  }
});

test('every applicable fold parameter changes geometry for every fabric preset', () => {
  const changes: Record<keyof FoldSettings,number>={count:11,depth:0.6,spacing:1.6,tension:0.9,gravity:0.1,sharpness:0.9,thickness:0.12};
  for(const type of [...foldTypes,'sleeve','skirt'] as const){
    const original=createFabric(type,defaultFold,true);
    for(const [key,value] of Object.entries(changes)){
      const changed=createFabric(type,{...defaultFold,[key]:value},true);
      const a=original.getAttribute('position').array,b=changed.getAttribute('position').array;
      let difference=0;for(let i=0;i<a.length;i++) difference+=Math.abs(a[i]-b[i]);
      assert.ok(difference>0.1,`${type}: ${key} visibly changes geometry`); changed.dispose();
    }
    original.dispose();
  }
});

test('extreme allowed controls and supplementary models remain valid',()=>{
  for(const type of modelTypes){
    for(const settings of [defaultFold,{count:14,depth:0.65,spacing:0.65,tension:0,gravity:1,sharpness:1,thickness:0.15}]){
      for(const g of createModel(type,settings,true)){
        assert.ok([...g.getAttribute('position').array,...g.getAttribute('normal').array].every(Number.isFinite));
        assert.ok(g.index!.count>0); g.dispose();
      }
    }
  }
});

test('all reference models fit above the ground and have useful three-dimensional volume',()=>{
  for(const type of modelTypes){
    const geometries=createModel(type,defaultFold,true),box=new THREE.Box3();
    for(const g of geometries){g.computeBoundingBox();box.union(g.boundingBox!);}
    assert.ok(Math.abs(box.min.y+1.6)<1e-4,`${type} is grounded`);
    const size=box.getSize(new THREE.Vector3());
    assert.ok(size.x>.5&&size.y>1.5&&size.z>.25,`${type} has useful volume`);
    for(const g of geometries)g.dispose();
  }
});

test('hand and shirt are joined surfaces rather than disconnected primitive pieces',()=>{
  for(const type of ['hand','shirt'] as const){
    const [g]=createModel(type,defaultFold,true),adjacency=new Map<number,Set<number>>(),index=g.index!.array;
    for(let i=0;i<index.length;i+=3)for(const [a,b] of [[index[i],index[i+1]],[index[i+1],index[i+2]],[index[i+2],index[i]]]){
      if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());adjacency.get(a)!.add(b);adjacency.get(b)!.add(a);
    }
    const visited=new Set<number>(),stack=[adjacency.keys().next().value!];
    while(stack.length){const v=stack.pop()!;if(visited.has(v))continue;visited.add(v);for(const n of adjacency.get(v)!)if(!visited.has(n))stack.push(n);}
    assert.equal(visited.size,adjacency.size,`${type} has one connected surface`);
    const normal=g.getAttribute('normal');for(let i=0;i<normal.count;i+=37)assert.ok(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)<.01);
    g.dispose();
  }
});

test('shirt and scarf controls each change the generated reference',()=>{
  const changes: Record<keyof FoldSettings,number>={count:11,depth:.6,spacing:1.6,tension:.9,gravity:.1,sharpness:.9,thickness:.12};
  for(const type of ['shirt','scarf'] as const){
    const [original]=createModel(type,defaultFold,true),a=original.getAttribute('position').array;
    for(const [key,value] of Object.entries(changes)){
      const [changed]=createModel(type,{...defaultFold,[key]:value},true),b=changed.getAttribute('position').array;
      const difference=a.length!==b.length?1:Array.from(a).reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0);
      assert.ok(difference>.01,`${type}: ${key} affects shape`);changed.dispose();
    }
    original.dispose();
  }
});

test('reduced quality lowers triangle count without changing deterministic surface bounds',()=>{
  const high=createFabric('diaper',defaultFold),low=createFabric('diaper',defaultFold,true);
  assert.ok(low.index!.count<high.index!.count*0.4);
  high.computeBoundingBox();low.computeBoundingBox();
  assert.ok(Math.abs(high.boundingBox!.max.y-low.boundingBox!.max.y)<0.02);
  high.dispose();low.dispose();
});

test('cylindrical fabrics remain continuous around their seam with non-default spacing',()=>{
  for(const type of ['spiral','sleeve','skirt'] as const)for(const spacing of [0.65,1,1.8])for(const v of [0,0.37,1]){
    const a=surfacePoint(type,0,v,{...defaultFold,spacing}),b=surfacePoint(type,1,v,{...defaultFold,spacing});
    assert.ok(a.distanceTo(b)<1e-6,`${type} is periodic`);
  }
});
