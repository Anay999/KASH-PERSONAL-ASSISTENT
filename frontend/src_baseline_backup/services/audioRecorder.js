/**
 * Robust Microphone Audio Capture Service.
 * Captures microphone stream, resamples accurately to 16kHz mono PCM,
 * and encodes a standard 16-bit PCM WAV container.
 */
class AudioRecorderService {
  constructor() {
    this.mediaStream = null;
    this.audioCtx = null;
    this.scriptProcessor = null;
    this.source = null;
    this.isRecording = false;
    this.rawFloatChunks = [];
    this.onLevel = null;
    this.actualSampleRate = 16000;
  }

  async start(onLevelCallback) {
    if (this.isRecording) {
      console.warn('[AudioRecorder] Already recording, ignoring duplicate start.');
      return;
    }

    this.onLevel = onLevelCallback;
    this.rawFloatChunks = [];

    // 1. Request microphone access
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
    } catch (err) {
      console.error('[AudioRecorder] getUserMedia error:', err);
      let errorMsg = 'Microphone access denied or unavailable.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Microphone permission denied. Please allow microphone access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No microphone device found on this system.';
      }
      throw new Error(errorMsg);
    }

    // 2. Initialize AudioContext at native rate (browsers often ignore requested sampleRate)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    this.actualSampleRate = this.audioCtx.sampleRate;
    console.log(`[AudioRecorder] AudioContext initialized at native ${this.actualSampleRate} Hz`);

    this.source = this.audioCtx.createMediaStreamSource(this.mediaStream);

    // Buffer size 4096 gives ~85ms updates at 48kHz
    this.scriptProcessor = this.audioCtx.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);

      // Compute RMS amplitude for UI feedback
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const level = Math.min(1.0, rms * 5.0);
      if (this.onLevel) {
        this.onLevel(level);
      }

      // Store clone of float32 samples for resampling at stop
      this.rawFloatChunks.push(new Float32Array(inputData));
    };

    this.source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioCtx.destination);
    this.isRecording = true;
  }

  async stop() {
    if (!this.isRecording) {
      return null;
    }
    this.isRecording = false;

    // Disconnect and release audio resources
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    const recordedSampleRate = this.actualSampleRate;
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      await this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    if (this.onLevel) {
      this.onLevel(0.0);
    }

    if (this.rawFloatChunks.length === 0) {
      return null;
    }

    // 1. Merge all raw float32 chunks
    const totalRawSamples = this.rawFloatChunks.reduce((acc, c) => acc + c.length, 0);
    const mergedFloat = new Float32Array(totalRawSamples);
    let offset = 0;
    for (const chunk of this.rawFloatChunks) {
      mergedFloat.set(chunk, offset);
      offset += chunk.length;
    }
    this.rawFloatChunks = [];

    // Calculate maximum amplitude to detect absolute silence
    let maxAmp = 0;
    for (let i = 0; i < mergedFloat.length; i++) {
      const abs = Math.abs(mergedFloat[i]);
      if (abs > maxAmp) maxAmp = abs;
    }

    // 2. Resample to standard 16,000 Hz if native rate differs
    const targetSampleRate = 16000;
    const resampledFloat = this._resampleLinear(mergedFloat, recordedSampleRate, targetSampleRate);

    // 3. Convert float32 [-1.0, 1.0] to signed 16-bit PCM
    const pcm16 = new Int16Array(resampledFloat.length);
    for (let i = 0; i < resampledFloat.length; i++) {
      const s = Math.max(-1, Math.min(1, resampledFloat[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const durationSec = pcm16.length / targetSampleRate;
    console.log(`[AudioRecorder] Recorded ${durationSec.toFixed(2)}s audio (max amplitude: ${maxAmp.toFixed(3)}, resampled ${recordedSampleRate} -> ${targetSampleRate}Hz)`);

    // 4. Encode as standard 16-bit 16kHz mono WAV
    const wavBuffer = this._encodeWav(pcm16, targetSampleRate);

    return {
      wavBuffer,
      durationSec,
      maxAmplitude: maxAmp,
      sampleCount: pcm16.length,
      sampleRate: targetSampleRate
    };
  }

  cancel() {
    this.isRecording = false;
    this.rawFloatChunks = [];
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.onLevel) {
      this.onLevel(0.0);
    }
  }

  _resampleLinear(inputSamples, fromRate, toRate) {
    if (fromRate === toRate || inputSamples.length === 0) {
      return inputSamples;
    }
    const ratio = fromRate / toRate;
    const newLength = Math.round(inputSamples.length / ratio);
    const output = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;
      const nextIndex = Math.min(index + 1, inputSamples.length - 1);
      output[i] = inputSamples[index] * (1 - frac) + inputSamples[nextIndex] * frac;
    }
    return output;
  }

  _encodeWav(pcm16Samples, sampleRate) {
    const dataSize = pcm16Samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this._writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);              // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true);              // NumChannels (1 mono)
    view.setUint32(24, sampleRate, true);     // SampleRate (16000)
    view.setUint32(28, sampleRate * 2, true); // ByteRate (16000 * 1 * 2)
    view.setUint16(32, 2, true);              // BlockAlign (1 * 2)
    view.setUint16(34, 16, true);             // BitsPerSample (16)

    // DATA sub-chunk
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Copy PCM16 samples
    let offset = 44;
    for (let i = 0; i < pcm16Samples.length; i++) {
      view.setInt16(offset, pcm16Samples[i], true);
      offset += 2;
    }

    return buffer;
  }

  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

export const audioRecorder = new AudioRecorderService();
