import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi, usersApi } from '../api/projects'
import { Project } from '../types'
import StatusBadge from '../components/StatusBadge'
import { ArrowUpRight, CircleDot, Cloud, PauseCircle, Plus, UsersRound } from 'lucide-react'

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [userCount, setUserCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function load() {
    try {
      const [p, users] = await Promise.all([projectsApi.list(), usersApi.list()])
      setProjects(p)
      setUserCount(users.length)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="loading-screen">Cargando dashboard…</div>

  const running = projects.filter(project => project.status === 'RUNNING').length
  const stopped = projects.filter(project => project.status === 'STOPPED').length
  const total = projects.length
  const recentProjects = projects.filter(project => project.status !== 'FAILED').slice(0, 6)

  return (
    <>
      <div className="page-header">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">CENTRO DE CONTROL</span>
            <h1>Dashboard</h1>
            <p>Estado general de tus aplicaciones desplegadas.</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/projects')}>
            <Plus size={17} />
            Nuevo proyecto
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="stats-grid dashboard-stats">
          <article className="metric-card metric-total">
            <span className="metric-icon"><Cloud size={20} /></span>
            <span className="metric-label">Proyectos totales</span>
            <strong className="metric-value">{total}</strong>
            <span className="metric-caption">En tu espacio de trabajo</span>
          </article>
          <article className="metric-card metric-running">
            <span className="metric-icon"><CircleDot size={20} /></span>
            <span className="metric-label">Proyectos activos</span>
            <strong className="metric-value">{running}</strong>
            <span className="metric-caption">Aplicaciones en ejecución</span>
          </article>
          <article className="metric-card metric-paused">
            <span className="metric-icon"><PauseCircle size={20} /></span>
            <span className="metric-label">Proyectos en pausa</span>
            <strong className="metric-value">{stopped}</strong>
            <span className="metric-caption">Detenidos temporalmente</span>
          </article>
          <article className="metric-card metric-users">
            <span className="metric-icon"><UsersRound size={20} /></span>
            <span className="metric-label">Usuarios del sistema</span>
            <strong className="metric-value">{userCount}</strong>
            <span className="metric-caption">Cuentas registradas</span>
          </article>
        </div>

        <div className="section-heading">
          <div>
            <span className="eyebrow">ACTIVIDAD</span>
            <h2>Proyectos recientes</h2>
          </div>
          <button className="text-action" onClick={() => navigate('/projects')}>
            Ver todos <ArrowUpRight size={16} />
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="empty-state">
            <Cloud size={80} />
            <h3>No hay proyectos aún</h3>
            <p>Ve a la sección de Proyectos para crear tu primer despliegue.</p>
            <button className="btn btn-primary" onClick={() => navigate('/projects')}>
              <Plus size={17} /> Crear proyecto
            </button>
          </div>
        ) : recentProjects.length === 0 ? (
          <div className="empty-state compact-empty">
            <Cloud size={42} />
            <h3>Sin actividad reciente</h3>
            <p>Los despliegues completados aparecerán aquí.</p>
          </div>
        ) : (
          <div className="recent-projects">
            {recentProjects.map(project => (
              <button
                className="recent-project"
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <span className="project-monogram">{project.name.slice(0, 1).toUpperCase()}</span>
                <span className="recent-project-main">
                  <strong>{project.name}</strong>
                  <small>{project.framework ?? project.runtime ?? 'Proyecto'}</small>
                </span>
                <StatusBadge status={project.status} />
                <span className="recent-project-date">
                  {new Date(project.updated_at).toLocaleDateString('es-PE')}
                </span>
                <ArrowUpRight className="recent-project-arrow" size={17} />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
