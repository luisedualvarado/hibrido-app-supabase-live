import React, { useEffect, useState, useMemo } from 'react'
import { AlertList } from './Shared.jsx'
import { prettyDate, isWeekend } from '../logic/dateUtils.js'

const byName = (a, b) => a.name.localeCompare(b.name, 'es')

export default function DailyView({ schedule, employees, summary, floatingResult, parkingUsage, params, hideAlerts = false }) {
  const workdayOptions = useMemo(() => schedule.days.filter((day) => !isWeekend(day)), [schedule.days])
  const firstWorkday = workdayOptions[0] || schedule.days[0]
  const [date, setDate] = useState(firstWorkday)
  const byEmp = useMemo(() => Object.fromEntries(employees.map((employee) => [employee.id, employee])), [employees])

  useEffect(() => {
    if (!workdayOptions.includes(date)) {
      setDate(firstWorkday)
    }
  }, [date, firstWorkday, workdayOptions])

  const selectedDate = workdayOptions.includes(date) ? date : firstWorkday
  const day = summary.find((item) => item.date === selectedDate)
  const floating = floatingResult?.[selectedDate] || { assigned: [], unseated: [], assignedByEmp: {} }
  const groups = useMemo(() => {
    const home = []
    const we = []
    const o93 = []
    const assignedByEmp = floating.assignedByEmp || {}
    const unseatedFloaters = new Set(floating.unseated || [])

    for (const employee of employees) {
      const cell = schedule.cells[`${employee.id}__${selectedDate}`]
      if (!cell) continue
      const assignedSeat = assignedByEmp[employee.id]
      const person = {
        ...employee,
        dailySource: cell.source,
        displaySeat: assignedSeat?.seat || employee.baseSeat,
      }
      if (cell.status === 'HOME') home.push(person)
      else if (cell.status === 'OFFICE') {
        if (employee.isFloating && unseatedFloaters.has(employee.id)) continue
        const assignedLocation = employee.isFloating ? assignedSeat?.location : null
        const officeLocation = assignedLocation || employee.baseLocation
        if (officeLocation === 'OFICINA_93') o93.push(person)
        else if (officeLocation === 'WEWORK') we.push(person)
      }
    }
    return { home: home.sort(byName), we: we.sort(byName), o93: o93.sort(byName) }
  }, [employees, floating, schedule, selectedDate])
  const parking = parkingUsage?.[selectedDate] || []

  return (
    <div>
      <div className="filters">
        <div className="fg">
          <label>Fecha</label>
          <select value={selectedDate} onChange={(event) => setDate(event.target.value)}>
            {workdayOptions.map((day) => (
              <option key={day} value={day}>{prettyDate(day)}</option>
            ))}
          </select>
        </div>
      </div>

      {!day ? <div className="empty">Dia no laborable.</div> : (
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <Kpi label="En casa" value={day.totalHome} />
            <Kpi
              label="WeWork"
              value={day.totalOfficeWeWork}
              hint={`${day.freeSeatsWeWork} libres`}
              tone={day.freeSeatsWeWork < 0 ? 'red' : day.freeSeatsWeWork > 0 ? 'amber' : 'green'}
            />
            <Kpi
              label="Oficina 93"
              value={day.totalOffice93}
              hint={`${day.freeSeats93} libres`}
              tone={day.freeSeats93 < 0 ? 'red' : day.freeSeats93 > 0 ? 'amber' : 'green'}
            />
            <Kpi label="Flotantes presentes" value={day.floatingPeoplePresent} hint={`${day.floatingPeopleWithSeat} con puesto`} />
            <Kpi label="Flotantes sin puesto" value={day.floatingPeopleWithoutSeat} tone={day.floatingPeopleWithoutSeat > 0 ? 'red' : 'green'} />
            <Kpi label="Parqueaderos usados" value={`${day.parkingUsed}/${day.parkingAvailable}`} tone={day.parkingUsed > day.parkingAvailable ? 'red' : ''} />
          </div>

          <div className="grid2">
            <ListCard title={`Trabajo en casa (${groups.home.length})`} people={groups.home} tone="navy" />
            <ListCard title={`Presencial - WeWork (${groups.we.length})`} people={groups.we} tone="gray" />
            <ListCard title={`Presencial - Oficina 93 (${groups.o93.length})`} people={groups.o93} tone="gray" />
            <div className="card">
              <div className="card-head"><h3>Flotantes - puestos del dia</h3></div>
              <div className="card-body">
                {floating.assigned.length === 0 && floating.unseated.length === 0 && <div className="muted">Sin flotantes presenciales este dia.</div>}
                {floating.assigned.map((assignment) => (
                  <div key={assignment.empId} className="checkbox-row">
                    <span className="badge green">{assignment.location === 'OFICINA_93' ? '93' : 'WW'} {assignment.seat}</span> {byEmp[assignment.empId]?.name}
                  </div>
                ))}
                {floating.unseated.map((id) => (
                  <div key={id} className="checkbox-row">
                    <span className="badge red">Sin puesto</span> {byEmp[id]?.name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head"><h3>Parqueaderos en uso ({parking.length}/{params.parkingSpots})</h3></div>
            <div className="card-body">
              {parking.length === 0 ? <div className="muted">Ningun parqueadero en uso este dia.</div> : (
                <div className="tag-list">
                  {parking.map((id) => <span key={id} className="badge navy">{byEmp[id]?.name}</span>)}
                </div>
              )}
            </div>
          </div>

          {!hideAlerts && (
            <div className="card" style={{ marginTop: 18 }}>
              <div className="card-head"><h3>Alertas del dia</h3></div>
              <div className="card-body">
                <AlertList alerts={day.alerts.map((message, index) => ({ id: index, severity: 'WARNING', message }))} empty="Sin alertas para este dia." />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

function ListCard({ title, people, tone }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <div className="card-body" style={{ maxHeight: 240, overflow: 'auto' }}>
        {people.length === 0 ? <div className="muted">Nadie.</div> : (
          <div className="tag-list">
            {people.map((person) => (
              <span key={person.id} className={`badge ${tone}`}>
                {person.name}
                {person.displaySeat && <small className="badge-suffix">Puesto {person.displaySeat}</small>}
                {person.dailySource === 'MANUAL' && <small className="badge-suffix">Manual</small>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
