import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createModel } from './geometry';
import type { Settings } from './state';
import type { ImportedModel } from './import-model';

export class Studio {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls;
  model = new THREE.Group();
  key = new THREE.DirectionalLight();
  fill = new THREE.AmbientLight();
  rim = new THREE.DirectionalLight('#bbcaff', 1.5);
  ground: THREE.Mesh;
  grid: THREE.GridHelper;
  indicator = new THREE.Group();
  private arrow: THREE.ArrowHelper;
  private material = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 });
  private normalMaterial = new THREE.MeshNormalMaterial();
  private silhouetteMaterial = new THREE.MeshBasicMaterial({ color: '#dfded5', toneMapped: false, side: THREE.DoubleSide });
  private wireMaterial = new THREE.MeshBasicMaterial({ color: '#f9efd7', wireframe: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false });
  private outlineMaterial = new THREE.MeshBasicMaterial({ color: '#25242a', side: THREE.BackSide });
  private facingMaterial: THREE.ShaderMaterial;
  private outlineMeshes: THREE.Mesh[] = [];
  private wireMeshes: THREE.Mesh[] = [];
  private surfaceMeshes: THREE.Mesh[] = [];
  private imported: ImportedModel | null = null;
  private baseCenter = new THREE.Vector3();
  private rotationKey = '';
  private dirty = true;
  private frame = 0;
  private observer: ResizeObserver;
  private disposed = false;
  private lastAspect = 0;
  private navigation: 'orbit' | 'pan' = 'orbit';
  private lightTheme = false;
  private exporting = false;
  private contextLost = false;
  private celUniforms = {
    flCel: { value: 0 }, flBands: { value: 3 }, flThreshold: { value: 0.48 }, flShadow: { value: new THREE.Color('#48445f') },
    flKeyDirection: { value: new THREE.Vector3() }, flKeyStrength: { value: 1 }, flLightEnergy: { value: 1 },
    flAnimeRim: { value: 0.3 }, flAnimeHighlight: { value: 0.3 }, flValues: { value: 0 }
  };
  onFrame?: () => void;
  onNavigate?: () => void;
  onContextStatus?: (lost: boolean) => void;
  constructor(public host: HTMLElement, public settings: Settings) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D reference. Drag to orbit, pinch or scroll to zoom, two fingers or right drag to pan.');
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.addEventListener('keydown', this.keyboard);
    this.renderer.domElement.addEventListener('dblclick', this.focusPoint);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLoss);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.contextRestore);
    host.prepend(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(4.1, 2.0, 7.6);
    this.controls = this.makeControls();
    this.scene.add(this.model, this.key, this.key.target, this.fill, this.rim, this.indicator);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 20 });
    this.key.shadow.bias = -0.00035;
    this.key.shadow.normalBias = 0.025;
    this.rim.position.set(3, 1, -4);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#434a49', roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -1.78; this.ground.receiveShadow = true;
    this.grid = new THREE.GridHelper(12, 30, '#626663', '#414648'); this.grid.position.y = -1.775;
    this.scene.add(this.ground, this.grid);
    this.arrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, '#e0bd80', 0.15, 0.08);
    this.indicator.add(this.arrow);
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.celUniforms);
      shader.fragmentShader = `uniform float flCel; uniform float flBands; uniform float flThreshold; uniform vec3 flShadow;
        uniform vec3 flKeyDirection; uniform float flKeyStrength; uniform float flLightEnergy;
        uniform float flAnimeRim; uniform float flAnimeHighlight; uniform float flValues;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        if (flCel > 0.5) {
          vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
          float baseLum = max(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722)), 0.001);
          float value = dot(totalDiffuse, vec3(0.2126,0.7152,0.0722)) / baseLum;
          float shifted = clamp(value * 0.65 + (0.5 - flThreshold), 0.0, 1.0);
          vec3 hue = totalDiffuse / max(value, 0.001);
          if (flCel > 1.5) {
            // Three painted values follow the same diffuse irradiance, including cast shadows.
            float lit = step(flThreshold, clamp(value * 0.8, 0.0, 1.0));
            float halfTone = step(max(0.04, flThreshold - 0.18), clamp(value * 0.8, 0.0, 1.0));
            vec3 shadowPaint = diffuseColor.rgb * mix(vec3(0.35), flShadow * 1.8, 0.65);
            shadowPaint *= clamp(value * 2.0, 0.0, 1.0);
            vec3 paint = mix(shadowPaint, hue * 0.65, halfTone * 0.35);
            paint = mix(paint, hue * 1.15, lit);
            vec3 keyView = normalize((viewMatrix * vec4(flKeyDirection, 0.0)).xyz);
            vec3 halfway = normalize(keyView + geometryViewDir);
            float highlight = step(0.965, max(dot(geometryNormal, halfway), 0.0)) * lit;
            float rim = step(0.6, pow(1.0 - max(dot(geometryNormal, geometryViewDir), 0.0), 2.3));
            rim *= smoothstep(0.05, 0.5, dot(geometryNormal, keyView)) * lit;
            paint += hue * flKeyStrength * (highlight * flAnimeHighlight * 0.75 + rim * flAnimeRim);
            reflectedLight.directDiffuse = paint;
          } else {
            float band = floor(shifted * (flBands - 0.001)) / (flBands - 1.0);
            reflectedLight.directDiffuse = mix(flShadow * diffuseColor.rgb * 0.8, hue * 1.25, band) * flLightEnergy;
          }
          reflectedLight.indirectDiffuse = vec3(0.0);
          reflectedLight.directSpecular = vec3(0.0);
          reflectedLight.indirectSpecular = vec3(0.0);
        }`);
      // Apply the value check after tone mapping, color conversion, and fog so
      // non-neutral tone curves cannot reintroduce hue into a grayscale study.
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        if (flValues > 0.5) gl_FragColor.rgb = vec3(dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
      `);
    };
    this.outlineMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * 0.018;');
    };
    this.facingMaterial = new THREE.ShaderMaterial({
      uniforms: { lightDirection: { value: new THREE.Vector3() } },
      vertexShader: 'varying vec3 vN; void main(){ vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vN; uniform vec3 lightDirection; void main(){float d=dot(normalize(vN),normalize(lightDirection));gl_FragColor=vec4(mix(vec3(0.16,0.21,0.34),vec3(0.88,0.69,0.33),smoothstep(-0.03,0.03,d)),1.0); #include <colorspace_fragment> }'.replace(' #include', '\n#include').replace('> }', '>\n}'),
      side: THREE.DoubleSide
    });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.regenerate(); this.apply(); this.resize(); this.view('quarter'); this.loop();
    document.addEventListener('visibilitychange', this.visibility);
  }
  private makeControls() {
    const c = new OrbitControls(this.camera, this.renderer.domElement);
    // Direct manipulation avoids the drifting target that made small pans difficult.
    c.enableDamping = false; c.rotateSpeed = 0.65; c.panSpeed = 0.8; c.zoomSpeed = 0.75;
    c.screenSpacePanning = true; c.zoomToCursor = false;
    c.minDistance = 2; c.maxDistance = 35;
    c.minZoom = 0.15; c.maxZoom = 6; c.target.set(0, -0.1, 0); c.maxPolarAngle = Math.PI * 0.97;
    c.mouseButtons.LEFT = this.navigation === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    c.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    c.touches.ONE = this.navigation === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    c.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    c.addEventListener('start', () => this.onNavigate?.());
    c.addEventListener('change', () => this.invalidate()); c.update(); return c;
  }
  setNavigation(mode: 'orbit' | 'pan') {
    this.navigation = mode;
    this.controls.mouseButtons.LEFT = mode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = mode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    this.renderer.domElement.style.cursor = mode === 'pan' ? 'grab' : 'default';
    this.renderer.domElement.setAttribute('aria-label', `Interactive 3D reference. Drag to ${mode}, pinch or scroll to zoom. Arrow keys pan; plus and minus zoom.`);
  }
  zoomBy(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.onNavigate?.();
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, this.controls.minZoom, this.controls.maxZoom);
      this.camera.updateProjectionMatrix();
    } else {
      const offset = this.camera.position.clone().sub(this.controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() / factor, this.controls.minDistance, this.controls.maxDistance);
      this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    }
    this.controls.update(); this.invalidate();
  }
  panBy(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.onNavigate?.(); this.camera.updateMatrixWorld();
    const height = this.camera instanceof THREE.PerspectiveCamera
      ? 2 * this.camera.position.distanceTo(this.controls.target) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
      : (this.camera.top - this.camera.bottom) / this.camera.zoom;
    const width = height * this.host.clientWidth / Math.max(1, this.host.clientHeight);
    // Translate camera and orbit center together, in the current screen plane.
    const move = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(-x * width)
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1), y * height);
    this.camera.position.add(move); this.controls.target.add(move); this.controls.update(); this.invalidate();
  }
  private keyboard = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const amount = event.shiftKey ? 0.08 : 0.025;
    if (event.key === 'ArrowLeft') this.panBy(-amount, 0);
    else if (event.key === 'ArrowRight') this.panBy(amount, 0);
    else if (event.key === 'ArrowUp') this.panBy(0, -amount);
    else if (event.key === 'ArrowDown') this.panBy(0, amount);
    else if (event.key === '+' || event.key === '=') this.zoomBy(1.12);
    else if (event.key === '-' || event.key === '_') this.zoomBy(1 / 1.12);
    else return;
    event.preventDefault();
  };
  private focusPoint = (event: MouseEvent) => {
    if (event.button !== 0 || this.contextLost || this.exporting) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(pointer, this.camera);
    const hit = ray.intersectObjects(this.surfaceMeshes, false)[0];
    if (!hit) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(hit.point); this.camera.position.copy(hit.point).add(offset);
    this.controls.update(); this.onNavigate?.(); this.invalidate();
  };
  private contextLoss = (event: Event) => { event.preventDefault(); this.contextLost = true; this.onContextStatus?.(true); };
  private contextRestore = () => { this.contextLost = false; this.apply(); this.onContextStatus?.(false); };
  invalidate() { this.dirty = true; }
  private visibility = () => { if (!document.hidden && !this.frame) { this.invalidate(); this.loop(); } };
  private loop = () => {
    this.frame = 0;
    if (this.disposed || document.hidden) return;
    this.controls.update();
    if (this.dirty && !this.exporting && !this.contextLost) {
      // Keep the model outside fog even after zooming out on portrait screens.
      const distance = this.camera.position.distanceTo(this.controls.target);
      if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = distance + 3; this.scene.fog.far = distance + 18; }
      this.renderer.render(this.scene, this.camera); this.onFrame?.(); this.dirty = false;
    }
    this.frame = requestAnimationFrame(this.loop);
  };
  resize() {
    if (this.exporting) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const a = w / h;
    if (this.lastAspect) {
      const factor = this.fitDistance(a) / this.fitDistance(this.lastAspect);
      if (this.camera instanceof THREE.PerspectiveCamera) this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target);
      else this.camera.zoom /= factor;
    }
    this.lastAspect = a;
    if (this.camera instanceof THREE.PerspectiveCamera) this.camera.aspect = a;
    else { this.camera.left = -2.6 * a; this.camera.right = 2.6 * a; this.camera.top = 2.6; this.camera.bottom = -2.6; }
    this.camera.updateProjectionMatrix(); this.invalidate();
  }
  private releaseCurrentModel() {
    const geometries = new Set<THREE.BufferGeometry>();
    this.model.traverse(o => { if (o instanceof THREE.Mesh) geometries.add(o.geometry); });
    this.model.clear();
    const retained = new Set(this.imported?.geometries || []);
    geometries.forEach(g => { if (!retained.has(g)) g.dispose(); });
    this.surfaceMeshes = []; this.outlineMeshes = []; this.wireMeshes = [];
  }
  setImportedModel(asset: ImportedModel) {
    if (asset === this.imported) { this.showImportedModel(); return; }
    this.releaseCurrentModel();
    new Set(this.imported?.geometries || []).forEach(g => g.dispose());
    this.imported = asset;
    this.settings.model = 'imported';
    this.regenerate(); this.view('quarter');
  }
  showImportedModel() {
    if (!this.imported) return;
    this.settings.model = 'imported';
    this.regenerate(); this.view('quarter');
  }
  clearImportedModel() {
    const active = this.settings.model === 'imported';
    if (active) this.releaseCurrentModel();
    new Set(this.imported?.geometries || []).forEach(g => g.dispose());
    this.imported = null;
    if (active) { this.settings.model = 'diaper'; this.regenerate(); this.view('quarter'); }
  }
  hasImportedModel() { return this.imported !== null; }
  importInfo() {
    if (!this.imported) return null;
    const { name, format, triangles, vertices } = this.imported;
    return { name, format, triangles, vertices };
  }
  regenerate() {
    this.releaseCurrentModel();
    if (this.settings.model === 'imported' && !this.imported) this.settings.model = 'diaper';
    const geometries = this.settings.model === 'imported'
      ? this.imported!.geometries
      : createModel(this.settings.model, this.settings, this.settings.reduced);
    const bounds = new THREE.Box3();
    for (const geometry of geometries) { geometry.computeBoundingBox(); bounds.union(geometry.boundingBox!); }
    bounds.getCenter(this.baseCenter);
    for (const geometry of geometries) {
      const mesh = new THREE.Mesh(geometry, this.material); mesh.castShadow = true; mesh.receiveShadow = true;
      const outline = new THREE.Mesh(geometry, this.outlineMaterial); outline.renderOrder = 1;
      const wire = new THREE.Mesh(geometry, this.wireMaterial); wire.renderOrder = 2;
      for (const part of [mesh, outline, wire]) part.position.copy(this.baseCenter).negate();
      this.model.add(mesh, outline, wire);
      this.surfaceMeshes.push(mesh); this.outlineMeshes.push(outline); this.wireMeshes.push(wire);
    }
    this.rotationKey = '';
    this.apply();
  }
  private applyModelRotation() {
    const s = this.settings, key = `${s.modelRotationX},${s.modelRotationY},${s.modelRotationZ}`;
    if (key === this.rotationKey) return;
    this.rotationKey = key;
    this.model.rotation.set(THREE.MathUtils.degToRad(s.modelRotationX), THREE.MathUtils.degToRad(s.modelRotationY), THREE.MathUtils.degToRad(s.modelRotationZ));
    this.model.position.copy(this.baseCenter);
    // An exact minimum avoids hovering spheres or diagonal imports. Compute it
    // only when rotation/model changes, not while lighting sliders are dragged.
    const matrix = new THREE.Matrix4().makeRotationFromEuler(this.model.rotation).elements;
    let minimum = Infinity;
    for (const mesh of this.surfaceMeshes) {
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = matrix[1] * (p.getX(i) - this.baseCenter.x) + matrix[5] * (p.getY(i) - this.baseCenter.y) + matrix[9] * (p.getZ(i) - this.baseCenter.z) + this.baseCenter.y;
        minimum = Math.min(minimum, y);
      }
    }
    if (Number.isFinite(minimum)) this.model.position.y += -1.6 - minimum;
    this.model.updateMatrixWorld(true);
  }
  apply() {
    const s = this.settings, az = THREE.MathUtils.degToRad(s.azimuth), el = THREE.MathUtils.degToRad(s.elevation);
    const direction = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    this.key.position.copy(direction).multiplyScalar(7);
    this.key.intensity = s.intensity; this.key.color.set(s.lightColor); this.key.castShadow = s.shadows;
    this.key.shadow.radius = s.softness;
    this.fill.intensity = s.fill; this.rim.visible = s.secondary;
    this.renderer.shadowMap.enabled = s.shadows;
    this.material.color.set(s.color);
    this.celUniforms.flCel.value = s.mode === 'anime' ? 2 : s.mode === 'cel' ? 1 : 0;
    this.celUniforms.flBands.value = s.bands; this.celUniforms.flThreshold.value = s.threshold; this.celUniforms.flShadow.value.set(s.shadowHue);
    this.celUniforms.flKeyDirection.value.copy(direction);
    this.celUniforms.flKeyStrength.value = Math.min(s.intensity / 3.2, 1.5);
    this.celUniforms.flLightEnergy.value = Math.min(1, Math.max(0, s.intensity + s.fill + (s.secondary ? this.rim.intensity : 0)));
    this.celUniforms.flAnimeRim.value = s.animeRim;
    this.celUniforms.flAnimeHighlight.value = s.animeHighlight;
    this.celUniforms.flValues.value = s.values ? 1 : 0;
    this.facingMaterial.uniforms.lightDirection.value.copy(direction);
    const side = s.model === 'imported' ? THREE.DoubleSide : THREE.FrontSide;
    for (const material of [this.material, this.normalMaterial]) if (material.side !== side) { material.side = side; material.needsUpdate = true; }
    this.surfaceMeshes.forEach(mesh => { mesh.material = s.silhouette ? this.silhouetteMaterial : s.facing ? this.facingMaterial : s.mode === 'normal' ? this.normalMaterial : this.material; });
    this.applyModelRotation();
    this.outlineMeshes.forEach(m => m.visible = s.outline);
    this.wireMeshes.forEach(m => m.visible = s.wireframe);
    this.ground.visible = s.ground; this.grid.visible = s.grid; this.indicator.visible = s.gizmo;
    const brightness = this.lightTheme ? THREE.MathUtils.clamp(0.94 + (s.background - 0.16) * 0.5, 0.72, 1) : s.background;
    const background = new THREE.Color().setRGB(brightness, Math.min(1, brightness * (this.lightTheme ? 0.995 : 1.04)), Math.min(1, brightness * (this.lightTheme ? 0.98 : 1.07)), THREE.SRGBColorSpace);
    this.scene.background = background;
    this.scene.fog = new THREE.Fog(background, 12, 28);
    const origin = direction.clone().multiplyScalar(2.7);
    this.arrow.position.copy(origin); this.arrow.setDirection(direction.clone().negate()); this.arrow.setLength(0.78, 0.14, 0.08);
    this.invalidate();
  }
  setTheme(light: boolean) {
    this.lightTheme = light;
    this.silhouetteMaterial.color.set(light ? '#19251d' : '#dfded5');
    this.wireMaterial.color.set(light ? '#243825' : '#f9efd7');
    (this.ground.material as THREE.MeshStandardMaterial).color.set(light ? '#c8c9c4' : '#434a49');
    const colors = this.grid.geometry.getAttribute('color'), color = new THREE.Color(light ? '#909890' : '#626b66');
    for (let i = 0; i < colors.count; i++) colors.setXYZ(i, color.r, color.g, color.b);
    colors.needsUpdate = true;
    this.apply();
  }
  setQuality() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.settings.reduced ? 1 : 2));
    const size = this.settings.reduced ? 1024 : 2048;
    this.key.shadow.mapSize.set(size, size); this.key.shadow.map?.dispose(); this.key.shadow.map = null;
    this.regenerate(); this.resize();
  }
  setProjection() {
    const pos = this.camera.position.clone(), target = this.controls.target.clone();
    const distance = pos.distanceTo(target), tangent = Math.tan(THREE.MathUtils.degToRad(18));
    const visibleHeight = this.camera instanceof THREE.OrthographicCamera
      ? (this.camera.top - this.camera.bottom) / this.camera.zoom
      : distance * tangent * 2;
    this.controls.dispose();
    this.camera = this.settings.ortho ? new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 100) : new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    if (this.camera instanceof THREE.OrthographicCamera) this.camera.zoom = 5.2 / visibleHeight;
    else pos.sub(target).setLength(visibleHeight / (tangent * 2)).add(target);
    this.camera.position.copy(pos); this.controls = this.makeControls(); this.controls.target.copy(target); this.controls.update(); this.resize();
    this.setNavigation(this.navigation);
  }
  view(name: string) {
    const positions: Record<string, number[]> = { front: [0, 0.5, 8.5], side: [8.5, 0.5, 0], back: [0, 0.5, -8.5], quarter: [4.1, 2, 7.6] };
    const center = new THREE.Box3().setFromObject(this.model).getCenter(new THREE.Vector3());
    const distance = this.fitDistance(this.host.clientWidth / Math.max(1, this.host.clientHeight));
    this.camera.position.fromArray(positions[name] || positions.quarter).normalize().multiplyScalar(distance).add(center);
    this.camera.zoom = this.camera instanceof THREE.OrthographicCamera ? 2.6 / (distance * Math.tan(THREE.MathUtils.degToRad(18))) : 1;
    this.camera.updateProjectionMatrix();
    // A fresh controller clears any pointer, dolly, and orbit deltas before a preset.
    this.controls.dispose(); this.controls = this.makeControls(); this.controls.target.copy(center); this.controls.update();
    this.setNavigation(this.navigation); this.invalidate();
  }
  private fitDistance(aspect: number) {
    const size = new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3());
    const tangent = Math.tan(THREE.MathUtils.degToRad(18));
    const width = Math.max(4.2, Math.hypot(size.x, size.z) * 1.12);
    return Math.max(9.6, width / (2 * tangent * Math.max(0.1, aspect)), size.y / (2 * tangent * 0.65));
  }
  gizmoScreen() {
    const p = this.key.position.clone().normalize().multiplyScalar(2.7).project(this.camera);
    return { x: Math.max(40, Math.min(this.host.clientWidth - 40, (p.x * 0.5 + 0.5) * this.host.clientWidth)), y: Math.max(90, Math.min(this.host.clientHeight - 100, (-p.y * 0.5 + 0.5) * this.host.clientHeight)) };
  }
  async exportPNG() {
    if (this.contextLost) throw new Error('WebGL is recovering. Wait for the reference to reappear.');
    if (this.exporting) throw new Error('An export is already in progress.');
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) throw new Error('Open the viewport before exporting an image.');
    const scale = Math.min(3200 / Math.max(w, h), this.renderer.capabilities.maxTextureSize / Math.max(w, h));
    const clearColor = this.renderer.getClearColor(new THREE.Color()), clearAlpha = this.renderer.getClearAlpha();
    const controlsEnabled = this.controls.enabled;
    const filename = `foldlight-${this.settings.model}-${this.settings.mode}.png`;
    try {
      this.exporting = true; this.controls.enabled = false;
      this.indicator.visible = false;
      if (this.settings.transparentExport) {
        this.scene.background = null; this.scene.fog = null; this.ground.visible = false; this.grid.visible = false;
        this.renderer.setClearColor(0x000000, 0);
      }
      this.renderer.setPixelRatio(1); this.renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
      const distance = this.camera.position.distanceTo(this.controls.target);
      if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = distance + 3; this.scene.fog.far = distance + 18; }
      this.renderer.render(this.scene, this.camera);
      const blob = await new Promise<Blob>((resolve, reject) => this.renderer.domElement.toBlob(b => b ? resolve(b) : reject(new Error('Unable to create image')), 'image/png'));
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { width: Math.round(w * scale), height: Math.round(h * scale) };
    } finally {
      this.renderer.setClearColor(clearColor, clearAlpha);
      this.controls.enabled = controlsEnabled; this.exporting = false;
      // Controls remain usable while toBlob completes. Reapply current settings
      // rather than restoring an old ground/theme snapshot over the user's edits.
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.settings.reduced ? 1 : 2));
      this.apply(); this.resize(); this.invalidate();
    }
  }
  modelBounds() {
    const bounds = new THREE.Box3();
    for (const mesh of this.surfaceMeshes) bounds.expandByObject(mesh, true);
    if (bounds.isEmpty()) return null;
    return { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new THREE.Vector3()).toArray() };
  }
  stats() {
    let vertices = 0, modelTriangles = 0;
    const geometries = new Set(this.surfaceMeshes.map(mesh => mesh.geometry));
    for (const g of geometries) { vertices += g.getAttribute('position').count; modelTriangles += (g.index?.count || g.getAttribute('position').count) / 3; }
    return { geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, triangles: this.renderer.info.render.triangles, modelGeometries: geometries.size, vertices, modelTriangles };
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); document.removeEventListener('visibilitychange', this.visibility); this.controls.dispose();
    this.renderer.domElement.removeEventListener('keydown', this.keyboard);
    this.renderer.domElement.removeEventListener('dblclick', this.focusPoint);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLoss);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestore);
    const geometries = new Set<THREE.BufferGeometry>(this.imported?.geometries || []); this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) geometries.add(o.geometry); }); geometries.forEach(g => g.dispose());
    this.imported = null;
    [this.material, this.normalMaterial, this.silhouetteMaterial, this.wireMaterial, this.outlineMaterial, this.facingMaterial, this.ground.material, this.grid.material, this.arrow.line.material, this.arrow.cone.material].flat().forEach(m => m.dispose());
    this.key.shadow.dispose(); this.renderer.dispose();
  }
}
