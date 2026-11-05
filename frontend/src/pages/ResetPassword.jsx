import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import AuthFrame from '../components/AuthFrame';
import { resetPassword } from '../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(''); setFieldError('');
    if (password !== confirm) { setFieldError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      await resetPassword({ token, password });
      setDone(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (err) {
      setError(err.fields?.password || err.message || 'Unable to reset your password.');
    } finally { setBusy(false); }
  }

  return <AuthFrame eyebrow="SECURE ACCOUNT RECOVERY" title="Choose a new" highlight="password." description="Create a strong password you have not used on another service.">
    <div className="auth-panel-header"><span className="section-kicker">RESET PASSWORD</span><h2>Set a new password.</h2><p>Your reset link is valid for one hour and can only be used once.</p></div>
    {done ? <div className="auth-alert auth-alert-success"><Icon name="checkCircle"/><p>Your password has been updated. Redirecting you to sign in…</p></div> : !token ? <div className="auth-alert"><Icon name="alert"/><p>This reset link is missing or invalid. Request a new password-reset link.</p></div> : <form className="auth-form" onSubmit={submit}>
      {error && <div className="form-error-banner" role="alert">{error}</div>}
      <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"/><small className="field-hint">Use at least 8 characters.</small></div>
      <div className={`field ${fieldError ? 'field-error' : ''}`}><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Enter the password again"/>{fieldError && <small className="field-error-text">{fieldError}</small>}</div>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'} <Icon name="arrowRight" size={18}/></button>
    </form>}
    <div className="auth-panel-bottom"><Link to="/forgot-password">Request a fresh reset link</Link><span>·</span><Link to="/login">Back to sign in</Link></div>
  </AuthFrame>;
}
