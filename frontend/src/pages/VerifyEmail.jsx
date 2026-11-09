import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import AuthFrame from '../components/AuthFrame';
import { verifyEmail } from '../api/client';

export default function VerifyEmail() {
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const [state, setState] = useState({ status: 'loading', message: 'Checking your verification link…' });

    useEffect(() => {
        let active = true;
        if (!token) {
            setState({ status: 'error', message: 'This verification link is incomplete. Request a new one to continue.' });
            return () => { active = false; };
        }
        verifyEmail(token)
            .then((result) => { if (active) setState({ status: 'success', message: result.message }); })
            .catch((error) => { if (active) setState({ status: 'error', message: error.message || 'This verification link is invalid or expired.' }); });
        return () => { active = false; };
    }, [token]);

    return <AuthFrame eyebrow="EMAIL CONFIRMATION" title="One last step" highlight="to activate your account." description="Email verification helps keep the CourseHubs community reliable and secure.">
        <div className="auth-panel-header"><span className="section-kicker">VERIFY EMAIL</span><h2>{state.status === 'loading' ? 'Verifying your email…' : state.status === 'success' ? 'Email verified.' : 'Verification unsuccessful.'}</h2><p>{state.message}</p></div>
        {state.status === 'loading' && <div className="route-loading route-loading-inline"><span className="loading-spinner" /></div>}
        {state.status === 'success' && <div className="auth-alert auth-alert-success"><Icon name="checkCircle" /><p>Your account is now active. You can sign in and access your workspace.</p></div>}
        {state.status === 'error' && <div className="auth-alert"><Icon name="alert" /><p>If the link has expired, request a new verification email.</p></div>}
        {state.status === 'success' ? <Link className="btn btn-primary" to="/login">Continue to sign in <Icon name="arrowRight" size={18} /></Link> : state.status === 'error' ? <Link className="btn btn-primary" to="/resend-verification">Resend verification link <Icon name="arrowRight" size={18} /></Link> : null}
    </AuthFrame>;
}
