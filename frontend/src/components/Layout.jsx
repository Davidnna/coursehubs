import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon';

const nav = [
  { to: '/', label: 'Overview', icon: 'grid', end: true },
  { to: '/catalog', label: 'Explore courses', icon: 'book' },
  { to: '/dashboard', label: 'My workspace', icon: 'layers' },
  { to: '/upload', label: 'Contribute', icon: 'upload' },
];

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="CourseHub home">
      <span className="brand-mark"><span className="mark-dot"/><span className="mark-line mark-line-one"/><span className="mark-line mark-line-two"/><span className="mark-line mark-line-three"/></span>
      <span className="brand-wordmark">course<span>hub</span><small>THE CS RESOURCE INDEX</small></span>
    </Link>
  );
}

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isAuth = ['/register', '/login'].includes(location.pathname);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Primary navigation">
        <div className="sidebar-top"><Brand/><button className="icon-button sidebar-close" aria-label="Close menu" onClick={closeMenu}><Icon name="x"/></button></div>
        <div className="sidebar-section-label">YOUR DESK</div>
        <nav className="sidebar-nav">
          {nav.map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={closeMenu} className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}><Icon name={item.icon} size={19}/><span>{item.label}</span>{item.to === '/catalog' && <Icon name="chevronRight" size={15} className="side-link-tail"/>}</NavLink>)}
        </nav>
        <div className="sidebar-grow"/>
        <div className="sidebar-note">
          <div className="sidebar-note-icon"><Icon name="spark" size={20}/></div>
          <strong>Made for the way you learn.</strong>
          <p>One place for your Computer Science resources.</p>
          <Link to="/catalog" onClick={closeMenu}>Explore the index <Icon name="arrowRight" size={15}/></Link>
        </div>
        <div className="sidebar-bottom"><span className="sidebar-dot"/> EBONYI STATE UNIVERSITY <span className="sidebar-bottom-small">/ CS</span></div>
      </aside>
      {menuOpen && <button className="mobile-overlay" aria-label="Close navigation" onClick={closeMenu}/>}
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><span className="topbar-context"><span className="context-dot"/> Department of Computer Science <span className="topbar-context-divider">/</span> EBSU</span></div>
          <div className="topbar-actions">
            <Link to="/catalog" className="topbar-search"><Icon name="search" size={17}/><span>Search resources</span><kbd>/</kbd></Link>
            <Link to="/login" className="topbar-login">Sign in</Link>
            <Link to="/register" className="btn btn-primary btn-small">Join CourseHub <Icon name="arrowUpRight" size={15}/></Link>
          </div>
        </header>
        <div className={`page-content ${isAuth ? 'page-content-auth' : ''}`}><Outlet/></div>
        <footer className="site-footer"><span>© 2026 CourseHub · Built for EBSU Computer Science</span><span>Find it. Learn it. Make it yours.</span></footer>
      </div>
    </div>
  );
}
