import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import {
  createAcademicCorrection,
  getAcademicStructure,
  getMyAcademicCorrections,
} from '../api/client';
import '../academic.css';

function statusLabel(status) {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Awaiting review';
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function StatusPill({ status }) {
  return <span className={`resource-status resource-status-${status}`}>{statusLabel(status)}</span>;
}

export default function AcademicInformation() {
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [levels, setLevels] = useState([]);
  const [departmentChoice, setDepartmentChoice] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [programmeChoice, setProgrammeChoice] = useState('');
  const [programmeName, setProgrammeName] = useState('');
  const [level, setLevel] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const [overview, structure] = await Promise.all([
      getMyAcademicCorrections(),
      getAcademicStructure(),
    ]);
    setProfile(overview.profile);
    setRequests(Array.isArray(overview.requests) ? overview.requests : []);
    setDepartments(Array.isArray(structure.departments) ? structure.departments : []);
    setProgrammes(Array.isArray(structure.programmes) ? structure.programmes : []);
    setLevels(Array.isArray(structure.levels) ? structure.levels : []);

    const activeDepartment = (structure.departments || []).find(
      (item) => String(item.id) === String(overview.profile.department_id)
    );
    const activeProgramme = (structure.programmes || []).find(
      (item) => String(item.id) === String(overview.profile.programme_id)
        && String(item.department_id) === String(activeDepartment?.id || '')
    );
    setDepartmentChoice(activeDepartment ? String(activeDepartment.id) : '');
    setDepartmentName('');
    setProgrammeChoice(activeProgramme ? String(activeProgramme.id) : '');
    setProgrammeName('');
    setLevel(
      (structure.levels || []).some((item) => Number(item.level) === Number(overview.profile.level))
        ? String(overview.profile.level)
        : ''
    );
  }

  useEffect(() => {
    let active = true;
    Promise.all([getMyAcademicCorrections(), getAcademicStructure()])
      .then(([overview, structure]) => {
        if (!active) return;
        setProfile(overview.profile);
        setRequests(Array.isArray(overview.requests) ? overview.requests : []);
        setDepartments(Array.isArray(structure.departments) ? structure.departments : []);
        setProgrammes(Array.isArray(structure.programmes) ? structure.programmes : []);
        setLevels(Array.isArray(structure.levels) ? structure.levels : []);
        const activeDepartment = (structure.departments || []).find(
          (item) => String(item.id) === String(overview.profile.department_id)
        );
        const activeProgramme = (structure.programmes || []).find(
          (item) => String(item.id) === String(overview.profile.programme_id)
            && String(item.department_id) === String(activeDepartment?.id || '')
        );
        setDepartmentChoice(activeDepartment ? String(activeDepartment.id) : '');
        setProgrammeChoice(activeProgramme ? String(activeProgramme.id) : '');
        setLevel(
          (structure.levels || []).some((item) => Number(item.level) === Number(overview.profile.level))
            ? String(overview.profile.level)
            : ''
        );
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Your academic information could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const activeRequest = requests.find((request) => request.status === 'pending');
  const availableProgrammes = useMemo(
    () => programmes.filter((item) => String(item.department_id) === departmentChoice),
    [programmes, departmentChoice]
  );
  const completeProfile = Boolean(profile?.department_id && profile?.programme_id && profile?.level);
  const departmentIsOther = departmentChoice === '__other__';
  const programmeIsOther = programmeChoice === '__other__' || departmentIsOther;

  function changeDepartment(value) {
    setDepartmentChoice(value);
    setDepartmentName('');
    setProgrammeChoice(value === '__other__' ? '__other__' : '');
    setProgrammeName('');
    setError('');
    setNotice('');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!departmentChoice || (departmentIsOther && !departmentName.trim())) {
      setError('Choose your department or enter its name if it is not listed.');
      return;
    }
    if (!programmeChoice || (programmeIsOther && !programmeName.trim())) {
      setError('Choose your programme or enter its name if it is not listed.');
      return;
    }
    if (!level) {
      setError('Choose your current academic level.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Please explain why your academic information needs correction (at least 10 characters).');
      return;
    }

    const payload = {
      department_id: departmentIsOther ? null : Number(departmentChoice),
      department_name: departmentIsOther ? departmentName.trim() : null,
      programme_id: programmeIsOther ? null : Number(programmeChoice),
      programme_name: programmeIsOther ? programmeName.trim() : null,
      level: Number(level),
      reason: reason.trim(),
    };

    setBusy(true);
    try {
      const result = await createAcademicCorrection(payload);
      setNotice(result.message || 'Your correction request has been submitted.');
      setReason('');
      try {
        await load();
      } catch {
        setError('Your request was submitted, but the latest status could not be refreshed. Reload this page to see it.');
      }
    } catch (requestError) {
      setError(requestError.message || 'Your correction request could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="standard-page"><div className="academic-loading" role="status"><span className="loading-spinner"/><p>Loading your academic information…</p></div></main>;
  }

  return (
    <main className="standard-page academic-correction-page">
      <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14}/>Academic information</div>
      <header className="academic-page-heading">
        <div>
          <span className="academic-kicker">STUDENT PROFILE</span>
          <h1>Academic information</h1>
          <p>Review the academic details attached to your account. If anything is missing or incorrect, request a verified correction.</p>
        </div>
        <span className={`resource-status ${completeProfile ? 'resource-status-approved' : 'resource-status-pending'}`}>
          {completeProfile ? 'Profile assigned' : 'Information incomplete'}
        </span>
      </header>

      {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={18}/>{error}</div>}
      {notice && <div className="resource-success" role="status"><Icon name="checkCircle" size={18}/>{notice}</div>}

      <section className="academic-correction-profile">
        <div className="academic-correction-section-title">
          <div><span className="academic-kicker">CURRENT RECORD</span><h2>Your academic affiliation</h2></div>
          <Icon name="graduation" size={24}/>
        </div>
        <div className="academic-correction-current-grid">
          <div><span>Faculty</span><strong>{profile?.faculty_name || 'Not assigned'}</strong></div>
          <div><span>Department</span><strong>{profile?.department_name || 'Not assigned'}</strong></div>
          <div><span>Programme</span><strong>{profile?.programme_name || 'Not assigned'}</strong></div>
          <div><span>Current level</span><strong>{profile?.level ? `${profile.level} Level` : 'Not assigned'}</strong></div>
        </div>
        {!completeProfile && <p className="academic-correction-inline-note"><Icon name="info" size={16}/> Some academic details are missing. You can still request a correction here; your profile will only change after administrator approval.</p>}
      </section>

      <section className="academic-correction-form-card">
        <div className="academic-correction-section-title">
          <div><span className="academic-kicker">VERIFIED UPDATE</span><h2>Request a correction</h2><p>Choose the correct department, programme and level. If an item is missing from the directory, tell us its name.</p></div>
          <span className="resource-file-symbol"><Icon name="document" size={20}/></span>
        </div>

        {activeRequest ? (
          <div className="academic-correction-pending">
            <div><StatusPill status="pending"/><strong>Your request is awaiting review.</strong></div>
            <p>You can submit another request after an administrator has reviewed this one. You can track its progress in your request history below.</p>
          </div>
        ) : (
          <form className="academic-correction-form" onSubmit={submit}>
            <div className="academic-correction-form-grid">
              <div className="field">
                <label htmlFor="correction-department">Correct department</label>
                <select id="correction-department" required value={departmentChoice} onChange={(event) => changeDepartment(event.target.value)}>
                  <option value="">Select your department</option>
                  {departments.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
                  <option value="__other__">My department is not listed</option>
                </select>
              </div>
              {departmentIsOther && <div className="field">
                <label htmlFor="correction-department-name">Department name</label>
                <input id="correction-department-name" maxLength={160} required value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="Enter the official department name"/>
              </div>}

              {!departmentIsOther && <div className="field">
                <label htmlFor="correction-programme">Correct programme</label>
                <select id="correction-programme" required value={programmeChoice} onChange={(event) => { setProgrammeChoice(event.target.value); setProgrammeName(''); }} disabled={!departmentChoice}>
                  <option value="">Select your programme</option>
                  {availableProgrammes.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
                  <option value="__other__">My programme is not listed</option>
                </select>
              </div>}
              {programmeIsOther && <div className="field">
                <label htmlFor="correction-programme-name">Programme name</label>
                <input id="correction-programme-name" maxLength={160} required value={programmeName} onChange={(event) => setProgrammeName(event.target.value)} placeholder="Enter the official programme name"/>
              </div>}

              <div className="field">
                <label htmlFor="correction-level">Correct current level</label>
                <select id="correction-level" required value={level} onChange={(event) => setLevel(event.target.value)}>
                  <option value="">Select your current level</option>
                  {levels.map((item) => <option key={item.level} value={item.level}>{item.label}</option>)}
                </select>
              </div>
              <div className="field academic-correction-reason-field">
                <label htmlFor="correction-reason">Why does this information need correction?</label>
                <textarea id="correction-reason" rows="4" maxLength={1500} required minLength={10} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: I recently changed programme, but my CourseHubs profile still shows my previous department. If your department is not listed, include its faculty name too."/>
                <small className="field-hint">Provide enough detail for an administrator to verify your request. Maximum 1,500 characters.</small>
              </div>
            </div>
            <div className="academic-correction-form-footer">
              <p><Icon name="shield" size={16}/> Your academic profile will not change until the request is approved.</p>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Submitting request…' : 'Submit correction request'} <Icon name="arrowRight" size={17}/></button>
            </div>
          </form>
        )}
      </section>

      <section className="academic-correction-history">
        <div className="academic-correction-section-title">
          <div><span className="academic-kicker">REQUEST TRACKER</span><h2>Correction history</h2><p>See every request and the decision made by CourseHubs administrators.</p></div>
          <span className="academic-correction-count">{requests.length} {requests.length === 1 ? 'request' : 'requests'}</span>
        </div>
        {requests.length === 0 ? (
          <div className="resource-empty compact-resource-empty"><Icon name="document" size={26}/><h2>No correction requests</h2><p>Requests you submit will appear here with their review status and any administrator feedback.</p></div>
        ) : (
          <div className="academic-correction-history-list">
            {requests.map((request) => <article className="academic-correction-history-card" key={request.id}>
              <div className="academic-correction-history-top"><strong>Request #{request.id}</strong><StatusPill status={request.status}/></div>
              <div className="academic-correction-history-grid">
                <div><span>Requested department</span><strong>{request.requested_department_label || request.requested_department_name || 'Requires administrator mapping'}</strong></div>
                <div><span>Requested programme</span><strong>{request.requested_programme_label || request.requested_programme_name || 'Requires administrator mapping'}</strong></div>
                <div><span>Requested level</span><strong>{request.requested_level} Level</strong></div>
                <div><span>Submitted</span><strong>{dateLabel(request.created_at)}</strong></div>
              </div>
              <p className="academic-correction-reason"><strong>Your explanation:</strong> {request.reason}</p>
              {request.status === 'approved' && <p className="academic-correction-decision-note"><strong>Verified record:</strong> {request.approved_department_name || request.requested_department_label || request.requested_department_name} · {request.approved_programme_name || request.requested_programme_label || request.requested_programme_name} · {request.approved_level || request.requested_level} Level</p>}
              {request.decision_note && <p className={`academic-correction-decision-note ${request.status === 'rejected' ? 'is-rejected' : ''}`}><strong>Administrator feedback:</strong> {request.decision_note}</p>}
              {request.reviewed_at && <small className="academic-correction-reviewed">Reviewed {dateLabel(request.reviewed_at)}{request.reviewer_name ? ` by ${request.reviewer_name}` : ''}</small>}
            </article>)}
          </div>
        )}
      </section>
    </main>
  );
}
