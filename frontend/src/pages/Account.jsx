import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import {
    changeAccountPassword,
    deleteAccount as deleteAccountRequest,
    getAccount,
    requestEmailChange,
    startGoogleSignIn,
    updateAccountProfile,
} from '../api/client';
import './account.css';
import AcademicInformationSettings from './AcademicInformationSettings';

function initials(user) {
    return `${user?.first_name?.[0] || ''}${user?.surname?.[0] || ''}`.toUpperCase() || 'CH';
}

async function compressPhoto(file) {
    if (!file.type.startsWith('image/')) throw new Error('Choose a JPG, PNG or WebP image.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');

    let image;
    if (window.createImageBitmap) {
        image = await createImageBitmap(file);
    } else {
        image = await new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const element = new Image();
            element.onload = () => { URL.revokeObjectURL(objectUrl); resolve(element); };
            element.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('This image could not be opened.')); };
            element.src = objectUrl;
        });
    }

    const side = 512;
    const scale = Math.min(1, side / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not process this image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();

    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob) throw new Error('Your browser could not process this image.');
    if (blob.size > 400 * 1024) {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.64));
    }
    if (!blob || blob.size > 400 * 1024) throw new Error('Choose a smaller image.');
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('This image could not be processed.'));
        reader.readAsDataURL(blob);
    });
}

function Notice({ kind = 'success', children }) {
    const icon = kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'checkCircle';
    return <div className={`account-notice account-notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon name={icon} size={18} /><span>{children}</span></div>;
}

export default function Account() {
    const { user, updateUser, replaceSession, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const photoInputRef = useRef(null);
    const [account, setAccount] = useState(user);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState({ first_name: user?.first_name || '', surname: user?.surname || '', middle_name: user?.middle_name || '', phone: user?.phone || '' });
    const [photoData, setPhotoData] = useState(user?.profile_picture_data || null);
    const [googleConnected, setGoogleConnected] = useState(false);
    const [hasPassword, setHasPassword] = useState(true);
    const [profileBusy, setProfileBusy] = useState(false);
    const [profileNotice, setProfileNotice] = useState(null);
    const [emailForm, setEmailForm] = useState({ new_email: '', current_password: '' });
    const [emailBusy, setEmailBusy] = useState(false);
    const [emailNotice, setEmailNotice] = useState(null);
    const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [passwordBusy, setPasswordBusy] = useState(false);
    const [passwordNotice, setPasswordNotice] = useState(null);
    const [deleteForm, setDeleteForm] = useState({ current_password: '', confirmation: '' });
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteNotice, setDeleteNotice] = useState(null);

    useEffect(() => {
        let active = true;
        getAccount().then((result) => {
            if (!active) return;
            setAccount(result.user);
            setProfile({ first_name: result.user.first_name || '', surname: result.user.surname || '', middle_name: result.user.middle_name || '', phone: result.user.phone || '' });
            setPhotoData(result.user.profile_picture_data || null);
            setGoogleConnected(result.google_connected === true);
            setHasPassword(result.has_password === true);
            updateUser(result.user);
        }).catch((error) => {
            if (active) setProfileNotice({ kind: 'error', message: error.message || 'We could not load your account details.' });
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [updateUser]);

    useEffect(() => {
        if (loading || location.hash !== '#academic-information') return undefined;
        const frame = window.requestAnimationFrame(() => {
            document.getElementById('academic-information')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [loading, location.hash]);

    function updateProfileField(field, value) {
        setProfile((current) => ({ ...current, [field]: value }));
        setProfileNotice(null);
    }

    async function handlePhotoChange(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const data = await compressPhoto(file);
            setPhotoData(data);
            setProfileNotice({ kind: 'success', message: 'Photo selected. Save your profile to apply the change.' });
        } catch (error) {
            setProfileNotice({ kind: 'error', message: error.message || 'We could not use that image.' });
        }
    }

    async function saveProfile(event) {
        event.preventDefault();
        setProfileBusy(true);
        setProfileNotice(null);
        try {
            const result = await updateAccountProfile({ ...profile, profile_picture_data: photoData });
            setAccount(result.user);
            updateUser(result.user);
            setProfileNotice({ kind: 'success', message: result.message || 'Your profile has been updated.' });
        } catch (error) {
            setProfileNotice({ kind: 'error', message: error.message || 'We could not save your profile.' });
        } finally { setProfileBusy(false); }
    }

    async function submitEmailChange(event) {
        event.preventDefault();
        setEmailBusy(true);
        setEmailNotice(null);
        try {
            const result = await requestEmailChange(emailForm);
            setEmailNotice({ kind: 'success', message: result.message });
            setEmailForm({ new_email: '', current_password: '' });
        } catch (error) {
            setEmailNotice({ kind: 'error', message: error.message || 'We could not request an email change.' });
        } finally { setEmailBusy(false); }
    }

    async function submitPasswordChange(event) {
        event.preventDefault();
        setPasswordBusy(true);
        setPasswordNotice(null);
        try {
            const result = await changeAccountPassword(passwordForm);
            replaceSession(result.token, result.user);
            setAccount(result.user);
            setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
            setHasPassword(true);
            setPasswordNotice({ kind: 'success', message: 'Password changed. This device remains signed in; other sessions have been signed out.' });
        } catch (error) {
            setPasswordNotice({ kind: 'error', message: error.message || 'We could not change your password.' });
        } finally { setPasswordBusy(false); }
    }

    async function submitDeleteAccount(event) {
        event.preventDefault();
        setDeleteBusy(true);
        setDeleteNotice(null);
        try {
            const result = await deleteAccountRequest(deleteForm);
            try { await signOut(); } catch { /* The account has already been removed and the local token is cleared. */ }
            navigate('/login?account=deleted', { replace: true, state: { accountDeleted: true, message: result.message } });
        } catch (error) {
            setDeleteNotice({ kind: 'error', message: error.message || 'We could not delete your account.' });
        } finally { setDeleteBusy(false); }
    }

    if (loading) return <main className="account-page"><div className="account-loading" role="status"><span className="loading-spinner" /> Loading your account…</div></main>;

    const displayName = `${account?.first_name || user?.first_name || ''} ${account?.surname || user?.surname || ''}`.trim();
    const hasAdministratorResponsibilities = Boolean(
        account?.is_admin
        || account?.is_super_admin
        || account?.admin_scopes?.length
    );

    return (
        <main className="account-page">
            <header className="account-page-header">
                <div><span className="page-eyebrow">YOUR PROFILE</span><h1>Account <span>settings</span></h1><p>Manage your personal information, sign-in methods and account security.</p></div>
                <span className="account-verified-pill"><Icon name="shield" size={16} /> {account?.is_verified ? 'Verified account' : 'Email not verified'}</span>
            </header>

            <section className="account-profile-summary">
                <div className="account-avatar-large">{photoData ? <img src={photoData} alt={`${displayName} profile`} /> : <span>{initials(account || user)}</span>}</div>
                <div className="account-summary-copy"><span className="account-summary-label">SIGNED IN AS</span><h2>{displayName || 'CourseHubs member'}</h2><p>{account?.email || user?.email}</p><span className="account-type-chip">{account?.account_type === 'staff' ? 'Staff member' : 'Student'}{account?.level ? ` · ${account.level} level` : ''}</span></div>
                <Link to="/dashboard" className="account-back-link"><Icon name="arrowRight" size={16} /> Back to workspace</Link>
            </section>

            <div className="account-layout-grid">
                <div className="account-main-column">
                    <section className="account-card" aria-labelledby="account-profile-heading">
                        <div className="account-card-heading"><div><span className="account-section-kicker">PERSONAL DETAILS</span><h2 id="account-profile-heading">Profile information</h2><p>Keep your name and contact details up to date.</p></div><span className="account-card-icon"><Icon name="user" size={20} /></span></div>
                        {profileNotice && <Notice kind={profileNotice.kind}>{profileNotice.message}</Notice>}
                        <form onSubmit={saveProfile} className="account-form">
                            <div className="account-photo-row">
                                <div className="account-avatar-medium">{photoData ? <img src={photoData} alt="Profile preview" /> : <span>{initials(account || user)}</span>}</div>
                                <div className="account-photo-actions"><strong>Profile photo</strong><p>JPG, PNG or WebP. The image is resized before it is saved.</p><div><button className="account-small-button" type="button" onClick={() => photoInputRef.current?.click()}><Icon name="upload" size={15} /> Upload photo</button>{photoData && <button className="account-text-button" type="button" onClick={() => setPhotoData(null)}>Remove</button>}</div><input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handlePhotoChange} /></div>
                            </div>
                            <div className="account-form-grid">
                                <div className="field"><label htmlFor="account-first-name">First name</label><input id="account-first-name" autoComplete="given-name" maxLength={80} required value={profile.first_name} onChange={(event) => updateProfileField('first_name', event.target.value)} /></div>
                                <div className="field"><label htmlFor="account-surname">Surname</label><input id="account-surname" autoComplete="family-name" maxLength={80} required value={profile.surname} onChange={(event) => updateProfileField('surname', event.target.value)} /></div>
                                <div className="field"><label htmlFor="account-middle-name">Middle name <span className="optional">(optional)</span></label><input id="account-middle-name" autoComplete="additional-name" maxLength={80} value={profile.middle_name} onChange={(event) => updateProfileField('middle_name', event.target.value)} /></div>
                                <div className="field"><label htmlFor="account-phone">Phone number</label><input id="account-phone" type="tel" autoComplete="tel" maxLength={30} required value={profile.phone} onChange={(event) => updateProfileField('phone', event.target.value)} /></div>
                            </div>
                            <div className="account-readonly-grid"><div><span>Account type</span><strong>{account?.account_type === 'staff' ? 'Staff member' : 'Student'}</strong></div>{account?.reg_no && <div><span>Registration number</span><strong>{account.reg_no}</strong></div>}{account?.staff_no && <div><span>Staff number</span><strong>{account.staff_no}</strong></div>}</div>
                            <div className="account-form-actions"><button className="btn btn-primary" type="submit" disabled={profileBusy}>{profileBusy ? 'Saving changes…' : 'Save profile changes'} <Icon name="arrowRight" size={17} /></button></div>
                        </form>
                    </section>

                    {account?.account_type === 'student' && <AcademicInformationSettings />}

                    <section className="account-card" aria-labelledby="account-email-heading">
                        <div className="account-card-heading"><div><span className="account-section-kicker">EMAIL ADDRESS</span><h2 id="account-email-heading">Change email address</h2><p>Your new email address must be verified before it replaces the current one.</p></div><span className="account-card-icon"><Icon name="mail" size={20} /></span></div>
                        <div className="account-current-email"><span>Current email</span><strong>{account?.email}</strong><span className="account-current-status"><Icon name="checkCircle" size={14} /> Verified</span></div>
                        {emailNotice && <Notice kind={emailNotice.kind}>{emailNotice.message}</Notice>}
                        {hasPassword ? (
                            <form onSubmit={submitEmailChange} className="account-form">
                                <div className="field"><label htmlFor="account-new-email">New email address</label><input id="account-new-email" type="email" autoComplete="email" required placeholder="name@example.com" value={emailForm.new_email} onChange={(event) => setEmailForm((current) => ({ ...current, new_email: event.target.value }))} /></div>
                                <div className="field"><label htmlFor="account-email-password">Confirm with your current password</label><input id="account-email-password" type="password" autoComplete="current-password" required value={emailForm.current_password} onChange={(event) => setEmailForm((current) => ({ ...current, current_password: event.target.value }))} /></div>
                                <div className="account-form-actions"><button className="btn btn-outline" type="submit" disabled={emailBusy}>{emailBusy ? 'Sending confirmation…' : 'Send confirmation link'} <Icon name="arrowRight" size={17} /></button></div>
                            </form>
                        ) : (
                            <Notice kind="info">
                                Set a password first to change your email address. <Link to="/forgot-password">Set a password</Link>
                            </Notice>
                        )}
                    </section>

                    <section className="account-card" aria-labelledby="account-security-heading">
                        <div className="account-card-heading"><div><span className="account-section-kicker">ACCOUNT SECURITY</span><h2 id="account-security-heading">{hasPassword ? 'Change password' : 'Set a password'}</h2><p>{hasPassword ? 'Use a strong password that you do not use elsewhere.' : 'Your account currently uses Google sign-in. You can also create a password for email and password sign-in.'}</p></div><span className="account-card-icon"><Icon name="lock" size={20} /></span></div>
                        {passwordNotice && <Notice kind={passwordNotice.kind}>{passwordNotice.message}</Notice>}
                        {hasPassword ? (
                            <form onSubmit={submitPasswordChange} className="account-form">
                                <div className="field"><label htmlFor="account-current-password">Current password</label><input id="account-current-password" type="password" autoComplete="current-password" required value={passwordForm.current_password} onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))} /></div>
                                <div className="account-form-grid"><div className="field"><label htmlFor="account-new-password">New password</label><input id="account-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={passwordForm.new_password} onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))} /></div><div className="field"><label htmlFor="account-confirm-password">Confirm new password</label><input id="account-confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={passwordForm.confirm_password} onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))} /></div></div>
                                <div className="account-form-actions"><button className="btn btn-outline" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Updating password…' : 'Update password'} <Icon name="shield" size={17} /></button></div>
                            </form>
                        ) : (
                            <Notice kind="info">
                                To create a password, use the password recovery link sent to your verified CourseHubs email address. <Link to="/forgot-password">Set a password</Link>
                            </Notice>
                        )}
                    </section>

                    <section className="account-card" aria-labelledby="account-google-heading">
                        <div className="account-card-heading"><div><span className="account-section-kicker">CONNECTED SIGN-IN</span><h2 id="account-google-heading">Google account</h2><p>Use Google to sign in to CourseHubs with the same email address as this account.</p></div><span className="account-card-icon account-google-icon"><GoogleMark /></span></div>
                        <div className="account-google-row"><div className="account-google-brand"><GoogleMark /><div><strong>Google</strong><span>{googleConnected ? 'Connected to this CourseHubs account' : 'Not connected'}</span></div></div>{googleConnected ? <span className="account-connected-pill"><Icon name="checkCircle" size={15} /> Connected</span> : <button type="button" className="account-small-button" onClick={startGoogleSignIn}>Connect Google <Icon name="arrowUpRight" size={15} /></button>}</div>
                        {!googleConnected && <p className="account-inline-help">Choose the Google account that uses <strong>{account?.email}</strong>. If the addresses match, CourseHubs will securely link them.</p>}
                    </section>

                    <section className="account-card account-danger-card" aria-labelledby="account-delete-heading">
                        <div className="account-card-heading"><div><span className="account-section-kicker account-danger-kicker">PERMANENT ACTION</span><h2 id="account-delete-heading">Delete account</h2><p>Delete your CourseHubs access and remove personal profile details. This action cannot be undone.</p></div><span className="account-card-icon account-danger-icon"><Icon name="alert" size={20} /></span></div>
                        {hasAdministratorResponsibilities ? (
                            <Notice kind="error">Accounts with active administrator responsibilities cannot be deleted from their own session. Ask another authorised administrator to revoke all appointments first.</Notice>
                        ) : !hasPassword ? (
                            <Notice kind="info">
                                Set a password first to confirm account deletion. <Link to="/forgot-password">Set a password</Link>
                            </Notice>
                        ) : (
                            <>
                                {deleteNotice && <Notice kind="error">{deleteNotice.message}</Notice>}
                                <form onSubmit={submitDeleteAccount} className="account-form">
                                    <div className="field"><label htmlFor="account-delete-password">Current password</label><input id="account-delete-password" type="password" autoComplete="current-password" required value={deleteForm.current_password} onChange={(event) => setDeleteForm((current) => ({ ...current, current_password: event.target.value }))} /></div>
                                    <div className="field"><label htmlFor="account-delete-confirm">Type DELETE to confirm</label><input id="account-delete-confirm" autoComplete="off" required value={deleteForm.confirmation} onChange={(event) => setDeleteForm((current) => ({ ...current, confirmation: event.target.value }))} /></div>
                                    <div className="account-form-actions"><button className="btn btn-danger" type="submit" disabled={deleteBusy || deleteForm.confirmation !== 'DELETE'}>{deleteBusy ? 'Deleting account…' : 'Delete my account'} <Icon name="trash" size={17} /></button></div>
                                </form>
                            </>
                        )}
                    </section>
                </div>

                <aside className="account-side-column">
                    <div className="account-side-card"><span className="account-side-icon"><Icon name="shield" size={21} /></span><h3>Keep your account secure</h3><p>Never share your password or verification links. CourseHubs will not ask you to send them through chat or email.</p><Link to="/contact">Get account help <Icon name="arrowUpRight" size={15} /></Link></div>
                    <div className="account-side-card account-side-summary"><span className="account-section-kicker">ACCOUNT STATUS</span><div><span>Email verification</span><strong>{account?.is_verified ? 'Verified' : 'Pending'}</strong></div><div><span>Google sign-in</span><strong>{googleConnected ? 'Connected' : 'Not connected'}</strong></div><div><span>Account type</span><strong>{account?.account_type === 'staff' ? 'Staff' : 'Student'}</strong></div></div>
                </aside>
            </div>
        </main>
    );
}

function GoogleMark() {
    return <svg viewBox="0 0 48 48" width="21" height="21" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.71 7.18l7.2 5.59c4.2-3.87 6.55-9.57 6.55-17.24Z" /><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.93 23.93 0 0 0 0 21.56l7.98-6.19Z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.79l-7.2-5.59c-2 1.34-4.56 2.13-8.71 2.13-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" /></svg>;
}
