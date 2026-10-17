import React from 'react';
import { MessageSquare, AudioWaveform } from 'lucide-react';

/**
 * Live Transcript Banner / Card.
 * Displays immediate user speech recognition results and interim transcripts.
 */
export const LiveTranscriptCard = ({ partialTranscript, finalTranscript, isListening }) => {
  if (!partialTranscript && !finalTranscript && !isListening) {
    return null;
  }

  return (
    <div className={`live-transcript-card ${isListening ? 'listening-glow' : ''}`}>
      <div className="transcript-header">
        <div className="transcript-tag">
          <MessageSquare size={14} />
          <span>USER UTTERANCE</span>
        </div>
        {isListening && (
          <div className="speech-live-indicator">
            <span className="live-pulse-dot" />
            <span>TRANSCRIBING</span>
          </div>
        )}
      </div>

      <div className="transcript-content">
        {partialTranscript ? (
          <span className="partial-text">{partialTranscript}</span>
        ) : finalTranscript ? (
          <span className="final-text">{finalTranscript}</span>
        ) : (
          <span className="listening-placeholder">Listening for speech...</span>
        )}
      </div>
    </div>
  );
};
