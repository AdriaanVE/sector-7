/* AudioContext runs at 16 kHz. Emit 100 ms of mono Float32 PCM per frame. */
class PhononPcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(1600);
    this.offset = 0;
    this.port.onmessage = event => {
      if (event.data === 'flush') {
        if (this.offset) this.port.postMessage(this.frame.slice(0, this.offset), []);
        this.offset = 0;
        this.port.postMessage('flushed');
      }
    };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) for (let i = 0; i < input.length; i++) {
      this.frame[this.offset++] = input[i];
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(1600);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('phonon-pcm-tap', PhononPcmTap);
