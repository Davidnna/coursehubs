# Scoped administrator restoration — phase 1

This package introduces the first backend and interface layer for hierarchical administrator delegation, based on the latest CourseHubs source snapshot.

## Included

- `0010_scoped_administrator_authority.sql` creates institution, faculty and department administrator assignments and immutable assignment history.
- Existing administrators are migrated as institution-level assignments without changing academic records.
- The initial-super-admin bootstrap also creates an institution-level Super Admin assignment.
- Authentication exposes administrator scope assignments and distinguishes institution-wide access from scoped access.
- Administrator assignment endpoints support listing, active verified account lookup by email, assignment and revocation.
- Assignment and revocation require Super Administrator authority in the relevant scope. Self-scope expansion and removal of the last Super Administrator in a scope are blocked.
- An initial administrator-management page is available at `/admin/administrators`.

## Important deployment limitation

This is the first restoration layer, not the completed multi-scope rollout. Existing academic-management, staff-management, resource-moderation, CSV import and academic-correction controllers have not yet been converted to row-level faculty/department authorization and filtering. To prevent privilege escalation, `Auth::requireAdmin()` deliberately keeps those existing routes institution-only. Scoped administrators can manage delegated administrator assignments within their authority, but must not yet be given operational responsibility for the other management modules.

Do not promote scoped administrators for day-to-day academic, staff or resource management until the remaining controllers and frontend views have been scoped and tested. Existing institution-wide administrators retain their previous access.

## Validation performed

- PHP syntax validation passed for all 26 backend PHP files.
- Frontend production build was not verified because dependency installation did not complete in this environment.
- PostgreSQL migration execution and integration tests were not run. Apply and verify the migration in a staging database before production deployment.
