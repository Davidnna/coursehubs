import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import '../academic.css';
import CourseCard from '../components/CourseCard';
import { getAcademicStructure, getCourses } from '../api/client';

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') || '';
  const level = searchParams.get('level') || '';
  const semester = searchParams.get('semester') || '';
  const departmentId = searchParams.get('department_id') || '';
  const programmeId = searchParams.get('programme_id') || '';
  const sessionId = searchParams.get('session_id') || '';
  const [query, setQuery] = useState(search);
  const [courses, setCourses] = useState([]);
  const [session, setSession] = useState(null);
  const [structure, setStructure] = useState({ faculties: [], departments: [], programmes: [], levels: [], sessions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setQuery(search); }, [search]);

  useEffect(() => {
    let active = true;
    getAcademicStructure().then((result) => {
      if (active) setStructure(result);
    }).catch((requestError) => {
      if (active) setError(requestError.message || 'Academic filters could not be loaded.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (query.trim()) next.set('q', query.trim()); else next.delete('q');
      if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true, preventScrollReset: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getCourses({ q: search, level, semester, department_id: departmentId, programme_id: programmeId, session_id: sessionId })
      .then((result) => {
        if (active) { setCourses(Array.isArray(result.courses) ? result.courses : []); setSession(result.session || null); }
      })
      .catch((requestError) => { if (active) setError(requestError.message || 'The course catalogue could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, level, semester, departmentId, programmeId, sessionId]);

  function patchQuery(key, value) {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key); else next.set(key, value);
    if (key === 'department_id') next.delete('programme_id');
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }

  const programmes = structure.programmes.filter((item) => !departmentId || String(item.department_id) === departmentId);

  return <main className="standard-page">
    <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14}/>Course library</div>
    <div className="page-lead"><div className="page-eyebrow"><span className="eyebrow-line"/> SEARCH, FILTER, DISCOVER</div><h1>Explore the <span>course library.</span></h1><p>Find courses by code, title, programme, level and semester. The catalogue reflects the academic offerings published by CourseHubs administrators.</p></div>
    <div className="catalog-toolbar"><div className="catalog-search"><Icon name="search" size={21}/><label htmlFor="catalog-query" className="sr-only">Search courses</label><input id="catalog-query" placeholder="Search by course code or title" value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <button className="clear-input" type="button" aria-label="Clear search" onClick={() => setQuery('')}><Icon name="x" size={15}/></button>}</div><label className="select-wrap"><Icon name="calendar" size={18}/><span className="sr-only">Academic session</span><select aria-label="Academic session" value={sessionId} onChange={(event) => patchQuery('session_id', event.target.value)}><option value="">Current session{session ? ` · ${session.name}` : ''}</option>{structure.sessions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_current ? ' · Current' : ''}</option>)}</select><Icon name="chevronDown" size={16}/></label></div>
    <div className="catalog-filter-grid"><label className="academic-filter-select"><span>Department</span><select value={departmentId} onChange={(event) => patchQuery('department_id', event.target.value)}><option value="">All departments</option>{structure.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="academic-filter-select"><span>Programme</span><select value={programmeId} onChange={(event) => patchQuery('programme_id', event.target.value)}><option value="">All programmes</option>{programmes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="academic-filter-select"><span>Semester</span><select value={semester} onChange={(event) => patchQuery('semester', event.target.value)}><option value="">All semesters</option>{['First', 'Second'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <div className="filter-row"><span className="filter-label">LEVEL</span><button type="button" className={`filter-pill ${!level ? 'filter-pill-active' : ''}`} onClick={() => patchQuery('level', '')}>All levels</button>{(structure.levels.length ? structure.levels.map((item) => item.level) : [100, 200, 300, 400, 500]).map((item) => <button type="button" key={item} className={`filter-pill ${String(item) === level ? 'filter-pill-active' : ''}`} onClick={() => patchQuery('level', String(item))}>{item}L</button>)}</div>
    <div className="catalog-results-title"><div><h2>Published course offerings <span>· {courses.length}</span></h2><p>{session ? `Academic session ${session.name}` : 'Current academic session'}</p></div><span className="catalog-live-label"><span/> LIVE CATALOGUE</span></div>
    {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={18}/>{error}</div>}
    {loading ? <div className="academic-loading" role="status"><span className="loading-spinner"/><p>Loading courses…</p></div> : courses.length ? <div className="course-grid catalog-grid">{courses.map((course) => <CourseCard key={course.offering_id} course={course}/>)}</div> : <div className="empty-state"><Icon name="book" size={32}/><h3>No published courses found</h3><p>There are no course offerings matching these filters. Try another academic session or check back when your department publishes its course list.</p><button className="btn btn-outline" type="button" onClick={() => { setQuery(''); setSearchParams({}); }}>Clear filters <Icon name="refresh" size={17}/></button></div>}
  </main>;
}
