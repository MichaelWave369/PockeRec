import test from 'node:test';
import assert from 'node:assert/strict';
import {EXTENSIONS,MAX_IMPORT_BYTES,MAX_IMPORT_SECONDS,MAX_IMPORT_BATCH,
  extensionOf,importedTitle,validateImportFile,validateDecodedAudio,
  makeImportedTake,importedDownloadExtension} from '../src/imports.js';

const mock=(name,size=1024,type='audio/mpeg')=>({name,size,type});
test('common audio formats and case-insensitive extension checks',()=>{
  for(const ext of EXTENSIONS) assert.equal(validateImportFile(mock('clip.'+ext,123,'')).ext,ext);
  assert.equal(extensionOf('VOICE.MP3'),'mp3');
  assert.equal(MAX_IMPORT_BATCH,8);
});
test('non-audio, empty and oversize files fail before decode',()=>{
  assert.throws(()=>validateImportFile(mock('not-executable.exe')),/Supported/);
  assert.throws(()=>validateImportFile(mock('empty.wav',0,'')),/empty/);
  assert.throws(()=>validateImportFile(mock('too-big.mp3',MAX_IMPORT_BYTES+1)),/32 MiB/);
  assert.throws(()=>validateImportFile(mock('fake.wav',512,'text/html')),/audio/);
});
test('filename sanitization and preservation of original suffix',()=>{
  assert.equal(importedTitle('  Mix _ 01  .WAV'),'Mix _ 01');
  assert.equal(importedTitle('bad/bad\\\\name.mp3'),'bad bad name');
  const take=makeImportedTake(mock('DJ-Drop.MP3',1200,'audio/mpeg'),2,2,100,'id-1');
  assert.equal(take.name,'DJ-Drop');
  assert.equal(take.originalExtension,'mp3');
  assert.equal(importedDownloadExtension(take),'mp3');
  assert.equal(take.blob.size,1200);
  assert.equal(take.durationMs,2000);
  assert.equal(take.mode,'imported');
  assert.equal(importedDownloadExtension({...take,originalExtension:'exe'}),null);
});
test('duration and channel count must fit the local editor',()=>{
  assert.equal(validateDecodedAudio(.2,1),200);
  assert.equal(validateDecodedAudio(MAX_IMPORT_SECONDS,2),MAX_IMPORT_SECONDS*1000);
  for(const seconds of [0,-1,Infinity,NaN,MAX_IMPORT_SECONDS+1])
    assert.throws(()=>validateDecodedAudio(seconds,2));
  for(const channels of [0,3,2.5,NaN]) assert.throws(()=>validateDecodedAudio(1,channels));
});
test('import preserves exact file object and never transforms source',()=>{
  const file=mock('mic audio.wav',4096,'audio/wav');
  const take=makeImportedTake(file,4.25,1,10,'id-2');
  assert.equal(take.blob,file);
  assert.equal(take.durationMs,4250);
  assert.equal(take.name,'mic audio');
  assert.equal(take.createdAt,10);
});
