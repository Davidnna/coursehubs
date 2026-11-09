import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { uploadAcademicCsv } from '../api/client';
import '../academic.css';

const IMPORT_TYPES = [
  { value: 'departments', label: 'Departments', description: 'Add departments under faculties that already exist in CourseHubs.' },
  { value: 'programmes', label: 'Programmes', description: 'Add programmes under departments that have already been imported. Use the programme award and duration used by the institution.' },
  { value: 'courses', label: 'Courses', description: 'Add courses after departments exist. For a shared course, set is_university_wide to true and leave the department columns blank.' },
  { value: 'sessions', label: 'Academic sessions', description: 'Create academic sessions. Imported sessions are not automatically made current.' },
  { value: 'offerings', label: 'Programme course lists', description: 'Choose which courses students take in each programme, level, semester and academic session. Import courses, programmes and sessions first; separate multiple lecturer names with semicolons.' },
  { value: 'faculties', label: 'Faculties', description: 'Add any additional faculties. Existing faculties are safely skipped.' },
];

const TEMPLATES = {
  departments: ['faculty_code', 'faculty_name', 'department_name', 'department_code', 'description'],
  programmes: ['faculty_code', 'faculty_name', 'department_code', 'programme_name', 'programme_code', 'award', 'duration_years', 'description'],
  courses: ['faculty_code', 'faculty_name', 'department_code', 'course_code', 'course_title', 'description', 'is_university_wide'],
  sessions: ['session_name'],
  offerings: ['faculty_code', 'faculty_name', 'department_code', 'programme_code', 'course_code', 'academic_session', 'level', 'semester', 'course_type', 'credit_units', 'exam_date', 'lecturer_names'],
  faculties: ['faculty_name', 'faculty_code', 'description'],
};

const STATUS_LABELS = { ready: 'Ready', skipped: 'Will skip', error: 'Needs attention' };

function downloadTemplate(type) {
  const headers = TEMPLATES[type] || [];
  const csv = `${headers.join(',')}\r\n`;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `coursehubs-${type}-template.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function SummaryCard({ label, value, tone }) {
  return <article className={`csv-summary-card csv-summary-${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

export default function AcademicCsvImport() {
  const fileInput = useRef(null);
  const [type, setType] = useState('departments');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedType = IMPORT_TYPES.find((item) => item.value === type) || IMPORT_TYPES[0];

  function resetReview() {
    setPreview(null);
    setResult(null);
    setError('');
  }

  function handleTypeChange(event) {
    setType(event.target.value);
    setFile(null);
    resetReview();
    if (fileInput.current) fileInput.current.value = '';
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    resetReview();
    if (nextFile && nextFile.size > 2 * 1024 * 1024) {
      setFile(null);
      setError('Choose a CSV file smaller than 2 MB.');
      event.target.value = '';
    } else if (nextFile && !nextFile.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setError('Choose a file saved with the .csv extension.');
      event.target.value = '';
    }
  }

  async function handlePreview() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await uploadAcademicCsv(file, type, 'preview');
      setPreview(response);
    } catch (requestError) {
      setError(requestError.message || 'The CSV file could not be checked.');
      if (requestError.data?.rows) setPreview(requestError.data);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file || !preview || preview.summary?.errors > 0 || preview.summary?.ready < 1 || busy) return;
    const ready = preview.summary.ready;
    const skipped = preview.summary.skipped || 0;
    const confirmed = window.confirm(`Import ${ready} ${selectedType.label.toLowerCase()} record(s)? ${skipped ? `${skipped} existing or duplicate record(s) will be skipped. ` : ''}This action cannot be undone automatically.`);
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      const response = await uploadAcademicCsv(file, type, 'import');
      setResult(response);
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (requestError) {
      setError(requestError.message || 'The records could not be imported.');
      if (requestError.data?.rows) setPreview(requestError.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="standard-page academic-page csv-import-page">
      <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14}/><Link to="/admin/academics/overview">Academic management</Link><Icon name="chevronRight" size={14}/><span>CSV import</span></div>

      <header className="academic-page-heading">
        <div>
          <span className="page-eyebrow"><span className="eyebrow-line"/> ADMINISTRATION / INITIAL SETUP</span>
          <h1>Import academic <span>data.</span></h1>
          <p>Upload structured CSV files to populate faculties, departments, programmes, sessions, courses and programme course lists.</p>
        </div>
        <Link to="/admin/academics/overview" className="btn btn-outline academic-refresh"><Icon name="arrowRight" size={16}/> Back to academics</Link>
      </header>

      <div className="csv-temporary-notice"><Icon name="info" size={18}/><div><strong>Temporary setup tool</strong><span>This importer is available to administrators for the initial academic data setup. It will be removed after you confirm that setup is complete.</span></div></div>

      {error && <div className="academic-alert academic-alert-error" role="alert"><Icon name="alert" size={18}/><span>{error}</span></div>}
      {result && <div className="academic-alert academic-alert-success csv-import-result" role="status"><Icon name="checkCircle" size={19}/><span><strong>Import completed.</strong> {result.created_count} record(s) created and {result.skipped_count} existing or duplicate record(s) skipped. You can now import another file.</span><button type="button" aria-label="Dismiss result" onClick={() => setResult(null)}><Icon name="x" size={15}/></button></div>}

      <section className="academic-two-column csv-import-layout">
        <div className="academic-panel csv-import-controls">
          <div className="academic-form-heading"><div><span className="academic-kicker">STEP 1 · CHOOSE DATA</span><h3>Select import type</h3><p>Choose the kind of academic records contained in your CSV file.</p></div></div>
          <label className="academic-field" htmlFor="csv-import-type"><span>Academic data type</span><select id="csv-import-type" value={type} onChange={handleTypeChange} disabled={busy}>{IMPORT_TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select><small>{selectedType.description}</small></label>
          <div className="csv-template-box"><div><strong>CSV column format</strong><span>Use these exact column headings in the first row of your file.</span></div><code>{TEMPLATES[type].join(', ')}</code><span>{type === 'offerings' ? 'This is a blank template, not a populated course list. Add one row for each course assigned to a programme, level, semester and session. Each row needs an existing faculty, department, programme, course and open academic session, plus level, semester, course type and credit units (1–30). A programme may include service or ancillary courses owned by another department. Separate lecturer names with semicolons (;).' : type === 'courses' ? 'For university-wide courses, set is_university_wide to true and leave faculty/department blank. For department courses, set it to false and provide faculty_code and department_code.' : type === 'sessions' ? 'Sessions are created as inactive history records; choose the current session separately in Academic Sessions.' : 'The importer matches parent records using the faculty and department codes.'}</span><button type="button" className="academic-small-action" onClick={() => downloadTemplate(type)}><Icon name="download" size={14}/> Download blank template</button></div>
          <div className="academic-form-heading csv-step-heading"><div><span className="academic-kicker">STEP 2 · UPLOAD FILE</span><h3>Choose your CSV file</h3><p>UTF-8 CSV files up to 2 MB and 1,000 data rows are supported.</p></div></div>
          <label className="csv-file-drop" htmlFor="academic-csv-file">
            <span className="csv-file-icon"><Icon name="upload" size={25}/></span>
            <strong>{file ? file.name : 'Choose a CSV file'}</strong>
            <span>{file ? `${(file.size / 1024).toFixed(1)} KB · Ready to preview` : 'Browse your device or select a file'}</span>
            <input ref={fileInput} id="academic-csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={busy}/>
          </label>
          <div className="academic-form-actions csv-action-row"><button type="button" className="btn btn-primary" onClick={handlePreview} disabled={!file || busy}>{busy ? 'Checking…' : 'Preview CSV'} <Icon name="search" size={16}/></button></div>
        </div>

        <section className="academic-panel csv-import-review">
          <div className="academic-form-heading"><div><span className="academic-kicker">STEP 3 · REVIEW & IMPORT</span><h3>Import preview</h3><p>CourseHubs checks relationships and duplicates before saving anything.</p></div></div>
          {!preview && !result && <div className="academic-empty"><Icon name="file" size={27}/><strong>No file preview yet</strong><p>Choose a CSV file and select Preview CSV. Nothing is saved until you confirm the import.</p></div>}
          {preview && <>
            <div className="csv-summary-grid"><SummaryCard label="Ready to import" value={preview.summary?.ready ?? 0} tone="ready"/><SummaryCard label="Will be skipped" value={preview.summary?.skipped ?? 0} tone="skipped"/><SummaryCard label="Needs attention" value={preview.summary?.errors ?? 0} tone="errors"/></div>
            <div className="csv-review-heading"><strong>Row-by-row results</strong><span>{preview.summary?.total ?? preview.rows?.length ?? 0} data rows checked</span></div>
            <div className="csv-review-list" role="list" aria-label="CSV row validation results">{(preview.rows || []).map((row) => <article className={`csv-review-row csv-row-${row.status}`} key={row.line} role="listitem"><span className="csv-row-status"><Icon name={row.status === 'ready' ? 'checkCircle' : row.status === 'skipped' ? 'info' : 'alert'} size={15}/></span><div><strong>Row {row.line}: {row.label}</strong><span>{row.message}</span></div><small>{STATUS_LABELS[row.status] || row.status}</small></article>)}</div>
            {preview.summary?.errors > 0 && <p className="csv-review-guidance" role="alert">Correct the rows marked “Needs attention” in your spreadsheet, save the CSV, and preview it again. No rows have been imported.</p>}
            {preview.summary?.errors === 0 && preview.summary?.ready > 0 && <div className="csv-import-confirm"><p>Review complete. Existing records will be skipped; new records will be added without overwriting anything.</p><button type="button" className="btn btn-primary" onClick={handleImport} disabled={busy}>{busy ? 'Importing…' : `Import ${preview.summary.ready} record${preview.summary.ready === 1 ? '' : 's'}`} <Icon name="check" size={16}/></button></div>}
            {preview.summary?.errors === 0 && preview.summary?.ready === 0 && <p className="csv-review-guidance">There are no new records to import. All rows already exist or are duplicates within this file.</p>}
          </>}
          {result && <div className="csv-success-panel"><span><Icon name="checkCircle" size={25}/></span><strong>Academic data imported</strong><p>{result.created_count} record(s) were added to CourseHubs. {result.skipped_count} record(s) were safely skipped.</p><button type="button" className="academic-small-action" onClick={() => { setResult(null); setPreview(null); }}>Import another file</button></div>}
        </section>
      </section>

      <div className="academic-footnote"><Icon name="shield" size={16}/><span>Only administrators can use this temporary importer. Imports are validated again on the server and saved in a single database transaction. Existing records are never overwritten; if any row has an error, the entire import is blocked.</span></div>
    </main>
  );
}
