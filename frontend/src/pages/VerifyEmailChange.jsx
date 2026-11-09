import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import AuthFrame from '../components/AuthFrame';
import { verifyEmailChange } from '../api/client';

export default function VerifyEmailChange() {
    const [params] = useSearchParams();
    const [state, setState] = useState({ status: 'loading', message: 'Confirming your new email address…' });

    useEffect(() => {
        let active = true;
        const token = params.get('token');
        if (!token) {
            setState({ status: 'error', message: 'This email-change link is incomplete. Request a new email change from your account settings.' });
            return () => { active = false; };
        }
        verifyEmailChange(token).then((result) => {
            if (active) setState({ status: 'success', message: result.message });
        }).catch((error) => {
            if (active) setState({ status: 'error', message: error.message || 'We could not confirm this email address.' });
        });
        return () => { active = false; };
    }, [params]);

    return <AuthFrame eyebrow="ACCOUNT UPDATE" title="Email" highlight="confirmation." description="Confirming a new email address keeps your CourseHubs account secure.">
        <div className="auth-panel-header"><span className="section-kicker">EMAIL ADDRESS</span><h2>{state.status === 'success' ? 'Email updated.' : state.status === 'error' ? 'Confirmation needed.' : 'One moment…'}</h2><p>{state.message}</p></div>
        {state.status === 'loading' && <div className="account-loading"><span className="loading-spinner" /></div>}
        {state.status === 'success' && <div className="account-notice account-notice-success"><Icon name="checkCircle" size={18} /><span>Your new email address is now active. Sign in again using it.</span></div>}
        {state.status === 'error' && <div className="account-notice account-notice-error"><Icon name="alert" size={18} /><span>{state.message}</span></div>}
        <Link className="btn btn-primary" to="/login">Continue to sign in <Icon name="arrowRight" size={17} /></Link>
    </AuthFrame>;
}
