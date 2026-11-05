/**
 * Lightweight, decorative CSS 3D scene shared by the public website and
 * authenticated workspace. All objects are aria-hidden and pointer-inert.
 */
const cubeFaces = ['front', 'back', 'right', 'left', 'top', 'bottom'];

export default function Ambient3D() {
  return (
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
    </div>
  );
}
