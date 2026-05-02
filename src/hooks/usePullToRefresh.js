import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Configuration ─────────────────────────────────────────────────────────────
const TRIGGER_THRESHOLD = 72;   // px of pull needed to fire onRefresh
const MAX_PULL_DISTANCE  = 120; // px cap so it doesn't stretch forever
const RESISTANCE        = 0.4;  // multiplier that makes the pull feel elastic

/**
 * usePullToRefresh
 *
 * Attach the returned containerRef to the outermost scrollable element.
 * Call onRefresh (async or sync) — the hook awaits it before resetting.
 *
 * Returns:
 *   containerRef  - attach to the scrollable container
 *   isRefreshing  - true while onRefresh() is in flight
 *   pullDistance  - current pull offset in px (for driving a spinner opacity/transform)
 *
 * Usage:
 *   const { containerRef, isRefreshing, pullDistance } = usePullToRefresh(fetchData);
 *   <div ref={containerRef} style={{ overflowY: 'auto' }}>
 *     <PullIndicator distance={pullDistance} loading={isRefreshing} />
 *     ...list...
 *   </div>
 */
export function usePullToRefresh(onRefresh) {
  const containerRef  = useRef(null);
  const startYRef     = useRef(0);
  const isDraggingRef = useRef(false);

  const [pullDistance,  setPullDistance]  = useState(0);
  const [isRefreshing,  setIsRefreshing]  = useState(false);

  const triggerRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPullDistance(0);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e) {
      // Only start if we're at the very top of the scroll container
      if (el.scrollTop > 0) return;
      startYRef.current    = e.touches[0].clientY;
      isDraggingRef.current = true;
    }

    function onTouchMove(e) {
      if (!isDraggingRef.current || isRefreshing) return;

      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        // Scrolling up — reset
        isDraggingRef.current = false;
        setPullDistance(0);
        return;
      }

      // Prevent the browser's native overscroll/bounce
      if (el.scrollTop === 0 && delta > 0) {
        e.preventDefault();
      }

      const resistedDelta = Math.min(delta * RESISTANCE, MAX_PULL_DISTANCE);
      setPullDistance(resistedDelta);
    }

    function onTouchEnd() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      if (pullDistance >= TRIGGER_THRESHOLD) {
        triggerRefresh();
      } else {
        setPullDistance(0);
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [isRefreshing, pullDistance, triggerRefresh]);

  return { containerRef, isRefreshing, pullDistance };
}

// ─── PullIndicator component ──────────────────────────────────────────────────
// Optional — drop this anywhere above your list. Driven by pullDistance / isRefreshing.
//
// import { PullIndicator } from './usePullToRefresh';
//
export function PullIndicator({ distance, loading }) {
  const TRIGGER_THRESHOLD = 72;
  const opacity   = Math.min(distance / TRIGGER_THRESHOLD, 1);
  const rotate    = loading ? 'rotate(0deg)' : `rotate(${(distance / TRIGGER_THRESHOLD) * 360}deg)`;
  const translateY = `translateY(${loading ? 16 : Math.max(distance - 8, 0)}px)`;

  const style = {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: `translateX(-50%) ${translateY}`,
    opacity,
    transition: loading ? 'opacity 0.2s' : 'none',
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#1e293b',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    pointerEvents: 'none',
  };

  return (
    <div style={style}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{
          transform: rotate,
          transition: loading ? 'transform 0.6s linear' : 'transform 0.15s ease',
          animation: loading ? 'ptr-spin 0.8s linear infinite' : 'none',
        }}
      >
        <style>{`
          @keyframes ptr-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
  );
}
