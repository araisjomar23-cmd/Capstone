import { Routes, Route } from 'react-router-dom'
import PublicLandingPage from './pages/user/PublicLandingPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminParticipants from './pages/admin/AdminParticipants'
import AdminActivities from './pages/admin/AdminActivities'
import AdminLogin from './pages/admin/AdminLogin'
import ProtectedRoute from './routes/ProtectedRoute'
import AdminLayout from './components/AdminLayout'
import AdminFacilitators from './pages/admin/AdminFacilitators'
import AdminBudget from './pages/admin/AdminBudget'
import AdminAttendance from './pages/admin/AdminAttendance'
import ActivityDetail from './pages/user/ActivityDetail'
import AdminEvaluations from './pages/admin/AdminEvaluations'
import SubmitEvaluation from './pages/user/SubmitEvaluation'
import AdminReports from './pages/admin/AdminReports'
import FacilitatorLayout from './components/FacilitatorLayout'
import FacilitatorDashboard from './pages/facilitator/FacilitatorDashboard'
import FacilitatorAttendance from './pages/facilitator/FacilitatorAttendance'
import FacilitatorParticipants from './pages/facilitator/FacilitatorParticipants'
import ParticipantSignup from './pages/user/ParticipantSignup'
import ParticipantDashboard from './pages/user/ParticipantDashboard'
import CompleteProfile from './pages/user/CompleteProfile'
import MyActivities from './pages/user/MyActivities'
import ParticipantProfile from './pages/user/ParticipantProfile'
import NotFound from './pages/NotFound'
import ParticipantEvaluations from './pages/user/ParticipantEvaluations'

function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicLandingPage />} />
      <Route path="/activities/:id" element={<ActivityDetail />} />
      <Route path="/signup" element={<ParticipantSignup />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/feedback" element={<ProtectedRoute allowedRoles={['participant']} loginPath="/admin/login" roleMismatchMessage="Evaluation is for participant accounts"><SubmitEvaluation /></ProtectedRoute>} />
      <Route path="/evaluate/:activityId" element={<ProtectedRoute allowedRoles={['participant']} loginPath="/signup" roleMismatchMessage="Evaluation is for participant accounts"><SubmitEvaluation /></ProtectedRoute>} />
      <Route path="/checkin/:activityId" element={<ProtectedRoute allowedRoles={['participant']} loginPath="/signup" roleMismatchMessage="Evaluation is for participant accounts"><SubmitEvaluation markAttendedOnSubmit /></ProtectedRoute>} />

      <Route
        path="/participant/complete-profile"
        element={
          <ProtectedRoute
            allowedRoles={['participant']}
            allowUnassignedRole
            roleMismatchMessage="This profile form is for participant accounts. Sign out of your staff account to register for activities."
          >
            <CompleteProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/participant"
        element={
          <ProtectedRoute allowedRoles={['participant']}>
            <ParticipantDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/participant/my-activities"
        element={
          <ProtectedRoute allowedRoles={['participant']}>
            <MyActivities />
          </ProtectedRoute>
        }
      />
      <Route
        path="/participant/evaluations"
        element={
          <ProtectedRoute allowedRoles={['participant']}>
            <ParticipantEvaluations />
          </ProtectedRoute>
        }
      />

      <Route
        path="/participant/profile"
        element={
          <ProtectedRoute allowedRoles={['participant']}>
            <ParticipantProfile />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['superadmin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="participants" element={<AdminParticipants />} />
        <Route path="activities" element={<AdminActivities />} />
        <Route path="facilitators" element={<AdminFacilitators />} />
        <Route path="budget" element={<AdminBudget />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="evaluations" element={<AdminEvaluations />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>
      <Route
        path="/admin/facilitator-portal"
        element={
          <ProtectedRoute allowedRoles={['facilitator']}>
            <FacilitatorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<FacilitatorDashboard />} />
        <Route path="attendance" element={<FacilitatorAttendance />} />
        <Route path="participants" element={<FacilitatorParticipants />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
