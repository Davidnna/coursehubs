import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import CourseCard from '../components/CourseCard';
import { levels, sampleCourses, resourceTypes } from '../data/preview';

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') || '';
  const level = searchParams.get('level') || 'All levels';
  const [type, setType] = useState('All types');
  const filtered = useMemo(() => sampleCourses.filter((course) => {
    const queryMatch = `${course.code} ${course.title} ${course.topic}`.toLowerCase().includes(search.toLowerCase().trim());
    return queryMatch && (level === 'All levels' || String(course.level) === level) && (type === 'All types' || course.type === type);
  }), [search, level, type]);
  function patchQuery(key, value) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'All levels') next.delete(key); else next.set(key, value);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }
  return (
    <main className="standard-page">
      <div className="breadcrumb"><Link to="/">Home</Link><Icon name="chevronRight" size={14}/>Course index</div>
      <div className="page-lead"><div className="page-eyebrow"><span className="eyebrow-line"/> SEARCH, SORT, DISCOVER</div><h1>Explore the <span>course index.</span></h1><p>Find what you need without scrolling through endless messages. Explore the interface using the sample courses below.</p></div>
      <div className="catalog-toolbar"><div className="catalog-search"><Icon name="search" size={21}/><label htmlFor="catalog-query" className="sr-only">Search the course index</label><input id="catalog-query" placeholder="Try a course code, title or topic" value={search} onChange={(event) => patchQuery('q', event.target.value)}/>{search && <button className="clear-input" type="button" aria-label="Clear search" onClick={() => patchQuery('q', '')}><Icon name="x" size={15}/></button>}</div><label className="select-wrap"><Icon name="filter" size={18}/><span className="sr-only">Resource type</span><select aria-label="Resource type" value={type} onChange={(event) => setType(event.target.value)}>{resourceTypes.map((item) => <option key={item}>{item}</option>)}</select><Icon name="chevronDown" size={16}/></label></div>
      <div className="filter-row"><span className="filter-label">LEVEL</span>{['All levels', ...levels.map(String)].map((item) => <button key={item} className={`filter-pill ${item === level ? 'filter-pill-active' : ''}`} onClick={() => patchQuery('level', item)}>{item === 'All levels' ? 'All levels' : `${item}L`}</button>)}</div>
      <div className="catalog-results-title"><div><h2>Course collection <span>· {filtered.length} examples</span></h2><p>Sample course titles for interface demonstration only</p></div><span className="preview-label"><Icon name="info" size={15}/> DEMO CONTENT</span></div>
      {filtered.length ? <div className="course-grid catalog-grid">{filtered.map((course) => <CourseCard key={course.id} course={course}/>)}</div> : <div className="empty-state"><Icon name="search" size={32}/><h3>No matching examples</h3><p>Try another keyword or choose a different level.</p><button className="btn btn-primary" onClick={() => { setSearchParams({}); setType('All types'); }}>Clear filters <Icon name="arrowRight" size={17}/></button></div>}
      <div className="catalog-disclaimer"><Icon name="info" size={20}/><div><strong>This is a UI preview.</strong><p>The live course catalog and downloadable resource library will be connected when their backend endpoints are implemented. No sample content here is a real uploaded file.</p></div></div>
    </main>
  );
}
