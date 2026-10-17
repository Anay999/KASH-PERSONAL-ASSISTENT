import React, { useState } from 'react';
import { Send, CornerDownLeft } from 'lucide-react';

/**
 * Text Input Bar Fallback.
 * Allows instant typed interaction if audio devices are disabled or if user prefers text.
 */
export const TextInputBar = ({ onSendMessage, disabled = false }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim());
    setText('');
  };

  return (
    <form className="text-input-bar" onSubmit={handleSubmit}>
      <input
        type="text"
        className="query-input"
        placeholder="Enter direct inquiry for JARVIS... (or use microphone above)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <div className="input-actions">
        <span className="key-hint">
          <CornerDownLeft size={12} /> Enter
        </span>
        <button
          type="submit"
          className="send-query-btn"
          disabled={!text.trim() || disabled}
          title="Send query"
        >
          <Send size={16} />
        </button>
      </div>
    </form>
  );
};
