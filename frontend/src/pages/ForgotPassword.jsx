import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import AuthFrame from '../components/AuthFrame';
import { requestPasswordReset } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await requestPasswordReset(email.trim());
      setMessage(result.message);
    } catch (err) {
      setError(err.message || 'Unable to process the request.');
    } finally { setBusy(false); }
  }

  return <AuthFrame eyebrow="ACCOUNT RECOVERY" title="A fresh start" highlight="is one step away." description="Enter the email address associated with your CourseHubs account. We will send a password-reset link if the account is eligible.">
    <div className="auth-panel-header"><span className="section-kicker">PASSWORD RECOVERY</span><h2>Forgot your password?</h2><p>We'll send you a secure link to choose a new password.</p></div>
    {error && <div className="form-error-banner" role="alert">{error}</div>}
    {message && <div className="auth-alert auth-alert-success" role="status"><Icon name="checkCircle"/><p>{message}</p></div>}
    <form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="recovery-email">Email address</label><input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></div><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'} <Icon name="arrowRight" size={18}/></button></form>
    <div className="auth-panel-bottom"><Link to="/login">Back to sign in</Link></div>
  </AuthFrame>;
}
