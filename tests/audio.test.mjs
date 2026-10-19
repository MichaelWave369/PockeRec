import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, safeFilename, extensionFor, formatTime } from '../src/audio.js';

test('time labels show paused/recording tenths and long takes', () => {
  assert.equal(formatTime(6543, true), '00:06.5');
  assert.equal(formatTime(3_600_000), '1:00:00');
});

test('exports use supported file names and native extension', () => {
  assert.equal(safeFilename('hi:/\\?*there'), 'hithere');
  assert.equal(extensionFor('audio/mp4'), 'm4a');
  assert.equal(extensionFor('audio/webm;codecs=opus'), 'webm');
});

test('PCM WAV has a valid header and interleaved signed 16-bit samples', async () => {
  const wav = encodeWav({ numberOfChannels: 2, length: 2, sampleRate: 48000, getChannelData: (i) => i === 0 ? Float32Array.of(-1, 1) : Float32Array.of(0, .5) });
  const data = new DataView(await wav.arrayBuffer());
  const word = (offset, count) => String.fromCharCode(...new Uint8Array(data.buffer, offset, count));
  assert.equal(word(0, 4), 'RIFF');
  assert.equal(word(8, 4), 'WAVE');
  assert.equal(data.getUint32(4, true), 44);
  assert.equal(data.getUint16(22, true), 2);
  assert.equal(data.getUint32(24, true), 48000);
  assert.equal(data.getInt16(44, true), -32768);
  assert.equal(data.getInt16(46, true), 0);
  assert.equal(data.getInt16(48, true), 32767);
  assert.equal(data.getInt16(50, true), 16384);
});
