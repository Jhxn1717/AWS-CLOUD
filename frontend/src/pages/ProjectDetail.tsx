import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { Project } from '../types'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Package,
  Server,
  Database,
  Activity,
  Globe,
  Terminal,
  Info,
  Lock,
} from 'lucide-react'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [processLogs, setProcessLogs] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!id) return
    try {
      const p = await projectsApi.get(id)
      setProject(p)
      if (p.status === 'RUNNING' && isAdmin) {
        const logs = await projectsApi.processLogs(id, 50)
        setProcessLogs(logs)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar proyecto')
    } finally {
      setLoading(false)
    }
  }, [id, isAdmin])

  useEffect(() => { load() }, [load])

  // Poll while in-progress
  useEffect(() => {
    if (!project) return
    const inProgress = ['ANALYZING', 'BUILDING', 'STARTING'].includes(project.status)
    if (!inProgress) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [project?.status, load])

  async function doAction(fn: () => Promise<unknown>, msg: string) {
    setBusy(true)
    setActionMsg('')
    setError('')
    try {
      await fn()
      setActionMsg(msg)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error en la acción')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!project) return
    if (
      !confirm(
        `¿Eliminar proyecto "${project.name}"? Esto detendrá el proceso, liberará el puerto y borrará todos los archivos. Esta acción no se puede deshacer.`,
      )
    )
      return
    setBusy(true)
    try {
      await projectsApi.delete(project.id)
      navigate('/projects')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
      setBusy(false)
    }
  }

  if (loading) return <div className="loading-screen">Cargando proyecto…</div>
  if (!project) return <div className="loading-screen">Proyecto no encontrado</div>

  const canStart =
    ['STOPPED', 'FAILED', 'CREATED'].includes(project.status) && !!project.source_path
  const canStop = project.status === 'RUNNING'
  const canRestart = project.status === 'RUNNING'
  const canDeploy =
    !['ANALYZING', 'BUILDING', 'STARTING', 'DELETING'].includes(project.status)

  return (
    <>
      <div className="page-header">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <Link to="/projects" style={{ color: 'var(--text2)', fontSize: 13 }}>
            ← Proyectos
          </Link>
          <span style={{ color: 'var(--border)' }}>/</span>
          <h1 style={{ marginBottom: 0 }}>{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}
        {actionMsg && <div className="alert alert-success">{actionMsg}</div>}

        {/* Barra de acciones */}
        <div className="action-bar">
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/projects/${project.id}/deploy`)}
            disabled={!canDeploy}
          >
            <Package size={18} />
            Subir proyecto
          </button>
          {isAdmin && <>
            <button
              className="btn btn-success"
              onClick={() => doAction(() => projectsApi.start(project.id), 'Proyecto iniciado')}
              disabled={!canStart || busy}
            >
              <Play size={18} />
              Iniciar
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => doAction(() => projectsApi.stop(project.id), 'Proyecto detenido')}
              disabled={!canStop || busy}
            >
              <Pause size={18} />
              Detener
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => doAction(() => projectsApi.restart(project.id), 'Proyecto reiniciado')}
              disabled={!canRestart || busy}
            >
              <RotateCcw size={18} />
              Reiniciar
            </button>
          </>}
          <button className="btn btn-secondary" onClick={load} disabled={busy}>
            <RotateCcw size={16} />
            Actualizar
          </button>
          {isAdmin && <button
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={busy}
            style={{ marginLeft: 'auto' }}
          >
            <Trash2 size={18} />
            Eliminar
          </button>}
        </div>

        {/* Info grid */}
        <div className="detail-grid">
          <div className="card">
            <div className="detail-item">
              <Info size={14} />
              <label>ID</label>
              <span>{project.id}</span>
            </div>
          </div>
          <div className="card">
            <div className="detail-item">
              <Activity size={14} />
              <label>Slug</label>
              <span>{project.slug}</span>
            </div>
          </div>
          <div className="card">
            <div className="detail-item">
              <Server size={14} />
              <label>Runtime</label>
              <span style={{ textTransform: 'capitalize' }}>
                {project.runtime ?? '—'}
              </span>
            </div>
          </div>
          <div className="card">
            <div className="detail-item">
              <Terminal size={14} />
              <label>Framework</label>
              <span>{project.framework ?? '—'}</span>
            </div>
          </div>
          <div className="card">
            <div className="detail-item">
              <Package size={14} />
              <label>Tipo</label>
              <span>{project.project_type ?? '—'}</span>
            </div>
          </div>
          <div className="card">
            <div className="detail-item">
              <Globe size={14} />
              <label>Puerto</label>
              <span>
                {project.assigned_port ? (
                  <a
                    href={`http://localhost:${project.assigned_port}`}
                    target="_blank"
                    rel="noreferrer"
                    className="url-link"
                  >
                    :{project.assigned_port} ↗
                  </a>
                ) : (
                  '—'
                )}
              </span>
            </div>
          </div>
          <div className="card">
            <div className="detail-item">
              <Activity size={14} />
              <label>PID</label>
              <span>{project.process_pid ?? '—'}</span>
            </div>
          </div>
          <div className="card">
            <div className="detail-item">
              <Globe size={14} />
              <label>URL</label>
              <span>
                {project.assigned_port && project.status === 'RUNNING' ? (
                  <a
                    href={`http://localhost:${project.assigned_port}`}
                    target="_blank"
                    rel="noreferrer"
                    className="url-link"
                  >
                    http://localhost:{project.assigned_port} ↗
                  </a>
                ) : (
                  '—'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Descripción */}
        {project.description && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="detail-item">
              <Info size={16} />
              <label>Descripción</label>
              <p style={{ color: 'var(--text)', marginTop: 8 }}>{project.description}</p>
            </div>
          </div>
        )}

        {/* Base de datos */}
        <div className="section-title">
          <Database size={20} />
          Base de Datos
        </div>
        {project.database ? (
          <div
            className="card"
            style={{ marginBottom: 24, borderLeft: '4px solid var(--green)' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 24 }}>🗄️</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontSize: 13,
                    color: 'var(--text)',
                  }}
                >
                  {project.database.type}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text2)',
                    fontFamily: 'monospace',
                    marginTop: 4,
                  }}
                >
                  {project.database.host}:{project.database.port} /
                  <strong style={{ color: 'var(--accent)' }}>
                    {project.database.name}
                  </strong>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>USUARIO</div>
                <code
                  style={{
                    fontSize: 12,
                    background: 'rgba(88,166,255,0.1)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    color: 'var(--accent)',
                  }}
                >
                  {project.database.user}
                </code>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>ESTADO</div>
                <span
                  className={`badge ${
                    project.database.is_active ? 'badge-running' : 'badge-stopped'
                  }`}
                >
                  {project.database.is_active ? 'ACTIVA' : 'INACTIVA'}
                </span>
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                padding: '12px 14px',
                background: '#0a0d11',
                borderRadius: 8,
                fontSize: 12,
                fontFamily: 'monospace',
                color: 'var(--text2)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Lock size={12} />
              <span>DATABASE_URL=</span>
              <span>
                {project.database.type}://{project.database.user}:***@{project.database.host}:{project.database.port}/{project.database.name}
              </span>
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 24, opacity: 0.7 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--text2)',
              }}
            >
              <Database size={20} />
              <div>
                <div style={{ fontSize: 13 }}>
                  No se ha provisionado base de datos
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  MyCloud provisiona una base de datos automáticamente cuando tu
                  proyecto tiene un paquete de DB (pg, mysql2, etc.)
                  <strong style={{ color: 'var(--text)' }}>
                    {' '}
                    y evidencia de esquema (schema.sql, migrations/, prisma/).
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Despliegues */}
        <div
          className="section-title"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>Despliegues</span>
          <Link to={`/projects/${project.id}/deploy`} className="btn btn-sm btn-primary">
            + Nuevo Despliegue
          </Link>
        </div>

        {project.last_deployment ? (
          <div className="card" style={{ marginBottom: 24 }}>
            <div
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>VERSIÓN</div>
                <strong style={{ color: 'var(--text)' }}>#{project.last_deployment.version}</strong>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>ESTADO</div>
                <StatusBadge status={project.last_deployment.status} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>ETAPA</div>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: 'var(--text)',
                  }}
                >
                  {project.last_deployment.current_stage ?? '—'}
                </span>
              </div>
              {project.last_deployment.error_message && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>ERROR</div>
                  <span style={{ color: 'var(--red)', fontSize: 12 }}>
                    {project.last_deployment.error_message}
                  </span>
                </div>
              )}
              <Link
                to={`/projects/${project.id}/logs/${project.last_deployment.id}`}
                className="btn btn-sm btn-secondary"
                style={{ marginLeft: 'auto' }}
              >
                Ver Registros
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <p>
              No hay despliegues aún.
              <Link to={`/projects/${project.id}/deploy`} style={{ marginLeft: 6 }}>
                Sube tu primer proyecto.
              </Link>
            </p>
          </div>
        )}

        {/* Registros de proceso en vivo */}
        {isAdmin && processLogs.length > 0 && (
          <>
            <div className="section-title">
              <Terminal size={20} />
              Salida del Proceso (en vivo)
            </div>
            <div className="log-console">
              {processLogs.map((line, i) => (
                <div key={i} className="log-line">
                  <span
                    className={`log-msg ${
                      line.startsWith('[ERR]') ? 'log-lvl-ERROR' : 'log-lvl-INFO'
                    }`}
                  >
                    {line}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
