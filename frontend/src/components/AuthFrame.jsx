import Icon from './Icon';

export default function AuthFrame({ eyebrow = 'YOUR COURSEHUBS ACCOUNT', title, highlight, description, children }) {
    return (
        <main className="auth-page login-page">
            <section className="auth-intro">
                <span className="auth-eyebrow"><span /> {eyebrow}</span>
                <h1>{title}<br /><em>{highlight}</em></h1>
                <p>{description}</p>
                <div className="auth-benefit"><Icon name="shield" size={20} /> A shared academic space for the EBSU community</div>
                <div className="auth-intro-foot">COURSEHUBS / EBSU COMMUNITY</div>
            </section>
            <section className="auth-panel auth-flow-panel">{children}</section>
        </main>
    );
}
