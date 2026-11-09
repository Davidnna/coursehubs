import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const questions = [
    { q: 'Who is CourseHubs for?', a: 'CourseHubs is developed for the Ebonyi State University community, including students, lecturers, staff and approved contributors.' },
    { q: 'Do I need an account to use CourseHubs?', a: 'You can explore the public website without signing in. An account and verified email address are required to enter the private workspace and use member tools.' },
    { q: 'How do I activate my account?', a: 'After registration, open the verification email sent to your registered address and follow the link. If the message does not arrive, check your spam folder. CourseHubs offers a resend option on the registration confirmation screen if email delivery fails, or after a sign-in attempt identifies an unverified account.' },
    { q: 'What if I forget my password?', a: 'On the sign-in page, select “Forgot password?” beside the password field. Enter the email address associated with your account and follow the password-reset instructions sent to you.' },
    { q: 'Can I upload course materials?', a: 'CourseHubs is designed to support contributions from approved members. The upload interface is present, but the complete file-storage and contributor-approval workflow is still under development.' },
    { q: 'Are all course resources currently available?', a: 'Not yet. The current course index contains demonstration records. The live course catalogue and resource storage will be connected as those modules are completed.' },
];

export default function FAQ() {
    return <main className="marketing-inner-page">
        <section className="marketing-page-hero"><div className="marketing-eyebrow"><span /> FREQUENTLY ASKED QUESTIONS</div><h1>Good questions.<br /><em>Clear answers.</em></h1><p>Find answers about CourseHubs accounts, access, verification and the current state of the platform.</p></section>
        <section className="marketing-faq-list">{questions.map((item, index) => <details className="marketing-faq-item" key={item.q} open={index === 0}><summary><span>{item.q}</span><Icon name="chevronDown" size={18} /></summary><p>{item.a}</p></details>)}</section>
        <section className="marketing-inline-cta"><div><h2>Still have a question?</h2><p>Visit the contact page for account help and academic enquiry guidance.</p></div><Link to="/contact" className="btn btn-primary">Contact & support <Icon name="arrowUpRight" size={17} /></Link></section>
    </main>;
}
