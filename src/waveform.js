// Render-friendly peak envelope for decoded audio, never alters the source buffer.
export function buildWaveformPeaks(buffer, bins = 512) {
  if (!buffer || !Number.isInteger(buffer.length) || buffer.length < 1 || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 || typeof buffer.getChannelData !== 'function') {
    throw new Error('Invalid audio buffer for waveform');
  }
  if (!Number.isFinite(bins) || bins < 1) throw new Error('Invalid waveform resolution');
  const count = Math.min(1024, Math.max(1, Math.floor(bins)));
  const channels = Array.from({ length: Math.min(buffer.numberOfChannels, 2) }, (_, channel) => buffer.getChannelData(channel));
  const peaks = new Float32Array(count);
  // Bounded sampling keeps very long recordings from freezing the browser.
  const stride = Math.max(1, Math.floor(buffer.length / (count * 64)));
  for (let bin = 0; bin < count; bin++) {
    const start = Math.floor(bin * buffer.length / count);
    const end = Math.max(start + 1, Math.floor((bin + 1) * buffer.length / count));
    let peak = 0;
    for (let index = start; index < end; index += stride) {
      for (const channel of channels) {
        const sample = Math.abs(channel[index] || 0);
        if (Number.isFinite(sample)) peak = Math.max(peak, sample);
      }
    }
    peaks[bin] = Math.min(1, peak);
  }
  return peaks;
}
