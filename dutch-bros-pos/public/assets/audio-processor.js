// src/assets/audio-processor.js

/**
 * An AudioWorkletProcessor to downsample audio to 16kHz PCM.
 * It receives audio from the mic (e.g., at 48kHz) and
 * sends 16kHz, 16-bit PCM audio back to the main thread.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // The target sample rate is passed in from the service
    this.targetSampleRate = options.processorOptions.targetSampleRate || 16000;
    this.sourceSampleRate = sampleRate; // sampleRate is a global in AudioWorklet
    this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;
    this.buffer = [];
  }

  /**
   * Converts a Float32 value (-1.0 to 1.0) to a 16-bit PCM value.
   */
  floatTo16BitPCM(floatVal) {
    const s = Math.max(-1, Math.min(1, floatVal));
    return s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  process(inputs, outputs, parameters) {
    // inputs[0][0] is the Float32Array of audio data for the first channel
    const inputData = inputs[0][0];

    if (!inputData) {
      return true; // Keep the processor alive
    }

    // Downsample: This is a simple "nearest neighbor" resampling.
    // For every 'resampleRatio' samples in the input, we pick one.
    for (let i = 0; i < inputData.length; i += this.resampleRatio) {
      const index = Math.floor(i);
      this.buffer.push(this.floatTo16BitPCM(inputData[index]));
    }

    // Send the data back to the main thread in chunks
    while (this.buffer.length >= 1024) {
      const chunk = this.buffer.splice(0, 1024);
      const int16Array = new Int16Array(chunk);
      
      // Post the ArrayBuffer back to the service
      this.port.postMessage(int16Array.buffer, [int16Array.buffer]);
    }

    return true; // Tell the browser to keep this processor alive
  }
}

registerProcessor("audio-processor", AudioProcessor);