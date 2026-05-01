/**
 * PCM AudioWorklet processor — captures raw Float32 audio from the mic,
 * computes RMS for the level meter, and posts chunks to the main thread
 * for transmission over WebSocket.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 2048;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer.push(channel[i]);
    }

    if (this._buffer.length >= this._bufferSize) {
      const chunk = new Float32Array(this._buffer.splice(0, this._bufferSize));

      let sumSq = 0;
      for (let i = 0; i < chunk.length; i++) {
        sumSq += chunk[i] * chunk[i];
      }
      const rms = Math.sqrt(sumSq / chunk.length);

      this.port.postMessage({ pcm: chunk.buffer, rms }, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
