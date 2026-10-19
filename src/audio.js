export function formatTime(ms, tenths = false) {
  const total = Math.max(0, Math.floor(ms / (tenths ? 100 : 1000)));
  if (tenths) {
    const seconds = Math.floor(total / 10);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${total % 10}`;
  }
  if (total >= 3600) return `${Math.floor(total / 3600)}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function chooseMimeType() {
  return ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
}

export function extensionFor(mime = '') {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

export function safeFilename(name = '') {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 100) || 'PocketRec Take';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function ascii(view, index, value) {
  for (let i = 0; i < value.length; i++) view.setUint8(index + i, value.charCodeAt(i));
}

// Convert seconds to bounded PCM frame indices without copying or modifying source audio.
// The decoded buffer may be longer/shorter than the recorder's wall-clock estimate.
export function pcmClipFrames(buffer, startSeconds = 0, endSeconds = buffer.length / buffer.sampleRate) {
  if (!Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 || !Number.isInteger(buffer.length) || buffer.length <= 0) {
    throw new Error('Invalid audio buffer');
  }
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) {
    throw new Error('Invalid clip selection');
  }
  const start = Math.min(buffer.length, Math.floor(startSeconds * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.ceil(endSeconds * buffer.sampleRate));
  if (start >= end) throw new Error('Clip selection is outside the audio');
  return { start, end, length: end - start };
}

// Uncompressed signed 16-bit, interleaved PCM. Optional range is non-destructive.
// Conversion never improves native codec quality.
export function encodeWav(buffer, range) {
  const channels = Math.min(2, buffer.numberOfChannels);
  if (channels < 1) throw new Error('No audio channels');
  const { start, length: frames } = range ? pcmClipFrames(buffer, range.startSeconds, range.endSeconds) : pcmClipFrames(buffer);
  const bytes = frames * channels * 2;
  if (bytes > 0xffffffff - 44) throw new Error('This recording is too long for one WAV file');
  const out = new ArrayBuffer(44 + bytes);
  const view = new DataView(out);
  ascii(view, 0, 'RIFF'); view.setUint32(4, bytes + 36, true);
  ascii(view, 8, 'WAVE'); ascii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  ascii(view, 36, 'data'); view.setUint32(40, bytes, true);
  const samples = Array.from({ length: channels }, (_, n) => buffer.getChannelData(n));
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, samples[c][i + start]));
    view.setInt16(offset, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
    offset += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}
