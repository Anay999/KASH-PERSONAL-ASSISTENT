import React, { useState } from 'react';
import { Terminal, Activity, Wifi, Radio, AlertCircle, CheckCircle } from 'lucide-react';

/**
 * DiagnosticsPanel: Real-time event trace & audio pipeline diagnostics.
 * Captures real WebSocket events, audio buffer metrics, and STT latencies.
 */
export const DiagnosticsPanel = ({
  eventHistory = [],
  isConnected,
  voiceState,
  voiceDetail,
  healthData
}) => {
  const [filterError, setFilterError] = useState(false);

  const displayedEvents = filterError
    ? eventHistory.filter(e => e.type.includes('error') || e.isError)
    : eventHistory;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Quick Metrics Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10
      }}>
        <div style={{ background: 'rgba(6, 16, 28, 0.7)', border: '1px solid rgba(0, 229, 255, 0.15)', padding: 10, borderRadius: 4 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>GATEWAY STATUS</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: isConnected ? '#00f5a0' : '#ff3b30' }}>
            {isConnected ? 'ESTABLISHED (8000)' : 'DISCONNECTED'}
          </div>
        </div>

        <div style={{ background: 'rgba(6, 16, 28, 0.7)', border: '1px solid rgba(0, 229, 255, 0.15)', padding: 10, borderRadius: 4 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>VOICE SESSION STATE</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--color-cyan-glow)' }}>
            {voiceState.toUpperCase()}
          </div>
        </div>

        <div style={{ background: 'rgba(6, 16, 28, 0.7)', border: '1px solid rgba(0, 229, 255, 0.15)', padding: 10, borderRadius: 4 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>AUDIO RESAMPLING</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
            16,000 Hz MONO PCM
          </div>
        </div>

        <div style={{ background: 'rgba(6, 16, 28, 0.7)', border: '1px solid rgba(0, 229, 255, 0.15)', padding: 10, borderRadius: 4 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>STT RUNTIME</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#ffaa00' }}>
            {healthData?.stt?.device?.toUpperCase() || 'CPU INT8'}
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
          REAL-TIME EVENT TRACE STREAM ({displayedEvents.length} events logged)
        </span>
        <button
          className="spatial-btn-icon"
          onClick={() => setFilterError(!filterError)}
          style={{ borderColor: filterError ? 'var(--color-crimson-warn)' : undefined }}
        >
          <AlertCircle size={12} />
          <span>{filterError ? 'Show All Events' : 'Filter Errors Only'}</span>
        </button>
      </div>

      {/* Real-time Event Trace Timeline */}
      <div className="event-trace-log" style={{ maxHeight: 380, overflowY: 'auto' }}>
        {displayedEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-text-dim)' }}>
            No trace events recorded yet. Speak or send a message to stream telemetry.
          </div>
        ) : (
          displayedEvents.map((evt, idx) => (
            <div key={idx} className={`event-trace-item ${evt.type.includes('error') ? 'error' : ''}`}>
              <span className="event-time">{evt.timestamp || '00:00:00'}</span>
              <span className="event-type-badge">{evt.type}</span>
              <span className="event-content">{typeof evt.payload === 'string' ? evt.payload : JSON.stringify(evt.payload)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
