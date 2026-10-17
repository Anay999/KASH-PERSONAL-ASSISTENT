import React, { useEffect } from 'react';
import { Mic, MicOff, Square, Radio, Volume2 } from 'lucide-react';

/**
 * Voice Controls bar: Push-to-Talk, Continuous Listening toggle, Stop Speaking button.
 * Adapted from VoiceCardControls pattern.
 */
export const VoiceCardControls = ({
  isRecording,
  isContinuous,
  voiceState,
  micLevel = 0,
  onStartRecording,
  onStopRecording,
  onToggleContinuous,
  onInterrupt,
}) => {
  // Global spacebar listener for Push-to-talk
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in text input or textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.code === 'Space' && !e.repeat && !isRecording && !isContinuous) {
        e.preventDefault();
        onStartRecording();
      }
    };

    const handleKeyUp = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.code === 'Space' && isRecording && !isContinuous) {
        e.preventDefault();
        onStopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecording, isContinuous, onStartRecording, onStopRecording]);

  const isSpeaking = voiceState === 'speaking';

  return (
    <div className="voice-controls-bar">
      {/* Microphone Level Meter */}
      <div className="mic-meter-container" title="Microphone Input Level">
        <div
          className="mic-meter-bar"
          style={{ width: `${Math.round(micLevel * 100)}%` }}
        />
      </div>

      <div className="controls-button-group">
        {/* Continuous Listening Toggle */}
        <button
          className={`control-btn mode-btn ${isContinuous ? 'btn-active' : ''}`}
          onClick={onToggleContinuous}
          title={isContinuous ? "Continuous Listening Active" : "Enable Continuous Listening"}
        >
          <Radio size={16} />
          <span>{isContinuous ? "Continuous ON" : "Continuous"}</span>
        </button>

        {/* Primary Push-To-Talk Button */}
        <button
          className={`control-btn ptt-btn ${isRecording ? 'recording-pulse' : ''}`}
          onMouseDown={!isContinuous ? onStartRecording : undefined}
          onMouseUp={!isContinuous ? onStopRecording : undefined}
          onTouchStart={!isContinuous ? onStartRecording : undefined}
          onTouchEnd={!isContinuous ? onStopRecording : undefined}
          onClick={isContinuous ? (isRecording ? onStopRecording : onStartRecording) : undefined}
          title="Click or Hold (Spacebar) to Speak"
        >
          <div className="ptt-icon-wrap">
            {isRecording ? <Mic size={22} className="mic-icon recording" /> : <Mic size={22} className="mic-icon" />}
          </div>
          <div className="ptt-text-wrap">
            <span className="ptt-main-label">
              {isRecording ? "LISTENING..." : "PUSH TO TALK"}
            </span>
            <span className="ptt-sub-label">
              {isContinuous ? "Tap to toggle" : "Hold [Space] to speak"}
            </span>
          </div>
        </button>

        {/* Interrupt / Stop Speaking Button */}
        <button
          className={`control-btn stop-btn ${isSpeaking ? 'active-speaking' : 'disabled'}`}
          onClick={onInterrupt}
          disabled={!isSpeaking && voiceState !== 'thinking'}
          title="Stop Speech Playback"
        >
          <Square size={16} />
          <span>Stop Speaking</span>
        </button>
      </div>
    </div>
  );
};
