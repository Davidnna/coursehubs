import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../auth/AuthContext';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/contact', label: 'Contact' },
  { to: '/faq', label: 'FAQs' },
];

function PublicBrand() {
  return (
    <Link to="/" className="public-brand" aria-label="CourseHubs home">
      <span className="public-brand-mark"><span/><i/><i/><i/></span>
      <span className="public-brand-name">course<span>hubs</span><small>LEARN · SHARE · GROW</small></span>
    </Link>
  );
}

export default function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <div className="marketing-shell">
      <header className="marketing-header">
        <div className="marketing-header-inner">
          <PublicBrand/>
          <button className="marketing-menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <Icon name={menuOpen ? 'x' : 'menu'} size={22}/>
          </button>
          <nav className={`marketing-nav ${menuOpen ? 'marketing-nav-open' : ''}`} aria-label="Main navigation">
            {links.map((link) => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `marketing-nav-link ${isActive ? 'marketing-nav-link-active' : ''}`}>{link.label}</NavLink>)}
            <div className="marketing-mobile-actions">
              {!loading && user ? <Link className="btn btn-primary" to="/dashboard">Open workspace <Icon name="arrowUpRight" size={17}/></Link> : !loading ? <><Link className="marketing-mobile-signin" to="/login">Sign in</Link><Link className="btn btn-primary" to="/register">Get started <Icon name="arrowUpRight" size={17}/></Link></> : null}
            </div>
          </nav>
          <div className="marketing-header-actions">
            {!loading && user ? <Link className="btn btn-primary" to="/dashboard">Open workspace <Icon name="arrowUpRight" size={17}/></Link> : !loading ? <><Link className="marketing-signin" to="/login">Sign in</Link><Link className="btn btn-primary" to="/register">Get started <Icon name="arrowUpRight" size={17}/></Link></> : <span className="topbar-auth-loading" aria-label="Checking sign-in status"/>}
          </div>
        </div>
      </header>

      <div className="marketing-content"><Outlet/></div>

      <footer className="marketing-footer">
        <div className="marketing-footer-main">
          <div className="marketing-footer-brand">
            <PublicBrand/>
            <p>A more organised way for the EBSU Computer Science community to find, manage and share academic resources.</p>
          </div>
          <div className="marketing-footer-column"><strong>Explore</strong><Link to="/about">About CourseHubs</Link><Link to="/features">Platform features</Link><Link to="/how-it-works">How it works</Link><Link to="/contact">Contact</Link><Link to="/faq">FAQs</Link></div>
          <div className="marketing-footer-column"><strong>Your account</strong><Link to="/register">Create an account</Link><Link to="/login">Sign in</Link><Link to="/forgot-password">Forgot password?</Link><Link to="/resend-verification">Resend verification</Link></div>
        </div>
        <div className="marketing-footer-bottom"><span>© {new Date().getFullYear()} CourseHubs. Built for the EBSU Computer Science community.</span><span>Find it. Learn it. Make it yours.</span></div>
      </footer>
    </div>
  );
}
