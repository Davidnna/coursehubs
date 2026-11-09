import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from './components/PublicLayout';
import WorkspaceLayout from './components/WorkspaceLayout';
import { AuthProvider } from './auth/AuthContext';
import { AdminRoute, GuestRoute, ProtectedRoute, StudentRoute } from './auth/RouteGuards';
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
import Account from './pages/Account';
import VerifyEmailChange from './pages/VerifyEmailChange';
import GoogleCallback from './pages/GoogleCallback';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import AcademicManagement from './pages/AcademicManagement';
import AcademicCsvImport from './pages/AcademicCsvImport';
import ResourceModeration from './pages/ResourceModeration';
import AcademicInformation from './pages/AcademicInformation';
import AcademicCorrectionModeration from './pages/AcademicCorrectionModeration';
import AcademicManagementBoundary from './components/AcademicManagementBoundary';
import { PageEffects, ScrollToTopButton } from './components/PageEffects';

export default function App() {
  return (
    <BrowserRouter>
      <PageEffects/>
      <ScrollToTopButton/>
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
            <Route path="privacy" element={<PrivacyPolicy/>}/>
            <Route path="terms" element={<TermsOfService/>}/>
            <Route element={<GuestRoute/>}>
              <Route path="login" element={<Login/>}/>
              <Route path="register" element={<Register/>}/>
            </Route>
            <Route path="verify-email" element={<VerifyEmail/>}/>
            <Route path="resend-verification" element={<ResendVerification/>}/>
            <Route path="forgot-password" element={<ForgotPassword/>}/>
            <Route path="reset-password" element={<ResetPassword/>}/>
            <Route path="verify-email-change" element={<VerifyEmailChange/>}/>
            <Route path="auth/google/callback" element={<GoogleCallback/>}/>
            <Route path="*" element={<NotFound/>}/>
          </Route>

          {/* All academic tools are private and require an authenticated account. */}
          <Route element={<ProtectedRoute/>}>
            <Route element={<WorkspaceLayout/>}>
              <Route path="dashboard" element={<Dashboard/>}/>
              <Route path="catalog" element={<Catalog/>}/>
              <Route path="courses/:id" element={<CourseDetail/>}/>
              <Route path="upload" element={<Upload/>}/>
              <Route element={<StudentRoute/>}><Route path="academic-information" element={<AcademicInformation/>}/></Route>
              <Route path="account" element={<Account/>}/>
              <Route element={<AdminRoute/>}>
                <Route path="admin/academics" element={<Navigate to="/admin/academics/overview" replace/>}/>
                <Route path="admin/academics/overview" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/import" element={<AcademicManagementBoundary><AcademicCsvImport/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure" element={<Navigate to="/admin/academics/structure/faculties" replace/>}/>
                <Route path="admin/academics/structure/faculties" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure/faculties/new" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure/faculties/:recordId/edit" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure/departments" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure/departments/new" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure/departments/:recordId/edit" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure/programmes" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure/programmes/new" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/structure/programmes/:recordId/edit" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/sessions" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/sessions/new" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/courses" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/courses/new" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/courses/:recordId/edit" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/offerings" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/offerings/new" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/offerings/:recordId/edit" element={<AcademicManagementBoundary><AcademicManagement/></AcademicManagementBoundary>}/>
                <Route path="admin/academics/*" element={<Navigate to="/admin/academics/overview" replace/>}/>
              <Route path="admin/resources" element={<ResourceModeration/>}/>
              <Route path="admin/academic-corrections" element={<AcademicCorrectionModeration/>}/>
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
