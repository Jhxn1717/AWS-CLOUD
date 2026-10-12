import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { CheckCircle2, CircleAlert, ExternalLink, FolderOpen, GitBranch, LoaderCircle, Package, Terminal, XCircle } from 'lucide-react'
import { Deployment, DeploymentLog } from '../types'

const PIPELINE_STAGES = [
  'ZIP_UPLOAD', 'EXTRACTION', 'ANALYSIS', 'DEPENDENCY_INSTALL', 'DATABASE_PROVISIONING',
  'BUILD', 'PORT_ALLOCATION', 'PROCESS_START', 'HEALTH_CHECK', 'RUNNING',
]

function deploymentProgress(deployment: Deployment | null): number {
  if (!deployment) return 5
  if (deployment.status === 'RUNNING') return 100
  const completed = deployment.stages?.filter(stage => ['SUCCESS', 'SKIPPED'].includes(stage.status)).length ?? 0
  const runningIndex = PIPELINE_STAGES.indexOf(deployment.current_stage ?? '')
  const progress = (completed + (runningIndex >= 0 ? 0.55 : 0.15)) / PIPELINE_STAGES.length
  return Math.min(96, Math.max(5, Math.round(progress * 100)))
}

export default function DeployPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [deployMode, setDeployMode] = useState<'zip' | 'github'>('zip')
  const [file, setFile] = useState<File | null>(null)
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [logs, setLogs] = useState<DeploymentLog[]>([])
  const streamRef = useRef<EventSource | null>(null)

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f && f.name.endsWith('.zip')) {
        setFile(f)
        setError('')
      } else {
        setError('Solo se aceptan archivos ZIP.')
      }
    },
    [],
  )

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && f.name.endsWith('.zip')) {
      setFile(f)
      setError('')
    } else if (f) {
      setError('Solo se aceptan archivos ZIP.')
    }
  }

  async function handleDeploy() {
    if (!id) return
    setDeploying(true)
    setError('')
    try {
      let result: { deploymentId: string; message: string }

      if (deployMode === 'zip') {
        if (!file) throw new Error('Selecciona un archivo ZIP para desplegar.')
        result = await projectsApi.deploy(id, file, setUploadProgress)
      } else {
        const normalizedUrl = repoUrl.trim()
        if (!normalizedUrl) throw new Error('Introduce la URL del repositorio de GitHub.')
        result = await projectsApi.deployFromGitHub(id, {
          repoUrl: normalizedUrl,
          branch: branch.trim() || 'main',
        })
      }

      setDeploymentId(result.deploymentId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al desplegar')
      setDeploying(false)
    }
  }

  useEffect(() => {
    if (!id || !deploymentId) return
    let mounted = true
    const load = async () => {
      try {
        const current = await projectsApi.deployment(id, deploymentId)
        if (!mounted) return
        setDeployment(current)
        setLogs(previous => {
          const byId = new Map((current.logs ?? []).map(log => [log.id, log]))
          previous.forEach(log => byId.set(log.id, log))
          return [...byId.values()].slice(-100)
        })
        if (['RUNNING', 'FAILED'].includes(current.status)) {
          window.clearInterval(poll)
          streamRef.current?.close()
        }
      } catch (e: unknown) {
        if (mounted) setError(e instanceof Error ? e.message : 'No se pudo consultar el despliegue')
      }
    }
    void load()
    const poll = window.setInterval(load, 1800)
    const token = localStorage.getItem('mycloud_token') ?? ''
    const stream = new EventSource(
      `/api/projects/${id}/deployments/${deploymentId}/stream?token=${encodeURIComponent(token)}`,
    )
    streamRef.current = stream
    stream.onmessage = event => {
      try {
        const entry: DeploymentLog = JSON.parse(event.data)
        setLogs(previous => previous.some(log => log.id === entry.id) ? previous : [...previous, entry].slice(-100))
      } catch {
        // Ignore keep-alive messages.
      }
    }
    return () => {
      mounted = false
      window.clearInterval(poll)
      stream.close()
    }
  }, [id, deploymentId])

  if (deploying || deploymentId) {
    const finished = deployment?.status === 'RUNNING'
    const failed = deployment?.status === 'FAILED'
    const percent = deploymentId
      ? Math.round(20 + deploymentProgress(deployment) * 0.8)
      : deployMode === 'zip' ? Math.round(uploadProgress * 0.2) : 8
    const heading = finished ? 'Despliegue completado' : failed ? 'El despliegue encontró un error' : 'Preparando tu proyecto'

    return (
      <>
        <div className="page-header">
          <span className="eyebrow">PUBLICACIÓN</span>
          <h1>{heading}</h1>
          <p>Seguimiento del proceso de despliegue.</p>
        </div>
        <div className="page-body deploy-progress-page">
          <section className={`deploy-progress-card${failed ? ' has-failed' : finished ? ' is-complete' : ''}`}>
            <div className={`deploy-source-icon ${deployMode === 'github' ? 'github-source' : 'zip-source'}${!finished && !failed ? ' is-loading' : ''}`}>
              {failed ? <XCircle size={38} /> : finished ? <CheckCircle2 size={38} /> : deployMode === 'github' ? <GitBranch size={40} /> : <FolderOpen size={42} />}
                        {failed ? <XCircle size={38} /> : finished ? <CheckCircle2 size={38} /> : deployMode === 'github' ? <GitBranch size={40} /> : <FolderOpen size={42} />}
            </div>
            <div className="deploy-progress-copy">
              <div className="deploy-progress-kicker">
                {deployMode === 'github' ? 'REPOSITORIO GITHUB' : 'ARCHIVO ZIP'}
                {deploymentId && <span> · {deploymentId.slice(0, 8)}</span>}
              </div>
              <h2>{deployMode === 'github' ? repoUrl || 'Conectando con GitHub' : file?.name ?? 'Subiendo archivo'}</h2>
              <p>{failed ? deployment?.error_message ?? 'El proceso no pudo completarse.' : finished ? 'Tu aplicación ya está en ejecución.' : deployment?.current_stage?.replace(/_/g, ' ') ?? (deployMode === 'github' ? 'Descargando repositorio…' : 'Subiendo y preparando los archivos…')}</p>
            </div>
            <div className="deploy-progress-number">{percent}<small>%</small></div>
            <div className="deploy-progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="deploy-progress-foot">
              <span>{finished ? 'LISTO' : failed ? 'REVISAR REGISTROS' : deploymentId ? 'DESPLIEGUE EN CURSO' : deployMode === 'github' ? 'CONECTANDO' : `TRANSFERENCIA ${uploadProgress}%`}</span>
              {!finished && !failed && <LoaderCircle className="deploy-spinner" size={16} />}
            </div>
          </section>

          <section className="deploy-live-logs">
            <header className="deploy-logs-header">
              <div><Terminal size={17} /><strong>Registro en tiempo real</strong></div>
              <span className={deploymentId && !finished && !failed ? 'live-indicator' : 'quiet-indicator'}>
                {deploymentId && !finished && !failed ? 'EN VIVO' : finished ? 'FINALIZADO' : failed ? 'DETENIDO' : 'CONECTANDO'}
              </span>
            </header>
            <div className="deploy-log-list" aria-live="polite">
              {logs.length === 0 ? (
                <div className="deploy-log-empty">
                  {failed ? <CircleAlert size={19} /> : <LoaderCircle className="deploy-spinner" size={19} />}
                  <span>{failed ? 'No hay registros disponibles.' : 'Esperando los primeros registros del pipeline…'}</span>
                </div>
              ) : logs.map(log => (
                <div className={`deploy-log-line log-level-${log.level.toLowerCase()}`} key={log.id}>
                  <time>{new Date(log.created_at).toLocaleTimeString('es-PE', { hour12: false })}</time>
                  {log.stage && <span className="deploy-log-stage">{log.stage}</span>}
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="deploy-progress-actions">
            {deploymentId && (
              <button className="btn btn-secondary" onClick={() => navigate(`/projects/${id}/logs/${deploymentId}`)}>
                <ExternalLink size={16} /> Vista completa de logs
              </button>
            )}
            <button className="btn btn-primary" onClick={() => navigate(`/projects/${id}`)}>
              {finished ? 'Ver proyecto' : 'Volver al proyecto'}
            </button>
          </div>
        </div>
      </>
    )
  }

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
          <Link to={`/projects/${id}`} style={{ color: 'var(--text2)', fontSize: 13 }}>
            ← Proyecto
          </Link>
          <span style={{ color: 'var(--border)' }}>/</span>
          <h1 style={{ marginBottom: 0 }}>Nuevo despliegue</h1>
        </div>
      </div>
      <div className="page-body deploy-page-body">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="deploy-mode-tabs" role="tablist" aria-label="Origen del proyecto">
          <button
            className={`deploy-mode-tab${deployMode === 'zip' ? ' selected' : ''}`}
            onClick={() => setDeployMode('zip')}
            type="button"
            role="tab"
            aria-selected={deployMode === 'zip'}
          >
            <Package size={17} /> Archivo ZIP
          </button>
          <button
            className={`deploy-mode-tab${deployMode === 'github' ? ' selected' : ''}`}
            onClick={() => setDeployMode('github')}
            type="button"
            role="tab"
            aria-selected={deployMode === 'github'}
          >
            <GitBranch size={17} /> GitHub
          </button>
        </div>

        <div className="deploy-form-layout">
        <section className="deploy-source-panel">
        {deployMode === 'zip' ? (
          <>
            <div
              className={`drop-zone deploy-drop-zone${dragging ? ' drag-over' : ''}${file ? ' has-file' : ''}`}
              onDragOver={e => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById('zip-input')?.click()}
            >
              <span className="drop-icon"><FolderOpen size={34} /></span>
              <strong>{file ? file.name : 'Arrastra tu archivo ZIP'}</strong>
              <p>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Listo para desplegar` : 'o selecciona un archivo desde tu equipo'}</p>
              <small>ZIP · máximo 200 MB</small>
              <input
                id="zip-input"
                type="file"
                accept=".zip"
                hidden
                onChange={onFileChange}
              />
            </div>

          </>
        ) : (
          <div className="github-form">
            <span className="github-form-icon"><GitBranch size={30} /></span>
                        <span className="github-form-icon"><GitBranch size={30} /></span>
                        <GitBranch size={17} /> GitHub
            <div>
              <h2>Conecta un repositorio</h2>
              <p>Usaremos el código de la rama seleccionada para crear el despliegue.</p>
            </div>
            <div className="github-form-fields">
              <label>
                <span>URL del repositorio GitHub</span>
                <input
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/usuario/repositorio"
                />
              </label>

              <label>
                <span>Rama</span>
                <input
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="main"
                />
              </label>
            </div>
          </div>
        )}

        </section>
        <aside className="deploy-side-note">
          <h3>Etapas del despliegue</h3>
          <ol>
            <li><span>01</span> Carga y extracción</li>
            <li><span>02</span> Análisis del proyecto</li>
            <li><span>03</span> Dependencias y compilación</li>
            <li><span>04</span> Inicio y verificación</li>
          </ol>
          <p>Los registros del proceso aparecerán en vivo al iniciar.</p>
        </aside>
        </div>

        <button
          onClick={handleDeploy}
          disabled={deployMode === 'zip' ? !file || deploying : !repoUrl.trim() || deploying}
          className="btn btn-primary deploy-submit"
        >
          {deploying ? (
            <>
              <LoaderCircle className="deploy-spinner" size={17} />
              Iniciando pipeline...
            </>
          ) : (
            <>
              <Package size={18} />
              Iniciar despliegue
            </>
          )}
        </button>
      </div>
    </>
  )
}
