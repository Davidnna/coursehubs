import { Link } from 'react-router-dom';
import Icon from './Icon';

export default function CourseCard({ course, variant = 'default' }) {
    const subtitle = [course.department_name, course.programme_name].filter(Boolean).join(' · ');
    return (
        <Link to={`/courses/${course.id}${course.offering_id ? `?offering=${course.offering_id}` : ''}`} className={`course-card course-card-${variant}`}>
            <div className="course-card-top"><span className="course-code">{course.code}</span><span className="course-level">{course.level} LEVEL</span></div>
            <div className="course-card-middle"><span className="course-icon"><Icon name="book" size={23} /></span><h3>{course.title}</h3><p>{subtitle || course.session_name || 'Academic course'} <span className="meta-divider">·</span> {course.semester} semester</p></div>
            <div className="course-card-bottom"><span className="type-chip">{course.type || 'Course'} · {course.credit_units} units</span><span className="course-card-arrow"><Icon name="arrowUpRight" size={19} /></span></div>
        </Link>
    );
}
