import { useEffect, useRef } from 'react';
import { formatTime } from './audio.js';

// The visual timeline is an editor only: it does not mutate or replace any saved take.
export default function ClipWaveform({ peaks, duration, start, end, playhead, onBoundaryChange, onSeek }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const draggingRef = useRef(null);
  const percent = (time) => duration > 0 ? Math.max(0, Math.min(100, time / duration * 100)) : 0;
  const timeFromPointer = (event) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    return Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration));
  };
  const handleKeys = (event, boundary) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const original = boundary === 'start' ? start : end;
    const delta = event.shiftKey ? 0.1 : 0.01;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? duration : original + (event.key === 'ArrowRight' ? delta : -delta);
    onBoundaryChange(boundary, next);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || !duration || !peaks?.length) return;
    const draw = () => {
      const rect = frame.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = 145;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#111d1b';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#304e3a';
      context.fillRect(width * start / duration, 0, width * (end - start) / duration, height);
      context.strokeStyle = '#53675b';
      context.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const x = Math.round(i * width / 10) + .5;
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
      context.strokeStyle = '#718b7a';
      context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
      const barWidth = Math.max(.7, width / peaks.length * .78);
      for (let i = 0; i < peaks.length; i++) {
        const x = (i + .5) / peaks.length * width;
        const amp = Math.max(1.3, peaks[i] * height * .44);
        context.fillStyle = x >= start / duration * width && x <= end / duration * width ? '#d3edb0' : '#729989';
        context.fillRect(x - barWidth / 2, height / 2 - amp, barWidth, amp * 2);
      }
      if (Number.isFinite(playhead)) {
        const x = Math.max(0, Math.min(width, playhead / duration * width));
        context.strokeStyle = '#ffab80'; context.lineWidth = 2;
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
    };
    draw();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    observer?.observe(frame);
    if (!observer) window.addEventListener('resize', draw);
    return () => { observer?.disconnect(); if (!observer) window.removeEventListener('resize', draw); };
  }, [peaks, duration, start, end, playhead]);
  function marker(boundary, seconds) {
    const min = boundary === 'start' ? 0 : Math.min(duration, start + Math.min(.1, duration));
    const max = boundary === 'start' ? Math.max(0, end - Math.min(.1, duration)) : duration;
    return (
      <div
        className={`clip-marker clip-marker-${boundary}`}
        role="slider"
        tabIndex={0}
        aria-label={`Trim ${boundary === 'start' ? 'IN' : 'OUT'} marker`}
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(seconds.toFixed(2))}
        aria-valuetext={formatTime(seconds * 1000, true)}
        style={{ left: `${percent(seconds)}%` }}
        onKeyDown={(event) => handleKeys(event, boundary)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          draggingRef.current = boundary;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current === boundary) onBoundaryChange(boundary, timeFromPointer(event));
        }}
        onPointerUp={(event) => {
          if (draggingRef.current === boundary) onBoundaryChange(boundary, timeFromPointer(event));
          draggingRef.current = null;
        }}
        onPointerCancel={() => { draggingRef.current = null; }}
      ><span aria-hidden="true">{boundary === 'start' ? 'IN' : 'OUT'}</span></div>
    );
  }
  return (
    <div className="waveform-timeline">
      <div className="waveform-timeline-label"><strong>RECORDED WAVEFORM</strong><span>Drag handles to trim · Click waveform to seek</span></div>
      <div className="waveform-timeline-frame" ref={frameRef}>
        <canvas className="waveform-timeline-canvas" ref={canvasRef}
          aria-label="Recorded waveform. Click or tap to seek."
          onPointerDown={(event) => { if (event.button === 0) onSeek(timeFromPointer(event)); }} />
        {marker('start', start)}
        {marker('end', end)}
      </div>
      <div className="waveform-ruler"><span>00:00.0</span><span>{formatTime(duration * 500, true)}</span><span>{formatTime(duration * 1000, true)}</span></div>
      <p className="waveform-access">Keyboard: focus an IN/OUT handle and use ← / → (Shift for larger steps). Precise sliders remain below.</p>
    </div>
  );
}
