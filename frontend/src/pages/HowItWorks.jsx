import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const steps = [
  { number: '01', title: 'Create your CourseHubs account', text: 'Choose the appropriate account type and provide the academic details requested during registration. Students provide their registration details and academic level; staff use their staff information.' },
  { number: '02', title: 'Verify your email address', text: 'CourseHubs sends a verification link to the email address used during registration. Open the message and follow the link to verify your account.' },
  { number: '03', title: 'Sign in to your workspace', text: 'After verification, sign in with your email address and password. The private workspace is available to authenticated members.' },
  { number: '04', title: 'Explore the academic tools', text: 'Use the course library and available workspace tools. Some resource-management and contribution capabilities are being introduced in stages.' },
];

export default function HowItWorks() {
  return <main className="marketing-inner-page">
    <section className="marketing-page-hero"><div className="marketing-eyebrow"><span/> GETTING STARTED</div><h1>From sign-up to<br/><em>your study workspace.</em></h1><p>Getting started with CourseHubs is straightforward. Create an account, verify your email and sign in to access the private platform.</p><div className="marketing-page-actions"><Link to="/register" className="btn btn-primary">Start registration <Icon name="arrowUpRight" size={17}/></Link><Link to="/contact" className="marketing-secondary-link">Need help? <Icon name="arrowRight" size={17}/></Link></div></section>
    <section className="marketing-steps-list">{steps.map((step) => <article key={step.number} className="marketing-step"><div className="marketing-step-number">{step.number}</div><div className="marketing-step-content"><h2>{step.title}</h2><p>{step.text}</p></div><span className="marketing-step-icon"><Icon name={step.number === '01' ? 'user' : step.number === '02' ? 'shield' : step.number === '03' ? 'lock' : 'layers'} size={23}/></span></article>)}</section>
    <section className="marketing-help-strip"><div><span className="marketing-eyebrow">ACCOUNT HELP</span><h2>Having trouble getting in?</h2><p>You can request another verification link or reset your password from the account assistance pages.</p></div><div className="marketing-help-actions"><Link to="/resend-verification" className="btn btn-outline">Resend verification</Link><Link to="/forgot-password" className="text-link">Reset password <Icon name="arrowUpRight" size={16}/></Link></div></section>
  </main>;
}
