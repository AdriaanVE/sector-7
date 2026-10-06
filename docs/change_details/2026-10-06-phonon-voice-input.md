# Live Phonon desktop dictation

The Apple silicon desktop Composer uses a new `phononStream` recognition engine. Chrome retains Web Speech. The Deepgram recorder stub is unchanged.

The renderer captures 16 kHz mono Float32 PCM through a static AudioWorklet, buffering during startup. A JSON handshake precedes binary frames. Partial hypotheses replace each other, final segments accumulate, and manual stop or Pause before stopping flushes capture, sends `end`, then waits for authoritative `done`. Errors retain finalized text without auto-sending it.

An input energy gate mutes quiet microphone noise below the configured RMS threshold while preserving the configured speech lead-in and tail. Defaults are 0.015 RMS, 100 ms lead-in and 600 ms tail. Silence frames still reach Phonon for segmentation. Capture disables automatic gain control by default. Voice input settings expose all four controls, apply changes during capture and persist them with validated workspace backups. This addresses false transcription during room tone; it does not classify loud background sounds as non-speech.

Electron owns a lazy `fermion serve phonon-2` process on loopback with a random per-launch key. Concurrent ensure calls share startup. Health has a three-minute deadline; stop cancels startup and terminates the owned process group. Crashes can be retried on the next mic press. Logs redact the launch key. The IPC methods use the existing window, main-frame and exact-origin checks.

Voice input appears first in Settings. The default-on toggle lives in the disk-backed chat settings and backups; disabling it hides the mic and stops the server. `config.json` owns only command and port, with `SECTOR7_PHONON_COMMAND` and `SECTOR7_PHONON_PORT` overrides. Python, Fermion and model weights remain separately installed.

Release intent: Desktop 0.1.4, with release notes under Unreleased. Publication follows the existing main-branch workflow after manual review.

Verification:

- Transcript event tests cover replacement, accumulation, authoritative done and error preservation.
- Engine boundary tests cover startup buffering, PCM-before-end ordering, deadline reset, busy closure and cancellation during startup.
- Process tests run a real loopback stub command for arguments, concurrent startup, health timeout, missing installation, shutdown, log redaction and crash restart.
- Workspace save and backup/restore tests preserve the toggle and reject non-boolean values.
- A real Electron AudioWorklet smoke test emits 1600-sample frames at 16 kHz and flushes a 64-sample tail from synthetic oscillator audio.
- `npm run precommit` and `npm run desktop:check` are the required quality gates.

Fermion 0.2.9 source confirms loopback binding, query-key WebSocket authentication, no Origin restriction, 1013 busy closure, PCM format and event shapes. A separate local preview installed Fermion, downloaded the model and connected a real live stream. First warm-up took 3.5 seconds. The user confirmed dictation worked, then reported false transcription during silence. An engine-boundary regression verifies quiet noise is zeroed while speech and boundaries remain. No dev server was started.

Sensitivity verification: the real Phonon model returned an empty transcript for the gated room-tone fixture and correctly transcribed “Please keep the final words in this short sentence.” with live partials. The ungated synthetic noise also returned empty, so that fixture did not reproduce the user's exact microphone noise; the engine test establishes that this quiet input is now zeroed before decoding. Full precommit passed 249 tests with 22 expected skips.

Input controls are saved in a validated `phononInputSettings` object. Threshold, lead-in and tail changes affect the next captured frame; gain changes serialize `applyConstraints` on the active audio track. The default tail is 600 ms. Pause before stopping reschedules the active deadline when changed, independently of speech tail. Warm up now opens a handshake/end stream without microphone capture, moving model load and Metal priming before dictation. Startup remains lazy by default.


Memory investigation: an independent read-only review found bounded renderer buffers and no confirmed app leak. A local synthetic rolling-decoder probe using Fermion 0.2.9 reproduced MLX cache growth: active allocations stayed near 1.296 GB while cache reached 2.803 GB after 12.4 seconds of audio. The probe stopped at a 4 GB allocation budget. A diagnostic-only 256 MiB cache limit completed two 31-second sessions with about 0.268 GB cached and stable active allocations; peak active allocations reached 1.841 GB. No production cache limit or upstream package edit is included. The user's exact process/spike was unavailable after the preview quit. Toggle off or app quit releases the owned process; a Fermion cache limit is the preferred corrective action. Settings gain/timer regressions reproduced the independent review findings and passed after local fixes.
