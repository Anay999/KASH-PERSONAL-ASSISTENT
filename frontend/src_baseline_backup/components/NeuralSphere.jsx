import React, { useRef, useEffect } from 'react';

/**
 * 3D Animated Neural Sphere.
 * Renders a rotating particle sphere with concentric resonance rings.
 * Reacts dynamically to genuine audio playback amplitude and system voice states.
 */
export const NeuralSphere = ({ state = 'idle', audioLevel = 0 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const size = 380;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;

    // Generate 3D Fibonacci sphere points
    const numPoints = 220;
    const baseRadius = 85;
    const points = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < numPoints; i++) {
      const theta = 2 * Math.PI * i / goldenRatio;
      const phi = Math.acos(1 - 2 * (i + 0.5) / numPoints);
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);
      points.push({ x, y, z, originalRadius: baseRadius });
    }

    let rotX = 0;
    let rotY = 0;
    let pulseAngle = 0;

    const render = () => {
      ctx.clearRect(0, 0, size, size);

      // Rotation velocity depends on state
      let rotSpeedX = 0.004;
      let rotSpeedY = 0.007;

      if (state === 'listening') {
        rotSpeedX = 0.008;
        rotSpeedY = 0.012;
      } else if (state === 'thinking') {
        rotSpeedX = 0.025;
        rotSpeedY = 0.035;
      } else if (state === 'speaking') {
        rotSpeedX = 0.010 + audioLevel * 0.02;
        rotSpeedY = 0.015 + audioLevel * 0.03;
      } else if (state === 'error') {
        rotSpeedX = 0.002;
        rotSpeedY = 0.003;
      }

      rotX += rotSpeedX;
      rotY += rotSpeedY;
      pulseAngle += 0.04;

      // Color scheme based on state
      let primaryColor = { r: 255, g: 183, b: 3 };    // Amber gold
      let coreGlow = '#fb8500';

      if (state === 'listening') {
        primaryColor = { r: 255, g: 209, b: 102 };   // Radiant yellow gold
        coreGlow = '#ffd166';
      } else if (state === 'thinking') {
        primaryColor = { r: 247, g: 127, b: 0 };     // Deep energetic amber
        coreGlow = '#f77f00';
      } else if (state === 'speaking') {
        primaryColor = { r: 255, g: 195, b: 0 };     // Brilliant gold
        coreGlow = '#ffb703';
      } else if (state === 'error') {
        primaryColor = { r: 239, g: 71, b: 111 };    // Warning crimson
        coreGlow = '#ef476f';
      }

      // Draw central radial glow
      const glowExpansion = state === 'speaking' ? audioLevel * 30 : Math.sin(pulseAngle) * 8;
      const coreRadius = Math.max(10, 45 + glowExpansion);
      const gradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, coreRadius);
      gradient.addColorStop(0, `${coreGlow}`);
      gradient.addColorStop(0.5, `rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, 0.25)`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw concentric orbital rings
      const numRings = state === 'thinking' ? 3 : 2;
      for (let r = 1; r <= numRings; r++) {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotY * (r % 2 === 0 ? 0.6 : -0.8));
        ctx.beginPath();
        const ringRad = baseRadius + r * 22 + (state === 'speaking' ? audioLevel * 20 : 0);
        ctx.ellipse(0, 0, ringRad, ringRad * 0.35, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, ${0.15 / r})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      // Compute dynamic particle positions with 3D rotation matrix
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      // Amplitude expansion from speech audio level
      const dynamicRadius = baseRadius + (state === 'speaking' ? audioLevel * 45 : Math.sin(pulseAngle * 1.5) * 4);

      // Sort points by z for 3D depth rendering
      const projectedPoints = points.map((p) => {
        // Rotate around Y
        const x1 = p.x * cosY + p.z * sinY;
        const y1 = p.y;
        const z1 = -p.x * sinY + p.z * cosY;

        // Rotate around X
        const x2 = x1;
        const y2 = y1 * cosX - z1 * sinX;
        const z2 = y1 * sinX + z1 * cosX;

        const scale = 260 / (260 + z2 * dynamicRadius);
        const projX = centerX + x2 * dynamicRadius * scale;
        const projY = centerY + y2 * dynamicRadius * scale;
        const alpha = Math.max(0.1, (z2 + 1) / 2);

        return { projX, projY, scale, alpha, z: z2 };
      });

      projectedPoints.sort((a, b) => a.z - b.z);

      // Render points
      projectedPoints.forEach((p) => {
        const pointSize = Math.max(1, p.scale * 2.2 + (state === 'speaking' ? audioLevel * 1.5 : 0));
        ctx.beginPath();
        ctx.arc(p.projX, p.projY, pointSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, ${p.alpha * 0.9})`;
        ctx.fill();

        // Subtle glow halo on foremost points
        if (p.z > 0.4) {
          ctx.beginPath();
          ctx.arc(p.projX, p.projY, pointSize * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, 0.15)`;
          ctx.fill();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [state, audioLevel]);

  return (
    <div className="neural-sphere-container">
      <canvas ref={canvasRef} className="neural-sphere-canvas" />
      <div className={`sphere-state-badge badge-${state}`}>
        <span className="state-dot" />
        <span className="state-label">
          {state.toUpperCase()}
        </span>
      </div>
    </div>
  );
};
