import React, { useEffect, useRef } from 'react';
import { Bot, User, Wrench, CheckCircle2, Clock, Terminal, Copy, Volume2 } from 'lucide-react';

/**
 * Cinematic Conversation Log Panel.
 * Displays user utterances, streaming British assistant responses, and tool execution cards.
 */
export const ConversationPanel = ({
  messages = [],
  activeToolCall = null,
  streamingText = '',
  isThinking = false,
  onReplayAudio,
}) => {
  const scrollRef = useRef(null);

  // Auto-scroll on new messages or streamed tokens
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, activeToolCall, isThinking]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="conversation-panel" ref={scrollRef}>
      {messages.length === 0 && !streamingText && !activeToolCall && (
        <div className="empty-state">
          <div className="empty-shield">
            <Bot size={44} className="empty-bot-icon" />
          </div>
          <h3>PROJECT JARVIS ONLINE</h3>
          <p>
            Refined British intelligence standing by. Activate the microphone or enter a query below.
          </p>
        </div>
      )}

      {messages.map((msg, index) => {
        const isUser = msg.role === 'user';
        return (
          <div
            key={index}
            className={`message-row ${isUser ? 'user-row' : 'assistant-row'}`}
          >
            <div className="message-avatar">
              {isUser ? <User size={18} /> : <Bot size={18} />}
            </div>

            <div className="message-bubble">
              <div className="message-meta">
                <span className="sender-name">
                  {isUser ? 'USER' : 'JARVIS'}
                </span>
                {msg.timestamp && (
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {!isUser && (
                  <button
                    className="msg-action-btn"
                    onClick={() => handleCopy(msg.content)}
                    title="Copy response"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </div>

              <div className="message-text">
                {msg.content}
              </div>

              {/* Render associated tool execution if attached */}
              {msg.tool_calls && msg.tool_calls.map((tc, tcIdx) => (
                <div key={tcIdx} className="tool-chip">
                  <div className="tool-chip-header">
                    <Wrench size={13} className="tool-icon" />
                    <span className="tool-name">{tc.function?.name || tc.name}</span>
                    <span className="tool-badge-done">
                      <CheckCircle2 size={12} /> Executed
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Active Tool Execution Card */}
      {activeToolCall && (
        <div className="tool-execution-card">
          <div className="tool-card-header">
            <Terminal size={15} className="tool-exec-icon" />
            <span className="tool-exec-title">TOOL INVOCATION: {activeToolCall.name}</span>
            <span className="tool-exec-status">RUNNING</span>
          </div>
          {activeToolCall.args && Object.keys(activeToolCall.args).length > 0 && (
            <div className="tool-card-args">
              <code>{JSON.stringify(activeToolCall.args, null, 2)}</code>
            </div>
          )}
        </div>
      )}

      {/* Streaming Assistant Response */}
      {streamingText && (
        <div className="message-row assistant-row streaming-row">
          <div className="message-avatar">
            <Bot size={18} />
          </div>
          <div className="message-bubble">
            <div className="message-meta">
              <span className="sender-name">JARVIS</span>
              <span className="streaming-badge">STREAMING</span>
            </div>
            <div className="message-text">
              {streamingText}
              <span className="cursor-blink">|</span>
            </div>
          </div>
        </div>
      )}

      {/* Thinking Indicator */}
      {isThinking && !streamingText && (
        <div className="thinking-row">
          <div className="thinking-dots">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
          <span className="thinking-label">Synthesizing response...</span>
        </div>
      )}
    </div>
  );
};
