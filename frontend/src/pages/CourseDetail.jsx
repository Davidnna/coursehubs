import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import '../academic.css';
import { getCourse } from '../api/client';
import NotFound from './NotFound';

const tabs = [{ label: 'Course materials', icon: 'book' }, { label: 'Past questions', icon: 'fileQuestion' }, { label: 'Model answers', icon: 'checkCircle' }];

export default function CourseDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [course, setCourse] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [selectedOffering, setSelectedOffering] = useState('');

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
      <div className="detail-tabs" role="tablist" aria-label="Resource category">{tabs.map((tab, index) => <button key={tab.label} role="tab" aria-selected={activeTab === index} className={`detail-tab ${activeTab === index ? 'detail-tab-active' : ''}`} onClick={() => setActiveTab(index)}><Icon name={tab.icon} size={18}/><span>{tab.label}</span></button>)}</div><div className="resource-empty"><div className="resource-empty-icon"><Icon name={tabs[activeTab].icon} size={28}/></div><h2>No {tabs[activeTab].label.toLowerCase()} published yet</h2><p>Approved academic resources for this course will appear here when the resource contribution and moderation modules are released.</p><Link to="/upload" className="btn btn-primary">Contribute a resource <Icon name="arrowRight" size={18}/></Link></div>
    </div><aside className="detail-aside"><div className="aside-card"><span className="section-kicker">COURSE INFORMATION</span><h3>One course.<br/>One clear view.</h3><p>CourseHubs brings course details and academic offerings together so students can find the right materials for their programme and level.</p><div className="aside-card-divider"/><div className="aside-info"><Icon name="shield" size={18}/> Signed-in member access</div><div className="aside-info"><Icon name="search" size={18}/> Course catalogue listing</div></div><Link className="aside-join" to="/catalog"><Icon name="layers" size={21}/><span><strong>Course library</strong><small>Explore other courses</small></span><Icon name="arrowUpRight" size={18}/></Link></aside></div>
  </main>;
}
