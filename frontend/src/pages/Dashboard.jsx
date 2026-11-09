import { Link, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
    const { user } = useAuth();
    const { canContributeResources = false, resourceAccess = null } = useOutletContext() || {};
    const fullName = [user?.first_name, user?.middle_name, user?.surname].filter(Boolean).join(' ');
    return <main className="standard-page workspace-page">
        <div className="breadcrumb"><Link to="/">Home</Link><Icon name="chevronRight" size={14} />My workspace</div>
        <div className="page-lead"><div className="page-eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL STUDY DESK</div><h1>Welcome back, <span>{user?.first_name || 'student'}.</span></h1><p>Your CourseHubs account is active. Your personal workspace is reserved for signed-in members.</p></div>
        <div className="workspace-hero"><div><span className="workspace-label"><Icon name="lock" size={16} /> PRIVATE ACCOUNT AREA</span><h2>Organize today.<br />Achieve more tomorrow.</h2><p>{fullName} · {user?.account_type === 'student' ? `${user.level || ''} Level student` : 'Staff account'} · {user?.email}</p><div className="dashboard-account-status"><span className="status-indicator" /> Email verified</div><Link to="/catalog" className="btn btn-lime">Explore courses <Icon name="arrowUpRight" size={18} /></Link></div><div className="workspace-art"><span>YOUR STUDY DESK</span><Icon name="layers" size={96} strokeWidth={1} /></div></div>
        {(user?.admin_scopes?.some((scope) => scope.scope_type === 'institution') || (user?.is_admin && !user?.admin_scopes?.length)) && <div className="next-step-strip admin-dashboard-strip"><div><strong>Academic administration</strong><p>Manage faculties, departments, degree programmes, academic sessions, courses and the courses assigned to each degree programme.</p></div><Link to="/admin/academics/overview" className="btn btn-primary">Open academic management <Icon name="arrowRight" size={17} /></Link></div>}
        <div className="workspace-grid">
            <div className="workspace-widget"><div className="widget-top"><span className="widget-symbol"><Icon name="bookmark" /></span><span className="widget-status">PERSONAL</span></div><h3>Saved resources</h3><p>Keep the materials you need close at hand.</p><div className="widget-placeholder"><Icon name="bookmark" size={18} /> Your saved list is ready for resources.</div></div>
            <div className="workspace-widget"><div className="widget-top"><span className="widget-symbol"><Icon name="clock" /></span><span className="widget-status">ACTIVITY</span></div><h3>Recent activity</h3><p>Pick up where you left off with your courses.</p><div className="widget-placeholder"><Icon name="clock" size={18} /> Activity tracking will appear here.</div></div>
            <div className="workspace-widget"><div className="widget-top"><span className="widget-symbol"><Icon name="user" /></span><span className="widget-status">ACCOUNT</span></div><h3>Account details</h3><p>{user?.email}</p><div className="widget-placeholder"><Icon name="shield" size={18} /> Verified CourseHubs member</div></div>
            {canContributeResources && <Link to="/upload" className="workspace-widget workspace-widget-action"><div className="widget-top"><span className="widget-symbol"><Icon name="upload" /></span><span className="widget-status">CONTRIBUTOR ACCESS</span></div><h3>Contribute resources</h3><p>{resourceAccess?.can_upload_assessments ? 'Submit course materials, past questions and model answers for review.' : 'Submit course materials for review.'}</p><span className="workspace-widget-link-label">Open contribution workspace <Icon name="arrowUpRight" size={16} /></span></Link>}
        </div>
        <div className="next-step-strip"><div><strong>Ready to explore?</strong><p>Your course library and academic tools are available inside this private workspace.</p></div><Link to="/catalog" className="btn btn-outline">Browse courses <Icon name="arrowRight" size={18} /></Link></div>
    </main>;
}
