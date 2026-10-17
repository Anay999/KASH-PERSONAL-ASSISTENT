import React from 'react';
import { Cpu, Zap, Wifi, WifiOff, Database, Trash2, ShieldCheck, Sparkles } from 'lucide-react';

/**
 * Top HUD Telemetry Bar.
 * Displays hardware status, local LLM, active TTS voice, and system controls.
 */
export const SystemTelemetry = ({
  isConnected,
  ollamaModel = 'qwen2.5:3b',
  ttsEngine = 'edge-tts',
  onOpenMemory,
  onClearHistory,
}) => {
  return (
    <header className="telemetry-bar">
      <div className="telemetry-left">
        <div className="brand-logo">
          <Sparkles size={18} className="brand-icon" />
          <span className="brand-title">PROJECT JARVIS</span>
          <span className="brand-version">VISION-CORE v1.0</span>
        </div>
      </div>

      <div className="telemetry-center">
        {/* Hardware Status */}
        <div className="telemetry-badge" title="Dedicated Laptop GPU">
          <Zap size={14} className="badge-icon-gpu" />
          <span>RTX 4050 6GB</span>
        </div>

        {/* Local LLM Model */}
        <div className="telemetry-badge" title="Local Ollama Inference Engine">
          <Cpu size={14} className="badge-icon-cpu" />
          <span>{ollamaModel}</span>
        </div>

        {/* TTS Provider */}
        <div className="telemetry-badge" title="Voice Synthesis Provider">
          <span className="tts-indicator-dot" />
          <span>{ttsEngine === 'edge-tts' ? 'Edge TTS (British)' : 'pyttsx3 (Offline)'}</span>
        </div>

        {/* Connection Status */}
        <div className={`telemetry-badge ${isConnected ? 'conn-online' : 'conn-offline'}`}>
          {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{isConnected ? 'ONLINE' : 'CONNECTING'}</span>
        </div>
      </div>

      <div className="telemetry-right">
        {/* Persistent Memory Drawer Button */}
        <button
          className="hud-action-btn"
          onClick={onOpenMemory}
          title="Open Persistent Memories"
        >
          <Database size={15} />
          <span>Memory</span>
        </button>

        {/* Clear History Button */}
        <button
          className="hud-action-btn btn-danger"
          onClick={onClearHistory}
          title="Clear Conversation History"
        >
          <Trash2 size={15} />
          <span>Reset</span>
        </button>
      </div>
    </header>
  );
};
