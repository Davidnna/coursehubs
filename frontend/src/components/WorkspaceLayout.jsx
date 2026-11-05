import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import Ambient3D from './Ambient3D';
import { useAuth } from '../auth/AuthContext';

const workspaceNav = [
  { to: '/dashboard', label: 'Overview', icon: 'grid', end: true },
  { to: '/catalog', label: 'Course library', icon: 'book' },
  { to: '/upload', label: 'Contribute resources', icon: 'upload' },
];

function WorkspaceBrand() {
  return <Link to="/dashboard" className="brand" aria-label="CourseHubs workspace"><span className="brand-mark"><span className="mark-dot"/><span className="mark-line mark-line-one"/><span className="mark-line mark-line-two"/><span className="mark-line mark-line-three"/></span><span className="brand-wordmark">course<span>hubs</span><small>YOUR ACADEMIC WORKSPACE</small></span></Link>;
}

export default function WorkspaceLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = sidebarRef.current?.querySelectorAll('a[href], button:not([disabled])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const closeOnDesktop = () => { if (window.innerWidth > 880) setMenuOpen(false); };
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeOnDesktop);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) sidebarRef.current?.querySelector('a[href], button:not([disabled])')?.focus();
  }, [menuOpen]);

  async function handleSignOut() {
    try { await signOut(); } catch { /* The local session is cleared by signOut. */ } finally {
      setMenuOpen(false);
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="app-shell workspace-shell">
      <Ambient3D/>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside ref={sidebarRef} id="workspace-sidebar" className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Workspace navigation">
        <div className="sidebar-top"><WorkspaceBrand/><button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}><Icon name="x"/></button></div>
        <div className="sidebar-section-label">YOUR WORKSPACE</div>
        <nav className="sidebar-nav">{workspaceNav.map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)} className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}><Icon name={item.icon} size={19}/><span>{item.label}</span></NavLink>)}</nav>
        <div className="sidebar-grow"/>
        <div className="sidebar-note"><div className="sidebar-note-icon"><Icon name="spark" size={20}/></div><strong>Your learning space, organised.</strong><p>Explore the CourseHubs website or return to your workspace whenever you need it.</p><Link to="/" onClick={() => setMenuOpen(false)}>Visit public website <Icon name="arrowRight" size={15}/></Link></div>
        <div className="sidebar-bottom"><span className="sidebar-dot"/> EBONYI STATE UNIVERSITY <span className="sidebar-bottom-small">/ CS</span></div>
      </aside>
      {menuOpen && <button type="button" className="mobile-overlay" aria-label="Close navigation" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}/>}
      <div className="main-column">
        <header className="topbar workspace-topbar">
          <div className="topbar-left"><button ref={menuButtonRef} className="icon-button mobile-menu" aria-label="Open workspace menu" aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><span className="topbar-context"><span className="context-dot"/> PRIVATE COURSEHUBS WORKSPACE</span></div>
          <div className="topbar-actions"><Link to="/" className="workspace-public-link"><Icon name="external" size={15}/> <span>Public website</span></Link><Link to="/dashboard" className="topbar-user"><span className="topbar-avatar">{user?.first_name?.[0] || 'U'}</span><span>{user?.first_name || 'Account'}</span></Link><button type="button" className="topbar-signout" onClick={handleSignOut}>Sign out</button></div>
        </header>
        <div className="page-content" id="main-content" tabIndex="-1" role="region" aria-label="Workspace page content"><Outlet/></div>
        <footer className="site-footer"><span>© {new Date().getFullYear()} CourseHubs · Private academic workspace</span><span><Link to="/">Public website</Link> · <Link to="/contact">Help & contact</Link></span></footer>
      </div>
    </div>
  );
}
