import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EFFECTS, processEffectClip, biquad } from '../src/effects.js';
import { renderFinishedClip } from '../src/render.js';
import { encodeWav } from '../src/audio.js';

const sr=8000;
const signal=(frequency,length=8000,volume=.2)=>Float32Array.from({length},(_,i)=>Math.sin(i*2*Math.PI*frequency/sr)*volume);
const make=(channels,rate=sr)=>({sampleRate:rate,length:channels[0].length,numberOfChannels:channels.length,getChannelData:n=>channels[n]});
const rms=(array,skip=200)=>Math.sqrt(array.slice(skip).reduce((acc,n)=>acc+n*n,0)/Math.max(1,array.length-skip));

test('all effects disabled return a separate, unchanged copy',()=>{
  const input=Float32Array.from([0,.3,-.25,1]);
  const result=processEffectClip(make([input]),0,4,DEFAULT_EFFECTS);
  assert.deepEqual(Array.from(result.getChannelData(0)),Array.from(input));
  result.getChannelData(0)[1]=0; assert.notEqual(input[1],0);
});
test('highpass attenuates DC and bass more than high frequencies',()=>{
  const low=make([signal(30)]), high=make([signal(1000)]);
  const setting={highPassHz:170};
  const lowOut=processEffectClip(low,0,low.length,setting).getChannelData(0);
  const highOut=processEffectClip(high,0,high.length,setting).getChannelData(0);
  assert.ok(rms(lowOut)<rms(low.getChannelData(0))*.20);
  assert.ok(rms(highOut)>rms(high.getChannelData(0))*.8);
});
test('low shelf EQ changes low-frequency signal but not source',()=>{
  const source=signal(80), buffer=make([source]);
  const boost=processEffectClip(buffer,0,buffer.length,{lowDb:6}).getChannelData(0);
  const cut=processEffectClip(buffer,0,buffer.length,{lowDb:-6}).getChannelData(0);
  assert.ok(rms(boost)>rms(source)*1.6);
  assert.ok(rms(cut)<rms(source)*.7);
  assert.ok(Math.abs(source[500])<=.201);
});
test('noise gate suppresses quiet sustained tone',()=>{
  const source=make([signal(500,10000,.004)]);
  const gated=processEffectClip(source,0,source.length,{gateThresholdDb:-35}).getChannelData(0);
  assert.ok(rms(gated,6000)<rms(source.getChannelData(0),6000)*.04);
});
test('compressor attenuates sustained loud samples, preserves low ones',()=>{
  const loud=make([signal(500,16000,.85)]);
  const soft=make([signal(500,16000,.02)]);
  const opt={compressorThresholdDb:-20,compressorRatio:6};
  const loudOut=processEffectClip(loud,0,loud.length,opt).getChannelData(0);
  const softOut=processEffectClip(soft,0,soft.length,opt).getChannelData(0);
  assert.ok(rms(loudOut,9000)<rms(loud.getChannelData(0),9000)*.55);
  assert.ok(rms(softOut,9000)>rms(soft.getChannelData(0),9000)*.9);
});
test('stereo channels retain independence and sample count',()=>{
  const input=make([signal(100,1200,.4),signal(1000,1200,.4)]);
  const out=processEffectClip(input,100,1100,{highPassHz:150});
  assert.equal(out.length,1000); assert.equal(out.numberOfChannels,2);
  assert.ok(rms(out.getChannelData(0))<rms(out.getChannelData(1)));
});
test('preview renderer and WAV exporter use identical processed PCM',async()=>{
  const original=make([signal(300,2400,.24)]);
  const rendered=renderFinishedClip(original,{startSeconds:.05,endSeconds:.25},
    {normalize:true,gainDb:-3,fadeInSeconds:.02,fadeOutSeconds:.02},
    {highPassHz:120,midDb:3,compressorThresholdDb:-18,compressorRatio:3});
  const wav=await encodeWav(rendered).arrayBuffer();
  const view=new DataView(wav),samples=rendered.getChannelData(0);
  assert.equal(view.getUint32(40,true),rendered.length*2);
  for(const index of [0,100,600,rendered.length-1]){
    const f=samples[index],quantized=f<0?Math.round(f*32768):Math.round(f*32767);
    assert.equal(view.getInt16(44+index*2,true),quantized);
  }
  assert.equal(original.getChannelData(0)[0],0);
});
test('bad effects and invalid selections fail with explicit errors',()=>{
  const buffer=make([signal(100,100)]);
  assert.throws(()=>processEffectClip(buffer,0,100,{highPassHz:800}));
  assert.throws(()=>processEffectClip(buffer,0,100,{midDb:NaN}));
  assert.throws(()=>processEffectClip(buffer,10,10,{}));
  assert.throws(()=>biquad('nope',sr,100));
});
