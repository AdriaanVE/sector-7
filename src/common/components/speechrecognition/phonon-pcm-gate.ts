// Phonon's 0.004 RMS floor admits amplified room tone. Gate locally before decoding.
const SPEECH_RMS = 0.015;
const TAIL_SAMPLES = 4800; // 300 ms at 16 kHz protects quiet word endings.

export class PhononPcmGate {
  private tailSamples = 0;
  private leadIn?: Float32Array<ArrayBuffer>;

  filter(buffer: ArrayBuffer): ArrayBuffer[] {
    const samples = new Float32Array(buffer);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const voiced = samples.length > 0 && Math.sqrt(energy / samples.length) >= SPEECH_RMS;
    if (voiced) {
      const leadIn = this.tailSamples === 0 ? this.leadIn : undefined;
      this.tailSamples = TAIL_SAMPLES;
      this.leadIn = undefined;
      // Replay one quiet frame to retain the onset without delaying live speech.
      return leadIn ? [leadIn.buffer, buffer] : [buffer];
    }
    if (this.tailSamples > 0) {
      this.tailSamples = Math.max(0, this.tailSamples - samples.length);
      return [buffer];
    }
    this.leadIn = samples;
    // Keep silence on the wire so Phonon can segment and finalize normally.
    return [new ArrayBuffer(buffer.byteLength)];
  }
}
