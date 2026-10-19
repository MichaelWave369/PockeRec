// Deterministic local PCM effects. The same DSP drives preview and WAV export.
export const DEFAULT_EFFECTS = Object.freeze({
  highPassHz: 0, lowDb: 0, midDb: 0, highDb: 0,
  gateThresholdDb: -80, compressorThresholdDb: 0, compressorRatio: 3,
});
const power = db => 10 ** (db / 20);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function validate(buffer, start, end, options) {
  if (!buffer || !Number.isInteger(buffer.length) || buffer.length < 1 ||
    !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 ||
    !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 ||
    typeof buffer.getChannelData !== 'function' ||
    !Number.isInteger(start) || !Number.isInteger(end) || start < 0 ||
    end > buffer.length || start >= end) throw new Error('Invalid effect clip');
  const ranges = [
    ['highPassHz', 0, 400], ['lowDb', -12, 12], ['midDb', -12, 12],
    ['highDb', -12, 12], ['gateThresholdDb', -80, -15],
    ['compressorThresholdDb', -40, 0], ['compressorRatio', 1, 8],
  ];
  for (const [key, min, max] of ranges) {
    const value = options[key] ?? DEFAULT_EFFECTS[key];
    if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid effect setting: ' + key);
  }
}

// RBJ Audio EQ Cookbook biquads, normalized before application.
export function biquad(type, sampleRate, hz, gainDb = 0) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !['highpass','lowshelf','peaking','highshelf'].includes(type)) throw new Error('Invalid biquad');
  const f = clamp(hz, 1, sampleRate * .45);
  const w = 2 * Math.PI * f / sampleRate;
  const cosine = Math.cos(w), sine = Math.sin(w), alpha = sine / Math.SQRT2;
  const A = 10 ** (gainDb / 40), beta = 2 * Math.sqrt(A) * alpha;
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highpass') {
    b0 = (1 + cosine) / 2; b1 = -(1 + cosine); b2 = b0;
    a0 = 1 + alpha; a1 = -2 * cosine; a2 = 1 - alpha;
  } else if (type === 'peaking') {
    b0 = 1 + alpha * A; b1 = -2 * cosine; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = b1; a2 = 1 - alpha / A;
  } else if (type === 'lowshelf') {
    b0 = A * ((A+1) - (A-1)*cosine + beta);
    b1 = 2*A*((A-1) - (A+1)*cosine);
    b2 = A*((A+1) - (A-1)*cosine - beta);
    a0 = (A+1) + (A-1)*cosine + beta;
    a1 = -2*((A-1) + (A+1)*cosine);
    a2 = (A+1) + (A-1)*cosine - beta;
  } else {
    b0 = A*((A+1) + (A-1)*cosine + beta);
    b1 = -2*A*((A-1) + (A+1)*cosine);
    b2 = A*((A+1) + (A-1)*cosine - beta);
    a0 = (A+1) - (A-1)*cosine + beta;
    a1 = 2*((A-1) - (A+1)*cosine);
    a2 = (A+1) - (A-1)*cosine - beta;
  }
  return { b0:b0/a0, b1:b1/a0, b2:b2/a0, a1:a1/a0, a2:a2/a0, z1:0, z2:0 };
}

function stepBiquad(filter, input) {
  const out = filter.b0 * input + filter.z1;
  filter.z1 = filter.b1 * input - filter.a1 * out + filter.z2;
  filter.z2 = filter.b2 * input - filter.a2 * out;
  return out;
}

export function processEffectClip(buffer, first, last, options = DEFAULT_EFFECTS) {
  validate(buffer, first, last, options);
  const opt = {...DEFAULT_EFFECTS, ...options};
  const channels = Math.min(2, buffer.numberOfChannels);
  const length = last - first, sampleRate = buffer.sampleRate;
  const values = Array.from({length:channels},(_,n)=>Float32Array.from(buffer.getChannelData(n).subarray(first,last)));
  const output = {length, numberOfChannels:channels,sampleRate,getChannelData:(n)=>values[n]};
  const active = opt.highPassHz > 0 || opt.lowDb !== 0 || opt.midDb !== 0 || opt.highDb !== 0 ||
    opt.gateThresholdDb > -80 || opt.compressorThresholdDb < 0;
  if (!active) return output;
  const filters = values.map(() => [
    ...(opt.highPassHz ? [biquad('highpass',sampleRate,opt.highPassHz)] : []),
    ...(opt.lowDb ? [biquad('lowshelf',sampleRate,180,opt.lowDb)] : []),
    ...(opt.midDb ? [biquad('peaking',sampleRate,1300,opt.midDb)] : []),
    ...(opt.highDb ? [biquad('highshelf',sampleRate,4600,opt.highDb)] : []),
  ]);
  const gateActive = opt.gateThresholdDb > -80;
  const compressorActive = opt.compressorThresholdDb < 0 && opt.compressorRatio > 1;
  const gateLevel = power(opt.gateThresholdDb), threshold = power(opt.compressorThresholdDb);
  const gateAttack = Math.exp(-1/(sampleRate*.003)), gateRelease = Math.exp(-1/(sampleRate*.025));
  const compAttack = Math.exp(-1/(sampleRate*.008)), compRelease = Math.exp(-1/(sampleRate*.110));
  let gateGain = 1, envelope = 0;
  for (let i=0;i<length;i++) {
    let peak = 0;
    for(let ch=0;ch<channels;ch++){
      let sample = Number.isFinite(values[ch][i]) ? values[ch][i] : 0;
      for(const filter of filters[ch]) sample=stepBiquad(filter,sample);
      values[ch][i] = Number.isFinite(sample) ? sample : 0;
      peak = Math.max(peak,Math.abs(values[ch][i]));
    }
    if (gateActive) {
      const target = peak < gateLevel ? 0 : 1;
      gateGain = target + (gateGain-target)*(target > gateGain ? gateAttack : gateRelease);
    }
    let reduction = 1;
    if (compressorActive) {
      envelope = peak + (envelope-peak)*(peak > envelope ? compAttack : compRelease);
      if (envelope > threshold) reduction = (threshold/envelope) ** (1 - 1/opt.compressorRatio);
    }
    for(let ch=0;ch<channels;ch++) values[ch][i] *= (gateActive ? gateGain : 1)*reduction;
  }
  return output;
}
