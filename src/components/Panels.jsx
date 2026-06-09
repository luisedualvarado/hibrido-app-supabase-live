import React, { useMemo, useState } from 'react'
import { prettyDate, MONTH_LABEL } from '../logic/dateUtils.js'
import { exportToCSV, exportToJSON, scheduleToRows, summaryToRows, alertsToRows } from '../logic/exporters.js'
import { buildLockerCodes } from '../logic/lockerGenerator.js'

const byName = (a, b) => a.name.localeCompare(b.name, 'es')

/* ---------------- Absences ---------------- */
export function Absences({ employees, absences, setAbsences }) {
  const [emp, setEmp] = useState(employees[0]?.id || '')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [type, setType] = useState('VACATION')
  const [editingIndex, setEditingIndex] = useState(null)
  const byEmp = Object.fromEntries(employees.map((e) => [e.id, e]))
  const resetForm = () => {
    setEmp(employees[0]?.id || '')
    setStart('')
    setEnd('')
    setType('VACATION')
    setEditingIndex(null)
  }
  const save = () => {
    if (!emp || !start) return
    const record = { employeeId: emp, startDate: start, endDate: end || start, type, notes: '' }
    setAbsences((prev) => {
      if (editingIndex == null) return [...prev, record]
      return prev.map((item, index) => (index === editingIndex ? record : item))
    })
    resetForm()
  }
  const edit = (absence, index) => {
    setEmp(absence.employeeId)
    setStart(absence.startDate)
    setEnd(absence.endDate)
    setType(absence.type)
    setEditingIndex(index)
  }
  const remove = (i) => setAbsences((prev) => prev.filter((_, idx) => idx !== i))
  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head"><h3>{editingIndex == null ? 'Agregar vacaciones / ausencia' : 'Editar vacaciones / ausencia'}</h3></div>
        <div className="card-body">
          <div className="filters" style={{ marginBottom: 0 }}>
            <div className="fg"><label>Persona</label>
              <select value={emp} onChange={(e) => setEmp(e.target.value)}>
                {[...employees].sort(byName).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="fg"><label>Desde</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="fg"><label>Hasta</label><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div className="fg"><label>Tipo</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="VACATION">Vacaciones</option>
                <option value="ABSENCE">Ausencia</option>
                <option value="PERMISSION">Permiso</option>
              </select>
            </div>
            <div className="fg"><label>&nbsp;</label><button className="btn btn-primary" onClick={save}>{editingIndex == null ? 'Agregar' : 'Guardar'}</button></div>
            {editingIndex != null && (
              <div className="fg"><label>&nbsp;</label><button className="btn btn-ghost" onClick={resetForm}>Cancelar</button></div>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Estas fechas bloquean automáticamente trabajo en casa y consumo de parqueadero.</p>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Persona</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th></th><th></th></tr></thead>
          <tbody>
            {absences.length === 0 && <tr><td colSpan={6} className="empty">Sin registros.</td></tr>}
            {absences.map((a, i) => (
              <tr key={i}>
                <td>{byEmp[a.employeeId]?.name || a.employeeId}</td>
                <td><span className={`badge ${a.type === 'VACATION' ? 'purple' : 'amber'}`}>{a.type}</span></td>
                <td>{prettyDate(a.startDate)}</td><td>{prettyDate(a.endDate)}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => edit(a, i)}>Editar</button></td>
                <td><button className="btn btn-sm btn-danger" onClick={() => remove(i)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Holidays ---------------- */
export function Holidays({ holidays, setHolidays }) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const add = () => { if (!date || !name) return; setHolidays((p) => [...p, { date, name }].sort((a, b) => a.date.localeCompare(b.date))); setDate(''); setName('') }
  const remove = (d) => setHolidays((p) => p.filter((h) => h.date !== d))
  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head"><h3>Agregar festivo</h3></div>
        <div className="card-body">
          <div className="filters" style={{ marginBottom: 0 }}>
            <div className="fg"><label>Fecha</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="fg" style={{ minWidth: 240 }}><label>Nombre</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del festivo" /></div>
            <div className="fg"><label>&nbsp;</label><button className="btn btn-primary" onClick={add}>Agregar</button></div>
          </div>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Festivo</th><th></th></tr></thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.date}>
                <td>{prettyDate(h.date)}</td><td>{h.name}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => remove(h.date)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Parking ---------------- */
export function Parking({ employees, parkingAssigned, setManualParking, params, parkingUsage }) {
  const byEmp = Object.fromEntries(employees.map((e) => [e.id, e]))
  const eligible = employees.filter((e) => e.parkingEligible && e.isActive && e.baseLocation === 'WEWORK').sort(byName)
  const cars = employees.filter((e) => e.hasCar && e.baseLocation === 'WEWORK').sort(byName)
  const carsNoParking = cars.filter((e) => !parkingAssigned.includes(e.id))
  const toggle = (id) => {
    setManualParking((prev) => {
      const cur = prev && prev.length ? prev : parkingAssigned
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      if (cur.length >= params.parkingSpots) return [...cur.slice(1), id]
      return [...cur, id]
    })
  }
  const usageDays = Object.entries(parkingUsage || {}).filter(([d, u]) => u.length)
  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi label="Con vehículo" value={cars.length} />
        <Kpi label="Elegibles" value={eligible.length} />
        <Kpi label="Parqueaderos" value={params.parkingSpots} />
        <Kpi label="Asignados este mes" value={parkingAssigned.length} tone="green" />
        <Kpi label="Con carro sin cupo" value={carsNoParking.length} tone={carsNoParking.length ? 'amber' : 'green'} />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-head"><h3>Asignación del mes (rotación)</h3></div>
          <div className="card-body">
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>Marca hasta {params.parkingSpots} personas. La rotación inicial es automática; aquí puedes reasignar manualmente.</p>
            {eligible.map((e) => (
              <label key={e.id} className="checkbox-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={parkingAssigned.includes(e.id)} onChange={() => toggle(e.id)} />
                {e.name} {e.id === 'salazar-diego' && <span className="badge gray">solo viernes</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Uso diario de parqueaderos</h3></div>
          <div className="card-body" style={{ maxHeight: 360, overflow: 'auto' }}>
            {usageDays.length === 0 ? <div className="muted">Genera la programación para ver el uso.</div> :
              usageDays.map(([d, u]) => (
                <div key={d} className="bar-row">
                  <span className="lab" style={{ width: 130 }}>{prettyDate(d)}</span>
                  <span className="tag-list">{u.map((id) => <span key={id} className="badge navy" style={{ fontSize: 10 }}>{byEmp[id]?.name?.split(',')[0]}</span>)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {carsNoParking.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head"><h3>Con vehículo sin parqueadero asignado</h3></div>
          <div className="card-body"><div className="tag-list">{carsNoParking.map((e) => <span key={e.id} className="badge amber">{e.name}</span>)}</div></div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Office 93 rotation ---------------- */
export function Office93Rotation({ employees, assigned, setManualOffice93, params, month, year }) {
  const [search, setSearch] = useState('')
  const [discipline, setDiscipline] = useState('ALL')
  const visiblePeople = employees.filter((e) => e.isActive && e.baseLocation !== 'REMOTO').sort(byName)
  const disciplines = Array.from(new Set(visiblePeople.map((e) => e.discipline))).sort()
  const filteredVisiblePeople = visiblePeople.filter((e) => {
    const text = `${e.name} ${e.email || ''} ${e.discipline}`.toLowerCase()
    if (search && !text.includes(search.toLowerCase())) return false
    if (discipline !== 'ALL' && e.discipline !== discipline) return false
    return true
  }).sort(byName)
  const selected = new Set(assigned)
  const selectedPeople = visiblePeople.filter((e) => selected.has(e.id)).sort(byName)
  const availablePeople = visiblePeople.filter((e) => !selected.has(e.id)).sort(byName)
  const byDiscipline = selectedPeople.reduce((acc, person) => {
    acc[person.discipline] = (acc[person.discipline] || 0) + 1
    return acc
  }, {})
  const uniqueOffice93 = (ids) => Array.from(new Set(ids))

  const toggle = (id) => {
    setManualOffice93((prev) => {
      const cur = uniqueOffice93(prev || assigned)
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      return uniqueOffice93([...cur, id])
    })
  }

  const clearManual = () => setManualOffice93(undefined)
  const selectNobody = () => setManualOffice93([])
  const selectAllFiltered = () => {
    setManualOffice93((prev) => {
      const base = uniqueOffice93(prev || assigned)
      const merged = [...base]
      for (const employee of filteredVisiblePeople) {
        if (!merged.includes(employee.id)) merged.push(employee.id)
      }
      return uniqueOffice93(merged)
    })
  }

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi label="Mes" value={MONTH_LABEL[month]} hint={String(year)} />
        <Kpi label="Puestos Oficina 93" value={params.seats93} />
        <Kpi label="Grupo mensual 93" value={assigned.length} tone={assigned.length >= params.seats93 ? 'green' : 'amber'} />
        <Kpi label="Personal oficina" value={visiblePeople.length} />
        <Kpi label="Sin hibrido" value={visiblePeople.filter((e) => !e.hybridApproved).length} tone={visiblePeople.some((e) => !e.hybridApproved) ? 'amber' : ''} />
        <Kpi label="Quedan en WeWork" value={availablePeople.length} />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-head">
            <h3>Asignacion mensual</h3>
            <button className="btn btn-sm btn-ghost" onClick={clearManual}>Volver a automatico</button>
          </div>
          <div className="card-body">
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Puedes marcar mas personas que puestos. La app asigna TC por dia para que en Oficina 93 no haya mas presentes que puestos.
            </p>
            <div className="filters">
              <div className="fg" style={{ minWidth: 220 }}>
                <label>Buscar</label>
                <input type="text" placeholder="Nombre, correo..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="fg">
                <label>Disciplina</label>
                <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                  <option value="ALL">Todas</option>
                  {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="fg">
                <label>&nbsp;</label>
                <button className="btn btn-sm" onClick={selectAllFiltered}>Seleccionar filtrados</button>
              </div>
              <div className="fg">
                <label>&nbsp;</label>
                <button className="btn btn-sm btn-ghost" onClick={selectNobody}>No seleccionar nadie</button>
              </div>
            </div>
            <div style={{ maxHeight: 460, overflow: 'auto' }}>
              {filteredVisiblePeople.map((e) => (
                <label key={e.id} className="checkbox-row" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => toggle(e.id)}
                  />
                  {e.name}
                  <span className="badge gray">{e.discipline}</span>
                  {e.isFloating && <span className="badge navy">flotante</span>}
                  {!e.hybridApproved && <span className="badge amber">sin hibrido</span>}
                </label>
              ))}
              {filteredVisiblePeople.length === 0 && <div className="empty compact">No hay personas con esos filtros.</div>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Grupo seleccionado</h3></div>
          <div className="card-body">
            {selectedPeople.length === 0 ? (
              <div className="empty compact">No hay personas asignadas.</div>
            ) : (
              <div className="tag-list">
                {selectedPeople.map((e) => <span key={e.id} className="badge navy">{e.name}</span>)}
              </div>
            )}

            <div className="section-title" style={{ marginTop: 22 }}>Balance por disciplina</div>
            <div className="tag-list">
              {Object.entries(byDiscipline).map(([discipline, count]) => (
                <span key={discipline} className="badge gray">{discipline}: {count}</span>
              ))}
              {Object.keys(byDiscipline).length === 0 && <span className="muted">Sin datos.</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Lockers ---------------- */
export function Lockers({ employees, lockerResult, manualLockers, setManualLockers, params, month, year, readOnly = false }) {
  const [search, setSearch] = useState('')
  const [discipline, setDiscipline] = useState('ALL')
  const eligibleEmployees = lockerResult?.eligibleEmployees || []
  const assignmentByEmployee = lockerResult?.assignmentByEmployee || {}
  const lockers = lockerResult?.lockers || []
  const lockerCodes = useMemo(() => lockerResult?.lockerCodes || buildLockerCodes(params.lockers), [lockerResult?.lockerCodes, params.lockers])
  const disciplines = useMemo(() => Array.from(new Set(eligibleEmployees.map((employee) => employee.discipline))).sort(), [eligibleEmployees])
  const manualByEmployee = useMemo(
    () => Object.fromEntries((manualLockers || []).map((assignment) => [assignment.employeeId, assignment])),
    [manualLockers]
  )
  const occupancyByLocker = useMemo(
    () => Object.fromEntries(lockers.map((locker) => [locker.lockerNumber, locker.occupants.map((occupant) => occupant.employeeId)])),
    [lockers]
  )
  const filteredEmployees = useMemo(() => eligibleEmployees.filter((employee) => {
    const text = `${employee.name} ${employee.email || ''} ${employee.discipline}`.toLowerCase()
    if (search && !text.includes(search.toLowerCase())) return false
    if (discipline !== 'ALL' && employee.discipline !== discipline) return false
    return true
  }).sort(byName), [discipline, eligibleEmployees, search])

  const updateLocker = (employeeId, value) => {
    if (readOnly) return
    setManualLockers((prev) => {
      const current = Array.isArray(prev) ? prev : []
      const withoutCurrent = current.filter((assignment) => assignment.employeeId !== employeeId)
      const lockerNumber = String(value || '').trim()
      if (!lockerNumber) return withoutCurrent
      return [...withoutCurrent, { employeeId, lockerNumber }].sort((left, right) => left.employeeId.localeCompare(right.employeeId))
    })
  }

  const clearManual = () => {
    if (readOnly) return
    setManualLockers(undefined)
  }
  const occupiedLockers = lockers.filter((locker) => locker.occupants.length)
  const showManualControls = !readOnly

  const summaryCard = (
    <div className="card">
      <div className="card-head"><h3>Resumen mensual de lockers</h3></div>
      <div className="card-body">
        {occupiedLockers.length === 0 ? (
          <div className="empty compact">Aun no hay lockers asignados.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {occupiedLockers.map((locker) => (
              <div key={locker.lockerNumber} style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12, background: locker.shared ? 'var(--amber-bg)' : 'var(--gray-50)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <strong>Locker {locker.lockerNumber}</strong>
                  <span className={`badge ${locker.shared ? 'amber' : 'green'}`}>{locker.shared ? '2 personas' : '1 persona'}</span>
                </div>
                <div className="tag-list">
                  {locker.occupants.map((occupant) => {
                    const employee = eligibleEmployees.find((item) => item.id === occupant.employeeId)
                    return <span key={occupant.employeeId} className={`badge ${occupant.manual ? 'green' : 'navy'}`}>{employee?.name || occupant.employeeId}</span>
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {lockerResult?.ignoredManualAssignments?.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="section-title">Asignaciones manuales ignoradas</div>
            <div className="tag-list">
              {lockerResult.ignoredManualAssignments.map((assignment, index) => (
                <span key={`${assignment.employeeId}-${assignment.lockerNumber}-${index}`} className="badge red">
                  {assignment.employeeId} · locker {assignment.lockerNumber}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div>
      {readOnly ? (
        summaryCard
      ) : (
        <>
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi label="Mes" value={MONTH_LABEL[month]} hint={String(year)} />
        <Kpi label="Lockers" value={params.lockers} />
        <Kpi label="Personas WeWork" value={eligibleEmployees.length} />
        <Kpi label="Lockers compartidos" value={lockerResult?.sharedLockerCount || 0} tone={(lockerResult?.sharedLockerCount || 0) > 0 ? 'amber' : 'green'} />
        <Kpi label="Sin locker" value={lockerResult?.unassignedCount || 0} tone={(lockerResult?.unassignedCount || 0) > 0 ? 'red' : 'green'} />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-head">
            <h3>Asignacion mensual individual</h3>
            {showManualControls && <button className="btn btn-sm btn-ghost" onClick={clearManual}>Volver a automatico</button>}
          </div>
          <div className="card-body">
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              La base toma a todas las personas activas que quedan en WeWork este mes. Puedes fijar lockers manualmente por persona; cuando no alcanza, la app comparte un locker entre dos personas.
            </p>
            <div className="filters">
              <div className="fg" style={{ minWidth: 220 }}>
                <label>Buscar</label>
                <input type="text" placeholder="Nombre, correo..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="fg">
                <label>Disciplina</label>
                <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                  <option value="ALL">Todas</option>
                  {disciplines.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>

            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Disciplina</th>
                    <th>Locker asignado</th>
                    <th>Modo</th>
                    <th>Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length === 0 && <tr><td colSpan={5} className="empty">No hay personas con esos filtros.</td></tr>}
                  {filteredEmployees.map((employee) => {
                    const assignment = assignmentByEmployee[employee.id]
                    const manualAssignment = manualByEmployee[employee.id]
                    return (
                      <tr key={employee.id}>
                        <td>{employee.name}</td>
                        <td><span className="badge gray">{employee.discipline}</span></td>
                        <td>
                          {!assignment?.lockerNumber ? (
                            <span className="badge red">Sin locker</span>
                          ) : (
                            <>
                              <span className={`badge ${assignment.shared ? 'amber' : 'navy'}`}>Locker {assignment.lockerNumber}</span>
                              {assignment.shared && <span className="badge amber" style={{ marginLeft: 6 }}>Compartido</span>}
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${manualAssignment ? 'green' : 'gray'}`}>{manualAssignment ? 'Manual' : 'Automatico'}</span>
                        </td>
                        <td>
                          {showManualControls ? (
                            <select value={manualAssignment?.lockerNumber || ''} onChange={(e) => updateLocker(employee.id, e.target.value)}>
                              <option value="">Automatico</option>
                              {lockerCodes.map((lockerNumber) => {
                                const occupants = occupancyByLocker[lockerNumber] || []
                                const canUse = occupants.length < 2 || occupants.includes(employee.id)
                                return (
                                  <option key={lockerNumber} value={lockerNumber} disabled={!canUse}>
                                    Locker {lockerNumber}{occupants.length ? ` · ${occupants.length}/2` : ''}
                                  </option>
                                )
                              })}
                            </select>
                          ) : manualAssignment?.lockerNumber ? (
                            <span className="badge green">Locker {manualAssignment.lockerNumber}</span>
                          ) : (
                            <span className="muted">Automatico</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {summaryCard}
      </div>
        </>
      )}
    </div>
  )
}

/* ---------------- Manual overrides ---------------- */
export function ManualOverrides({ employees, manualOverrides, onDelete }) {
  const byEmp = Object.fromEntries(employees.map((e) => [e.id, e]))
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Persona</th><th>Estado forzado</th><th>Motivo</th><th>Creado</th><th></th></tr></thead>
        <tbody>
          {manualOverrides.length === 0 && <tr><td colSpan={6} className="empty">No hay ajustes manuales. Haz clic en una celda de la programación para crear uno.</td></tr>}
          {manualOverrides.map((o) => (
            <tr key={o.id}>
              <td>{prettyDate(o.date)}</td>
              <td>{byEmp[o.employeeId]?.name || o.employeeId}</td>
              <td><span className="badge navy">{o.status}</span></td>
              <td className="muted">{o.reason || '—'}</td>
              <td className="muted">{new Date(o.createdAt).toLocaleString('es-CO')}</td>
              <td><button className="btn btn-sm btn-danger" onClick={() => onDelete(o.employeeId, o.date)}>Eliminar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------- Settings ---------------- */
export function Settings({ params, setParams }) {
  const up = (k, v) => setParams((p) => ({ ...p, [k]: Number(v) }))
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card-head"><h3>Parámetros generales</h3></div>
      <div className="card-body">
        <div className="grid2" style={{ gap: 16 }}>
          <Field label="Puestos WeWork" v={params.seatsWeWork} on={(v) => up('seatsWeWork', v)} />
          <Field label="Puestos Oficina 93" v={params.seats93} on={(v) => up('seats93', v)} />
          <Field label="Lockers" v={params.lockers} on={(v) => up('lockers', v)} />
          <Field label="Parqueaderos" v={params.parkingSpots} on={(v) => up('parkingSpots', v)} />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Días laborales: lunes a viernes. La validación busca que WeWork y Oficina 93 queden ocupadas sin sobrecupo. Los lockers se asignan por mes al personal que queda en WeWork.</p>
      </div>
    </div>
  )
}

/* ---------------- Export / Import ---------------- */
export function ExportPanel({
  buildSnapshot,
  schedule,
  employees,
  summary,
  alerts,
  githubSyncEnabled,
  githubSyncRepoLabel,
  hasGithubToken,
  githubSyncStatus,
  githubSyncError,
  onSaveGithubToken,
  onClearGithubToken,
  onCopyShareLink,
  onImport,
  onRestoreBackup,
}) {
  const fileRef = React.useRef()
  const [githubTokenInput, setGithubTokenInput] = useState('')
  const githubStatusLabel = {
    idle: 'Sin token configurado',
    connecting: 'Conectando con GitHub',
    ready: 'Listo para publicar cambios automaticos',
    publishing: 'Publicando cambios para visitantes',
    synced: 'Visitantes sincronizados',
    error: 'Error de sincronizacion',
  }[githubSyncStatus] || 'Sin sincronizacion'
  const doImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      onImport(JSON.parse(text))
    } catch (err) { alert('Archivo JSON inválido.') }
  }
  const saveGithubToken = () => {
    if (!githubTokenInput.trim() || !onSaveGithubToken) return
    onSaveGithubToken(githubTokenInput)
    setGithubTokenInput('')
  }
  return (
    <div className="grid2">
      <div className="card">
        <div className="card-head"><h3>Exportar</h3></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn" onClick={() => exportToCSV(scheduleToRows(schedule, employees), 'programacion.csv')}>Exportar programación CSV</button>
          <button className="btn" onClick={() => exportToCSV(summaryToRows(summary), 'resumen_diario.csv')}>Exportar resumen diario CSV</button>
          <button className="btn" onClick={() => exportToCSV(alertsToRows(alerts), 'alertas.csv')}>Exportar alertas CSV</button>
          <button className="btn btn-primary" onClick={() => exportToJSON(buildSnapshot(), 'config_hibrido.json')}>Exportar JSON de datos</button>
          <button className="btn btn-primary" onClick={onCopyShareLink}>Copiar link compartible</button>
          <button className="btn btn-ghost" onClick={() => alert('Generación de PDF disponible en una versión posterior.')}>Exportar PDF (próximamente)</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Importar</h3></div>
        <div className="card-body">
          <p className="muted" style={{ marginTop: 0 }}>Recupera una configuración previa o comparte una vista exacta con el link generado desde Exportar.</p>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={doImport} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Importar JSON de datos</button>
          <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={onRestoreBackup}>Restaurar respaldo local</button>
        </div>
      </div>
      {githubSyncEnabled && (
        <div className="card">
          <div className="card-head"><h3>Sincronizacion publica automatica</h3></div>
          <div className="card-body">
            <p className="muted" style={{ marginTop: 0 }}>
              Cuando esta conexion queda activa, cualquier cambio del admin se publica solo para los visitantes.
              Requiere un token fine-grained de GitHub con permiso <strong>Contents: Read and write</strong> sobre <strong>{githubSyncRepoLabel}</strong>.
            </p>
            <div className="badge navy" style={{ marginBottom: 12 }}>{githubStatusLabel}</div>
            {hasGithubToken && <p className="muted" style={{ marginTop: 0 }}>Token cargado en esta sesion del navegador.</p>}
            <div className="filters" style={{ marginBottom: 0 }}>
              <div className="fg" style={{ minWidth: 280 }}>
                <label>Token de GitHub</label>
                <input
                  type="password"
                  placeholder={hasGithubToken ? 'Reemplazar token' : 'Pega el token del repo'}
                  value={githubTokenInput}
                  onChange={(e) => setGithubTokenInput(e.target.value)}
                />
              </div>
              <div className="fg">
                <label>&nbsp;</label>
                <button className="btn btn-primary" onClick={saveGithubToken}>Guardar token</button>
              </div>
              {hasGithubToken && (
                <div className="fg">
                  <label>&nbsp;</label>
                  <button className="btn btn-ghost" onClick={onClearGithubToken}>Quitar token</button>
                </div>
              )}
            </div>
            {githubSyncError && <div className="admin-access-error" style={{ marginTop: 12 }}>{githubSyncError}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/* shared mini helpers */
function Kpi({ label, value, hint, tone }) {
  return <div className={`kpi ${tone || ''}`}><div className="label">{label}</div><div className="value">{value}</div>{hint && <div className="hint">{hint}</div>}</div>
}
function Field({ label, v, on }) {
  return <div className="field"><label>{label}</label><input type="number" style={{ width: '100%' }} value={v} onChange={(e) => on(e.target.value)} /></div>
}
