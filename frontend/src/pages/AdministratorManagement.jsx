import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import {
  assignAdministrator,
  getAdministrators,
  getAcademicStructure,
  revokeAdministrator,
  searchAdministratorAccounts,
} from '../api/client';

export default function AdministratorManagement() {
  const { user } = useAuth();
  const [administrators, setAdministrators] = useState([]);
  const [structure, setStructure] = useState({ faculties: [], departments: [] });
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState(null);
  const [scopeType, setScopeType] = useState(() => user?.admin_scopes?.some((scope) => scope.scope_type === 'institution' && scope.role === 'super_admin') ? 'institution' : user?.admin_scopes?.some((scope) => scope.scope_type === 'faculty') ? 'faculty' : 'department');
  const [scopeId, setScopeId] = useState('');
  const [role, setRole] = useState('admin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isInstitutionSuperAdmin = useMemo(
    () => (user?.admin_scopes || []).some((scope) => scope.scope_type === 'institution' && scope.role === 'super_admin'),
    [user],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [adminResult, structureResult] = await Promise.all([getAdministrators(), getAcademicStructure()]);
      setAdministrators(adminResult.administrators || []);
      setStructure(structureResult || { faculties: [], departments: [] });
    } catch (requestError) {
      setError(requestError.message || 'Administrator information could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function findAccount(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setAccount(null);
    try {
      const result = await searchAdministratorAccounts(email.trim());
      setAccount(result.accounts?.[0] || null);
      if (!result.accounts?.length) setError('No active, verified account was found for that email address.');
    } catch (requestError) {
      setError(requestError.message || 'The account could not be found.');
    }
  }

  async function submitAssignment(event) {
    event.preventDefault();
    if (!account) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await assignAdministrator({
        user_id: account.id,
        scope_type: scopeType,
        scope_id: scopeType === 'institution' ? null : Number(scopeId),
        role,
      });
      setMessage('Administrator access has been assigned.');
      setAccount(null);
      setEmail('');
      await refresh();
    } catch (requestError) {
      setError(requestError.message || 'The administrator assignment could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(id) {
    if (!window.confirm('Revoke this administrator assignment?')) return;
    setError('');
    setMessage('');
    try {
      await revokeAdministrator(id);
      setMessage('Administrator access has been revoked.');
      await refresh();
    } catch (requestError) {
      setError(requestError.message || 'The assignment could not be revoked.');
    }
  }

  const adminScopes = user?.admin_scopes || [];
  const allowedFacultyIds = adminScopes.filter((scope) => scope.scope_type === 'faculty').map((scope) => Number(scope.scope_id));
  const allowedDepartmentIds = adminScopes.filter((scope) => scope.scope_type === 'department').map((scope) => Number(scope.scope_id));
  const canManageAllAcademicScopes = isInstitutionSuperAdmin;
  const canManageFaculties = canManageAllAcademicScopes || allowedFacultyIds.length > 0;
  const canManageDepartments = canManageAllAcademicScopes || allowedFacultyIds.length > 0 || allowedDepartmentIds.length > 0;
  const scopes = scopeType === 'faculty'
    ? structure.faculties.filter((item) => canManageAllAcademicScopes || allowedFacultyIds.includes(Number(item.id)))
    : structure.departments.filter((item) => canManageAllAcademicScopes || allowedDepartmentIds.includes(Number(item.id)) || allowedFacultyIds.includes(Number(item.faculty_id)));
  const scopeLabel = (row) => row.scope_type === 'institution'
    ? 'Institution'
    : row.scope_type === 'faculty'
      ? row.faculty_name || `Faculty #${row.scope_id}`
      : row.department_name || `Department #${row.scope_id}`;

  return <main className="standard-page workspace-page">
    <div className="breadcrumb"><Link to="/dashboard">My workspace</Link><Icon name="chevronRight" size={14}/>Administrator management</div>
    <div className="page-lead"><div className="page-eyebrow"><span className="eyebrow-line"/> ACCESS GOVERNANCE</div><h1>Administrator <span>management.</span></h1><p>Assign and revoke administrative authority within the academic scopes you are permitted to manage.</p></div>

    {message && <div className="administrator-management-alert success" role="status">{message}</div>}
    {error && <div className="administrator-management-alert error" role="alert">{error}</div>}

    <section className="workspace-widget" style={{ marginBottom: 24 }}>
      <div className="widget-top"><span className="widget-symbol"><Icon name="users"/></span><span className="widget-status">NEW ASSIGNMENT</span></div>
      <h2>Assign administrator access</h2>
      <form onSubmit={findAccount} className="administrator-management-form" style={{ marginTop: 18 }}>
        <label htmlFor="administrator-email">Account email address</label>
        <div className="form-row"><input id="administrator-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" required/><button className="btn btn-outline" type="submit">Find account</button></div>
      </form>
      {account && <form onSubmit={submitAssignment} className="administrator-management-form" style={{ marginTop: 18 }}>
        <p><strong>{[account.first_name, account.middle_name, account.surname].filter(Boolean).join(' ')}</strong> · {account.email} · {account.account_type}</p>
        <label htmlFor="administrator-scope">Administrative scope</label>
        <select id="administrator-scope" value={scopeType} onChange={(event) => { setScopeType(event.target.value); setScopeId(''); }}>
          {isInstitutionSuperAdmin && <option value="institution">Institution</option>}
          {canManageFaculties && <option value="faculty">Faculty</option>}
          {canManageDepartments && <option value="department">Department</option>}
        </select>
        {scopeType !== 'institution' && <>
          <label htmlFor="administrator-scope-id">{scopeType === 'faculty' ? 'Faculty' : 'Department'}</label>
          <select id="administrator-scope-id" value={scopeId} onChange={(event) => setScopeId(event.target.value)} required>
            <option value="">Select a {scopeType}</option>
            {scopes.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
          </select>
        </>}
        <label htmlFor="administrator-role">Permission level</label>
        <select id="administrator-role" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="admin">Administrator</option>
          <option value="super_admin">Super Administrator</option>
        </select>
        <button className="btn btn-primary" type="submit" disabled={saving || (scopeType !== 'institution' && !scopeId)}>{saving ? 'Assigning…' : 'Assign administrator'}</button>
      </form>}
    </section>

    <section className="workspace-widget">
      <div className="widget-top"><span className="widget-symbol"><Icon name="shield"/></span><span className="widget-status">CURRENT ACCESS</span></div>
      <h2>Administrator assignments</h2>
      {loading ? <p>Loading administrator assignments…</p> : administrators.length === 0 ? <p>No administrator assignments are available within your authority.</p> : <div className="administrator-management-table-wrap"><table className="administrator-management-table"><thead><tr><th>Administrator</th><th>Scope</th><th>Permission</th><th>Action</th></tr></thead><tbody>
        {administrators.map((item) => <tr key={item.scope_assignment_id}><td><strong>{[item.first_name, item.middle_name, item.surname].filter(Boolean).join(' ')}</strong><small>{item.email}</small></td><td>{scopeLabel(item)}</td><td>{item.role === 'super_admin' ? 'Super Administrator' : 'Administrator'}</td><td><button className="btn btn-outline" type="button" onClick={() => removeAssignment(item.scope_assignment_id)}>Revoke</button></td></tr>)}
      </tbody></table></div>}
    </section>
  </main>;
}
