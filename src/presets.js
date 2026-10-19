import { DEFAULT_EFFECTS } from './effects.js';
import { DEFAULT_FINISH } from './processing.js';

export const STORAGE_KEY = 'pockerec-presets-v1';
export const MAX_PRESETS = 30;
export const MAX_FILE_BYTES = 65536;
const format = 'pockerec-presets';
const version = 1;
const bounds = {
  gainDb: [-18, 18], fadeInSeconds: [0, 5], fadeOutSeconds: [0, 5],
  highPassHz: [0, 400], lowDb: [-12, 12], midDb: [-12, 12], highDb: [-12, 12],
  gateThresholdDb: [-80, -15], compressorThresholdDb: [-40, 0], compressorRatio: [1, 8],
};
const config = (effects = {}, finishing = {}) => ({
  effects: {...DEFAULT_EFFECTS, ...effects}, finishing: {...DEFAULT_FINISH, ...finishing}
});

export const BUILTIN_PRESETS = Object.freeze([
  {id:'builtin-podcast',name:'Podcast Voice',description:'Clear speech, soft gate and compression.',
    ...config({highPassHz:80,lowDb:-1,midDb:2,highDb:1,gateThresholdDb:-48,compressorThresholdDb:-19,compressorRatio:3},
      {normalize:true,fadeInSeconds:.1,fadeOutSeconds:.2})},
  {id:'builtin-dj',name:'DJ Drop',description:'Punchy and bright. Keep an eye on clipping.',
    ...config({highPassHz:100,lowDb:2,midDb:3,highDb:3,gateThresholdDb:-38,compressorThresholdDb:-24,compressorRatio:5},
      {gainDb:2,fadeInSeconds:.1,fadeOutSeconds:.2})},
  {id:'builtin-warm',name:'Warm Vocal',description:'Full low end and soft high frequencies.',
    ...config({highPassHz:70,lowDb:3,midDb:1,highDb:-1,gateThresholdDb:-52,compressorThresholdDb:-16,compressorRatio:2},
      {normalize:true,fadeInSeconds:.1,fadeOutSeconds:.2})},
  {id:'builtin-raw',name:'Raw Music',description:'Neutral settings and original dynamics.',...config()},
]);
function record(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function params(source,defaults) {
  if (!record(source)) throw new Error('Preset settings must be objects.');
  const output={};
  for (const [key,defaultValue] of Object.entries(defaults)) {
    const value=Object.hasOwn(source,key) ? source[key] : defaultValue;
    if(key==='normalize') {
      if(typeof value!=='boolean') throw new Error('Invalid normalize flag.');
    } else {
      const [min,max]=bounds[key];
      if(typeof value!=='number' || !Number.isFinite(value) || value<min || value>max)
        throw new Error('Invalid setting: '+key);
    }
    output[key]=value;
  }
  return output;
}
export function validateSettings(value) {
  if(!record(value)) throw new Error('Invalid preset.');
  return {effects:params(value.effects,DEFAULT_EFFECTS),finishing:params(value.finishing,DEFAULT_FINISH)};
}
export function cleanName(name) {
  if(typeof name!=='string') throw new Error('Preset name must be text.');
  const cleaned=name.replace(/[\x00-\x1f\x7f]/g,' ').trim().replace(/\s+/g,' ');
  if(!cleaned || cleaned.length>60) throw new Error('Preset names must be 1–60 characters.');
  return cleaned;
}
function newId() {
  return globalThis.crypto?.randomUUID?.() || 'preset-'+Date.now()+'-'+Math.random().toString(36).slice(2);
}
export function newPreset(name, settings, id=newId()) {
  if(typeof id!=='string' || !id || id.length>100) throw new Error('Invalid preset ID.');
  return {id,name:cleanName(name),...validateSettings(settings)};
}
export function matchesPreset(preset,finishing,effects) {
  return Object.keys(DEFAULT_FINISH).every(key=>preset.finishing?.[key]===finishing?.[key]) &&
    Object.keys(DEFAULT_EFFECTS).every(key=>preset.effects?.[key]===effects?.[key]);
}
export function parsePresetFile(text) {
  if(typeof text!=='string' || new TextEncoder().encode(text).byteLength>MAX_FILE_BYTES)
    throw new Error('Preset file exceeds 64 KB.');
  let obj;
  try { obj=JSON.parse(text); } catch { throw new Error('Invalid preset JSON.'); }
  if(!record(obj) || obj.format!==format || obj.version!==version || !Array.isArray(obj.presets))
    throw new Error('Unsupported preset format or version.');
  if(obj.presets.length>MAX_PRESETS) throw new Error('Preset file exceeds 30 entries.');
  const names=new Set();
  return obj.presets.map(item=>{
    const preset=newPreset(item?.name,item); // Reassign IDs; imported identifiers are not trusted.
    const lower=preset.name.toLocaleLowerCase();
    if(names.has(lower)) throw new Error('Duplicate names in preset import.');
    names.add(lower);
    return preset;
  });
}
export function exportPresetFile(presets) {
  if(!Array.isArray(presets) || presets.length>MAX_PRESETS) throw new Error('Invalid preset list.');
  return JSON.stringify({format,version,presets:presets.map(item=>newPreset(item.name,item,item.id))},null,2);
}
export function readLocalPresets(storage) {
  try {
    const store=storage ?? globalThis.localStorage;
    const raw=store.getItem(STORAGE_KEY);
    if(raw===null) return {presets:[],available:true};
    if(raw.length>MAX_FILE_BYTES) throw new Error('Stored preset data is too large.');
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed) || parsed.length>MAX_PRESETS) throw new Error('Invalid stored preset list.');
    const presets=parsed.map(item=>newPreset(item.name,item,item.id));
    if(new Set(presets.map(item=>item.id)).size!==presets.length) throw new Error('Duplicate preset IDs.');
    return {presets,available:true};
  } catch(error) {
    return {presets:[],available:false,error:error.message};
  }
}
export function saveLocalPresets(presets, storage) {
  if(!Array.isArray(presets) || presets.length>MAX_PRESETS) throw new Error('Preset limit exceeded.');
  const checked=presets.map(item=>newPreset(item.name,item,item.id));
  (storage ?? globalThis.localStorage).setItem(STORAGE_KEY,JSON.stringify(checked));
  return checked;
}
