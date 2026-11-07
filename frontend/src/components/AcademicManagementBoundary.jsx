import { Component } from 'react';
import { Link } from 'react-router-dom';

export default class AcademicManagementBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics in the browser console for developers; never expose them in the UI.
    console.error('Academic management interface error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="standard-page academic-page academic-error-fallback" role="alert">
          <span className="page-eyebrow">ACADEMIC MANAGEMENT</span>
          <h1>This section could not be displayed.</h1>
          <p>Your account and academic records have not been changed. Refresh the page and try again.</p>
          <div className="academic-form-actions">
            <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
              Refresh page
            </button>
            <Link className="btn btn-outline" to="/dashboard">Return to dashboard</Link>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
