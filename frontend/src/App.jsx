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
import CourseList from './pages/trainer/CourseList';
import CourseDetail from './pages/trainer/CourseDetail';
import Inbox from './pages/trainer/Inbox';
import CourseProgress from './pages/trainer/CourseProgress';
import BrowseCourses from './pages/candidate/BrowseCourses';
import CandidateHome from './pages/candidate/CandidateHome';
import MyCourses from './pages/candidate/MyCourses';
import MyProgress from './pages/candidate/MyProgress';

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

              <Route element={<ProtectedRoute roles={['candidate']} />}>
                <Route path="/home" element={<CandidateHome />} />
                <Route path="/browse" element={<BrowseCourses />} />
                <Route path="/my-courses" element={<MyCourses />} />
                <Route path="/my-progress" element={<MyProgress />} />
              </Route>

              <Route element={<ProtectedRoute roles={['trainer', 'admin']} />}>
                <Route path="/trainer" element={<CourseList />} />
                <Route path="/trainer/inbox" element={<Inbox />} />
                <Route path="/trainer/courses/:courseId" element={<CourseDetail />} />
                <Route path="/trainer/courses/:courseId/progress" element={<CourseProgress />} />
              </Route>

              <Route element={<ProtectedRoute roles={['admin']} />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/courses" element={<AdminCourses />} />
                <Route path="/admin/allotment" element={<CourseAllotment />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
