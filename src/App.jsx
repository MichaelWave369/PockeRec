import { useEffect, useRef, useState } from 'react';
import { chooseMimeType, downloadBlob, encodeWav, extensionFor, formatSize, formatTime, safeFilename } from './audio.js';
import { hasTemporaryStorage, initStorage, listTakes, putTake, removeTake } from './storage.js';

const initialNote = 'Your browser will ask to use your microphone when you press record.';

function Waveform({ analyserRef, phaseRef, onLevel }) {
  const canvasRef = useRef(null);
  const updateRef = useRef(onLevel);
  useEffect(() => { updateRef.current = onLevel; }, [onLevel]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    let raf;
    let lastLevelTime = 0;
    const draw = (now) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(cssWidth));
      const height = Math.max(1, Math.floor(cssHeight));
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#2b3f36';
      for (let x = 0; x < width; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      const mid = height / 2;
      ctx.strokeStyle = '#496052';
      ctx.setLineDash([5, 8]); ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(width, mid); ctx.stroke(); ctx.setLineDash([]);
      const analyser = analyserRef.current;
      const live = phaseRef.current === 'recording' && !!analyser;
      let samples;
      if (live) {
        samples = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(samples);
        if (now - lastLevelTime > 130) {
          let sum = 0;
          for (const value of samples) { const normalized = (value - 128) / 128; sum += normalized * normalized; }
          const rms = Math.sqrt(sum / samples.length);
          updateRef.current(rms < 0.0005 ? '−∞ dB' : `${Math.max(-80, Math.round(20 * Math.log10(rms)))} dB`);
          lastLevelTime = now;
        }
      } else if (now - lastLevelTime > 130) {
        updateRef.current('−∞ dB'); lastLevelTime = now;
      }
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#78ac9b'); gradient.addColorStop(.5, '#d9f0ad'); gradient.addColorStop(1, '#ff9c7c');
      ctx.strokeStyle = gradient; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = '#c6e9ab'; ctx.shadowBlur = live ? 15 : 4;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const sample = live ? (samples[Math.min(samples.length - 1, Math.floor(x / width * samples.length))] - 128) / 128 : 0;
        const y = mid + Math.max(-1, Math.min(1, sample * 2.8)) * height * .39;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef, phaseRef]);
  return <canvas ref={canvasRef} id="waveCanvas" role="img" aria-label="Live microphone waveform while recording" />;
}

function TakeCard({ take, onPlay, onRename, onDelete, onDownload, onWav, exporting }) {
  const [draft, setDraft] = useState(take.name);
  useEffect(() => setDraft(take.name), [take.name]);
  const saveName = () => {
    const value = draft.trim().slice(0, 120);
    if (!value) setDraft(take.name);
    else if (value !== take.name) onRename(take, value);
  };
  return (
    <article className="take-card">
      <div className="take-row">
        <button className="play-clip" type="button" onClick={() => onPlay(take)} aria-label={`Play ${take.name}`}>▶</button>
        <div className="clip-info">
          <input className="clip-title" aria-label={`Rename ${take.name}`} value={draft} maxLength={120}
            onChange={(event) => setDraft(event.target.value)} onBlur={saveName}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(take.name); event.currentTarget.blur(); } }} />
          <div className="clip-meta">{new Date(take.createdAt).toLocaleDateString()} · {formatTime(take.durationMs)} · {formatSize(take.blob.size)} · {take.mode === 'raw' ? 'Raw' : 'Voice'}</div>
        </div>
      </div>
      <div className="clip-actions">
        <button type="button" onClick={() => onDownload(take)} aria-label={`Download ${take.name} in original format`}>Download</button>
        <button type="button" disabled={exporting !== null} onClick={() => onWav(take)} aria-label={`Download ${take.name} as WAV`}>{exporting === take.id ? 'Exporting…' : 'WAV'}</button>
        <button type="button" className="danger" onClick={() => onDelete(take)} aria-label={`Delete ${take.name}`}>Delete</button>
      </div>
    </article>
  );
}

export default function App() {
  const [mode, setMode] = useState('voice');
  const [phase, setPhase] = useState('idle');
  const [note, setNote] = useState(initialNote);
  const [noteError, setNoteError] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState('−∞ dB');
  const [takes, setTakes] = useState([]);
  const [temporary, setTemporary] = useState(false);
  const [selected, setSelected] = useState(null);
  const [playerUrl, setPlayerUrl] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [toast, setToast] = useState('');
  const [clipDuration, setClipDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const phaseRef = useRef('idle');
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef('');
  const modeRef = useRef('voice');
  const startedRef = useRef(0);
  const pausedAtRef = useRef(0);
  const totalPausedRef = useRef(0);
  const durationRef = useRef(0);
  const mountedRef = useRef(true);
  const playerRef = useRef(null);
  const playerUrlRef = useRef(null);
  const previewOnlyRef = useRef(false);
  const toastTimerRef = useRef(null);

  const setRecordingPhase = (value) => { phaseRef.current = value; if (mountedRef.current) setPhase(value); };
  const showNote = (value, isError = false) => { if (mountedRef.current) { setNote(value); setNoteError(isError); } };
  const showToast = (message) => { if (!mountedRef.current) return; setToast(message); clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => { if (mountedRef.current) setToast(''); }, 3300); };
  const refreshTakes = async () => { const saved = await listTakes(); if (mountedRef.current) { setTakes(saved); setTemporary(hasTemporaryStorage()); } };

  function cleanupMic() {
    for (const track of streamRef.current?.getTracks() || []) track.stop();
    streamRef.current = null;
    analyserRef.current = null;
    if (contextRef.current) { contextRef.current.close().catch(() => {}); contextRef.current = null; }
  }

  function closePlayer() {
    playerRef.current?.pause();
    previewOnlyRef.current = false;
    if (playerUrlRef.current) URL.revokeObjectURL(playerUrlRef.current);
    playerUrlRef.current = null;
    setPlayerUrl(null); setSelected(null);
    setClipDuration(0); setTrimStart(0); setTrimEnd(0);
  }

  useEffect(() => {
    mountedRef.current = true;
    initStorage().then(refreshTakes).catch((error) => console.warn('Unable to list recordings', error));
    const pagehide = () => cleanupMic();
    window.addEventListener('pagehide', pagehide);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', pagehide);
      clearTimeout(toastTimerRef.current);
      cleanupMic();
      if (recorderRef.current?.state !== 'inactive') {
        try { recorderRef.current?.stop(); } catch { /* Browser was already closing */ }
      }
      if (playerUrlRef.current) URL.revokeObjectURL(playerUrlRef.current);
    };
  }, []);

  function elapsedNow() {
    const current = phaseRef.current;
    if (current === 'idle' || current === 'starting') return 0;
    if (current === 'saving') return durationRef.current;
    const now = current === 'paused' ? pausedAtRef.current : performance.now();
    return Math.max(0, now - startedRef.current - totalPausedRef.current);
  }

  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const timer = setInterval(() => setElapsed(elapsedNow()), 100);
    return () => clearInterval(timer);
  }, [phase]);

  async function finishRecording() {
    cleanupMic();
    const blob = new Blob(chunksRef.current, { type: mimeRef.current || chunksRef.current[0]?.type || 'audio/webm' });
    chunksRef.current = [];
    recorderRef.current = null;
    if (!mountedRef.current) return;
    if (blob.size < 100) { setRecordingPhase('idle'); setElapsed(0); showNote('The recording was empty. Try again.', true); return; }
    const created = new Date();
    const take = {
      id: globalThis.crypto?.randomUUID?.() || `take-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      name: `Take ${created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${created.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
      createdAt: Date.now(), durationMs: durationRef.current, mimeType: blob.type, mode: modeRef.current, blob,
    };
    try {
      await putTake(take); await refreshTakes();
      setRecordingPhase('idle'); setElapsed(0);
      showNote(hasTemporaryStorage() ? 'Saved for this session only. Download this take to keep it.' : 'Saved locally. Ready for another take.');
      showToast(hasTemporaryStorage() ? 'Temporary take saved. Download it now.' : 'Take saved in this browser.');
    } catch (error) { console.error(error); setRecordingPhase('idle'); setElapsed(0); showNote('The recording could not be saved. Please try again.', true); }
  }

  async function startRecording() {
    if (phaseRef.current !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showNote('Microphone recording requires HTTPS (or localhost) and a browser with MediaRecorder.', true); return;
    }
    setRecordingPhase('starting'); showNote('Requesting microphone access…');
    try {
      const voice = modeRef.current === 'voice';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: voice, noiseSuppression: voice, autoGainControl: voice } });
      if (!mountedRef.current || phaseRef.current !== 'starting') { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const mime = chooseMimeType();
      const options = { audioBitsPerSecond: voice ? 128000 : 192000 };
      if (mime) options.mimeType = mime;
      let recorder;
      try { recorder = new MediaRecorder(stream, options); }
      catch { recorder = new MediaRecorder(stream); }
      recorderRef.current = recorder;
      mimeRef.current = recorder.mimeType || mime;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => { void finishRecording(); };
      recorder.onerror = (event) => { console.error('MediaRecorder error', event.error || event); showNote('The recording encountered an error. Stop and try again.', true); };
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (Context) {
          const context = new Context(); contextRef.current = context;
          const source = context.createMediaStreamSource(stream);
          const analyser = context.createAnalyser();
          analyser.fftSize = 2048; analyser.smoothingTimeConstant = .75;
          source.connect(analyser); // Do NOT connect to destination (would cause feedback).
          analyserRef.current = analyser;
        }
      } catch (error) { console.warn('Waveform unavailable', error); }
      recorder.start(250);
      startedRef.current = performance.now(); pausedAtRef.current = 0; totalPausedRef.current = 0; durationRef.current = 0;
      setElapsed(0); setRecordingPhase('recording');
      showNote('Microphone live. Stop to save this take on your device.');
    } catch (error) {
      console.warn('Microphone capture failed', error);
      cleanupMic(); recorderRef.current = null; setRecordingPhase('idle');
      showNote(error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow access in your browser settings.'
        : error.name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.'
        : error.name === 'NotReadableError' ? 'Microphone is busy or unavailable.'
        : 'Unable to start recording. Check your browser and microphone.', true);
    }
  }

  function togglePause() {
    const recorder = recorderRef.current;
    try {
      if (phaseRef.current === 'recording' && recorder?.state === 'recording') {
        recorder.pause(); pausedAtRef.current = performance.now(); setRecordingPhase('paused'); showNote('Paused. Resume when you are ready.');
      } else if (phaseRef.current === 'paused' && recorder?.state === 'paused') {
        recorder.resume(); totalPausedRef.current += performance.now() - pausedAtRef.current;
        pausedAtRef.current = 0; setRecordingPhase('recording'); showNote('Recording resumed.');
      }
      setElapsed(elapsedNow());
    } catch (error) { console.error(error); showNote('Pause or resume was not supported by this browser.', true); }
  }

  function stopRecording() {
    if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') return;
    durationRef.current = elapsedNow(); setElapsed(durationRef.current); setRecordingPhase('saving'); showNote('Saving your take…');
    try {
      const recorder = recorderRef.current;
      if (recorder?.state !== 'inactive') recorder.stop();
      else void finishRecording();
    } catch (error) { console.error(error); cleanupMic(); recorderRef.current = null; setRecordingPhase('idle'); showNote('Could not save that take.', true); }
  }

  async function renameTake(take, name) {
    try { await putTake({ ...take, name }); await refreshTakes(); if (selected?.id === take.id) setSelected({ ...take, name }); showToast('Take renamed.'); }
    catch (error) { console.error(error); showToast('Could not rename this take.'); }
  }

  async function deleteTake(take) {
    if (!window.confirm(`Delete “${take.name}” from this browser? This cannot be undone.`)) return;
    try { await removeTake(take.id); if (selected?.id === take.id) closePlayer(); await refreshTakes(); showToast('Take deleted.'); }
    catch (error) { console.error(error); showToast('Could not delete this take.'); }
  }

  function playTake(take) {
    if (selected?.id === take.id) {
      previewOnlyRef.current = false;
      if (playerRef.current?.paused) playerRef.current.play().catch(() => showToast('Playback blocked. Use player controls.'));
      else playerRef.current?.pause();
      return;
    }
    closePlayer();
    const url = URL.createObjectURL(take.blob); playerUrlRef.current = url;
    const duration = Number.isFinite(take.durationMs) ? Math.max(0, take.durationMs / 1000) : 0;
    setClipDuration(duration); setTrimStart(0); setTrimEnd(duration);
    setSelected(take); setPlayerUrl(url);
  }

  useEffect(() => {
    if (playerUrl && playerRef.current) playerRef.current.play().catch(() => showToast('Press play on the audio player to listen.'));
  }, [playerUrl]);

  function onAudioMetadata(event) {
    const duration = event.currentTarget.duration;
    // Some MediaRecorder containers expose Infinity; keep the recorded estimate then.
    if (Number.isFinite(duration) && duration > 0) {
      setClipDuration(duration); setTrimStart(0); setTrimEnd(duration);
    }
  }

  function setTrimBoundary(which, value) {
    const length = clipDuration;
    if (!length || !Number.isFinite(value)) return;
    const gap = Math.min(0.1, length);
    previewOnlyRef.current = false;
    playerRef.current?.pause();
    if (which === 'start') setTrimStart(Math.max(0, Math.min(value, trimEnd - gap)));
    else setTrimEnd(Math.min(length, Math.max(value, trimStart + gap)));
  }

  function previewTrim() {
    const player = playerRef.current;
    if (!player || trimEnd <= trimStart) return;
    try {
      player.pause();
      player.currentTime = trimStart;
      previewOnlyRef.current = true;
      player.play().catch(() => { previewOnlyRef.current = false; showToast('Preview unavailable. Try the standard player.'); });
    } catch (error) { console.error(error); previewOnlyRef.current = false; showToast('Unable to preview this selection.'); }
  }

  function onPreviewProgress(event) {
    const player = event.currentTarget;
    if (previewOnlyRef.current && player.currentTime >= trimEnd - 0.02) {
      previewOnlyRef.current = false;
      player.pause();
    }
  }

  function downloadTake(take) { downloadBlob(take.blob, `${safeFilename(take.name)}.${extensionFor(take.mimeType || take.blob.type)}`); }

  async function downloadWav(take, clip = false) {
    if (exporting !== null) return;
    setExporting(clip ? `clip:${take.id}` : take.id);
    let ctx;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio not supported');
      ctx = new Context();
      const data = await take.blob.arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      const range = clip ? { startSeconds: trimStart, endSeconds: trimEnd } : undefined;
      const suffix = clip ? `-clip-${formatTime(trimStart * 1000, true).replace(':', 'm').replace('.', 's')}-${formatTime(trimEnd * 1000, true).replace(':', 'm').replace('.', 's')}` : '';
      downloadBlob(encodeWav(buffer, range), `${safeFilename(take.name)}${suffix}.wav`);
      showToast(clip ? 'Trimmed WAV downloaded. Original take preserved.' : 'WAV file downloaded.');
    } catch (error) { console.error('WAV export failed', error); showToast('Could not decode/export WAV. Try the original download.'); }
    finally { if (ctx) await ctx.close().catch(() => {}); if (mountedRef.current) setExporting(null); }
  }

  const recordDisabled = phase !== 'idle';
  const actionDisabled = phase !== 'recording' && phase !== 'paused';
  const phaseText = { idle: 'READY', starting: 'CONNECTING', recording: 'RECORDING', paused: 'PAUSED', saving: 'SAVING' }[phase];
  return (
    <>
      <div className="noise" aria-hidden="true" />
      <div className="page">
        <header className="topbar">
          <a className="brand" href="./" aria-label="PocketRec home"><span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span><span>pocket<span className="brand-accent">rec</span><small>THE LITTLE AUDIO RECORDER</small></span></a>
          <span className="topbar-tag"><span className="tiny-led" /> NO ACCOUNT. NO CLOUD.</span>
        </header>
        <main>
          <section className="intro" aria-labelledby="page-title">
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR SOUND. YOUR DEVICE.</div>
            <h1 id="page-title">Catch a thought.<br /><em>Keep the sound.</em></h1>
            <p>A tiny recorder for big ideas, voice notes, melodies, and whatever deserves another listen.</p>
          </section>
          <div className="workbench">
            <section className="panel record-panel" aria-labelledby="record-heading">
              <div className="panel-top"><div><p className="section-index">01 / RECORD</p><h2 id="record-heading">The recording booth</h2></div>
                <span className={`status-pill ${phase === 'recording' || phase === 'paused' ? phase : ''}`}><span className="status-dot" />{phaseText}</span></div>
              <div className="wave-wrap">
                <div className="wave-top"><span>LIVE INPUT</span><span>MIC / IN</span></div>
                <Waveform analyserRef={analyserRef} phaseRef={phaseRef} onLevel={setLevel} />
                <div className="wave-bottom"><span>◀─────────────── AUDIO SIGNAL ───────────────▶</span><span>{level}</span></div>
              </div>
              <div className="timer-block"><div className={`timer-led ${phase === 'recording' ? 'active' : phase === 'paused' ? 'paused' : ''}`} aria-hidden="true" />
                <span className="timer" role="timer">{formatTime(elapsed, true)}</span><span className="timer-label">{phase === 'recording' ? 'REC' : phase === 'paused' ? 'PAUSED' : phase === 'saving' ? 'SAVING' : 'STANDBY'}</span></div>
              <div className="mode-block"><div className="control-label">RECORDING PROFILE</div>
                <div className="mode-picker" role="group" aria-label="Recording profile">
                  {['voice', 'raw'].map((choice) => <button key={choice} type="button" className={`mode-option ${mode === choice ? 'active' : ''}`} disabled={recordDisabled} aria-pressed={mode === choice}
                    onClick={() => { setMode(choice); modeRef.current = choice; showNote(choice === 'voice' ? 'Voice profile requests noise and echo cancellation.' : 'Raw profile requests unprocessed input for music and ambience.'); }}>
                    <strong>{choice === 'voice' ? 'Voice' : 'Raw'}</strong><small>{choice === 'voice' ? 'Cleaner speech' : 'Music & ambience'}</small></button>)}
                </div>
              </div>
              <div className="transport" aria-label="Recording controls">
                <button type="button" className="record-button" disabled={recordDisabled} onClick={startRecording}><span className="record-button-circle" aria-hidden="true" />Start recording</button>
                <button type="button" className="transport-button" title="Pause or resume recording" disabled={actionDisabled} onClick={togglePause}><span aria-hidden="true">{phase === 'paused' ? '▶' : 'Ⅱ'}</span>{phase === 'paused' ? 'Resume' : 'Pause'}</button>
                <button type="button" className="transport-button stop-button" title="Stop and save recording" disabled={actionDisabled} onClick={stopRecording}><span className="stop-square" aria-hidden="true" />Stop</button>
              </div>
              <p className={`microcopy ${noteError ? 'error' : ''}`} role="status" aria-live="polite">{note}</p>
            </section>
            <section className="panel library-panel" aria-labelledby="library-heading">
              <div className="panel-top"><div><p className="section-index">02 / LIBRARY</p><h2 id="library-heading">Saved takes</h2></div>
                <span className="take-count">{takes.length} {takes.length === 1 ? 'TAKE' : 'TAKES'}</span></div>
              <p className="library-intro">Recordings are stored in this browser on this device. Keep important ones by downloading them.</p>
              <div className="take-list" aria-live="polite">{takes.length === 0 ?
                <div className="empty-library"><span className="empty-icon" aria-hidden="true">♫</span><strong>Nothing on tape. Yet.</strong><span>Hit record and your first take will land here.</span></div>
                : takes.map((take) => <TakeCard key={take.id} take={take} onPlay={playTake} onRename={renameTake} onDelete={deleteTake} onDownload={downloadTake} onWav={downloadWav} exporting={exporting} />)}</div>
              <div className="library-bottom"><span className="local-dot" />{temporary ? 'TEMPORARY SESSION STORAGE — DOWNLOAD TO KEEP' : 'LOCAL BROWSER STORAGE'}</div>
            </section>
          </div>
          {selected && <section className="player-panel" aria-label="Playback and clip editor">
            <div className="player-title"><span className="player-icon">♫</span><div><span>NOW PLAYING / EDITING</span><strong>{selected.name}</strong></div><button type="button" aria-label="Close audio player" onClick={closePlayer}>×</button></div>
            <audio ref={playerRef} controls preload="metadata" src={playerUrl} onLoadedMetadata={onAudioMetadata} onTimeUpdate={onPreviewProgress} onPause={() => { previewOnlyRef.current = false; }} />
            <div className="trim-editor" aria-label="Non-destructive audio clip editor">
              <div className="trim-head"><div><span className="trim-eyebrow">03 / CLIP EDITOR</span><h2>Keep the good part.</h2></div><span className="trim-time">{formatTime(Math.max(0, trimEnd - trimStart) * 1000, true)} SELECTED</span></div>
              <p>Choose an in and out point, preview it, then export a new WAV. Your original recording stays untouched.</p>
              {clipDuration > 0 ? <>
                <div className="trim-track" role="img" aria-label={`Selected segment from ${formatTime(trimStart * 1000, true)} to ${formatTime(trimEnd * 1000, true)} of ${formatTime(clipDuration * 1000, true)}`}>
                  <span className="trim-track-region" style={{ left: `${trimStart / clipDuration * 100}%`, width: `${Math.max(0, (trimEnd - trimStart) / clipDuration * 100)}%` }} />
                </div>
                <div className="trim-inputs">
                  <label><span>IN <strong>{formatTime(trimStart * 1000, true)}</strong></span><input aria-label="Trim start time" type="range" min="0" max={clipDuration} step="0.01" value={trimStart} onChange={(event) => setTrimBoundary('start', Number(event.target.value))} /></label>
                  <label><span>OUT <strong>{formatTime(trimEnd * 1000, true)}</strong></span><input aria-label="Trim end time" type="range" min="0" max={clipDuration} step="0.01" value={trimEnd} onChange={(event) => setTrimBoundary('end', Number(event.target.value))} /></label>
                </div>
                <div className="trim-actions"><button type="button" onClick={previewTrim}>▶ Preview selection</button><button type="button" onClick={() => { previewOnlyRef.current = false; playerRef.current?.pause(); setTrimStart(0); setTrimEnd(clipDuration); }}>Reset trim</button><button className="export-clip" disabled={exporting !== null || trimEnd <= trimStart} type="button" onClick={() => downloadWav(selected, true)}>{exporting === `clip:${selected.id}` ? 'Exporting…' : '↓ Export clip WAV'}</button></div>
              </> : <p className="trim-unavailable">Clip editing will be available once this audio's duration can be determined.</p>}
            </div>
          </section>}
        </main>
        <footer><span>POCKETREC / V1.1</span><span>RECORD FREELY. SHARE INTENTIONALLY.</span><span>REACT + VITE • MIT</span></footer>
      </div>
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
