# FoldLight

A standalone, browser-based 3D lighting and fabric reference studio for illustrators. Built with TypeScript, Vite, and Three.js. Built-in models are generated locally, and you can import your own local model files. There are no accounts, backend services, or AI API calls.

## Run locally

Requires Node.js 20.19+ (Node 22.12+ or 24 LTS recommended).

From this directory:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally **http://127.0.0.1:5173/**.

In Windows PowerShell, use `npm.cmd` in place of `npm` if script execution policy blocks `npm.ps1`:

```powershell
cd C:\Projects\FoldLight
npm.cmd install
npm.cmd run dev
```

Dependencies are already installed in the delivered workspace. `package-lock.json` records exact dependency versions; use `npm ci` for subsequent clean installs.

If the environment's npm script PATH cannot find Node, these direct entry points work:

```sh
node scripts/run.mjs dev
node scripts/run.mjs test
node scripts/run.mjs build
node scripts/run.mjs preview
```

## Build and use offline

```sh
npm run build
npm run preview
```

The complete static application is in `dist/`. Preview normally runs at **http://127.0.0.1:4173/**. Serve this folder over HTTP on localhost, or HTTPS on another device. Opening `index.html` directly with `file://` does not support modules or installation.

The production build generates a versioned service worker that precaches the page, JavaScript, styles, manifest, and icons. Open the production app once online and wait for **App ready for offline use** in Help, then install it through the browser. No external fonts or CDN files are needed. Development mode intentionally does not register a worker.

Open **[FoldLight on GitHub Pages](https://zzxc-w.github.io/FoldLight/)**. The public [GitHub repository](https://github.com/zzxc-w/FoldLight) automatically tests, builds, and publishes updates pushed to `main` using `.github/workflows/static.yml`. In repository Settings → Pages, the source is **GitHub Actions**. The workflow uploads only the built `dist/` app. The older private ChatGPT Sites deployment is separate and does not receive these updates.

On iPad Safari, open that address, then use **Share → Add to Home Screen** (enable **Open as Web App** if shown). Launch the new Home Screen icon while online, and open **Settings → Scene & performance → Install / offline help**. Wait for **App ready for offline use** before testing offline use. Actual iPad Safari/Pencil testing remains manual.

v1.3.2 uses the standard iPad status bar and safe-area spacing so the header clears system UI. It also includes a centered, opaque Apple Home Screen icon and separate maskable PWA artwork. iPadOS can retain the icon and status-bar mode from installation: load the updated site in Safari and add a new Home Screen shortcut to pick up those changes.

A plain HTTP LAN address can be used to study the app during development, but does not provide the secure context needed for offline caching. For a LAN interaction preview, run `npm run dev -- --host 0.0.0.0` and open the PC's LAN address with port 5173. The relative-path production build supports the `/FoldLight/` Pages path, including its scoped offline cache. `.openai/hosting.json` is retained for the older Sites deployment and is not used by GitHub Pages.

Updates finish downloading in the background and take effect after all old app tabs/windows close and the app reopens. Each installation path has its own offline cache. Saved lighting presets and study preferences remain in this browser's localStorage. Browser storage clearing or eviction removes them and may remove the offline cache.

## Use the studio

- Pick a fabric from the bottom library, or choose any reference model from the top selector.
- Use **Import** in the top toolbar to study a local GLB, glTF, OBJ, or STL file. See the import instructions below for companion files and supported geometry.
- Choose **Orbit** to rotate the reference, or **Move** to pan it with a normal one-finger/Pencil/mouse drag. Scroll or pinch to zoom. Right-drag remains available for panning. The visible zoom and directional pan buttons provide an alternative to gestures. **O / M** switch tools, and a focused viewport also accepts arrow keys for movement and **+ / −** for zoom.
- Panning follows the screen plane, so moving up/down does not push the reference along the ground. Camera reset clears leftover motion. Switching projection preserves framing.
- Use Front, Side, Back, or ¾ views; switch perspective/orthographic projection. Press **F** to reset the camera.
- Double-click a surface to make that point the orbit center; **Fit** restores a useful view of the whole reference.
- Drag the gold sun to aim the light relative to your current camera view. The aim handle stays still while you drag, then returns to its actual projected position on release; the 3D arrow and shading update during the drag. Movement follows the screen from front and back views and stops at the camera hemisphere's rim. Change camera view or use azimuth/elevation sliders to aim across that rim. There is no initial grab jump, and dragging the light does not move the camera. Sliders and arrow keys on the focused sun provide precise adjustments.
- Adjust intensity, color/temperature, ambient fill, optional secondary light, cast shadows, and shadow-map softness in Lighting.
- Shape fabric with count, depth, spacing, tension, drape, sharpness, and real shell thickness. More controls are in the collapsible sections.
- Imported models show an **Edit model** strip in the viewport with **View / Move / Rotate / Scale**. Move drags the model in the current screen plane, Rotate turns the model under the same lights, and Scale enlarges it when dragging up/right (shrinks down/left). Select View, or the camera's Orbit/Move buttons, to return to camera gestures. A finger, Pencil, or primary mouse drag uses the selected tool; the mouse wheel still zooms.
- **Transform** beside Import opens **Model transform** settings for every reference. Enter exact X/Y/Z position and rotation values, use the ±90° orientation shortcuts to fix a sideways import, and change uniform scale from **0.1× to 5×**. Reset orientation, reset all model transforms, and Place on ground are separate actions. Y position offsets height relative to the default grounded pose; Place on ground rests the model on the ground plane. Fit reframes the reference after large position/scale changes, and shadows follow the transformed reference.
- Keyboard **G / R / S / V** selects model Move / Rotate / Scale / View when not editing an input. Models retain separate transforms while switching references within the current session. Built-in reference settings survive reload; session-only imports do not. Silhouette mode isolates the overall shape, and wireframe reveals surface tessellation.
- Use **1 / 2 / 3 / 4** for Clay / Cel / Normals / Anime when not editing a control. Cel offers 2–5 diffuse value bands, threshold, and shadow hue. The threshold moves shading boundaries; shadow-map softness filters cast shadows independently.
- **Anime** adds broad light/shadow shapes with adjustable sharp highlight and rim strength. It uses the current scene light and geometry, so changing light direction still changes the reference coherently. The optional values view removes hue for value studies.
- Appearance includes contour outlines and a light-facing diagnostic. Gold faces toward the key light; blue faces away. This diagnostic deliberately ignores occlusion and overrides the selected shading mode. Normals encode view-space surface directions in RGB and are independent of lighting.
- Export PNG downloads a clean image, without interface, arrow, or light gizmo, at 3,200 pixels on its longest edge (subject to GPU texture limits). Enable **Transparent PNG background** to get a model cutout for a drawing app; otherwise scene elements remain as configured.
- Presets save/load **lighting only**. There are also Studio, Dramatic, and Rim starters. Reset all restores the study and camera while retaining saved presets.
- The header's theme selector offers **Light**, **Dark**, and **Device theme**. Device theme reacts when the device appearance changes, including while the app is open. The preference is remembered across reloads.
- Study controls are remembered locally so you can resume the selected model, rendering mode, and settings. Lighting presets remain separate named lighting setups. Camera position is not saved.
- Imported files stay in memory for the current session. Switching to a built-in reference keeps the import available in the model selector. Reloading starts from a built-in reference; reselect the file to use it again.
- On narrower screens, the settings button opens an overlay or bottom sheet. Use its close button or tap the settings button again to close it.

## Import your own models

Open **Import** in the top toolbar, select a file, and press **Import model** in the dialog. You can also drop local model files onto the studio to review them in the import dialog. Imported models use the same lighting, clay/cel/anime/normal rendering, contours, rotation tools, and PNG export as built-in references.

Supported inputs:

| Format | Select | What is used |
| --- | --- | --- |
| `.glb` | One GLB file | Mesh geometry, hierarchy transforms, and the default pose |
| `.gltf` | The glTF file plus any referenced local `.bin` files together | Mesh geometry with local buffers |
| `.obj` | One OBJ file | Geometry; MTL files and original materials are not needed |
| `.stl` | One ASCII or binary STL file | Triangle geometry |

FoldLight replaces the source materials, textures, vertex colors, cameras, and lights with its study materials and lighting. It does not play animations. Files are fitted to a useful reference size, centered, and placed above the ground. Choose **Fit** after rotating, zooming, or panning to restore a view of the whole model.

Import processing stays in the browser. Remote geometry/buffer URLs are rejected rather than downloaded; source texture links are omitted without loading. Draco/meshopt compressed geometry is not supported; export an uncompressed GLB or one of the other supported formats. A missing glTF buffer produces a message asking for the companion file. Unsupported, malformed, empty, or oversized imports leave the previous working reference available.

The limits are 50 MB for an individual model file, 100 MB for the full selection, 500,000 triangles, and 1,000,000 vertices. Smaller models are more responsive on tablets. Original files are not modified, uploaded, or saved into browser storage. The imported reference remains available while you switch models in the current session; **Remove imported model** releases it. Closing or reloading the app requires importing the file again.

## Included references

Five distinct, deterministic fold surfaces: **Pipe, Zigzag, Spiral, Diaper, Tension**. They are convincing stylized parametric approximations, explicitly labeled in the interface, rather than cloth simulations. Cylindrical surfaces wrap continuously; every fabric has a joined front/back shell.

Supplementary procedural models include sphere, cube, cylinder, a stylized head, bent sleeve, fluted skirt, and hair. Additional drawing studies include a shoulder bust, hand, shirt torso, and draped scarf. The models are procedural, stylized references rather than anatomical scans; revised head, cloth, and hair shapes emphasize natural transitions and useful planes for light studies.

The app disposes replaced geometries, reuses materials, avoids mesh regeneration during lighting changes, and renders on changes. Camera input is direct, without drifting inertia, and the frame loop pauses while the page is hidden. Pixel ratio is capped at 2; reduced quality caps it at 1, reduces surface tessellation, and uses 1,024-pixel shadows rather than 2,048-pixel shadows. Real iPad frame rates have not been measured.

## Tests

```sh
npm test
npm run build
```

For the browser suite, start the production preview in a separate terminal, then run:

```powershell
$env:TEST_URL = 'http://127.0.0.1:4173/'
$env:TEST_OFFLINE = '1'
npm.cmd run test:browser
```

On macOS/Linux: `TEST_URL=http://127.0.0.1:4173/ TEST_OFFLINE=1 npm run test:browser`.

Browser tests use an installed Chrome by default; set `BROWSER_CHANNEL=msedge` to use installed Edge. They launch a fresh, isolated browser context. Screenshots, the exported image, and the JSON report go in `test-results/` (ignored by Git).

Verified on this workspace with **Chrome 157 on Windows** (earlier update checks also passed on Chrome 156):

- **26 logic tests and 34 production browser checks passed.** These cover simulated safe-area layout in tablet landscape/portrait and smaller windows, opaque centered installation icons and mask safety, the full studio, model transforms with mouse/tablet touch, numeric values and orientation shortcuts, transform retention/reset, scale extremes, camera-relative light drags from both hemispheres, export/drag overlap, local imports, cancelled import races, offline importing, transparent PNG alpha, and WebGL recovery. Browser checks also fail on WebGL draw-validation warnings. Exact results from the latest completed browser run are in `test-results/browser-report.json`.
- Automated geometry tests cover deterministic distinct surfaces, finite normals, complete vertex attributes and in-bounds indices for every built-in model at both quality levels, joined fabric shells, applicable parameter changes, extreme settings, reduced detail, and continuous wrap seams. The full-shell normal-buffer regression catches the iPad fabric visibility bug fixed in v1.3.1.
- Four persistence tests cover invalid stored settings, valid study round-trips, rotation/session-import fallback, and corrupt or unavailable browser storage.
- Import tests cover supported formats and transform baking, local buffers, omitted textures, remote resource rejection, limits, invalid geometry, instance expansion, and temporary resource cleanup.
- Browser checks cover local OBJ/STL/GLB/glTF imports, model rotation and grounding, shading/silhouette/wireframe, failed and cancelled import retention, replacement/removal resource stability, session-only fallback, model export, no-light cel rendering, theme persistence, navigation, responsive touch controls, and scoped offline caches. Offline verification includes importing a local model while the browser is offline. Exact results from the latest run are in `test-results/browser-report.json`.
- TypeScript checking and Vite production build pass. Vite emits a size advisory for the single Three.js application bundle; this is not a build failure.

The browser suite uses Chromium touch emulation; it is **not actual iPad Safari or Apple Pencil testing**. See `MANUAL_TESTING.md` for the remaining hardware checks.

## Source map

```text
src/geometry.ts   Deterministic fabric surfaces, closed shells, supplementary models
src/import-model.ts Local geometry loaders, validation, transform baking, and normalization
src/interaction.ts Camera-relative light/model drag math and uniform scaling
src/studio.ts     WebGL scene, camera, lighting, shared shaders, disposal, PNG export
src/state.ts      Typed defaults, lighting preset validation and local persistence
src/main.ts       Accessible controls, pointer gizmo, responsive panels, PWA registration
src/style.css     Dark studio layout and tablet/mobile adaptations
src/themes.css    Light theme, theme picker, and expanded navigation controls
vite.config.ts   Relative-path build and generated offline service worker
public/          Locally bundled icons, manifest, and third-party notice
tests/           Geometry tests and real-browser functional checks
scripts/         Direct Node task runner and dependency-free icon generation
```

The runtime dependency is Three.js (MIT); see `public/THIRD_PARTY.txt`. Built-in reference geometry and application graphics are generated by this project; imported geometry comes from files you select. Optional side-by-side comparison and physical cloth simulation are outside this version's scope. Anime shading is a drawing reference style; it does not automatically add character textures, facial features, or illustration linework.
