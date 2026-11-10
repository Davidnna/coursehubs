export function canManageAcademicRecords(user) {
    const scopes = Array.isArray(user?.admin_scopes) ? user.admin_scopes : [];
    return scopes.length > 0 || Boolean(user?.is_admin);
}

export function hasInstitutionWideAccess(user) {
    const scopes = Array.isArray(user?.admin_scopes) ? user.admin_scopes : [];
    if (scopes.some((scope) => scope.scope_type === 'institution')) return true;
    return scopes.length === 0 && Boolean(user?.is_admin);
}

export function canCreateDepartments(user) {
    const scopes = Array.isArray(user?.admin_scopes) ? user.admin_scopes : [];
    return hasInstitutionWideAccess(user) || scopes.some((scope) => scope.scope_type === 'faculty');
}

export function canManageFacultyRecord(user, facultyId) {
    const scopes = Array.isArray(user?.admin_scopes) ? user.admin_scopes : [];
    if (hasInstitutionWideAccess(user)) return true;
    return scopes.some((scope) => (
        scope.scope_type === 'faculty' && Number(scope.scope_id) === Number(facultyId)
    ));
}

export function canManageDepartmentRecord(user, departmentId, facultyId = null) {
    const scopes = Array.isArray(user?.admin_scopes) ? user.admin_scopes : [];
    if (hasInstitutionWideAccess(user)) return true;
    return scopes.some((scope) => (
        (scope.scope_type === 'department' && Number(scope.scope_id) === Number(departmentId))
        || (scope.scope_type === 'faculty' && Number(scope.scope_id) === Number(facultyId))
    ));
}

export function canManageAdministrators(user) {
    const scopes = Array.isArray(user?.admin_scopes) ? user.admin_scopes : [];

    if (scopes.some((scope) => (
        scope.role === 'super_admin'
        && ['institution', 'faculty', 'department'].includes(scope.scope_type)
    ))) {
        return true;
    }

    // Compatibility for an older institution Super Admin session without
    // hydrated scope assignments. The server still enforces every action.
    return scopes.length === 0 && Boolean(user?.is_super_admin);
}
