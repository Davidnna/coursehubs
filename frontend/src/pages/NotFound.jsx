import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

export default function NotFound() {
    return <main className="empty-page"><span className="error-number">404</span><h1>Nothing here. Yet.</h1><p>That page doesn't exist in the CourseHubs index.</p><Link className="btn btn-primary" to="/">Back to homepage <Icon name="arrowRight" size={18} /></Link></main>;
}
