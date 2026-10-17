/**
 * Web Audio API Player with sequential queuing, in-order decoding, audio analyser, and instant interruption.
 */
class AudioPlayerService {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.queue = [];
    this.isPlaying = false;
    this.currentSource = null;
    this.onStateChange = null;
    this.onLevelChange = null;
    this.onPlaybackComplete = null;
    this.analyserInterval = null;

    this._pendingChunks = [];
    this._isDecoding = false;

    // Listen for first user gesture to unlock Web Audio context
    this._setupAutoplayUnlock();
  }

  _setupAutoplayUnlock() {
    const unlock = () => {
      this.initContext();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('click', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true });
    }
  }

  initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.connect(this.audioCtx.destination);
      this._startAnalyserLoop();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  _startAnalyserLoop() {
    if (this.analyserInterval) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const loop = () => {
      if (this.analyser && this.isPlaying) {
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1.0, avg / 128.0);
        if (this.onLevelChange) {
          this.onLevelChange(normalized);
        }
      } else if (this.onLevelChange) {
        this.onLevelChange(0.0);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async enqueue(audioBase64, mimeType = 'audio/mp3', seq = 0) {
    this.initContext();
    this._pendingChunks.push({ audioBase64, mimeType, seq });
    this._pendingChunks.sort((a, b) => a.seq - b.seq);
    this._processNextDecoding();
  }

  async _processNextDecoding() {
    if (this._isDecoding || this._pendingChunks.length === 0) {
      return;
    }
    this._isDecoding = true;
    const item = this._pendingChunks.shift();

    try {
      const binaryString = atob(item.audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));
      this.queue.push({ buffer: audioBuffer, seq: item.seq });
      this.queue.sort((a, b) => a.seq - b.seq);

      if (!this.isPlaying) {
        this._playNext();
      }
    } catch (e) {
      console.error(`[AudioPlayer] Failed to decode audio chunk #${item.seq}:`, e);
    } finally {
      this._isDecoding = false;
      if (this._pendingChunks.length > 0) {
        this._processNextDecoding();
      }
    }
  }

  _playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
      if (this.onLevelChange) this.onLevelChange(0.0);
      if (this.onPlaybackComplete) this.onPlaybackComplete();
      return;
    }

    this.isPlaying = true;
    if (this.onStateChange) this.onStateChange(true);

    const item = this.queue.shift();
    const source = this.audioCtx.createBufferSource();
    source.buffer = item.buffer;
    source.connect(this.analyser);

    this.currentSource = source;

    source.onended = () => {
      if (this.currentSource === source) {
        this.currentSource = null;
        this._playNext();
      }
    };

    source.start(0);
  }

  stop() {
    this._pendingChunks = [];
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop(0);
        this.currentSource.disconnect();
      } catch (e) {
        // ignore
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange(false);
    if (this.onLevelChange) this.onLevelChange(0.0);
  }
}

export const audioPlayer = new AudioPlayerService();
