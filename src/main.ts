import './style.css';
import './themes.css';
import { Studio } from './studio';
import { importModel, type ImportedModel } from './import-model';
import { defaults, defaultLight, getLighting, readPresets, writePresets, readStudy, writeStudy, type Settings, type SavedPreset, type Lighting, type ReferenceModel } from './state';
import { descriptions, foldTypes, fabricModels, type ModelType } from './geometry';

const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M3 15v6h18v-6"/>',
    export: '<path d="M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6"/>',
    fold: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
    cube: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9 9-4M3 8l9 4v10"/>',
    reset: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    save: '<path d="M5 3h14v19l-7-4-7 4V3Z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 3m0 3v1"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    camera: '<path d="M3 7h5l2-3h4l2 3h5v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
    orbit: '<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="3"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cube}</svg>`;
};
const labels: Record<ModelType, string> = { pipe: 'Pipe folds', zigzag: 'Zigzag folds', spiral: 'Spiral folds', diaper: 'Diaper folds', tension: 'Tension folds', sphere: 'Sphere', cube: 'Cube', cylinder: 'Cylinder', head: 'Stylized head', sleeve: 'Sleeve', skirt: 'Skirt', hair: 'Swept hair', bust: 'Head & shoulders', hand: 'Relaxed hand', shirt: 'Draped shirt', scarf: 'Shoulder scarf' };
const mini = (type: string) => {
  const paths: Record<string, string> = {
    pipe: 'M9 7v38m9-38c-9 15 9 23 0 38m10-38c-9 15 9 23 0 38m10-38c-9 15 9 23 0 38M9 7h30M9 45h30',
    zigzag: 'm8 8 31 4-27 8 28 6-28 9 28 7M8 8l4 12v15l-4 10m31-33 1 14v16',
    spiral: 'M14 7c7-4 17-4 21 0v36c-7 5-17 5-21 0V7Zm0 4c23 8 21 9 0 14m0-4c23 8 21 9 0 14m0-4c23 8 21 9 0 14',
    diaper: 'M6 7c5 16 31 16 37 0M6 7c1 26 32 32 37 0M6 7c-2 35 35 41 37 0M6 7 9 44c9 5 22 5 31 0l3-37',
    tension: 'm24 6-18 39h36L24 6Zm0 0L14 45m10-39-3 39m3-39 5 39m-5-39 12 39'
  };
  return `<svg viewBox="0 0 50 52" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="${paths[type]}"/></svg>`;
};
const s: Settings = readStudy();
const q = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const fmt = (key: string, value: number) => ['azimuth', 'elevation','modelRotationX','modelRotationY','modelRotationZ'].includes(key) ? `${Math.round(value)}°` : key === 'temperature' ? `${value} K` : ['count', 'bands'].includes(key) ? `${value}` : ['tension', 'gravity', 'sharpness', 'threshold', 'background', 'animeRim', 'animeHighlight'].includes(key) ? `${Math.round(value * 100)}%` : value.toFixed(2);
function range(key: keyof Settings, label: string, min: number, max: number, step: number) {
  return `<label class="range-label" for="${key}"><span>${label}</span><output id="out-${key}">${fmt(key, Number(s[key]))}</output></label><input id="${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}"/>`;
}
function toggle(key: keyof Settings, label: string) { return `<label class="toggle-row"><span>${label}</span><input type="checkbox" data-key="${key}" ${s[key] ? 'checked' : ''}/><span class="switch" aria-hidden="true"></span></label>`; }
function color(key: keyof Settings, label: string) { return `<label class="color-row"><span>${label}</span><span class="color-wrap"><input aria-label="${label}" type="color" data-key="${key}" value="${s[key]}"/><span data-color="${key}">${s[key]}</span></span></label>`; }

q('#app').innerHTML = `
  <header class="app-header"><a class="brand" href="./" aria-label="FoldLight home"><span class="brand-mark">${icon('fold', 26)}</span><span>Fold<span class="brand-light">Light</span><small>A STUDY IN FORM & LIGHT</small></span></a><div class="workspace-title">Your reference studio <span class="slash">/</span> <span>Untitled study</span></div><div class="header-actions"><label class="theme-picker" title="Interface theme">${icon('sun',17)}<select id="theme-select" data-key="theme" aria-label="Interface theme"><option value="system">Device theme</option><option value="light">Light</option><option value="dark">Dark</option></select></label><span class="local-label"><i></i> On your device</span><button id="presets-open" class="text-button">${icon('save', 17)}<span>Presets</span></button><button id="export" class="primary">${icon('export', 17)}<span>Export PNG</span></button></div></header>
  <div class="workspace"><nav class="rail" aria-label="Studio tools"><button class="rail-button active" id="models-nav" aria-label="Choose a reference model" title="Reference models">${icon('fold', 23)}</button><button class="rail-button" id="light-nav" aria-label="Open lighting controls" title="Lighting">${icon('sun', 23)}</button><button class="rail-button" id="appearance-nav" aria-label="Open appearance controls" title="Appearance">${icon('eye', 23)}</button><span class="rail-spacer"></span><button class="rail-button" id="help-open" title="Help and gestures" aria-label="Help and gestures">${icon('help', 22)}</button></nav>
  <main class="main"><div class="toolbar"><div class="model-picker">${icon('cube', 18)}<select id="model-select" aria-label="Reference model"><optgroup label="Fabric studies">${[...foldTypes, 'sleeve', 'skirt', 'shirt', 'scarf'].map(t => `<option value="${t}" ${s.model === t ? 'selected' : ''}>${labels[t as ModelType]}</option>`).join('')}</optgroup><optgroup label="Form studies">${['bust','head','hand','hair','sphere','cube','cylinder'].map(t => `<option value="${t}">${labels[t as ModelType]}</option>`).join('')}</optgroup><optgroup label="Your model" id="imported-group" hidden><option id="imported-option" value="imported">Imported model</option></optgroup></select></div><button id="import-open" class="import-button" title="Import a local 3D model">${icon('upload',16)}<span>Import</span></button><span class="toolbar-divider"></span><div class="shading-tabs" role="group" aria-label="Shading mode"><button data-mode="clay" class="selected"><i class="mode-dot clay"></i>Clay</button><button data-mode="cel"><i class="mode-dot cel"></i>Cel</button><button data-mode="anime"><i class="mode-dot anime"></i>Anime</button><button data-mode="normal"><i class="mode-dot normal"></i>Normals</button></div><button id="inspector-toggle" class="icon-button" aria-expanded="false" aria-controls="study-settings" aria-label="Toggle settings panel" title="Toggle settings panel">${icon('settings')}</button></div>
  <div id="viewport"><div id="file-drop-overlay" hidden><strong>Bring your own reference</strong><span>Drop a GLB, glTF + BIN, OBJ, or STL</span></div><div class="study-heading"><div class="eyebrow">FABRIC STUDY <span id="study-number">04 / 05</span></div><h1 id="study-title">Diaper folds</h1><p id="study-description">${descriptions.diaper}</p><span class="approximation">Stylized parametric study</span></div>
  <div class="camera-tools"><button class="icon-button" id="camera-reset" title="Reset camera" aria-label="Reset camera">${icon('camera',18)}</button><div class="view-buttons" role="group" aria-label="Camera views"><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="back">Back</button><button data-view="quarter" class="selected">¾</button></div><button id="projection" title="Toggle camera projection">Persp.</button></div>
  <div class="navigation-tools" aria-label="Viewport navigation"><div class="navigation-modes" role="group" aria-label="Drag tool"><button data-nav="orbit" title="Orbit tool (O) — drag to rotate">${icon('orbit',17)}<span>Orbit</span></button><button data-nav="pan" title="Move tool (M) — drag to move">${icon('move',17)}<span>Move</span></button></div><div class="navigation-zoom"><button id="zoom-out" aria-label="Zoom out">−</button><button id="frame-view" title="Fit model (F)">Fit</button><button id="zoom-in" aria-label="Zoom in">+</button></div><details class="move-controls"><summary>Move with arrows</summary><div class="pan-pad"><button data-pan="up" aria-label="Move reference up">↑</button><button data-pan="left" aria-label="Move reference left">←</button><button data-pan="down" aria-label="Move reference down">↓</button><button data-pan="right" aria-label="Move reference right">→</button></div></details></div>
  <div id="context-notice" class="context-notice" role="alert" hidden><span>The 3D view paused because the graphics context was lost. Waiting to recover…</span><button id="recover-context">Reload studio</button></div>
  <button id="light-gizmo" aria-label="Drag to move main light" title="Drag to move main light">${icon('sun',23)}<span>KEY LIGHT</span></button>
  <div class="axis" aria-hidden="true"><svg width="60" height="60" viewBox="0 0 60 60"><path d="M29 33 49 39" stroke="#c68277"/><path d="M29 33V10" stroke="#9cae87"/><path d="m29 33-17 14" stroke="#7c9cad"/><circle cx="29" cy="33" r="3" fill="#b6bbb7"/><text x="50" y="43" fill="#c68277">x</text><text x="26" y="8" fill="#9cae87">y</text><text x="5" y="54" fill="#7c9cad">z</text></svg></div>
  <div class="fold-library"><div class="library-heading"><span>THE FOLD LIBRARY</span><span>Five ways fabric falls</span></div><div class="fold-cards">${foldTypes.map((type,i) => `<button class="fold-card ${type === s.model ? 'selected' : ''}" data-model="${type}" aria-label="Select ${labels[type]}" aria-pressed="${type===s.model}"><span class="card-number">0${i+1}</span>${mini(type)}<span>${labels[type].replace(' folds','')}</span><i class="card-check">${icon('check',12)}</i></button>`).join('')}</div></div>
  <div class="viewport-footer"><span><i class="live-dot"></i> LIVE REFERENCE</span><span class="gesture-hint" id="gesture-hint">Drag to orbit · Move tool to pan · Pinch / scroll to zoom</span><span id="quality-label">WebGL / Auto</span></div></div></main>
  <aside id="study-settings" class="inspector" aria-label="Study settings"><div class="inspector-heading"><div><span class="eyebrow">STUDIO CONTROLS</span><h2>Light & form</h2></div><button id="settings-close" class="icon-button" aria-label="Close settings" title="Close settings">${icon('close',18)}</button><button id="reset-all" class="icon-button" title="Reset all settings" aria-label="Reset all settings">${icon('reset',18)}</button></div><div class="inspector-scroll">
  <details id="lighting-panel" open><summary>${icon('sun',16)}<span>Lighting</span><span class="section-tag">01</span></summary><div class="section-content"><div class="light-presets"><button data-light="studio" class="selected">Studio</button><button data-light="dramatic">Dramatic</button><button data-light="rim">Rim</button></div>${range('azimuth','Azimuth',-180,180,1)}${range('elevation','Elevation',5,85,1)}<div class="line"></div>${range('intensity','Key intensity',0,8,0.05)}${range('fill','Ambient fill',0,2,0.01)}${color('lightColor','Light color')}<details class="nested"><summary>More light settings</summary><div>${range('temperature','Temperature',2500,10000,100)}${toggle('secondary','Secondary light')}${toggle('shadows','Cast shadows')}${range('softness','Shadow-map softness',0,6,0.1)}<p class="control-note">Softness filters cast shadows. Cel threshold changes diffuse value bands.</p><button id="reset-light" class="subtle-button">Reset lighting</button></div></details></div></details>
  <details id="model-panel"><summary>${icon('cube',16)}<span>Model & orientation</span><span class="section-tag">02</span></summary><div class="section-content"><p id="imported-info" class="control-note"></p><button id="choose-import" class="subtle-button">Import / replace a model</button><button id="remove-import" class="subtle-button" hidden>Remove imported model</button>${range('modelRotationX','Tilt X',-180,180,1)}${range('modelRotationY','Turn Y',-180,180,1)}${range('modelRotationZ','Roll Z',-180,180,1)}<button id="reset-model-rotation" class="subtle-button">Reset orientation</button><p class="control-note orientation-note">Turn the model itself to change how light meets its planes. Camera orbit keeps the model in place.</p></div></details>
  <details id="fold-panel" open><summary>${icon('fold',16)}<span>Fold geometry</span><span class="section-tag">02</span></summary><div class="section-content"><p id="geometry-note" class="control-note">Shape the cloth. See how the light follows.</p><div id="fold-controls">${range('count','Fold count',2,14,1)}${range('depth','Fold depth',0.04,0.65,0.01)}<details class="nested"><summary>More geometry settings</summary><div>${range('spacing','Fold spacing',0.65,1.8,0.05)}${range('tension','Fabric tension',0,1,0.01)}${range('gravity','Drape intensity',0,1,0.01)}${range('sharpness','Fold sharpness',0,1,0.01)}${range('thickness','Fabric thickness',0.01,0.15,0.005)}</div></details></div></div></details>
  <details id="appearance-panel"><summary>${icon('eye',16)}<span>Appearance</span><span class="section-tag">03</span></summary><div class="section-content">${color('color','Material color')}<div id="cel-controls">${range('bands','Cel value bands',2,5,1)}${range('threshold','Diffuse threshold',0,1,0.01)}${color('shadowHue','Shadow hue')}</div><div id="anime-controls">${range('animeHighlight','Highlight strength',0,1,0.01)}${range('animeRim','Edge light',0,1,0.01)}<p class="control-note">Three painted values, tinted shadows, and crisp light accents. Use contour outlines for an inked silhouette.</p></div>${toggle('silhouette','Silhouette study')}${toggle('wireframe','Wireframe overlay')}${toggle('values','Grayscale value study')}${toggle('outline','Contour outline')}${toggle('facing','Light-facing surfaces')}<p class="control-note" id="mode-note">Clay uses a matte surface with soft light transitions.</p></div></details>
  <details id="scene-panel"><summary>${icon('cube',16)}<span>Scene & performance</span><span class="section-tag">04</span></summary><div class="section-content"><p class="control-note">Interface theme follows the selector in the header. Your study and theme preference are remembered on this device.</p>${toggle('ground','Ground plane')}${toggle('grid','Reference grid')}${toggle('gizmo','Light direction gizmo')}${range('background','Background brightness',0.03,0.5,0.01)}${toggle('reduced','Reduced quality')}<p class="control-note">Reduced quality caps pixel ratio at 1 and lowers mesh and shadow resolution.</p>${toggle('transparentExport','Transparent PNG background')}<p class="control-note">Transparent export isolates the model and omits the ground and grid.</p><button id="install" class="subtle-button">Install / offline help</button></div></details>
  </div><div class="inspector-footer"><span class="tiny-logo">${icon('fold',16)}</span><p>Find the form.<br/><span>Then make it your own.</span></p><span class="version">v1.2</span></div></aside></div>
  <div id="toast" role="status" aria-live="polite"></div>
  <dialog id="import-dialog"><div class="dialog-heading"><div><span class="eyebrow">YOUR MODEL, YOUR STUDY</span><h2>Bring a form into the light.</h2></div><button data-close="import-dialog" class="icon-button" aria-label="Close model import">${icon('close')}</button></div><p>Choose a GLB, glTF, OBJ, or STL. For glTF, select its local .bin files together with the .gltf file. You can also drop files onto the studio.</p><form id="import-form"><label class="file-label" for="model-files">Choose model files<input id="model-files" type="file" multiple accept=".glb,.gltf,.bin,.obj,.stl"/></label><p id="files-summary" class="control-note">No files selected</p><p class="control-note">Models use FoldLight's study materials; original textures and animations are omitted. Models are fitted automatically. Up to 50 MB per model, 100 MB total, and 500,000 triangles.</p><p id="import-status" role="status" aria-live="polite"></p><button id="import-submit" type="submit" class="primary" disabled>Import model</button></form><p class="control-note">Files are processed on your device, without uploads. Your imported model stays available while this studio is open. After reloading, choose the file again.</p></dialog>
  <dialog id="preset-dialog"><div class="dialog-heading"><div><span class="eyebrow">YOUR LIGHTING LIBRARY</span><h2>Saved light, ready to use.</h2></div><button data-close="preset-dialog" class="icon-button" aria-label="Close presets">${icon('close')}</button></div><p>Save the current lighting. Your model, camera, and material stay as you set them.</p><form id="save-form"><input id="preset-name" aria-label="Lighting preset name" placeholder="Name this light setup…" maxlength="48" required/><button class="primary">Save preset</button></form><div id="preset-list"></div><p class="control-note">Stored in this browser, on this device.</p></dialog>
  <dialog id="help-dialog"><div class="dialog-heading"><div><span class="eyebrow">WELCOME TO FOLDLIGHT</span><h2>A little light goes a long way.</h2></div><button data-close="help-dialog" class="icon-button" aria-label="Close help">${icon('close')}</button></div><p>Choose a fold or import a local GLB, glTF, OBJ, or STL. Shape or rotate the model and move the light to study its planes. These are stylized, deterministic approximations, not cloth simulations.</p><div class="help-grid"><strong>Orbit</strong><span>Drag with mouse, finger, or Pencil</span><strong>Zoom</strong><span>Scroll or pinch with two fingers</span><strong>Pan</strong><span>Select Move (M) and drag; or right-drag / two fingers. Arrow keys nudge the view.</span><strong>Move light</strong><span>Drag the gold sun, or use azimuth / elevation</span><strong>Shading</strong><span>Keys 1 / 2 / 3 / 4 · Clay / Cel / Normals / Anime</span><strong>Reset camera</strong><span>Press F or Fit. Double-click the model to focus a point.</span></div><p>Normals encode view-space surface direction in RGB. Light-facing mode marks surfaces facing the key light in gold and away in blue; it ignores occlusion. The little axis shows fixed world directions.</p><p>Export saves a clean PNG at 3,200 pixels on its longest edge, without controls or light indicators. Transparent export also omits the ground and grid.</p><div class="offline-note"><strong id="offline-status">Offline preparation…</strong><p>On iPad, open the production app in Safari, then Share → Add to Home Screen. Open it once online so all app files are cached. No account or server is needed.</p></div></dialog>`;

let studio: Studio;
try { studio = new Studio(q('#viewport'), s); }
catch (error) {
  q('#viewport').innerHTML = '<div class="webgl-error"><h1>WebGL could not start</h1><p>Enable hardware acceleration or open FoldLight in a browser with WebGL 2 support.</p></div>';
  throw error;
}
function toast(message: string) { q('#toast').textContent = message; q('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => q('#toast').classList.remove('visible'), 3400); }
let toastTimer = 0;
let saveTimer=0;
let storageNotice=false;
function remember() { clearTimeout(saveTimer); saveTimer=window.setTimeout(()=>{try { writeStudy(s); } catch { if(!storageNotice){storageNotice=true;toast('Browser storage is unavailable. This study will not be remembered.');} }},200); }
const flushStudy=()=>{clearTimeout(saveTimer);try{writeStudy(s);}catch{/* The current session still works when storage is blocked. */}};
window.addEventListener('pagehide',flushStudy);
const deviceTheme=matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const light=s.theme==='light'||(s.theme==='system'&&!deviceTheme.matches);
  document.documentElement.dataset.theme=light?'light':'dark';
  document.documentElement.style.colorScheme=light?'light':'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',light?'#f5f3ed':'#171a1d');
  studio.setTheme(light);
}
deviceTheme.addEventListener('change',applyTheme);
const geometryKeys = ['count', 'depth', 'spacing', 'tension', 'gravity', 'sharpness', 'thickness'];
function sync() {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach(el => {
    const key = el.dataset.key as keyof Settings;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(s[key]); else el.value = String(s[key]);
    const output = document.getElementById(`out-${key}`); if (output) output.textContent = fmt(key, Number(s[key]));
    const code = document.querySelector(`[data-color="${key}"]`); if (code) code.textContent = String(s[key]).toUpperCase();
  });
  q<HTMLSelectElement>('#model-select').value = s.model;
  const imported=studio.importInfo();
  q('#study-title').textContent = s.model==='imported'?(imported?.name||'Imported model'):labels[s.model];
  q('#study-description').textContent = s.model==='imported'?'Your model, lit with the same tools as the FoldLight library.':descriptions[s.model];
  q<HTMLOptGroupElement>('#imported-group').hidden=!imported;
  q<HTMLOptionElement>('#imported-option').disabled=!imported;
  q('#imported-option').textContent=imported?.name||'Imported model';
  q('#imported-info').textContent=imported?`${imported.name} · ${imported.format.toUpperCase()} · ${imported.triangles.toLocaleString()} triangles · Available for this session`:'Import your own reference, or turn any library model to study another pose under the same light.';
  q('#remove-import').hidden=!imported;
  const index = foldTypes.indexOf(s.model as typeof foldTypes[number]);
  q('#study-number').textContent = s.model==='imported'?'LOCAL MODEL':index >= 0 ? `0${index + 1} / 05` : 'FORM REFERENCE';
  q('.study-heading .eyebrow').firstChild!.textContent = s.model==='imported'?'YOUR REFERENCE ':index >= 0 ? 'FABRIC STUDY ' : 'FORM STUDY ';
  q('.approximation').hidden = s.model==='imported'||['cube','sphere','cylinder'].includes(s.model);
  document.querySelectorAll<HTMLButtonElement>('[data-model]').forEach(b => { const active = b.dataset.model === s.model; b.classList.toggle('selected',active); b.setAttribute('aria-pressed', String(active)); });
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => { const active = b.dataset.mode === s.mode; b.classList.toggle('selected',active); b.setAttribute('aria-pressed',String(active)); });
  const fabric = (fabricModels as readonly string[]).includes(s.model);
  q('#fold-controls').hidden = !fabric;
  q('#geometry-note').textContent = s.model==='shirt' ? 'Shape the cloth. This detailed surface updates when you pause or release a slider.' : fabric ? 'Shape the cloth. See how the light follows.' : 'Geometry controls apply to fabric models. Choose a fold, sleeve, or skirt to shape it.';
  q('#cel-controls').hidden = !['cel','anime'].includes(s.mode);
  q<HTMLInputElement>('#bands').disabled=s.mode==='anime';
  if(s.mode==='anime'){q<HTMLInputElement>('#bands').value='3';q('#out-bands').textContent='3 · fixed';}
  q('#anime-controls').hidden=s.mode!=='anime';
  q('#mode-note').textContent = s.silhouette ? 'A flat silhouette for checking readability and pose. It overrides other shading and value diagnostics.' : s.facing ? 'Gold faces the key light; blue faces away. This diagnostic ignores shadows and shading mode.' : s.mode === 'normal' ? 'View-space normals encoded as RGB. Lighting does not affect this diagnostic.' : s.mode === 'anime' ? 'Anime uses three painted values with light-driven highlights and edge light. Threshold moves the shadow boundary.' : s.mode === 'cel' ? 'Discrete diffuse values. Threshold moves the band boundaries; it does not soften cast shadows.' : 'Clay uses a matte surface with soft light transitions.';
  q('#projection').textContent = s.ortho ? 'Ortho.' : 'Persp.'; q('#projection').setAttribute('aria-pressed',String(s.ortho));
  q('#quality-label').textContent = s.reduced ? 'WebGL / Reduced' : 'WebGL / Auto';
  q('#light-gizmo').hidden = !s.gizmo;
  document.querySelectorAll<HTMLButtonElement>('[data-light]').forEach(button=>{const light=lightSetups[button.dataset.light!];const active=Object.entries(light).every(([key,value])=>typeof value==='number'?Math.abs(Number(s[key as keyof Lighting])-value)<0.001:s[key as keyof Lighting]===value);button.classList.toggle('selected',active);});
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(b=>{const active=b.dataset.nav===s.navigation;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  q('#gesture-hint').textContent=s.navigation==='pan'?'Drag to move · O to orbit · Pinch / scroll to zoom':'Drag to orbit · M to move · Pinch / scroll to zoom';
  remember();
}
let geometryFrame = 0;
let geometryTimer = 0;
let geometryPending = false;
function cancelGeometry() { cancelAnimationFrame(geometryFrame);clearTimeout(geometryTimer);geometryPending=false; }
function flushGeometry() { if(!geometryPending)return;cancelGeometry();studio.regenerate(); }
function scheduleGeometry() {
  cancelGeometry();geometryPending=true;
  if(s.model==='shirt')geometryTimer=window.setTimeout(flushGeometry,160);
  else geometryFrame=requestAnimationFrame(flushGeometry);
}
document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach(el => el.addEventListener('input', () => {
  const key = el.dataset.key as keyof Settings;
  const value = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
  Object.assign(s, { [key]: value });
  if (key === 'temperature') s.lightColor = temperatureColor(s.temperature);
  if (geometryKeys.includes(key)) scheduleGeometry();
  else if (key === 'reduced') studio.setQuality(); else if(key==='theme')applyTheme(); else studio.apply();
  if (key in defaultLight) document.querySelectorAll('[data-light]').forEach(b => b.classList.remove('selected'));
  sync();
}));
document.querySelectorAll<HTMLInputElement>('input[type="range"][data-key]').forEach(el=>el.addEventListener('change',()=>{if(geometryKeys.includes(el.dataset.key!))flushGeometry();}));
function temperatureColor(kelvin: number) {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727 * (t - 60) ** -0.13320476;
  const g = t <= 66 ? 99.470802 * Math.log(t) - 161.119568 : 288.12217 * (t - 60) ** -0.07551485;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.51773 * Math.log(t - 10) - 305.04479;
  return '#' + [r,g,b].map(c => Math.round(Math.min(255,Math.max(0,c))).toString(16).padStart(2,'0')).join('');
}
function setModel(model: ReferenceModel) { cancelGeometry();if(model==='imported'&&!studio.hasImportedModel())return;s.model = model; studio.regenerate(); sync(); }
function setMode(mode: Settings['mode']) { s.mode = mode; if(mode==='anime')s.outline=true; s.facing = false; s.silhouette=false; studio.apply(); if (mode === 'cel'||mode==='anime') q<HTMLDetailsElement>('#appearance-panel').open = true; sync(); }
q<HTMLSelectElement>('#model-select').addEventListener('change', e => setModel((e.target as HTMLSelectElement).value as ReferenceModel));
document.querySelectorAll<HTMLButtonElement>('[data-model]').forEach(b => b.addEventListener('click', () => setModel(b.dataset.model as ModelType)));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode as Settings['mode'])));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.addEventListener('click', () => { studio.view(b.dataset.view!); document.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('selected', x === b)); }));
function resetCamera()  { studio.view('quarter'); document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.classList.toggle('selected', b.dataset.view==='quarter')); }
q('#reset-model-rotation').onclick=()=>{s.modelRotationX=0;s.modelRotationY=0;s.modelRotationZ=0;studio.apply();sync();};
q('#camera-reset').onclick = resetCamera;
q('#frame-view').onclick=resetCamera;
q('#zoom-in').onclick=()=>studio.zoomBy(1.15);
q('#zoom-out').onclick=()=>studio.zoomBy(1/1.15);
const panDirections:Record<string,[number,number]>={up:[0,-.06],down:[0,.06],left:[-.06,0],right:[.06,0]};
document.querySelectorAll<HTMLButtonElement>('[data-pan]').forEach(b=>b.onclick=()=>studio.panBy(...panDirections[b.dataset.pan!]));
function setNavigation(mode:Settings['navigation']){s.navigation=mode;studio.setNavigation(mode);sync();}
document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(b=>b.onclick=()=>setNavigation(b.dataset.nav as Settings['navigation']));
studio.onNavigate=()=>document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('selected'));
studio.onContextStatus=lost=>{q('#context-notice').hidden=!lost;if(!lost)toast('3D view restored');};
q('#recover-context').onclick=()=>location.reload();
q('#projection').onclick = () => { s.ortho = !s.ortho; studio.setProjection(); sync(); };
const lightSetups: Record<string, Lighting> = { studio: {...defaultLight}, dramatic: { ...defaultLight, azimuth: -75, elevation: 22, fill: 0.08, intensity: 4.5, lightColor: '#ffe3bd', temperature: 4300 }, rim: { ...defaultLight, azimuth: 145, elevation: 30, fill: 0.18, intensity: 5.2, lightColor: '#dbe8ff', temperature: 8000, secondary: true } };
function applyLight(light: Lighting) { Object.assign(s, light); studio.apply(); sync(); }
document.querySelectorAll<HTMLButtonElement>('[data-light]').forEach(b => b.onclick = () => { applyLight(lightSetups[b.dataset.light!]); document.querySelectorAll('[data-light]').forEach(x => x.classList.toggle('selected',x===b)); });
q('#reset-light').onclick = () => { applyLight(defaultLight); document.querySelectorAll<HTMLButtonElement>('[data-light]').forEach(b => b.classList.toggle('selected', b.dataset.light==='studio')); toast('Lighting reset to Studio'); };
q('#reset-all').onclick = () => { cancelGeometry();const theme=s.theme;Object.assign(s, defaults,{theme}); studio.setNavigation(s.navigation);applyTheme();studio.setProjection(); studio.setQuality(); studio.view('quarter'); sync(); document.querySelectorAll<HTMLButtonElement>('[data-light]').forEach(b => b.classList.toggle('selected',b.dataset.light==='studio')); document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.classList.toggle('selected',b.dataset.view==='quarter')); toast('Study reset. Theme and saved presets are kept.'); };
q('#export').onclick = async () => {
  const button = q<HTMLButtonElement>('#export'); button.disabled = true;
  try { flushGeometry();const result = await studio.exportPNG(); toast(`PNG exported · ${result.width} × ${result.height}`); }
  catch(error) { toast(error instanceof Error ? error.message : 'Image export failed. Try reduced quality and export again.'); }
  finally { button.disabled = false; }
};
function toggleInspector(force?: boolean) { const open = force ?? !document.body.classList.contains('settings-open'); document.body.classList.toggle('settings-open',open); q('#inspector-toggle').setAttribute('aria-expanded',String(open)); }
q('#inspector-toggle').onclick = () => toggleInspector();
q('#settings-close').onclick=()=>toggleInspector(false);
function openPanel(id: string) { toggleInspector(true); const panel=q<HTMLDetailsElement>(id); panel.open=true; panel.scrollIntoView({block:'nearest',behavior:'smooth'}); }
q('#light-nav').onclick = () => openPanel('#lighting-panel'); q('#appearance-nav').onclick = () => openPanel('#appearance-panel');
q('#models-nav').onclick = () => { q<HTMLSelectElement>('#model-select').focus(); try{q<HTMLSelectElement>('#model-select').showPicker?.();}catch{/* Keyboard selection remains available. */} };
q('#help-open').onclick = () => q<HTMLDialogElement>('#help-dialog').showModal();
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b => b.onclick = () => q<HTMLDialogElement>(`#${b.dataset.close}`).close());
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }));
let pendingFiles:File[]=[];
let importEpoch=0;
function importBusy(busy:boolean){q<HTMLButtonElement>('#import-submit').disabled=busy||pendingFiles.length===0;q<HTMLInputElement>('#model-files').disabled=busy;q('#import-submit').textContent=busy?'Preparing model…':'Import model';q('#import-form').setAttribute('aria-busy',String(busy));}
function chooseFiles(files:File[]){pendingFiles=files;q('#files-summary').textContent=files.length?files.map(f=>f.name).join(' · '):'No files selected';q('#import-status').textContent='';importBusy(false);}
function openImport(files?:File[]){importEpoch++;if(files)chooseFiles(files);else{q('#import-status').textContent='';importBusy(false);}q<HTMLDialogElement>('#import-dialog').showModal();}
q('#import-open').onclick=()=>openImport();q('#choose-import').onclick=()=>openImport();
q<HTMLInputElement>('#model-files').onchange=event=>{importEpoch++;chooseFiles(Array.from((event.target as HTMLInputElement).files||[]));};
q<HTMLDialogElement>('#import-dialog').addEventListener('close',()=>{importEpoch++;importBusy(false);});
q<HTMLFormElement>('#import-form').onsubmit=async event=>{
  event.preventDefault();if(!pendingFiles.length)return;
  const epoch=++importEpoch;importBusy(true);q('#import-status').textContent='Reading the model locally…';
  let asset:ImportedModel|undefined;
  try{
    asset=await importModel(pendingFiles);
    if(epoch!==importEpoch){asset.geometries.forEach(g=>g.dispose());return;}
    cancelGeometry();s.modelRotationX=0;s.modelRotationY=0;s.modelRotationZ=0;
    studio.setImportedModel(asset);s.model='imported';asset=undefined;
    sync();resetCamera();q<HTMLDetailsElement>('#model-panel').open=true;
    q<HTMLDialogElement>('#import-dialog').close();toast('Model imported. Lighting and rendering tools are ready.');
    pendingFiles=[];q<HTMLInputElement>('#model-files').value='';q('#files-summary').textContent='No files selected';q('#import-status').textContent='';importBusy(false);
  }catch(error){
    asset?.geometries.forEach(g=>g.dispose());
    if(epoch===importEpoch)q('#import-status').textContent=error instanceof Error?error.message:'Could not read this model. Try exporting it as GLB, OBJ, or STL.';
  }finally{if(epoch===importEpoch)importBusy(false);}
};
q('#remove-import').onclick=()=>{cancelGeometry();studio.clearImportedModel();sync();resetCamera();toast('Imported model removed from this session.');};
let dropDepth=0;
const hideDrop=()=>{dropDepth=0;q('#file-drop-overlay').hidden=true;};
const isFileDrag=(event:DragEvent)=>Array.from(event.dataTransfer?.types||[]).includes('Files');
const dragEnter=(event:DragEvent)=>{if(isFileDrag(event)){event.preventDefault();dropDepth++;q('#file-drop-overlay').hidden=false;}};
const dragOver=(event:DragEvent)=>{if(isFileDrag(event)){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';}};
const dragLeave=(event:DragEvent)=>{if(isFileDrag(event)&&--dropDepth<=0)hideDrop();};
const dropFiles=(event:DragEvent)=>{if(!isFileDrag(event))return;event.preventDefault();hideDrop();const files=Array.from(event.dataTransfer?.files||[]);if(files.length){const dialog=q<HTMLDialogElement>('#import-dialog');if(dialog.open)dialog.close();openImport(files);}};
document.addEventListener('dragenter',dragEnter);document.addEventListener('dragover',dragOver);document.addEventListener('dragleave',dragLeave);document.addEventListener('drop',dropFiles);window.addEventListener('blur',hideDrop);
let presets: SavedPreset[] = readPresets();
function showPresets() {
  const list=q('#preset-list'); list.replaceChildren();
  if (!presets.length) list.innerHTML = '<div class="empty-presets">Your next favorite light starts here.<small>Save a setup to return to it later.</small></div>';
  presets.forEach(p => {
    const row=document.createElement('div'); row.className='preset-row';
    const dot=document.createElement('i'); dot.style.background=p.lighting.lightColor;
    const name=document.createElement('span'); name.textContent=p.name;
    const load=document.createElement('button'); load.textContent='Load'; load.onclick=()=>{ applyLight(p.lighting); document.querySelectorAll('[data-light]').forEach(b => b.classList.remove('selected')); toast(`Loaded “${p.name}”`); q<HTMLDialogElement>('#preset-dialog').close(); };
    const del=document.createElement('button'); del.textContent='Delete'; del.className='delete'; del.setAttribute('aria-label',`Delete ${p.name}`); del.onclick=()=>{ const next=presets.filter(x=>x.id!==p.id); try { writePresets(next);presets=next;showPresets(); }catch {toast('Browser storage is unavailable.');} };
    row.append(dot,name,load,del);list.append(row);
  });
}
q('#presets-open').onclick=()=>{showPresets();q<HTMLDialogElement>('#preset-dialog').showModal();};
q<HTMLFormElement>('#save-form').onsubmit=e=>{
  e.preventDefault(); const name=q<HTMLInputElement>('#preset-name').value.trim();if(!name)return;
  if(presets.length>=30){toast('Your library holds 30 presets. Delete one to make room.');return;}
  const next=[...presets,{id:globalThis.crypto?.randomUUID?.()||`light-${Date.now()}-${Math.random().toString(36).slice(2)}`,name,lighting:getLighting(s)}];
  try{writePresets(next);presets=next;q<HTMLInputElement>('#preset-name').value='';showPresets();toast('Lighting saved on this device');}catch{toast('Browser storage is unavailable. Allow local storage to save presets.');}
};
const gizmo=q<HTMLButtonElement>('#light-gizmo'); let drag: {x:number;y:number;az:number;el:number;id:number}|null=null;
gizmo.onpointerdown=e=>{ e.preventDefault();gizmo.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,az:s.azimuth,el:s.elevation,id:e.pointerId};gizmo.classList.add('dragging'); };
gizmo.onpointermove=e=>{ if(!drag || drag.id!==e.pointerId)return;s.azimuth=((drag.az+(e.clientX-drag.x)*0.65+180)%360+360)%360-180;s.elevation=Math.max(5,Math.min(85,drag.el-(e.clientY-drag.y)*0.45));studio.apply();sync();document.querySelectorAll('[data-light]').forEach(b=>b.classList.remove('selected')); };
gizmo.onpointerup=gizmo.onpointercancel=gizmo.onlostpointercapture=()=>{drag=null;gizmo.classList.remove('dragging');};
gizmo.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();s.azimuth=Math.max(-180,Math.min(180,s.azimuth+(e.key==='ArrowRight'?5:e.key==='ArrowLeft'?-5:0)));s.elevation=Math.max(5,Math.min(85,s.elevation+(e.key==='ArrowUp'?5:e.key==='ArrowDown'?-5:0)));studio.apply();sync();};
studio.onFrame=()=>{const p=studio.gizmoScreen();gizmo.style.left=`${p.x}px`;gizmo.style.top=`${p.y}px`;};
const shortcuts=(e:KeyboardEvent)=>{if(e.ctrlKey||e.metaKey||e.altKey||(e.target as HTMLElement).matches('input,select,textarea,button,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;if(e.key==='1')setMode('clay');if(e.key==='2')setMode('cel');if(e.key==='3')setMode('normal');if(e.key==='4')setMode('anime');if(e.key.toLowerCase()==='f')resetCamera();if(e.key.toLowerCase()==='o')setNavigation('orbit');if(e.key.toLowerCase()==='m')setNavigation('pan');};
document.addEventListener('keydown',shortcuts);
let installPrompt: Event & {prompt?:()=>Promise<void>} | null=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
q('#install').onclick=async()=>{if(installPrompt?.prompt){await installPrompt.prompt();installPrompt=null;}else q<HTMLDialogElement>('#help-dialog').showModal();};
if('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').then(async reg=>{await navigator.serviceWorker.ready;q('#offline-status').textContent='App ready for offline use';if(reg.waiting)toast('An update is ready. Close and reopen FoldLight to use it.');}).catch(()=>q('#offline-status').textContent='Offline cache unavailable. The app still works online.');
else q('#offline-status').textContent='Offline installation is available in the production build';
if(matchMedia('(min-width: 1001px)').matches)toggleInspector(true);
applyTheme();studio.setNavigation(s.navigation);studio.setQuality();if(s.ortho)studio.setProjection();sync();
// Read-only diagnostics for browser QA; no app state is exposed for mutation.
Object.assign(window,{foldlightDiagnostics:()=>({settings:{...s},memory:studio.stats(),camera:studio.camera.position.toArray(),target:studio.controls.target.toArray(),projection:studio.camera.type,zoom:studio.camera.zoom,theme:document.documentElement.dataset.theme,imported:studio.importInfo(),modelBounds:studio.modelBounds()})});
if(import.meta.hot)import.meta.hot.dispose(()=>{clearTimeout(saveTimer);cancelGeometry();deviceTheme.removeEventListener('change',applyTheme);document.removeEventListener('keydown',shortcuts);window.removeEventListener('pagehide',flushStudy);document.removeEventListener('dragenter',dragEnter);document.removeEventListener('dragover',dragOver);document.removeEventListener('dragleave',dragLeave);document.removeEventListener('drop',dropFiles);window.removeEventListener('blur',hideDrop);importEpoch++;studio.dispose();});
