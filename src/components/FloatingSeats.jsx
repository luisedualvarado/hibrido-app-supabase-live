import React, { useMemo, useState } from 'react'
import { isWeekend, WEEKDAY_LABEL, weekdayKey, dayOfMonth } from '../logic/dateUtils.js'
import { isFloatingSeatEligible } from '../logic/rotationPolicy.js'

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
    'arenas-juan__2026-06-03': '14',
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
  const [loc, setLoc] = useState('ALL')
  const employeesById = useMemo(() => Object.fromEntries(employees.map((employee) => [employee.id, employee])), [employees])
  const deskPreset = month === 5 && year === 2026 ? JUNE_2026_DESK_PRESET : null

  const filtered = useMemo(() => {
    const eligibleEmployees = employees.filter(isFloatingSeatEligible)
    const presetEmployeeIds = new Set(
      deskPreset ? LOCATIONS.flatMap(([location]) => deskPreset[location] || []) : []
    )
    const baseEmployees = deskPreset
      ? [
          ...LOCATIONS.flatMap(([location]) => (deskPreset[location] || []).map((employeeId) => employeesById[employeeId]).filter(isFloatingSeatEligible)),
          ...eligibleEmployees.filter((employee) => !presetEmployeeIds.has(employee.id)),
        ]
      : eligibleEmployees

    return Array.from(new Map(baseEmployees.map((employee) => [employee.id, employee])).values())
      .filter((employee) => !search || employee.name.toLowerCase().includes(search.toLowerCase()))
      .filter((employee) => loc === 'ALL' || employee.baseLocation === loc)
      .sort(byName)
  }, [deskPreset, employees, employeesById, loc, search])

  if (!schedule?.days?.length) return <div className="empty">No hay dias disponibles para mostrar puestos.</div>

  return (
    <div>
      <div className="filters">
        <div className="fg" style={{ minWidth: 200 }}>
          <label>Buscar persona</label>
          <input type="text" placeholder="Nombre..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="fg">
          <label>Ubicación</label>
          <select value={loc} onChange={(event) => setLoc(event.target.value)}>
            <option value="ALL">Todas</option>
            <option value="WEWORK">WeWork</option>
            <option value="OFICINA_93">Oficina 93</option>
          </select>
        </div>
      </div>

      <div className="matrix-wrap">
        <table className="matrix desk-matrix">
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
            {filtered.map((employee) => (
              <tr key={employee.id}>
                <td className="name-col">
                  {employee.name}
                  <span className={`badge ${employee.baseLocation === 'OFICINA_93' ? 'green' : 'navy'}`} style={{ marginLeft: 6, fontSize: 9 }}>
                    {employee.baseLocation === 'OFICINA_93' ? '93' : 'WW'}
                  </span>
                  <span className="badge navy" style={{ marginLeft: 6, fontSize: 9 }}>FLOT</span>
                </td>
                {schedule.days.map((iso) => {
                  const cell = resolveDeskCell(employee, iso, schedule, floatingResult, employee.baseLocation, deskPreset?.labels)
                  return (
                    <td key={`${employee.id}-${iso}`} className="daycell">
                      <div className={deskCellClassName(cell)}>{cell.label}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
