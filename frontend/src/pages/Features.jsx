import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const featureList = [
    { icon: 'book', title: 'Course-centred resource library', text: 'Keep learning materials associated with the courses and levels they support, making resources easier to browse in their academic context.', status: 'Platform direction' },
    { icon: 'search', title: 'Search and discovery', text: 'Find relevant materials by course code, course title, academic level or resource type instead of searching through unrelated conversations.', status: 'Platform direction' },
    { icon: 'fileQuestion', title: 'Different resource types', text: 'Support a more structured collection of lecture notes, course materials, past examination questions and model answers.', status: 'Platform direction' },
    { icon: 'shield', title: 'Verified member accounts', text: 'Student and staff registration includes email verification, with account recovery and protected sign-in workflows.', status: 'Available' },
    { icon: 'layers', title: 'Personal academic workspace', text: 'Give signed-in members a private area for their CourseHubs activity and academic tools.', status: 'Available' },
    { icon: 'upload', title: 'Community contributions', text: 'Provide a structured contribution workflow so approved members can help expand the shared resource collection.', status: 'In development' },
];

export default function Features() {
    return <main className="marketing-inner-page">
        <section className="marketing-page-hero"><div className="marketing-eyebrow"><span /> THE COURSEHUBS PLATFORM</div><h1>Everything organised<br /><em>around your courses.</em></h1><p>CourseHubs is designed to support the everyday academic resource needs of Ebonyi State University students and staff, from finding materials to contributing useful resources.</p><div className="marketing-page-actions"><Link to="/register" className="btn btn-primary">Create your account <Icon name="arrowUpRight" size={17} /></Link><Link to="/how-it-works" className="marketing-secondary-link">How it works <Icon name="arrowRight" size={17} /></Link></div></section>
        <section className="marketing-feature-list">{featureList.map((feature, index) => <article className="marketing-feature-row" key={feature.title}><div className="marketing-feature-number">0{index + 1}</div><div className="marketing-feature-symbol"><Icon name={feature.icon} size={24} /></div><div className="marketing-feature-copy"><h2>{feature.title}</h2><p>{feature.text}</p></div><span className={`marketing-feature-status ${feature.status === 'Available' ? 'is-available' : ''}`}>{feature.status}</span></article>)}</section>
        <div className="marketing-note"><Icon name="info" size={19} /><p><strong>Development transparency.</strong> CourseHubs is being released in stages. Account registration, verification and protected workspace access are available; the live resource catalogue, file management and contributor approval workflows are being developed separately.</p></div>
        <section className="marketing-inline-cta"><div><h2>Ready to access your academic workspace?</h2><p>Create an account and complete email verification to get started.</p></div><Link to="/register" className="btn btn-primary">Get started <Icon name="arrowUpRight" size={17} /></Link></section>
    </main>;
}
