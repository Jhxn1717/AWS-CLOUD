import { useEffect, useState } from 'react'
import { Project } from '../types'

export function useProjectUrl(project: Project | null) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const response = await fetch('/project-tunnels.json', { cache: 'no-store' })
        const data = response.ok ? await response.json() : {}
        if (active && data && typeof data === 'object') setUrls(data)
      } catch { if (active) setUrls({}) }
    }
    refresh()
    const timer = setInterval(refresh, 10000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  if (!project || project.status !== 'RUNNING') return null
  const publicUrl = urls[project.id]
  if (typeof publicUrl === 'string' && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(publicUrl)) return publicUrl
  if (/^https:\/\//i.test(project.source_path ?? '')) return project.source_path
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && project.assigned_port) return `http://localhost:${project.assigned_port}`
  return null
}
