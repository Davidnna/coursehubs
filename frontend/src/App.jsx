import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PublicLayout from './components/PublicLayout';
import WorkspaceLayout from './components/WorkspaceLayout';
import { AuthProvider } from './auth/AuthContext';
import { GuestRoute, ProtectedRoute } from './auth/RouteGuards';
import Home from './pages/Home';
import About from './pages/About';
import Features from './pages/Features';
import HowItWorks from './pages/HowItWorks';
import Contact from './pages/Contact';
import FAQ from './pages/FAQ';
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
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public marketing website and account-entry pages. */}
          <Route element={<PublicLayout/>}>
            <Route index element={<Home/>}/>
            <Route path="about" element={<About/>}/>
            <Route path="features" element={<Features/>}/>
            <Route path="how-it-works" element={<HowItWorks/>}/>
            <Route path="contact" element={<Contact/>}/>
            <Route path="faq" element={<FAQ/>}/>
            <Route element={<GuestRoute/>}>
              <Route path="login" element={<Login/>}/>
              <Route path="register" element={<Register/>}/>
            </Route>
            <Route path="verify-email" element={<VerifyEmail/>}/>
            <Route path="resend-verification" element={<ResendVerification/>}/>
            <Route path="forgot-password" element={<ForgotPassword/>}/>
            <Route path="reset-password" element={<ResetPassword/>}/>
            <Route path="*" element={<NotFound/>}/>
          </Route>

          {/* All academic tools are private and require an authenticated account. */}
          <Route element={<ProtectedRoute/>}>
            <Route element={<WorkspaceLayout/>}>
              <Route path="dashboard" element={<Dashboard/>}/>
              <Route path="catalog" element={<Catalog/>}/>
              <Route path="courses/:id" element={<CourseDetail/>}/>
              <Route path="upload" element={<Upload/>}/>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
