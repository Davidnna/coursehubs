import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

export default function Contact() {
    return <main className="marketing-inner-page">
        <section className="marketing-page-hero"><div className="marketing-eyebrow"><span /> CONTACT & SUPPORT</div><h1>How can we<br /><em>help you?</em></h1><p>Choose the support route that best matches what you need. CourseHubs is developed for the Ebonyi State University community, with account assistance available directly through the platform.</p></section>
        <section className="marketing-contact-grid">
            <article className="marketing-contact-card"><span className="marketing-contact-icon"><Icon name="mail" size={23} /></span><span className="marketing-contact-kicker">ACCOUNT ACCESS</span><h2>Sign-in or verification help</h2><p>Start from the sign-in page. CourseHubs displays password-recovery or email-verification options when they apply to your account.</p><Link to="/login" className="marketing-contact-external">Go to sign in <Icon name="arrowUpRight" size={16} /></Link></article>
            <article className="marketing-contact-card"><span className="marketing-contact-icon"><Icon name="graduation" size={23} /></span><span className="marketing-contact-kicker">ACADEMIC ENQUIRIES</span><h2>Course or resource questions</h2><p>For questions about course content, academic records or departmental matters, use the the relevant faculty or department through official Ebonyi State University channels.</p><a href="https://www.ebsu.edu.ng/" className="marketing-contact-external" target="_blank" rel="noreferrer">Visit EBSU website <Icon name="external" size={16} /></a></article>
            <article className="marketing-contact-card"><span className="marketing-contact-icon"><Icon name="shield" size={23} /></span><span className="marketing-contact-kicker">PLATFORM & SECURITY</span><h2>Account and security concerns</h2><p>Never share your password or verification links with anyone. If you are signed in, manage your password in Account settings. If you cannot sign in, use the recovery option shown on the sign-in page.</p></article>
        </section>
        <div className="marketing-contact-note"><Icon name="mail" size={19} /><p><strong>Contact CourseHubs.</strong> For platform support, privacy requests or questions about these terms, email <a href="mailto:support@coursehubs.nylas.email">support@coursehubs.nylas.email</a>. Please do not send passwords, verification links or other sensitive sign-in information.</p></div>
        <section className="marketing-inline-cta"><div><h2>Still need help?</h2><p>Visit the getting-started guide for registration, verification and sign-in instructions.</p></div><Link to="/how-it-works" className="btn btn-primary">View help guide <Icon name="arrowUpRight" size={17} /></Link></section>
    </main>;
}
