import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

/**
 * 3D WebGL Spatial Computing Canvas.
 * Renders the central holographic JARVIS core, counter-rotating technical gimbal rings,
 * particle starfield, coordinate grid planes, and responds to real voice pipeline states & audio levels.
 */
export const SceneCanvas = ({
  voiceState = 'idle',
  audioLevel = 0,
  micLevel = 0,
  isRecording = false,
  onResetCameraRef
}) => {
  const containerRef = useRef(null);

  // Dynamic state refs for 60fps render loop without triggering React re-renders
  const stateRef = useRef(voiceState);
  const audioLevelRef = useRef(audioLevel);
  const micLevelRef = useRef(micLevel);

  useEffect(() => {
    stateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    micLevelRef.current = micLevel;
  }, [micLevel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03070d, 0.035);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    const defaultCamPos = { x: 0, y: 0.2, z: 8.5 };
    camera.position.set(defaultCamPos.x, defaultCamPos.y, defaultCamPos.z);

    // 3. Renderer setup
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      console.warn('[SceneCanvas] WebGL initialization failed, falling back to basic renderer:', e);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0x00e5ff, 0.6);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x00e5ff, 2.5, 30);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    // 5. Starfield & Data Dust Particles
    const particleCount = 700;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 35;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 25;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 35;
      particleSpeeds[i] = 0.005 + Math.random() * 0.015;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x00e5ff,
      size: 0.065,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const starfield = new THREE.Points(particleGeo, particleMat);
    scene.add(starfield);

    // 6. Horizontal Coordinate Grid Floor & Ceiling
    const gridHelperFloor = new THREE.GridHelper(30, 30, 0x00e5ff, 0x081e36);
    gridHelperFloor.position.y = -3.8;
    gridHelperFloor.material.opacity = 0.22;
    gridHelperFloor.material.transparent = true;
    scene.add(gridHelperFloor);

    // ==========================================================================
    // 7. CENTRAL JARVIS 3D HOLOGRAPHIC CORE
    // ==========================================================================
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // (A) Inner Neural Lattice (Icosahedron wireframe)
    const innerIcoGeo = new THREE.IcosahedronGeometry(1.2, 2);
    const innerIcoMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    const innerIcoMesh = new THREE.Mesh(innerIcoGeo, innerIcoMat);
    coreGroup.add(innerIcoMesh);

    // (B) Central Glowing Energy Core
    const energyCoreGeo = new THREE.SphereGeometry(0.65, 24, 24);
    const energyCoreMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending
    });
    const energyCoreMesh = new THREE.Mesh(energyCoreGeo, energyCoreMat);
    coreGroup.add(energyCoreMesh);

    // (C) Gimbal Ring 1 (Inner Torus)
    const ring1Geo = new THREE.TorusGeometry(1.85, 0.018, 16, 100);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    coreGroup.add(ring1);

    // (D) Gimbal Ring 2 (Middle Counter-rotating Torus)
    const ring2Geo = new THREE.TorusGeometry(2.35, 0.022, 16, 120);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x0077ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI / 3;
    coreGroup.add(ring2);

    // (E) Outer Scanning Equatorial Ring
    const outerScanGeo = new THREE.RingGeometry(2.8, 2.85, 80);
    const outerScanMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });
    const outerScanRing = new THREE.Mesh(outerScanGeo, outerScanMat);
    outerScanRing.rotation.x = Math.PI / 2;
    coreGroup.add(outerScanRing);

    // (F) Orbiting Satellite Telemetry Nodes
    const satelliteGroup = new THREE.Group();
    coreGroup.add(satelliteGroup);
    const satCount = 6;
    const satGeo = new THREE.OctahedronGeometry(0.09);
    const satMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      blending: THREE.AdditiveBlending
    });

    const satellites = [];
    for (let s = 0; s < satCount; s++) {
      const satMesh = new THREE.Mesh(satGeo, satMat);
      const angle = (s / satCount) * Math.PI * 2;
      const dist = 3.3;
      satMesh.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      satelliteGroup.add(satMesh);
      satellites.push({ mesh: satMesh, baseAngle: angle, dist });
    }

    // ==========================================================================
    // 8. DESKTOP INTERACTION: PARALLAX, PAN & ZOOM (NO HAND / NO WEBCAM)
    // ==========================================================================
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    let zoomDist = defaultCamPos.z;
    let targetZoom = defaultCamPos.z;

    let isDragging = false;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let orbitRotY = 0;
    let orbitRotX = 0;

    const handlePointerMove = (e) => {
      // Normalized screen coordinates [-1, 1]
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - prevPointerX;
        const deltaY = e.clientY - prevPointerY;
        prevPointerX = e.clientX;
        prevPointerY = e.clientY;

        orbitRotY += deltaX * 0.005;
        orbitRotX = Math.max(-0.6, Math.min(0.6, orbitRotX + deltaY * 0.005));
      }
    };

    const handlePointerDown = (e) => {
      if (e.target === renderer.domElement) {
        isDragging = true;
        prevPointerX = e.clientX;
        prevPointerY = e.clientY;
      }
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    const handleWheel = (e) => {
      // Zoom in / out with scroll wheel clamped
      targetZoom = Math.max(5.0, Math.min(14.0, targetZoom + e.deltaY * 0.006));
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('wheel', handleWheel, { passive: true });

    if (onResetCameraRef) {
      onResetCameraRef.current = () => {
        targetZoom = defaultCamPos.z;
        orbitRotX = 0;
        orbitRotY = 0;
      };
    }

    // ==========================================================================
    // 9. ANIMATION & 60FPS FRAME LOOP
    // ==========================================================================
    let animId;
    let clock = new THREE.Clock();

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      const currentState = stateRef.current;
      const currentAudio = audioLevelRef.current;
      const currentMic = micLevelRef.current;

      // Determine state speeds & pulse multipliers
      let rotSpeed = 0.4;
      let targetColor = new THREE.Color(0x00e5ff); // Default electric cyan
      let energyOpacity = 0.35;

      if (currentState === 'listening') {
        rotSpeed = 1.2;
        targetColor = new THREE.Color(0x00ffff);
        energyOpacity = 0.55 + currentMic * 0.4;
      } else if (currentState === 'thinking') {
        rotSpeed = 2.2;
        targetColor = new THREE.Color(0xffaa00); // Amber thinking
        energyOpacity = 0.65;
      } else if (currentState === 'speaking') {
        rotSpeed = 0.8 + currentAudio * 1.5;
        targetColor = new THREE.Color(0x00f5a0); // Vibrant teal-cyan speaking
        energyOpacity = 0.4 + currentAudio * 0.6;
      } else if (currentState === 'error') {
        rotSpeed = 0.2;
        targetColor = new THREE.Color(0xff3b30); // Crimson warning
        energyOpacity = 0.7;
      }

      // Smooth color transitions
      innerIcoMat.color.lerp(targetColor, 0.08);
      energyCoreMat.color.lerp(targetColor, 0.08);
      ring1Mat.color.lerp(targetColor, 0.08);
      outerScanMat.color.lerp(targetColor, 0.08);
      satMat.color.lerp(targetColor, 0.08);
      pointLight.color.lerp(targetColor, 0.08);

      // Core rotations
      innerIcoMesh.rotation.x += 0.4 * rotSpeed * delta;
      innerIcoMesh.rotation.y += 0.6 * rotSpeed * delta;

      ring1.rotation.x += 0.8 * rotSpeed * delta;
      ring1.rotation.y -= 0.5 * rotSpeed * delta;

      ring2.rotation.x -= 0.6 * rotSpeed * delta;
      ring2.rotation.z += 0.9 * rotSpeed * delta;

      outerScanRing.rotation.z -= 0.3 * rotSpeed * delta;
      satelliteGroup.rotation.y += 0.3 * rotSpeed * delta;

      // Audio-reactive Core scale pulsing
      let pulseScale = 1.0;
      if (currentState === 'speaking') {
        pulseScale = 1.0 + currentAudio * 0.45;
      } else if (currentState === 'listening') {
        pulseScale = 1.0 + currentMic * 0.35 + Math.sin(time * 6) * 0.05;
      } else {
        pulseScale = 1.0 + Math.sin(time * 2) * 0.035;
      }

      innerIcoMesh.scale.set(pulseScale, pulseScale, pulseScale);
      energyCoreMesh.scale.set(pulseScale * 0.9, pulseScale * 0.9, pulseScale * 0.9);
      energyCoreMat.opacity = energyOpacity;

      // Update Starfield drift
      const positions = starfield.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 2] += particleSpeeds[i];
        if (positions[i * 3 + 2] > 15) {
          positions[i * 3 + 2] = -20;
        }
      }
      starfield.geometry.attributes.position.needsUpdate = true;

      // Smooth Camera Parallax & Orbit Damping
      targetX = mouseX * 0.8;
      targetY = mouseY * 0.5 + 0.2;
      zoomDist += (targetZoom - zoomDist) * 0.08;

      camera.position.x += (targetX - camera.position.x) * 0.05;
      camera.position.y += (targetY - camera.position.y) * 0.05;
      camera.position.z = zoomDist;

      // Orbit tilt on core
      coreGroup.rotation.y = orbitRotY;
      coreGroup.rotation.x = orbitRotX;

      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };

    renderLoop();

    // 10. Resize handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // 11. Complete GPU resource cleanup on unmount
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);

      // Recursive disposal
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });

      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="spatial-canvas-layer" title="Drag to orbit viewpoint, Scroll to zoom depth" />;
};
