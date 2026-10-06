# Live Phonon desktop dictation

The Apple silicon desktop Composer uses a new `phononStream` recognition engine. Chrome retains Web Speech. The Deepgram recorder stub is unchanged.

The renderer captures 16 kHz mono Float32 PCM through a static AudioWorklet, buffering during startup. A JSON handshake precedes binary frames. Partial hypotheses replace each other, final segments accumulate, and manual stop or Mic Timeout flushes capture, sends `end`, then waits for authoritative `done`. Errors retain finalized text without auto-sending it.

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

Fermion 0.2.9 source confirms loopback binding, query-key WebSocket authentication, no Origin restriction, 1013 busy closure, PCM format and event shapes. Live Phonon model latency, first model download and real microphone acceptance remain unverified because Fermion is not installed on the verification host. No dev server was started.
