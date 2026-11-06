import * as THREE from 'three';

export const foldTypes = ['pipe', 'zigzag', 'spiral', 'diaper', 'tension'] as const;
export type FoldType = typeof foldTypes[number];
export const modelTypes = [...foldTypes, 'sphere', 'cube', 'cylinder', 'head', 'sleeve', 'skirt', 'hair', 'bust', 'hand', 'shirt', 'scarf'] as const;
export const fabricModels = [...foldTypes, 'sleeve', 'skirt', 'shirt', 'scarf'] as const;
export type ModelType = typeof modelTypes[number];
export interface FoldSettings { count: number; depth: number; spacing: number; tension: number; gravity: number; sharpness: number; thickness: number }
export const defaultFold: FoldSettings = { count: 5, depth: 0.23, spacing: 1, tension: 0.35, gravity: 0.65, sharpness: 0.15, thickness: 0.035 };
export const descriptions: Record<ModelType, string> = {
  pipe: 'Long, suspended ridges. Follow the light as it rolls across each vertical fold.',
  zigzag: 'Compressed cloth, alternating ridges. Study the changing planes at each bend.',
  spiral: 'Twisting folds around a cylindrical form. Useful for sleeves and wrapped cloth.',
  diaper: 'Two points of support, one quiet fall. Study the nested curves between them.',
  tension: 'Radiating folds gather toward a single attachment. Watch the ridges converge.',
  sphere: 'A continuous turning surface. A simple study of light, halftone, and core shadow.',
  cube: 'Three clear planes. Compare how surface direction changes a single light.',
  cylinder: 'A curved side meets a flat cap. Study the transition between the two.',
  head: 'A simplified head with brow, cheek, nose, and jaw planes. Stylized, not anatomical.',
  sleeve: 'A bent sleeve with compression at the elbow and a softly flared cuff.',
  skirt: 'Radial fabric suspended from a narrow waist, opening into a fluted hem.',
  hair: 'A swept crown, fringe, and tapered locks. Study the broad highlights of a natural hair mass.',
  bust: 'Head, neck, clavicles, and shoulders. A connected upper-body reference for portrait lighting.',
  hand: 'A relaxed open hand, with a curved palm and gently bent fingers. A stylized proportion study.',
  shirt: 'A short-sleeve shirt with shoulder volume, collar, and folds through the waist.',
  scarf: 'Cloth turning over a rounded shoulder support, with two hanging, softly pleated ends.'
};

// Deterministic stylized surfaces, not a physical cloth simulation.
export function surfacePoint(type: ModelType, u: number, v: number, s: FoldSettings): THREE.Vector3 {
  const x = (u * 2 - 1), k = s.count / s.spacing;
  const amplitude = s.depth * (1 - s.tension * 0.55);
  const wave = (phase: number) => {
    const w = Math.sin(phase);
    return Math.sign(w) * Math.pow(Math.abs(w), 1 + s.sharpness * 2.4);
  };
  let px = x * 1.65, py = 1.55 - v * 3.1, pz = 0;
  if (type === 'pipe') {
    px *= 0.88 + v * 0.12;
    pz = amplitude * wave(u * k * Math.PI * 2 + 0.16 * Math.sin(v * 5)) * (0.6 + v * 0.65);
    py -= s.gravity * v * 0.16 * Math.cos(u * k * Math.PI * 2);
  } else if (type === 'zigzag') {
    const bend = Math.sin(v * k * Math.PI);
    px *= 0.85 + 0.13 * Math.cos(v * k * Math.PI);
    pz = amplitude * 1.6 * wave(v * k * Math.PI + x * 1.1 * bend) + 0.12 * x * x;
    py += s.gravity * 0.13 * Math.cos(x * Math.PI) * Math.sin(v * 8);
  } else if (type === 'spiral' || type === 'sleeve') {
    const a = u * Math.PI * 2;
    const bend = type === 'sleeve' ? 0.62 * Math.sin(v * Math.PI * 0.8) : 0;
    const compression = type === 'sleeve' ? 0.22 + Math.exp(-(((v - 0.56) / 0.22) ** 2)) * (0.42 + 0.35 * Math.cos(a)) : 0.6;
    const ridge = wave(a * 2 + v * k * Math.PI * 1.25);
    const radius = (type === 'sleeve' ? 0.55 - v * 0.16 + Math.pow(v, 8) * 0.13 : 0.76) + amplitude * compression * ridge;
    const slope = type === 'sleeve' ? 0.62 * Math.PI * 0.8 * Math.cos(v * Math.PI * 0.8) / 3.1 : 0;
    const crossX = radius * Math.sin(a) / Math.sqrt(1 + slope * slope);
    px = crossX + bend; pz = radius * Math.cos(a);
    py += crossX * slope;
    py += s.gravity * 0.1 * Math.sin(a + v * 6);
  } else if (type === 'diaper') {
    const arch = 1 - x * x;
    py -= s.gravity * 1.0 * arch * (1 - v * 0.45);
    px *= 1 - 0.11 * v;
    pz = amplitude * wave((v - arch * 0.18) * k * Math.PI * 1.4) * (0.25 + arch * 0.95) + arch * s.gravity * 0.35;
  } else if (type === 'tension') {
    px = x * (0.12 + 1.6 * v);
    py -= s.gravity * 0.28 * v * (1 - x * x);
    pz = amplitude * wave(u * k * Math.PI * 2) * Math.pow(v, 0.6) + s.gravity * v * v * 0.3;
  } else if (type === 'skirt') {
    const a = u * Math.PI * 2;
    const phase = a * s.count + (1 / s.spacing - 1) * Math.sin(a);
    const flare = v * v * (3 - 2 * v);
    const r = 0.47 + flare * 0.98 + amplitude * wave(phase) * (0.08 + v * 0.85);
    px = r * Math.sin(a); pz = r * Math.cos(a) * (0.78 + 0.12 * v);
    py += s.gravity * 0.09 * v * Math.cos(phase) + 0.045 * Math.sin(a) * v;
  } else if (type === 'scarf') {
    const fall = Math.abs(v * 2 - 1);
    px = x * (0.56 + fall * 0.15) + 0.14 * Math.sin(v * Math.PI * 2);
    py = 1.3 - (2.7 + s.gravity * 0.3) * Math.pow(fall, 1.65) + s.gravity * 0.07 * Math.cos(u * k * Math.PI * 2) * fall;
    pz = -Math.cos(v * Math.PI) * 0.68 + amplitude * wave(u * k * Math.PI * 2 + v * 0.5) * (0.2 + fall * 0.8);
  }
  return new THREE.Vector3(px, py, pz);
}

export function createFabric(type: ModelType, settings: FoldSettings, reduced = false): THREE.BufferGeometry {
  const nu = reduced ? 72 : 144, nv = reduced ? 64 : 120;
  const periodic = ['spiral', 'sleeve', 'skirt'].includes(type);
  const stride = nu + (periodic ? 0 : 1), count = stride * (nv + 1);
  const positions: number[] = [], indices: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < stride; i++) {
    const p = surfacePoint(type, i / nu, j / nv, settings);
    positions.push(p.x, p.y, p.z);
  }
  // Front winding faces +Z on planar cloth.
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const next = (i + 1) % stride, a = j * stride + i, b = a + stride, c = j * stride + next;
    indices.push(a, b, c, c, b, c + stride);
  }
  const front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  front.setIndex(indices); front.computeVertexNormals();
  const normals = front.getAttribute('normal');
  // Give cloth real volume: front and back surfaces joined along their perimeter.
  for (let i = 0; i < count; i++) {
    positions.push(positions[i * 3] - normals.getX(i) * settings.thickness,
      positions[i * 3 + 1] - normals.getY(i) * settings.thickness,
      positions[i * 3 + 2] - normals.getZ(i) * settings.thickness);
  }
  const frontIndexCount = indices.length;
  for (let i = 0; i < frontIndexCount; i += 3) indices.push(indices[i] + count, indices[i + 2] + count, indices[i + 1] + count);
  const edge = (a: number, b: number) => indices.push(a, b, a + count, b, b + count, a + count);
  for (let i = 0; i < nu; i++) { const next = (i + 1) % stride; edge(next, i); edge(nv * stride + i, nv * stride + next); }
  if (!periodic) for (let j = 0; j < nv; j++) { edge(j * stride, (j + 1) * stride); edge((j + 1) * stride + nu, j * stride + nu); }
  front.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // The shell doubles the vertex count. Three.js reuses an existing normal
  // buffer, so discard the front-only normals before computing the full shell.
  // Otherwise strict WebGL drivers reject the surface draw but still cast shadows.
  front.deleteAttribute('normal');
  front.setIndex(indices); front.computeVertexNormals(); front.computeBoundingBox();
  front.translate(0, -1.6 - front.boundingBox!.min.y, 0);
  front.computeBoundingSphere();
  return front;
}

type Point = [number, number, number];

// Periodic rings give body and hair masses a continuous seam and stable normals.
function ringGeometry(point: (a: number, v: number) => Point, reduced: boolean, cap = true): THREE.BufferGeometry {
  const nu = reduced ? 40 : 72, nv = reduced ? 40 : 72;
  const p: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) p.push(...point(i / nu * Math.PI * 2, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * nu + i, b = a + nu, c = j * nu + (i + 1) % nu;
    idx.push(a, b, c, c, b, c + nu);
  }
  if (cap) for (const row of [0, nv]) {
    const center = new THREE.Vector3();
    for (let i = 0; i < nu; i++) center.add(new THREE.Vector3().fromArray(p, (row * nu + i) * 3));
    center.divideScalar(nu); const c = p.length / 3; p.push(center.x, center.y, center.z);
    for (let i = 0; i < nu; i++) {
      const a = row * nu + i, b = row * nu + (i + 1) % nu;
      if (row === 0) idx.push(c, a, b); else idx.push(c, b, a);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function profile(t: number, knots: number[]): number {
  const x = Math.min(knots.length - 1.000001, Math.max(0, t * (knots.length - 1))), i = Math.floor(x), f = x - i;
  const a = knots[Math.max(0, i - 1)], b = knots[i], c = knots[i + 1], d = knots[Math.min(knots.length - 1, i + 2)];
  return 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
}
function headGeometry(reduced: boolean): THREE.BufferGeometry[] {
  const head = new THREE.SphereGeometry(1, reduced ? 48 : 88, reduced ? 48 : 80), p = head.getAttribute('position');
  const bump = (x: number, y: number, cx: number, cy: number, wx: number, wy: number) => Math.exp(-(((x - cx) / wx) ** 2) - (((y - cy) / wy) ** 2));
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const jaw = y < -0.12 ? 0.77 + (y + 1) * 0.26 : 1;
    x *= 0.87 * jaw;
    if (z > 0) {
      z *= 0.78;
      const front = Math.min(1, z * 4);
      // Broad facial planes rather than separate eyes or a nose glued onto a sphere.
      z += front * (0.11 * bump(x, y, 0, 0.18, 0.13, 0.40) + 0.25 * bump(x, y, 0, -0.06, 0.11, 0.15)
        - 0.11 * bump(Math.abs(x), y, 0.34, 0.23, 0.19, 0.13) + 0.08 * bump(Math.abs(x), y, 0.36, 0.39, 0.26, 0.09)
        + 0.09 * bump(Math.abs(x), y, 0.45, -0.13, 0.26, 0.21) + 0.06 * bump(x, y, 0, -0.38, 0.26, 0.10)
        - 0.025 * bump(x, y, 0, -0.45, 0.28, 0.04));
    } else z *= 0.91;
    p.setXYZ(i, x, y * 1.22 + 0.2, z);
  }
  head.computeVertexNormals();
  const ears = [-1, 1].map(side => {
    const g = new THREE.SphereGeometry(1, 24, 32), a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      a.setXYZ(i, side * (0.79 + x * 0.145), y * 0.25 + 0.04, z * 0.13 - 0.09 + Math.max(0, z) * 0.015);
    }
    g.computeVertexNormals(); return g;
  });
  return [head, ...ears];
}
function neckShoulders(reduced: boolean, shoulders: boolean) {
  return ringGeometry((a, v) => {
    const width = shoulders ? profile(v, [0.28, 0.29, 0.35, 0.80, 1.38, 1.43, 1.25]) : 0.32 + v * 0.12;
    const depth = shoulders ? profile(v, [0.23, 0.24, 0.29, 0.39, 0.51, 0.54, 0.47]) : 0.29 + v * 0.08;
    const x = Math.sin(a) * width;
    const y = (shoulders ? 0.47 - v * 2.0 : -0.61 - v * 0.94);
    const clavicle = shoulders ? 0.035 * Math.exp(-(((v - 0.57) / 0.10) ** 2)) * Math.cos(a * 4) : 0;
    return [x, y, Math.cos(a) * depth - 0.08 + Math.max(0, Math.cos(a)) * clavicle];
  }, reduced);
}
function hairGeometry(reduced: boolean) {
  const cap = ringGeometry((a, v) => {
    const r = Math.sin(v * Math.PI * 0.73) * (0.92 + 0.035 * Math.cos(a * 5));
    return [Math.sin(a) * Math.max(0.01, r), 1.45 - v * 1.30, Math.cos(a) * Math.max(0.01, r) * 0.85 - 0.08];
  }, reduced);
  const specs: { points: Point[]; width: number; depth: number }[] = [
    { points: [[-.48,1.15,-.13],[-.86,.45,-.19],[-.87,-.65,-.14],[-.62,-1.55,.18]], width:.35,depth:.25 },
    { points: [[.48,1.15,-.13],[.85,.45,-.20],[.87,-.65,-.08],[.58,-1.48,.26]], width:.34,depth:.25 },
    { points: [[-.15,1.24,-.48],[-.4,.28,-.64],[-.50,-.74,-.49],[-.28,-1.60,-.17]], width:.39,depth:.24 },
    { points: [[.20,1.24,-.48],[.40,.28,-.63],[.47,-.72,-.46],[.13,-1.53,-.12]], width:.40,depth:.24 },
    { points: [[-.40,1.24,.40],[-.58,.89,.68],[-.47,.39,.76],[-.65,-.08,.64]], width:.27,depth:.14 },
    { points: [[-.10,1.32,.42],[.02,.94,.74],[-.04,.45,.80],[-.20,.14,.77]], width:.28,depth:.13 },
    { points: [[.25,1.30,.39],[.49,.92,.67],[.40,.44,.78],[.27,.03,.72]], width:.28,depth:.14 }
  ];
  return [cap, ...specs.map(({ points, width, depth }) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return ringGeometry((a, v) => {
      const c = curve.getPoint(v), taper = Math.max(0.012, Math.sin(Math.PI * (v * 0.88 + 0.08)) * Math.pow(1 - v, 0.36));
      return [c.x + Math.sin(a) * width * taper, c.y + Math.cos(a) * 0.055 * taper, c.z + Math.cos(a) * depth * taper];
    }, reduced);
  })];
}

const ellipsoid = (x: number, y: number, z: number, c: Point, r: Point) => (Math.hypot((x-c[0])/r[0], (y-c[1])/r[1], (z-c[2])/r[2]) - 1) * Math.min(...r);
const capsule = (x: number, y: number, z: number, a: Point, b: Point, r0: number, r1 = r0) => {
  const dx = b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2];
  const t = Math.max(0, Math.min(1, ((x-a[0])*dx+(y-a[1])*dy+(z-a[2])*dz)/(dx*dx+dy*dy+dz*dz)));
  return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy,z-a[2]-t*dz) - (r0+(r1-r0)*t);
};
const union = (a: number, b: number, k: number) => { const h = Math.max(k-Math.abs(a-b),0)/k; return Math.min(a,b)-h*h*k*.25; };

// A modest, one-time implicit surface builds joined palms/fingers and garment shoulders.
// Vertices shared across tetrahedra are indexed; field gradients provide smooth normals.
function implicitGeometry(field: (x: number, y: number, z: number) => number, min: Point, max: Point, resolution: number) {
  const longest = Math.max(...max.map((v,i)=>v-min[i])), step=longest/resolution;
  const nx=Math.ceil((max[0]-min[0])/step), ny=Math.ceil((max[1]-min[1])/step), nz=Math.ceil((max[2]-min[2])/step);
  const sy=nx+1, sz=sy*(ny+1), values=new Float32Array(sz*(nz+1));
  const coordinate=(id: number): Point => {const iz=Math.floor(id/sz),iy=Math.floor((id-iz*sz)/sy),ix=id%sy;return [min[0]+ix*step,min[1]+iy*step,min[2]+iz*step];};
  for(let iz=0;iz<=nz;iz++)for(let iy=0;iy<=ny;iy++)for(let ix=0;ix<=nx;ix++)values[iz*sz+iy*sy+ix]=field(min[0]+ix*step,min[1]+iy*step,min[2]+iz*step);
  const p: number[]=[], n: number[]=[], idx: number[]=[], edgeCache=new Map<string,number>(), eps=step*.15;
  const vertex=(a: number,b: number) => {
    const key=a<b?`${a},${b}`:`${b},${a}`,known=edgeCache.get(key);if(known!==undefined)return known;
    const av=values[a],bv=values[b],t=av/(av-bv),pa=coordinate(a),pb=coordinate(b),x=pa[0]+(pb[0]-pa[0])*t,y=pa[1]+(pb[1]-pa[1])*t,z=pa[2]+(pb[2]-pa[2])*t;
    const normal=new THREE.Vector3(field(x+eps,y,z)-field(x-eps,y,z),field(x,y+eps,z)-field(x,y-eps,z),field(x,y,z+eps)-field(x,y,z-eps)).normalize();
    if(normal.lengthSq()<.1)normal.set(0,1,0);
    const id=p.length/3;p.push(x,y,z);n.push(normal.x,normal.y,normal.z);edgeCache.set(key,id);return id;
  };
  const triangle=(a: number,b: number,c: number) => {
    const ab=new THREE.Vector3().fromArray(p,b*3).sub(new THREE.Vector3().fromArray(p,a*3)),ac=new THREE.Vector3().fromArray(p,c*3).sub(new THREE.Vector3().fromArray(p,a*3));
    const normal=ab.cross(ac);if(normal.lengthSq()<1e-15)return;
    const expected=new THREE.Vector3().fromArray(n,a*3).add(new THREE.Vector3().fromArray(n,b*3)).add(new THREE.Vector3().fromArray(n,c*3));
    if(normal.dot(expected)<0)idx.push(a,c,b);else idx.push(a,b,c);
  };
  const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  for(let iz=0;iz<nz;iz++)for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
    const a=iz*sz+iy*sy+ix,corners=[a,a+1,a+sy+1,a+sy,a+sz,a+sz+1,a+sz+sy+1,a+sz+sy];
    if(corners.every(i=>values[i]>=0)||corners.every(i=>values[i]<0))continue;
    for(const tet of tets){
      const inside=tet.map(i=>corners[i]).filter(i=>values[i]<0),outside=tet.map(i=>corners[i]).filter(i=>values[i]>=0);
      if(inside.length===1)triangle(...outside.map(i=>vertex(inside[0],i)) as [number,number,number]);
      else if(inside.length===3)triangle(...inside.map(i=>vertex(outside[0],i)) as [number,number,number]);
      else if(inside.length===2){const q=[vertex(inside[0],outside[0]),vertex(inside[0],outside[1]),vertex(inside[1],outside[0]),vertex(inside[1],outside[1])];triangle(q[0],q[1],q[2]);triangle(q[1],q[3],q[2]);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setIndex(idx);return g;
}

function handGeometry(reduced: boolean) {
  const fingers: { start: Point; middle: Point; end: Point; radius: number }[]=[
    {start:[-.34,.37,0],middle:[-.42,1.04,.08],end:[-.45,1.40,.26],radius:.12},
    {start:[-.08,.43,-.01],middle:[-.09,1.18,.05],end:[-.10,1.61,.23],radius:.13},
    {start:[.19,.40,-.02],middle:[.24,1.07,.09],end:[.27,1.45,.29],radius:.12},
    {start:[.41,.28,.01],middle:[.52,.80,.12],end:[.60,1.10,.28],radius:.10},
    {start:[-.42,-.20,.06],middle:[-.76,.12,.22],end:[-1.00,.51,.35],radius:.15}
  ];
  return implicitGeometry((x,y,z)=>{
    let d=union(ellipsoid(x,y,z,[0,-.06,0],[.56,.64,.19]),capsule(x,y,z,[.05,-1.45,-.04],[.02,-.39,-.01],.25,.29),.16);
    d=union(d,ellipsoid(x,y,z,[-.27,-.23,.08],[.28,.42,.22]),.10);
    for(const f of fingers){d=union(d,capsule(x,y,z,f.start,f.middle,f.radius,f.radius*.86),.045);d=union(d,capsule(x,y,z,f.middle,f.end,f.radius*.87,f.radius*.70),.035);}
    return d;
  },[-1.30,-1.82,-.48],[.94,1.88,.72],reduced?64:90);
}
function shirtGeometry(settings: FoldSettings,reduced: boolean) {
  return implicitGeometry((x,y,z)=>{
    const taper=.87+.10*Math.sin((y+.7)*1.3);
    let d=ellipsoid(x,y,z,[0,.05,0],[taper,1.25,.46]);
    // A rounded, elliptical lower cylinder keeps the hem broad instead of pointed.
    const radial=(Math.hypot(x/.74,z/.40)-1)*.40,vertical=Math.abs(y+.44)-.88;
    const lower=Math.hypot(Math.max(radial,0),Math.max(vertical,0))+Math.min(Math.max(radial,vertical),0)-.045;
    d=union(d,lower,.12);
    for(const side of [-1,1])d=union(d,capsule(x,y,z,[side*.52,.86,-.02],[side*1.35,.39,0],.38,.34),.16);
    // Smoothly bevel the collar recess; clip sleeve ends into readable cuff planes.
    const collar=Math.max(Math.hypot(x,z-.03)-.27,1.0-y);
    d=-union(-d,collar,.055);
    d=Math.max(d,Math.abs(x)-1.56);
    const phase=x*settings.count*2/settings.spacing + .65*Math.sin(y*3);
    const w=Math.sin(phase),fold=Math.sign(w)*Math.pow(Math.abs(w),1+settings.sharpness*2);
    const envelope=Math.exp(-(((y+.78)/.65)**2))*(.25+Math.max(0,z));
    d-=settings.depth*(1-settings.tension*.65)*.32*fold*envelope;
    d-=settings.gravity*.045*Math.sin(y*settings.count*3/settings.spacing)*Math.max(0,Math.abs(x)-.5);
    return d-settings.thickness*.22;
  },[-1.92,-1.70,-.76],[1.92,1.75,.82],reduced?56:80);
}
function shirtCollar(reduced: boolean) {
  const g = new THREE.TorusGeometry(.275,.024,8,reduced?48:80),p=g.getAttribute('position');
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getY(i),a=Math.atan2(z,x),cx=Math.cos(a)*.275,cz=Math.sin(a)*.275+.03;
    const y=.05+1.25*Math.sqrt(Math.max(.1,1-(cx/.96)**2-(cz/.46)**2));
    p.setXYZ(i,x,y+p.getZ(i)-.017,z+.03);
  }
  g.computeVertexNormals();return g;
}

function grounded(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  let min=Infinity;
  for(const g of geometries){g.computeBoundingBox();min=Math.min(min,g.boundingBox!.min.y);}
  for(const g of geometries){g.translate(0,-1.6-min,0);g.computeBoundingSphere();}
  return geometries;
}

export function createModel(type: ModelType, settings: FoldSettings, reduced = false): THREE.BufferGeometry[] {
  if (type === 'sphere') return grounded([new THREE.SphereGeometry(1.35, reduced?32:64, reduced?24:48)]);
  if (type === 'cube') return grounded([new THREE.BoxGeometry(2.2, 2.2, 2.2)]);
  if (type === 'cylinder') return grounded([new THREE.CylinderGeometry(0.95, 0.95, 2.8, reduced?32:64)]);
  if (type === 'head') return grounded([...headGeometry(reduced),neckShoulders(reduced,false)]);
  if (type === 'bust') {
    const head=headGeometry(reduced);head.forEach(g=>{g.scale(.72,.72,.72);g.translate(0,.94,0);});
    return grounded([...head,neckShoulders(reduced,true)]);
  }
  if (type === 'hair') return grounded(hairGeometry(reduced));
  if (type === 'hand') return grounded([handGeometry(reduced)]);
  if (type === 'shirt') return grounded([shirtGeometry(settings,reduced),shirtCollar(reduced)]);
  return [createFabric(type, settings, reduced)];
}

