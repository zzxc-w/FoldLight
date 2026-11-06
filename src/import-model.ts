import * as THREE from 'three';
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export interface ImportedModel {
  name: string;
  format: string;
  geometries: THREE.BufferGeometry[];
  triangles: number;
  vertices: number;
}
export const IMPORT_LIMITS = { modelBytes: 50 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, triangles: 500_000, vertices: 1_000_000 } as const;
export class ModelImportError extends Error { constructor(message: string) { super(message); this.name = 'ModelImportError'; } }
const fail = (message: string): never => { throw new ModelImportError(message); };
const extension = (name: string) => name.toLowerCase().split('.').pop() || '';
const textDecoder = new TextDecoder('utf-8', { fatal: true });
type Json = Record<string, any>;

function decodeText(buffer: ArrayBuffer): string {
  try { return textDecoder.decode(buffer).replace(/^\uFEFF/, ''); }
  catch { return fail('The model text is not valid UTF-8. Export it again as GLB, glTF 2.0, OBJ, or STL.'); }
}
function parseJson(text: string): Json {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail('This glTF file contains invalid JSON. Export the model again.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('This glTF file does not contain a model object.');
  return value as Json;
}
function unpackGLB(buffer: ArrayBuffer): { json: Json; binary?: ArrayBuffer } {
  if (buffer.byteLength < 20) return fail('This GLB file is incomplete or invalid. Export a glTF 2.0 binary (.glb) file again.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) return fail('This is not a complete glTF 2.0 binary (.glb) file.');
  let offset = 12, json: Json | undefined, binary: ArrayBuffer | undefined;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) return fail('The GLB chunk header is incomplete.');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    if (length % 4 || offset + 8 + length > buffer.byteLength) return fail('The GLB chunk data is incomplete.');
    const chunk = buffer.slice(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) { if (json) return fail('The GLB contains duplicate model headers.'); json = parseJson(decodeText(chunk).replace(/\0+$/, '')); }
    else if (type === 0x004e4942 && !binary) binary = chunk;
    offset += 8 + length;
  }
  if (!json) return fail('The GLB has no model header.');
  return { json, binary };
}

function checkGltf(json: Json) {
  if (json.asset?.version !== '2.0') fail('Only glTF 2.0 models are supported. Export the model as glTF 2.0 or GLB.');
  const unsupported = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];
  const used = new Set([...(json.extensionsUsed || []), ...(json.extensionsRequired || [])]);
  for (const primitive of (json.meshes || []).flatMap((m: Json) => m.primitives || [])) for (const key of Object.keys(primitive.extensions || {})) used.add(key);
  for (const view of json.bufferViews || []) for (const key of Object.keys(view.extensions || {})) used.add(key);
  if (unsupported.some(name => used.has(name))) fail('This model uses Draco or Meshopt compression. Export an uncompressed GLB/glTF for local importing.');
  const allowedRequired = new Set(['KHR_mesh_quantization', 'EXT_mesh_gpu_instancing']);
  for (const name of json.extensionsRequired || []) {
    if (!allowedRequired.has(name) && !String(name).startsWith('KHR_materials_') && !['KHR_texture_transform', 'KHR_lights_punctual', 'KHR_texture_basisu', 'EXT_texture_webp', 'EXT_texture_avif'].includes(name)) fail(`The required glTF extension “${name}” is unsupported. Export a standard uncompressed GLB.`);
  }
  const nodes: Json[] = json.nodes || [];
  if (nodes.length > 4096) fail('This model has too many scene objects. Combine its meshes before importing.');
  const visiting = new Set<number>(), done = new Set<number>();
  const visit = (index: number, depth: number) => {
    if (!Number.isInteger(index) || index < 0 || !nodes[index]) fail('The model has an invalid scene hierarchy.');
    if (visiting.has(index) || depth > 200) fail('The model has a cyclic or excessively deep scene hierarchy.');
    if (done.has(index)) return;
    visiting.add(index);
    for (const child of nodes[index].children || []) visit(child, depth + 1);
    visiting.delete(index); done.add(index);
  };
  nodes.forEach((_, i) => visit(i, 0));
  let vertices = 0, triangles = 0;
  const meshCounts = (json.meshes || []).map((mesh: Json) => {
    let meshVertices = 0, meshTriangles = 0;
    for (const primitive of mesh.primitives || []) {
      const position = json.accessors?.[primitive.attributes?.POSITION];
      meshVertices += position?.count || 0;
      const index = json.accessors?.[primitive.indices];
      meshTriangles += ((index || position)?.count || 0) / 3;
    }
    vertices += meshVertices;triangles += meshTriangles;return { vertices: meshVertices, triangles: meshTriangles };
  });
  if (vertices > IMPORT_LIMITS.vertices || triangles > IMPORT_LIMITS.triangles) fail('This model is too detailed. Reduce it below 500,000 triangles and 1,000,000 vertices.');
  for (const accessor of json.accessors || []) if (!Number.isInteger(accessor.count) || accessor.count < 0 || accessor.count > IMPORT_LIMITS.vertices * 3) fail('The model contains an invalid or excessively large geometry accessor.');
  let sceneVertices = 0, sceneTriangles = 0;
  for (const node of nodes) {
    const counts = meshCounts[node.mesh];if (!counts) continue;
    const instances = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
    const count = instances ? json.accessors?.[Object.values(instances)[0] as number]?.count : 1;
    if (!Number.isInteger(count) || count < 1) fail('The model contains invalid mesh instances.');
    sceneVertices += counts.vertices * count;sceneTriangles += counts.triangles * count;
    if (sceneVertices > IMPORT_LIMITS.vertices || sceneTriangles > IMPORT_LIMITS.triangles) fail('This model has too many mesh instances. Combine or reduce them below 500,000 triangles and 1,000,000 vertices.');
  }
}

function dataBuffer(uri: string): ArrayBuffer {
  const match = /^data:[^,]*;base64,([\s\S]*)$/i.exec(uri);
  if (!match || match[1].length > Math.ceil(IMPORT_LIMITS.totalBytes * 4 / 3) + 4) return fail('The model has an invalid or oversized embedded buffer.');
  try {
    const decoded = atob(match[1]);
    if (decoded.length > IMPORT_LIMITS.totalBytes) return fail('The embedded model data exceeds 100 MB.');
    return Uint8Array.from(decoded, c => c.charCodeAt(0)).buffer;
  } catch (error) { if (error instanceof ModelImportError) throw error; return fail('The model has an invalid embedded binary buffer.'); }
}
function normalizePath(path: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { return fail('The model contains an invalid companion-file path.'); }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decoded) || /^[\\/]/.test(decoded) || decoded.includes('?') || decoded.includes('#')) return fail('External URLs are not loaded. Export an embedded GLB or select the local .bin companion files with the glTF.');
  const parts: string[] = [];
  for (const part of decoded.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return fail('Companion-file paths must stay inside the selected model folder.'); parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}
async function localBuffers(json: Json, files: File[], binary?: ArrayBuffer): Promise<ArrayBuffer[]> {
  let total = 0;
  const reads = new Map<File, Promise<ArrayBuffer>>();
  return Promise.all((json.buffers || []).map(async (buffer: Json, index: number) => {
    let data: ArrayBuffer;
    if (buffer.uri === undefined && index === 0 && binary) data = binary;
    else if (typeof buffer.uri !== 'string') return fail('A glTF binary buffer is missing. Export an embedded GLB or include its .bin files.');
    else if (/^data:/i.test(buffer.uri)) data = dataBuffer(buffer.uri);
    else {
      const path = normalizePath(buffer.uri), base = path.split('/').pop();
      let matches = files.filter(file => normalizePath(file.webkitRelativePath || file.name) === path);
      if (!matches.length) matches = files.filter(file => file.name === base);
      if (matches.length !== 1) return fail(matches.length ? `More than one selected file matches “${base}”. Use a GLB with embedded data instead.` : `Missing companion file “${path}”. Select the glTF and its .bin files together, or export an embedded GLB.`);
      if (!reads.has(matches[0])) reads.set(matches[0], matches[0].arrayBuffer());
      data = await reads.get(matches[0])!;
    }
    total += data.byteLength;
    if (total > IMPORT_LIMITS.totalBytes) return fail('The model’s binary data exceeds 100 MB. Export a smaller model.');
    if (!Number.isInteger(buffer.byteLength) || buffer.byteLength < 0 || buffer.byteLength > data.byteLength) return fail('A model buffer is incomplete or has an invalid declared size.');
    return data;
  }));
}

function stripNonGeometry(json: Json) {
  delete json.materials; delete json.images; delete json.textures; delete json.samplers; delete json.animations; delete json.cameras;
  const keep = (name: string) => ['KHR_mesh_quantization', 'EXT_mesh_gpu_instancing'].includes(name);
  json.extensionsUsed = (json.extensionsUsed || []).filter(keep);
  json.extensionsRequired = (json.extensionsRequired || []).filter(keep);
  delete json.extensions;
  for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) delete primitive.material;
  for (const node of json.nodes || []) {
    delete node.camera;
    if (node.extensions) { for (const key of Object.keys(node.extensions)) if (!keep(key)) delete node.extensions[key]; }
  }
}

function disposeResources(roots: THREE.Object3D[], tracked: Set<THREE.BufferGeometry>, materials = new Set<THREE.Material>()) {
  const textures = new Set<THREE.Texture>();
  for (const root of roots) root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      tracked.add(object.geometry);
      for (const material of [object.material].flat()) materials.add(material);
    }
  });
  for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
  tracked.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose());
}

function bake(roots: THREE.Object3D[], name: string, format: string): ImportedModel {
  const geometries: THREE.BufferGeometry[] = [];
  let vertices = 0, triangles = 0;
  try {
    roots.forEach(root => root.updateMatrixWorld(true));
    const add = (mesh: THREE.Mesh, matrix: THREE.Matrix4) => {
      const source = mesh.geometry, position = source.getAttribute('position');
      if (!position || position.itemSize !== 3 || !position.count) return;
      const rawCount = source.index?.count ?? position.count;
      if (vertices + position.count > IMPORT_LIMITS.vertices || triangles + Math.floor(rawCount / 3) > IMPORT_LIMITS.triangles) fail('This model is too detailed. Reduce it below 500,000 triangles and 1,000,000 vertices, including instances.');
      const output = new Float32Array(position.count * 3), p = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        mesh.getVertexPosition(i, p); p.applyMatrix4(matrix);
        if (![p.x, p.y, p.z].every(v => Number.isFinite(v) && Math.abs(v) <= 1e12)) fail('The model contains invalid or unsupported vertex coordinates. Export it again with applied transforms.');
        p.toArray(output, i * 3);
      }
      const index: number[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      const start = Math.max(0, source.drawRange.start), end = Math.min(rawCount, start + source.drawRange.count);
      if (start % 3 || (end - start) % 3) fail('The model contains incomplete triangles. Export a triangulated mesh.');
      const mirrored = matrix.determinant() < 0;
      for (let i = start; i + 2 < end; i += 3) {
        const ids = [0, 1, 2].map(offset => source.index ? source.index.getX(i + offset) : i + offset);
        if (ids.some(id => !Number.isInteger(id) || id < 0 || id >= position.count)) fail('The model contains invalid triangle indices.');
        a.fromArray(output, ids[0] * 3); b.fromArray(output, ids[1] * 3).sub(a); c.fromArray(output, ids[2] * 3).sub(a);
        if (b.cross(c).lengthSq() < 1e-24) continue;
        if (mirrored) index.push(ids[0], ids[2], ids[1]); else index.push(...ids);
      }
      if (!index.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(output, 3)); geometry.setIndex(index); geometry.computeVertexNormals();
      geometries.push(geometry); vertices += position.count; triangles += index.length / 3;
    };
    for (const root of roots) root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.InstancedMesh) {
        const instance = new THREE.Matrix4();
        for (let i = 0; i < object.count; i++) { object.getMatrixAt(i, instance); add(object, object.matrixWorld.clone().multiply(instance)); }
      } else add(object, object.matrixWorld);
    });
    if (!triangles) fail('No usable triangle mesh was found. Export faces rather than curves, points, or empty objects.');
    const bounds = new THREE.Box3();
    for (const geometry of geometries) { geometry.computeBoundingBox(); bounds.union(geometry.boundingBox!); }
    const size = bounds.getSize(new THREE.Vector3()), largest = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(largest) || largest <= 1e-9) fail('The model has no usable dimensions. Apply a sensible object scale before exporting.');
    const center = bounds.getCenter(new THREE.Vector3()), scale = 3.2 / largest;
    for (const geometry of geometries) {
      geometry.translate(-center.x, -bounds.min.y, -center.z); geometry.scale(scale, scale, scale); geometry.translate(0, -1.6, 0);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    }
    return { name, format, geometries, triangles, vertices };
  } catch (error) { geometries.forEach(g => g.dispose()); throw error; }
}

/** Reads selected files entirely on this device. No URLs, textures, animations, or external decoders are fetched. */
export async function importModel(files: File[]): Promise<ImportedModel> {
  if (!files.length) return fail('Choose a GLB, glTF, OBJ, or STL model to import.');
  if (files.reduce((sum, file) => sum + file.size, 0) > IMPORT_LIMITS.totalBytes) return fail('The selected files exceed 100 MB. Choose a smaller model.');
  const models = files.filter(file => ['glb', 'gltf', 'obj', 'stl'].includes(extension(file.name)));
  if (models.length !== 1) return fail(models.length ? 'Import one model at a time. For glTF, select one .gltf and its companion .bin files.' : 'Choose a supported model: GLB, glTF 2.0, OBJ, or STL.');
  const file = models[0], format = extension(file.name);
  if (!file.size || file.size > IMPORT_LIMITS.modelBytes) return fail('The model must be nonempty and no larger than 50 MB.');
  const tracked = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), roots: THREE.Object3D[] = [];
  let parser: GLTFParser | undefined;
  try {
    const buffer = await file.arrayBuffer();
    if (format === 'glb' || format === 'gltf') {
      const { json, binary } = format === 'glb' ? unpackGLB(buffer) : { json: parseJson(decodeText(buffer)), binary: undefined };
      checkGltf(json); const buffers = await localBuffers(json, files, binary); stripNonGeometry(json);
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(() => fail('This model attempted to load an external resource. Export an embedded, uncompressed GLB.'));
      const loader = new GLTFLoader(manager);
      loader.register(p => {
        parser = p;
        // Resolve parsed buffer dependencies directly from memory: FileLoader/fetch is never used.
        p.loadBuffer = async index => buffers[index] || fail('The model references a missing binary buffer.');
        p.loadTexture = async () => fail('Texture loading is disabled for study imports.');
        const original = p.loadGeometries.bind(p);
        p.loadGeometries = async primitives => { const result = await original(primitives); result.forEach(g => tracked.add(g)); return result; };
        const assignMaterial = p.assignFinalMaterial.bind(p);
        p.assignFinalMaterial = mesh => { assignMaterial(mesh); tracked.add(mesh.geometry); for (const material of [mesh.material].flat()) materials.add(material); };
        return { name: 'FOLDLIGHT_LOCAL_GEOMETRY' };
      });
      const result = await loader.parseAsync(JSON.stringify(json), '');
      roots.push(...result.scenes);
      if (!result.scene) fail('The glTF has no default scene. Export a model with a scene.');
      return bake([result.scene], file.name, format.toUpperCase());
    }
    if (format === 'obj') roots.push(new OBJLoader().parse(decodeText(buffer)));
    else {
      // Validate binary STL counts before the loader allocates arrays from the header.
      const faceCount = buffer.byteLength >= 84 ? new DataView(buffer).getUint32(80, true) : 0;
      const binaryLayout = buffer.byteLength >= 84 && 84 + faceCount * 50 === buffer.byteLength;
      const ascii = !binaryLayout && /^\uFEFF?\s*solid\b/.test(new TextDecoder().decode(buffer.slice(0, 84)));
      if (!ascii) {
        if (buffer.byteLength < 84) fail('This binary STL file is incomplete.');
        const count = faceCount;
        if (count > IMPORT_LIMITS.triangles || count * 3 > IMPORT_LIMITS.vertices) fail('This STL is too detailed. Reduce its triangle count before importing.');
        if (84 + count * 50 !== buffer.byteLength) fail('The binary STL data is incomplete or has an invalid face count.');
      } else if (buffer.byteLength < 84) fail('This STL does not contain usable faces.');
      const geometry = new STLLoader().parse(buffer); tracked.add(geometry);
      roots.push(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    }
    return bake(roots, file.name, format.toUpperCase());
  } catch (error) {
    if (error instanceof ModelImportError) throw error;
    throw new ModelImportError(`Could not read this ${format.toUpperCase()} model. Export a complete, triangulated, uncompressed model and try again.`);
  } finally {
    if (parser) for (const object of parser.associations.keys()) {
      if (object instanceof THREE.Object3D) roots.push(object);
      else if (object instanceof THREE.Material) materials.add(object);
    }
    disposeResources(roots, tracked, materials);
  }
}
