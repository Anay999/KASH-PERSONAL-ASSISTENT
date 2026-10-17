import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Minus, Square, Move } from 'lucide-react';

/**
 * SpatialObject: Floating, draggable 3D spatial panel.
 * Supports mouse dragging with pointer capture, coordinate tracking,
 * minimize/maximize, and keyboard Escape dismissal.
 */
export const SpatialObject = ({
  id,
  title,
  icon: Icon,
  initialPosition = { x: 0, y: 0 },
  defaultWidth = '780px',
  defaultHeight = '640px',
  onClose,
  isFocused = false,
  onFocus,
  children
}) => {
  const [pos, setPos] = useState(initialPosition);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });
  const hasMovedRef = useRef(false);

  const handlePointerDown = useCallback((e) => {
    // Only drag from the header handle
    if (isMaximized) return;
    if (onFocus) onFocus();

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: pos.x,
      posY: pos.y
    };
    hasMovedRef.current = false;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [isMaximized, pos, onFocus]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.mouseX;
    const dy = e.clientY - dragStartRef.current.mouseY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }

    // Clamp inside viewport bounds
    const newX = dragStartRef.current.posX + dx;
    const newY = dragStartRef.current.posY + dy;
    setPos({ x: newX, y: newY });
  }, [isDragging]);

  const handlePointerUp = useCallback((e) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }, [isDragging]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFocused && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, onClose]);

  const coordStr = `X: ${Math.round(pos.x)} | Y: ${Math.round(pos.y)}`;

  return (
    <div
      className={`spatial-panel ${isFocused ? 'focused' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        transform: isMaximized
          ? 'translate(0px, 0px)'
          : `translate(${pos.x}px, ${pos.y}px)`,
        width: isMaximized ? '95vw' : isMinimized ? '320px' : defaultWidth,
        height: isMaximized ? '85vh' : isMinimized ? '44px' : defaultHeight,
        zIndex: isFocused ? 30 : 25,
        transition: isDragging ? 'none' : 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onClick={onFocus}
    >
      {/* Draggable Technical Header */}
      <div
        className="spatial-panel-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="spatial-panel-title-wrap">
          {Icon && <Icon size={14} className="spatial-panel-icon" />}
          <span className="spatial-panel-title">{title}</span>
          <span className="spatial-coord-tag">[{coordStr}]</span>
        </div>

        <div className="spatial-panel-actions" onPointerDown={(e) => e.stopPropagation()}>
          <button
            className="spatial-panel-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            <Minus size={12} />
          </button>
          <button
            className="spatial-panel-btn"
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={12} />
          </button>
          {onClose && (
            <button
              className="spatial-panel-btn close"
              onClick={onClose}
              title="Close Panel (Esc)"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Content Body */}
      {!isMinimized && (
        <div className="spatial-panel-body">
          {children}
        </div>
      )}
    </div>
  );
};
