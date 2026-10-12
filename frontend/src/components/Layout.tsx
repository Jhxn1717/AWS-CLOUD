import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Box, LayoutDashboard, LogOut, Cloud, UserRoundCog } from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Cloud className="logo-icon" size={32} strokeWidth={1.5} />
          <span>MyCloud</span>
        </div>
        <nav className="sidebar-nav">
          {user?.role === 'admin' && (
            <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
          )}
          <NavLink to="/projects" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Box size={18} />
            <span>Proyectos</span>
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/users" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <UserRoundCog size={18} />
              <span>Usuarios</span>
            </NavLink>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="user-info">
            <div className="user-name">{user?.name}</div>
            <div className="user-email">{user?.role === 'admin' ? 'Administrador' : 'Usuario'} · {user?.email}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
