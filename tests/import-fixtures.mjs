// Small, generated local model fixtures. No external assets or licensing needed.
const positions=new Float32Array([0,0,0, 2,0,0, 0,3,0, 0,0,1]);
const indices=new Uint16Array([0,2,1, 0,1,3, 0,3,2, 1,2,3]);
const binary=Buffer.concat([Buffer.from(positions.buffer),Buffer.from(indices.buffer)]);
const gltfJson={asset:{version:'2.0',generator:'FoldLight browser QA'},scene:0,scenes:[{nodes:[0]}],nodes:[{translation:[4,2,-3],children:[1]},{mesh:0,scale:[-1,1,1]}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength,target:34962},{buffer:0,byteOffset:positions.byteLength,byteLength:indices.byteLength,target:34963}],accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[0,0,0],max:[2,3,1]},{bufferView:1,componentType:5123,count:12,type:'SCALAR'}]};
export function glbFixture(){
  const json=Buffer.from(JSON.stringify(gltfJson)),jsonPadded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jsonPadded);
  const binPadded=Buffer.alloc(Math.ceil(binary.length/4)*4);binary.copy(binPadded);
  const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonPadded.length+8+binPadded.length,8);
  jsonHeader.writeUInt32LE(jsonPadded.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);binHeader.writeUInt32LE(binPadded.length);binHeader.writeUInt32LE(0x004e4942,4);
  return{name:'hierarchy.glb',mimeType:'model/gltf-binary',buffer:Buffer.concat([header,jsonHeader,jsonPadded,binHeader,binPadded])};
}
export const objFixture=(name='study.obj')=>({name,mimeType:'text/plain',buffer:Buffer.from(`o Drawing reference
v -1 -1.5 -.5
v 1 -1.5 -.5
v 1 1.5 -.5
v -1 1.5 -.5
v -1 -1.5 .5
v 1 -1.5 .5
v 1 1.5 .5
v -1 1.5 .5
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 4 8 7 3
f 1 5 8 4
f 2 3 7 6
`)});
export function stlFixture(){
  let text='solid reference\n';
  for(let i=0;i<indices.length;i+=3){text+='facet normal 0 0 0\nouter loop\n';for(const index of indices.subarray(i,i+3))text+=`vertex ${Array.from(positions.subarray(index*3,index*3+3)).join(' ')}\n`;text+='endloop\nendfacet\n';}
  return{name:'reference.stl',mimeType:'model/stl',buffer:Buffer.from(text+'endsolid reference\n')};
}
export function gltfFixtures(){
  return [{name:'sidecar.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify({...gltfJson,buffers:[{byteLength:binary.length,uri:'mesh.bin'}]}))},{name:'mesh.bin',mimeType:'application/octet-stream',buffer:binary}];
}
export function remoteGltfFixture(){return{name:'remote.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify({...gltfJson,buffers:[{byteLength:binary.length,uri:'https://foldlight-test.invalid/mesh.bin'}]}))};}
export const invalidFixture=()=>({name:'broken.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('not a model')});
