import React from 'react'

export function KpiCard({ label, value, hint, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function AlertList({ alerts, empty = 'Sin alertas.' }) {
  if (!alerts || alerts.length === 0) return <div className="empty">{empty}</div>
  const ic = { CRITICAL: '!', WARNING: '▲', INFO: 'i' }
  return (
    <div>
      {alerts.map((a) => (
        <div key={a.id} className={`alert-item ${a.severity}`}>
          <span className="ai-ic">{ic[a.severity]}</span>
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  )
}

const NAV = [
  ['dashboard', '◧', 'Dashboard'],
  ['monthly', '▦', 'Programación mensual'],
  ['daily', '☀', 'Vista diaria'],
  ['desks', '⌗', 'Puestos Flotantes'],
  ['people', '☷', 'Personal'],
  ['restrictions', '⚑', 'Restricciones'],
  ['absences', '✈', 'Vacaciones / Ausencias'],
  ['holidays', '★', 'Festivos'],
  ['office93', '93', 'Oficina 93'],
  ['lockers', '▣', 'Lockers'],
  ['parking', '⊞', 'Parqueaderos'],
  ['overrides', '✎', 'Ajustes manuales'],
  ['settings', '⚙', 'Configuración'],
  ['export', '⤓', 'Exportar / Importar'],
]

export function Sidebar({
  view,
  setView,
  readOnly = false,
  isAdmin = false,
  adminAccessEnabled = true,
  authError = '',
  onAdminLogin,
  onAdminLogout,
}) {
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const navItems = readOnly
    ? NAV.filter(([id]) => ['dashboard', 'monthly', 'daily', 'desks', 'lockers'].includes(id))
    : NAV

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!onAdminLogin) return
    const ok = await onAdminLogin(username, password)
    if (ok) {
      setUsername('')
      setPassword('')
    }
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>Rotación Híbrida</h1>
        <div className="sub">Equipo ME&I · AECOM</div>
      </div>
      <nav className="nav">
        {navItems.map(([id, ic, label]) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
            <span className="ic">{ic}</span>{label}
          </button>
        ))}
      </nav>
      {readOnly && adminAccessEnabled && (
        <form className="admin-access" onSubmit={handleSubmit}>
          <div className="admin-access-head">
            <div className="admin-access-kicker">Admin</div>
            <div className="admin-access-title">Acceso admin</div>
            <div className="admin-access-copy">Acceso para el unico administrador. Desbloquea edicion y paneles internos.</div>
          </div>
          <div className="admin-access-field">
            <label htmlFor="admin-username">Usuario</label>
            <input
              id="admin-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin o correo"
              autoComplete="username"
            />
          </div>
          <div className="admin-access-field">
            <label htmlFor="admin-password">Contrasena</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ingresa la contrasena"
              autoComplete="current-password"
            />
          </div>
          {authError && <div className="admin-access-error">{authError}</div>}
          <button type="submit" className="btn btn-primary btn-block admin-access-submit">Entrar como admin</button>
        </form>
      )}
      {readOnly && !adminAccessEnabled && (
        <div className="admin-access admin-access-active">
          <div className="admin-access-head">
            <div className="admin-access-kicker">Admin</div>
            <div className="admin-access-title">Acceso admin no configurado</div>
            <div className="admin-access-copy">Este build publico no recibio credenciales admin durante el despliegue.</div>
          </div>
        </div>
      )}
      {!readOnly && isAdmin && (
        <div className="admin-access admin-access-active">
          <div className="admin-access-head">
            <div className="admin-access-kicker">Admin</div>
            <div className="admin-access-title">Sesion admin activa</div>
            <div className="admin-access-copy">Ya puedes abrir y editar todas las pestañas.</div>
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={onAdminLogout}>Cerrar sesion</button>
        </div>
      )}
      <div className="sidebar-foot">
        {readOnly ? 'Vista publica de solo lectura.' : 'Prototipo local · datos en memoria'}
        {!readOnly && <><br />Importa/exporta JSON para persistir.</>}
      </div>
    </aside>
  )
}
