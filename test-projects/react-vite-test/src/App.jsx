import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      background: '#0d1117',
      color: '#e6edf3'
    }}>
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>☁ MyCloud</h1>
      <p style={{ color: '#8b949e', marginBottom: 32 }}>React + Vite test app — deployed successfully!</p>
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: 12, padding: '32px 48px', textAlign: 'center'
      }}>
        <p style={{ marginBottom: 16, color: '#8b949e' }}>Counter test</p>
        <p style={{ fontSize: 48, fontWeight: 700, margin: '0 0 24px', color: '#58a6ff' }}>{count}</p>
        <button
          onClick={() => setCount(c => c + 1)}
          style={{
            background: '#1f6feb', color: '#fff',
            border: 'none', borderRadius: 8,
            padding: '10px 24px', fontSize: 16, cursor: 'pointer'
          }}
        >
          Click me
        </button>
      </div>
      <p style={{ marginTop: 32, fontSize: 13, color: '#4b5563' }}>
        Port: {window.location.port} · {new Date().toLocaleString()}
      </p>
    </div>
  )
}
