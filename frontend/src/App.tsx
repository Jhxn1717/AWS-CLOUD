import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage       from './pages/LoginPage'
import DashboardPage   from './pages/DashboardPage'
import ProjectsPage    from './pages/ProjectsPage'
import ProjectDetail   from './pages/ProjectDetail'
import DeployPage      from './pages/DeployPage'
import LogsPage        from './pages/LogsPage'
import UsersPage       from './pages/UsersPage'
import Layout          from './components/Layout'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Cargando…</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/projects" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <PrivateRoute>
          <Layout />
        </PrivateRoute>
      }>
        <Route index element={<RoleHome />} />
        <Route path="dashboard" element={<AdminRoute><DashboardPage /></AdminRoute>} />
        <Route path="projects"               element={<ProjectsPage />} />
        <Route path="projects/:id"           element={<ProjectDetail />} />
        <Route path="projects/:id/deploy"    element={<DeployPage />} />
        <Route path="projects/:id/logs/:depId" element={<LogsPage />} />
        <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function RoleHome() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'admin' ? '/dashboard' : '/projects'} replace />
}
