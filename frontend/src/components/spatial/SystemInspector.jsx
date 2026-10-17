import React, { useState, useEffect } from 'react';
import { Cpu, Zap, HardDrive, Server, ShieldCheck, RefreshCw } from 'lucide-react';

/**
 * SystemInspector: Real-time hardware telemetry HUD.
 * Directly reads live metrics from /api/system/metrics and /api/health.
 * Displays CPU, RAM, RTX 4050 GPU VRAM, Disk, and local AI engines.
 */
export const SystemInspector = ({ healthData }) => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchMetrics = async () => {
    try {
      const resp = await fetch('/api/system/metrics');
      if (resp.ok) {
        const data = await resp.json();
        setMetrics(data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.warn('[SystemInspector] Failed loading metrics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 4000);
    return () => clearInterval(interval);
  }, []);

  const cpuUsage = metrics?.cpu?.usage_percent ?? 0;
  const ramUsage = metrics?.ram?.percent_used ?? 0;
  const diskUsage = metrics?.disk_c?.percent_used ?? 0;
  const gpuUtil = metrics?.gpu?.gpu_util_percent ?? 0;
  const vramUsedMb = metrics?.gpu?.used_vram_mb ?? 0;
  const vramTotalMb = metrics?.gpu?.total_vram_mb || 6141;
  const vramPct = Math.round((vramUsedMb / vramTotalMb) * 100);

  return (
    <div className="system-telemetry-grid">
      {/* 1. CPU Telemetry Tile */}
      <div className="telemetry-tile">
        <div className="tile-header">
          <div className="tile-title">
            <Cpu size={15} />
            <span>CPU Computing Core</span>
          </div>
          <span className="tile-metric-value">{cpuUsage.toFixed(1)}%</span>
        </div>
        <div className="telemetry-progress-bar">
          <div className="telemetry-progress-fill" style={{ width: `${Math.min(100, cpuUsage)}%` }} />
        </div>
        <div className="tile-details-list">
          <div className="tile-detail-row">
            <span>Logical Cores:</span>
            <span>{metrics?.cpu?.logical_cores ?? '16 Cores'}</span>
          </div>
          <div className="tile-detail-row">
            <span>Processor Architecture:</span>
            <span>Intel Core i7-13650HX (x64)</span>
          </div>
        </div>
      </div>

      {/* 2. RAM Telemetry Tile */}
      <div className="telemetry-tile">
        <div className="tile-header">
          <div className="tile-title">
            <Server size={15} />
            <span>System Memory (DDR5)</span>
          </div>
          <span className="tile-metric-value">{ramUsage.toFixed(1)}%</span>
        </div>
        <div className="telemetry-progress-bar">
          <div className="telemetry-progress-fill" style={{ width: `${Math.min(100, ramUsage)}%` }} />
        </div>
        <div className="tile-details-list">
          <div className="tile-detail-row">
            <span>Total Installed:</span>
            <span>{metrics?.ram?.total_gb ?? '16.00'} GB</span>
          </div>
          <div className="tile-detail-row">
            <span>Available Free:</span>
            <span>{metrics?.ram?.available_gb ?? '8.40'} GB</span>
          </div>
        </div>
      </div>

      {/* 3. GPU (RTX 4050) Tile */}
      <div className="telemetry-tile">
        <div className="tile-header">
          <div className="tile-title">
            <Zap size={15} />
            <span>NVIDIA RTX 4050 GPU</span>
          </div>
          <span className="tile-metric-value">{gpuUtil}%</span>
        </div>
        <div className="telemetry-progress-bar">
          <div className="telemetry-progress-fill" style={{ width: `${Math.max(5, vramPct)}%` }} />
        </div>
        <div className="tile-details-list">
          <div className="tile-detail-row">
            <span>VRAM Allocation:</span>
            <span>{vramUsedMb.toFixed(0)} / {vramTotalMb.toFixed(0)} MB ({vramPct}%)</span>
          </div>
          <div className="tile-detail-row">
            <span>Architecture & Bus:</span>
            <span>Ada Lovelace (Compute 8.9)</span>
          </div>
        </div>
      </div>

      {/* 4. NVMe Storage & AI Engine Status Tile */}
      <div className="telemetry-tile">
        <div className="tile-header">
          <div className="tile-title">
            <HardDrive size={15} />
            <span>Storage & Neural Services</span>
          </div>
          <span className="tile-metric-value">{diskUsage.toFixed(0)}%</span>
        </div>
        <div className="telemetry-progress-bar">
          <div className="telemetry-progress-fill" style={{ width: `${Math.min(100, diskUsage)}%` }} />
        </div>
        <div className="tile-details-list">
          <div className="tile-detail-row">
            <span>Disk Space (C:):</span>
            <span>{metrics?.disk_c?.free_gb ?? 0} GB Free of {metrics?.disk_c?.total_gb ?? 0} GB</span>
          </div>
          <div className="tile-detail-row">
            <span>STT Engine:</span>
            <span>faster-whisper ({healthData?.stt?.device?.toUpperCase() || 'CPU INT8'})</span>
          </div>
          <div className="tile-detail-row">
            <span>TTS Engine:</span>
            <span>{healthData?.tts?.active_provider === 'edge-tts' ? 'Edge TTS (British)' : 'pyttsx3 Offline'}</span>
          </div>
          <div className="tile-detail-row">
            <span>Telemetry Sync:</span>
            <span>{lastUpdated || 'Connecting...'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
