import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import '../academic.css';
import {
  archiveCourseOffering,
  createAcademicSession,
  createCourse,
  createCourseOffering,
  createDepartment,
  createFaculty,
  createProgramme,
  getAcademicOverview,
  getAcademicStaff,
  getAdminAcademicSessions,
  getAdminAcademicStructure,
  getAdminCourses,
  getAdminOfferings,
  updateAcademicSession,
  updateCourse,
  updateCourseOffering,
  updateDepartment,
  updateFaculty,
  updateProgramme,
} from '../api/client';

const TOP_TABS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'structure', label: 'Structure', icon: 'school' },
  { id: 'sessions', label: 'Sessions', icon: 'calendar' },
  { id: 'courses', label: 'Courses', icon: 'book' },
  { id: 'offerings', label: 'Course offerings', icon: 'list' },
];
const LEVELS = [100, 200, 300, 400, 500, 600];
const SEMESTERS = ['First', 'Second'];
const COURSE_TYPES = ['Compulsory', 'Elective'];

const STRUCTURE_FORM_KEYS = {
  faculties: 'faculty',
  departments: 'department',
  programmes: 'programme',
};

const EMPTY = {
  faculty: { name: '', code: '', description: '' },
  department: { faculty_id: '', name: '', code: '', description: '' },
  programme: { department_id: '', name: '', code: '', award: 'Bachelor of Science', duration_years: '4', description: '' },
  session: { name: '' },
  course: { department_id: '', current_code: '', title: '', description: '', is_university_wide: false },
  offering: { course_id: '', programme_id: '', level: '100', academic_session_id: '', semester: 'First', course_type: 'Compulsory', credit_units: '3', exam_date: '', lecturer_user_ids: [], lecturer_names: '' },
};

function getFormKey(tab, structureTab) {
  if (tab === 'structure') return STRUCTURE_FORM_KEYS[structureTab] || 'faculty';
  if (tab === 'sessions') return 'session';
  if (tab === 'courses') return 'course';
  if (tab === 'offerings') return 'offering';
  return 'faculty';
}

function createEmptyForm(key) {
  const template = EMPTY[key] || EMPTY.faculty;
  return { ...template, ...(key === 'offering' ? { lecturer_user_ids: [] } : {}) };
}

const ACADEMIC_ROOT = '/admin/academics';

function academicPathForTab(tab, structureTab = 'faculties') {
  if (tab === 'structure') return `${ACADEMIC_ROOT}/structure/${structureTab}`;
  return `${ACADEMIC_ROOT}/${tab}`;
}

function resolveAcademicRoute(pathname) {
  const relative = pathname.replace(/^\/admin\/academics\/?/, '').replace(/\/+$/, '');
  if (!relative || relative === 'overview') return { tab: 'overview', structureTab: 'faculties', basePath: `${ACADEMIC_ROOT}/overview`, action: 'list' };

  const structureMatch = relative.match(/^structure\/(faculties|departments|programmes)(?:\/(new|([0-9]+)\/edit))?$/);
  if (structureMatch) {
    const structureTab = structureMatch[1];
    const actionSegment = structureMatch[2] || '';
    return {
      tab: 'structure',
      structureTab,
      recordType: ({ faculties: 'faculty', departments: 'department', programmes: 'programme' })[structureTab],
      recordId: structureMatch[3] || null,
      action: actionSegment === 'new' ? 'new' : structureMatch[3] ? 'edit' : 'list',
      basePath: `${ACADEMIC_ROOT}/structure/${structureTab}`,
    };
  }

  const sectionMatch = relative.match(/^(sessions|courses|offerings)(?:\/(new|([0-9]+)\/edit))?$/);
  if (sectionMatch) {
    const tab = sectionMatch[1];
    const actionSegment = sectionMatch[2] || '';
    return {
      tab,
      structureTab: 'faculties',
      recordType: tab === 'courses' ? 'course' : tab === 'offerings' ? 'offering' : null,
      recordId: sectionMatch[3] || null,
      action: actionSegment === 'new' ? 'new' : sectionMatch[3] ? 'edit' : 'list',
      basePath: `${ACADEMIC_ROOT}/${tab}`,
    };
  }

  return { tab: 'overview', structureTab: 'faculties', basePath: `${ACADEMIC_ROOT}/overview`, action: 'list', invalid: true };
}

function formForRecord(type, item) {
  if (type === 'faculty') return { name: item.name, code: item.code, description: item.description || '' };
  if (type === 'department') return { faculty_id: String(item.faculty_id), name: item.name, code: item.code, description: item.description || '' };
  if (type === 'programme') return { department_id: String(item.department_id), name: item.name, code: item.code, award: item.award || 'Bachelor of Science', duration_years: String(item.duration_years || 4), description: item.description || '' };
  if (type === 'course') return { department_id: String(item.department_id || ''), current_code: item.current_code, title: item.title, description: item.description || '', is_university_wide: Boolean(item.is_university_wide) };
  if (type === 'offering') return {
    course_id: String(item.course_id), programme_id: String(item.programme_id || ''), level: String(item.level),
    academic_session_id: String(item.academic_session_id), semester: item.semester, course_type: item.course_type,
    credit_units: String(item.credit_units), exam_date: item.exam_date || '',
    lecturer_user_ids: (item.lecturers || []).filter((lecturer) => lecturer.lecturer_user_id).map((lecturer) => String(lecturer.lecturer_user_id)),
    lecturer_names: (item.lecturers || []).filter((lecturer) => !lecturer.lecturer_user_id).map((lecturer) => lecturer.lecturer_name).join(', '),
  };
  return createEmptyForm(getFormKey('structure', 'faculties'));
}

function recordForRoute(route, data) {
  if (!route.recordId || !route.recordType) return null;
  const id = Number(route.recordId);
  if (route.recordType === 'faculty') return data.structure.faculties.find((item) => Number(item.id) === id);
  if (route.recordType === 'department') return data.structure.departments.find((item) => Number(item.id) === id);
  if (route.recordType === 'programme') return data.structure.programmes.find((item) => Number(item.id) === id);
  if (route.recordType === 'course') return data.courses.find((item) => Number(item.id) === id);
  if (route.recordType === 'offering') return data.offerings.find((item) => Number(item.id) === id);
  return null;
}

function Field({ label, children, hint }) {
  return <label className="academic-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Status({ active }) {
  return <span className={`academic-status ${active ? 'is-active' : 'is-archived'}`}>{active ? 'Active' : 'Archived'}</span>;
}

function Empty({ title, detail }) {
  return <div className="academic-empty"><Icon name="school" size={25}/><strong>{title}</strong><p>{detail}</p></div>;
}

export default function AcademicManagement() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = resolveAcademicRoute(location.pathname);
  const { tab, structureTab } = route;
  const editing = route.recordId ? { type: route.recordType, id: Number(route.recordId) } : null;
  const [data, setData] = useState({ overview: null, structure: { faculties: [], departments: [], programmes: [] }, sessions: [], courses: [], offerings: [], staff: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(() => createEmptyForm(getFormKey(tab, structureTab)));

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overview, structure, sessions, courses, offerings, staff] = await Promise.all([
        getAcademicOverview(), getAdminAcademicStructure(), getAdminAcademicSessions(),
        getAdminCourses(), getAdminOfferings(), getAcademicStaff(),
      ]);
      setData({
        overview,
        structure: structure || { faculties: [], departments: [], programmes: [] },
        sessions: sessions.sessions || [],
        courses: courses.courses || [],
        offerings: offerings.offerings || [],
        staff: staff.staff || [],
      });
    } catch (requestError) {
      setError(requestError.message || 'Academic records could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const currentFormKey = getFormKey(tab, structureTab);

  useEffect(() => {
    setError('');
    setNotice(location.state?.notice || '');
    if (!route.recordId) setForm(createEmptyForm(currentFormKey));
  }, [location.pathname, location.state, currentFormKey, route.recordId]);

  useEffect(() => {
    if (!route.recordId || loading) return;
    const item = recordForRoute(route, data);
    if (!item) {
      setError('That academic record could not be found. Return to the directory and try again.');
      return;
    }
    setForm(formForRecord(route.recordType, item));
  }, [location.pathname, loading, data, route.recordId, route.recordType]);

  function setValue(key, value) { setForm((current) => ({ ...current, [key]: value })); }

  function beginEdit(type, item) {
    const path = type === 'faculty' || type === 'department' || type === 'programme'
      ? `${ACADEMIC_ROOT}/structure/${type === 'faculty' ? 'faculties' : `${type}s`}/${item.id}/edit`
      : `${ACADEMIC_ROOT}/${type === 'course' ? 'courses' : 'offerings'}/${item.id}/edit`;
    navigate(path);
  }

  function cancelEdit() {
    navigate(route.basePath, { replace: true });
  }

  async function submitForm(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      let message = 'Academic record saved.';
      if (tab === 'structure' && structureTab === 'faculties') {
        const payload = { name: form.name, code: form.code, description: form.description };
        if (editing) await updateFaculty(editing.id, payload); else await createFaculty(payload);
        message = editing ? 'Faculty updated.' : 'Faculty created.';
      } else if (tab === 'structure' && structureTab === 'departments') {
        const payload = { ...form, faculty_id: Number(form.faculty_id) };
        if (editing) await updateDepartment(editing.id, payload); else await createDepartment(payload);
        message = editing ? 'Department updated.' : 'Department created.';
      } else if (tab === 'structure' && structureTab === 'programmes') {
        const payload = { ...form, department_id: Number(form.department_id), duration_years: Number(form.duration_years) };
        if (editing) await updateProgramme(editing.id, payload); else await createProgramme(payload);
        message = editing ? 'Programme updated.' : 'Programme created.';
      } else if (tab === 'sessions') {
        await createAcademicSession({ name: form.name });
        message = 'Academic session created.';
      } else if (tab === 'courses') {
        const payload = { ...form, department_id: form.is_university_wide ? null : Number(form.department_id), is_university_wide: Boolean(form.is_university_wide) };
        if (editing) await updateCourse(editing.id, payload); else await createCourse(payload);
        message = editing ? 'Course updated.' : 'Course created.';
      } else if (tab === 'offerings') {
        const customLecturers = String(form.lecturer_names || '').split(',').map((name) => name.trim()).filter(Boolean).map((name) => ({ name }));
        const linkedLecturers = (form.lecturer_user_ids || []).map((userId) => ({ user_id: Number(userId) }));
        const payload = {
          course_id: Number(form.course_id), programme_id: Number(form.programme_id), level: Number(form.level),
          academic_session_id: Number(form.academic_session_id), semester: form.semester, course_type: form.course_type,
          credit_units: Number(form.credit_units), exam_date: form.exam_date || null,
          lecturers: [...linkedLecturers, ...customLecturers],
        };
        if (editing) await updateCourseOffering(editing.id, payload); else await createCourseOffering(payload);
        message = editing ? 'Course offering updated.' : 'Course offering created.';
      }
      await refresh();
      if (route.action !== 'list') {
        navigate(route.basePath, { replace: true, state: { notice: message } });
      } else {
        setForm(createEmptyForm(currentFormKey));
        setNotice(message);
      }
    } catch (requestError) {
      setError(requestError.message || 'The academic record could not be saved. Please review the information and try again.');
    } finally { setSaving(false); }
  }

  async function toggleActive(type, item) {
    const next = !Boolean(item.is_active);
    const label = item.name || item.title || item.current_code;
    if (!window.confirm(`${next ? 'Reactivate' : 'Archive'} ${label}?`)) return;
    setError(''); setNotice('');
    try {
      const payload = { name: item.name, code: item.code, description: item.description || '', is_active: next };
      if (type === 'faculty') await updateFaculty(item.id, payload);
      if (type === 'department') await updateDepartment(item.id, { ...payload, faculty_id: Number(item.faculty_id) });
      if (type === 'programme') await updateProgramme(item.id, { ...payload, department_id: Number(item.department_id), award: item.award, duration_years: Number(item.duration_years) });
      if (type === 'course') await updateCourse(item.id, { current_code: item.current_code, title: item.title, description: item.description || '', department_id: item.is_university_wide ? null : Number(item.department_id), is_university_wide: Boolean(item.is_university_wide), is_active: next });
      setNotice(next ? 'Record reactivated.' : 'Record archived.');
      await refresh();
    } catch (requestError) { setError(requestError.message || 'That record could not be updated.'); }
  }

  async function makeCurrent(session) {
    setError(''); setNotice('');
    try {
      await updateAcademicSession(session.id, { name: session.name, is_current: true });
      setNotice(`${session.name} is now the current academic session.`);
      await refresh();
    } catch (requestError) { setError(requestError.message || 'The current session could not be changed.'); }
  }

  async function closeSession(session) {
    if (!window.confirm(`Close ${session.name}? It will no longer be the current session.`)) return;
    setError(''); setNotice('');
    try {
      await updateAcademicSession(session.id, { name: session.name, is_current: false });
      setNotice(`${session.name} has been closed.`);
      await refresh();
    } catch (requestError) { setError(requestError.message || 'The academic session could not be closed.'); }
  }

  async function archiveOffering(item) {
    if (!window.confirm(`Archive ${item.current_code} for ${item.session_name}?`)) return;
    try {
      await archiveCourseOffering(item.id);
      setNotice('Course offering archived.');
      await refresh();
    } catch (requestError) { setError(requestError.message || 'The course offering could not be archived.'); }
  }

  const { faculties, departments, programmes } = data.structure;
  const activeFaculties = faculties.filter((item) => item.is_active);
  const activeDepartments = departments.filter((item) => item.is_active);
  const activeProgrammes = programmes.filter((item) => item.is_active);
  const activeCourses = data.courses.filter((item) => item.is_active);
  const currentSession = data.overview?.current_session;

  function renderStructureForm() {
    if (structureTab === 'faculties') return <form className="academic-form" onSubmit={submitForm}>
      <div className="academic-form-heading"><div><span className="academic-kicker">ACADEMIC STRUCTURE</span><h3>{editing ? 'Edit faculty' : 'Add a faculty'}</h3><p>Faculties are the top level of the institution's academic structure.</p></div></div>
      <div className="academic-form-grid"><Field label="Faculty name"><input required maxLength="160" value={form.name} onChange={(e) => setValue('name', e.target.value)} placeholder="e.g. Faculty of Science"/></Field><Field label="Faculty code"><input required maxLength="24" value={form.code} onChange={(e) => setValue('code', e.target.value.toUpperCase())} placeholder="e.g. SCI"/></Field><Field label="Description"><textarea rows="2" value={form.description} onChange={(e) => setValue('description', e.target.value)} placeholder="Optional faculty description"/></Field></div>
      <FormActions editing={editing} showCancel={route.action === 'new'} saving={saving} onCancel={cancelEdit}/>
    </form>;
    if (structureTab === 'departments') return <form className="academic-form" onSubmit={submitForm}>
      <div className="academic-form-heading"><div><span className="academic-kicker">ACADEMIC STRUCTURE</span><h3>{editing ? 'Edit department' : 'Add a department'}</h3><p>Every department belongs to one faculty.</p></div></div>
      <div className="academic-form-grid"><Field label="Faculty"><select required value={form.faculty_id} onChange={(e) => setValue('faculty_id', e.target.value)}><option value="">Select faculty</option>{activeFaculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Department name"><input required maxLength="160" value={form.name} onChange={(e) => setValue('name', e.target.value)} placeholder="e.g. Computer Science"/></Field><Field label="Department code"><input required maxLength="24" value={form.code} onChange={(e) => setValue('code', e.target.value.toUpperCase())} placeholder="e.g. CSC"/></Field><Field label="Description"><textarea rows="2" value={form.description} onChange={(e) => setValue('description', e.target.value)} placeholder="Optional department description"/></Field></div>
      <FormActions editing={editing} showCancel={route.action === 'new'} saving={saving} onCancel={cancelEdit}/>
    </form>;
    return <form className="academic-form" onSubmit={submitForm}>
      <div className="academic-form-heading"><div><span className="academic-kicker">ACADEMIC STRUCTURE</span><h3>{editing ? 'Edit programme' : 'Add a programme'}</h3><p>Programmes define the course of study within a department.</p></div></div>
      <div className="academic-form-grid"><Field label="Department"><select required value={form.department_id} onChange={(e) => setValue('department_id', e.target.value)}><option value="">Select department</option>{activeDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Programme name"><input required maxLength="160" value={form.name} onChange={(e) => setValue('name', e.target.value)} placeholder="e.g. Computer Science"/></Field><Field label="Programme code"><input required maxLength="24" value={form.code} onChange={(e) => setValue('code', e.target.value.toUpperCase())} placeholder="e.g. BSC-CS"/></Field><Field label="Qualification"><input required maxLength="80" value={form.award} onChange={(e) => setValue('award', e.target.value)} placeholder="Bachelor of Science"/></Field><Field label="Duration (years)"><input type="number" min="1" max="10" required value={form.duration_years} onChange={(e) => setValue('duration_years', e.target.value)}/></Field><Field label="Description"><textarea rows="2" value={form.description} onChange={(e) => setValue('description', e.target.value)} placeholder="Optional programme description"/></Field></div>
      <FormActions editing={editing} showCancel={route.action === 'new'} saving={saving} onCancel={cancelEdit}/>
    </form>;
  }

  function renderStructureList() {
    if (structureTab === 'faculties') return <div className="academic-record-list">{faculties.map((item) => <article className="academic-record" key={item.id}><div className="academic-record-icon"><Icon name="building"/></div><div className="academic-record-main"><strong>{item.name}</strong><span>{item.code} · {item.department_count} departments</span></div><Status active={item.is_active}/><div className="academic-record-actions"><button type="button" className="academic-icon-action" aria-label={`Edit ${item.name}`} onClick={() => beginEdit('faculty', item)}><Icon name="edit" size={16}/></button><button type="button" className="academic-icon-action" aria-label={`${item.is_active ? 'Archive' : 'Reactivate'} ${item.name}`} onClick={() => toggleActive('faculty', item)}><Icon name="archive" size={16}/></button></div></article>)}{faculties.length === 0 && <Empty title="No faculties yet" detail="Create the first faculty to begin building the academic structure."/>}</div>;
    if (structureTab === 'departments') return <div className="academic-record-list">{departments.map((item) => <article className="academic-record" key={item.id}><div className="academic-record-icon"><Icon name="building"/></div><div className="academic-record-main"><strong>{item.name}</strong><span>{item.code} · {item.faculty_name} · {item.programme_count} programmes</span></div><Status active={item.is_active}/><div className="academic-record-actions"><button type="button" className="academic-icon-action" aria-label={`Edit ${item.name}`} onClick={() => beginEdit('department', item)}><Icon name="edit" size={16}/></button><button type="button" className="academic-icon-action" aria-label={`${item.is_active ? 'Archive' : 'Reactivate'} ${item.name}`} onClick={() => toggleActive('department', item)}><Icon name="archive" size={16}/></button></div></article>)}{departments.length === 0 && <Empty title="No departments yet" detail="Create a faculty first, then add its departments."/>}</div>;
    return <div className="academic-record-list">{programmes.map((item) => <article className="academic-record" key={item.id}><div className="academic-record-icon"><Icon name="graduation"/></div><div className="academic-record-main"><strong>{item.name}</strong><span>{item.code} · {item.department_name} · {item.duration_years} years</span></div><Status active={item.is_active}/><div className="academic-record-actions"><button type="button" className="academic-icon-action" aria-label={`Edit ${item.name}`} onClick={() => beginEdit('programme', item)}><Icon name="edit" size={16}/></button><button type="button" className="academic-icon-action" aria-label={`${item.is_active ? 'Archive' : 'Reactivate'} ${item.name}`} onClick={() => toggleActive('programme', item)}><Icon name="archive" size={16}/></button></div></article>)}{programmes.length === 0 && <Empty title="No programmes yet" detail="Create a department first, then add its academic programmes."/>}</div>;
  }

  return <main className="standard-page academic-page">
    <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14}/><Link to={`${ACADEMIC_ROOT}/overview`}>Academic management</Link>{tab !== 'overview' && <><Icon name="chevronRight" size={14}/><span>{tab === 'structure' ? structureTab[0].toUpperCase() + structureTab.slice(1) : tab === 'offerings' ? 'Course offerings' : tab[0].toUpperCase() + tab.slice(1)}</span></>}</div>
    <header className="academic-page-heading"><div><span className="page-eyebrow"><span className="eyebrow-line"/> ADMINISTRATION / ACADEMICS</span><h1>Academic <span>management.</span></h1><p>Set up the institution's academic structure, maintain courses and organise what is offered each session.</p></div><button type="button" className="btn btn-outline academic-refresh" onClick={refresh} disabled={loading}><Icon name="refresh" size={17}/> Refresh records</button></header>

    {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={18}/><span>{error}</span></div>}
    {notice && <div className="academic-alert academic-alert-success" role="status"><Icon name="checkCircle" size={18}/><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><Icon name="x" size={15}/></button></div>}

    <nav className="academic-tabs" aria-label="Academic management sections">{TOP_TABS.map((item) => <Link to={academicPathForTab(item.id)} key={item.id} className={tab === item.id ? 'academic-tab is-selected' : 'academic-tab'} aria-current={tab === item.id ? 'page' : undefined}><Icon name={item.icon} size={17}/>{item.label}</Link>)}</nav>

    {loading ? <div className="academic-loading" role="status"><span className="loading-spinner"/><p>Loading academic records…</p></div> : <>
      {tab === 'overview' && <section className="academic-overview">
        <div className="academic-stat-grid">{[
          ['Faculties', data.overview?.counts?.faculties || 0, 'building'],
          ['Departments', data.overview?.counts?.departments || 0, 'school'],
          ['Programmes', data.overview?.counts?.programmes || 0, 'graduation'],
          ['Courses', data.overview?.counts?.courses || 0, 'book'],
          ['Course offerings', data.overview?.counts?.offerings || 0, 'list'],
          ['Sessions', data.overview?.counts?.sessions || 0, 'calendar'],
        ].map(([label, value, icon]) => <article className="academic-stat" key={label}><span><Icon name={icon} size={19}/></span><strong>{value}</strong><small>{label}</small></article>)}</div>
        <div className="academic-overview-grid"><section className="academic-panel academic-current-session"><span className="academic-kicker">CURRENT ACADEMIC SESSION</span><h2>{currentSession?.name || 'Not selected'}</h2><p>{currentSession ? 'This session is used as the default context for the student course catalogue.' : 'Create an academic session and mark it as current to activate the course catalogue.'}</p><Link className="btn btn-outline" to={academicPathForTab('sessions')}>Manage sessions <Icon name="arrowRight" size={16}/></Link></section><section className="academic-panel academic-setup-checklist"><span className="academic-kicker">SETUP CHECKLIST</span><h3>Build your academic directory</h3>{[
          ['Create a faculty', faculties.length > 0, `${ACADEMIC_ROOT}/structure/faculties/new`],
          ['Add a department', departments.length > 0, `${ACADEMIC_ROOT}/structure/departments/new`],
          ['Create a programme', programmes.length > 0, `${ACADEMIC_ROOT}/structure/programmes/new`],
          ['Add courses', data.courses.length > 0, `${ACADEMIC_ROOT}/courses/new`],
          ['Publish course offerings', data.offerings.length > 0, `${ACADEMIC_ROOT}/offerings/new`],
        ].map(([label, complete, path]) => <Link to={path} className="academic-check-row" key={label}><span className={complete ? 'academic-check is-done' : 'academic-check'}><Icon name="check" size={13}/></span><span>{label}</span><Icon name="chevronRight" size={15}/></Link>)}</section></div>
      </section>}

      {tab === 'structure' && <section className="academic-section-layout"><nav className="academic-subtabs" aria-label="Academic structure sections">{[{id:'faculties',label:'Faculties',count:faculties.length},{id:'departments',label:'Departments',count:departments.length},{id:'programmes',label:'Programmes',count:programmes.length}].map((item) => <Link to={academicPathForTab('structure', item.id)} aria-current={structureTab === item.id ? 'page' : undefined} className={structureTab === item.id ? 'is-selected' : ''} key={item.id}>{item.label}<span>{item.count}</span></Link>)}</nav><div className="academic-two-column"><div>{renderStructureForm()}</div><section className="academic-panel"><div className="academic-list-heading"><div><span className="academic-kicker">DIRECTORY</span><h3>{structureTab[0].toUpperCase() + structureTab.slice(1)}</h3></div><span className="academic-count">{structureTab === 'faculties' ? faculties.length : structureTab === 'departments' ? departments.length : programmes.length} records</span></div>{renderStructureList()}</section></div></section>}

      {tab === 'sessions' && <section className="academic-two-column"><form className="academic-form" onSubmit={submitForm}><div className="academic-form-heading"><div><span className="academic-kicker">ACADEMIC CALENDAR</span><h3>Add an academic session</h3><p>Use consecutive calendar years, for example 2026/2027.</p></div></div><Field label="Session name"><input required pattern="(19|20|21)[0-9]{2}/(19|20|21)[0-9]{2}" value={form.name} onChange={(e) => setValue('name', e.target.value)} placeholder="2026/2027"/></Field><div className="academic-form-actions">{route.action === 'new' && <button type="button" className="btn btn-outline" onClick={cancelEdit} disabled={saving}>Cancel</button>}<button className="btn btn-primary" type="submit" disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Create session'} <Icon name="plus" size={17}/></button></div></form><section className="academic-panel"><div className="academic-list-heading"><div><span className="academic-kicker">ACADEMIC CALENDAR</span><h3>Sessions</h3></div><span className="academic-count">{data.sessions.length} records</span></div><div className="academic-record-list">{data.sessions.map((item) => <article className="academic-record" key={item.id}><div className="academic-record-icon"><Icon name="calendar"/></div><div className="academic-record-main"><strong>{item.name}</strong><span>{item.started_at ? `Started ${new Date(item.started_at).toLocaleDateString()}` : 'Not yet activated'}</span></div>{item.is_current ? <><span className="academic-status is-current">Current</span><button type="button" className="academic-small-action academic-small-danger" onClick={() => closeSession(item)}>Close session</button></> : <button type="button" className="academic-small-action" onClick={() => makeCurrent(item)}>Make current</button>}</article>)}{data.sessions.length === 0 && <Empty title="No sessions found" detail="Create the first academic session."/>}</div></section></section>}

      {tab === 'courses' && <section className="academic-two-column"><form className="academic-form" onSubmit={submitForm}><div className="academic-form-heading"><div><span className="academic-kicker">COURSE DIRECTORY</span><h3>{editing ? 'Edit course' : 'Add a course'}</h3><p>Create department courses or shared university-wide courses, then assign them to programmes, levels and semesters.</p></div></div><Field label="Course scope"><select value={form.is_university_wide ? 'university' : 'department'} onChange={(e) => setForm((current) => ({ ...current, is_university_wide: e.target.value === 'university', department_id: e.target.value === 'university' ? '' : current.department_id }))}><option value="department">Department course</option><option value="university">University-wide / shared course</option></select></Field>{!form.is_university_wide && <Field label="Department"><select required value={form.department_id} onChange={(e) => setValue('department_id', e.target.value)}><option value="">Select department</option>{activeDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}{form.is_university_wide && <div className="academic-wide-note"><Icon name="globe" size={17}/> This course can be offered to programmes across different departments, such as general studies courses.</div>}<Field label="Course code"><input required maxLength="20" value={form.current_code} onChange={(e) => setValue('current_code', e.target.value.toUpperCase())} placeholder="CSC 101"/></Field><Field label="Course title"><input required maxLength="200" value={form.title} onChange={(e) => setValue('title', e.target.value)} placeholder="Introduction to Computing"/></Field><Field label="Course description"><textarea rows="3" value={form.description} onChange={(e) => setValue('description', e.target.value)} placeholder="What does this course cover?"/></Field><FormActions editing={editing} showCancel={route.action === 'new'} saving={saving} onCancel={cancelEdit}/></form><section className="academic-panel"><div className="academic-list-heading"><div><span className="academic-kicker">COURSE DIRECTORY</span><h3>Courses</h3></div><span className="academic-count">{data.courses.length} records</span></div><div className="academic-record-list">{data.courses.map((item) => <article className="academic-record" key={item.id}><div className="academic-record-icon"><Icon name="book"/></div><div className="academic-record-main"><strong>{item.current_code} · {item.title}</strong><span>{item.is_university_wide ? 'University-wide course' : item.department_name || 'Department not assigned'} · {item.offering_count} offerings</span></div><Status active={item.is_active}/><div className="academic-record-actions"><button type="button" className="academic-icon-action" aria-label={`Edit ${item.current_code}`} onClick={() => beginEdit('course', item)}><Icon name="edit" size={16}/></button><button type="button" className="academic-icon-action" aria-label={`${item.is_active ? 'Archive' : 'Reactivate'} ${item.current_code}`} onClick={() => toggleActive('course', item)}><Icon name="archive" size={16}/></button></div></article>)}{data.courses.length === 0 && <Empty title="No courses yet" detail="Create courses after setting up at least one department."/>}</div></section></section>}

      {tab === 'offerings' && <section className="academic-two-column"><form className="academic-form" onSubmit={submitForm}><div className="academic-form-heading"><div><span className="academic-kicker">COURSE DELIVERY</span><h3>{editing ? 'Edit course offering' : 'Create a course offering'}</h3><p>Place a course in a programme, level, semester and academic session.</p></div></div><Field label="Course"><select required value={form.course_id} onChange={(e) => setValue('course_id', e.target.value)}><option value="">Select course</option>{activeCourses.map((item) => <option key={item.id} value={item.id}>{item.current_code} · {item.title}</option>)}</select></Field><Field label="Programme"><select required value={form.programme_id} onChange={(e) => setValue('programme_id', e.target.value)}><option value="">Select programme</option>{activeProgrammes.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></Field><div className="academic-form-grid"><Field label="Level"><select value={form.level} onChange={(e) => setValue('level', e.target.value)}>{LEVELS.map((level) => <option key={level} value={level}>{level} Level</option>)}</select></Field><Field label="Semester"><select value={form.semester} onChange={(e) => setValue('semester', e.target.value)}>{SEMESTERS.map((semester) => <option key={semester}>{semester}</option>)}</select></Field><Field label="Academic session"><select required value={form.academic_session_id} onChange={(e) => setValue('academic_session_id', e.target.value)}><option value="">Select session</option>{data.sessions.map((item) => <option key={item.id} value={item.id} disabled={Boolean(item.ended_at) && String(item.id) !== form.academic_session_id}>{item.name}{item.is_current ? ' · Current' : item.ended_at ? ' · Closed' : ''}</option>)}</select></Field><Field label="Course type"><select value={form.course_type} onChange={(e) => setValue('course_type', e.target.value)}>{COURSE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Credit units"><input type="number" min="1" max="10" required value={form.credit_units} onChange={(e) => setValue('credit_units', e.target.value)}/></Field><Field label="Examination date (optional)"><input type="date" value={form.exam_date} onChange={(e) => setValue('exam_date', e.target.value)}/></Field></div><Field label="Linked staff lecturers" hint="Select verified staff accounts assigned to teach this offering."><select multiple size="4" value={form.lecturer_user_ids} onChange={(e) => setValue('lecturer_user_ids', Array.from(e.target.selectedOptions, (option) => option.value))}>{data.staff.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.surname} · {person.staff_no}</option>)}</select></Field><Field label="Additional lecturer names" hint="Optional. Separate names with commas when a lecturer does not yet have a CourseHubs staff account."><input value={form.lecturer_names} onChange={(e) => setValue('lecturer_names', e.target.value)} placeholder="Dr. A. Example, Prof. B. Example"/></Field><FormActions editing={editing} showCancel={route.action === 'new'} saving={saving} onCancel={cancelEdit}/></form><section className="academic-panel"><div className="academic-list-heading"><div><span className="academic-kicker">SESSION DELIVERY</span><h3>Course offerings</h3></div><span className="academic-count">{data.offerings.length} records</span></div><div className="academic-record-list">{data.offerings.map((item) => <article className="academic-record academic-offering-record" key={item.id}><div className="academic-record-icon"><Icon name="book"/></div><div className="academic-record-main"><strong>{item.current_code} · {item.course_title}</strong><span>{item.programme_name || 'Programme not assigned'} · {item.level} Level · {item.semester} · {item.session_name}</span><small>{(item.lecturers || []).map((lecturer) => lecturer.lecturer_name).join(', ') || 'No lecturers assigned'} · {item.credit_units} credit units</small></div><div className="academic-record-actions">{!item.session_ended_at && <button type="button" className="academic-icon-action" aria-label={`Edit ${item.current_code} offering`} onClick={() => beginEdit('offering', item)}><Icon name="edit" size={16}/></button>}<button type="button" className="academic-icon-action is-danger" aria-label={`Archive ${item.current_code} offering`} onClick={() => archiveOffering(item)}><Icon name="archive" size={16}/></button></div></article>)}{data.offerings.length === 0 && <Empty title="No course offerings yet" detail="Create course offerings to make courses visible in the student catalogue."/>}</div></section></section>}
    </>}
    <div className="academic-footnote"><Icon name="shield" size={16}/><span>Changes are restricted to authorised administrators and recorded in the CourseHubs activity log. Archived academic records are retained for historical integrity.</span></div>
  </main>;
}

function FormActions({ editing, showCancel = false, saving, onCancel }) {
  return <div className="academic-form-actions">{(editing || showCancel) && <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>}<button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create record'} <Icon name={editing ? 'check' : 'plus'} size={17}/></button></div>;
}
