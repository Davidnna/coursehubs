import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import '../academic.css';
import { getAdminResourceReports, getResourceFileUrl, moderateResource, resolveAdminResourceReport } from '../api/client';
import './resource-discovery.css';

export default function ResourceReports() {
  const [status, setStatus] = useState('open');
  const [reports, setReports] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true); setError('');
    try {
      const result = await getAdminResourceReports(status);
      setReports(Array.isArray(result.reports) ? result.reports : []);
    } catch (requestError) {
      setError(requestError.message || 'Resource reports could not be loaded.');
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, [status]);

  async function openFile(report) {
    setBusyId(report.report_id); setError('');
    try {
      const result = await getResourceFileUrl(report.resource_id, report.mime_type === 'application/pdf' ? 'preview' : 'download');
      window.location.assign(result.url);
    } catch (requestError) {
      setError(requestError.message || 'The reported resource could not be opened.');
      setBusyId(null);
    }
  }

  async function resolve(report, unpublish = false) {
    const note = (notes[report.report_id] || '').trim();
    setBusyId(report.report_id); setError(''); setNotice('');
    try {
      if (unpublish && report.resource_status === 'approved') {
        const moderationNote = note || 'Unpublished following administrator review of a community report.';
        await moderateResource(report.resource_id, { status: 'rejected', moderation_note: moderationNote });
      }
      await resolveAdminResourceReport(report.report_id, { resolution_note: note || (unpublish ? 'Resource unpublished following review.' : '') });
      setNotice(unpublish ? 'The resource was unpublished and the report was resolved.' : 'The report was marked as resolved.');
      await refresh();
    } catch (requestError) {
      setError(requestError.message || 'The report could not be updated.');
    } finally { setBusyId(null); }
  }

  return <main className="standard-page resource-reports-page">
    <div className="breadcrumb"><Link to="/dashboard">Administrator workspace</Link><Icon name="chevronRight" size={14}/>Resource reports</div>
    <div className="academic-page-heading"><div><span className="academic-kicker">COMMUNITY CONTENT REVIEW</span><h1>Resource reports</h1><p>Review concerns raised about published academic materials and decide whether they should remain in the library.</p></div><button type="button" className="btn btn-outline" onClick={refresh}><Icon name="refresh" size={16}/> Refresh reports</button></div>
    {notice && <div className="academic-alert academic-alert-success" role="status"><Icon name="checkCircle" size={17}/>{notice}</div>}
    {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={17}/>{error}</div>}
    <div className="resource-moderation-toolbar"><label htmlFor="resource-report-status">Show reports</label><select id="resource-report-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Awaiting review</option><option value="resolved">Resolved</option><option value="all">All reports</option></select><span>{reports.length} reports</span></div>
    {loading ? <div className="academic-loading" role="status"><span className="loading-spinner"/><p>Loading resource reports…</p></div> : reports.length === 0 ? <div className="resource-empty"><Icon name="flag" size={30}/><h2>No reports in this view</h2><p>Reports submitted by students and other members will appear here.</p></div> : <div className="resource-report-list">{reports.map((report) => <article className="resource-report-card" key={report.report_id}>
      <div className="resource-report-card-head"><span className="resource-file-symbol"><Icon name="flag" size={20}/></span><div className="resource-moderation-title"><strong>{report.resource_title}</strong><span>{report.course_code} — {report.course_title}</span></div><span className={`resource-status ${report.status === 'open' ? 'resource-status-pending' : 'resource-status-approved'}`}>{report.status}</span></div>
      <div className="resource-report-body"><p><strong>Reason reported:</strong> {report.reason}</p><span>Reported by {report.reporter_name} ({report.reporter_email}) · {new Date(report.created_at).toLocaleString()}</span><span>Resource status: {report.resource_deleted_at ? 'Deleted' : report.resource_status}</span>{report.resolution_note && <p className="resource-review-note"><strong>Resolution:</strong> {report.resolution_note}</p>}</div>
      <div className="resource-report-actions"><button type="button" className="btn btn-outline btn-small" disabled={busyId === report.report_id || Boolean(report.resource_deleted_at)} onClick={() => openFile(report)}><Icon name="eye" size={14}/> {report.resource_deleted_at ? 'Resource deleted' : 'Open resource'}</button>{report.status === 'open' && <Link className="btn btn-outline btn-small" to="/admin/resources">Open moderation</Link>}</div>
      {report.status === 'open' && <div className="resource-report-resolution"><label htmlFor={`report-note-${report.report_id}`}>Resolution note <span>(optional)</span></label><textarea id={`report-note-${report.report_id}`} rows="2" maxLength="1000" value={notes[report.report_id] || ''} onChange={(event) => setNotes((previous) => ({ ...previous, [report.report_id]: event.target.value }))} placeholder="Record what was checked or why the report was resolved."/><div className="resource-report-actions"><button type="button" className="btn btn-outline btn-small" disabled={busyId === report.report_id} onClick={() => resolve(report, false)}>Mark resolved</button>{report.resource_status === 'approved' && <button type="button" className="btn btn-primary btn-small" disabled={busyId === report.report_id} onClick={() => resolve(report, true)}>Unpublish and resolve</button>}</div></div>}
    </article>)}</div>}
  </main>;
}
