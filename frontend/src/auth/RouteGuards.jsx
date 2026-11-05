import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

function LoadingScreen() {
  return <main className="route-loading" role="status"><span className="loading-spinner"/><p>Checking your session…</p></main>;
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen/>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace/>;
  return <Outlet/>;
}

export function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen/>;
  if (user) return <Navigate to="/dashboard" replace/>;
  return <Outlet/>;
}
