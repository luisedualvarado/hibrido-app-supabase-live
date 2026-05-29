import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Sidebar } from './components/Shared.jsx'
import Dashboard from './components/Dashboard.jsx'
import MonthlySchedule from './components/MonthlySchedule.jsx'
import DailyView from './components/DailyView.jsx'
import People from './components/People.jsx'
import Restrictions from './components/Restrictions.jsx'
import { Absences, Holidays, Parking, Office93Rotation, ManualOverrides, Settings, ExportPanel } from './components/Panels.jsx'

import { initialEmployees } from './data/initialEmployees.js'
import { initialHolidays, initialAbsences, defaultParameters } from './data/initialHolidays.js'

import { enforceNoOfficeOvercapacity, generateMonthlySchedule } from './logic/scheduleGenerator.js'
import { assignParkingForMonth, parkingUsageByDay, assignFloatingSeats, applyManualOverrides } from './logic/parkingGenerator.js'
import { assignOffice93ForMonth, applyOffice93Assignment } from './logic/locationRotation.js'
import { buildDailySummary, validateSchedule, buildDashboardKPIs } from './logic/validators.js'
import { MONTH_LABEL, isHoliday, isOddCalendarDay, isWeekend } from './logic/dateUtils.js'

const TITLES = {
  dashboard: 'Dashboard',
  monthly: 'Programacion mensual',
  daily: 'Vista diaria',
  people: 'Personal',
  restrictions: 'Restricciones',
  absences: 'Vacaciones / Ausencias',
  holidays: 'Festivos',
  office93: 'Oficina 93',
  parking: 'Parqueaderos',
  overrides: 'Ajustes manuales',
  settings: 'Configuracion',
  export: 'Exportar / Importar',
}

const periodKeyFor = (year, month) => `${year}-${month}`
const EMPTY_ARRAY = []
const MIN_YEAR = 2026
const MIN_MONTH = 5
const PUBLIC_READ_ONLY = import.meta.env.VITE_PUBLIC_READ_ONLY === 'true'
const PUBLIC_VIEWS = ['dashboard', 'monthly', 'daily']
const PUBLIC_JUNE_OFFICE93_IDS = [
  'hilario-martin',
  'rodriguez-edwin',
  'ladino-alejandro',
  'quintero-brayan',
  'tarazona-elkin',
  'olea-david',
  'agudelo-carlos',
  'espinoza-paula',
  'plazas-paula',
  'hernandez-ivonne',
  'cardenas-jaime',
  'camargo-jessel',
  'valdez-lianeth-carolina',
  'salazar-diego',
  'cortes-german',
]
const PUBLIC_JUNE_PARAMS_OVERRIDE = {
  seats93: 11,
}
const PUBLIC_JUNE_EMPLOYEE_OVERRIDES = {
  'tarazona-elkin': { hybridApproved: false },
  'cortes-german': { hybridApproved: false, isFloating: true },
  'salazar-diego': { isFloating: true },
  'valdez-lianeth-carolina': { isFloating: true },
}
const PUBLIC_JUNE_IVONNE_ID = 'hernandez-ivonne'
const PUBLIC_JUNE_BRAYAN_ID = 'quintero-brayan'
const PUBLIC_JUNE_BRAYAN_WEEKLY_HOME_LIMIT = 1
const PUBLIC_JUNE_GERMAN_ID = 'cortes-german'
const PUBLIC_JUNE_GERMAN_HOME_DATES = new Set([
  '2026-06-01',
  '2026-06-04',
])
const PUBLIC_JUNE_IVONNE_ABSENCE_DATES = new Set([
  '2026-06-01',
  '2026-06-02',
  '2026-06-03',
  '2026-06-04',
  '2026-06-05',
])
const STORAGE_KEY = 'hibrido-app-state-v2'
const BACKUP_KEY = 'hibrido-app-state-v2-backup'
const BACKUP_HISTORY_KEY = 'hibrido-app-state-v2-backups'

function normalizePeriod(year, month) {
  const safeYear = Number.isFinite(year) ? year : MIN_YEAR
  const safeMonth = Number.isFinite(month) ? month : MIN_MONTH
  if (safeYear < MIN_YEAR) return { year: MIN_YEAR, month: MIN_MONTH }
  if (safeYear === MIN_YEAR && safeMonth < MIN_MONTH) return { year: MIN_YEAR, month: MIN_MONTH }
  return { year: safeYear, month: safeMonth }
}

function parseJSON(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    return null
  }
}

function rememberBackup(raw) {
  const snap = parseJSON(raw)
  if (!snap?.employees?.length) return
  window.localStorage.setItem(BACKUP_KEY, raw)
  const history = parseJSON(window.localStorage.getItem(BACKUP_HISTORY_KEY)) || []
  const nextEntry = {
    savedAt: new Date().toISOString(),
    employeeCount: snap.employees.length,
    data: snap,
  }
  const withoutDuplicate = history.filter((entry) => JSON.stringify(entry.data) !== JSON.stringify(snap))
  window.localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify([nextEntry, ...withoutDuplicate].slice(0, 10)))
}

function latestBackup() {
  const history = parseJSON(window.localStorage.getItem(BACKUP_HISTORY_KEY)) || []
  if (history[0]?.data) return history[0].data
  return parseJSON(window.localStorage.getItem(BACKUP_KEY))
}

function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return parseJSON(raw) || {}
  } catch (error) {
    return {}
  }
}

function applyPublicJuneOffice93Adjustments(schedule, employees, holidays) {
  const adjustedEmployees = employees.map((employee) => (
    PUBLIC_JUNE_EMPLOYEE_OVERRIDES[employee.id]
      ? { ...employee, ...PUBLIC_JUNE_EMPLOYEE_OVERRIDES[employee.id] }
      : employee
  ))

  const cells = { ...schedule.cells }
  const officeOnlyIds = ['tarazona-elkin', 'cortes-german']

  for (const iso of schedule.days) {
    if (isWeekend(iso) || isHoliday(iso, holidays)) continue

    for (const employeeId of officeOnlyIds) {
      const key = `${employeeId}__${iso}`
      const cell = cells[key]
      if (employeeId === PUBLIC_JUNE_GERMAN_ID && PUBLIC_JUNE_GERMAN_HOME_DATES.has(iso)) continue
      if (cell?.status === 'HOME') {
        cells[key] = { ...cell, status: 'OFFICE', source: 'PUBLIC', alerts: [] }
      }
    }

    if (PUBLIC_JUNE_GERMAN_HOME_DATES.has(iso)) {
      const germanKey = `${PUBLIC_JUNE_GERMAN_ID}__${iso}`
      const germanCell = cells[germanKey]
      if (germanCell?.status === 'OFFICE' || germanCell?.status === 'HOME') {
        cells[germanKey] = { ...germanCell, status: 'HOME', source: 'PUBLIC', alerts: [] }
      }
    }

    const ivonneKey = `${PUBLIC_JUNE_IVONNE_ID}__${iso}`
    const ivonneCell = cells[ivonneKey]
    if (!ivonneCell) continue

    if (PUBLIC_JUNE_IVONNE_ABSENCE_DATES.has(iso)) {
      cells[ivonneKey] = { ...ivonneCell, status: 'ABSENCE', source: 'PUBLIC', alerts: [] }
      continue
    }

    if (ivonneCell.status !== 'OFFICE' && ivonneCell.status !== 'HOME') continue
    cells[ivonneKey] = {
      ...ivonneCell,
      status: isOddCalendarDay(iso) ? 'HOME' : 'OFFICE',
      source: 'PUBLIC',
      alerts: [],
    }
  }

  schedule.weeks.forEach((week) => {
    const brayanHomeDays = week.workdays.filter((iso) => cells[`${PUBLIC_JUNE_BRAYAN_ID}__${iso}`]?.status === 'HOME')
    brayanHomeDays.slice(PUBLIC_JUNE_BRAYAN_WEEKLY_HOME_LIMIT).forEach((iso) => {
      const key = `${PUBLIC_JUNE_BRAYAN_ID}__${iso}`
      cells[key] = { ...cells[key], status: 'OFFICE', source: 'PUBLIC', alerts: [] }
    })
  })

  return {
    employees: adjustedEmployees,
    schedule: { ...schedule, cells },
  }
}

export default function App() {
  const now = new Date()
  const stored = useMemo(() => loadStoredState(), [])
  const editableStored = PUBLIC_READ_ONLY ? {} : stored
  const initialPeriod = useMemo(() => normalizePeriod(
    typeof editableStored.year === 'number' ? editableStored.year : now.getFullYear(),
    typeof editableStored.month === 'number' ? editableStored.month : now.getMonth()
  ), [editableStored, now])
  const [view, setView] = useState('dashboard')
  const showPeriodControls = ['dashboard', 'monthly', 'daily', 'office93'].includes(view)
  const [employees, setEmployees] = useState(editableStored.employees || initialEmployees)
  const [holidays, setHolidays] = useState(editableStored.holidays || initialHolidays)
  const [absences, setAbsences] = useState(editableStored.absences || initialAbsences)
  const [manualOverrides, setManualOverrides] = useState(editableStored.manualOverrides || [])
  const [params, setParams] = useState(editableStored.params || defaultParameters)
  const [month, setMonth] = useState(initialPeriod.month)
  const [year, setYear] = useState(initialPeriod.year)
  const [manualParking, setManualParking] = useState(editableStored.manualParking || [])
  const [manualOffice93ByPeriod, setManualOffice93ByPeriod] = useState(editableStored.manualOffice93ByPeriod || {})
  const [generationTick, setGenerationTick] = useState(0)
  const periodKey = periodKeyFor(year, month)
  const hasManualOffice93 = Object.prototype.hasOwnProperty.call(manualOffice93ByPeriod, periodKey)
  const manualOffice93 = hasManualOffice93 ? manualOffice93ByPeriod[periodKey] : EMPTY_ARRAY

  const setSafeView = useCallback((nextView) => {
    setView(PUBLIC_READ_ONLY && !PUBLIC_VIEWS.includes(nextView) ? 'dashboard' : nextView)
  }, [])

  useEffect(() => {
    if (PUBLIC_READ_ONLY && (year !== MIN_YEAR || month !== MIN_MONTH)) {
      setYear(MIN_YEAR)
      setMonth(MIN_MONTH)
    }
  }, [month, year])

  const setManualOffice93ForPeriod = useCallback((updater) => {
    setManualOffice93ByPeriod((prev) => {
      const current = prev[periodKey] || []
      const next = typeof updater === 'function' ? updater(current) : updater
      const copy = { ...prev }
      if (next === undefined || next === null) delete copy[periodKey]
      else copy[periodKey] = next
      return copy
    })
  }, [periodKey])

  const handleMonthChange = (nextMonth) => {
    const next = normalizePeriod(year, nextMonth)
    setYear(next.year)
    setMonth(next.month)
  }

  const handleYearChange = (nextYear) => {
    const next = normalizePeriod(nextYear, month)
    setYear(next.year)
    setMonth(next.month)
  }

  const computed = useMemo(() => {
    const publicJuneOffice93 = PUBLIC_READ_ONLY && year === MIN_YEAR && month === MIN_MONTH
      ? PUBLIC_JUNE_OFFICE93_IDS
      : null
    const effectiveParams = PUBLIC_READ_ONLY && year === MIN_YEAR && month === MIN_MONTH
      ? { ...params, ...PUBLIC_JUNE_PARAMS_OVERRIDE }
      : params
    const office93AssignedAuto = assignOffice93ForMonth({ employees, params, monthIndex: month, manualOffice93 })
    const office93Assigned = publicJuneOffice93 || (hasManualOffice93 ? Array.from(new Set(manualOffice93)) : office93AssignedAuto)
    const effectiveEmployees = applyOffice93Assignment(employees, office93Assigned)

    const base = generateMonthlySchedule({
      employees: effectiveEmployees,
      holidays,
      absences,
      manualOverrides,
      month,
      year,
      params: effectiveParams,
      generationSeed: `${year}-${month}`,
    })
    const schedule = enforceNoOfficeOvercapacity(
      applyManualOverrides(base, manualOverrides, effectiveEmployees, effectiveParams),
      effectiveEmployees,
      holidays,
      effectiveParams,
      `${year}-${month}-final`
    )

    const publicJuneAdjusted = PUBLIC_READ_ONLY && year === MIN_YEAR && month === MIN_MONTH
      ? applyPublicJuneOffice93Adjustments(schedule, effectiveEmployees, holidays)
      : { schedule, employees: effectiveEmployees }
    const effectiveSchedule = publicJuneAdjusted.schedule
    const effectiveEmployeesView = publicJuneAdjusted.employees

    const parkingAssignedAuto = assignParkingForMonth({
      employees: effectiveEmployeesView,
      params: effectiveParams,
      monthIndex: month,
      manualParking,
    })
    const parkingAssigned = (manualParking.length ? manualParking : parkingAssignedAuto).slice(0, effectiveParams.parkingSpots)

    const parkingUsage = parkingUsageByDay(effectiveSchedule, parkingAssigned, effectiveEmployeesView, effectiveSchedule.days)
    const { result: floatingResult, alerts: floatAlerts } = assignFloatingSeats(effectiveSchedule, effectiveEmployeesView, effectiveSchedule.days, effectiveParams)

    const { summary, alerts: dailyAlerts } = buildDailySummary(
      effectiveSchedule,
      effectiveEmployeesView,
      effectiveSchedule.days,
      effectiveParams,
      parkingUsage,
      floatingResult,
      holidays
    )
    const validationAlerts = validateSchedule(effectiveSchedule, effectiveEmployeesView, year, month, holidays)

    const allAlerts = [...effectiveSchedule.alerts, ...floatAlerts, ...dailyAlerts, ...validationAlerts]
      .sort((a, b) => {
        const order = { CRITICAL: 0, WARNING: 1, INFO: 2 }
        return order[a.severity] - order[b.severity]
      })
    const kpis = buildDashboardKPIs(effectiveEmployeesView, summary, effectiveParams, parkingAssigned, allAlerts)

    return {
      schedule: effectiveSchedule,
      effectiveEmployees: effectiveEmployeesView,
      office93Assigned,
      parkingAssigned,
      parkingUsage,
      floatingResult,
      summary,
      allAlerts,
      kpis,
      effectiveParams,
    }
  }, [employees, holidays, absences, manualOverrides, month, year, params, manualParking, manualOffice93, hasManualOffice93, generationTick])

  const saveOverride = useCallback((employeeId, date, status, reason) => {
    setManualOverrides((prev) => {
      const without = prev.filter((o) => !(o.employeeId === employeeId && o.date === date))
      return [...without, { id: `${employeeId}-${date}`, employeeId, date, status, reason, createdAt: new Date().toISOString() }]
    })
  }, [])

  const deleteOverride = useCallback((employeeId, date) => {
    setManualOverrides((prev) => prev.filter((o) => !(o.employeeId === employeeId && o.date === date)))
  }, [])

  const deleteEmployee = useCallback((employeeId) => {
    setEmployees((prev) => prev.filter((employee) => employee.id !== employeeId))
    setAbsences((prev) => prev.filter((absence) => absence.employeeId !== employeeId))
    setManualOverrides((prev) => prev.filter((override) => override.employeeId !== employeeId))
    setManualParking((prev) => prev.filter((id) => id !== employeeId))
    setManualOffice93ByPeriod((prev) => Object.fromEntries(
      Object.entries(prev).map(([key, ids]) => [key, ids.filter((id) => id !== employeeId)])
    ))
  }, [])

  const clearOverrides = () => {
    setManualOverrides([])
    setManualOffice93ForPeriod([])
  }
  const regenerate = () => {
    setGenerationTick((tick) => tick + 1)
  }

  const buildSnapshot = () => ({
    version: 1,
    employees,
    holidays,
    absences,
    manualOverrides,
    params,
    month,
    year,
    manualParking,
    manualOffice93ByPeriod,
  })

  const importSnapshot = (snap) => {
    if (snap.employees) setEmployees(snap.employees)
    if (snap.holidays) setHolidays(snap.holidays)
    if (snap.absences) setAbsences(snap.absences)
    if (snap.manualOverrides) setManualOverrides(snap.manualOverrides)
    if (snap.params) setParams(snap.params)
    const nextPeriod = normalizePeriod(
      typeof snap.year === 'number' ? snap.year : year,
      typeof snap.month === 'number' ? snap.month : month
    )
    setYear(nextPeriod.year)
    setMonth(nextPeriod.month)
    if (snap.manualParking) setManualParking(snap.manualParking)
    if (snap.manualOffice93ByPeriod) setManualOffice93ByPeriod(snap.manualOffice93ByPeriod)
    else if (snap.manualOffice93) {
      const importedKey = periodKeyFor(nextPeriod.year, nextPeriod.month)
      setManualOffice93ByPeriod({ [importedKey]: snap.manualOffice93 })
    }
    setView('dashboard')
  }

  const restoreBackup = () => {
    const backup = latestBackup()
    if (!backup) {
      window.alert('No hay respaldo local disponible.')
      return
    }
    const ok = window.confirm(`Restaurar respaldo con ${backup.employees?.length || 0} personas? Esto reemplazara los datos actuales por ese respaldo.`)
    if (ok) importSnapshot(backup)
  }

  useEffect(() => {
    const state = {
      version: 2,
      employees,
      holidays,
      absences,
      manualOverrides,
      params,
      month,
      year,
      manualParking,
      manualOffice93ByPeriod,
    }
    const previous = window.localStorage.getItem(STORAGE_KEY)
    const next = JSON.stringify(state)
    if (previous && previous !== next) rememberBackup(previous)
    window.localStorage.setItem(STORAGE_KEY, next)
  }, [employees, holidays, absences, manualOverrides, params, month, year, manualParking, manualOffice93ByPeriod])

  useEffect(() => {
    if (PUBLIC_READ_ONLY && !PUBLIC_VIEWS.includes(view)) setView('dashboard')
  }, [view])

  return (
    <div className="app">
      <Sidebar view={view} setView={setSafeView} readOnly={PUBLIC_READ_ONLY} />
      <div className="main">
        <header className="topbar">
          <div>
            <h2>{TITLES[view]}</h2>
            <div className="meta">
              {MONTH_LABEL[month]} {year} · {computed.kpis.approvedCount} en rotacion · {computed.office93Assigned.length} en Oficina 93 · {computed.kpis.criticalAlerts} alertas criticas
            </div>
          </div>
          <div className="topbar-actions">
            {showPeriodControls && !PUBLIC_READ_ONLY && (
              <div className="topbar-period">
                <div className="topbar-field">
                  <label>Mes</label>
                  <select value={month} onChange={(e) => handleMonthChange(Number(e.target.value))}>
                    {MONTH_LABEL.map((label, index) => (
                      year === MIN_YEAR && index < MIN_MONTH
                        ? null
                        : <option key={label} value={index}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="topbar-field topbar-field-year">
                  <label>Anio</label>
                  <input type="number" min={MIN_YEAR} value={year} onChange={(e) => handleYearChange(Number(e.target.value))} />
                </div>
              </div>
            )}
            {!PUBLIC_READ_ONLY && <button className="btn btn-ghost" onClick={clearOverrides}>Limpiar ajustes</button>}
            {!PUBLIC_READ_ONLY && <button className="btn btn-green" onClick={regenerate}>Generar programacion</button>}
          </div>
        </header>
        <main className="content">
          {view === 'dashboard' && (
            <Dashboard
              kpis={computed.kpis}
              summary={computed.summary}
              alerts={computed.allAlerts}
              month={month}
              year={year}
              params={computed.effectiveParams}
              employees={computed.effectiveEmployees}
              schedule={computed.schedule}
              parkingAssigned={computed.parkingAssigned}
              hideAlerts={PUBLIC_READ_ONLY}
            />
          )}
          {view === 'monthly' && (
            <MonthlySchedule
              schedule={computed.schedule}
              employees={computed.effectiveEmployees}
              onSaveOverride={saveOverride}
              onDeleteOverride={deleteOverride}
              manualOverrides={manualOverrides}
              readOnly={PUBLIC_READ_ONLY}
              hideAlerts={PUBLIC_READ_ONLY}
            />
          )}
          {view === 'daily' && (
            <DailyView
              schedule={computed.schedule}
              employees={computed.effectiveEmployees}
              summary={computed.summary}
              floatingResult={computed.floatingResult}
              parkingUsage={computed.parkingUsage}
              params={computed.effectiveParams}
              hideAlerts={PUBLIC_READ_ONLY}
            />
          )}
          {view === 'people' && <People employees={employees} setEmployees={setEmployees} onDeleteEmployee={deleteEmployee} />}
          {view === 'restrictions' && <Restrictions employees={employees} setEmployees={setEmployees} />}
          {view === 'absences' && <Absences employees={employees} absences={absences} setAbsences={setAbsences} />}
          {view === 'holidays' && <Holidays holidays={holidays} setHolidays={setHolidays} />}
          {view === 'office93' && (
            <Office93Rotation
              employees={employees}
              assigned={computed.office93Assigned}
              setManualOffice93={setManualOffice93ForPeriod}
              params={params}
              month={month}
              year={year}
            />
          )}
          {view === 'parking' && (
            <Parking
              employees={computed.effectiveEmployees}
              parkingAssigned={computed.parkingAssigned}
              setManualParking={setManualParking}
              params={params}
              parkingUsage={computed.parkingUsage}
            />
          )}
          {view === 'overrides' && <ManualOverrides employees={computed.effectiveEmployees} manualOverrides={manualOverrides} onDelete={deleteOverride} />}
          {view === 'settings' && <Settings params={params} setParams={setParams} />}
          {view === 'export' && (
            <ExportPanel
              buildSnapshot={buildSnapshot}
              schedule={computed.schedule}
              employees={computed.effectiveEmployees}
              summary={computed.summary}
              alerts={computed.allAlerts}
              onImport={importSnapshot}
              onRestoreBackup={restoreBackup}
            />
          )}
        </main>
      </div>
    </div>
  )
}
