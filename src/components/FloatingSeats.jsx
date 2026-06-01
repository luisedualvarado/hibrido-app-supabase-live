import React, { useMemo, useState } from 'react'
import { MONTH_LABEL, WEEKDAY_LABEL, prettyDate, weekdayKey } from '../logic/dateUtils.js'
import { PHYSICAL_SEATS_BY_LOCATION } from '../logic/deskLayouts.js'

const LOCATIONS = [
  ['WEWORK', 'WeWork'],
  ['OFICINA_93', '93'],
]

const STATUS_LABELS = {
  HOME: 'TC',
  VACATION: 'VAC',
  ABSENCE: 'AUS',
  HOLIDAY: 'FES',
  NOT_APPLICABLE: 'NA',
}

const byName = (a, b) => a.name.localeCompare(b.name, 'es')

function resolveDeskCell(employee, iso, schedule, floatingResult) {
  const cell = schedule.cells[`${employee.id}__${iso}`]
  if (!cell) return { label: '-', tone: 'empty' }
  if (cell.status !== 'OFFICE') return { label: STATUS_LABELS[cell.status] || cell.status, tone: cell.status }

  const assignment = floatingResult?.[iso]?.assignedByEmp?.[employee.id]
  if (assignment?.seat) return { label: assignment.seat, tone: assignment.location, manual: assignment.manual }
  return { label: 'Sin puesto', tone: 'unseated' }
}

export default function FloatingSeats({ schedule, employees, floatingResult, month, year }) {
  const [selectedWeekId, setSelectedWeekId] = useState(schedule.weeks?.[0]?.weekId || '')

  const selectedWeek = useMemo(
    () => schedule.weeks.find((week) => week.weekId === selectedWeekId) || schedule.weeks[0],
    [schedule.weeks, selectedWeekId]
  )

  const floatersByLocation = useMemo(() => {
    const floaters = employees.filter((employee) => employee.isFloating && employee.isActive).sort(byName)
    return Object.fromEntries(LOCATIONS.map(([location]) => [
      location,
      floaters.filter((employee) => employee.baseLocation === location),
    ]))
  }, [employees])

  if (!selectedWeek) return <div className="empty">No hay semanas disponibles para mostrar puestos.</div>

  return (
    <div>
      <div className="filters">
        <div className="fg">
          <label>Semana</label>
          <select value={selectedWeek.weekId} onChange={(event) => setSelectedWeekId(event.target.value)}>
            {schedule.weeks.map((week, index) => (
              <option key={week.weekId} value={week.weekId}>
                {`Semana ${index + 1} · ${prettyDate(week.workdays[0])} a ${prettyDate(week.workdays[week.workdays.length - 1])}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="label">Mes</div>
          <div className="value">{MONTH_LABEL[month]}</div>
          <div className="hint">{year}</div>
        </div>
        <div className="kpi green">
          <div className="label">Semana</div>
          <div className="value">{selectedWeek.workdays.length}</div>
          <div className="hint">dias habiles</div>
        </div>
        <div className="kpi navy">
          <div className="label">Puestos monitoreados</div>
          <div className="value">{PHYSICAL_SEATS_BY_LOCATION.WEWORK.length + PHYSICAL_SEATS_BY_LOCATION.OFICINA_93.length}</div>
          <div className="hint">WeWork y 93</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Asignacion semanal de puestos flotantes</h3></div>
        <div className="card-body">
          <div className="tbl-wrap desk-board-table-wrap">
            <table className="desk-board-table desk-week-table">
              <thead>
                <tr>
                  <th>Ubicacion</th>
                  {selectedWeek.workdays.map((iso) => (
                    <th key={`week-head-${iso}`}>{WEEKDAY_LABEL[weekdayKey(iso)]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LOCATIONS.map(([location, label]) => {
                  const floaters = floatersByLocation[location] || []
                  return (
                    <React.Fragment key={`week-${location}`}>
                      <tr className="desk-week-section-row">
                        <td>{label}</td>
                        {selectedWeek.workdays.map((iso) => (
                          <td key={`section-${location}-${iso}`} />
                        ))}
                      </tr>
                      {floaters.length === 0 && (
                        <tr>
                          <td className="empty">Sin flotantes</td>
                          {selectedWeek.workdays.map((iso) => <td key={`empty-${location}-${iso}`} className="empty">-</td>)}
                        </tr>
                      )}
                      {floaters.map((employee) => (
                        <tr key={`${location}-${employee.id}`}>
                          <td className="desk-week-person">{employee.name}</td>
                          {selectedWeek.workdays.map((iso) => {
                            const cell = resolveDeskCell(employee, iso, schedule, floatingResult)
                            return (
                              <td key={`${employee.id}-${iso}`}>
                                <span className={`desk-chip ${cell.tone} ${cell.manual ? 'manual' : ''}`}>{cell.label}</span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}