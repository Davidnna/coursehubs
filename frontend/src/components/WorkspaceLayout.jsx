import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import Ambient3D from './Ambient3D';
import { getResourceAccess } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const workspaceNav = [
  { to: '/dashboard', label: 'Overview', icon: 'grid', end: true },
  { to: '/catalog', label: 'Course library', icon: 'book' },
  { to: '/resources', label: 'Resource library', icon: 'file' },
  { to: '/upload', label: 'Contribute resources', icon: 'upload', contributorOnly: true },
  { to: '/admin/academics', label: 'Academic management', icon: 'school', adminOnly: true },
  { to: '/admin/staff-management', label: 'Staff & contributors', icon: 'users', adminOnly: true },
  { to: '/admin/resources', label: 'Resource moderation', icon: 'shield', adminOnly: true },
  { to: '/admin/resource-reports', label: 'Resource reports', icon: 'flag', adminOnly: true },
  { to: '/admin/academic-corrections', label: 'Academic information requests', icon: 'document', adminOnly: true },
  { to: '/account', label: 'Account settings', icon: 'user' },
];

function WorkspaceBrand() {
  return <Link to="/dashboard" className="brand" aria-label="CourseHubs workspace"><span className="brand-mark"><span className="mark-dot"/><span className="mark-line mark-line-one"/><span className="mark-line mark-line-two"/><span className="mark-line mark-line-three"/></span><span className="brand-wordmark">course<span>hubs</span><small>YOUR ACADEMIC WORKSPACE</small></span></Link>;
}

function UserAvatar({ user, className = '' }) {
  return <span className={`topbar-avatar ${className}`}>{user?.profile_picture_data ? <img src={user.profile_picture_data} alt=""/> : (user?.first_name?.[0] || 'U').toUpperCase()}</span>;
}

export default function WorkspaceLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [resourceAccess, setResourceAccess] = useState(null);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const accountMenuRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    let active = true;
    setResourceAccess(null);
    getResourceAccess()
      .then((result) => { if (active) setResourceAccess(result); })
      .catch(() => {
        // Fail closed: do not advertise contribution tools when permissions
        // cannot be confirmed by the backend.
        if (active) setResourceAccess({ can_upload: false, can_upload_assessments: false });
      });
    return () => { active = false; };
  }, [user?.id]);

  const canContributeResources = Boolean(user?.is_admin || resourceAccess?.can_upload);

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

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const closeOutside = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        accountTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [accountMenuOpen]);

  async function handleSignOut() {
    try { await signOut(); } catch { /* Local credentials are cleared by signOut. */ } finally {
      setAccountMenuOpen(false);
      setMenuOpen(false);
      navigate('/', { replace: true });
    }
  }

  const fullName = `${user?.first_name || ''} ${user?.surname || ''}`.trim();

  return (
    <div className="app-shell workspace-shell">
      <Ambient3D/>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside ref={sidebarRef} id="workspace-sidebar" className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Workspace navigation">
        <div className="sidebar-top"><WorkspaceBrand/><button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}><Icon name="x"/></button></div>
        <div className="sidebar-section-label">YOUR WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Workspace pages">{workspaceNav.filter((item) => (!item.adminOnly || user?.is_admin) && (!item.studentOnly || user?.account_type === 'student') && (!item.contributorOnly || canContributeResources)).map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)} className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}><Icon name={item.icon} size={19}/><span>{item.label}</span></NavLink>)}</nav>
        <div className="sidebar-grow"/>
        <Link to="/account" className="sidebar-profile-card" onClick={() => setMenuOpen(false)}>
          <UserAvatar user={user} className="sidebar-profile-avatar"/>
          <span className="sidebar-profile-copy"><strong>{fullName || 'Your account'}</strong><small>Manage your profile</small></span>
          <Icon name="chevronRight" size={17}/>
        </Link>
        <div className="sidebar-bottom"><span className="sidebar-dot"/> EBONYI STATE UNIVERSITY <span className="sidebar-bottom-small">/ CS</span></div>
      </aside>
      {menuOpen && <button type="button" className="mobile-overlay" aria-label="Close navigation" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}/>}
      <div className="main-column">
        <header className="topbar workspace-topbar">
          <div className="topbar-left"><button ref={menuButtonRef} className="icon-button mobile-menu" aria-label="Open workspace menu" aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><span className="topbar-context"><span className="context-dot"/> PRIVATE COURSEHUBS WORKSPACE</span></div>
          <div className="topbar-actions">
            <div className="workspace-account-menu" ref={accountMenuRef}>
              <button ref={accountTriggerRef} type="button" className="workspace-account-trigger" aria-haspopup="true" aria-expanded={accountMenuOpen} aria-controls="workspace-account-dropdown" onClick={() => setAccountMenuOpen((open) => !open)}>
                <UserAvatar user={user}/><span className="workspace-account-name">{user?.first_name || 'Account'}</span><Icon name="chevronDown" size={15}/>
              </button>
              {accountMenuOpen && <div id="workspace-account-dropdown" className="workspace-account-dropdown" aria-label="Account actions">
                <div className="workspace-account-dropdown-head"><strong>{fullName || 'CourseHubs member'}</strong><span>{user?.email}</span></div>
                <Link to="/account" onClick={() => setAccountMenuOpen(false)}><Icon name="user" size={17}/> Account settings</Link>
                <Link to="/" onClick={() => setAccountMenuOpen(false)}><Icon name="external" size={17}/> Visit CourseHubs website</Link>
                <button type="button" onClick={handleSignOut}><Icon name="arrowRight" size={17}/> Sign out</button>
              </div>}
            </div>
          </div>
        </header>
        <div className="page-content" id="main-content" tabIndex="-1" role="region" aria-label="Workspace page content"><Outlet context={{ canContributeResources, resourceAccess, resourceAccessLoading: resourceAccess === null && !user?.is_admin }}/></div>
        <footer className="site-footer"><span>© {new Date().getFullYear()} CourseHubs · Private academic workspace</span><span><Link to="/account">Account settings</Link> · <Link to="/contact">Help & contact</Link></span></footer>
      </div>
    </div>
  );
}
