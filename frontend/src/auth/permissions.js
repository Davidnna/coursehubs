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
