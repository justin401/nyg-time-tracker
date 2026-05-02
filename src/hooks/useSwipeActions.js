import { useRef, useState, useEffect, useCallback } from 'react';

// ─── Configuration ─────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD   = 60;   // px of left-swipe needed to "open" the actions
const MAX_SWIPE         = 140;  // px cap — matches your action button area width
const VELOCITY_TRIGGER  = 0.4;  // px/ms — fast flick also opens even under threshold

/**
 * useSwipeActions
 *
 * Returns:
 *   ref       - attach to the list item's outermost element
 *   isOpen    - whether the action tray is currently revealed
 *   close     - programmatically close the tray (e.g. after tapping a button)
 *   offset    - current translate offset in px (positive = slid left)
 *
 * Usage:
 *   const { ref, isOpen, close, offset } = useSwipeActions();
 *
 *   <li ref={ref} style={{ position: 'relative', overflow: 'hidden' }}>
 *     <div style={{ transform: `translateX(-${offset}px)`, transition: isOpen ? 'transform 0.25s ease' : 'none' }}>
 *       ...row content...
 *     </div>
 *     <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: MAX_SWIPE, display: 'flex' }}>
 *       <button onClick={() => { doDelete(); close(); }}>Delete</button>
 *     </div>
 *   </li>
 */
export function useSwipeActions() {
  const ref          = useRef(null);
  const startXRef    = useRef(0);
  const startYRef    = useRef(0);
  const startTimeRef = useRef(0);
  const trackingRef  = useRef(false);
  const axisLockedRef = useRef(null); // 'h' | 'v' | null

  const [isOpen,  setIsOpen]  = useState(false);
  const [offset,  setOffset]  = useState(0);

  const close = useCallback(() => {
    setIsOpen(false);
    setOffset(0);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    setOffset(MAX_SWIPE);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onTouchStart(e) {
      startXRef.current    = e.touches[0].clientX;
      startYRef.current    = e.touches[0].clientY;
      startTimeRef.current = Date.now();
      trackingRef.current  = true;
      axisLockedRef.current = null;
    }

    function onTouchMove(e) {
      if (!trackingRef.current) return;

      const dx = startXRef.current - e.touches[0].clientX; // positive = left swipe
      const dy = Math.abs(e.touches[0].clientY - startYRef.current);

      // Lock axis on first significant movement (prevents accidental swipes while scrolling)
      if (!axisLockedRef.current) {
        if (Math.abs(dx) > 6 || dy > 6) {
          axisLockedRef.current = Math.abs(dx) > dy ? 'h' : 'v';
        }
        return;
      }

      if (axisLockedRef.current === 'v') return; // vertical scroll — ignore

      // Horizontal swipe handling
      e.preventDefault(); // stop page scroll while swiping a row

      const base   = isOpen ? MAX_SWIPE : 0;
      const raw    = base + dx;
      const clamped = Math.max(0, Math.min(raw, MAX_SWIPE));
      setOffset(clamped);
    }

    function onTouchEnd(e) {
      if (!trackingRef.current || axisLockedRef.current !== 'h') {
        trackingRef.current = false;
        return;
      }
      trackingRef.current = false;

      const elapsed = Date.now() - startTimeRef.current;
      const dx      = startXRef.current - e.changedTouches[0].clientX;
      const velocity = dx / elapsed; // px/ms

      // Decide whether to snap open or snap closed
      if (!isOpen) {
        if (dx >= SWIPE_THRESHOLD || velocity >= VELOCITY_TRIGGER) {
          open();
        } else {
          close();
        }
      } else {
        // Currently open: close if swiped back right significantly
        if (dx < -(SWIPE_THRESHOLD / 2) || velocity < -VELOCITY_TRIGGER) {
          close();
        } else {
          open();
        }
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
  }, [isOpen, close, open]);

  // Close tray if user taps somewhere else on the page
  useEffect(() => {
    if (!isOpen) return;
    function onDocTouch(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        close();
      }
    }
    document.addEventListener('touchstart', onDocTouch, { passive: true });
    return () => document.removeEventListener('touchstart', onDocTouch);
  }, [isOpen, close]);

  return { ref, isOpen, close, offset };
}

// ─── SwipeRow component ───────────────────────────────────────────────────────
// Convenience wrapper. actionWidth should match MAX_SWIPE above (140px default).
//
// Usage:
//   <SwipeRow actions={<button onClick={handleDelete}>Delete</button>}>
//     <MyRowContent />
//   </SwipeRow>

export function SwipeRow({ children, actions, actionWidth = MAX_SWIPE, style }) {
  const { ref, isOpen, close, offset } = useSwipeActions();

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Sliding row content */}
      <div
        style={{
          transform: `translateX(-${offset}px)`,
          transition: isOpen && offset === MAX_SWIPE
            ? 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)'
            : offset === 0
            ? 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
            : 'none',
          willChange: 'transform',
        }}
      >
        {children}
      </div>

      {/* Action tray (revealed behind the row) */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: actionWidth,
          display: 'flex',
          alignItems: 'stretch',
          opacity: Math.min(offset / SWIPE_THRESHOLD, 1),
          transition: offset === 0 ? 'opacity 0.2s' : 'none',
        }}
        onClick={close}
      >
        {actions}
      </div>
    </div>
  );
}
