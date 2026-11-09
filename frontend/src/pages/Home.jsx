import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const benefits = [
    { icon: 'book', number: '01', title: 'Course resources in context', text: 'Keep lecture notes, course materials, past questions and study resources organised around the courses they support.' },
    { icon: 'search', number: '02', title: 'Less searching, more studying', text: 'Find resources by course, level or resource type instead of digging through scattered chats and personal folders.' },
    { icon: 'upload', number: '03', title: 'A shared academic library', text: 'Give approved contributors a clear way to help build a useful resource collection for the department.' },
];

const audiences = [
    { icon: 'graduation', title: 'For students', text: 'Find course-related materials, keep your academic resources together and return to your study workspace whenever you need it.' },
    { icon: 'user', title: 'For lecturers and staff', text: 'Support a more organised way to share course resources and guide students towards relevant learning materials.' },
    { icon: 'layers', title: 'For contributors', text: 'Help grow a shared library through a structured contribution process for approved members.' },
];

export default function Home() {
    return (
        <main className="marketing-home">
            <section className="marketing-hero">
                <div className="marketing-hero-copy">
                    <div className="marketing-eyebrow"><span /> ACADEMIC RESOURCES, BETTER ORGANISED</div>
                    <h1>Your academic resources.<br /><em>All in one place.</em></h1>
                    <p className="marketing-hero-description">CourseHubs is a shared academic resource platform for the Ebonyi State University community. Find course materials, organise your learning and make useful resources easier to access.</p>
                    <div className="marketing-hero-actions"><Link to="/register" className="btn btn-primary">Create your account <Icon name="arrowUpRight" size={18} /></Link><Link to="/how-it-works" className="marketing-secondary-link">See how it works <Icon name="arrowRight" size={17} /></Link></div>
                    <div className="marketing-hero-meta"><span><Icon name="shield" size={16} /> Account-based access</span><i /><span><Icon name="graduation" size={16} /> Built for EBSU students and staff</span></div>
                </div>
                <div className="marketing-hero-visual" aria-label="Illustration of an organised academic resource workspace">
                    <div className="marketing-visual-glow" />
                    <div className="marketing-visual-orbit marketing-visual-orbit-one" /><div className="marketing-visual-orbit marketing-visual-orbit-two" />
                    <div className="marketing-window">
                        <div className="marketing-window-top"><div className="marketing-window-dots"><i /><i /><i /></div><span>YOUR STUDY SPACE</span><Icon name="grid" size={16} /></div>
                        <div className="marketing-window-welcome"><div><small>COURSEHUBS WORKSPACE</small><strong>Everything in its place.</strong></div><span className="marketing-window-avatar">CH</span></div>
                        <div className="marketing-window-search"><Icon name="search" size={16} /><span>Find a course or resource</span><kbd>/</kbd></div>
                        <div className="marketing-window-label">EXPLORE YOUR LIBRARY</div>
                        <div className="marketing-window-cards">
                            <div><span className="window-card-icon window-card-blue"><Icon name="book" size={18} /></span><strong>Course materials</strong><small>Organised by course</small></div>
                            <div><span className="window-card-icon window-card-lime"><Icon name="fileQuestion" size={18} /></span><strong>Past questions</strong><small>Prepare with context</small></div>
                            <div><span className="window-card-icon window-card-purple"><Icon name="layers" size={18} /></span><strong>Study resources</strong><small>One shared library</small></div>
                        </div>
                        <div className="marketing-window-foot"><span><i /> PRIVATE MEMBER WORKSPACE</span><Icon name="arrowUpRight" size={17} /></div>
                    </div>
                    <div className="marketing-floating-note"><span><Icon name="checkCircle" size={18} /></span><div><strong>Less time searching</strong><small>More time learning</small></div></div>
                    <div className="marketing-visual-caption">A clearer way to manage your academic resources.</div>
                </div>
            </section>

            <section className="marketing-trust-strip"><span>DESIGNED FOR THE EBSU COMMUNITY</span><span><i /> STUDENT-CENTRED</span><span><i /> COURSE-ORGANISED</span><span><i /> COMMUNITY-LED</span></section>

            <section className="marketing-section marketing-benefits-section">
                <div className="marketing-section-heading"><div><div className="marketing-eyebrow marketing-eyebrow-light">WHY COURSEHUBS</div><h2>Make academic resources<br /><em>easier to find and use.</em></h2></div><p>CourseHubs brings structure to the way course-related learning resources are discovered, organised and shared.</p></div>
                <div className="marketing-benefit-grid">{benefits.map((item) => <article className="marketing-benefit-card" key={item.number}><div className="marketing-benefit-top"><span className="marketing-benefit-icon"><Icon name={item.icon} size={22} /></span><span>{item.number}</span></div><h3>{item.title}</h3><p>{item.text}</p><Link to="/features">Explore features <Icon name="arrowUpRight" size={16} /></Link></article>)}</div>
            </section>

            <section className="marketing-section marketing-audience-section">
                <div className="marketing-section-heading"><div><div className="marketing-eyebrow">BUILT AROUND YOUR ACADEMIC COMMUNITY</div><h2>One platform.<br /><em>Different ways to contribute.</em></h2></div><p>Whether you are learning, teaching or helping maintain the resource library, CourseHubs is designed to support a more connected academic community.</p></div>
                <div className="marketing-audience-grid">{audiences.map((item) => <article key={item.title}><span className="marketing-audience-icon"><Icon name={item.icon} size={22} /></span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
            </section>

            <section className="marketing-process-section">
                <div className="marketing-process-copy"><div className="marketing-eyebrow marketing-eyebrow-light">GET STARTED IN A FEW STEPS</div><h2>Your study space<br /><em>starts with an account.</em></h2><p>Create an account with your academic details, verify your email address and sign in to access the CourseHubs workspace.</p><Link to="/how-it-works" className="btn btn-light">View the process <Icon name="arrowUpRight" size={17} /></Link></div>
                <div className="marketing-process-steps"><div><span>01</span><section><strong>Create your account</strong><p>Register with your student or staff details.</p></section></div><div><span>02</span><section><strong>Verify your email</strong><p>Confirm your email address to activate access.</p></section></div><div><span>03</span><section><strong>Enter your workspace</strong><p>Sign in to explore the private academic platform.</p></section></div></div>
            </section>

            <section className="marketing-final-cta"><div><div className="marketing-eyebrow">START WITH COURSEHUBS</div><h2>Make your next study session<br /><em>a little more organised.</em></h2><p>Create your account to access the CourseHubs academic workspace.</p></div><Link to="/register" className="btn btn-primary">Get started <Icon name="arrowUpRight" size={18} /></Link></section>
        </main>
    );
}
