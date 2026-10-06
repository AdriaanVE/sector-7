import { defaultPhononInputSettings } from './phonon-input-settings';
import type { PhononInputSettings } from './phonon-input-settings';

export class PhononPcmGate {
  private tailSamples = 0;
  private leadIn = new Float32Array(0);

  filter(buffer: ArrayBuffer, settings: PhononInputSettings = defaultPhononInputSettings): ArrayBuffer[] {
    const samples = new Float32Array(buffer);
    this.tailSamples = Math.min(this.tailSamples, settings.tailMs * 16);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const voiced = samples.length > 0 && Math.sqrt(energy / samples.length) >= settings.noiseFloor;
    if (voiced) {
      const leadIn = this.tailSamples === 0 && settings.leadInMs > 0 ? this.leadIn.slice(-settings.leadInMs * 16) : new Float32Array(0);
      this.tailSamples = settings.tailMs * 16;
      this.leadIn = new Float32Array(0);
      return leadIn.length ? [leadIn.buffer, buffer] : [buffer];
    }
    if (this.tailSamples > 0) {
      this.tailSamples = Math.max(0, this.tailSamples - samples.length);
      return [buffer];
    }
    const keep = settings.leadInMs * 16;
    const leadIn = new Float32Array(this.leadIn.length + samples.length);
    leadIn.set(this.leadIn); leadIn.set(samples, this.leadIn.length);
    this.leadIn = keep ? leadIn.slice(-keep) : new Float32Array(0);
    // Keep silence on the wire so Phonon can segment and finalize normally.
    return [new ArrayBuffer(buffer.byteLength)];
  }
}
