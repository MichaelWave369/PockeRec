export const DEFAULT_FINISH = Object.freeze({
  gainDb: 0,
  normalize: false,
  fadeInSeconds: 0,
  fadeOutSeconds: 0,
});

export const NORMALIZE_TARGET_DB = -1;

// Pure, sample-domain calculations shared by WAV export and preview.
export function dbToLinear(db) {
  if (!Number.isFinite(db) || db < -60 || db > 24) throw new Error('Gain must be between -60 and +24 dB');
  return 10 ** (db / 20);
}

export function calculateProcessing(buffer, first, last, options = DEFAULT_FINISH) {
  if (!buffer || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 || !Number.isInteger(buffer.length) ||
      buffer.length < 1 || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 ||
      !Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last > buffer.length || last <= first) {
    throw new Error('Invalid PCM selection');
  }
  const gainDb = options.gainDb ?? 0;
  const fadeInSeconds = options.fadeInSeconds ?? 0;
  const fadeOutSeconds = options.fadeOutSeconds ?? 0;
  if (![fadeInSeconds, fadeOutSeconds].every(v => Number.isFinite(v) && v >= 0 && v <= 30)) {
    throw new Error('Invalid fade length');
  }
  const manualGain = dbToLinear(gainDb);
  const channels = Math.min(buffer.numberOfChannels, 2);
  let peak = 0;
  for (let channel = 0; channel < channels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let frame = first; frame < last; frame++) {
      const v = Math.abs(samples[frame] ?? 0);
      if (Number.isFinite(v) && v > peak) peak = v;
    }
  }
  // A silent selection is left silent instead of dividing by zero.
  const normalizeFactor = options.normalize && peak > 1e-12 ? dbToLinear(NORMALIZE_TARGET_DB) / peak : 1;
  const gain = manualGain * normalizeFactor;
  const frames = last - first;
  const maxFade = frames / buffer.sampleRate / 2;
  const fadeInFrames = Math.round(Math.min(fadeInSeconds, maxFade) * buffer.sampleRate);
  const fadeOutFrames = Math.round(Math.min(fadeOutSeconds, maxFade) * buffer.sampleRate);
  return { gain, peak, projectedPeak: peak * gain, fadeInFrames, fadeOutFrames, frames };
}

export function applyProcessingSample(sample, index, settings) {
  let envelope = 1;
  if (settings.fadeInFrames > 0) envelope = Math.min(envelope, index / settings.fadeInFrames);
  if (settings.fadeOutFrames > 0) envelope = Math.min(envelope, (settings.frames - 1 - index) / settings.fadeOutFrames);
  const result = (Number.isFinite(sample) ? sample : 0) * settings.gain * Math.max(0, envelope);
  return Math.max(-1, Math.min(1, result));
}
