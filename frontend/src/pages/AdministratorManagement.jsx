import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import { getAdminWorkspaceContext } from '../auth/permissions';
import {
    assignAdministrator,
    getAdministrators,
    getAcademicStructure,
    revokeAdministrator,
    searchAdministratorAccounts,
} from '../api/client';

export default function AdministratorManagement() {
    const { user } = useAuth();
    const workspaceContext = getAdminWorkspaceContext(user);
    const [administrators, setAdministrators] = useState([]);
    const [structure, setStructure] = useState({ faculties: [], departments: [] });
    const [email, setEmail] = useState('');
    const [account, setAccount] = useState(null);
    const [scopeType, setScopeType] = useState(() => user?.admin_scopes?.some((scope) => scope.scope_type === 'institution' && scope.role === 'super_admin') ? 'institution' : user?.admin_scopes?.some((scope) => scope.scope_type === 'faculty' && scope.role === 'super_admin') ? 'faculty' : 'department');
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
            const foundAccount = result.accounts?.[0] || null;
            setAccount(foundAccount);
            setScopeId('');
            const existingInstitutionAppointment = foundAccount?.administrator_assignments?.find(
                (assignment) => assignment.scope_type === 'institution',
            );
            setRole(existingInstitutionAppointment?.role || 'admin');
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
            const result = await assignAdministrator({
                user_id: account.id,
                scope_type: scopeType,
                scope_id: scopeType === 'institution' ? null : Number(scopeId),
                role,
            });
            setMessage(
                result.action === 'promoted'
                    ? 'The existing appointment has been promoted to Super Administrator.'
                    : result.action === 'demoted'
                        ? 'The existing appointment has been changed to Administrator.'
                        : 'Administrator access has been assigned.',
            );
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
    const delegationScopes = adminScopes.filter((scope) => scope.role === 'super_admin');
    const allowedFacultyIds = delegationScopes.filter((scope) => scope.scope_type === 'faculty').map((scope) => Number(scope.scope_id));
    const allowedDepartmentIds = delegationScopes.filter((scope) => scope.scope_type === 'department').map((scope) => Number(scope.scope_id));
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

    const existingAssignments = account?.administrator_assignments || [];
    const matchingAssignment = existingAssignments.find((assignment) => (
        assignment.scope_type === scopeType
        && (
            scopeType === 'institution'
                ? assignment.scope_id === null
                : Number(assignment.scope_id) === Number(scopeId)
        )
    ));
    const hasHierarchyConflict = Boolean(
        account && (
            scopeType === 'institution'
                ? account.has_scoped_assignments
                : account.has_institution_assignment
        )
    );
    const sameRoleAlreadyAssigned = Boolean(matchingAssignment && matchingAssignment.role === role);
    const isRoleChange = Boolean(matchingAssignment && matchingAssignment.role !== role);
    const assignmentDisabled = saving
        || hasHierarchyConflict
        || sameRoleAlreadyAssigned
        || (scopeType !== 'institution' && !scopeId);

    return <main className="standard-page workspace-page">
        <div className="breadcrumb"><Link to="/dashboard">{workspaceContext ? `${workspaceContext.shortLabel} workspace` : 'My workspace'}</Link><Icon name="chevronRight" size={14} />{workspaceContext?.scopeType === 'department' ? 'Department administrators' : workspaceContext?.scopeType === 'faculty' ? 'Faculty administrators' : workspaceContext?.scopeType === 'multiple' ? 'Academic unit administrators' : 'Administrator management'}</div>
        <div className="page-lead"><div className="page-eyebrow"><span className="eyebrow-line" /> {workspaceContext ? `${workspaceContext.shortLabel.toUpperCase()} ACCESS` : 'ACCESS GOVERNANCE'}</div><h1>{workspaceContext?.scopeType === 'department' ? 'Department' : workspaceContext?.scopeType === 'faculty' ? 'Faculty' : workspaceContext?.scopeType === 'multiple' ? 'Academic unit' : 'Administrator'} <span>administrators.</span></h1><p>{workspaceContext?.scopeType === 'department' || workspaceContext?.scopeType === 'faculty' ? `Manage administrator appointments for ${workspaceContext.scopeName}.` : workspaceContext?.scopeType === 'multiple' ? 'Manage administrator appointments within your assigned academic units.' : 'Assign and revoke administrative authority within the academic scopes you are permitted to manage.'}</p></div>

        {message && <div className="administrator-management-alert success" role="status">{message}</div>}
        {error && <div className="administrator-management-alert error" role="alert">{error}</div>}

        <section className="workspace-widget" style={{ marginBottom: 24 }}>
            <div className="widget-top"><span className="widget-symbol"><Icon name="users" /></span><span className="widget-status">NEW ASSIGNMENT</span></div>
            <h2>Assign administrator access</h2>
            <p className="administrator-policy-note">
                {workspaceContext?.scopeType === 'department'
                    ? `Appointments are limited to ${workspaceContext.scopeName}. Each person has one role per department.`
                    : workspaceContext?.scopeType === 'faculty'
                        ? `Appointments are limited to ${workspaceContext.scopeName} and its departments. Each person has one role per academic unit.`
                        : workspaceContext?.scopeType === 'multiple'
                            ? 'Appointments are limited to your assigned academic units. Each person has one role per academic unit.'
                            : 'A person may hold multiple authorised academic appointments. Institution-wide access cannot be combined with faculty or department appointments.'}
            </p>
            <form onSubmit={findAccount} className="administrator-management-form" style={{ marginTop: 18 }}>
                <label htmlFor="administrator-email">Account email address</label>
                <div className="form-row"><input id="administrator-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" required /><button className="btn btn-outline" type="submit">Find account</button></div>
            </form>
            {account && <form onSubmit={submitAssignment} className="administrator-management-form" style={{ marginTop: 18 }}>
                <p><strong>{[account.first_name, account.middle_name, account.surname].filter(Boolean).join(' ')}</strong> · {account.email} · {account.account_type}</p>
                {existingAssignments.length > 0 && <div className="administrator-existing-access">
                    <strong>Existing appointments within your authority</strong>
                    <ul>
                        {existingAssignments.map((assignment, index) => (
                            <li key={`${assignment.scope_type}-${assignment.scope_id ?? 'institution'}-${index}`}>
                                {scopeLabel(assignment)} — {assignment.role === 'super_admin' ? 'Super Administrator' : 'Administrator'}
                            </li>
                        ))}
                    </ul>
                </div>}
                {scopeType === 'institution' && account.has_scoped_assignments && <div className="administrator-policy-warning" role="alert">
                    This account already has another academic appointment that cannot be combined with this one. Review its existing access before continuing.
                </div>}
                {scopeType !== 'institution' && account.has_institution_assignment && <div className="administrator-policy-warning" role="alert">
                    This account already has another administrator appointment that cannot be combined with this one. Review its existing access before continuing.
                </div>}
                {sameRoleAlreadyAssigned && <div className="administrator-policy-warning" role="status">
                    This account already has the selected role in this scope.
                </div>}
                <label htmlFor="administrator-scope">Administrative scope</label>
                <select id="administrator-scope" value={scopeType} onChange={(event) => {
                    const nextScopeType = event.target.value;
                    setScopeType(nextScopeType);
                    setScopeId('');
                    const existing = existingAssignments.find((assignment) => assignment.scope_type === nextScopeType);
                    setRole(existing?.role || 'admin');
                }}>
                    {isInstitutionSuperAdmin && <option value="institution">Institution</option>}
                    {canManageFaculties && <option value="faculty">Faculty</option>}
                    {canManageDepartments && <option value="department">Department</option>}
                </select>
                {scopeType !== 'institution' && <>
                    <label htmlFor="administrator-scope-id">{scopeType === 'faculty' ? 'Faculty' : 'Department'}</label>
                    <select id="administrator-scope-id" value={scopeId} onChange={(event) => {
                        const nextScopeId = event.target.value;
                        setScopeId(nextScopeId);
                        const existing = existingAssignments.find((assignment) => (
                            assignment.scope_type === scopeType
                            && Number(assignment.scope_id) === Number(nextScopeId)
                        ));
                        setRole(existing?.role || 'admin');
                    }} required>
                        <option value="">Select a {scopeType}</option>
                        {scopes.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
                    </select>
                </>}
                <label htmlFor="administrator-role">Permission level</label>
                <select id="administrator-role" value={role} onChange={(event) => setRole(event.target.value)}>
                    <option value="admin">Administrator</option>
                    <option value="super_admin">Super Administrator</option>
                </select>
                <button className="btn btn-primary" type="submit" disabled={assignmentDisabled}>
                    {saving ? 'Saving…' : isRoleChange ? 'Update administrator role' : 'Assign administrator'}
                </button>
            </form>}
        </section>

        <section className="workspace-widget">
            <div className="widget-top"><span className="widget-symbol"><Icon name="shield" /></span><span className="widget-status">CURRENT ACCESS</span></div>
            <h2>Administrator assignments</h2>
            {administrators.some((item) => item.has_scope_hierarchy_conflict) && <div className="administrator-policy-warning" role="status">
                Some existing appointments overlap in a way that is no longer permitted. Review these assignments and remove any redundant access.
            </div>}
            {loading ? <p>Loading administrator assignments…</p> : administrators.length === 0 ? <p>No administrator assignments are available within your authority.</p> : <div className="administrator-management-table-wrap"><table className="administrator-management-table"><thead><tr><th>Administrator</th><th>Scope</th><th>Permission</th><th>Review</th><th>Action</th></tr></thead><tbody>
                {administrators.map((item) => <tr key={item.scope_assignment_id}><td><strong>{[item.first_name, item.middle_name, item.surname].filter(Boolean).join(' ')}</strong><small>{item.email}</small></td><td>{scopeLabel(item)}</td><td>{item.role === 'super_admin' ? 'Super Administrator' : 'Administrator'}</td><td>{item.has_scope_hierarchy_conflict ? <span className="administrator-conflict-label">Hierarchy conflict</span> : '—'}</td><td><button className="btn btn-outline" type="button" onClick={() => removeAssignment(item.scope_assignment_id)}>Revoke</button></td></tr>)}
            </tbody></table></div>}
        </section>
    </main>;
}
