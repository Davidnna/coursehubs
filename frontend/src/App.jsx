import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider } from './auth/AuthContext';
import { GuestRoute, ProtectedRoute } from './auth/RouteGuards';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import CourseDetail from './pages/CourseDetail';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ResendVerification from './pages/ResendVerification';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import About from './pages/About';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout/>}>
            {/* Public pages: available without an account. */}
            <Route index element={<Home/>}/>
            <Route path="catalog" element={<Catalog/>}/>
            <Route path="courses/:id" element={<CourseDetail/>}/>
            <Route path="about" element={<About/>}/>

            {/* Login and registration are for guests; recovery links remain reachable. */}
            <Route element={<GuestRoute/>}>
              <Route path="login" element={<Login/>}/>
              <Route path="register" element={<Register/>}/>
            </Route>
            <Route path="verify-email" element={<VerifyEmail/>}/>
            <Route path="resend-verification" element={<ResendVerification/>}/>
            <Route path="forgot-password" element={<ForgotPassword/>}/>
            <Route path="reset-password" element={<ResetPassword/>}/>

            {/* Private application pages: authentication is required. */}
            <Route element={<ProtectedRoute/>}>
              <Route path="dashboard" element={<Dashboard/>}/>
              <Route path="upload" element={<Upload/>}/>
            </Route>

            <Route path="*" element={<NotFound/>}/>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
