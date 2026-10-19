import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaveformPeaks } from '../src/waveform.js';

const source = {
  length: 8, numberOfChannels: 1,
  getChannelData: () => Float32Array.from([0, .2, -.8, .1, .4, -.2, .6, -1]),
};

test('waveform returns actual maximum absolute sample for each time bin', () => {
  assert.deepEqual(Array.from(buildWaveformPeaks(source, 4)), [.2, .8, .4, 1].map(Math.fround));
});
test('stereo waveform includes the louder channel without changing source', () => {
  const left = Float32Array.from([.1, .2, .1, .2]);
  const right = Float32Array.from([-.9, 0, -.6, 0]);
  const stereo = { length: 4, numberOfChannels: 2, getChannelData: (channel) => channel === 0 ? left : right };
  assert.deepEqual(Array.from(buildWaveformPeaks(stereo, 2)), [.9, .6].map(Math.fround));
  assert.equal(left[0], Math.fround(.1)); assert.equal(right[0], Math.fround(-.9));
});
test('shorter-than-bin-count source and silent buffers yield finite values', () => {
  const silent = { length: 2, numberOfChannels: 1, getChannelData: () => Float32Array.from([0, 0]) };
  const values = buildWaveformPeaks(silent, 100);
  assert.equal(values.length, 100);
  assert.ok(values.every((value) => value === 0));
});
test('bad input and resolution are rejected', () => {
  assert.throws(() => buildWaveformPeaks({ length: 0, numberOfChannels: 1, getChannelData: () => [] }, 4));
  assert.throws(() => buildWaveformPeaks(source, 0));
  assert.throws(() => buildWaveformPeaks(source, NaN));
});
test('waveform resolution is bounded for performance', () => assert.equal(buildWaveformPeaks(source, 500000).length, 1024));
