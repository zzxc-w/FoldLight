import { defaultFold, modelTypes, type FoldSettings, type ModelType } from './geometry';
export type Mode = 'clay' | 'cel' | 'anime' | 'normal';
export type ThemePreference = 'system' | 'dark' | 'light';
export type ReferenceModel = ModelType | 'imported';
export interface Lighting { azimuth: number; elevation: number; intensity: number; fill: number; lightColor: string; temperature: number; secondary: boolean; shadows: boolean; softness: number }
export interface Settings extends FoldSettings, Lighting {
  model: ReferenceModel; mode: Mode; color: string; shadowHue: string; bands: number; threshold: number;
  outline: boolean; facing: boolean; ground: boolean; grid: boolean; background: number; reduced: boolean; ortho: boolean; gizmo: boolean;
  theme: ThemePreference; navigation: 'orbit' | 'pan'; animeRim: number; animeHighlight: number; values: boolean; transparentExport: boolean;
  modelRotationX:number; modelRotationY:number; modelRotationZ:number; silhouette:boolean; wireframe:boolean;
  modelPositionX:number; modelPositionY:number; modelPositionZ:number; modelScale:number;
}
export const defaultLight: Lighting = { azimuth: -45, elevation: 38, intensity: 3.2, fill: 0.8, lightColor: '#fff0dc', temperature: 5600, secondary: false, shadows: true, softness: 3 };
export const defaults: Settings = { ...defaultFold, ...defaultLight, model: 'diaper', mode: 'clay', color: '#c5b8a5', shadowHue: '#48445f', bands: 3, threshold: 0.48, outline: false, facing: false, ground: true, grid: false, background: 0.16, reduced: false, ortho: false, gizmo: true, theme: 'system', navigation: 'orbit', animeRim: 0.35, animeHighlight: 0.35, values: false, transparentExport: false, modelRotationX:0,modelRotationY:0,modelRotationZ:0,silhouette:false,wireframe:false,modelPositionX:0,modelPositionY:0,modelPositionZ:0,modelScale:1 };
export interface SavedPreset { id: string; name: string; lighting: Lighting }
const presetKey = 'foldlight.presets.v1';
export function getLighting(s: Settings): Lighting {
  return Object.fromEntries(Object.keys(defaultLight).map(k => [k, s[k as keyof Lighting]])) as unknown as Lighting;
}
export function readPresets(): SavedPreset[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(presetKey) || '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(p => typeof p?.id === 'string' && typeof p?.name === 'string' && validLighting(p.lighting)).slice(0, 30);
  } catch { return []; }
}
export function validLighting(value: unknown): value is Lighting {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const ranges = { azimuth: [-180, 180], elevation: [5, 85], intensity: [0, 8], fill: [0, 2], temperature: [2500, 10000], softness: [0, 6] };
  return Object.entries(ranges).every(([k, [a, b]]) => typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) >= a && (v[k] as number) <= b)
    && typeof v.secondary === 'boolean' && typeof v.shadows === 'boolean' && typeof v.lightColor === 'string' && /^#[0-9a-f]{6}$/i.test(v.lightColor);
}
export function writePresets(presets: SavedPreset[]) { localStorage.setItem(presetKey, JSON.stringify(presets)); }

const studyKey = 'foldlight.study.v2';
const ranges: Partial<Record<keyof Settings, [number, number]>> = {
  count:[2,14],depth:[0.04,0.65],spacing:[0.65,1.8],tension:[0,1],gravity:[0,1],sharpness:[0,1],thickness:[0.01,0.15],
  azimuth:[-180,180],elevation:[5,85],intensity:[0,8],fill:[0,2],temperature:[2500,10000],softness:[0,6],
  bands:[2,5],threshold:[0,1],background:[0.03,0.5],animeRim:[0,1],animeHighlight:[0,1],modelRotationX:[-180,180],modelRotationY:[-180,180],modelRotationZ:[-180,180],modelPositionX:[-10,10],modelPositionY:[-10,10],modelPositionZ:[-10,10],modelScale:[0.1,5]
};
// Ignore unknown/invalid fields so old or malformed storage cannot break startup.
export function validateStudy(value: unknown): Settings {
  const result = { ...defaults };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    const v=obj[key], bounds=ranges[key];
    let valid = false;
    if (bounds) valid = typeof v==='number' && Number.isFinite(v) && v>=bounds[0] && v<=bounds[1] && (!['count','bands'].includes(key) || Number.isInteger(v));
    else if (typeof defaults[key] === 'boolean') valid = typeof v === 'boolean';
    else if (['color','shadowHue','lightColor'].includes(key)) valid = typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    else if(key==='theme') valid = typeof v==='string' && ['system','dark','light'].includes(v);
    else if(key==='navigation') valid = typeof v==='string' && ['orbit','pan'].includes(v);
    else if(key==='mode') valid = typeof v==='string' && ['clay','cel','anime','normal'].includes(v);
    else if(key==='model') valid = modelTypes.includes(v as ModelType);
    if(valid) Object.assign(result,{[key]:v});
  }
  return result;
}
export function readStudy(): Settings {
  try { return validateStudy(JSON.parse(localStorage.getItem(studyKey)||'null')); } catch { return {...defaults}; }
}
export function writeStudy(settings: Settings) {
  // File contents stay in memory for the current session; do not restore a missing model after reload.
  const saved=settings.model==='imported'?{...settings,model:defaults.model,modelRotationX:0,modelRotationY:0,modelRotationZ:0,modelPositionX:0,modelPositionY:0,modelPositionZ:0,modelScale:1}:settings;
  localStorage.setItem(studyKey,JSON.stringify(saved));
}
