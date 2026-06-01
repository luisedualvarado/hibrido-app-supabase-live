import React, { useMemo, useState } from 'react'
import { MONTH_LABEL, WEEKDAY_LABEL, prettyDate, weekdayKey } from '../logic/dateUtils.js'
import { PHYSICAL_SEATS_BY_LOCATION } from '../logic/deskLayouts.js'

const LOCATIONS = [
  ['WEWORK', 'WeWork'],
  ['OFICINA_93', '93'],
]

const JUNE_2026_DESK_PRESET = {
  WEWORK: [
    'pinto-juan-felipe',
    'arenas-juan',
    'jimenez-johana',
    'vera-steven',
    'dulce-camilo',
    'velosa-over',
    'guevara-luis',
    'gonzalez-julian',
    'fuentes-andres',
    'gallo-ana-maria',
  ],
  OFICINA_93: [
    'salazar-diego',
    'valdez-lianeth-carolina',
    'cortes-german',
  ],
  labels: {
    'pinto-juan-felipe__2026-06-01': '1',
    'pinto-juan-felipe__2026-06-02': '6',
    'pinto-juan-felipe__2026-06-03': 'TC',
    'pinto-juan-felipe__2026-06-04': '5',
    'pinto-juan-felipe__2026-06-05': '5',
    'arenas-juan__2026-06-01': 'TC',
    'arenas-juan__2026-06-02': 'TC',
    'arenas-juan__2026-06-03': '3',
    'arenas-juan__2026-06-04': '9',
    'arenas-juan__2026-06-05': '9',
    'jimenez-johana__2026-06-01': '15',
    'jimenez-johana__2026-06-02': 'TC',
    'jimenez-johana__2026-06-03': '14',
    'jimenez-johana__2026-06-04': '17',
    'jimenez-johana__2026-06-05': '17',
    'vera-steven__2026-06-01': 'TC',
    'vera-steven__2026-06-02': '15',
    'vera-steven__2026-06-03': '149',
    'vera-steven__2026-06-04': 'TC',
    'vera-steven__2026-06-05': '1',
    'dulce-camilo__2026-06-01': '13',
    'dulce-camilo__2026-06-02': '13',
    'dulce-camilo__2026-06-03': '27',
    'dulce-camilo__2026-06-04': 'TC',
    'dulce-camilo__2026-06-05': 'TC',
    'velosa-over__2026-06-01': 'TC',
    'velosa-over__2026-06-02': '12',
    'velosa-over__2026-06-03': '148',
    'velosa-over__2026-06-04': 'TC',
    'velosa-over__2026-06-05': '10',
    'guevara-luis__2026-06-01': 'TC',
    'guevara-luis__2026-06-02': 'TC',
    'guevara-luis__2026-06-03': '151',
    'guevara-luis__2026-06-04': '154',
    'guevara-luis__2026-06-05': '30',
    'gonzalez-julian__2026-06-01': '11',
    'gonzalez-julian__2026-06-02': '19',
    'gonzalez-julian__2026-06-03': '31',
    'gonzalez-julian__2026-06-04': 'VAC',
    'gonzalez-julian__2026-06-05': 'VAC',
    'fuentes-andres__2026-06-01': 'TC',
    'fuentes-andres__2026-06-02': 'TC',
    'fuentes-andres__2026-06-03': 'TC',
    'fuentes-andres__2026-06-04': 'TC',
    'fuentes-andres__2026-06-05': '152',
    'gallo-ana-maria__2026-06-01': 'TC',
    'gallo-ana-maria__2026-06-02': 'TC',
    'gallo-ana-maria__2026-06-03': 'TC',
    'gallo-ana-maria__2026-06-04': 'TC',
    'gallo-ana-maria__2026-06-05': 'TC',
    'salazar-diego__2026-06-01': '47',
    'salazar-diego__2026-06-02': 'TC',
    'salazar-diego__2026-06-03': 'TC',
    'salazar-diego__2026-06-04': '39',
    'salazar-diego__2026-06-05': '51',
    'valdez-lianeth-carolina__2026-06-01': '39',
    'valdez-lianeth-carolina__2026-06-02': 'TC',
    'valdez-lianeth-carolina__2026-06-03': '51',
    'valdez-lianeth-carolina__2026-06-04': '45',
    'valdez-lianeth-carolina__2026-06-05': 'TC',
    'cortes-german__2026-06-01': 'TC',
    'cortes-german__2026-06-02': '39',
    'cortes-german__2026-06-03': '39',
    'cortes-german__2026-06-04': 'TC',
    'cortes-german__2026-06-05': '39',
  },
}

const STATUS_LABELS = {
  HOME: 'TC',
  VACATION: 'VAC',
  ABSENCE: 'AUS',
  HOLIDAY: 'FES',
  NOT_APPLICABLE: 'NA',
}

const PRESET_TONE_BY_LABEL = {
  TC: 'HOME',
  VAC: 'VACATION',
  AUS: 'ABSENCE',
  FES: 'HOLIDAY',
  NA: 'NOT_APPLICABLE',
}

const byName = (a, b) => a.name.localeCompare(b.name, 'es')

function resolveDeskCell(employee, iso, schedule, floatingResult, location, presetLabels = null) {
  const presetLabel = presetLabels?.[`${employee.id}__${iso}`]
  if (presetLabel) {
    return {
      label: presetLabel,
      tone: PRESET_TONE_BY_LABEL[presetLabel] || location,
      manual: false,
    }
  }

  const cell = schedule.cells[`${employee.id}__${iso}`]
  if (!cell) return { label: '-', tone: 'empty' }
  if (cell.status !== 'OFFICE') return { label: STATUS_LABELS[cell.status] || cell.status, tone: cell.status }

  const assignment = floatingResult?.[iso]?.assignedByEmp?.[employee.id]
  if (assignment?.seat) return { label: assignment.seat, tone: assignment.location, manual: assignment.manual }
  return { label: 'Sin puesto', tone: 'unseated' }
}

function deskCellClassName(cell) {
  if (cell.tone === 'WEWORK') return `cell OFFICE WEWORK readOnly ${cell.manual ? 'manual' : ''}`.trim()
  if (cell.tone === 'OFICINA_93') return `cell OFFICE O93 readOnly ${cell.manual ? 'manual' : ''}`.trim()
  if (cell.tone === 'unseated') return 'cell desk-cell-unseated readOnly'
  if (cell.tone === 'empty') return 'cell NOT_APPLICABLE readOnly'
  return `cell ${cell.tone} readOnly`.trim()
}

export default function FloatingSeats({ schedule, employees, floatingResult, month, year }) {
  const [search, setSearch] = useState('')
  const employeesById = useMemo(() => Object.fromEntries(employees.map((employee) => [employee.id, employee])), [employees])
  const deskPreset = month === 5 && year === 2026 ? JUNE_2026_DESK_PRESET : null

  const floatersByLocation = useMemo(() => {
    const floaters = deskPreset
      ? []
      : employees.filter((employee) => employee.isFloating && employee.isActive).sort(byName)

    return Object.fromEntries(LOCATIONS.map(([location]) => [
      location,
      deskPreset
        ? (deskPreset[location] || [])
          .map((employeeId) => employeesById[employeeId])
          .filter(Boolean)
          .filter((employee) => !search || employee.name.toLowerCase().includes(search.toLowerCase()))
        : floaters
          .filter((employee) => employee.baseLocation === location)
          .filter((employee) => !search || employee.name.toLowerCase().includes(search.toLowerCase())),
    ]))
  }, [deskPreset, employees, employeesById, search])

  if (!schedule?.days?.length) return <div className="empty">No hay dias disponibles para mostrar puestos.</div>

  return (
    <div>
      <div className="filters">
        <div className="fg" style={{ minWidth: 220 }}>
          <label>Buscar persona</label>
          <input type="text" placeholder="Nombre..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="label">Mes</div>
          <div className="value">{MONTH_LABEL[month]}</div>
          <div className="hint">{year}</div>
        </div>
        <div className="kpi green">
          <div className="label">Dias del mes</div>
          <div className="value">{schedule.days.length}</div>
          <div className="hint">incluye fines de semana y festivos</div>
        </div>
        <div className="kpi navy">
          <div className="label">Flotantes visibles</div>
          <div className="value">{floatersByLocation.WEWORK.length + floatersByLocation.OFICINA_93.length}</div>
          <div className="hint">WeWork y 93</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Asignacion mensual de puestos flotantes</h3></div>
        <div className="card-body">
          <div className="matrix-wrap">
            <table className="matrix desk-matrix">
              <thead>
                <tr>
                  <th className="name-col">Persona</th>
                  {schedule.days.map((iso) => (
                    <th key={`month-head-${iso}`} className="dh">
                      <div className="wd">{WEEKDAY_LABEL[weekdayKey(iso)].slice(0, 2)}</div>
                      <div className="dn">{prettyDate(iso).split(' ')[0]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LOCATIONS.map(([location, label]) => {
                  const floaters = floatersByLocation[location] || []
                  return (
                    <React.Fragment key={`week-${location}`}>
                      <tr className="desk-matrix-section-row">
                        <td className="name-col desk-matrix-section-name">{label}</td>
                        {schedule.days.map((iso) => (
                          <td key={`section-${location}-${iso}`} className="daycell desk-matrix-section-fill" />
                        ))}
                      </tr>
                      {floaters.length === 0 && (
                        <tr>
                          <td className="name-col empty">Sin flotantes</td>
                          {schedule.days.map((iso) => <td key={`empty-${location}-${iso}`} className="daycell"><div className="cell NOT_APPLICABLE readOnly">-</div></td>)}
                        </tr>
                      )}
                      {floaters.map((employee) => (
                        <tr key={`${location}-${employee.id}`}>
                          <td className="name-col desk-week-person">{employee.name}</td>
                          {schedule.days.map((iso) => {
                            const cell = resolveDeskCell(employee, iso, schedule, floatingResult, location, deskPreset?.labels)
                            return (
                              <td key={`${employee.id}-${iso}`} className="daycell">
                                <div className={deskCellClassName(cell)}>{cell.label}</div>
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