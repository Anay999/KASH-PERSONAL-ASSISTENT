/**
 * WebSocket Gateway Client for Project JARVIS.
 * Handles auto-reconnect, binary audio frames, and structured JSON events.
 */
class JarvisWebSocket {
  constructor() {
    this.ws = null;
    this.url = null;
    this.handlers = new Map();
    this.isConnected = false;
    this.reconnectTimeout = null;
    this._reconnectAttempts = 0;
  }

  isReady() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(url = null) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (!url) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In Vite dev, window.location.host is localhost:5173 which proxies /ws to 8000
      const host = window.location.host || '127.0.0.1:8000';
      this.url = `${protocol}//${host}/ws/session`;
    } else {
      this.url = url;
    }

    try {
      console.log(`[JARVIS WS] Connecting to ${this.url}...`);
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.isConnected = true;
        this._reconnectAttempts = 0;
        this.emit('connection', { connected: true });
        console.log('[JARVIS WS] Connected successfully.');
      };

      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data);
            this.emit(data.type, data.payload);
          } catch (err) {
            console.error('[JARVIS WS] Error parsing incoming text message:', err);
          }
        } else if (event.data instanceof ArrayBuffer) {
          this.emit('binary', event.data);
        }
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.emit('connection', { connected: false });
        console.warn(`[JARVIS WS] Connection closed (code: ${event.code}). Scheduling reconnect...`);
        this._scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[JARVIS WS] Error:', err);
      };
    } catch (e) {
      console.error('[JARVIS WS] Exception during connection setup:', e);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this._reconnectAttempts++;
    const delay = Math.min(10000, 1500 * Math.min(this._reconnectAttempts, 5));
    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.url);
    }, delay);
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (!this.handlers.has(event)) return;
    const list = this.handlers.get(event).filter(h => h !== handler);
    this.handlers.set(event, list);
  }

  emit(event, payload) {
    const list = this.handlers.get(event);
    if (list) {
      list.forEach(handler => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[JARVIS WS] Handler error for event '${event}':`, err);
        }
      });
    }
  }

  send(type, payload = {}) {
    if (!this.isReady()) {
      console.warn(`[JARVIS WS] Cannot send '${type}': socket is not open.`);
      return false;
    }
    try {
      this.ws.send(JSON.stringify({ type, ...payload }));
      return true;
    } catch (e) {
      console.error(`[JARVIS WS] Error sending '${type}':`, e);
      return false;
    }
  }

  sendBinary(arrayBuffer) {
    if (!this.isReady()) {
      console.warn('[JARVIS WS] Cannot send binary data: socket is not open.');
      return false;
    }
    try {
      this.ws.send(arrayBuffer);
      return true;
    } catch (e) {
      console.error('[JARVIS WS] Error sending binary frame:', e);
      return false;
    }
  }

  sendAudioStart() {
    return this.send('audio.start');
  }

  sendAudioEnd() {
    return this.send('audio.end');
  }

  sendInterrupt() {
    return this.send('audio.interrupt');
  }

  sendPlaybackComplete() {
    return this.send('playback.complete');
  }

  sendUserMessage(text) {
    return this.send('user.message', { text });
  }
}

export const jarvisWs = new JarvisWebSocket();
