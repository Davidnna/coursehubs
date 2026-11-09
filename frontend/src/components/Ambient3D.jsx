import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const cubeFaces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
const MOTION_STORAGE_KEY = 'coursehubs-motion-preference';

function getInitialMotionPreference() {
    try {
        const saved = window.localStorage.getItem(MOTION_STORAGE_KEY);
        if (saved === 'full') return { enabled: true, manual: true };
        if (saved === 'reduced') return { enabled: false, manual: true };
    } catch {
        // Storage can be unavailable in private browsing; use the system preference.
    }
    return { enabled: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, manual: false };
}

/** Shared 3D scene with an explicit explanation of the system reduced-motion setting. */
export default function Ambient3D() {
    const [preference, setPreference] = useState(getInitialMotionPreference);
    const [systemPrefersReduced, setSystemPrefersReduced] = useState(
        () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    );
    const { enabled: motionEnabled, manual } = preference;

    useEffect(() => {
        document.documentElement.dataset.motion = motionEnabled ? 'full' : 'reduced';
    }, [motionEnabled]);

    useEffect(() => {
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!media) return undefined;
        const update = (event) => {
            setSystemPrefersReduced(event.matches);
            setPreference((current) => current.manual ? current : { enabled: !event.matches, manual: false });
        };
        media.addEventListener?.('change', update);
        return () => media.removeEventListener?.('change', update);
    }, []);

    function toggleMotion() {
        setPreference((current) => {
            const enabled = !current.enabled;
            try { window.localStorage.setItem(MOTION_STORAGE_KEY, enabled ? 'full' : 'reduced'); } catch { /* Session preference still applies. */ }
            return { enabled, manual: true };
        });
    }

    const explanation = motionEnabled
        ? (systemPrefersReduced && manual
            ? 'Animations are enabled by your choice, even though your device prefers reduced motion.'
            : 'Decorative 3D animations are playing. Select to pause them.')
        : (!manual && systemPrefersReduced
            ? 'Your device has reduced motion enabled. CourseHubs pauses decorative animations to respect this accessibility preference. Select to enable them if you prefer.'
            : 'Decorative animations are paused because Motion off is selected. Select to turn them on.');

    return (
        <>
            <div className="ambient3d" aria-hidden="true">
                <div className="ambient3d__orbit ambient3d__orbit--one" />
                <div className="ambient3d__orbit ambient3d__orbit--two" />
                <div className="ambient3d__float ambient3d__float--cube"><div className="ambient3d__cube">{cubeFaces.map((face) => <span key={face} className={`ambient3d__cube-face ambient3d__cube-face--${face}`} />)}</div></div>
                <div className="ambient3d__float ambient3d__float--orb"><div className="ambient3d__orb"><span /></div></div>
                <div className="ambient3d__float ambient3d__float--ring"><div className="ambient3d__ring"><span /><i /></div></div>
                <div className="ambient3d__float ambient3d__float--diamond"><div className="ambient3d__diamond"><span /></div></div>
                <div className="ambient3d__float ambient3d__float--stack"><div className="ambient3d__stack"><i /><i /><i /></div></div>
                <div className="ambient3d__float ambient3d__float--mini-orb"><div className="ambient3d__mini-orb" /></div>
                <div className="ambient3d__float ambient3d__float--prism"><div className="ambient3d__prism"><span /><i /></div></div>
                <div className="ambient3d__float ambient3d__float--satellite"><div className="ambient3d__satellite-orbit"><span /></div></div>
            </div>

            {typeof document !== 'undefined' && createPortal(
                <div className="motion-control-wrap">
                    <button
                        type="button"
                        className="motion-control"
                        onClick={toggleMotion}
                        aria-pressed={motionEnabled}
                        aria-describedby="motion-control-help"
                        aria-label={motionEnabled ? 'Pause decorative 3D animations' : 'Enable decorative 3D animations'}
                    >
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {motionEnabled ? <><path d="M8 5v14M16 5v14" /></> : <><path d="m8 5 11 7-11 7z" /></>}
                        </svg>
                        <span>{motionEnabled ? 'Motion on' : 'Motion off'}</span>
                        <span className="motion-control-info" aria-hidden="true">i</span>
                    </button>
                    <span className="motion-control-tooltip" id="motion-control-help" role="tooltip">{explanation}</span>
                </div>,
                document.body,
            )}
        </>
    );
}
