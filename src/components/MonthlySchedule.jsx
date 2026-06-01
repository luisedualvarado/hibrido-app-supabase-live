import React, { useState, useMemo } from 'react'
import { isWeekend, weekdayKey, WEEKDAY_LABEL, dayOfMonth, prettyDate } from '../logic/dateUtils.js'

const STATUS_ABBR = { HOME: 'TC', VACATION: 'VAC', HOLIDAY: 'FES', ABSENCE: 'AUS', NOT_APPLICABLE: 'NA' }
const byName = (a, b) => a.name.localeCompare(b.name, 'es')
const RESTRICTION_ALERT = /^restricci[oó]n individual no se pudo cumplir$/i

function cellAlertTone(cell) {
  const alerts = cell?.alerts || []
  if (!alerts.length) return ''
  return alerts.some((alert) => RESTRICTION_ALERT.test(alert)) ? 'red' : 'amber'
}

function alertBadgeTone(alert) {
  return RESTRICTION_ALERT.test(alert) ? 'red' : 'amber'
}

function cellLabel(cell, employee) {
  if (employee.baseLocation === 'REMOTO' && cell.status === 'NOT_APPLICABLE') return 'REM'
  if (cell.status === 'OFFICE') return employee.baseLocation === 'OFICINA_93' ? '93' : 'WW'
  return STATUS_ABBR[cell.status] || cell.status
}

function cellClass(cell, employee) {
  if (employee.baseLocation === 'REMOTO' && cell.status === 'NOT_APPLICABLE') return 'NOT_APPLICABLE REMOTE'
  if (cell.status !== 'OFFICE') return cell.status
  return employee.baseLocation === 'OFICINA_93' ? 'OFFICE O93' : 'OFFICE WEWORK'
}

export default function MonthlySchedule({
  schedule,
  employees,
  onSaveOverride,
  onDeleteOverride,
  manualOverrides,
  onSaveWeek,
  onClearWeek,
  savedWeeks = [],
  readOnly = false,
  hideAlerts = false,
}) {
  const [search, setSearch] = useState('')
  const [loc, setLoc] = useState('ALL')
  const [disc, setDisc] = useState('ALL')
  const [onlyFloating, setOnlyFloating] = useState(false)
  const [onlyCar, setOnlyCar] = useState(false)
  const [onlyAlert, setOnlyAlert] = useState(false)
  const [editing, setEditing] = useState(null) // {employee, iso, cell}

  const disciplines = useMemo(
    () => Array.from(new Set(employees.map((e) => e.discipline))).sort(), [employees])

  const filtered = useMemo(() => employees.filter((e) => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false
    if (loc !== 'ALL' && e.baseLocation !== loc) return false
    if (disc !== 'ALL' && e.discipline !== disc) return false
    if (onlyFloating && !e.isFloating) return false
    if (onlyCar && !e.hasCar) return false
    if (onlyAlert && !hideAlerts) {
      const has = schedule.days.some((iso) => {
        const c = schedule.cells[`${e.id}__${iso}`]
        return c && c.alerts && c.alerts.length
      })
      if (!has) return false
    }
    return true
  }).sort(byName), [employees, search, loc, disc, onlyFloating, onlyCar, onlyAlert, schedule])

  const overrideFor = (empId, iso) =>
    manualOverrides.find((o) => o.employeeId === empId && o.date === iso)
  const savedWeeksMap = new Map(savedWeeks.map((entry) => [entry.weekId, entry]))

  return (
    <div>
      {!readOnly && schedule.weeks?.length > 0 && (
        <div className="week-save-panel">
          {schedule.weeks.map((week, index) => {
            const savedWeek = savedWeeksMap.get(week.weekId)
            const startDate = week.workdays[0]
            const endDate = week.workdays[week.workdays.length - 1]
            return (
              <div key={week.weekId} className={`week-save-card ${savedWeek ? 'saved' : ''}`}>
                <div>
                  <strong>Semana {index + 1}</strong>
                  <span>{prettyDate(startDate)} a {prettyDate(endDate)}</span>
                  <small>{savedWeek ? `Guardada ${new Date(savedWeek.savedAt).toLocaleString('es-CO')}` : 'Sin guardar todavia'}</small>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => onSaveWeek(week)}>Guardar semana</button>
                  {savedWeek && <button className="btn btn-sm btn-ghost" onClick={() => onClearWeek(week)}>Liberar semana</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="filters">
        <div className="fg" style={{ minWidth: 200 }}>
          <label>Buscar persona</label>
          <input type="text" placeholder="Nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="fg">
          <label>Ubicación</label>
          <select value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="ALL">Todas</option>
            <option value="WEWORK">WeWork</option>
            <option value="OFICINA_93">Oficina 93</option>
            <option value="REMOTO">Remoto</option>
          </select>
        </div>
        <div className="fg">
          <label>Disciplina</label>
          <select value={disc} onChange={(e) => setDisc(e.target.value)}>
            <option value="ALL">Todas</option>
            {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>&nbsp;</label>
          <div className="row" style={{ gap: 8 }}>
            <button className={`btn btn-sm ${onlyFloating ? 'btn-primary' : ''}`} onClick={() => setOnlyFloating((v) => !v)}>Flotantes</button>
            <button className={`btn btn-sm ${onlyCar ? 'btn-primary' : ''}`} onClick={() => setOnlyCar((v) => !v)}>Con carro</button>
            {!hideAlerts && <button className={`btn btn-sm ${onlyAlert ? 'btn-primary' : ''}`} onClick={() => setOnlyAlert((v) => !v)}>Con alerta</button>}
          </div>
        </div>
      </div>

      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="name-col">Persona ({filtered.length})</th>
              {schedule.days.map((iso) => (
                <th key={iso} className={`dh ${isWeekend(iso) ? 'weekend' : ''}`}>
                  <div className="wd">{WEEKDAY_LABEL[weekdayKey(iso)].slice(0, 2)}</div>
                  <div className="dn">{dayOfMonth(iso)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="name-col">
                  {e.name}
                  {e.baseSeat && <span className="badge gray" style={{ marginLeft: 6, fontSize: 9 }}>Puesto {e.baseSeat}</span>}
                  {e.isFloating && <span className="badge navy" style={{ marginLeft: 6, fontSize: 9 }}>FLOT</span>}
                  {e.doubleHomeConsecutive && <span className="badge green" style={{ marginLeft: 6, fontSize: 9 }}>2TC</span>}
                </td>
                {schedule.days.map((iso) => {
                  const c = schedule.cells[`${e.id}__${iso}`]
                  if (!c) return <td key={iso} className="daycell" />
                  const alertTone = hideAlerts ? '' : cellAlertTone(c)
                  const isManual = c.source === 'MANUAL'
                  return (
                    <td key={iso} className="daycell">
                      <div
                        className={`cell ${cellClass(c, e)} ${readOnly ? 'readOnly' : ''} ${alertTone === 'red' ? 'hasAlert' : ''} ${alertTone === 'amber' || (isManual && !alertTone) ? 'hasNotice' : ''}`}
                        title={hideAlerts ? '' : c.alerts && c.alerts.join(' · ')}
                        onClick={() => {
                          if (!readOnly) setEditing({ employee: e, iso, cell: c })
                        }}
                      >
                        {cellLabel(c, e)}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        {!hideAlerts && <span><span className="lg-chip" style={{ background: 'var(--green-bg)', border: '1px solid var(--green)' }} /> Guardar semana · fija esos dias como ajustes persistentes</span>}
        <span><span className="lg-chip" style={{ background: 'var(--blue-100)' }} /> TC · Trabajo en casa</span>
        <span><span className="lg-chip" style={{ background: '#fff' }} /> WW · Oficina WeWork</span>
        <span><span className="lg-chip" style={{ background: 'var(--green-bg)' }} /> 93 · Oficina 93</span>
        <span><span className="lg-chip" style={{ background: '#fff1e7', border: '1px dashed #e07b39' }} /> REM · Full remoto</span>
        <span><span className="lg-chip" style={{ background: '#f4ecff', border: '1px dashed #8d6be8' }} /> VAC · Vacaciones</span>
        <span><span className="lg-chip" style={{ background: 'var(--gray-300)' }} /> FES · Festivo</span>
        <span><span className="lg-chip" style={{ background: 'var(--orange-bg)' }} /> AUS · Ausencia</span>
        {!hideAlerts && <span><span className="lg-chip" style={{ boxShadow: 'inset 0 0 0 2px var(--red)' }} /> Borde rojo · Restricción no cumplida</span>}
        {!hideAlerts && <span><span className="lg-chip" style={{ boxShadow: 'inset 0 0 0 2px var(--amber)' }} /> Borde ámbar · Aviso o ajuste</span>}
      </div>

      {editing && (
        <CellEditModal
          {...editing}
          existingOverride={overrideFor(editing.employee.id, editing.iso)}
          onClose={() => setEditing(null)}
          onSave={(status, reason) => { onSaveOverride(editing.employee.id, editing.iso, status, reason); setEditing(null) }}
          onDelete={() => { onDeleteOverride(editing.employee.id, editing.iso); setEditing(null) }}
        />
      )}
    </div>
  )
}

function CellEditModal({ employee, iso, cell, existingOverride, onClose, onSave, onDelete }) {
  const [status, setStatus] = useState(cell.status)
  const [reason, setReason] = useState(existingOverride?.reason || '')
  const SOURCE = { AUTO: 'Automático', MANUAL: 'Manual', SYSTEM: 'Sistema' }
  const canAssignHome = employee.isActive && employee.hybridApproved && employee.baseLocation !== 'REMOTO'
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Ajuste manual</h3>
          <button className="x-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Persona</label>
            <div>{employee.name} · <span className="muted">{employee.discipline}</span></div>
          </div>
          <div className="field">
            <label>Fecha</label>
            <div>{prettyDate(iso)}</div>
          </div>
          <div className="row" style={{ gap: 18 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Estado actual</label>
              <span className="badge gray">{cell.status}</span>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Fuente</label>
              <span className="badge navy">{SOURCE[cell.source]}</span>
            </div>
          </div>
          {cell.alerts && cell.alerts.length > 0 && (
            <div className="field">
              <label>Alertas de la celda</label>
              <div className="tag-list">
                {cell.alerts.map((a, i) => <span key={i} className={`badge ${alertBadgeTone(a)}`}>{a}</span>)}
              </div>
            </div>
          )}
          <div className="field">
            <label>Nuevo estado</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {canAssignHome && <option value="HOME">Trabajo en casa (TC)</option>}
              <option value="OFFICE">Oficina presencial</option>
              <option value="VACATION">Vacaciones (VAC)</option>
              <option value="ABSENCE">Ausencia (AUS)</option>
            </select>
            {!canAssignHome && <div className="muted" style={{ marginTop: 6 }}>Esta persona no tiene híbrido aprobado; no se puede forzar TC.</div>}
          </div>
          <div className="field">
            <label>Observación</label>
            <textarea rows={2} style={{ width: '100%' }} value={reason}
              onChange={(e) => setReason(e.target.value)} placeholder="Motivo del ajuste…" />
          </div>
        </div>
        <div className="modal-foot">
          {existingOverride && <button className="btn btn-danger" onClick={onDelete}>Eliminar ajuste</button>}
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(status, reason)}>Guardar ajuste</button>
        </div>
      </div>
    </div>
  )
}
