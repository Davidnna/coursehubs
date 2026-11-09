import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import AuthFrame from '../components/AuthFrame';
import { resendVerification } from '../api/client';

export default function ResendVerification() {
    const [params] = useSearchParams();
    const [email, setEmail] = useState(params.get('email') || '');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(event) {
        event.preventDefault(); setBusy(true); setError(''); setMessage('');
        try {
            const result = await resendVerification(email.trim());
            setMessage(result.message);
        } catch (err) { setError(err.message || 'Unable to process your request.'); }
        finally { setBusy(false); }
    }

    return <AuthFrame eyebrow="EMAIL CONFIRMATION" title="Let's get your" highlight="account verified." description="If you have not received your verification email, you can request another link here.">
        <div className="auth-panel-header"><span className="section-kicker">RESEND VERIFICATION</span><h2>Send a new link.</h2><p>Enter the email address you used when creating your account.</p></div>
        {error && <div className="form-error-banner" role="alert">{error}</div>}
        {message && <div className="auth-alert auth-alert-success" role="status"><Icon name="checkCircle" /><p>{message}</p></div>}
        <form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="verification-email">Email address</label><input id="verification-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Requesting…' : 'Resend verification email'} <Icon name="arrowRight" size={18} /></button></form>
        <div className="auth-panel-bottom"><Link to="/login">Back to sign in</Link></div>
    </AuthFrame>;
}
