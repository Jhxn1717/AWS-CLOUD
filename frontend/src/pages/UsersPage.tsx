import { FormEvent, useEffect, useState } from 'react'
import { ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { usersApi } from '../api/projects'
import { User, UserRole } from '../types'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')

  async function loadUsers() {
    try {
      setUsers(await usersApi.list())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadUsers() }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const created = await usersApi.create({ name: name.trim(), email: email.trim(), password, role })
      setUsers(previous => [created, ...previous])
      setName('')
      setEmail('')
      setPassword('')
      setRole('user')
      setMessage(`La cuenta de ${created.name} fue creada como ${created.role === 'admin' ? 'administrador' : 'usuario'}.`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <span className="eyebrow">ADMINISTRACIÓN</span>
        <h1>Usuarios</h1>
        <p>Gestiona las cuentas y los niveles de acceso de MyCloud.</p>
      </div>
      <div className="page-body users-page">
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        <div className="users-layout">
          <section className="user-form-panel">
            <div className="users-panel-heading">
              <span><UserPlus size={19} /></span>
              <div><h2>Crear cuenta</h2><p>El acceso se asigna según el rol elegido.</p></div>
            </div>
            <form onSubmit={handleCreate}>
              <label className="user-form-field">
                <span>Nombre</span>
                <input value={name} onChange={event => setName(event.target.value)} maxLength={100} required />
              </label>
              <label className="user-form-field">
                <span>Correo electrónico</span>
                <input type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} required />
              </label>
              <label className="user-form-field">
                <span>Contraseña temporal</span>
                <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required />
                <small>Mínimo 8 caracteres.</small>
              </label>
              <label className="user-form-field">
                <span>Rol</span>
                <select value={role} onChange={event => setRole(event.target.value as UserRole)}>
                  <option value="user">Usuario · puede subir proyectos</option>
                  <option value="admin">Administrador · acceso completo</option>
                </select>
              </label>
              <button className="btn btn-primary user-create-button" type="submit" disabled={saving}>
                <UserPlus size={16} /> {saving ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>
            </form>
          </section>

          <section className="users-list-panel">
            <div className="users-panel-heading">
              <span><UsersRound size={19} /></span>
              <div><h2>Cuentas registradas</h2><p>{users.length} {users.length === 1 ? 'cuenta' : 'cuentas'}</p></div>
            </div>
            {loading ? <div className="users-empty">Cargando usuarios…</div> : users.length === 0 ? (
              <div className="users-empty">No hay cuentas disponibles.</div>
            ) : (
              <div className="user-list">
                {users.map(user => (
                  <article className="user-row" key={user.id}>
                    <span className={`user-avatar ${user.role}`}>
                      {user.role === 'admin' ? <ShieldCheck size={18} /> : user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="user-row-info"><strong>{user.name}</strong><small>{user.email}</small></span>
                    <span className={`role-badge ${user.role}`}>{user.role === 'admin' ? 'ADMIN' : 'USUARIO'}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
