import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { usersApi } from '../api/projects'
import { Project, User } from '../types'
import StatusBadge from '../components/StatusBadge'
import { ArrowUpRight, Box, CircleDot, Clock3, PauseCircle, Plus, RefreshCw, Search, UsersRound } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

type ProjectFilter = 'all' | 'active' | 'paused' | 'deploying'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedOwner, setSelectedOwner] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  async function load() {
    try {
      const [p, accountList] = await Promise.all([
        projectsApi.list(),
        isAdmin ? usersApi.list() : Promise.resolve([] as User[]),
      ])
      setProjects(p)
      setUsers(accountList)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar proyectos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [isAdmin])

  const counts = {
    all: projects.length,
    active: projects.filter(project => project.status === 'RUNNING').length,
    paused: projects.filter(project => project.status === 'STOPPED').length,
    deploying: projects.filter(project => ['ANALYZING', 'BUILDING', 'STARTING'].includes(project.status)).length,
  }
  const ownerProjects = selectedOwner === 'all'
    ? projects
    : projects.filter(project => project.user_id === selectedOwner)
  const visibleProjects = ownerProjects.filter(project => {
    const matchesFilter = filter === 'all' ||
      (filter === 'active' && project.status === 'RUNNING') ||
      (filter === 'paused' && project.status === 'STOPPED') ||
      (filter === 'deploying' && ['ANALYZING', 'BUILDING', 'STARTING'].includes(project.status))
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [project.name, project.slug, project.framework, project.runtime]
      .some(value => value?.toLowerCase().includes(query))
    return matchesFilter && matchesSearch
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const p = await projectsApi.create(name.trim(), desc.trim() || undefined)
      setShowForm(false)
      setName('')
      setDesc('')
      navigate(`/projects/${p.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear proyecto')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <div className="loading-screen">Cargando proyectos…</div>

  return (
    <>
      <div className="page-header">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">ESPACIO DE TRABAJO</span>
            <h1>Proyectos</h1>
            <p>Aplicaciones y despliegues de tu plataforma.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={17} /> {showForm ? 'Cancelar' : 'Nuevo proyecto'}
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="project-toolbar">
          <div className="project-tabs" role="tablist" aria-label="Filtrar proyectos">
            {([
              ['all', 'Todos', Box],
              ['active', 'Activos', CircleDot],
              ['paused', 'En pausa', PauseCircle],
              ['deploying', 'Desplegando', Clock3],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                className={`project-tab${filter === value ? ' selected' : ''}`}
                onClick={() => setFilter(value)}
                role="tab"
                aria-selected={filter === value}
              >
                <Icon size={16} />
                <span>{label}</span>
                <span className="tab-count">{counts[value]}</span>
              </button>
            ))}
          </div>
          <div className="project-tools">
            <label className="project-search">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar proyecto"
                aria-label="Buscar proyecto"
              />
            </label>
            <button className="icon-button" onClick={load} title="Actualizar proyectos" aria-label="Actualizar proyectos">
            <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {isAdmin && (
          <section className="owner-project-section">
            <div className="owner-project-heading">
              <div>
                <span className="eyebrow">ORGANIZACIÓN</span>
                <h2><UsersRound size={19} /> Proyectos por usuario</h2>
              </div>
              <span className="owner-project-total">{ownerProjects.length} proyectos</span>
            </div>
            <div className="owner-tabs" role="tablist" aria-label="Proyectos por usuario">
              <button
                className={`owner-tab${selectedOwner === 'all' ? ' selected' : ''}`}
                onClick={() => setSelectedOwner('all')}
                role="tab"
                aria-selected={selectedOwner === 'all'}
              >
                Todos <span>{projects.length}</span>
              </button>
              {users.map(account => {
                const ownedCount = projects.filter(project => project.user_id === account.id).length
                return (
                  <button
                    className={`owner-tab${selectedOwner === account.id ? ' selected' : ''}`}
                    key={account.id}
                    onClick={() => setSelectedOwner(account.id)}
                    role="tab"
                    aria-selected={selectedOwner === account.id}
                  >
                    {account.name} <span>{ownedCount}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {showForm && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="section-title">
              <Plus size={18} />
              Crear Nuevo Proyecto
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Nombre del Proyecto *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: mi-app-react"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input
                  type="text"
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Opcional: Describe tu proyecto"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? (
                  <>
                    <span className="spinner" />
                    Creando...
                  </>
                ) : (
                  'Crear Proyecto'
                )}
              </button>
            </form>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="empty-state">
            <Box size={56} />
            <h3>No hay proyectos aún</h3>
            <p>Crea un proyecto para comenzar tu próximo despliegue.</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={17} /> Crear proyecto</button>
          </div>
        ) : ownerProjects.length === 0 ? (
          <div className="empty-state compact-empty">
            <Box size={40} />
            <h3>Este usuario aún no tiene proyectos</h3>
            <p>Selecciona otra pestaña para ver proyectos de otra cuenta.</p>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="empty-state compact-empty">
            <Search size={40} />
            <h3>No se encontraron proyectos</h3>
            <p>Prueba con otro filtro o término de búsqueda.</p>
          </div>
        ) : (
          <div className="project-grid">
            {visibleProjects.map(project => (
              <article className="project-card" key={project.id}>
                <div className="project-card-top">
                  <span className="project-monogram">{project.name.slice(0, 1).toUpperCase()}</span>
                  <StatusBadge status={project.status} />
                  <button
                    className="icon-button project-open"
                    onClick={() => navigate(`/projects/${project.id}`)}
                    title={`Abrir ${project.name}`}
                    aria-label={`Abrir ${project.name}`}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </div>
                <button className="project-card-title" onClick={() => navigate(`/projects/${project.id}`)}>
                  {project.name}
                </button>
                <p className="project-slug">{project.slug}</p>
                <div className="project-card-meta">
                  <span>{project.runtime ?? 'Runtime pendiente'}</span>
                  {project.framework && <span className="framework-chip">{project.framework}</span>}
                </div>
                <div className="project-card-footer">
                  <span>{project.project_type?.replace('_', ' ') ?? 'Sin analizar'}</span>
                  <span>Creado {new Date(project.created_at).toLocaleDateString('es-PE')}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
