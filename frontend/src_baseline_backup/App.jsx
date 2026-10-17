import React, { useState, useEffect, useCallback, useRef } from 'react';
import './styles/jarvis.css';
import { SystemTelemetry } from './components/SystemTelemetry';
import { NeuralSphere } from './components/NeuralSphere';
import { VoiceCardControls } from './components/VoiceCardControls';
import { LiveTranscriptCard } from './components/LiveTranscriptCard';
import { ConversationPanel } from './components/ConversationPanel';
import { TextInputBar } from './components/TextInputBar';
import { MemoryDrawer } from './components/MemoryDrawer';

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

  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [ttsProvider, setTtsProvider] = useState('edge-tts');
  const [activeModel, setActiveModel] = useState('qwen2.5:3b');
  const [statusNotice, setStatusNotice] = useState('');

  // Streaming text buffer ref to avoid race conditions
  const streamingBufferRef = useRef('');
  const serverGeneratingRef = useRef(false);

  // Fetch health telemetry periodically
  const fetchHealth = useCallback(async () => {
    try {
      const resp = await fetch('/api/health');
      if (resp.ok) {
        const data = await resp.json();
        if (data.tts?.active_provider) {
          setTtsProvider(data.tts.active_provider);
        }
        if (data.ollama?.models?.length > 0) {
          const match = data.ollama.models.find(m => m.includes('qwen2.5:3b')) || data.ollama.models[0];
          setActiveModel(match);
        }
      }
    } catch (e) {
      // offline fallback
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Setup WebSocket connection and listeners
  useEffect(() => {
    jarvisWs.connect();

    const unsubConn = jarvisWs.on('connection', ({ connected }) => {
      setIsConnected(connected);
      if (!connected) {
        setStatusNotice('Connecting to JARVIS Gateway...');
      } else {
        setStatusNotice('');
      }
    });

    const unsubState = jarvisWs.on('session.state', ({ state, detail }) => {
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
    });

    const unsubFinal = jarvisWs.on('transcript.final', ({ text }) => {
      setFinalTranscript(text);
      setPartialTranscript('');
      setStatusNotice('');
      setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    });

    const unsubEmpty = jarvisWs.on('transcript.empty', ({ message }) => {
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
      setActiveToolCall({ name, args, call_id });
    });

    const unsubToolResult = jarvisWs.on('tool.result', ({ name, result, status }) => {
      setActiveToolCall(prev => prev ? { ...prev, result, status } : null);
    });

    const unsubAudioChunk = jarvisWs.on('audio.chunk', ({ audio, mime, seq }) => {
      setVoiceState('speaking');
      audioPlayer.enqueue(audio, mime, seq ?? 0);
    });

    const unsubAudioComplete = jarvisWs.on('audio.complete', () => {
      // Server finished synthesizing audio chunks
      if (!audioPlayer.isPlaying && !serverGeneratingRef.current) {
        setVoiceState('idle');
      }
    });

    const unsubInterrupt = jarvisWs.on('audio.interrupt', () => {
      audioPlayer.stop();
      serverGeneratingRef.current = false;
      setVoiceState('idle');
      streamingBufferRef.current = '';
      setStreamingText('');
      setActiveToolCall(null);
    });

    const unsubError = jarvisWs.on('error', ({ message }) => {
      console.error('[JARVIS ERROR]', message);
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
      console.log('[App] Audio playback finished.');
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
  }, []);

  // Voice Recording Actions
  const handleStartRecording = useCallback(async () => {
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
      jarvisWs.sendAudioStart();
    } catch (e) {
      console.error('Microphone access denied or error:', e);
      setIsRecording(false);
      setStatusNotice(e.message || 'Microphone error.');
      alert(e.message || 'Microphone access is required for voice commands.');
    }
  }, [voiceState]);

  const handleStopRecording = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setMicLevel(0);

    const result = await audioRecorder.stop();
    if (!result || result.durationSec < 0.25 || result.maxAmplitude === 0) {
      console.warn('[App] Recording too short or silent.');
      setStatusNotice('Recording was too short. Hold and speak clearly.');
      jarvisWs.sendInterrupt();
      setTimeout(() => setStatusNotice(''), 3000);
      return;
    }

    // Send binary WAV frame and trigger audio.end
    console.log(`[App] Submitting ${result.durationSec.toFixed(2)}s WAV (${result.wavBuffer.byteLength} bytes) to backend...`);
    jarvisWs.sendBinary(result.wavBuffer);
    jarvisWs.sendAudioEnd();
  }, [isRecording]);

  const handleToggleContinuous = useCallback(() => {
    const nextMode = !isContinuous;
    setIsContinuous(nextMode);
    jarvisWs.send('session.config', { continuous: nextMode });
  }, [isContinuous]);

  const handleInterrupt = useCallback(() => {
    audioPlayer.stop();
    serverGeneratingRef.current = false;
    jarvisWs.sendInterrupt();
    streamingBufferRef.current = '';
    setStreamingText('');
    setActiveToolCall(null);
    setVoiceState('idle');
  }, []);

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
    jarvisWs.sendUserMessage(text);
  }, [voiceState, handleInterrupt]);

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
      }
    } catch (e) {
      console.error('Failed clearing history:', e);
    }
  }, []);

  return (
    <div className="jarvis-command-center">
      {/* Top HUD Telemetry Bar */}
      <SystemTelemetry
        isConnected={isConnected}
        ollamaModel={activeModel}
        ttsEngine={ttsProvider}
        onOpenMemory={() => setIsMemoryOpen(true)}
        onClearHistory={handleClearHistory}
      />

      {/* Main Dashboard Grid */}
      <main className="dashboard-main">
        {/* Left Column: Visual Neural Core & Voice Controls */}
        <section className="neural-core-column">
          <NeuralSphere
            state={voiceState}
            audioLevel={audioLevel}
          />

          {statusNotice && (
            <div className="status-notice-banner">
              <span>{statusNotice}</span>
            </div>
          )}

          <VoiceCardControls
            isRecording={isRecording}
            isContinuous={isContinuous}
            voiceState={voiceState}
            micLevel={micLevel}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onToggleContinuous={handleToggleContinuous}
            onInterrupt={handleInterrupt}
          />
        </section>

        {/* Right Column: Interaction, Live Transcript & Conversation Panel */}
        <section className="interaction-column">
          {/* Live Speech Recognition Banner */}
          <LiveTranscriptCard
            partialTranscript={partialTranscript}
            finalTranscript={finalTranscript}
            isListening={isRecording || voiceState === 'listening'}
          />

          {/* Conversation History & Stream */}
          <ConversationPanel
            messages={messages}
            activeToolCall={activeToolCall}
            streamingText={streamingText}
            isThinking={voiceState === 'thinking'}
          />

          {/* Text Input Fallback Bar */}
          <TextInputBar
            onSendMessage={handleSendMessage}
            disabled={!isConnected}
          />
        </section>
      </main>

      {/* Slide-out Persistent Memory Vault */}
      <MemoryDrawer
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
      />
    </div>
  );
}

export default App;
