import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { Deployment, DeploymentLog, DeploymentStage } from '../types'
import { CheckCircle2, XCircle, Loader2, SkipForward, Square } from 'lucide-react'

interface StageIconConfig {
  icon: React.ReactNode;
  color: string;
  label: string;
}

const STAGE_CONFIG: Record<string, StageIconConfig> = {
  SUCCESS: { icon: <CheckCircle2 size={18} />, color: 'var(--green)', label: 'SUCCESS' },
  FAILED: { icon: <XCircle size={18} />, color: 'var(--red)', label: 'FAILED' },
  RUNNING: { icon: <Loader2 size={18} className="animate-spin" />, color: 'var(--accent)', label: 'RUNNING' },
  SKIPPED: { icon: <SkipForward size={18} />, color: 'var(--text2)', label: 'SKIPPED' },
  PENDING: { icon: <Square size={18} />, color: 'var(--text2)', label: 'PENDING' },
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString('es-PE', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function LogsPage() {
  const { id, depId } = useParams<{ id: string; depId: string }>()
  const navigate = useNavigate()
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [logs, setLogs] = useState<DeploymentLog[]>([])
  const [stages, setStages] = useState<DeploymentStage[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  async function loadDeployment() {
    if (!id || !depId) return
    try {
      const d = await projectsApi.deployment(id, depId)
      setDeployment(d)
      setStages(d.stages ?? [])
      setLogs(d.logs ?? [])
    } finally {
      setLoading(false)
    }
  }

  // Start SSE streaming for in-progress deployments
  function startStream() {
    if (!id || !depId) return
    if (esRef.current) esRef.current.close()

    const token = localStorage.getItem('mycloud_token') ?? ''
    const url = `/api/projects/${id}/deployments/${depId}/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es
    setStreaming(true)

    es.onmessage = (e) => {
      try {
        const log: DeploymentLog = JSON.parse(e.data)
        setLogs(prev => {
          if (prev.some(l => l.id === log.id)) return prev
          return [...prev, log]
        })
        // Refresh deployment status periodically
        loadDeployment()
      } catch { /* ping or invalid */ }
    }

    es.onerror = () => {
      es.close()
      setStreaming(false)
    }
  }

  useEffect(() => {
    loadDeployment()
    return () => { esRef.current?.close() }
  }, [id, depId])

  useEffect(() => {
    if (!deployment) return
    const terminal = ['RUNNING', 'FAILED'].includes(deployment.status)
    if (!terminal) {
      startStream()
    } else {
      esRef.current?.close()
      setStreaming(false)
    }
  }, [deployment?.status])

  // Auto-scroll
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  if (loading) return <div className="loading-screen">Cargando registros…</div>
  if (!deployment) return <div className="loading-screen">Despliegue no encontrado</div>

  const isTerminal = ['RUNNING', 'FAILED'].includes(deployment.status)
  const isFailed = deployment.status === 'FAILED'
  const isSuccess = deployment.status === 'RUNNING'

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
          <h1 style={{ marginBottom: 0 }}>
            Despliegue #{deployment.version}
            {streaming && (
              <span style={{ fontSize: 13, color: 'var(--accent)', marginLeft: 10 }}>
                ● en vivo
              </span>
            )}
          </h1>
        </div>
      </div>

      <div className="page-body">
        {isFailed && (
          <div className="alert alert-error">
            <XCircle size={20} />
            ❌ DESPLIEGUE FALLÓ
            {deployment.error_message && `: ${deployment.error_message}`}
          </div>
        )}
        {isSuccess && (
          <div className="alert alert-success">
            <CheckCircle2 size={20} />
            ✅ DESPLIEGUE EN EJECUCIÓN
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
          {/* Pipeline stages */}
          <div>
            <div className="section-title">
              <CheckCircle2 size={20} />
              Pipeline
            </div>
            <div className="pipeline">
              {stages.length === 0 ? (
                <div style={{ color: 'var(--text2)', fontSize: 13 }}>Aún no hay etapas…</div>
              ) : (
                stages.map(s => (
                  <div key={s.id} className={`stage-row stage-${s.status}`}>
                    <span className="stage-icon" style={{ color: STAGE_CONFIG[s.status]?.color }}>
                      {STAGE_CONFIG[s.status]?.icon}
                    </span>
                    <span className="stage-name" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {s.stage}
                    </span>
                    {s.finished_at && s.started_at && (
                      <span className="stage-time">
                        {(Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 100) / 10).toFixed(1)}s
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {isTerminal && (
              <div style={{ marginTop: 20 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                  onClick={() => navigate(`/projects/${id}`)}
                >
                  ← Volver al Proyecto
                </button>
              </div>
            )}
          </div>

          {/* Logs */}
          <div>
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Registros ({logs.length})</span>
              {!isTerminal && (
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>
                  <Loader2 size={12} className="animate-spin" />
                  Ejecutando...
                </span>
              )}
            </div>
            <div className="log-console">
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text2)' }}>Esperando registros...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={log.id ?? i} className="log-line">
                    <span className="log-ts">{formatTs(log.created_at)}</span>
                    {log.stage && <span className="log-stage">[{log.stage}]</span>}
                    <span className={`log-msg log-lvl-${log.level}`}>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
