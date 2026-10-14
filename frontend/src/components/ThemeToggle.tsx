import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const storageKey = 'mycloud_theme'

export function initializeTheme() {
  let theme = 'dark'
  try { if (localStorage.getItem(storageKey) === 'light') theme = 'light' } catch {}
  document.documentElement.dataset.theme = theme
}

export default function ThemeToggle() {
  const [light, setLight] = useState(document.documentElement.dataset.theme === 'light')
  function toggleTheme() {
    const next = !light
    document.documentElement.dataset.theme = next ? 'light' : 'dark'
    try { localStorage.setItem(storageKey, next ? 'light' : 'dark') } catch {}
    setLight(next)
  }
  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={light ? 'Activar modo oscuro' : 'Activar modo claro'} title={light ? 'Activar modo oscuro' : 'Activar modo claro'}>
      {light ? <Moon size={16} /> : <Sun size={16} />}
      <span>{light ? 'Modo oscuro' : 'Modo claro'}</span>
    </button>
  )
}
