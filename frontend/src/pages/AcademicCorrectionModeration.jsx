import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import {
  getAcademicStructure,
  getAdminAcademicCorrections,
  reviewAcademicCorrection,
} from '../api/client';
import '../academic.css';

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function StatusPill({ status }) {
  const label = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Awaiting review';
  return <span className={`resource-status resource-status-${status}`}>{label}</span>;
}

export default function AcademicCorrectionModeration() {
  const [status, setStatus] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [reviewValues, setReviewValues] = useState({});
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [result, structure] = await Promise.all([
        getAdminAcademicCorrections(status),
        getAcademicStructure(),
      ]);
      const nextRequests = Array.isArray(result.requests) ? result.requests : [];
      setRequests(nextRequests);
      setDepartments(Array.isArray(structure.departments) ? structure.departments : []);
      setProgrammes(Array.isArray(structure.programmes) ? structure.programmes : []);
      setReviewValues((previous) => {
        const next = {};
        nextRequests.forEach((request) => {
          const old = previous[request.id] || {};
          next[request.id] = {
            department_id: old.department_id || String(request.requested_department_id || ''),
            programme_id: old.programme_id || String(request.requested_programme_id || ''),
          };
        });
        return next;
      });
    } catch (requestError) {
      setError(requestError.message || 'Academic correction requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [status]);

  function updateMapping(id, field, value) {
    setReviewValues((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] || {}),
        [field]: value,
        ...(field === 'department_id' ? { programme_id: '' } : {}),
      },
    }));
  }

  async function decide(request, nextStatus) {
    const note = (notes[request.id] || '').trim();
    const mapping = reviewValues[request.id] || {};
    if (nextStatus === 'rejected' && note.length < 10) {
      setError('Provide a review explanation of at least 10 characters before rejecting a request.');
      return;
    }
    const selectedDepartment = departments.find((item) => String(item.id) === String(mapping.department_id || ''));
    const selectedProgramme = programmes.find((item) => String(item.id) === String(mapping.programme_id || '') && String(item.department_id) === String(mapping.department_id || ''));
    if (nextStatus === 'approved' && (!selectedDepartment || !selectedProgramme)) {
      setError('Select an active department and a degree programme that belongs to it before approving this request.');
      return;
    }

    setBusyId(request.id);
    setError('');
    setNotice('');
    try {
      await reviewAcademicCorrection(request.id, {
        status: nextStatus,
        decision_note: note,
        ...(nextStatus === 'approved' ? {
          department_id: Number(mapping.department_id),
          programme_id: Number(mapping.programme_id),
        } : {}),
      });
      setNotice(nextStatus === 'approved'
        ? `Academic information for ${request.student_name} has been updated.`
        : `The request from ${request.student_name} has been rejected.`);
      await refresh();
    } catch (requestError) {
      setError(requestError.message || 'The correction decision could not be saved.');
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = useMemo(() => requests.filter((item) => item.status === 'pending').length, [requests]);

  return (
    <main className="standard-page academic-correction-admin-page">
      <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14}/><span>Administrator workspace</span><Icon name="chevronRight" size={14}/>Academic information requests</div>
      <div className="academic-page-heading">
        <div><span className="academic-kicker">STUDENT RECORDS</span><h1>Academic information requests</h1><p>Verify student requests to correct department, degree programme or current level.</p></div>
        <button type="button" className="btn btn-outline" onClick={refresh}><Icon name="refresh" size={16}/> Refresh queue</button>
      </div>

      {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={18}/>{error}</div>}
      {notice && <div className="resource-success" role="status"><Icon name="checkCircle" size={18}/>{notice}</div>}

      <div className="resource-moderation-toolbar">
        <label htmlFor="academic-correction-status">Show requests</label>
        <select id="academic-correction-status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="pending">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All requests</option>
        </select>
        <span>{requests.length} records{status === 'pending' ? ` · ${pendingCount} pending` : ''}</span>
      </div>

      {loading ? (
        <div className="academic-loading" role="status"><span className="loading-spinner"/><p>Loading academic information requests…</p></div>
      ) : requests.length === 0 ? (
        <div className="resource-empty"><Icon name="document" size={31}/><h2>No requests in this view</h2><p>New student academic information requests will appear here for review.</p></div>
      ) : (
        <div className="academic-correction-admin-list">
          {requests.map((request) => {
            const mapping = reviewValues[request.id] || {};
            const departmentId = String(mapping.department_id || '');
            const programmeOptions = programmes.filter((item) => String(item.department_id) === departmentId);
            const requestedDepartment = request.requested_department_label || request.requested_department_name || 'Not specified in the legacy request';
            const requestedProgramme = request.requested_programme_label || request.requested_programme_name || 'Not specified in the legacy request';
            const requestedDepartmentActive = departments.some((item) => String(item.id) === String(request.requested_department_id || ''));
            const requestedProgrammeActive = programmes.some((item) => String(item.id) === String(request.requested_programme_id || ''));
            const mappedDepartmentActive = departments.some((item) => String(item.id) === departmentId);
            const mappedProgrammeActive = programmeOptions.some((item) => String(item.id) === String(mapping.programme_id || ''));
            const requiresDirectoryMapping = Boolean(
              request.requested_department_name || request.requested_programme_name
              || (request.requested_department_id && !requestedDepartmentActive)
              || (request.requested_programme_id && !requestedProgrammeActive)
            );
            return (
              <article className="academic-correction-admin-card" key={request.id}>
                <div className="academic-correction-admin-card-head">
                  <div><span className="academic-kicker">REQUEST #{request.id}</span><h2>{request.student_name || 'Student account'}</h2><p>{request.email}{request.reg_no ? ` · ${request.reg_no}` : ''}</p></div>
                  <StatusPill status={request.status}/>
                </div>
                <div className="academic-correction-compare">
                  <div className="academic-correction-compare-column">
                    <span className="academic-correction-column-label">CURRENT RECORD</span>
                    <div><small>Department</small><strong>{request.current_department_name || 'Not assigned'}</strong></div>
                    <div><small>Degree programme</small><strong>{request.current_programme_name || 'Not assigned'}</strong></div>
                    <div><small>Level</small><strong>{request.current_level ? `${request.current_level} Level` : 'Not assigned'}</strong></div>
                  </div>
                  <div className="academic-correction-compare-arrow"><Icon name="arrowRight" size={20}/></div>
                  <div className="academic-correction-compare-column is-requested">
                    <span className="academic-correction-column-label">REQUESTED INFORMATION</span>
                    <div><small>Department</small><strong>{requestedDepartment}</strong></div>
                    <div><small>Degree programme</small><strong>{requestedProgramme}</strong></div>
                    <div><small>Level</small><strong>{request.requested_level} Level</strong></div>
                  </div>
                </div>
                <div className="academic-correction-reason"><strong>Student explanation</strong><p>{request.reason}</p></div>

                {request.status === 'pending' ? (
                  <>
                    <div className="academic-correction-mapping">
                      <div className="academic-correction-mapping-heading"><strong>Verify the destination record</strong><span>Confirm or map the requested names to active academic records.</span></div>
                      <div className="academic-correction-form-grid">
                        <div className="field">
                          <label htmlFor={`review-department-${request.id}`}>Verified department</label>
                          <select id={`review-department-${request.id}`} value={departmentId} onChange={(event) => updateMapping(request.id, 'department_id', event.target.value)}>
                            <option value="">Select active department</option>
                            {departments.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`review-programme-${request.id}`}>Verified degree programme</label>
                          <select id={`review-programme-${request.id}`} value={String(mapping.programme_id || '')} onChange={(event) => updateMapping(request.id, 'programme_id', event.target.value)} disabled={!departmentId}>
                            <option value="">Select degree programme</option>
                            {programmeOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
                          </select>
                        </div>
                      </div>
                      {requiresDirectoryMapping && <p className="academic-correction-mapping-note"><Icon name="info" size={16}/> The student entered an academic name that is not currently linked to a directory record. If it is valid, add the required <Link to="/admin/academics/structure/faculties">faculty</Link>, <Link to="/admin/academics/structure/departments">department</Link> or <Link to="/admin/academics/structure/programmes">degree programme</Link>, then return here and map it before approval.</p>}
                    </div>
                    <div className="academic-correction-review-actions">
                      <div className="field academic-correction-review-note"><label htmlFor={`review-note-${request.id}`}>Decision note <span className="optional">(required for rejection)</span></label><textarea id={`review-note-${request.id}`} rows="2" maxLength="1500" value={notes[request.id] || ''} onChange={(event) => setNotes((previous) => ({ ...previous, [request.id]: event.target.value }))} placeholder="Explain the decision or tell the student what needs to be corrected."/></div>
                      <div className="academic-correction-action-buttons">
                        <button type="button" className="btn btn-primary btn-small" disabled={busyId === request.id || !mappedDepartmentActive || !mappedProgrammeActive} onClick={() => decide(request, 'approved')}><Icon name="check" size={15}/>{busyId === request.id ? 'Saving…' : 'Approve & update profile'}</button>
                        <button type="button" className="btn btn-outline btn-small resource-reject-button" disabled={busyId === request.id} onClick={() => decide(request, 'rejected')}>Reject request</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="academic-correction-final-note">
                    <p><strong>Decision:</strong> {request.status === 'approved' ? 'Student academic information updated.' : 'Request rejected.'}</p>
                    {request.status === 'approved' && <p><strong>Verified record:</strong> {request.approved_department_name || requestedDepartment} · {request.approved_programme_name || requestedProgramme} · {request.approved_level || request.requested_level} Level</p>}
                    {request.decision_note && <p><strong>Administrator note:</strong> {request.decision_note}</p>}
                    <small>Reviewed {dateLabel(request.reviewed_at)}{request.reviewer_name ? ` by ${request.reviewer_name}` : ''}</small>
                  </div>
                )}
                <small className="academic-correction-submitted">Submitted {dateLabel(request.created_at)}</small>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
