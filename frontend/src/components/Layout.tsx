import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Box, LayoutDashboard, LogOut, Cloud, UserRoundCog } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

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
        <div className="workspace-label"><span className="workspace-mark">M</span><div><strong>Mi espacio de trabajo</strong><small>MyCloud Platform</small></div></div>
        <nav className="sidebar-nav">
          <span className="nav-section-label">PLATAFORMA</span>
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
          <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div className="workspace-topbar"><span>Espacio de trabajo <span className="topbar-divider">/</span> <strong>MyCloud</strong></span><div className="topbar-actions"><ThemeToggle /><span className="account-pill">{user?.role === 'admin' ? 'Administrador' : 'Usuario'}</span></div></div>
        <Outlet />
      </main>
    </div>
  )
}
