import { useRef, useState } from 'react';
import { FILE_ACCEPT,MAX_IMPORT_BATCH } from './imports.js';

export default function AudioImporter({onFiles,busy,disabled,feedback}) {
  const inputRef=useRef(null);
  const [dragging,setDragging]=useState(false);
  const unavailable=busy||disabled;
  function acceptFiles(files) {
    if(unavailable) return;
    const picked=Array.from(files||[]);
    if(picked.length) onFiles(picked);
  }
  return <section className={'import-zone'+(dragging?' dragging':'')+(unavailable?' inactive':'')}
    aria-label="Import audio files into the local library"
    onDragEnter={event=>{event.preventDefault(); if(!unavailable) setDragging(true);}}
    onDragOver={event=>{event.preventDefault(); event.dataTransfer.dropEffect=unavailable?'none':'copy';}}
    onDragLeave={event=>{event.preventDefault(); if(!event.currentTarget.contains(event.relatedTarget)) setDragging(false);}}
    onDrop={event=>{event.preventDefault();setDragging(false);acceptFiles(event.dataTransfer.files);}}>
    <div className="import-zone-heading"><span className="import-symbol" aria-hidden="true">↓</span><div>
      <strong>Bring your own audio.</strong>
      <p>Drop WAV, MP3, M4A, OGG, WebM or FLAC here, or choose files. Browser codec support varies.</p>
    </div></div>
    <div className="import-options">
      <button type="button" disabled={unavailable} onClick={()=>inputRef.current?.click()}>
        {busy?'Importing audio…':'＋ Choose audio files'}
      </button>
      <span>Up to {MAX_IMPORT_BATCH} files · 32 MiB/file · 10 min/file</span>
    </div>
    <input ref={inputRef} className="import-native-input" type="file" multiple accept={FILE_ACCEPT}
      tabIndex={-1} aria-label="Choose audio files" onChange={event=>{
        const files=Array.from(event.currentTarget.files||[]);
        event.currentTarget.value='';
        acceptFiles(files);
      }}/>
    {feedback&&<p className={'import-feedback'+(feedback.error?' error':'')} role="status" aria-live="polite">{feedback.text}</p>}
  </section>;
}
