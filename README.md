# PocketRec · PockeRec repository

**A tiny microphone recorder with a surprisingly serious little workflow.** Built as a React 19 + Vite application, free and open-source under the MIT license.

## What it does

- Record microphone audio with a live canvas waveform and dB level meter.
- Pause, resume, and stop to save each take.
- **Voice** requests noise/echo suppression and gain control; **Raw** requests these processing options off, when supported by your browser and hardware.
- Play, rename, delete, or download recordings in the browser's native audio format.
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

Open <http://localhost:5173> (or the port Vite prints). `npm test` runs audio export unit tests; `npm run build` creates the production files in `dist/`.

## Deploy to GitHub Pages

This repository has an Actions workflow for Pages. After merging PR #1, choose **Settings → Pages → Build and deployment → Source: GitHub Actions**. A push to `main` will run tests, build, and deploy to:

<https://michaelwave369.github.io/PockeRec/>

GitHub Pages serves HTTPS, which is required for microphone access on non-localhost sites. The Vite base is set to `/PockeRec/` to match the repository name exactly, including capitalization.

## Browser notes

Recorded files are saved as whichever MIME format MediaRecorder supports on the user's browser (WebM/Opus, MP4/M4A, or Ogg). WAV conversion requires the browser to decode that format, uses more RAM and disk space, and cannot recover details removed by the original codec.

If microphone permissions are denied, there is no compatible mic, or the browser lacks MediaRecorder, the recorder shows a specific status message. On private/restricted storage, takes may last only until the tab closes.

## Manual microphone check

Real microphone capture cannot be reliably validated in CI. On your PC or phone: grant microphone permission, record 5 seconds, pause and resume, stop, play, download the native file and WAV, reload to check persistence, rename, then delete. Try Voice and Raw separately.

## License

[MIT](LICENSE)
