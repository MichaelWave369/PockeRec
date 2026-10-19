import { pcmClipFrames } from './audio.js';
import { calculateProcessing, applyProcessingSample, DEFAULT_FINISH } from './processing.js';
import { processEffectClip, DEFAULT_EFFECTS } from './effects.js';

// One common sample renderer for the preview AudioBuffer and exported WAV.
// Effect order: high-pass -> EQ -> gate -> compressor -> normalize -> gain -> fades.
export function renderFinishedClip(source, range, finishing = DEFAULT_FINISH, effects = DEFAULT_EFFECTS) {
  const { start, end, length } = pcmClipFrames(source, range.startSeconds, range.endSeconds);
  if (length * Math.min(2,source.numberOfChannels) * 4 > 160 * 1024 * 1024) {
    throw new Error('Clip is too large to render in memory. Try a shorter selection.');
  }
  const processed = processEffectClip(source,start,end,effects);
  const fx = calculateProcessing(processed,0,processed.length,finishing);
  for(let ch=0;ch<processed.numberOfChannels;ch++) {
    const samples=processed.getChannelData(ch);
    for(let i=0;i<processed.length;i++) samples[i]=applyProcessingSample(samples[i],i,fx);
  }
  return processed;
}
