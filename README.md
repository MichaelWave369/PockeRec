# PocketRec · PockeRec repository

**A tiny microphone recorder with a surprisingly serious little workflow.** Built as a React 19 + Vite application, free and open-source under the MIT license.

## What it does

- Record microphone audio with a live canvas waveform and dB level meter.
- Pause, resume, and stop to save each take.
- **Voice** requests noise/echo suppression and gain control; **Raw** requests these processing options off, when supported by your browser and hardware.
- Play, rename, delete, or download recordings in the browser's native audio format.
- **Clip Editor (v1.1):** Select IN and OUT positions, preview just that interval, and export it as a new WAV while preserving the original take.
- Convert each take to stereo/mono 16-bit PCM WAV, entirely on your device.
- Save takes locally in IndexedDB with a clear temporary-session fallback when storage fails.
- Works on desktop and mobile browsers that support microphone capture and MediaRecorder.

**Privacy:** No audio is uploaded. No analytics or accounts. Browser storage is not a backup, so download important recordings! Capture only with permission and follow applicable recording-consent laws. This is a microphone recorder, not a system-audio recorder.

## Develop

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173> (or the port Vite prints). `npm test` runs audio export and non-destructive trimming unit tests; `npm run build` creates the production files in `dist/`.

## Deploy to GitHub Pages

This repository has an Actions workflow for Pages. After merging PR #1, choose **Settings → Pages → Build and deployment → Source: GitHub Actions**. A push to `main` will run tests, build, and deploy to:

<https://michaelwave369.github.io/PockeRec/>

GitHub Pages serves HTTPS, which is required for microphone access on non-localhost sites. The Vite base is set to `/PockeRec/` to match the repository name exactly, including capitalization.

## Browser notes

Recorded files are saved as whichever MIME format MediaRecorder supports on the user's browser (WebM/Opus, MP4/M4A, or Ogg). WAV conversion and clip export require the browser to decode that format, use more RAM and disk space, and cannot recover details removed by the original codec. Clip export is a separate 16-bit PCM WAV, never a destructive edit or re-encode of the saved original.

If microphone permissions are denied, there is no compatible mic, or the browser lacks MediaRecorder, the recorder shows a specific status message. On private/restricted storage, takes may last only until the tab closes.

## Manual microphone check

Real microphone capture cannot be reliably validated in CI. On your PC or phone: grant microphone permission, record 5 seconds, pause and resume, stop, play, download the native file and WAV, reload to check persistence, rename, then delete. Try Voice and Raw separately. For the clip editor: open a take, move both trim sliders, preview only the selected interval, download the clip WAV, then confirm the original take still plays in full.

## License

[MIT](LICENSE)

## v1.2 waveform timeline

When you open a saved take, PockeRec decodes it locally into a 512-column peak envelope and displays a waveform in the clip editor. Drag the **IN** and **OUT** markers directly, or tab to either handle and use left/right arrows (Shift for bigger increments). Click/tap the waveform to seek. The existing precise range sliders and original-format playback are retained. The playhead follows playback.

This analysis is **non-destructive**, never stored remotely, and is cancelled when switching takes. Files over 80 MiB or recordings longer than 90 minutes skip visualization to avoid an automatic large decode; the sliders still work. If audio decoding fails, trimming controls remain accessible. Waveform peaks are a bounded visual approximation, not sample-accurate DSP; the WAV export uses the existing exact sample-frame clip calculation.

### v1.2 manual QA

Record a short take, open it, verify a visible waveform and moving playhead, drag both markers on desktop and mobile, nudge them with keyboard arrows, preview the selected range, export WAV, compare clip duration, then reopen the saved original to confirm no change.

## v1.3: The finishing desk

After choosing the clip's IN/OUT points, apply a -18 to +18 dB level adjustment, 0-5 second fade-in and fade-out, and optional peak normalization to -1 dBFS (calculated before fades; manual gain is applied afterward). Preview the selection with the same processing as the exported WAV using the browser's Web Audio API. Existing saved takes, raw-format downloads, and whole-take WAV exports are unchanged.

**Important:** Peak normalization is not loudness (LUFS) normalization or noise removal. Gain beyond headroom can clip; PCM export hard-clamps samples. Fades automatically cap at half the selection. The processed preview needs a decoded buffer; recordings over the waveform safety threshold or unsupported codecs fall back to the original, unprocessed preview. The HTML playback bar always plays the original.

### Manual testing

Record a short speaking sample. Trim a segment. Set gain to -12 dB, add 0.5 second fades, preview and export finished WAV. Check the wave starts/ends near zero, normalization boosts a quiet sample, the original audio remains available, and changing takes resets the finishing desk. Test browser permissions and phone touch separately.

## v1.4: Offline Audio Effects Rack

PockeRec adds a 0–400 Hz high-pass rumble filter, independent low/mid/high EQ (±12 dB shelving/peaking), a simple smoothed gate, and a threshold/ratio compressor. Open a take and trim, set the effects, then preview and export a finished WAV.

Both processed preview and finished WAV export use the **same deterministic sample-domain renderer**. Effects run high-pass → EQ → gate → compressor → peak normalization (if enabled) → manual gain → fades. Preview uses a Web Audio AudioBuffer assembled from the rendered samples; WAV encodes those same samples. Browser-native playback and whole-take WAV downloads remain unprocessed. Source recordings remain untouched. No cloud services or external DSP dependencies.

Notes: The high-pass and EQ use cookbook biquad filters. Gate and compressor are intentionally lightweight and can produce artifacts on difficult material. This is not AI denoising, limiting, or professional loudness mastering. Finished clips render in memory, capped at about 160 MiB of float channel data; shorten very long selections. On browsers unable to decode a take, the app will not label raw audio as a processed preview.

### v1.4 manual QA
1. Record a spoken phrase and open its editor, verify the waveform and reset controls.
2. Move high-pass to 120 Hz, lower the lows, boost the mids, enable the gate below the speech floor and compressor around -20 dBFS.
3. Preview the result, then export a finished WAV; listen for comparable processing, especially gate behavior and fade timing.
4. Download the original recording and confirm its bytes and playback are unchanged.
5. Test mobile range sliders and switching takes resets the effect settings.

## v1.5: Local Preset Vault

Four one-click starter sound presets: **Podcast Voice**, **DJ Drop**, **Warm Vocal**, and **Raw Music**. Applying a preset changes the non-destructive Effects Rack and Finishing Desk controls only. It never modifies any saved recording. These are useful starting points, not mastering guarantees; audition every take before exporting.

Save up to **30 custom presets** to this browser, or export them as a versioned JSON file for backup and sharing. Import compatible preset JSON (maximum 64 KiB); foreign IDs are discarded, malformed values are rejected, and duplicates already saved locally are skipped by name. Both finishing controls and effects controls are included in each preset. Import/export contains **settings only**, never recorded audio.

Presets use localStorage, separate from the existing IndexedDB recording library. If site storage is denied or corrupted, built-in presets still work, but the custom save/import controls are disabled with an explanation. The app does not add accounts, cloud storage, or any recording uploads.

### v1.5 manual QA

Create a 5-second recording, open the editor, apply each built-in preset, confirm the sliders update, and compare processed preview and finished WAV. Adjust controls, save a custom preset, reload, apply the saved settings to another take, export and delete the custom preset, and import it from the exported JSON. Check all controls on a phone and when site storage is denied.
