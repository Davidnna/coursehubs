import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import '../academic.css';
import { getAcademicStructure, searchResources, bookmarkResource, unbookmarkResource, reportResource, getResourceFileUrl } from '../api/client';
import './resource-discovery.css';

const PAGE_SIZE = 24;
const categories = [
    { value: '', label: 'All resource types' },
    { value: 'material', label: 'Lecture materials' },
    { value: 'past_question', label: 'Past questions' },
    { value: 'model_answer', label: 'Model answers' },
];
const reportReasons = [
    { value: 'incorrect_course', label: 'Incorrect course or academic information' },
    { value: 'poor_quality', label: 'Poor or unreadable document' },
    { value: 'copyright', label: 'Copyright or ownership concern' },
    { value: 'inappropriate', label: 'Inappropriate content' },
    { value: 'duplicate', label: 'Duplicate resource' },
    { value: 'other', label: 'Other concern' },
];

function formatBytes(value) {
    const size = Number(value || 0);
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function typeLabel(type) {
    return ({ material: 'Lecture material', past_question: 'Past question', model_answer: 'Model answer' })[type] || 'Academic resource';
}

function ResourceIcon({ type }) {
    const name = type === 'past_question' ? 'fileQuestion' : type === 'model_answer' ? 'checkCircle' : 'file';
    return <span className="discovery-file-icon"><Icon name={name} size={22} /></span>;
}

export default function ResourceLibrary() {
    const [searchParams] = useSearchParams();
    const [structure, setStructure] = useState({ faculties: [], departments: [], programmes: [], levels: [], sessions: [] });
    const [filters, setFilters] = useState(() => ({ q: searchParams.get('q') || '', course_id: searchParams.get('course_id') || '', type: '', faculty_id: '', department_id: '', programme_id: '', level: '', semester: '', session_id: '', sort: 'newest' }));
    const [view, setView] = useState('all');
    const [resources, setResources] = useState([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [filterWarning, setFilterWarning] = useState('');
    const [notice, setNotice] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [reportingId, setReportingId] = useState(null);
    const [reportForm, setReportForm] = useState({ reason: 'incorrect_course', details: '' });

    useEffect(() => {
        let active = true;
        getAcademicStructure().then((result) => {
            if (active) setStructure({
                faculties: result.faculties || [], departments: result.departments || [],
                programmes: result.programmes || [], levels: result.levels || [], sessions: result.sessions || [],
            });
        }).catch(() => {
            if (active) setFilterWarning('Some academic filters could not be loaded. You can still search by resource title, course code or course name.');
        });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            setLoading(true);
            setError('');
            searchResources({ ...filters, view, limit: PAGE_SIZE, offset: 0 })
                .then((result) => {
                    if (!active) return;
                    setResources(Array.isArray(result.resources) ? result.resources : []);
                    setTotal(Number(result.total || 0));
                    setHasMore(Boolean(result.has_more));
                })
                .catch((requestError) => { if (active) setError(requestError.message || 'The resource library could not be loaded.'); })
                .finally(() => { if (active) setLoading(false); });
        }, filters.q.trim() ? 280 : 0);
        return () => { active = false; window.clearTimeout(timer); };
    }, [filters, view]);

    const departments = useMemo(() => structure.departments.filter((item) => !filters.faculty_id || String(item.faculty_id) === filters.faculty_id), [structure.departments, filters.faculty_id]);
    const programmes = useMemo(() => structure.programmes.filter((item) => !filters.department_id || String(item.department_id) === filters.department_id), [structure.programmes, filters.department_id]);

    function updateFilter(name, value) {
        setFilters((previous) => ({
            ...previous,
            [name]: value,
            ...(name === 'faculty_id' ? { department_id: '', programme_id: '' } : {}),
            ...(name === 'department_id' ? { programme_id: '' } : {}),
        }));
    }

    function clearFilters() {
        setFilters({ q: '', course_id: '', type: '', faculty_id: '', department_id: '', programme_id: '', level: '', semester: '', session_id: '', sort: 'newest' });
    }

    async function loadMore() {
        setLoadingMore(true);
        setError('');
        try {
            const result = await searchResources({ ...filters, view, limit: PAGE_SIZE, offset: resources.length });
            setResources((previous) => [...previous, ...(result.resources || [])]);
            setHasMore(Boolean(result.has_more));
        } catch (requestError) {
            setError(requestError.message || 'More resources could not be loaded.');
        } finally {
            setLoadingMore(false);
        }
    }

    async function toggleBookmark(resource) {
        setBusyId(resource.id); setError(''); setNotice('');
        try {
            if (resource.is_bookmarked) {
                await unbookmarkResource(resource.id);
                if (view === 'bookmarks') {
                    setResources((previous) => previous.filter((item) => item.id !== resource.id));
                    setTotal((previous) => Math.max(0, previous - 1));
                } else {
                    setResources((previous) => previous.map((item) => item.id === resource.id ? { ...item, is_bookmarked: false } : item));
                }
                setNotice('Resource removed from your bookmarks.');
            } else {
                await bookmarkResource(resource.id);
                setResources((previous) => previous.map((item) => item.id === resource.id ? { ...item, is_bookmarked: true } : item));
                setNotice('Resource saved to your bookmarks.');
            }
        } catch (requestError) {
            setError(requestError.message || 'Your bookmark could not be updated.');
        } finally { setBusyId(null); }
    }

    async function openResource(resource, action) {
        setBusyId(resource.id); setError('');
        try {
            const result = await getResourceFileUrl(resource.id, action);
            window.location.assign(result.url);
        } catch (requestError) {
            setError(requestError.message || 'The resource could not be opened.');
            setBusyId(null);
        }
    }

    async function submitReport(event) {
        event.preventDefault();
        if (!reportingId) return;
        setBusyId(reportingId); setError(''); setNotice('');
        try {
            await reportResource(reportingId, reportForm);
            setResources((previous) => previous.map((item) => item.id === reportingId ? { ...item, has_open_report: true } : item));
            setReportingId(null);
            setReportForm({ reason: 'incorrect_course', details: '' });
            setNotice('Thank you. Your report has been sent to the CourseHubs administrators.');
        } catch (requestError) {
            setError(requestError.message || 'Your report could not be submitted.');
        } finally { setBusyId(null); }
    }

    const activeFilterCount = [filters.type, filters.faculty_id, filters.department_id, filters.programme_id, filters.level, filters.semester, filters.session_id].filter(Boolean).length;

    return <main className="standard-page resource-discovery-page">
        <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14} />Resource library</div>
        <div className="page-lead"><div className="page-eyebrow"><span className="eyebrow-line" /> FIND, SAVE AND USE ACADEMIC MATERIALS</div><h1>Discover learning <span>resources.</span></h1><p>Search approved lecture materials, past questions and model answers across courses. Narrow your results by department, degree programme, level, semester and academic session.</p></div>

        <section className="discovery-search-panel" aria-label="Search and filter resources">
            <div className="discovery-search-row">
                <div className="catalog-search discovery-search"><Icon name="search" size={21} /><label htmlFor="resource-query" className="sr-only">Search resources</label><input id="resource-query" value={filters.q} onChange={(event) => updateFilter('q', event.target.value)} placeholder="Search resource title, course code or course name" />{filters.q && <button className="clear-input" type="button" aria-label="Clear search" onClick={() => updateFilter('q', '')}><Icon name="x" size={15} /></button>}</div>
                <label className="discovery-sort"><span>Sort by</span><select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="newest">Newest first</option><option value="popular">Most download requests</option><option value="title">Title A–Z</option></select></label>
            </div>
            <div className="discovery-filter-heading"><span><Icon name="filter" size={16} /> Refine results</span><span>{activeFilterCount ? `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} applied` : 'All academic areas'}</span></div>
            {filterWarning && <div className="academic-footnote discovery-filter-warning"><Icon name="info" size={16} />{filterWarning}</div>}
            <div className="discovery-filters">
                <label className="academic-filter-select"><span>Resource type</span><select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="academic-filter-select"><span>Faculty</span><select value={filters.faculty_id} onChange={(event) => updateFilter('faculty_id', event.target.value)}><option value="">All faculties</option>{structure.faculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="academic-filter-select"><span>Department</span><select value={filters.department_id} onChange={(event) => updateFilter('department_id', event.target.value)}><option value="">All departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="academic-filter-select"><span>Degree programme</span><select value={filters.programme_id} onChange={(event) => updateFilter('programme_id', event.target.value)}><option value="">All degree programmes</option>{programmes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="academic-filter-select"><span>Level</span><select value={filters.level} onChange={(event) => updateFilter('level', event.target.value)}><option value="">All levels</option>{(structure.levels.length ? structure.levels : [100, 200, 300, 400, 500, 600].map((level) => ({ level }))).map((item) => <option key={item.level} value={item.level}>{item.level} Level</option>)}</select></label>
                <label className="academic-filter-select"><span>Semester</span><select value={filters.semester} onChange={(event) => updateFilter('semester', event.target.value)}><option value="">All semesters</option><option value="First">First semester</option><option value="Second">Second semester</option></select></label>
                <label className="academic-filter-select"><span>Academic session</span><select value={filters.session_id} onChange={(event) => updateFilter('session_id', event.target.value)}><option value="">All sessions</option>{structure.sessions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_current ? ' · Current' : ''}</option>)}</select></label>
                <button type="button" className="discovery-clear" onClick={clearFilters}><Icon name="refresh" size={15} /> Clear filters</button>
            </div>
        </section>

        <div className="discovery-view-tabs" role="tablist" aria-label="Resource views">
            {[['all', 'All resources', 'layers'], ['bookmarks', 'My bookmarks', 'bookmark'], ['recent', 'Recently viewed', 'clock']].map(([value, label, icon]) => <button type="button" role="tab" aria-selected={view === value} className={view === value ? 'is-active' : ''} key={value} onClick={() => setView(value)}><Icon name={icon} size={17} />{label}</button>)}
        </div>

        <div className="discovery-results-heading"><div><span className="academic-kicker">APPROVED ACADEMIC MATERIALS</span><h2>{view === 'bookmarks' ? 'Your saved resources' : view === 'recent' ? 'Recently viewed resources' : 'Resource results'} <span>· {total}</span></h2></div><span className="catalog-live-label"><span /> UPDATED LIBRARY</span></div>
        {notice && <div className="academic-alert academic-alert-success" role="status"><Icon name="checkCircle" size={17} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}><Icon name="x" size={15} /></button></div>}
        {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={17} />{error}</div>}

        {loading ? <div className="academic-loading" role="status"><span className="loading-spinner" /><p>Searching the resource library…</p></div> : resources.length === 0 ? <div className="resource-empty discovery-empty"><div className="resource-empty-icon"><Icon name={view === 'bookmarks' ? 'bookmark' : view === 'recent' ? 'clock' : 'search'} size={28} /></div><h2>{view === 'bookmarks' ? 'No bookmarked resources yet' : view === 'recent' ? 'No recently viewed resources' : 'No resources match your search'}</h2><p>{view === 'bookmarks' ? 'Save useful materials with the bookmark control and they will appear here.' : view === 'recent' ? 'Resources you preview or download will appear here for quick access.' : 'Try a different search term or remove some filters. Approved resources appear here after administrator review.'}</p>{(view !== 'all' || activeFilterCount || filters.q) && <button type="button" className="btn btn-outline" onClick={() => { setView('all'); clearFilters(); }}>Browse all resources <Icon name="arrowRight" size={16} /></button>}</div> : <>
            <div className="discovery-resource-grid">{resources.map((resource) => <article className="discovery-resource-card" key={resource.id}>
                <div className="discovery-card-top"><ResourceIcon type={resource.type} /><span className={`discovery-type discovery-type-${resource.type}`}>{typeLabel(resource.type)}</span><button type="button" className={`discovery-bookmark ${resource.is_bookmarked ? 'is-saved' : ''}`} aria-label={resource.is_bookmarked ? `Remove ${resource.title} from bookmarks` : `Bookmark ${resource.title}`} title={resource.is_bookmarked ? 'Remove bookmark' : 'Save resource'} disabled={busyId === resource.id} onClick={() => toggleBookmark(resource)}><Icon name="bookmark" size={18} /></button></div>
                <div className="discovery-card-content"><h3>{resource.title}</h3><Link to={`/courses/${resource.course_id}`} className="discovery-course-link"><strong>{resource.course_code}</strong><span>{resource.course_title}</span><Icon name="arrowUpRight" size={14} /></Link><div className="discovery-card-meta"><span><Icon name="building" size={13} />{resource.department_name}</span><span><Icon name="calendar" size={13} />{resource.session_name || 'General resource'}</span></div></div>
                <div className="discovery-card-footer"><div className="discovery-file-meta"><span>{formatBytes(resource.file_size)} · {String(resource.original_filename || '').split('.').pop().toUpperCase()}</span><small>{Number(resource.download_count || 0)} download requests · {new Date(resource.created_at).toLocaleDateString()}</small></div><div className="discovery-actions">{resource.mime_type === 'application/pdf' && <button type="button" className="btn btn-outline btn-small" disabled={busyId === resource.id} onClick={() => openResource(resource, 'preview')}><Icon name="eye" size={14} /> Preview</button>}<button type="button" className="btn btn-primary btn-small" disabled={busyId === resource.id} onClick={() => openResource(resource, 'download')}><Icon name="download" size={14} /> Download</button></div><div className="discovery-card-secondary"><span>Shared by {resource.uploader_name}</span><button type="button" className="discovery-report-link" disabled={Boolean(resource.has_open_report) || busyId === resource.id} onClick={() => { setReportingId(resource.id); setReportForm({ reason: 'incorrect_course', details: '' }); }}><Icon name="flag" size={13} />{resource.has_open_report ? 'Report submitted' : 'Report resource'}</button></div></div>
                {reportingId === resource.id && <form className="discovery-report-form" onSubmit={submitReport}><div className="discovery-report-heading"><strong>Report this resource</strong><button type="button" className="clear-input" aria-label="Close report form" onClick={() => setReportingId(null)}><Icon name="x" size={15} /></button></div><label className="academic-filter-select"><span>Reason</span><select value={reportForm.reason} onChange={(event) => setReportForm((previous) => ({ ...previous, reason: event.target.value }))}>{reportReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="academic-filter-select"><span>Additional details (optional)</span><textarea maxLength={1200} rows={3} value={reportForm.details} onChange={(event) => setReportForm((previous) => ({ ...previous, details: event.target.value }))} placeholder="Tell the administrators what should be reviewed." /></label><div className="discovery-report-actions"><button type="button" className="btn btn-outline btn-small" onClick={() => setReportingId(null)}>Cancel</button><button type="submit" className="btn btn-primary btn-small" disabled={busyId === resource.id}>{busyId === resource.id ? 'Submitting…' : 'Submit report'}</button></div></form>}
            </article>)}</div>
            {hasMore && <div className="discovery-load-more"><button type="button" className="btn btn-outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more resources'} <Icon name="arrowRight" size={16} /></button><span>Showing {resources.length} of {total}</span></div>}
        </>}
    </main>;
}
