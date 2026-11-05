import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame';
import Icon from '../components/Icon';
import { useAuth } from '../auth/AuthContext';

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const { signInWithGoogleCode } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get('code');
    if (code) window.history.replaceState(null, document.title, window.location.pathname);
    if (!code) {
      setError('This Google sign-in attempt is incomplete. Please try again.');
      return;
    }
    signInWithGoogleCode(code).then(() => navigate('/dashboard', { replace: true })).catch((err) => {
      setError(err.message || 'Google sign-in could not be completed. Please try again.');
    });
  }, [navigate, params, signInWithGoogleCode]);

  return <AuthFrame eyebrow="SECURE SIGN IN" title="Connecting" highlight="your account." description="We are securely completing your Google sign-in and opening your CourseHubs workspace.">
    <div className="auth-panel-header"><span className="section-kicker">GOOGLE SIGN IN</span><h2>{error ? 'Sign-in interrupted.' : 'Almost there.'}</h2><p>{error || 'Please keep this page open while we finish signing you in.'}</p></div>
    {error ? <><div className="account-notice account-notice-error" role="alert"><Icon name="alert" size={18}/><span>{error}</span></div><Link to="/login" className="btn btn-primary">Return to sign in <Icon name="arrowRight" size={17}/></Link></> : <div className="account-loading" role="status"><span className="loading-spinner"/> Connecting your account…</div>}
  </AuthFrame>;
}
