import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from './audio.js';
import { BUILTIN_PRESETS, MAX_PRESETS, MAX_FILE_BYTES, cleanName, newPreset,
  matchesPreset, readLocalPresets, saveLocalPresets, parsePresetFile, exportPresetFile } from './presets.js';

export default function PresetVault({finishing,effects,onApply,onMessage}) {
  const [items,setItems]=useState([]);
  const [name,setName]=useState('');
  const [available,setAvailable]=useState(true);
  const importRef=useRef(null);
  useEffect(()=>{
    const result=readLocalPresets();
    setItems(result.presets);
    setAvailable(result.available);
  },[]);
  const active=[...BUILTIN_PRESETS,...items].find(preset=>matchesPreset(preset,finishing,effects));
  function persist(next,message) {
    try {
      setItems(saveLocalPresets(next));
      setAvailable(true);
      onMessage(message);
      return true;
    } catch(error) {
      setAvailable(false);
      onMessage('Could not save presets: '+error.message);
      return false;
    }
  }
  function save() {
    try {
      if(items.length>=MAX_PRESETS) throw new Error('Preset Vault is full (30 maximum).');
      const title=cleanName(name);
      if(items.some(p=>p.name.toLocaleLowerCase()===title.toLocaleLowerCase()))
        throw new Error('That preset name is already used.');
      const item=newPreset(title,{finishing,effects});
      if(persist([...items,item],'Saved custom preset: '+item.name)) setName('');
    } catch(error) { onMessage(error.message); }
  }
  function remove(preset) {
    if(window.confirm('Delete preset "'+preset.name+'"? Recordings will not change.'))
      persist(items.filter(item=>item.id!==preset.id),'Custom preset deleted.');
  }
  function download() {
    try {
      const json=exportPresetFile(items);
      downloadBlob(new Blob([json],{type:'application/json'}),'PockeRec-presets.json');
      onMessage('Exported '+items.length+' custom presets.');
    } catch(error) { onMessage(error.message); }
  }
  async function upload(event) {
    const file=event.currentTarget.files?.[0];
    if(importRef.current) importRef.current.value='';
    if(!file) return;
    try {
      if(file.size>MAX_FILE_BYTES) throw new Error('Preset JSON exceeds 64 KB.');
      const imported=parsePresetFile(await file.text());
      const names=new Set(items.map(p=>p.name.toLocaleLowerCase()));
      const additions=imported.filter(p=>!names.has(p.name.toLocaleLowerCase()));
      const skipped=imported.length-additions.length;
      if(items.length+additions.length>MAX_PRESETS) throw new Error('Import exceeds 30 saved presets.');
      if(!additions.length) return onMessage('No new presets. '+skipped+' matching names skipped.');
      persist([...items,...additions],'Imported '+additions.length+' presets'+(skipped?', skipped '+skipped+' duplicates.':'.'));
    } catch(error) { onMessage('Import rejected: '+error.message); }
  }
  return <section className="preset-vault" aria-label="Audio preset vault">
    <div className="preset-heading"><div><span className="trim-eyebrow">06 / PRESET VAULT</span>
      <h3>Your sound, one click away.</h3></div>
      <span className="preset-active" aria-live="polite">{active?'ACTIVE: '+active.name:'CUSTOM SETTINGS'}</span></div>
    <p className="preset-help">Presets adjust the finishing desk and effects rack, not your original recording.</p>
    <div className="preset-builtins">{BUILTIN_PRESETS.map(p=>
      <button type="button" key={p.id} className={'preset-card'+(active?.id===p.id?' selected':'')}
        aria-pressed={active?.id===p.id} onClick={()=>onApply(p)}>
        <strong>{p.name}</strong><small>{p.description}</small></button>)}</div>
    <div className="preset-custom-head"><strong>MY CUSTOM PRESETS</strong><span>{items.length} / {MAX_PRESETS}</span></div>
    {items.length?<div className="preset-saved">{items.map(p=><div className="preset-saved-row" key={p.id}>
      <button type="button" onClick={()=>onApply(p)} aria-pressed={active?.id===p.id}>{p.name}</button>
      <button type="button" className="preset-remove" aria-label={'Delete preset '+p.name} onClick={()=>remove(p)}>Delete</button>
    </div>)}</div>:<p className="preset-empty">No custom presets yet. Tune the sound, name it and save.</p>}
    <div className="preset-save"><label htmlFor="preset-name">Save current settings as</label>
      <div className="preset-save-row"><input id="preset-name" type="text" maxLength={60}
        placeholder="e.g. My radio voice" value={name} onChange={event=>setName(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter') save();}} />
        <button type="button" disabled={!available || !name.trim() || items.length>=MAX_PRESETS} onClick={save}>Save preset</button>
      </div></div>
    <div className="preset-transfer">
      <button type="button" disabled={!items.length} onClick={download}>↓ Export custom JSON</button>
      <label className={'preset-import'+(!available?' disabled':'')}>↑ Import JSON
        <input ref={importRef} type="file" accept=".json,application/json"
          aria-label="Import custom preset JSON" disabled={!available} onChange={event=>{void upload(event);}}/>
      </label>
    </div>
    {!available&&<p className="preset-storage-warning" role="alert">Local preset storage is unavailable or contains invalid data. Built-in presets still work, but saving and import are disabled. Avoid clearing site data until you have a backup.</p>}
    <p className="preset-help">Custom presets are stored only in this browser. Export JSON to back up or share settings. No audio is included.</p>
  </section>;
}
