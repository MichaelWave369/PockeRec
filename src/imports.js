// Strict local-file preflight; never uploads or modifies the imported audio.
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
export const MAX_IMPORT_SECONDS = 10 * 60;
export const MAX_IMPORT_BATCH = 8;
export const EXTENSIONS = Object.freeze(['wav','wave','mp3','m4a','mp4','ogg','oga','webm','flac']);
export const FILE_ACCEPT = EXTENSIONS.map(ext => '.'+ext).join(',');
const accepted=new Set(EXTENSIONS);

export function extensionOf(filename) {
  if(typeof filename!=='string') return '';
  const match=/\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : '';
}
export function importedTitle(filename) {
  if(typeof filename!=='string') throw new Error('Missing audio filename.');
  const withoutExtension=filename.replace(/\.[^.]+$/,'');
  const clean=withoutExtension.replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g,' ').replace(/\s+/g,' ').trim();
  return clean.slice(0,120) || 'Imported audio';
}
export function validateImportFile(file) {
  if(!file || typeof file.name!=='string' || !Number.isSafeInteger(file.size))
    throw new Error('Could not read this file.');
  const ext=extensionOf(file.name);
  if(!accepted.has(ext)) throw new Error('Supported files: WAV, MP3, M4A, MP4 audio, OGG, WebM, and FLAC.');
  if(file.size===0) throw new Error('File is empty.');
  if(file.size>MAX_IMPORT_BYTES) throw new Error('File is larger than 32 MiB. Import a shorter audio file.');
  // Some OSes return an empty MIME type or application/octet-stream.
  if(file.type && !/^audio\//i.test(file.type) &&
      !['application/ogg','application/octet-stream','video/mp4','video/webm'].includes(file.type.toLowerCase()))
    throw new Error('File type does not look like audio.');
  return {ext,name:importedTitle(file.name),size:file.size};
}
export function validateDecodedAudio(duration,channels) {
  if(!Number.isFinite(duration) || duration<=0 || duration>MAX_IMPORT_SECONDS)
    throw new Error('Audio must be longer than zero and no more than 10 minutes.');
  if(!Number.isInteger(channels) || channels<1 || channels>2)
    throw new Error('Only mono or stereo audio is supported.');
  return Math.round(duration*1000);
}
export function makeImportedTake(file,durationSeconds,channels,now=Date.now(),id=(globalThis.crypto?.randomUUID?.() || 'import-'+now+'-'+Math.random().toString(36).slice(2))) {
  const {ext,name}=validateImportFile(file);
  const durationMs=validateDecodedAudio(durationSeconds,channels);
  return {id,name,createdAt:now,durationMs,mimeType:file.type || '',mode:'imported',
    originalExtension:ext,blob:file};
}
export function importedDownloadExtension(take) {
  return take?.mode==='imported' && accepted.has(take.originalExtension)
    ? take.originalExtension : null;
}

// Read lightweight HTMLMediaElement metadata BEFORE allocating decoded PCM.
// This prevents a tiny highly-compressed hours-long file from becoming
// gigabytes of audio during Web Audio decode.
export function inspectAudioMetadata(file,timeoutMs=10000) {
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const element=document.createElement('audio');
    let finished=false;
    const timeout=setTimeout(()=>finish(new Error('Could not inspect audio within 10 seconds.')),timeoutMs);
    function finish(error,duration) {
      if(finished) return;
      finished=true;
      clearTimeout(timeout);
      element.onloadedmetadata=null;
      element.ondurationchange=null;
      element.onerror=null;
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      if(error) reject(error);
      else resolve(duration);
    }
    function check() {
      const duration=element.duration;
      if(Number.isFinite(duration) && duration>0)
        finish(duration>MAX_IMPORT_SECONDS ? new Error('Audio is longer than the 10-minute import limit.') : null,duration);
    }
    element.onloadedmetadata=check;
    element.ondurationchange=check;
    element.onerror=()=>finish(new Error('This browser cannot open that audio file.'));
    element.preload='metadata';
    element.src=url;
    element.load();
  });
}
