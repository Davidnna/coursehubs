import { useEffect, useState } from 'react';

const cubeFaces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
const MOTION_STORAGE_KEY = 'coursehubs-motion-preference';

function getInitialMotionPreference() {
  try {
    const saved = window.localStorage.getItem(MOTION_STORAGE_KEY);
    if (saved === 'full') return true;
    if (saved === 'reduced') return false;
  } catch {
    // Storage can be unavailable in private browsing; use the system preference.
  }

  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Shared, continuously animated CSS 3D scene for public and private pages.
 * The motion control lets visitors explicitly pause or enable decorative motion.
 */
export default function Ambient3D() {
  const [motionEnabled, setMotionEnabled] = useState(getInitialMotionPreference);

  useEffect(() => {
    document.documentElement.dataset.motion = motionEnabled ? 'full' : 'reduced';
    try {
      window.localStorage.setItem(MOTION_STORAGE_KEY, motionEnabled ? 'full' : 'reduced');
    } catch {
      // The preference still applies for this page view when storage is unavailable.
    }
  }, [motionEnabled]);

  return (
    <>
      <div className="ambient3d" aria-hidden="true">
        <div className="ambient3d__orbit ambient3d__orbit--one" />
        <div className="ambient3d__orbit ambient3d__orbit--two" />

        <div className="ambient3d__float ambient3d__float--cube">
          <div className="ambient3d__cube">
            {cubeFaces.map((face) => <span key={face} className={`ambient3d__cube-face ambient3d__cube-face--${face}`} />)}
          </div>
        </div>

        <div className="ambient3d__float ambient3d__float--orb">
          <div className="ambient3d__orb"><span /></div>
        </div>

        <div className="ambient3d__float ambient3d__float--ring">
          <div className="ambient3d__ring"><span /><i /></div>
        </div>

        <div className="ambient3d__float ambient3d__float--diamond">
          <div className="ambient3d__diamond"><span /></div>
        </div>

        <div className="ambient3d__float ambient3d__float--stack">
          <div className="ambient3d__stack"><i /><i /><i /></div>
        </div>

        <div className="ambient3d__float ambient3d__float--mini-orb">
          <div className="ambient3d__mini-orb" />
        </div>

        <div className="ambient3d__float ambient3d__float--prism">
          <div className="ambient3d__prism"><span /><i /></div>
        </div>

        <div className="ambient3d__float ambient3d__float--satellite">
          <div className="ambient3d__satellite-orbit"><span /></div>
        </div>
      </div>

      <button
        type="button"
        className="motion-control"
        onClick={() => setMotionEnabled((enabled) => !enabled)}
        aria-pressed={motionEnabled}
        aria-label={motionEnabled ? 'Pause decorative 3D animations' : 'Enable decorative 3D animations'}
        title={motionEnabled ? 'Pause 3D animations' : 'Enable 3D animations'}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {motionEnabled
            ? <><path d="M8 5v14M16 5v14" /></>
            : <><path d="m8 5 11 7-11 7z" /></>}
        </svg>
        <span>{motionEnabled ? 'Motion on' : 'Motion off'}</span>
      </button>
    </>
  );
}
