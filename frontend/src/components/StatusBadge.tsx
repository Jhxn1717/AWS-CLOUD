import { ProjectStatus } from '../types'
import {
  Circle,
  Square,
  XCircle,
  Loader2,
  RotateCw,
  Activity,
  Package,
  Trash2,
  Clock,
} from 'lucide-react'

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  RUNNING:   { icon: <Circle size={14} fill="currentColor" />, color: 'var(--green)', label: 'EJECUTANDO' },
  STOPPED:   { icon: <Square size={14} />, color: 'var(--text2)', label: 'DETENIDO' },
  FAILED:    { icon: <XCircle size={14} />, color: 'var(--red)', label: 'ERROR' },
  BUILDING:  { icon: <Loader2 size={14} className="animate-spin" />, color: 'var(--yellow)', label: 'COMPILANDO' },
  STARTING:  { icon: <RotateCw size={14} className="animate-spin" />, color: 'var(--accent)', label: 'INICIANDO' },
  ANALYZING: { icon: <Activity size={14} className="animate-pulse" />, color: 'var(--accent)', label: 'ANALIZANDO' },
  CREATED:   { icon: <Package size={14} />, color: 'var(--purple)', label: 'CREADO' },
  DELETING:  { icon: <Trash2 size={14} />, color: 'var(--red)', label: 'ELIMINANDO' },
  PENDING:   { icon: <Clock size={14} />, color: 'var(--text2)', label: 'PENDIENTE' },
}

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { icon: '?', color: 'var(--text2)', label: status }
  
  return (
    <span
      className={`badge badge-${status.toLowerCase()}`}
      style={{ color: config.color, border: 'none' }}
    >
      {config.icon}
      <span style={{ marginLeft: 6 }}>{config.label}</span>
    </span>
  )
}
