import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import { getAdminWorkspaceContext } from '../auth/permissions';
import '../academic.css';
import './staff-management.css';
import {
    assignCourseAdviser,
    assignCourseRepresentative,
    assignLecturer,
    getStaffManagement,
    revokeCourseAdviser,
    revokeCourseRepresentative,
    revokeLecturer,
    searchAcademicStudents,
} from '../api/client';

const LEVELS = [100, 200, 300, 400, 500, 600];
const TABS = [
    { id: 'directory', label: 'Staff directory', icon: 'users' },
    { id: 'lecturers', label: 'Course lecturers', icon: 'book' },
    { id: 'representatives', label: 'Course representatives', icon: 'graduation' },
    { id: 'advisers', label: 'Course advisers', icon: 'school' },
    { id: 'history', label: 'Assignment history', icon: 'clock' },
];

function fullName(person) {
    return [person?.first_name, person?.middle_name, person?.surname].filter(Boolean).join(' ');
}

function dateLabel(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function Field({ label, children, hint }) {
    return <label className="staff-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function EmptyState({ icon = 'users', title, detail }) {
    return <div className="staff-empty"><Icon name={icon} size={28} /><strong>{title}</strong><p>{detail}</p></div>;
}

export default function StaffManagement() {
    const { user } = useAuth();
    const workspaceContext = getAdminWorkspaceContext(user);
    const departmentOnly = workspaceContext?.scopeType === 'department';
    const [activeTab, setActiveTab] = useState('directory');
    const [data, setData] = useState({
        staff: [], programmes: [], sessions: [], offerings: [],
        lecturer_assignments: [], representatives: [], advisers: [], history: [],
    });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [staffQuery, setStaffQuery] = useState('');
    const [lecturerForm, setLecturerForm] = useState({ course_offering_id: '', staff_user_id: '' });
    const [repSearch, setRepSearch] = useState('');
    const [studentResults, setStudentResults] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [searchingStudents, setSearchingStudents] = useState(false);
    const [repForm, setRepForm] = useState({ rep_type: 'primary', academic_session_id: '' });
    const [adviserForm, setAdviserForm] = useState({
        staff_user_id: '', programme_id: '', current_level: '100',
        academic_session_id: '', expected_graduation_session_id: '',
    });

    async function refresh({ quiet = false } = {}) {
        if (!quiet) setLoading(true);
        setError('');
        try {
            const result = await getStaffManagement();
            setData({
                staff: result.staff || [],
                programmes: result.programmes || [],
                sessions: result.sessions || [],
                offerings: result.offerings || [],
                lecturer_assignments: result.lecturer_assignments || [],
                representatives: result.representatives || [],
                advisers: result.advisers || [],
                history: result.history || [],
            });
        } catch (requestError) {
            setError(requestError.message || 'Staff and contributor records could not be loaded.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { refresh(); }, []);

    const currentSession = useMemo(
        () => data.sessions.find((session) => Boolean(Number(session.is_current))) || data.sessions.find((session) => !session.ended_at),
        [data.sessions],
    );

    useEffect(() => {
        if (!currentSession) return;
        setRepForm((previous) => ({ ...previous, academic_session_id: previous.academic_session_id || String(currentSession.id) }));
        setAdviserForm((previous) => ({
            ...previous,
            academic_session_id: previous.academic_session_id || String(currentSession.id),
            expected_graduation_session_id: previous.expected_graduation_session_id || String(currentSession.id),
        }));
    }, [currentSession]);

    const filteredStaff = useMemo(() => {
        const query = staffQuery.trim().toLowerCase();
        if (!query) return data.staff;
        return data.staff.filter((person) =>
            [fullName(person), person.staff_no, person.email, person.department_name]
                .filter(Boolean).join(' ').toLowerCase().includes(query),
        );
    }, [data.staff, staffQuery]);

    const openSessions = data.sessions.filter((session) => !session.ended_at);
    const activeRepresentatives = data.representatives.filter((item) => item.status === 'active');
    const activeAdvisers = data.advisers.filter((item) => item.status === 'active');

    async function runAction(action, successMessage) {
        setBusy(true); setError(''); setNotice('');
        try {
            await action();
            setNotice(successMessage);
            await refresh({ quiet: true });
            return true;
        } catch (requestError) {
            setError(requestError.message || 'The assignment could not be saved. Please try again.');
            return false;
        } finally {
            setBusy(false); setBusyId(null);
        }
    }

    async function handleLecturerAssignment(event) {
        event.preventDefault();
        if (!lecturerForm.course_offering_id || !lecturerForm.staff_user_id) {
            setError('Choose both a course and a lecturer.');
            return;
        }
        const saved = await runAction(
            () => assignLecturer({
                course_offering_id: Number(lecturerForm.course_offering_id),
                staff_user_id: Number(lecturerForm.staff_user_id),
            }),
            'Lecturer assigned to the course successfully.',
        );
        if (saved) setLecturerForm({ course_offering_id: '', staff_user_id: '' });
    }

    async function findStudents(event) {
        event.preventDefault();
        const query = repSearch.trim();
        if (query.length < 2) {
            setError('Enter at least two characters to search for a student.');
            return;
        }
        setSearchingStudents(true); setError(''); setStudentResults([]); setSelectedStudent(null);
        try {
            const result = await searchAcademicStudents(query);
            setStudentResults(result.students || []);
            if (!(result.students || []).length) setNotice('No eligible students matched that search.');
        } catch (requestError) {
            setError(requestError.message || 'Student search is temporarily unavailable.');
        } finally { setSearchingStudents(false); }
    }

    async function handleRepresentativeAssignment(event) {
        event.preventDefault();
        if (!selectedStudent || !repForm.academic_session_id) {
            setError('Search for and select an eligible student, then choose an academic session.');
            return;
        }
        const saved = await runAction(
            () => assignCourseRepresentative({
                student_user_id: Number(selectedStudent.id),
                rep_type: repForm.rep_type,
                academic_session_id: Number(repForm.academic_session_id),
            }),
            `${repForm.rep_type === 'primary' ? 'Primary' : 'Assistant'} course representative assigned successfully.`,
        );
        if (saved) { setSelectedStudent(null); setStudentResults([]); setRepSearch(''); }
    }

    async function handleAdviserAssignment(event) {
        event.preventDefault();
        if (!adviserForm.staff_user_id || !adviserForm.programme_id || !adviserForm.academic_session_id || !adviserForm.expected_graduation_session_id) {
            setError('Complete all course adviser assignment details.');
            return;
        }
        const saved = await runAction(
            () => assignCourseAdviser({
                staff_user_id: Number(adviserForm.staff_user_id),
                programme_id: Number(adviserForm.programme_id),
                current_level: Number(adviserForm.current_level),
                academic_session_id: Number(adviserForm.academic_session_id),
                expected_graduation_session_id: Number(adviserForm.expected_graduation_session_id),
            }),
            'Course adviser assigned to the student group successfully.',
        );
        if (saved) setAdviserForm((previous) => ({ ...previous, staff_user_id: '', programme_id: '' }));
    }

    async function revoke(kind, item) {
        const name = kind === 'lecturer'
            ? item.lecturer_name
            : kind === 'representative'
                ? fullName(item)
                : fullName(item);
        const message = kind === 'lecturer'
            ? `Remove ${name} from ${item.course_code}?`
            : kind === 'representative'
                ? `Revoke ${name}'s ${item.rep_type} representative assignment?`
                : `Revoke ${name}'s course adviser assignment for ${item.programme_name || 'this programme'}?`;
        if (!window.confirm(message)) return;
        setBusyId(item.assignment_id); setError(''); setNotice('');
        const actions = {
            lecturer: () => revokeLecturer(item.assignment_id),
            representative: () => revokeCourseRepresentative(item.assignment_id),
            adviser: () => revokeCourseAdviser(item.assignment_id),
        };
        await runAction(actions[kind], kind === 'lecturer' ? 'Lecturer removed from the course.' : kind === 'representative' ? 'Representative assignment revoked.' : 'Course adviser assignment revoked.');
    }

    return <main className="standard-page staff-management-page">
        <div className="breadcrumb"><span>{workspaceContext ? `${workspaceContext.shortLabel} workspace` : 'Administrator workspace'}</span><Icon name="chevronRight" size={14} />{workspaceContext?.scopeType === 'department' ? 'Department staff' : workspaceContext?.scopeType === 'faculty' ? 'Faculty staff' : workspaceContext?.scopeType === 'multiple' ? 'Academic unit staff' : 'Staff & contributors'}</div>
        <div className="academic-page-heading staff-management-heading">
            <div>
                <span className="academic-kicker">{workspaceContext ? `${workspaceContext.shortLabel.toUpperCase()} WORKSPACE` : 'ACADEMIC PEOPLE & RESPONSIBILITIES'}</span>
                <h1>{workspaceContext?.scopeType === 'department' ? 'Department staff & contributors' : workspaceContext?.scopeType === 'faculty' ? 'Faculty staff & contributors' : workspaceContext?.scopeType === 'multiple' ? 'Academic unit staff & contributors' : 'Staff & contributor management'}</h1>
                <p>{departmentOnly ? `Manage staff and student contributors for ${workspaceContext.scopeName}.` : workspaceContext?.scopeType === 'faculty' ? `Manage staff and student contributors across ${workspaceContext.scopeName}.` : workspaceContext?.scopeType === 'multiple' ? 'Manage staff and student contributors within your assigned academic units.' : 'Manage verified staff accounts and assign lecturers, course representatives and course advisers to their academic responsibilities.'}</p>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => refresh()} disabled={loading}><Icon name="refresh" size={16} /> Refresh records</button>
        </div>

        <div className="staff-management-summary">
            <article><span>Verified staff</span><strong>{data.staff.length}</strong><small>Active staff accounts</small></article>
            <article><span>Course lecturers</span><strong>{data.lecturer_assignments.length}</strong><small>Linked teaching assignments</small></article>
            <article><span>Course representatives</span><strong>{activeRepresentatives.length}</strong><small>Active student representatives</small></article>
            <article><span>Course advisers</span><strong>{activeAdvisers.length}</strong><small>Active cohort assignments</small></article>
        </div>

        {notice && <div className="academic-alert academic-alert-success" role="status"><Icon name="checkCircle" size={17} />{notice}</div>}
        {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={17} />{error}</div>}

        <div className="staff-management-tabs" role="group" aria-label="Staff management sections">
            {TABS.map((tab) => <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} aria-controls={`staff-panel-${tab.id}`} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => { setActiveTab(tab.id); setError(''); setNotice(''); }}>
                <Icon name={tab.icon} size={17} /><span>{tab.label}</span>
                {tab.id === 'lecturers' && <small>{data.lecturer_assignments.length}</small>}
                {tab.id === 'representatives' && <small>{activeRepresentatives.length}</small>}
                {tab.id === 'advisers' && <small>{activeAdvisers.length}</small>}
            </button>)}
        </div>

        {loading ? <div className="academic-loading" role="status"><span className="loading-spinner" /><p>Loading staff and contributor records…</p></div> : <>
            <section className="staff-management-panel" id={`staff-panel-${activeTab}`} role="region" aria-label={`${TABS.find((tab) => tab.id === activeTab)?.label || "Staff management"} section`}>
                {activeTab === 'directory' && <>
                    <div className="staff-panel-heading"><div><h2>Verified staff directory</h2><p>Staff accounts must be registered and email-verified before they can receive academic assignments.</p></div><span className="staff-record-count">{filteredStaff.length} staff</span></div>
                    <div className="staff-search-row"><Icon name="search" size={18} /><input type="search" value={staffQuery} onChange={(event) => setStaffQuery(event.target.value)} placeholder={departmentOnly ? 'Search by name, staff number or email' : 'Search by name, staff number, email or department'} aria-label="Search staff directory" /></div>
                    {filteredStaff.length === 0 ? <EmptyState title="No matching staff accounts" detail="Verified and active staff accounts will appear here." /> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Staff member</th><th>Staff number</th>{!departmentOnly && <th>Department</th>}<th>Course assignments</th><th>Adviser groups</th></tr></thead><tbody>{filteredStaff.map((person) => <tr key={person.id}><td><strong>{fullName(person)}</strong><small>{person.email}</small></td><td>{person.staff_no || '—'}</td>{!departmentOnly && <td>{person.department_name || 'Not specified'}</td>}<td>{Number(person.lecturer_course_count || 0)}</td><td>{Number(person.active_adviser_count || 0)}</td></tr>)}</tbody></table></div>}
                </>}

                {activeTab === 'lecturers' && <>
                    <div className="staff-panel-heading"><div><h2>Assign lecturers to courses</h2><p>Select a verified staff member and the specific course they will teach in an open academic session.</p></div></div>
                    <form className="staff-assignment-form" onSubmit={handleLecturerAssignment}>
                        <Field label="Course and degree programme">
                            <select required value={lecturerForm.course_offering_id} onChange={(event) => setLecturerForm((previous) => ({ ...previous, course_offering_id: event.target.value }))}>
                                <option value="">Choose a course assignment</option>
                                {data.offerings.map((item) => <option key={item.id} value={item.id}>{item.course_code} — {item.course_title} · {item.programme_name || 'General'} · {item.level} Level · {item.semester} Semester · {item.session_name}</option>)}
                            </select>
                        </Field>
                        <Field label="Lecturer">
                            <select required value={lecturerForm.staff_user_id} onChange={(event) => setLecturerForm((previous) => ({ ...previous, staff_user_id: event.target.value }))}>
                                <option value="">Choose a verified staff member</option>
                                {data.staff.map((person) => <option key={person.id} value={person.id}>{fullName(person)} · {person.staff_no}</option>)}
                            </select>
                        </Field>
                        <button className="btn btn-primary" type="submit" disabled={busy || !data.offerings.length || !data.staff.length}><Icon name="plus" size={16} /> {busy ? 'Saving assignment…' : 'Assign lecturer'}</button>
                    </form>
                    <div className="staff-list-heading"><h3>Current lecturer assignments</h3><span>{data.lecturer_assignments.length} assignments</span></div>
                    {data.lecturer_assignments.length === 0 ? <EmptyState icon="book" title="No linked lecturer assignments" detail="Assign a verified staff member to a course using the form above." /> : <div className="staff-assignment-list">{data.lecturer_assignments.map((item) => <article className="staff-assignment-card" key={item.assignment_id}>
                        <div className="staff-assignment-icon"><Icon name="book" size={19} /></div>
                        <div className="staff-assignment-copy"><strong>{item.course_code} — {item.course_title}</strong><span>{item.programme_name || 'General'} · {item.level} Level · {item.semester} Semester · {item.session_name}</span><small>{item.lecturer_name} · {item.staff_no || item.email}</small></div>
                        <button type="button" className="btn btn-outline btn-small staff-revoke-button" disabled={busy || busyId === item.assignment_id} onClick={() => revoke('lecturer', item)}><Icon name="trash" size={14} /> Remove</button>
                    </article>)}</div>}
                </>}

                {activeTab === 'representatives' && <>
                    <div className="staff-panel-heading"><div><h2>Course representatives</h2><p>Assign a primary or assistant representative to a student's current degree programme and level. The assignment follows the student's academic profile as they progress.</p></div><span className="staff-record-count">{activeRepresentatives.length} active</span></div>
                    <form className="staff-student-search" onSubmit={findStudents}>
                        <Field label="Find a student" hint="Search using their name, registration number or email. Only verified students with a degree programme and level are eligible.">
                            <div className="staff-inline-search"><input value={repSearch} onChange={(event) => setRepSearch(event.target.value)} placeholder="e.g. 2023/CSC/001 or student's name" /><button type="submit" className="btn btn-outline" disabled={searchingStudents}><Icon name="search" size={16} />{searchingStudents ? 'Searching…' : 'Search'}</button></div>
                        </Field>
                        {studentResults.length > 0 && <div className="staff-student-results" role="listbox" aria-label="Matching students">{studentResults.map((student) => <button type="button" role="option" aria-selected={selectedStudent?.id === student.id} key={student.id} className={selectedStudent?.id === student.id ? 'is-selected' : ''} onClick={() => setSelectedStudent(student)}>
                            <span><strong>{fullName(student)}</strong><small>{student.reg_no} · {student.programme_name} · {student.level} Level</small></span><Icon name={selectedStudent?.id === student.id ? 'checkCircle' : 'plus'} size={17} />
                        </button>)}</div>}
                        {selectedStudent && <div className="staff-selected-student"><Icon name="checkCircle" size={17} /><span><strong>{fullName(selectedStudent)}</strong><small>{selectedStudent.reg_no} · {selectedStudent.programme_name} · {selectedStudent.level} Level</small></span><button type="button" className="staff-text-button" onClick={() => setSelectedStudent(null)}>Change</button></div>}
                    </form>
                    <form className="staff-assignment-form staff-assignment-form-compact" onSubmit={handleRepresentativeAssignment}>
                        <Field label="Representative role"><select value={repForm.rep_type} onChange={(event) => setRepForm((previous) => ({ ...previous, rep_type: event.target.value }))}><option value="primary">Primary representative</option><option value="assistant">Assistant representative</option></select></Field>
                        <Field label="Academic session"><select required value={repForm.academic_session_id} onChange={(event) => setRepForm((previous) => ({ ...previous, academic_session_id: event.target.value }))}><option value="">Choose session</option>{openSessions.map((session) => <option key={session.id} value={session.id}>{session.name}{Number(session.is_current) ? ' · Current' : ''}</option>)}</select></Field>
                        <button className="btn btn-primary" type="submit" disabled={busy || !selectedStudent}><Icon name="plus" size={16} /> Assign representative</button>
                    </form>
                    <div className="staff-list-heading"><h3>Representative assignments</h3><span>{data.representatives.length} records</span></div>
                    {data.representatives.length === 0 ? <EmptyState icon="graduation" title="No representatives assigned" detail="Course representative assignments will appear here." /> : <div className="staff-assignment-list">{data.representatives.map((item) => <article className={`staff-assignment-card ${item.status !== 'active' ? 'is-inactive' : ''}`} key={item.assignment_id}>
                        <div className="staff-assignment-icon"><Icon name="graduation" size={19} /></div>
                        <div className="staff-assignment-copy"><strong>{fullName(item)} <span className={`staff-role-tag ${item.rep_type}`}>{item.rep_type}</span></strong><span>{item.programme_name || 'Programme not set'} · {item.level || '—'} Level · {item.session_name}</span><small>{item.reg_no} · {item.department_name || 'Department not set'}</small></div>
                        <span className={`staff-state ${item.status}`}>{item.status}</span>
                        {item.status === 'active' && <button type="button" className="btn btn-outline btn-small staff-revoke-button" disabled={busy || busyId === item.assignment_id} onClick={() => revoke('representative', item)}><Icon name="trash" size={14} /> Revoke</button>}
                    </article>)}</div>}
                </>}

                {activeTab === 'advisers' && <>
                    <div className="staff-panel-heading"><div><h2>Course advisers</h2><p>Assign a verified staff member to advise a specific degree programme and level cohort, with an expected graduation session.</p></div><span className="staff-record-count">{activeAdvisers.length} active</span></div>
                    <form className="staff-assignment-form staff-adviser-form" onSubmit={handleAdviserAssignment}>
                        <Field label="Staff adviser"><select required value={adviserForm.staff_user_id} onChange={(event) => setAdviserForm((previous) => ({ ...previous, staff_user_id: event.target.value }))}><option value="">Choose a verified staff member</option>{data.staff.map((person) => <option key={person.id} value={person.id}>{fullName(person)} · {person.staff_no}</option>)}</select></Field>
                        <Field label="Degree programme"><select required value={adviserForm.programme_id} onChange={(event) => setAdviserForm((previous) => ({ ...previous, programme_id: event.target.value }))}><option value="">Choose a degree programme</option>{data.programmes.map((programme) => <option key={programme.id} value={programme.id}>{programme.name} · {programme.department_name}</option>)}</select></Field>
                        <Field label="Current student level"><select required value={adviserForm.current_level} onChange={(event) => setAdviserForm((previous) => ({ ...previous, current_level: event.target.value }))}>{LEVELS.map((level) => <option key={level} value={level}>{level} Level</option>)}</select></Field>
                        <Field label="Assignment academic session"><select required value={adviserForm.academic_session_id} onChange={(event) => setAdviserForm((previous) => ({ ...previous, academic_session_id: event.target.value }))}><option value="">Choose session</option>{openSessions.map((session) => <option key={session.id} value={session.id}>{session.name}{Number(session.is_current) ? ' · Current' : ''}</option>)}</select></Field>
                        <Field label="Expected graduation session"><select required value={adviserForm.expected_graduation_session_id} onChange={(event) => setAdviserForm((previous) => ({ ...previous, expected_graduation_session_id: event.target.value }))}><option value="">Choose graduation session</option>{data.sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</select></Field>
                        <button className="btn btn-primary" type="submit" disabled={busy || !data.staff.length || !data.programmes.length}><Icon name="plus" size={16} /> Assign course adviser</button>
                    </form>
                    <div className="staff-list-heading"><h3>Course adviser assignments</h3><span>{data.advisers.length} records</span></div>
                    {data.advisers.length === 0 ? <EmptyState icon="school" title="No course advisers assigned" detail="Course adviser assignments will appear here." /> : <div className="staff-assignment-list">{data.advisers.map((item) => <article className={`staff-assignment-card ${item.status !== 'active' ? 'is-inactive' : ''}`} key={item.assignment_id}>
                        <div className="staff-assignment-icon"><Icon name="school" size={19} /></div>
                        <div className="staff-assignment-copy"><strong>{fullName(item)}</strong><span>{item.programme_name || 'Legacy assignment without a degree programme'} · {item.current_level} Level · {item.session_name}</span><small>{item.staff_no} · Expected graduation: {item.graduation_session_name}</small></div>
                        <span className={`staff-state ${item.status}`}>{item.status}</span>
                        {item.status === 'active' && <button type="button" className="btn btn-outline btn-small staff-revoke-button" disabled={busy || busyId === item.assignment_id} onClick={() => revoke('adviser', item)}><Icon name="trash" size={14} /> Revoke</button>}
                    </article>)}</div>}
                </>}

                {activeTab === 'history' && <>
                    <div className="staff-panel-heading"><div><h2>Assignment history</h2><p>Every assignment and revocation is recorded for accountability. Historical records are retained when responsibilities change.</p></div><span className="staff-record-count">{data.history.length} recent events</span></div>
                    {data.history.length === 0 ? <EmptyState icon="clock" title="No assignment history yet" detail="Changes to lecturer, representative and adviser assignments will be recorded here." /> : <div className="staff-history-list">{data.history.map((item) => <article className="staff-history-item" key={item.id}>
                        <span className={`staff-history-symbol ${item.action}`}><Icon name={item.action === 'assigned' ? 'plus' : 'archive'} size={16} /></span>
                        <div><strong>{item.assigned_name}</strong><span>{item.assignment_type.replace('_', ' ')} · {item.action}</span><small>By {item.changed_by_name} · {dateLabel(item.created_at)}</small></div>
                    </article>)}</div>}
                </>}
            </section>
            <p className="staff-management-footnote"><Icon name="info" size={15} /> Staff accounts are created through the normal CourseHubs registration process. This page controls academic responsibilities; removing an assignment does not delete or suspend the person's account.</p>
        </>}
    </main>;
}
