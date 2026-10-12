import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center', background: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      <h1 style={{ color: '#38bdf8' }}>☁️ Deployed with MyCloud PaaS</h1>
      <p>This is a native React + Vite application running on native OS processes without Docker!</p>
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#1e293b', borderRadius: '8px', display: 'inline-block' }}>
        <p>Interactive State Test:</p>
        <button
          onClick={() => setCount(count + 1)}
          style={{ padding: '0.6rem 1.2rem', fontSize: '1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Clicked: {count} times
        </button>
      </div>
      <footer style={{ marginTop: '3rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        MyCloud Engine &bull; Zero Docker &bull; Native Windows Process
      </footer>
    </div>
  );
}
