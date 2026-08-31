import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, HOME_FOR_ROLE, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import NoAccess from './pages/NoAccess';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCourses from './pages/admin/AdminCourses';
import CourseAllotment from './pages/admin/CourseAllotment';
import CandidateDetail from './pages/admin/CandidateDetail';
import AdminProjects from './pages/admin/AdminProjects';
import CourseList from './pages/trainer/CourseList';
import CourseDetail from './pages/trainer/CourseDetail';
import Inbox from './pages/trainer/Inbox';
import CourseProgress from './pages/trainer/CourseProgress';
import CourseProjects from './pages/trainer/CourseProjects';
import CourseSubmissions from './pages/trainer/CourseSubmissions';
import AllProjects from './pages/trainer/AllProjects';
import AllFeedback from './pages/trainer/AllFeedback';
import AllProgress from './pages/trainer/AllProgress';
import BrowseCourses from './pages/candidate/BrowseCourses';
import CandidateHome from './pages/candidate/CandidateHome';
import MyCourses from './pages/candidate/MyCourses';
import MyProgress from './pages/candidate/MyProgress';
import MyProjects from './pages/candidate/MyProjects';
import Notifications from './pages/candidate/Notifications';

/** Sends "/" to whichever home matches the signed-in role. */
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? HOME_FOR_ROLE[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/no-access" element={<NoAccess />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<RootRedirect />} />

              {/* Home stays a candidate's landing page — a lead already has
                  one at /trainer, and two competing homes is one too many. */}
              <Route element={<ProtectedRoute roles={['candidate']} />}>
                <Route path="/home" element={<CandidateHome />} />
              </Route>

              {/* The learner screens. Open to leads as well, who can be taught
                  a course they do not run; each one asks the API only about the
                  signed-in user, so the same page serves both. */}
              <Route element={<ProtectedRoute roles={['candidate', 'lead']} />}>
                <Route path="/browse" element={<BrowseCourses />} />
                <Route path="/my-courses" element={<MyCourses />} />
                <Route path="/my-progress" element={<MyProgress />} />
                <Route path="/my-projects" element={<MyProjects />} />
                <Route path="/inbox" element={<Notifications />} />
              </Route>

              <Route element={<ProtectedRoute roles={['trainer', 'lead', 'admin']} />}>
                <Route path="/trainer" element={<CourseList />} />
                <Route path="/trainer/inbox" element={<Inbox />} />
                <Route path="/trainer/projects" element={<AllProjects />} />
                <Route path="/trainer/feedback" element={<AllFeedback />} />
                <Route path="/trainer/progress" element={<AllProgress />} />
                <Route path="/trainer/courses/:courseId" element={<CourseDetail />} />
                <Route path="/trainer/courses/:courseId/progress" element={<CourseProgress />} />
                <Route path="/trainer/courses/:courseId/projects" element={<CourseProjects />} />
                <Route
                  path="/trainer/courses/:courseId/submissions"
                  element={<CourseSubmissions />}
                />
              </Route>

              <Route element={<ProtectedRoute roles={['admin']} />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/courses" element={<AdminCourses />} />
                <Route path="/admin/allotment" element={<CourseAllotment />} />
                <Route path="/admin/projects" element={<AdminProjects />} />
                <Route path="/admin/candidates/:userId" element={<CandidateDetail />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
