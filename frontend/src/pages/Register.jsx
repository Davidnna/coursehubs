import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { getAcademicSessions, register } from '../api/client';

const LEVELS = [100, 200, 300, 400, 500];
const initialForm = { first_name: '', surname: '', middle_name: '', email: '', phone: '', password: '', reg_no: '', level: '', expected_graduation_session_id: '', staff_no: '' };

function Field({ id, label, error, hint, children, ...props }) {
  return <div className={`field ${error ? 'field-error' : ''}`}><label htmlFor={id}>{label}</label>{children || <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props}/>} {hint && <small id={`${id}-hint`} className="field-hint">{hint}</small>}{error && <small id={`${id}-error`} className="field-error-text" role="alert">{error}</small>}</div>;
}

export default function Register() {
  const [searchParams] = useSearchParams();
  const [accountType, setAccountType] = useState('student');
  const [form, setForm] = useState(initialForm);
  const [sessions, setSessions] = useState([]);
  const [sessionsError, setSessionsError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [passwordShown, setPasswordShown] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  useEffect(() => {
    const googleEmail = searchParams.get('email');
    if (searchParams.get('google') === 'account_not_found' && googleEmail) {
      setForm((current) => ({ ...current, email: googleEmail }));
      setFormError('Create your CourseHubs account with this Google email address first. You can then use Google to sign in.');
    }
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    getAcademicSessions()
      .then((data) => { if (active) { setSessions(Array.isArray(data.sessions) ? data.sessions : []); setSessionsError(false); } })
      .catch(() => { if (active) setSessionsError(true); });
    return () => { active = false; };
  }, []);

  function updateField(field, value) { setForm((prev) => ({ ...prev, [field]: value })); setFieldErrors((prev) => ({ ...prev, [field]: undefined })); }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!acceptedPolicies) { setFormError('Please review and accept the Terms of Service and Privacy Policy to create an account.'); return; }
    setFormError(''); setFieldErrors({}); setSubmitting(true);
    const payload = {
      account_type: accountType,
      first_name: form.first_name.trim(), surname: form.surname.trim(), middle_name: form.middle_name.trim() || undefined,
      email: form.email.trim(), phone: form.phone.trim(), password: form.password,
      ...(accountType === 'student' ? {
        reg_no: form.reg_no.trim(), level: form.level,
        expected_graduation_session_id: form.expected_graduation_session_id,
      } : { staff_no: form.staff_no.trim() }),
    };
    try {
      const result = await register(payload);
      setSuccess({ emailSent: result.verification_email_sent === true, email: payload.email });
    } catch (error) {
      if (error.fields) { setFieldErrors(error.fields); setFormError('Check the highlighted fields and try again.'); }
      else setFormError(error.message || 'Unable to create your account. Please try again.');
    } finally { setSubmitting(false); }
  }
  if (success) return <main className="auth-page register-page"><section className="auth-intro"><span className="auth-eyebrow"><span/> YOUR NEXT CHAPTER</span><h1>You're<br/><em>on your way.</em></h1><p>One less obstacle between you and the resources you need for your studies.</p><div className="auth-benefit"><Icon name="graduation" size={19}/> Computer Science, EBSU</div></section><section className="auth-panel auth-success"><div className="success-icon"><Icon name="checkCircle" size={32}/></div><span className="section-kicker">ACCOUNT CREATED</span><h2>You're in.</h2><p>Your account was created for <strong>{success.email}</strong>.</p>{success.emailSent ? <div className="auth-alert auth-alert-success"><Icon name="checkCircle" size={20}/><p>A verification link was sent to your email address. Check your inbox to continue.</p></div> : <div className="auth-alert"><Icon name="info" size={20}/><p>Your account has been created, but we couldn't send the verification email just now. Please try requesting another link in a few minutes.</p></div>}<Link to={success.emailSent ? '/login' : `/resend-verification?email=${encodeURIComponent(success.email)}`} className="btn btn-primary">{success.emailSent ? 'Continue to sign in' : 'Resend verification email'} <Icon name="arrowRight" size={18}/></Link><Link to="/" className="success-home">Return to homepage</Link></section></main>;

  return <main className="auth-page register-page"><section className="auth-intro"><span className="auth-eyebrow"><span/> START SOMETHING GOOD</span><h1>A better way<br/>to <em>learn together.</em></h1><p>Be part of the department's shared learning space. Find the right resources and stay focused on what matters.</p><div className="auth-benefits"><div><span><Icon name="search" size={20}/></span><strong>Discover resources faster</strong></div><div><span><Icon name="book" size={20}/></span><strong>One place for every course</strong></div><div><span><Icon name="shield" size={20}/></span><strong>Built for your department</strong></div></div><div className="auth-intro-foot">COURSEHUBS / COMPUTER SCIENCE</div></section><section className="auth-panel register-panel"><div className="auth-panel-header"><span className="section-kicker">JOIN COURSEHUBS</span><h2>Create your account.</h2><p>Fill in your details to get started. Already registered? <Link to="/login">Sign in</Link></p></div><div className="account-tabs" role="tablist" aria-label="Choose account type">{['student', 'staff'].map((type) => <button type="button" role="tab" key={type} aria-selected={accountType === type} className={accountType === type ? 'account-tab account-tab-active' : 'account-tab'} onClick={() => { setAccountType(type); setFormError(''); setFieldErrors({}); }}><Icon name={type === 'student' ? 'graduation' : 'user'} size={19}/>{type === 'student' ? 'Student' : 'Staff member'}</button>)}</div><form noValidate onSubmit={handleSubmit} className="register-form">{formError && <div className="form-error-banner" role="alert"><Icon name="alert" size={18}/>{formError}</div>}<div className="field-row"><Field id="first_name" label="First name" placeholder="First name" autoComplete="given-name" required value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} error={fieldErrors.first_name}/><Field id="surname" label="Surname" placeholder="Surname" autoComplete="family-name" required value={form.surname} onChange={(e) => updateField('surname', e.target.value)} error={fieldErrors.surname}/></div><Field id="middle_name" label={<>Middle name <span className="optional">(optional)</span></>} placeholder="Middle name" autoComplete="additional-name" value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} error={fieldErrors.middle_name}/><div className="field-row"><Field id="email" label="Email address" type="email" placeholder="you@example.com" autoComplete="email" required value={form.email} onChange={(e) => updateField('email', e.target.value)} error={fieldErrors.email}/><Field id="phone" label="Phone number" type="tel" placeholder="0800 000 0000" autoComplete="tel" required value={form.phone} onChange={(e) => updateField('phone', e.target.value)} error={fieldErrors.phone}/></div>{accountType === 'student' ? <><div className="field-row"><Field id="reg_no" label="Registration number" placeholder="EBSU/2022/XXXXXXX" autoComplete="off" required value={form.reg_no} onChange={(e) => updateField('reg_no', e.target.value)} error={fieldErrors.reg_no}/><Field id="level" label="Current level" error={fieldErrors.level}><select id="level" required value={form.level} aria-invalid={Boolean(fieldErrors.level)} onChange={(e) => updateField('level', e.target.value)}><option value="">Select your level</option>{LEVELS.map((level) => <option key={level} value={level}>{level} Level</option>)}</select></Field></div><Field id="grad_session" label="Expected graduation session" error={fieldErrors.expected_graduation_session_id}><select id="grad_session" required value={form.expected_graduation_session_id} aria-invalid={Boolean(fieldErrors.expected_graduation_session_id)} onChange={(e) => updateField('expected_graduation_session_id', e.target.value)}><option value="">Choose academic session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</select>{sessionsError && <small className="field-error-text" role="alert">We couldn’t load the available academic sessions. Please refresh the page and try again.</small>}</Field></> : <Field id="staff_no" label="Staff number" placeholder="Your official staff number" autoComplete="off" required value={form.staff_no} onChange={(e) => updateField('staff_no', e.target.value)} error={fieldErrors.staff_no}/>}<Field id="password" label="Create password" error={fieldErrors.password} hint="Use at least 8 characters."><div className="password-field"><input id="password" type={passwordShown ? 'text' : 'password'} placeholder="Minimum 8 characters" autoComplete="new-password" required value={form.password} aria-invalid={Boolean(fieldErrors.password)} onChange={(e) => updateField('password', e.target.value)}/><button type="button" onClick={() => setPasswordShown((prev) => !prev)} aria-label={passwordShown ? 'Hide password' : 'Show password'}><Icon name={passwordShown ? 'eyeOff' : 'eye'} size={18}/></button></div></Field><div className="register-policy-consent"><input id="accept-policies" type="checkbox" required checked={acceptedPolicies} onChange={(event) => setAcceptedPolicies(event.target.checked)}/><label htmlFor="accept-policies">I agree to the <Link to="/terms" target="_blank" rel="noreferrer">Terms of Service</Link> and acknowledge the <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.</label></div><button className="btn btn-primary register-submit" type="submit" disabled={submitting || (accountType === 'student' && sessionsError)}>{submitting ? 'Creating account…' : 'Create my account'}<Icon name="arrowRight" size={19}/></button><p className="register-terms">CourseHubs is an independent student project and is not an official EBSU service.</p></form></section></main>;
}
