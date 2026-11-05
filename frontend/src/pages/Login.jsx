import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import AuthFrame from '../components/AuthFrame';
import { useAuth } from '../auth/AuthContext';

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
      {error && <div className="form-error-banner" role="alert"><Icon name="alert" size={18}/><span>{error}</span></div>}
      {unverifiedEmail && <div className="auth-alert"><Icon name="info" size={19}/><div><strong>Email verification required</strong><p>Your account exists, but its email address has not been verified.</p><Link to={`/resend-verification?email=${encodeURIComponent(unverifiedEmail)}`}>Resend verification link</Link></div></div>}
      <form className="auth-form login-fields" onSubmit={handleSubmit}>
        <div className="field"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)}/></div>
        <div className="field"><div className="field-label-row"><label htmlFor="login-password">Password</label><Link to="/forgot-password">Forgot password?</Link></div><div className="password-field"><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(e) => setPassword(e.target.value)}/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={18}/></button></div></div>
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} <Icon name="arrowRight" size={18}/></button>
      </form>
      <div className="auth-panel-bottom">Don't have an account? <Link to="/register">Create an account <Icon name="arrowUpRight" size={15}/></Link></div>
    </AuthFrame>
  );
}
