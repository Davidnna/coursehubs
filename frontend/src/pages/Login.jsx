import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import AuthFrame from '../components/AuthFrame';
import { useAuth } from '../auth/AuthContext';
import { startGoogleSignIn } from '../api/client';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const googleStatus = params.get('google');
  const accountDeleted = params.get('account') === 'deleted';
  const googleMessage = ({
    unavailable: 'Google sign-in is temporarily unavailable. You can sign in with your email and password instead.',
    cancelled: 'Google sign-in was cancelled. You can try again whenever you are ready.',
    invalid_state: 'We could not verify that sign-in attempt. Please try again.',
    unverified_email: 'Your Google account email could not be verified. Try another Google account.',
    account_unavailable: 'This CourseHubs account is currently unavailable. Please contact support.',
    account_already_linked: 'A different Google account is already connected to this CourseHubs account. Sign in with the connected Google account or use your password.',
  })[googleStatus] || '';

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setUnverifiedEmail('');
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
      const requested = params.get('next') || '/dashboard';
      const destination = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please try again.');
      if (err.code === 'EMAIL_NOT_VERIFIED') setUnverifiedEmail(err.email || email.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame eyebrow="WELCOME BACK" title="Good to" highlight="have you here." description="Sign in to access your personal workspace, saved resources and contributor tools.">
      <div className="auth-panel-header">
        <span className="section-kicker">ACCOUNT SIGN IN</span>
        <h2>Welcome back.</h2>
        <p>Use the email address and password associated with your account.</p>
      </div>
      {accountDeleted && <div className="auth-alert auth-alert-success" role="status"><Icon name="checkCircle" size={18}/><span>Your CourseHubs account has been deleted.</span></div>}
      {error && <div className="form-error-banner" role="alert"><Icon name="alert" size={18}/><span>{error}</span></div>}
      {unverifiedEmail && <div className="auth-alert"><Icon name="info" size={19}/><div><strong>Email verification required</strong><p>Your account exists, but its email address has not been verified.</p><Link to={`/resend-verification?email=${encodeURIComponent(unverifiedEmail)}`}>Resend verification link</Link></div></div>}
      {googleMessage && <div className={googleStatus === 'cancelled' ? 'auth-alert' : 'form-error-banner'} role="status"><Icon name="info" size={18}/><span>{googleMessage}</span></div>}
      <button className="google-signin-button" type="button" onClick={startGoogleSignIn}><GoogleMark/> <span>Continue with Google</span></button>
      <div className="auth-divider"><span>or continue with email</span></div>
      <form className="auth-form login-fields" onSubmit={handleSubmit}>
        <div className="field"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)}/></div>
        <div className="field"><div className="field-label-row"><label htmlFor="login-password">Password</label><Link to="/forgot-password">Forgot password?</Link></div><div className="password-field"><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(e) => setPassword(e.target.value)}/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={18}/></button></div></div>
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} <Icon name="arrowRight" size={18}/></button>
      </form>
      <div className="auth-panel-bottom">Don't have an account? <Link to="/register">Create an account <Icon name="arrowUpRight" size={15}/></Link></div>
    </AuthFrame>
  );
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.71 7.18l7.2 5.59c4.2-3.87 6.55-9.57 6.55-17.24Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.93 23.93 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.79l-7.2-5.59c-2 1.34-4.56 2.13-8.71 2.13-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}
