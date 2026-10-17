import React from 'react';
import { Mic, MicOff, Square, Radio, Volume2 } from 'lucide-react';

/**
 * SpatialVoiceBar: Floating holographic voice anchor.
 * Provides intuitive, responsive controls for microphone capture,
 * audio amplitude visualization, interrupt, and continuous mode.
 */
export const SpatialVoiceBar = ({
  isRecording,
  isContinuous,
  voiceState,
  voiceDetail,
  micLevel = 0,
  audioLevel = 0,
  onStartRecording,
  onStopRecording,
  onToggleContinuous,
  onInterrupt
}) => {
  // Generate 8 animated audio meter bars
  const activeLevel = isRecording ? micLevel : voiceState === 'speaking' ? audioLevel : 0;
  const barCount = 10;

  return (
    <div className="core-voice-anchor" role="region" aria-label="Voice Interaction Controls">
      <div className="core-voice-controls-row">
        {/* Continuous Conversation Mode Toggle */}
        <button
          className={`core-sub-action-btn ${isContinuous ? 'active' : ''}`}
          onClick={onToggleContinuous}
          title={isContinuous ? 'Disable Continuous Mode' : 'Enable Continuous Mode'}
        >
          <Radio size={12} />
          <span>{isContinuous ? 'Continuous' : 'Push-to-Talk'}</span>
        </button>

        {/* Primary Microphone Trigger Button */}
        <button
          className={`core-mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={isRecording ? onStopRecording : onStartRecording}
          title={isRecording ? 'Click to Stop Recording & Submit' : 'Click to Speak (or press Space)'}
          aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        {/* Interrupt / Stop Active Speech Button */}
        <button
          className="core-sub-action-btn danger"
          onClick={onInterrupt}
          disabled={voiceState === 'idle' && !isRecording}
          title="Interrupt Active AI Speech / Reset State (Esc)"
        >
          <Square size={12} />
          <span>Interrupt</span>
        </button>
      </div>

      {/* Real-time Dynamic Audio Amplitude Meter */}
      <div className="core-audio-meter" aria-hidden="true">
        {Array.from({ length: barCount }).map((_, i) => {
          // Staggered height calculation based on level and center index
          const distFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
          const barHeight = Math.max(3, Math.min(22, (activeLevel * 24 * (1 - distFromCenter * 0.5))));
          return (
            <div
              key={i}
              className="meter-bar"
              style={{
                height: `${barHeight}px`,
                backgroundColor: isRecording
                  ? 'var(--color-amber-alert)'
                  : voiceState === 'speaking'
                  ? 'var(--color-emerald-ok)'
                  : 'var(--color-cyan-glow)',
                opacity: activeLevel > 0.05 ? 1 : 0.4
              }}
            />
          );
        })}
      </div>

      {/* Voice State Readout */}
      <div className="core-status-readout">
        <span
          className="pulse-dot"
          style={{
            color: isRecording
              ? 'var(--color-amber-alert)'
              : voiceState === 'speaking'
              ? 'var(--color-emerald-ok)'
              : voiceState === 'thinking'
              ? 'var(--color-amber-alert)'
              : voiceState === 'error'
              ? 'var(--color-crimson-warn)'
              : 'var(--color-cyan-glow)'
          }}
        />
        <span>
          {isRecording
            ? 'RECORDING INPUT (CLICK OR PRESS SPACE TO SUBMIT)'
            : voiceDetail
            ? voiceDetail.toUpperCase()
            : voiceState === 'speaking'
            ? 'SYNTHESIZING & PLAYING BRITISH VOICE RESPONSE'
            : voiceState === 'thinking'
            ? 'OLLAMA INFERENCE PROCESSING...'
            : 'SYSTEM STANDING BY • READY FOR VOICE COMMAND'}
        </span>
      </div>
    </div>
  );
};
