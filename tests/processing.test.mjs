import test from 'node:test';
import assert from 'node:assert/strict';
import { dbToLinear, calculateProcessing, applyProcessingSample } from '../src/processing.js';
import { encodeWav } from '../src/audio.js';

const makeBuffer = (channels, sampleRate = 4) => ({
  length: channels[0].length,
  numberOfChannels: channels.length,
  sampleRate,
  getChannelData: (channel) => channels[channel],
});
const sampleData = Float32Array.from([0, .25, .5, .25, 0, -.25, -.5, -.25]);
const buffer = makeBuffer([sampleData]);
const pcm = async (blob) => {
  const data = await blob.arrayBuffer();
  const view = new DataView(data);
  return Array.from({ length: view.getUint32(40, true) / 2 }, (_, i) => view.getInt16(44 + i * 2, true));
};

test('decibels convert to correct amplitude and bad levels are rejected', () => {
  assert.equal(dbToLinear(0), 1);
  assert.ok(Math.abs(dbToLinear(6.0206) - 2) < .00001);
  assert.throws(() => dbToLinear(Infinity));
  assert.throws(() => dbToLinear(40));
});

test('zero finishing options reproduce the old PCM exactly', async () => {
  const old = await pcm(encodeWav(buffer, { startSeconds: .25, endSeconds: 1.75 }));
  const finished = await pcm(encodeWav(buffer, { startSeconds: .25, endSeconds: 1.75 }, { gainDb: 0, normalize: false, fadeInSeconds: 0, fadeOutSeconds: 0 }));
  assert.deepEqual(finished, old);
});

test('gain attenuates PCM samples without mutating the source', async () => {
  const out = await pcm(encodeWav(buffer, undefined, { gainDb: -6.0206 }));
  assert.ok(Math.abs(out[2] - 8192) < 2);
  assert.equal(sampleData[2], .5);
});

test('peak normalization targets minus 1 dBFS on the selected clip', async () => {
  const opts = { gainDb: 0, normalize: true };
  const out = await pcm(encodeWav(buffer, { startSeconds: 0, endSeconds: 2 }, opts));
  assert.ok(Math.abs(Math.max(...out) / 32767 - 10 ** (-1 / 20)) < .0001);
});

test('normalizing absolute silence produces silence and no NaN', async () => {
  const silent = makeBuffer([Float32Array.from([0, 0, 0, 0])]);
  assert.deepEqual(await pcm(encodeWav(silent, undefined, { normalize: true })), [0, 0, 0, 0]);
});

test('fade-in and fade-out endpoints and length cap are well-defined', () => {
  const fx = calculateProcessing(buffer, 0, buffer.length, { fadeInSeconds: 5, fadeOutSeconds: 5 });
  assert.equal(fx.fadeInFrames, 4);
  assert.equal(fx.fadeOutFrames, 4);
  assert.equal(applyProcessingSample(1, 0, fx), 0);
  assert.equal(applyProcessingSample(1, 7, fx), 0);
  assert.ok(applyProcessingSample(1, 3, fx) > 0);
});

test('selection peak uses only the chosen frames and mixes stereo peak', () => {
  const left = Float32Array.from([1, .2, .1, .1]);
  const right = Float32Array.from([.1, -.7, 0, 0]);
  const fx = calculateProcessing(makeBuffer([left, right]), 1, 3, { normalize: true });
  assert.ok(Math.abs(fx.peak - Math.fround(.7)) < 1e-5);
  assert.ok(fx.gain > 1);
});

test('invalid fade lengths and ranges reject safely', () => {
  assert.throws(() => calculateProcessing(buffer, 0, 8, { fadeInSeconds: -1 }));
  assert.throws(() => calculateProcessing(buffer, 0, 8, { fadeOutSeconds: Infinity }));
  assert.throws(() => calculateProcessing(buffer, 5, 4));
  assert.throws(() => calculateProcessing(buffer, 0, 8, { gainDb: 55 }));
});

test('overdriven processing clamps output without PCM wrap', async () => {
  const out = await pcm(encodeWav(makeBuffer([Float32Array.from([1, -1])]), undefined, { gainDb: 18 }));
  assert.deepEqual(out, [32767, -32768]);
});