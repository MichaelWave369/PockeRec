import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, pcmClipFrames } from '../src/audio.js';

const buffer = {
  numberOfChannels: 1, length: 8, sampleRate: 4,
  getChannelData: () => Float32Array.from([-1, -.75, -.5, -.25, 0, .25, .5, 1]),
};

test('PCM frame selection respects start and end boundaries', () => {
  assert.deepEqual(pcmClipFrames(buffer, 0.5, 1.5), { start: 2, end: 6, length: 4 });
  assert.deepEqual(pcmClipFrames(buffer, 0, 5), { start: 0, end: 8, length: 8 });
  assert.deepEqual(pcmClipFrames(buffer, 0.01, 0.01 + 0.001), { start: 0, end: 1, length: 1 });
});

test('clip export keeps only selected frames in valid mono PCM WAV', async () => {
  const wav = encodeWav(buffer, { startSeconds: 0.5, endSeconds: 1.5 });
  const view = new DataView(await wav.arrayBuffer());
  assert.equal(view.getUint32(4, true), 44); // 36 header bytes + 8 PCM bytes
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 4);
  assert.equal(view.getInt16(44, true), -16384);
  assert.equal(view.getInt16(50, true), 8192);
  assert.equal(buffer.getChannelData()[2], -.5); // source remains unchanged
});

test('invalid ranges are rejected instead of producing corrupt files', () => {
  for (const [startSeconds, endSeconds] of [[1, 1], [1.5, .5], [-1, 1], [9, 10], [NaN, 1]]) {
    assert.throws(() => pcmClipFrames(buffer, startSeconds, endSeconds));
  }
  assert.throws(() => pcmClipFrames({ ...buffer, sampleRate: 0 }));
});

test('whole-take WAV export retains original frame count', async () => {
  const whole = new DataView(await encodeWav(buffer).arrayBuffer());
  assert.equal(whole.getUint32(40, true), 16);
});
