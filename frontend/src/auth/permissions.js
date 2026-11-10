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


function uniqueScopeNames(scopes, scopeType) {
    return [...new Set(scopes
        .filter((scope) => scope.scope_type === scopeType)
        .map((scope) => String(scope.scope_name || '').trim())
        .filter(Boolean))];
}

function namedScope(scopeType, name) {
    if (!name) return scopeType === 'department' ? 'your department' : 'your faculty';
    const prefix = scopeType === 'department' ? 'Department of ' : 'Faculty of ';
    return name.toLowerCase().startsWith(scopeType)
        ? name
        : `${prefix}${name}`;
}

export function getAdminWorkspaceContext(user) {
    if (!canManageAcademicRecords(user)) return null;

    const scopes = Array.isArray(user?.admin_scopes) ? user.admin_scopes : [];
    if (hasInstitutionWideAccess(user)) {
        return {
            scopeType: 'institution',
            shortLabel: 'Institution',
            scopeName: 'Ebonyi State University',
            workspaceLabel: 'INSTITUTION WORKSPACE',
            sidebarName: 'Ebonyi State University',
            description: 'Manage academic activity across the institution.',
        };
    }

    const facultyScopes = scopes.filter((scope) => scope.scope_type === 'faculty');
    const departmentScopes = scopes.filter((scope) => scope.scope_type === 'department');
    const facultyNames = uniqueScopeNames(scopes, 'faculty');
    const departmentNames = uniqueScopeNames(scopes, 'department');

    if (facultyScopes.length > 0 && departmentScopes.length > 0) {
        return {
            scopeType: 'multiple',
            shortLabel: 'Academic unit',
            scopeName: 'your assigned academic units',
            workspaceLabel: 'ACADEMIC WORKSPACE',
            sidebarName: 'Your academic units',
            description: 'Manage academic activity within your assigned units.',
        };
    }

    if (facultyScopes.length > 0) {
        const scopeName = facultyNames.length === 1
            ? namedScope('faculty', facultyNames[0])
            : 'your assigned faculties';
        return {
            scopeType: 'faculty',
            shortLabel: 'Faculty',
            scopeName,
            workspaceLabel: 'FACULTY WORKSPACE',
            sidebarName: scopeName,
            description: `Manage academic activity within ${scopeName}.`,
        };
    }

    if (departmentScopes.length > 0) {
        const scopeName = departmentNames.length === 1
            ? namedScope('department', departmentNames[0])
            : 'your assigned departments';
        return {
            scopeType: 'department',
            shortLabel: 'Department',
            scopeName,
            workspaceLabel: 'DEPARTMENT WORKSPACE',
            sidebarName: scopeName,
            description: `Manage academic activity within ${scopeName}.`,
        };
    }

    return null;
}
