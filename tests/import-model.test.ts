import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { importModel, IMPORT_LIMITS } from '../src/import-model.ts';
import { glbFixture, gltfFixtures, objFixture, stlFixture, remoteGltfFixture, invalidFixture } from './import-fixtures.mjs';

const file = (fixture: { buffer: Uint8Array; name: string; mimeType?: string }) => new File([fixture.buffer], fixture.name, { type: fixture.mimeType || 'application/octet-stream' });
const clean = (result: Awaited<ReturnType<typeof importModel>>) => result.geometries.forEach(g => g.dispose());
function assertNormalized(result: Awaited<ReturnType<typeof importModel>>) {
  const bounds = new THREE.Box3();
  for (const g of result.geometries) { g.computeBoundingBox(); bounds.union(g.boundingBox!); assert.ok([...g.getAttribute('position').array, ...g.getAttribute('normal').array].every(Number.isFinite)); }
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 3.2) < 1e-5);
  assert.ok(Math.abs(bounds.min.y + 1.6) < 1e-5);
  assert.ok(Math.abs(center.x) < 1e-5 && Math.abs(center.z) < 1e-5);
}

test('GLB hierarchy and mirrored transforms bake to normalized geometry with outward winding', async () => {
  const result = await importModel([file(glbFixture())]);
  try {
    assert.equal(result.format, 'GLB'); assert.equal(result.triangles, 4); assert.equal(result.vertices, 4); assertNormalized(result);
    const g = result.geometries[0], p = g.getAttribute('position'), idx = g.index!.array;
    let signedVolume = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, idx[i]), b = new THREE.Vector3().fromBufferAttribute(p, idx[i + 1]), c = new THREE.Vector3().fromBufferAttribute(p, idx[i + 2]);
      signedVolume += a.dot(b.cross(c)) / 6;
    }
    assert.ok(signedVolume > 0, 'Mirrored hierarchy retains outward triangle winding');
  } finally { clean(result); }
});

test('OBJ and ASCII/binary STL geometry import without original materials', async () => {
  for (const fixture of [objFixture(), stlFixture()]) {
    const result = await importModel([file(fixture)]);try { assert.ok(result.triangles >= 4); assertNormalized(result); assert.equal(result.geometries[0].getAttribute('uv'), undefined); } finally { clean(result); }
  }
  const bin = new ArrayBuffer(84 + 50), view = new DataView(bin);view.setUint32(80, 1, true);
  for (const [i, n] of [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0].entries()) view.setFloat32(84 + i * 4, n, true);
  const result = await importModel([new File([bin], 'triangle.stl')]);try { assert.equal(result.triangles, 1);assertNormalized(result); } finally { clean(result); }
  new Uint8Array(bin).set(new TextEncoder().encode('solid binary header'));
  const solidHeader = await importModel([new File([bin], 'solid-header.stl')]);try { assert.equal(solidHeader.triangles, 1);assertNormalized(solidHeader); } finally { clean(solidHeader); }
});

test('local glTF sidecars and embedded buffers never call fetch or image decoding', async () => {
  const previousFetch = globalThis.fetch;let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Network forbidden in import test'); };
  try {
    const fixtures = gltfFixtures();const local = await importModel(fixtures.map(file));try { assert.equal(local.triangles, 4);assertNormalized(local); } finally { clean(local); }
    const json = JSON.parse(fixtures[0].buffer.toString());
    json.buffers[0].uri = 'data:application/octet-stream;base64,' + fixtures[1].buffer.toString('base64');
    json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];json.textures = [{ source: 0 }];json.images = [{ uri: 'https://never-request.invalid/image.png' }];json.meshes[0].primitives[0].material = 0;
    const embedded = await importModel([new File([JSON.stringify(json)], 'embedded.gltf')]);try { assert.equal(embedded.triangles, 4);assertNormalized(embedded); } finally { clean(embedded); }
    await assert.rejects(importModel([file(remoteGltfFixture())]), /External URLs are not loaded/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test('default morph weights and skinned pose are baked before normalization', async () => {
  const fixtures = gltfFixtures(), base = JSON.parse(fixtures[0].buffer.toString());
  const delta = new Float32Array([0,0,0, 4,0,0, 0,0,0, 0,0,0]);
  const morphBytes = Buffer.concat([fixtures[1].buffer, Buffer.from(delta.buffer)]);
  base.buffers = [{byteLength:morphBytes.length,uri:'data:application/octet-stream;base64,'+morphBytes.toString('base64')}];
  base.bufferViews.push({buffer:0,byteOffset:fixtures[1].buffer.length,byteLength:delta.byteLength});
  base.accessors.push({bufferView:2,componentType:5126,count:4,type:'VEC3',min:[0,0,0],max:[4,0,0]});
  base.meshes[0].primitives[0].targets=[{POSITION:2}];base.meshes[0].weights=[0.5];
  const morph=await importModel([new File([JSON.stringify(base)],'morph.gltf')]);
  try{const size=morph.geometries[0].boundingBox!.getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-3.2)<1e-5);assert.ok(Math.abs(size.y-2.4)<1e-5);}finally{clean(morph);}

  const skin=JSON.parse(fixtures[0].buffer.toString());
  const joints=new Uint16Array([1,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),weights=new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]);
  const inverse=new Float32Array([...new THREE.Matrix4().elements,...new THREE.Matrix4().elements]);
  const skinBytes=Buffer.concat([fixtures[1].buffer,Buffer.from(joints.buffer),Buffer.from(weights.buffer),Buffer.from(inverse.buffer)]);
  skin.buffers=[{byteLength:skinBytes.length,uri:'data:application/octet-stream;base64,'+skinBytes.toString('base64')}];
  let offset=fixtures[1].buffer.length;
  for(const bytes of [joints,weights,inverse]){skin.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.byteLength});offset+=bytes.byteLength;}
  skin.accessors.push({bufferView:2,componentType:5123,count:4,type:'VEC4'},{bufferView:3,componentType:5126,count:4,type:'VEC4'},{bufferView:4,componentType:5126,count:2,type:'MAT4'});
  skin.meshes[0].primitives[0].attributes.JOINTS_0=2;skin.meshes[0].primitives[0].attributes.WEIGHTS_0=3;
  skin.nodes=[{mesh:0,skin:0},{translation:[0,1,0]},{}];skin.scenes=[{nodes:[0,1,2]}];skin.skins=[{joints:[1,2],inverseBindMatrices:4}];
  const posed=await importModel([new File([JSON.stringify(skin)],'skin.gltf')]);
  try{const size=posed.geometries[0].boundingBox!.getSize(new THREE.Vector3());assert.ok(Math.abs(size.y-3.2)<1e-5);assert.ok(Math.abs(size.x-1.6)<1e-5,'Top vertex follows its posed bone');}finally{clean(posed);}
});

test('malformed files, missing sidecars, unsafe URIs and unsupported compression produce actionable errors', async () => {
  await assert.rejects(importModel([]), /Choose/);
  await assert.rejects(importModel([file(invalidFixture())]), /incomplete or invalid/);
  await assert.rejects(importModel([file(objFixture()), file(stlFixture())]), /one model at a time/);
  await assert.rejects(importModel([file(gltfFixtures()[0])]), /Missing companion file/);
  await assert.rejects(importModel([new File(['v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'], 'invalid.obj')]), /invalid or unsupported vertex coordinates/);
  await assert.rejects(importModel([new File(['v 0 0 0\nv 0 0 0\nv 0 0 0\nf 1 2 3\n'], 'empty.obj')]), /No usable triangle mesh/);
  for (const uri of ['https://evil.invalid/file.bin', '//evil.invalid/file.bin', 'file:///secret.bin', '../secret.bin', '%2F%2Fevil.invalid/a.bin']) {
    const fixtures = gltfFixtures(), json = JSON.parse(fixtures[0].buffer.toString());json.buffers[0].uri = uri;
    await assert.rejects(importModel([new File([JSON.stringify(json)], 'test.gltf')]), /External URLs|must stay inside/);
  }
  for (const extension of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression']) {
    const json = { asset: { version: '2.0' }, extensionsUsed: [extension] };
    await assert.rejects(importModel([new File([JSON.stringify(json)], 'compressed.gltf')]), /uncompressed/);
  }
  const cyclic = { asset: { version: '2.0' }, nodes: [{ children: [0] }] };
  await assert.rejects(importModel([new File([JSON.stringify(cyclic)], 'cyclic.gltf')]), /cyclic/);
});

test('limits are checked before expensive geometry allocation', async () => {
  const json = { asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: IMPORT_LIMITS.vertices + 1 }] };
  await assert.rejects(importModel([new File([JSON.stringify(json)], 'oversized.gltf')]), /too detailed/);
  const binary = new ArrayBuffer(84), view = new DataView(binary);view.setUint32(80, IMPORT_LIMITS.triangles + 1, true);
  await assert.rejects(importModel([new File([binary], 'oversized.stl')]), /too detailed/);
  const huge = new File(['valid but declared large'], 'oversized.obj');Object.defineProperty(huge, 'size', { value: IMPORT_LIMITS.modelBytes + 1 });
  await assert.rejects(importModel([huge]), /50 MB/);
  const instances={asset:{version:'2.0'},meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{count:3},{count:500_000}],nodes:[{mesh:0,extensions:{EXT_mesh_gpu_instancing:{attributes:{TRANSLATION:1}}}}]};
  await assert.rejects(importModel([new File([JSON.stringify(instances)],'instances.gltf')]),/too many mesh instances/);
});

test('loader geometries/materials are disposed and returned geometry remains owned by caller', async () => {
  const oldGeometry = THREE.BufferGeometry.prototype.dispose, oldMaterial = THREE.Material.prototype.dispose;
  const disposedGeometry = new Set<THREE.BufferGeometry>(), disposedMaterial = new Set<THREE.Material>();
  THREE.BufferGeometry.prototype.dispose = function () { disposedGeometry.add(this); oldGeometry.call(this); };
  THREE.Material.prototype.dispose = function () { disposedMaterial.add(this); oldMaterial.call(this); };
  try {
    const result = await importModel([file(glbFixture())]);
    assert.ok(disposedGeometry.size > 0);assert.ok(disposedMaterial.size > 0);
    assert.ok(result.geometries.every(g => !disposedGeometry.has(g)), 'Returned geometry is not prematurely disposed');clean(result);
    const before = disposedGeometry.size;
    await assert.rejects(importModel([new File(['v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'], 'bad.obj')]));
    assert.ok(disposedGeometry.size > before, 'Failure path disposes parsed geometry');
  } finally { THREE.BufferGeometry.prototype.dispose = oldGeometry;THREE.Material.prototype.dispose = oldMaterial; }
});
