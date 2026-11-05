import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const features = [
  { icon: 'book', title: 'Course-centred library', text: 'Resources are organized around the Computer Science courses students take.' },
  { icon: 'search', title: 'Find materials faster', text: 'A searchable repository reduces the need to hunt through scattered chat messages.' },
  { icon: 'shield', title: 'Account-based access', text: 'Personal workspaces and contribution tools are reserved for signed-in users.' },
];

export default function About() {
  return <main className="standard-page about-page">
    <div className="breadcrumb"><Link to="/">Home</Link><Icon name="chevronRight" size={14}/>About CourseHubs</div>
    <div className="page-lead"><div className="page-eyebrow"><span className="eyebrow-line"/> ABOUT THE PLATFORM</div><h1>Academic resources,<br/><span>in one shared place.</span></h1><p>CourseHubs is a centralized academic resource repository designed for the Department of Computer Science at Ebonyi State University.</p></div>
    <section className="about-mission"><span className="section-kicker">WHY COURSEHUBS EXISTS</span><h2>Less time searching.<br/><em>More time learning.</em></h2><p>Students often receive lecture materials, past questions and model answers through separate groups and personal contacts. CourseHubs is being developed to bring those resources into one organized, searchable space.</p><Link to="/catalog" className="btn btn-primary">Explore the public catalog <Icon name="arrowRight" size={18}/></Link></section>
    <section className="about-feature-grid">{features.map((feature) => <article className="workspace-widget" key={feature.title}><span className="widget-symbol"><Icon name={feature.icon}/></span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</section>
    <div className="catalog-disclaimer"><Icon name="info" size={20}/><div><strong>Development status</strong><p>The public homepage, course index and course-detail previews are accessible without an account. Authenticated workspaces are protected. Live course and document-management features will be enabled as their backend modules are completed.</p></div></div>
  </main>;
}
