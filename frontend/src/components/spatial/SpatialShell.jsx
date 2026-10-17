import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SceneCanvas } from './SceneCanvas';
import { WorkspaceNav } from './WorkspaceNav';
import { SpatialObject } from './SpatialObject';
import { SpatialVoiceBar } from './SpatialVoiceBar';
import { SystemInspector } from './SystemInspector';
import { MemoryExplorer } from './MemoryExplorer';
import { ProjectExplorer } from './ProjectExplorer';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ConversationPanel } from '../ConversationPanel';
import { TextInputBar } from '../TextInputBar';
import { LiveTranscriptCard } from '../LiveTranscriptCard';

import {
  Sparkles,
  Zap,
  Cpu,
  Wifi,
  WifiOff,
  RotateCcw,
  Trash2,
  Activity,
  MessageSquare,
  Database,
  FolderTree,
  Terminal,
  Radio
} from 'lucide-react';

/**
 * SpatialShell: Master spatial computing environment for Project JARVIS.
 * Coordinates the 3D WebGL scene, holographic HUD, workspace routing,
 * keyboard shortcuts, and desktop mouse interactions.
 */
export const SpatialShell = ({
  // Core Voice State & Callbacks
  isConnected,
  voiceState,
  voiceDetail,
  audioLevel,
  micLevel,
  isRecording,
  isContinuous,
  partialTranscript,
  finalTranscript,
  messages,
  streamingText,
  activeToolCall,
  statusNotice,
  eventHistory = [],
  healthData,
  onStartRecording,
  onStopRecording,
  onToggleContinuous,
  onInterrupt,
  onSendMessage,
  onClearHistory
}) => {
  const [activeWorkspace, setActiveWorkspace] = useState('core');
  const [focusedPanel, setFocusedPanel] = useState(null);
  const resetCameraRef = useRef(null);

  // Keyboard shortcut listener (1-6 for workspaces, Space for mic, Esc for reset)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input or textarea, or if key repeat is firing
      if (e.repeat) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === '1') {
        setActiveWorkspace('core');
      } else if (e.key === '2') {
        setActiveWorkspace('conversation');
      } else if (e.key === '3') {
        setActiveWorkspace('memory');
      } else if (e.key === '4') {
        setActiveWorkspace('systems');
      } else if (e.key === '5') {
        setActiveWorkspace('projects');
      } else if (e.key === '6') {
        setActiveWorkspace('diagnostics');
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (isRecording) {
          onStopRecording();
        } else {
          onStartRecording();
        }
      } else if (e.key === 'Escape') {
        if (activeWorkspace !== 'core') {
          setActiveWorkspace('core');
        } else {
          onInterrupt();
          if (resetCameraRef.current) {
            resetCameraRef.current();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWorkspace, isRecording, onStartRecording, onStopRecording, onInterrupt]);

  return (
    <div className="spatial-viewport">
      {/* 1. LAYER: Full-screen 3D WebGL Spatial Canvas */}
      <SceneCanvas
        voiceState={voiceState}
        audioLevel={audioLevel}
        micLevel={micLevel}
        isRecording={isRecording}
        onResetCameraRef={resetCameraRef}
      />

      {/* 2. LAYER: HTML Spatial HUD Layer (Crisp, Accessible, Interactive) */}
      <div className="spatial-hud-layer">
        {/* Top Telemetry Bar */}
        <header className="spatial-top-bar spatial-hud-interactive">
          <div className="spatial-brand">
            <div className="spatial-logo-hex">
              <Sparkles size={16} />
            </div>
            <span className="spatial-brand-name">PROJECT JARVIS</span>
            <span className="spatial-brand-tag">SPATIAL AI CORE</span>
          </div>

          {/* Center Telemetry Badges */}
          <div className="spatial-telemetry-cluster">
            <div className="spatial-hud-badge" title="Dedicated NVIDIA GPU">
              <Zap size={13} style={{ color: 'var(--color-cyan-glow)' }} />
              <span>RTX 4050 6GB</span>
            </div>

            <div className="spatial-hud-badge" title="Active Local LLM">
              <Cpu size={13} style={{ color: '#ffaa00' }} />
              <span>{healthData?.ollama?.models?.find(m => m.includes('qwen2.5:3b')) || 'qwen2.5:3b'}</span>
            </div>

            <div className="spatial-hud-badge" title="Active TTS Voice Synthesis Engine">
              <span className="pulse-dot" style={{ color: 'var(--color-cyan-glow)' }} />
              <span>{healthData?.tts?.active_provider === 'edge-tts' ? 'Edge TTS (British)' : 'pyttsx3 Offline'}</span>
            </div>

            <div className={`spatial-hud-badge ${isConnected ? 'status-online' : 'status-offline'}`}>
              {isConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span>{isConnected ? 'ONLINE (8000)' : 'CONNECTING'}</span>
            </div>
          </div>

          {/* Top Actions */}
          <div className="spatial-top-actions">
            <button
              className="spatial-btn-icon"
              onClick={() => resetCameraRef.current && resetCameraRef.current()}
              title="Reset 3D Spatial Camera View (Esc)"
            >
              <RotateCcw size={13} />
              <span>Reset Cam</span>
            </button>

            <button
              className="spatial-btn-icon danger"
              onClick={onClearHistory}
              title="Clear Conversation History"
            >
              <Trash2 size={13} />
              <span>Clear Chat</span>
            </button>
          </div>
        </header>

        {/* Center Spatial Stage Overlay for Workspaces */}
        <main className="spatial-canvas-overlay">
          {/* Status Alert Toast */}
          {statusNotice && (
            <div className="spatial-notice-toast">
              <span>{statusNotice}</span>
            </div>
          )}

          {/* WORKSPACE 1: CORE (Central Holographic Core + Floating Voice Anchor) */}
          {activeWorkspace === 'core' && (
            <div className="workspace-core-overlay">
              {/* Live Speech Recognition Pill */}
              {(partialTranscript || isRecording || voiceState === 'listening') && (
                <div style={{ maxWidth: 640, width: '90%', marginBottom: 16 }}>
                  <LiveTranscriptCard
                    partialTranscript={partialTranscript}
                    finalTranscript={finalTranscript}
                    isListening={isRecording || voiceState === 'listening'}
                  />
                </div>
              )}

              {/* Floating Voice Interaction Bar */}
              <SpatialVoiceBar
                isRecording={isRecording}
                isContinuous={isContinuous}
                voiceState={voiceState}
                voiceDetail={voiceDetail}
                micLevel={micLevel}
                audioLevel={audioLevel}
                onStartRecording={onStartRecording}
                onStopRecording={onStopRecording}
                onToggleContinuous={onToggleContinuous}
                onInterrupt={onInterrupt}
              />
            </div>
          )}

          {/* WORKSPACE 2: CONVERSATION SURFACE */}
          {activeWorkspace === 'conversation' && (
            <SpatialObject
              id="conversation-panel"
              title="Spatial Conversation Surface"
              icon={MessageSquare}
              defaultWidth="800px"
              defaultHeight="680px"
              onClose={() => setActiveWorkspace('core')}
              isFocused={focusedPanel === 'conversation'}
              onFocus={() => setFocusedPanel('conversation')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
                <LiveTranscriptCard
                  partialTranscript={partialTranscript}
                  finalTranscript={finalTranscript}
                  isListening={isRecording || voiceState === 'listening'}
                />
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <ConversationPanel
                    messages={messages}
                    activeToolCall={activeToolCall}
                    streamingText={streamingText}
                    isThinking={voiceState === 'thinking'}
                  />
                </div>
                <TextInputBar
                  onSendMessage={onSendMessage}
                  disabled={!isConnected}
                />
              </div>
            </SpatialObject>
          )}

          {/* WORKSPACE 3: MEMORY VAULT */}
          {activeWorkspace === 'memory' && (
            <SpatialObject
              id="memory-panel"
              title="Persistent Memory Vault (SQLite)"
              icon={Database}
              defaultWidth="840px"
              defaultHeight="640px"
              onClose={() => setActiveWorkspace('core')}
              isFocused={focusedPanel === 'memory'}
              onFocus={() => setFocusedPanel('memory')}
            >
              <MemoryExplorer />
            </SpatialObject>
          )}

          {/* WORKSPACE 4: SYSTEM TELEMETRY */}
          {activeWorkspace === 'systems' && (
            <SpatialObject
              id="systems-panel"
              title="System Telemetry & Hardware Inspector"
              icon={Activity}
              defaultWidth="820px"
              defaultHeight="620px"
              onClose={() => setActiveWorkspace('core')}
              isFocused={focusedPanel === 'systems'}
              onFocus={() => setFocusedPanel('systems')}
            >
              <SystemInspector healthData={healthData} />
            </SpatialObject>
          )}

          {/* WORKSPACE 5: PROJECT WORKSPACE EXPLORER */}
          {activeWorkspace === 'projects' && (
            <SpatialObject
              id="projects-panel"
              title="Spatial Project & Workspace Explorer"
              icon={FolderTree}
              defaultWidth="800px"
              defaultHeight="620px"
              onClose={() => setActiveWorkspace('core')}
              isFocused={focusedPanel === 'projects'}
              onFocus={() => setFocusedPanel('projects')}
            >
              <ProjectExplorer />
            </SpatialObject>
          )}

          {/* WORKSPACE 6: REAL-TIME DIAGNOSTICS & EVENT TRACE */}
          {activeWorkspace === 'diagnostics' && (
            <SpatialObject
              id="diagnostics-panel"
              title="Diagnostics & Real-Time Event Trace"
              icon={Terminal}
              defaultWidth="840px"
              defaultHeight="640px"
              onClose={() => setActiveWorkspace('core')}
              isFocused={focusedPanel === 'diagnostics'}
              onFocus={() => setFocusedPanel('diagnostics')}
            >
              <DiagnosticsPanel
                eventHistory={eventHistory}
                isConnected={isConnected}
                voiceState={voiceState}
                voiceDetail={voiceDetail}
                healthData={healthData}
              />
            </SpatialObject>
          )}
        </main>

        {/* Bottom Workspace Navigation Bar */}
        <footer className="spatial-bottom-bar spatial-hud-interactive">
          <WorkspaceNav
            activeWorkspace={activeWorkspace}
            onSelectWorkspace={setActiveWorkspace}
          />

          {/* Bottom Right Voice Status Indicator */}
          <div className="spatial-voice-summary">
            <div className={`voice-status-pill ${voiceState}`}>
              <span className="pulse-dot" />
              <span>{voiceState.toUpperCase()}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
