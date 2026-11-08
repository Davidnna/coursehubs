import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { getAdminResources, getResourceFileUrl, moderateResource } from '../api/client';
import '../academic.css';

function formatBytes(value) {
  const size = Number(value || 0);
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourceModeration() {
  const [status, setStatus] = useState('pending');
  const [resources, setResources] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const result = await getAdminResources(status);
      setResources(Array.isArray(result.resources) ? result.resources : []);
    } catch (requestError) {
      setError(requestError.message || 'The moderation queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [status]);

  async function openFile(resource, action) {
    setError('');
    try {
      const result = await getResourceFileUrl(resource.id, action);
      window.location.assign(result.url);
    } catch (requestError) {
      setError(requestError.message || 'The resource file could not be opened.');
    }
  }

  async function decide(resource, nextStatus) {
    const note = (notes[resource.id] || '').trim();
    if (nextStatus === 'rejected' && !note) {
      setError(`Add a review note before rejecting “${resource.title}”.`);
      return;
    }
    setBusyId(resource.id);
    setError('');
    setNotice('');
    try {
      await moderateResource(resource.id, { status: nextStatus, moderation_note: note });
      setNotice(nextStatus === 'approved' ? 'Resource approved and published.' : 'Resource rejected. The contributor can see your review note.');
      await refresh();
    } catch (requestError) {
      setError(requestError.message || 'The moderation decision could not be saved.');
    } finally {
      setBusyId(null);
    }
  }

  return <main className="standard-page resource-moderation-page">
    <div className="breadcrumb"><span>Administrator workspace</span><Icon name="chevronRight" size={14}/>Resource moderation</div>
    <div className="academic-page-heading"><div><span className="academic-kicker">ACADEMIC LIBRARY</span><h1>Resource moderation</h1><p>Review academic materials before they become visible to students.</p></div><button type="button" className="btn btn-outline" onClick={refresh}><Icon name="refresh" size={16}/> Refresh queue</button></div>
    {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={18}/>{error}</div>}
    {notice && <div className="resource-success" role="status"><Icon name="checkCircle" size={18}/>{notice}</div>}
    <div className="resource-moderation-toolbar"><label htmlFor="moderation-status">Show submissions</label><select id="moderation-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Awaiting review</option><option value="approved">Published</option><option value="rejected">Rejected</option><option value="all">All resources</option></select><span>{resources.length} records</span></div>
    {loading ? <div className="academic-loading" role="status"><span className="loading-spinner"/><p>Loading moderation queue…</p></div> : resources.length === 0 ? <div className="resource-empty"><Icon name="checkCircle" size={31}/><h2>Nothing to review</h2><p>There are no resources in this view. New contributor submissions will appear here.</p></div> : <div className="resource-moderation-list">{resources.map((resource) => <article className="resource-moderation-card" key={resource.id}>
      <div className="resource-moderation-card-top"><span className="resource-file-symbol"><Icon name={resource.type === 'past_question' ? 'fileQuestion' : resource.type === 'model_answer' ? 'checkCircle' : 'file'} size={21}/></span><div className="resource-moderation-title"><strong>{resource.title}</strong><span>{resource.course_code} — {resource.course_title}</span></div><span className={`resource-status resource-status-${resource.status}`}>{resource.status}</span></div>
      <div className="resource-moderation-meta"><span>{resource.uploader_name} · {resource.uploader_email}</span><span>{resource.session_name || 'General'} · {formatBytes(resource.file_size)} · {resource.original_filename}</span><span>Submitted {new Date(resource.created_at).toLocaleString()}</span></div>
      <div className="resource-moderation-actions"><button type="button" className="btn btn-outline btn-small" onClick={() => openFile(resource, resource.mime_type === 'application/pdf' ? 'preview' : 'download')}><Icon name="eye" size={15}/>{resource.mime_type === 'application/pdf' ? 'Preview PDF' : 'Download file'}</button>
        {resource.status !== 'approved' && <button type="button" className="btn btn-primary btn-small" disabled={busyId === resource.id} onClick={() => decide(resource, 'approved')}><Icon name="check" size={15}/> Approve</button>}
      </div>
      {resource.status === 'pending' && <div className="resource-reject-row"><label htmlFor={`moderation-note-${resource.id}`}>Review note (required for rejection)</label><textarea id={`moderation-note-${resource.id}`} rows="2" maxLength="1000" placeholder="Explain what needs correction before this resource can be published." value={notes[resource.id] || ''} onChange={(event) => setNotes((previous) => ({ ...previous, [resource.id]: event.target.value }))}/><button type="button" className="btn btn-outline btn-small resource-reject-button" disabled={busyId === resource.id} onClick={() => decide(resource, 'rejected')}>Reject submission</button></div>}
      {resource.status === 'rejected' && resource.moderation_note && <p className="resource-review-note"><strong>Review note:</strong> {resource.moderation_note}</p>}
    </article>)}</div>}
  </main>;
}
