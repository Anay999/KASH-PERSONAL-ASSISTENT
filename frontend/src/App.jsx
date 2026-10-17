import React, { useState, useEffect, useCallback, useRef } from 'react';
import './styles/jarvis.css';
import './styles/spatial.css';

import { SpatialShell } from './components/spatial/SpatialShell';
import { jarvisWs } from './services/websocket';
import { audioRecorder } from './services/audioRecorder';
import { audioPlayer } from './services/audioPlayer';

export function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [voiceState, setVoiceState] = useState('idle');
  const [voiceDetail, setVoiceDetail] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [micLevel, setMicLevel] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);

  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');

  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolCall, setActiveToolCall] = useState(null);

  const [healthData, setHealthData] = useState(null);
  const [statusNotice, setStatusNotice] = useState('');
  const [eventHistory, setEventHistory] = useState([]);

  // Streaming text buffer ref to avoid race conditions
  const streamingBufferRef = useRef('');
  const serverGeneratingRef = useRef(false);
  const isStartingRef = useRef(false);

  // Helper to append real-time event trace
  const logTraceEvent = useCallback((type, payload, isError = false) => {
    const timeStr = new Date().toLocaleTimeString();
    setEventHistory(prev => [
      { timestamp: timeStr, type, payload, isError },
      ...prev.slice(0, 49) // Retain last 50 events
    ]);
  }, []);

  // Fetch health telemetry periodically
  const fetchHealth = useCallback(async () => {
    try {
      const resp = await fetch('/api/health');
      if (resp.ok) {
        const data = await resp.json();
        setHealthData(data);
      }
    } catch (e) {
      // offline fallback
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Setup WebSocket connection and listeners (PRESERVED VOICE LIFECYCLE)
  useEffect(() => {
    jarvisWs.connect();

    const unsubConn = jarvisWs.on('connection', ({ connected }) => {
      setIsConnected(connected);
      logTraceEvent('connection', { connected });
      if (!connected) {
        setStatusNotice('Connecting to JARVIS Gateway...');
      } else {
        setStatusNotice('');
      }
    });

    const unsubState = jarvisWs.on('session.state', ({ state, detail }) => {
      logTraceEvent('session.state', { state, detail });
      // Only set to idle from server if audioPlayer is not actively playing speech
      if (state === 'idle' && audioPlayer.isPlaying) {
        // Player is still speaking, let audioPlayer.onPlaybackComplete handle the transition
        return;
      }
      setVoiceState(state);
      setVoiceDetail(detail || '');
      if (state === 'idle') {
        setActiveToolCall(null);
      }
    });

    const unsubPartial = jarvisWs.on('transcript.partial', ({ text }) => {
      setPartialTranscript(text);
      logTraceEvent('transcript.partial', { text });
    });

    const unsubFinal = jarvisWs.on('transcript.final', ({ text }) => {
      setFinalTranscript(text);
      setPartialTranscript('');
      setStatusNotice('');
      logTraceEvent('transcript.final', { text });
      setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    });

    const unsubEmpty = jarvisWs.on('transcript.empty', ({ message }) => {
      logTraceEvent('transcript.empty', { message });
      setStatusNotice(message || 'No speech detected.');
      setVoiceState('idle');
      setTimeout(() => setStatusNotice(''), 3500);
    });

    const unsubToken = jarvisWs.on('ai.token', ({ token }) => {
      serverGeneratingRef.current = true;
      streamingBufferRef.current += token;
      setStreamingText(streamingBufferRef.current);
    });

    const unsubComplete = jarvisWs.on('ai.complete', ({ text }) => {
      serverGeneratingRef.current = false;
      const fullResponse = text || streamingBufferRef.current;
      logTraceEvent('ai.complete', { length: fullResponse?.length || 0 });
      if (fullResponse) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() }
        ]);
      }
      streamingBufferRef.current = '';
      setStreamingText('');
      setActiveToolCall(null);
    });

    const unsubToolCall = jarvisWs.on('tool.call', ({ name, args, call_id }) => {
      logTraceEvent('tool.call', { name, args });
      setActiveToolCall({ name, args, call_id });
    });

    const unsubToolResult = jarvisWs.on('tool.result', ({ name, result, status }) => {
      logTraceEvent('tool.result', { name, status });
      setActiveToolCall(prev => prev ? { ...prev, result, status } : null);
    });

    const unsubAudioChunk = jarvisWs.on('audio.chunk', ({ audio, mime, seq }) => {
      logTraceEvent('audio.chunk', { seq, mime });
      setVoiceState('speaking');
      audioPlayer.enqueue(audio, mime, seq ?? 0);
    });

    const unsubAudioComplete = jarvisWs.on('audio.complete', () => {
      logTraceEvent('audio.complete', {});
      // Server finished synthesizing audio chunks
      if (!audioPlayer.isPlaying && !serverGeneratingRef.current) {
        setVoiceState('idle');
      }
    });

    const unsubInterrupt = jarvisWs.on('audio.interrupt', () => {
      logTraceEvent('audio.interrupt', {});
      audioPlayer.stop();
      serverGeneratingRef.current = false;
      setVoiceState('idle');
      streamingBufferRef.current = '';
      setStreamingText('');
      setActiveToolCall(null);
    });

    const unsubError = jarvisWs.on('error', ({ message }) => {
      console.error('[JARVIS ERROR]', message);
      logTraceEvent('error', { message }, true);
      setStatusNotice(message || 'Inference error encountered.');
      setVoiceState('error');
      setVoiceDetail(message);
      setTimeout(() => {
        setVoiceState('idle');
        setStatusNotice('');
      }, 4000);
    });

    // Wire AudioPlayer real-time playback events
    audioPlayer.onLevelChange = (lvl) => {
      setAudioLevel(lvl);
    };

    audioPlayer.onStateChange = (playing) => {
      if (playing) {
        setVoiceState('speaking');
      }
    };

    audioPlayer.onPlaybackComplete = () => {
      logTraceEvent('playback.complete', {});
      if (!serverGeneratingRef.current) {
        setVoiceState('idle');
        jarvisWs.sendPlaybackComplete();
      }
    };

    return () => {
      unsubConn();
      unsubState();
      unsubPartial();
      unsubFinal();
      unsubEmpty();
      unsubToken();
      unsubComplete();
      unsubToolCall();
      unsubToolResult();
      unsubAudioChunk();
      unsubAudioComplete();
      unsubInterrupt();
      unsubError();
    };
  }, [logTraceEvent]);

  const handleInterrupt = useCallback(() => {
    audioPlayer.stop();
    serverGeneratingRef.current = false;
    jarvisWs.sendInterrupt();
    streamingBufferRef.current = '';
    setStreamingText('');
    setActiveToolCall(null);
    setVoiceState('idle');
    logTraceEvent('user.interrupt', {});
  }, [logTraceEvent]);

  // Voice Recording Actions (PROTECTED PIPELINE)
  const handleStartRecording = useCallback(async () => {
    if (isRecording || isStartingRef.current) {
      console.warn('[App] Start recording already in flight, ignoring duplicate trigger.');
      return;
    }
    isStartingRef.current = true;

    // If assistant is speaking or playing, interrupt it first
    if (voiceState === 'speaking' || audioPlayer.isPlaying) {
      handleInterrupt();
    }

    try {
      setStatusNotice('');
      // Request mic and initialize recorder BEFORE emitting audio.start
      await audioRecorder.start((level) => {
        setMicLevel(level);
      });
      setIsRecording(true);
      logTraceEvent('audio.start', {});
      jarvisWs.sendAudioStart();
    } catch (e) {
      console.error('Microphone access denied or error:', e);
      setIsRecording(false);
      setStatusNotice(e.message || 'Microphone error.');
      logTraceEvent('mic.error', { error: e.message }, true);
      alert(e.message || 'Microphone access is required for voice commands.');
    } finally {
      isStartingRef.current = false;
    }
  }, [isRecording, voiceState, handleInterrupt, logTraceEvent]);

  const handleStopRecording = useCallback(async () => {
    if (!isRecording || isStartingRef.current) return;
    setIsRecording(false);
    setMicLevel(0);

    const result = await audioRecorder.stop();
    if (!result || result.durationSec < 0.25 || result.maxAmplitude === 0) {
      console.warn('[App] Recording too short or silent.');
      setStatusNotice('Recording was too short. Hold and speak clearly.');
      logTraceEvent('audio.discarded', { reason: 'too_short_or_silent' });
      jarvisWs.sendInterrupt();
      setTimeout(() => setStatusNotice(''), 3000);
      return;
    }

    // Send binary 16kHz WAV frame and trigger audio.end
    logTraceEvent('audio.submitting', { durationSec: result.durationSec, bytes: result.wavBuffer.byteLength });
    jarvisWs.sendBinary(result.wavBuffer);
    jarvisWs.sendAudioEnd();
  }, [isRecording, logTraceEvent]);

  const handleToggleContinuous = useCallback(() => {
    const nextMode = !isContinuous;
    setIsContinuous(nextMode);
    jarvisWs.send('session.config', { continuous: nextMode });
  }, [isContinuous]);

  // Text message submission (Fallback)
  const handleSendMessage = useCallback((text) => {
    if (!text.trim()) return;
    if (voiceState === 'speaking' || audioPlayer.isPlaying) {
      handleInterrupt();
    }
    setFinalTranscript(text);
    setPartialTranscript('');
    setStatusNotice('');
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    logTraceEvent('user.message', { text });
    jarvisWs.sendUserMessage(text);
  }, [voiceState, handleInterrupt, logTraceEvent]);

  const handleClearHistory = useCallback(async () => {
    if (!window.confirm('Clear all conversation history?')) return;
    try {
      const resp = await fetch('/api/conversations/clear', { method: 'POST' });
      if (resp.ok) {
        setMessages([]);
        streamingBufferRef.current = '';
        setStreamingText('');
        setFinalTranscript('');
        setPartialTranscript('');
        logTraceEvent('conversations.cleared', {});
      }
    } catch (e) {
      console.error('Failed clearing history:', e);
    }
  }, [logTraceEvent]);

  return (
    <SpatialShell
      isConnected={isConnected}
      voiceState={voiceState}
      voiceDetail={voiceDetail}
      audioLevel={audioLevel}
      micLevel={micLevel}
      isRecording={isRecording}
      isContinuous={isContinuous}
      partialTranscript={partialTranscript}
      finalTranscript={finalTranscript}
      messages={messages}
      streamingText={streamingText}
      activeToolCall={activeToolCall}
      statusNotice={statusNotice}
      eventHistory={eventHistory}
      healthData={healthData}
      onStartRecording={handleStartRecording}
      onStopRecording={handleStopRecording}
      onToggleContinuous={handleToggleContinuous}
      onInterrupt={handleInterrupt}
      onSendMessage={handleSendMessage}
      onClearHistory={handleClearHistory}
    />
  );
}

export default App;
