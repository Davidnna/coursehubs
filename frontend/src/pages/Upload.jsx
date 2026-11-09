import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { createResource, getAcademicStructure, getCourseResources, getMyResources, getResourceAccess, getResourceCourses } from '../api/client';
import '../academic.css';

const resourceTypes = [
    { value: 'material', label: 'Course material' },
    { value: 'past_question', label: 'Past examination question' },
    { value: 'model_answer', label: 'Model answer' },
];

function formatBytes(value) {
    const size = Number(value || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status) {
    return status === 'approved' ? 'Published' : status === 'rejected' ? 'Needs changes' : 'Awaiting review';
}

export default function Upload() {
    const [access, setAccess] = useState(null);
    const [courses, setCourses] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [pastQuestions, setPastQuestions] = useState([]);
    const [courseScopeMessage, setCourseScopeMessage] = useState('');
    const [courseScope, setCourseScope] = useState('');
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ course_id: '', academic_session_id: '', title: '', type: 'material', answer_to_upload_id: '' });
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    async function refreshSubmissions() {
        const result = await getMyResources();
        setSubmissions(Array.isArray(result.submissions) ? result.submissions : []);
    }

    useEffect(() => {
        let active = true;
        Promise.all([getResourceAccess(), getAcademicStructure(), getResourceCourses(), getMyResources()])
            .then(([accessResult, structure, catalogue, mine]) => {
                if (!active) return;
                setAccess(accessResult);
                setSessions(Array.isArray(structure.sessions) ? structure.sessions : []);
                setCourses(Array.isArray(catalogue.courses) ? catalogue.courses : []);
                setCourseScopeMessage(catalogue.message || '');
                setCourseScope(catalogue.scope || '');
                setSubmissions(Array.isArray(mine.submissions) ? mine.submissions : []);
                const current = (structure.sessions || []).find((session) => Number(session.is_current) === 1 || session.is_current === true);
                const allowedTypes = Array.isArray(accessResult.allowed_types) ? accessResult.allowed_types : resourceTypes.map((type) => type.value);
                setForm((previous) => ({
                    ...previous,
                    academic_session_id: current ? String(current.id) : '',
                    type: allowedTypes.includes(previous.type) ? previous.type : (allowedTypes[0] || 'material'),
                }));
            })
            .catch((requestError) => { if (active) setError(requestError.message || 'The contribution workspace could not be loaded.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    const selectedCourse = useMemo(() => courses.find((course) => String(course.id) === form.course_id), [courses, form.course_id]);
    const allowedTypes = Array.isArray(access?.allowed_types) ? access.allowed_types : resourceTypes.map((type) => type.value);
    const visibleResourceTypes = resourceTypes.filter((type) => allowedTypes.includes(type.value));

    useEffect(() => {
        let active = true;
        if (form.type !== 'model_answer' || !form.course_id) { setPastQuestions([]); return undefined; }
        getCourseResources(form.course_id, 'past_question').then((result) => {
            if (active) setPastQuestions(Array.isArray(result.resources) ? result.resources : []);
        }).catch(() => { if (active) setPastQuestions([]); });
        return () => { active = false; };
    }, [form.type, form.course_id]);

    function update(field, value) {
        setForm((previous) => ({ ...previous, [field]: value, ...(field === 'course_id' || field === 'type' ? { answer_to_upload_id: '' } : {}) }));
        setError('');
        setSuccess('');
    }

    async function submit(event) {
        event.preventDefault();
        setError('');
        setSuccess('');
        if (!form.course_id || !form.title.trim() || !file) {
            setError('Choose a course, enter a resource title and attach a document.');
            return;
        }
        if (file.size > 25 * 1024 * 1024) {
            setError('The selected file is larger than 25 MB. Choose a smaller document.');
            return;
        }
        const payload = new FormData();
        payload.append('course_id', form.course_id);
        payload.append('academic_session_id', form.academic_session_id);
        payload.append('title', form.title.trim());
        payload.append('type', form.type);
        if (form.type === 'model_answer' && form.answer_to_upload_id) payload.append('answer_to_upload_id', form.answer_to_upload_id);
        payload.append('file', file);
        setBusy(true);
        try {
            const result = await createResource(payload);
            setSuccess(result.message || 'Your resource has been submitted.');
            setForm((previous) => ({ ...previous, title: '', type: 'material', answer_to_upload_id: '' }));
            setFile(null);
            const input = document.getElementById('resource-file');
            if (input) input.value = '';
            try { await refreshSubmissions(); } catch { /* The upload has succeeded; submission history can refresh on the next visit. */ }
        } catch (requestError) {
            setError(requestError.message || 'We could not submit this resource. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    return <main className="standard-page upload-page resource-upload-page">
        <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14} />Contribute resources</div>
        <div className="page-lead"><div className="page-eyebrow"><span className="eyebrow-line" /> GROW THE LIBRARY</div><h1>Share knowledge.<br /><span>Make it count.</span></h1><p>Submit course materials, past examination questions and model answers for the CourseHubs academic library.</p></div>
        {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={18} />{error}</div>}
        {success && <div className="resource-success" role="status"><Icon name="checkCircle" size={19} />{success}</div>}
        {loading ? <div className="academic-loading" role="status"><span className="loading-spinner" /><p>Preparing the contribution workspace…</p></div> : <div className="upload-grid">
            <section className="upload-form-card">
                <div className="form-card-heading"><div><span className="form-step">CONTRIBUTOR WORKSPACE</span><h2>Submit a resource</h2></div><span className="preview-label"><Icon name="shield" size={15} /> REVIEWED BEFORE PUBLICATION</span></div>
                {!access?.can_upload ? <div className="upload-locked-note"><Icon name="lock" size={19} /><span>{access?.message || 'Resource contributions are limited to approved course representatives, course advisers, lecturers and administrators. Contact CourseHubs support if you believe you should have access.'}{access?.account_type === 'student' && <> <Link to="/account#academic-information">Review or correct your academic information</Link>.</>}</span></div>
                    : !access?.storage_ready ? <div className="upload-locked-note"><Icon name="info" size={19} /><span>{access?.message || 'Resource uploads are temporarily unavailable. Please contact CourseHubs support.'}</span></div>
                        : <form className="upload-form-preview resource-upload-form" onSubmit={submit}>
                            <div className="field"><label htmlFor="resource-course">Course</label><select id="resource-course" required value={form.course_id} onChange={(event) => update('course_id', event.target.value)}><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}</select>{courses.length === 0 && <div className="academic-correction-upload-help"><small>{courseScopeMessage || 'No active courses are currently available for your academic profile.'}</small>{courseScope === 'student_department_level' && <><Link to="/account#academic-information">Review or correct your academic information <Icon name="arrowUpRight" size={14} /></Link><Link to="/contact">Report a missing course list <Icon name="arrowUpRight" size={14} /></Link></>}</div>}{courses.length > 0 && courseScope === 'student_department_level' && <small className="field-hint">Showing courses offered by your department for your current level in the active academic session.</small>}</div>
                            <div className="field"><label htmlFor="resource-session">Academic session</label><select id="resource-session" value={form.academic_session_id} onChange={(event) => update('academic_session_id', event.target.value)}><option value="">Not session-specific</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}{Number(session.is_current) === 1 || session.is_current === true ? ' · Current' : ''}</option>)}</select></div>
                            <div className="field"><label htmlFor="resource-title">Resource title</label><input id="resource-title" maxLength={200} required placeholder="e.g. Introduction to Data Structures — Lecture Notes" value={form.title} onChange={(event) => update('title', event.target.value)} /></div>
                            <div className="field"><label htmlFor="resource-type">Resource category</label><select id="resource-type" value={form.type} onChange={(event) => update('type', event.target.value)}>{visibleResourceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
                            {!access?.can_upload_assessments && <p className="resource-course-hint"><Icon name="info" size={15} /> Past questions and model answers are restricted to lecturers, course representatives and course advisers.</p>}
                            {form.type === 'model_answer' && <div className="field"><label htmlFor="resource-answer-to">Past question being answered <span className="optional">(optional)</span></label><select id="resource-answer-to" value={form.answer_to_upload_id} onChange={(event) => update('answer_to_upload_id', event.target.value)}><option value="">Not linked to a specific past question</option>{pastQuestions.map((question) => <option key={question.id} value={question.id}>{question.title}</option>)}</select><small className="field-hint">Only approved past questions for the selected course are listed.</small></div>}
                            <div className="field"><label htmlFor="resource-file">Attach document</label><div className="resource-file-drop"><span className="resource-file-icon"><Icon name="upload" size={25} /></span><strong>{file ? file.name : 'Choose a document to upload'}</strong><small>{file ? formatBytes(file.size) : 'PDF, DOCX or PPTX · Maximum 25 MB'}</small><input id="resource-file" type="file" accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" required onChange={(event) => setFile(event.target.files?.[0] || null)} /></div></div>
                            {selectedCourse && <p className="resource-course-hint"><Icon name="book" size={15} />{selectedCourse.code} will be the resource's course reference.</p>}
                            <button className="btn btn-primary" type="submit" disabled={busy || courses.length === 0}>{busy ? 'Submitting resource…' : 'Submit for review'} <Icon name="arrowRight" size={17} /></button>
                            <p className="upload-no-submit">Submissions are checked by CourseHubs administrators before appearing in the course library.</p>
                        </form>}
            </section>
            <aside className="upload-aside"><div className="guidelines-card"><div className="guidelines-icon"><Icon name="shield" size={22} /></div><h2>Good resources build a better library.</h2><p>Help students find accurate, useful academic materials.</p><div className="guideline"><span>01</span> Course materials and lecture notes</div><div className="guideline"><span>02</span> Past examination questions</div><div className="guideline"><span>03</span> Model answers linked to questions</div></div><div className="permission-card"><Icon name="info" size={21} /><div><strong>Publication is moderated</strong><p>Submitted resources remain private until an administrator approves them. Rejected submissions remain visible to you with the review note.</p><Link to="/catalog">Browse the course library <Icon name="arrowUpRight" size={16} /></Link></div></div></aside>
        </div>}
        <section className="resource-submissions"><div className="resource-section-heading"><div><span className="section-kicker">YOUR CONTRIBUTIONS</span><h2>My submissions</h2></div><span>{submissions.length} recent</span></div>
            {submissions.length === 0 ? <div className="resource-empty compact-resource-empty"><Icon name="file" size={25} /><strong>No submissions yet</strong><span>Your submitted resources and their review status will appear here.</span></div> : <div className="resource-submission-list">{submissions.map((item) => <article className="resource-submission-row" key={item.id}><span className="resource-file-symbol"><Icon name={item.type === 'past_question' ? 'fileQuestion' : item.type === 'model_answer' ? 'checkCircle' : 'file'} size={20} /></span><div className="resource-submission-copy"><strong>{item.title}</strong><span>{item.course_code} · {item.session_name || 'General resource'} · {formatBytes(item.file_size)}</span>{item.status === 'rejected' && item.moderation_note && <small>Review note: {item.moderation_note}</small>}</div><span className={`resource-status resource-status-${item.status}`}>{statusLabel(item.status)}</span></article>)}</div>}
        </section>
    </main>;
}
