import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import '../academic.css';
import { getCourse, getCourseResources, getResourceFileUrl } from '../api/client';
import NotFound from './NotFound';

const tabs = [
  { label: 'Course materials', type: 'material', icon: 'book' },
  { label: 'Past questions', type: 'past_question', icon: 'fileQuestion' },
  { label: 'Model answers', type: 'model_answer', icon: 'checkCircle' },
];

function formatBytes(value) {
  const size = Number(value || 0);
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CourseDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [course, setCourse] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [resourceError, setResourceError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [selectedOffering, setSelectedOffering] = useState('');
  const [openingResource, setOpeningResource] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setNotFound(false); setError('');
    getCourse(id).then((result) => {
      if (!active) return;
      setCourse(result.course);
      setOfferings(Array.isArray(result.offerings) ? result.offerings : []);
      const requested = searchParams.get('offering');
      const match = result.offerings?.find((item) => String(item.offering_id) === requested);
      setSelectedOffering(String(match?.offering_id || result.offerings?.[0]?.offering_id || ''));
    }).catch((requestError) => {
      if (active) {
        if (requestError.status === 404) setNotFound(true);
        else setError(requestError.message || 'The course details could not be loaded.');
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, searchParams]);

  useEffect(() => {
    let active = true;
    setResourceLoading(true);
    setResourceError('');
    getCourseResources(id, tabs[activeTab].type)
      .then((result) => { if (active) setResources(Array.isArray(result.resources) ? result.resources : []); })
      .catch((requestError) => { if (active) setResourceError(requestError.message || 'Resources could not be loaded.'); })
      .finally(() => { if (active) setResourceLoading(false); });
    return () => { active = false; };
  }, [id, activeTab]);

  async function openResource(resource, action) {
    setOpeningResource(resource.id);
    setResourceError('');
    try {
      const result = await getResourceFileUrl(resource.id, action);
      window.location.assign(result.url);
    } catch (requestError) {
      setResourceError(requestError.message || 'The resource file could not be opened.');
      setOpeningResource(null);
    }
  }

  if (loading) return <main className="standard-page"><div className="academic-loading" role="status"><span className="loading-spinner"/><p>Loading course details…</p></div></main>;
  if (notFound) return <NotFound/>;
  if (!course) return <main className="standard-page"><div className="academic-alert academic-alert-error" role="alert">{error || 'The course could not be loaded.'}</div><Link className="btn btn-outline" to="/catalog">Back to course library</Link></main>;

  const offering = offerings.find((item) => String(item.offering_id) === selectedOffering) || offerings[0];
  const lecturers = offering?.lecturers || [];

  return <main className="standard-page detail-page">
    <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14}/><Link to="/catalog">Course library</Link><Icon name="chevronRight" size={14}/>{course.code}</div>
    <div className="detail-hero"><div><span className="detail-type">COURSE / {course.is_university_wide ? 'UNIVERSITY-WIDE COURSE' : course.department_name || 'ACADEMIC DIRECTORY'}</span><h1>{course.title}</h1><p>{course.description || 'Course information and academic offerings for this course.'}</p><div className="detail-meta"><span><Icon name="book" size={17}/> {course.code}</span>{course.faculty_name && <span><Icon name="building" size={17}/> {course.faculty_name}</span>}{course.is_university_wide && <span><Icon name="globe" size={17}/> University-wide</span>}{course.department_name && <span><Icon name="school" size={17}/> {course.department_name}</span>}</div></div><div className="detail-symbol"><Icon name="layers" size={66} strokeWidth={1.2}/></div></div>
    {error && <div className="academic-alert academic-alert-error" role="alert">{error}</div>}
    <div className="detail-grid"><div className="detail-main">
      {offerings.length > 0 ? <section className="course-offering-summary"><div className="course-offering-heading"><div><span className="academic-kicker">ACADEMIC OFFERINGS</span><h2>Course delivery details</h2></div><label><span className="sr-only">Select course offering</span><select value={selectedOffering} onChange={(event) => setSelectedOffering(event.target.value)}>{offerings.map((item) => <option key={item.offering_id} value={item.offering_id}>{item.programme_name || 'Programme'} · {item.level} Level · {item.semester} · {item.session_name}</option>)}</select></label></div>{offering && <div className="course-offering-meta"><span><Icon name="graduation" size={17}/>{offering.level} Level</span><span><Icon name="calendar" size={17}/>{offering.session_name}</span><span><Icon name="clock" size={17}/>{offering.semester} semester</span><span><Icon name="book" size={17}/>{offering.credit_units} credit units</span><span className="type-chip">{offering.type}</span></div>}{lecturers.length > 0 && <div className="course-lecturer-list"><strong>Assigned lecturer{lecturers.length > 1 ? 's' : ''}</strong>{lecturers.map((person) => <span key={`${person.lecturer_user_id || 'external'}-${person.lecturer_name}`}><Icon name="user" size={15}/>{person.lecturer_name}</span>)}</div>}</section> : <div className="resource-empty"><div className="resource-empty-icon"><Icon name="calendar" size={28}/></div><h2>No active course offering</h2><p>This course is in the academic directory but has not been assigned to a programme, level and semester for a session yet.</p></div>}
      <div className="detail-tabs" role="tablist" aria-label="Resource category">{tabs.map((tab, index) => <button key={tab.label} role="tab" aria-selected={activeTab === index} aria-controls="course-resource-panel" className={`detail-tab ${activeTab === index ? 'detail-tab-active' : ''}`} onClick={() => setActiveTab(index)}><Icon name={tab.icon} size={18}/><span>{tab.label}</span></button>)}</div>
      <section id="course-resource-panel" role="tabpanel" className="course-resource-panel" aria-label={tabs[activeTab].label}>
        <div className="resource-panel-heading"><div><span className="academic-kicker">APPROVED COURSE LIBRARY</span><h2>{tabs[activeTab].label}</h2></div><span>{resources.length} available</span></div>
        {resourceError && <div className="academic-alert academic-alert-error" role="alert">{resourceError}</div>}
        {resourceLoading ? <div className="academic-loading" role="status"><span className="loading-spinner"/><p>Loading approved resources…</p></div> : resources.length ? <div className="course-resource-list">{resources.map((resource) => <article className="course-resource-row" key={resource.id}><span className="resource-file-symbol"><Icon name={resource.type === 'past_question' ? 'fileQuestion' : resource.type === 'model_answer' ? 'checkCircle' : 'file'} size={21}/></span><div className="course-resource-copy"><strong>{resource.title}</strong><span>{resource.original_filename} · {formatBytes(resource.file_size)}</span><small>{resource.uploader_name} · {resource.session_name || 'General resource'} · {new Date(resource.created_at).toLocaleDateString()}</small></div><div className="course-resource-actions">{resource.mime_type === 'application/pdf' && <button type="button" className="btn btn-outline btn-small" disabled={openingResource === resource.id} onClick={() => openResource(resource, 'preview')}><Icon name="eye" size={15}/>Preview</button>}<button type="button" className="btn btn-primary btn-small" disabled={openingResource === resource.id} onClick={() => openResource(resource, 'download')}><Icon name="download" size={15}/>Download</button></div></article>)}</div> : <div className="resource-empty compact-resource-empty"><div className="resource-empty-icon"><Icon name={tabs[activeTab].icon} size={27}/></div><h2>No {tabs[activeTab].label.toLowerCase()} published yet</h2><p>Approved resources for this course will appear here after contributor submissions have been reviewed.</p><Link to="/upload" className="btn btn-primary">Contribute a resource <Icon name="arrowRight" size={18}/></Link></div>}
      </section>
    </div><aside className="detail-aside"><div className="aside-card"><span className="section-kicker">COURSE INFORMATION</span><h3>One course.<br/>One clear view.</h3><p>CourseHubs brings course details and academic offerings together so students can find the right materials for their programme and level.</p><div className="aside-card-divider"/><div className="aside-info"><Icon name="shield" size={18}/> Signed-in member access</div><div className="aside-info"><Icon name="search" size={18}/> Approved resource library</div></div><Link className="aside-join" to="/catalog"><Icon name="layers" size={21}/><span><strong>Course library</strong><small>Explore other courses</small></span><Icon name="arrowUpRight" size={18}/></Link></aside></div>
  </main>;
}
