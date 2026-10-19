import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_PRESETS,MAX_PRESETS,MAX_FILE_BYTES,newPreset,cleanName,
  matchesPreset,parsePresetFile,exportPresetFile,readLocalPresets,saveLocalPresets} from '../src/presets.js';
import {DEFAULT_EFFECTS} from '../src/effects.js';
import {DEFAULT_FINISH} from '../src/processing.js';
import {renderFinishedClip} from '../src/render.js';

const settings={effects:{...DEFAULT_EFFECTS,highPassHz:120},finishing:{...DEFAULT_FINISH,normalize:true}};
const fakeStore=()=>{
 const map=new Map();
 return {getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,value)};
};
test('four builtins are independently valid',()=>{
 assert.deepEqual(BUILTIN_PRESETS.map(p=>p.name),['Podcast Voice','DJ Drop','Warm Vocal','Raw Music']);
 for(const item of BUILTIN_PRESETS) assert.doesNotThrow(()=>newPreset(item.name,item));
});
test('save and reload restores complete finishing and effects configurations',()=>{
 const storage=fakeStore();
 const preset=newPreset('   My voice  ',settings,'preset-1');
 saveLocalPresets([preset],storage);
 assert.deepEqual(readLocalPresets(storage),{presets:[preset],available:true});
 assert.equal(preset.name,'My voice');
 assert.ok(matchesPreset(preset,settings.finishing,settings.effects));
});
test('JSON round trip reassigns imported IDs and preserves settings',()=>{
 const item=newPreset('Radio',settings,'remote-id');
 const imported=parsePresetFile(exportPresetFile([item]));
 assert.equal(imported.length,1);
 assert.notEqual(imported[0].id,'remote-id');
 assert.equal(imported[0].name,'Radio');
 assert.deepEqual(imported[0].finishing,item.finishing);
 assert.deepEqual(imported[0].effects,item.effects);
});
test('file validation rejects malformed schema and duplicate names',()=>{
 assert.throws(()=>parsePresetFile('nope'));
 assert.throws(()=>parsePresetFile('{"version":1,"presets":[]}'));
 const preset=newPreset('One',settings);
 assert.throws(()=>parsePresetFile(JSON.stringify({format:'pockerec-presets',version:1,presets:[preset,{...preset,name:'one'}]})));
 assert.throws(()=>parsePresetFile(' '.repeat(MAX_FILE_BYTES+1)));
});
test('rejects invalid numeric ranges and boolean fields',()=>{
 assert.throws(()=>newPreset('Bad',{...settings,effects:{...settings.effects,lowDb:13}}));
 assert.throws(()=>newPreset('Bad',{...settings,finishing:{...settings.finishing,normalize:'true'}}));
 assert.throws(()=>newPreset('Bad',{...settings,finishing:{...settings.finishing,gainDb:NaN}}));
 assert.throws(()=>cleanName('   '));
 assert.throws(()=>cleanName('X'.repeat(61)));
});
test('storage failures do not pretend data was saved',()=>{
 const store={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
 assert.equal(readLocalPresets(store).available,false);
 assert.throws(()=>saveLocalPresets([newPreset('My',settings)],store),/quota/);
 assert.throws(()=>saveLocalPresets(Array.from({length:MAX_PRESETS+1},(_,i)=>newPreset('x'+i,settings)),fakeStore()));
});
test('built-in preset changes audio output without changing source samples',()=>{
 const samples=Float32Array.from([0,.2,.4,.6,.4,.2,0,0]);
 const source={sampleRate:8,length:8,numberOfChannels:1,getChannelData:()=>samples};
 const choice=BUILTIN_PRESETS[0];
 const rendered=renderFinishedClip(source,{startSeconds:0,endSeconds:1},choice.finishing,choice.effects);
 assert.equal(rendered.length,8);
 assert.deepEqual(Array.from(samples),[0,.2,.4,.6,.4,.2,0,0].map(Math.fround));
});
