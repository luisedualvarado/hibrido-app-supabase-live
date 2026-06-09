import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Sidebar } from './components/Shared.jsx'
import Dashboard from './components/Dashboard.jsx'
import MonthlySchedule from './components/MonthlySchedule.jsx'
import DailyView from './components/DailyView.jsx'
import FloatingSeats from './components/FloatingSeats.jsx'
import People from './components/People.jsx'
import Restrictions from './components/Restrictions.jsx'
import { Absences, Holidays, Parking, Office93Rotation, Lockers, ManualOverrides, Settings, ExportPanel } from './components/Panels.jsx'

import { initialEmployees } from './data/initialEmployees.js'
import { initialHolidays, initialAbsences, defaultParameters } from './data/initialHolidays.js'
import publishedSnapshot from './data/publishedSnapshot.json'

import { enforceNoOfficeOvercapacity, generateMonthlySchedule } from './logic/scheduleGenerator.js'
import { assignParkingForMonth, parkingUsageByDay, assignFloatingSeats, applyManualOverrides } from './logic/parkingGenerator.js'
import { assignOffice93ForMonth, applyOffice93Assignment } from './logic/locationRotation.js'
import { assignLockersForMonth } from './logic/lockerGenerator.js'
import { buildDailySummary, validateSchedule, buildDashboardKPIs } from './logic/validators.js'
import { MONTH_LABEL, isHoliday, isOddCalendarDay, isWeekend } from './logic/dateUtils.js'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import {
  GITHUB_SYNC_ENABLED,
  GITHUB_SYNC_POLL_INTERVAL_MS,
  GITHUB_SYNC_REPO_LABEL,
  clearGitHubSyncToken as clearStoredGitHubSyncToken,
  fetchPublishedSnapshot,
  loadGitHubSyncToken,
  publishPublishedSnapshot,
  saveGitHubSyncToken as storeGitHubSyncToken,
} from './logic/githubSync.js'

const TITLES = {
  dashboard: 'Dashboard',
  monthly: 'Programacion mensual',
  daily: 'Vista diaria',
  desks: 'Puestos Flotantes',
  people: 'Personal',
  restrictions: 'Restricciones',
  absences: 'Vacaciones / Ausencias',
  holidays: 'Festivos',
  office93: 'Oficina 93',
  lockers: 'Lockers',
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
const PUBLIC_PUBLISHED_JUNE_LOCK = import.meta.env.VITE_PUBLIC_PUBLISHED_JUNE === 'true'
const PUBLIC_VIEWS = ['dashboard', 'monthly', 'daily', 'desks', 'lockers']
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
const PUBLIC_JUNE_LOCKER_ASSIGNMENTS = [
  { employeeId: 'archila-karen', lockerNumber: '001' },
  { employeeId: 'rojas-camilo', lockerNumber: '001' },
  { employeeId: 'artunduaga-angelica', lockerNumber: '002' },
  { employeeId: 'bejarano-fernando', lockerNumber: '003' },
  { employeeId: 'vanegas-kaory', lockerNumber: '003' },
  { employeeId: 'castaneda-kevin', lockerNumber: '004' },
  { employeeId: 'bello-astrid', lockerNumber: '005' },
  { employeeId: 'cardenas-andres-felipe', lockerNumber: '005' },
  { employeeId: 'arenas-juan', lockerNumber: '006' },
  { employeeId: 'vera-steven', lockerNumber: '006' },
  { employeeId: 'contreras-julian', lockerNumber: '007' },
  { employeeId: 'daza-santiago', lockerNumber: '008' },
  { employeeId: 'desalvador-diego', lockerNumber: '009' },
  { employeeId: 'escobar-andrea', lockerNumber: '010' },
  { employeeId: 'escobar-andres', lockerNumber: '011' },
  { employeeId: 'achury-ashly', lockerNumber: '012' },
  { employeeId: 'barboza-liset', lockerNumber: '012' },
  { employeeId: 'dulce-camilo', lockerNumber: '013' },
  { employeeId: 'gallo-ana-maria', lockerNumber: '013' },
  { employeeId: 'velosa-over', lockerNumber: '014' },
  { employeeId: 'fuentes-andres', lockerNumber: '015' },
  { employeeId: 'giraldo-nelson', lockerNumber: '016' },
  { employeeId: 'gonzalez-julian', lockerNumber: '017' },
  { employeeId: 'garcia-gabriel', lockerNumber: '018' },
  { employeeId: 'quiroz-millan-juan', lockerNumber: '018' },
  { employeeId: 'gonzalez-luis', lockerNumber: '100' },
  { employeeId: 'almeida-daniel', lockerNumber: '101' },
  { employeeId: 'alvarado-luis', lockerNumber: '102' },
  { employeeId: 'bohorquez-samuel', lockerNumber: '102' },
  { employeeId: 'guevara-luis', lockerNumber: '103' },
  { employeeId: 'guevara-marylin', lockerNumber: '104' },
  { employeeId: 'jimenez-johana', lockerNumber: '105' },
  { employeeId: 'lancheros-rafael', lockerNumber: '106' },
  { employeeId: 'latorre-juan-camilo', lockerNumber: '107' },
  { employeeId: 'morales-jonathan', lockerNumber: '107' },
  { employeeId: 'molina-jessica', lockerNumber: '108' },
  { employeeId: 'morales-fabio', lockerNumber: '109' },
  { employeeId: 'nino-samuel', lockerNumber: '110' },
  { employeeId: 'ochoa-rafael', lockerNumber: '111' },
  { employeeId: 'perez-leidy', lockerNumber: '112' },
  { employeeId: 'pinto-juan-felipe', lockerNumber: '113' },
  { employeeId: 'rodriguez-sofia', lockerNumber: '114' },
  { employeeId: 'salinas-nelson', lockerNumber: '115' },
  { employeeId: 'tibocha-jhonattan', lockerNumber: '116' },
  { employeeId: 'reyes-oscar', lockerNumber: '117' },
  { employeeId: 'teheran-gabriel', lockerNumber: '117' },
]
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
const SHARE_SNAPSHOT_PARAM = 'snapshot'
const ADMIN_SESSION_KEY = 'hibrido-app-admin-session'
const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123'
const INITIAL_EMPLOYEES_BY_ID = Object.fromEntries(initialEmployees.map((employee) => [employee.id, employee]))

function buildSavedWeekEntry(week) {
  return {
    weekId: week.weekId,
    startDate: week.workdays[0] || null,
    endDate: week.workdays[week.workdays.length - 1] || null,
    workdays: week.workdays,
    savedAt: new Date().toISOString(),
  }
}

function isSavedWeekGeneratedOverride(override) {
  return typeof override?.reason === 'string' && /^Semana\s.+\sguardada$/i.test(override.reason)
}

function filterScheduleOverrides(overrides) {
  return overrides.filter((override) => !(isSavedWeekGeneratedOverride(override) && ['VACATION', 'ABSENCE'].includes(override.status)))
}

function mergeEmployeeSeatDefaults(employeeList) {
  return employeeList.map((employee) => {
    const initialEmployee = INITIAL_EMPLOYEES_BY_ID[employee.id]
    if (!initialEmployee) return employee

    let nextEmployee = employee

    if (initialEmployee.baseSeat && !employee.baseSeat) {
      nextEmployee = { ...nextEmployee, baseSeat: initialEmployee.baseSeat }
    }

    if (employee.nameOverride !== true && initialEmployee.name && employee.name !== initialEmployee.name) {
      nextEmployee = nextEmployee === employee
        ? { ...nextEmployee, name: initialEmployee.name }
        : { ...nextEmployee, name: initialEmployee.name }
    }

    return nextEmployee
  })
}

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
    return hydrateSnapshotState(parseJSON(raw) || {})
  } catch (error) {
    return {}
  }
}

function hydrateSnapshotState(parsed) {
  if (!Array.isArray(parsed.employees)) return parsed

  return {
    ...parsed,
    employees: mergeEmployeeSeatDefaults(parsed.employees),
  }
}

function loadPublishedState() {
  return hydrateSnapshotState(publishedSnapshot || {})
}

function loadSharedSnapshot() {
  try {
    const url = new URL(window.location.href)
    const compressed = url.searchParams.get(SHARE_SNAPSHOT_PARAM)
    if (!compressed) return null

    const decompressed = decompressFromEncodedURIComponent(compressed)
    return hydrateSnapshotState(parseJSON(decompressed) || {})
  } catch (error) {
    return null
  }
}

function loadInitialState() {
  const sharedSnapshot = loadSharedSnapshot()
  if (sharedSnapshot) return sharedSnapshot

  if (PUBLIC_READ_ONLY) {
    const publishedState = loadPublishedState()
    if (Array.isArray(publishedState.employees)) return publishedState
  }

  return loadStoredState()
}

function buildShareUrl(snapshot) {
  const url = new URL(window.location.href)
  url.searchParams.set(SHARE_SNAPSHOT_PARAM, compressToEncodedURIComponent(JSON.stringify(snapshot)))
  return url.toString()
}

function loadAdminSession() {
  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'
  } catch (error) {
    return false
  }
}

function buildComputedState({
  employees,
  holidays,
  absences,
  manualOverrides,
  month,
  year,
  params,
  manualParking,
  manualOffice93,
  hasManualOffice93,
  manualDeskAssignments,
  manualLockers,
  readOnly,
}) {
  const isPublishedJune = PUBLIC_PUBLISHED_JUNE_LOCK && readOnly && year === MIN_YEAR && month === MIN_MONTH
  const publicJuneOffice93 = isPublishedJune
    ? PUBLIC_JUNE_OFFICE93_IDS
    : null
  const effectiveParams = isPublishedJune
    ? { ...params, ...PUBLIC_JUNE_PARAMS_OVERRIDE }
    : params
  const office93AssignedAuto = assignOffice93ForMonth({ employees, params, monthIndex: month, manualOffice93 })
  const office93Assigned = publicJuneOffice93 || (hasManualOffice93 ? Array.from(new Set(manualOffice93)) : office93AssignedAuto)
  const effectiveEmployees = applyOffice93Assignment(employees, office93Assigned)
  const effectiveManualOverrides = filterScheduleOverrides(manualOverrides)

  const base = generateMonthlySchedule({
    employees: effectiveEmployees,
    holidays,
    absences,
    manualOverrides: effectiveManualOverrides,
    month,
    year,
    params: effectiveParams,
    generationSeed: `${year}-${month}`,
  })
  const schedule = enforceNoOfficeOvercapacity(
    applyManualOverrides(base, effectiveManualOverrides, effectiveEmployees, effectiveParams),
    effectiveEmployees,
    holidays,
    effectiveParams,
    `${year}-${month}-final`
  )

  const publicJuneAdjusted = isPublishedJune
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
  const { result: floatingResult, alerts: floatAlerts } = assignFloatingSeats(
    effectiveSchedule,
    effectiveEmployeesView,
    effectiveSchedule.days,
    effectiveParams,
    manualDeskAssignments
  )
  const effectiveManualLockers = isPublishedJune && readOnly
    ? PUBLIC_JUNE_LOCKER_ASSIGNMENTS
    : manualLockers
  const lockerResult = assignLockersForMonth({
    employees: effectiveEmployeesView,
    lockerCount: effectiveParams.lockers,
    manualAssignments: effectiveManualLockers,
  })

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
    lockerResult,
    summary,
    allAlerts,
    kpis,
    effectiveParams,
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
  const stored = useMemo(() => loadInitialState(), [])
  const [isAdmin, setIsAdmin] = useState(() => loadAdminSession())
  const [authError, setAuthError] = useState('')
  const isReadOnly = PUBLIC_READ_ONLY && !isAdmin
  const [githubToken, setGithubToken] = useState(() => loadGitHubSyncToken())
  const [githubSyncStatus, setGithubSyncStatus] = useState(() => (loadGitHubSyncToken() ? 'connecting' : 'idle'))
  const [githubSyncError, setGithubSyncError] = useState('')
  const [githubSyncReady, setGithubSyncReady] = useState(false)
  const publishedShaRef = useRef(null)
  const lastPublishedJsonRef = useRef(JSON.stringify(loadPublishedState()))
  const editableStored = stored
  const initialPeriod = useMemo(() => normalizePeriod(
    typeof editableStored.year === 'number' ? editableStored.year : now.getFullYear(),
    typeof editableStored.month === 'number' ? editableStored.month : now.getMonth()
  ), [editableStored, now])
  const [view, setView] = useState('dashboard')
  const showPeriodControls = ['dashboard', 'monthly', 'daily', 'desks', 'office93', 'lockers'].includes(view)
  const [employees, setEmployees] = useState(mergeEmployeeSeatDefaults(editableStored.employees || initialEmployees))
  const [holidays, setHolidays] = useState(editableStored.holidays || initialHolidays)
  const [absences, setAbsences] = useState(editableStored.absences || initialAbsences)
  const [manualOverrides, setManualOverrides] = useState(editableStored.manualOverrides || [])
  const [params, setParams] = useState({ ...defaultParameters, ...(editableStored.params || {}) })
  const [month, setMonth] = useState(initialPeriod.month)
  const [year, setYear] = useState(initialPeriod.year)
  const [manualParking, setManualParking] = useState(editableStored.manualParking || [])
  const [manualOffice93ByPeriod, setManualOffice93ByPeriod] = useState(editableStored.manualOffice93ByPeriod || {})
  const [manualLockersByPeriod, setManualLockersByPeriod] = useState(editableStored.manualLockersByPeriod || {})
  const [manualDeskAssignmentsByPeriod, setManualDeskAssignmentsByPeriod] = useState(editableStored.manualDeskAssignmentsByPeriod || {})
  const [savedWeeksByPeriod, setSavedWeeksByPeriod] = useState(editableStored.savedWeeksByPeriod || {})
  const [generationTick, setGenerationTick] = useState(0)
  const periodKey = periodKeyFor(year, month)
  const hasManualOffice93 = Object.prototype.hasOwnProperty.call(manualOffice93ByPeriod, periodKey)
  const manualOffice93 = hasManualOffice93 ? manualOffice93ByPeriod[periodKey] : EMPTY_ARRAY
  const manualLockers = manualLockersByPeriod[periodKey] || EMPTY_ARRAY
  const manualDeskAssignments = manualDeskAssignmentsByPeriod[periodKey] || EMPTY_ARRAY
  const savedWeeks = savedWeeksByPeriod[periodKey] || EMPTY_ARRAY

  const setSafeView = useCallback((nextView) => {
    setView(isReadOnly && !PUBLIC_VIEWS.includes(nextView) ? 'dashboard' : nextView)
  }, [isReadOnly])

  const handleAdminLogin = useCallback((username, password) => {
    const normalizedUsername = username.trim()
    if (normalizedUsername !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      setAuthError('Credenciales admin invalidas.')
      return false
    }

    window.sessionStorage.setItem(ADMIN_SESSION_KEY, 'true')
    setIsAdmin(true)
    setAuthError('')
    return true
  }, [])

  const handleAdminLogout = useCallback(() => {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY)
    setIsAdmin(false)
    setAuthError('')
    setView('dashboard')
  }, [])

  useEffect(() => {
    if (!PUBLIC_READ_ONLY) return
    if (isAdmin) window.sessionStorage.setItem(ADMIN_SESSION_KEY, 'true')
    else window.sessionStorage.removeItem(ADMIN_SESSION_KEY)
  }, [isAdmin])

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

  const setManualDeskAssignmentsForPeriod = useCallback((updater) => {
    setManualDeskAssignmentsByPeriod((prev) => {
      const current = prev[periodKey] || []
      const next = typeof updater === 'function' ? updater(current) : updater
      const copy = { ...prev }
      if (next === undefined || next === null) delete copy[periodKey]
      else copy[periodKey] = next
      return copy
    })
  }, [periodKey])

  const setManualLockersForPeriod = useCallback((updater) => {
    setManualLockersByPeriod((prev) => {
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

  const computed = useMemo(() => buildComputedState({
    employees,
    holidays,
    absences,
    manualOverrides,
    month,
    year,
    params,
    manualParking,
    manualOffice93,
    hasManualOffice93,
    manualDeskAssignments,
    manualLockers,
    readOnly: isReadOnly,
  }), [employees, holidays, absences, manualOverrides, month, year, params, manualParking, manualOffice93, hasManualOffice93, generationTick, isReadOnly, manualDeskAssignments, manualLockers])

  const activeComputed = computed
  const activeMonth = month
  const activeYear = year
  const activeReadOnly = isReadOnly

  const saveOverride = useCallback((employeeId, date, status, reason) => {
    setManualOverrides((prev) => {
      const without = prev.filter((o) => !(o.employeeId === employeeId && o.date === date))
      return [...without, { id: `${employeeId}-${date}`, employeeId, date, status, reason, createdAt: new Date().toISOString() }]
    })
  }, [])

  const deleteOverride = useCallback((employeeId, date) => {
    setManualOverrides((prev) => prev.filter((o) => !(o.employeeId === employeeId && o.date === date)))
  }, [])

  const saveWeek = useCallback((week) => {
    const operationalStatuses = new Set(['HOME', 'OFFICE'])
    const weekDates = new Set(week.workdays)

    setManualOverrides((prev) => {
      const preserved = prev.filter((override) => !weekDates.has(override.date))
      const weekOverrides = []

      computed.effectiveEmployees.forEach((employee) => {
        week.workdays.forEach((iso) => {
          const cell = computed.schedule.cells[`${employee.id}__${iso}`]
          if (!cell || !operationalStatuses.has(cell.status)) return
          const existing = prev.find((override) => override.employeeId === employee.id && override.date === iso)
          weekOverrides.push({
            id: `${employee.id}-${iso}`,
            employeeId: employee.id,
            date: iso,
            status: cell.status,
            reason: existing?.reason || `Semana ${week.weekId} guardada`,
            createdAt: existing?.createdAt || new Date().toISOString(),
          })
        })
      })

      return [...preserved, ...weekOverrides]
    })

    setSavedWeeksByPeriod((prev) => {
      const current = prev[periodKey] || []
      return {
        ...prev,
        [periodKey]: [...current.filter((entry) => entry.weekId !== week.weekId), buildSavedWeekEntry(week)],
      }
    })
  }, [computed.effectiveEmployees, computed.schedule, periodKey])

  const clearWeek = useCallback((week) => {
    const weekDates = new Set(week.workdays)
    setManualOverrides((prev) => prev.filter((override) => !weekDates.has(override.date)))
    setSavedWeeksByPeriod((prev) => ({
      ...prev,
      [periodKey]: (prev[periodKey] || []).filter((entry) => entry.weekId !== week.weekId),
    }))
  }, [periodKey])

  const deleteEmployee = useCallback((employeeId) => {
    setEmployees((prev) => prev.filter((employee) => employee.id !== employeeId))
    setAbsences((prev) => prev.filter((absence) => absence.employeeId !== employeeId))
    setManualOverrides((prev) => prev.filter((override) => override.employeeId !== employeeId))
    setManualParking((prev) => prev.filter((id) => id !== employeeId))
    setManualOffice93ByPeriod((prev) => Object.fromEntries(
      Object.entries(prev).map(([key, ids]) => [key, ids.filter((id) => id !== employeeId)])
    ))
    setManualLockersByPeriod((prev) => Object.fromEntries(
      Object.entries(prev).map(([key, assignments]) => [key, assignments.filter((assignment) => assignment.employeeId !== employeeId)])
    ))
    setManualDeskAssignmentsByPeriod((prev) => Object.fromEntries(
      Object.entries(prev).map(([key, assignments]) => [key, assignments.filter((assignment) => assignment.employeeId !== employeeId)])
    ))
  }, [])

  const clearOverrides = () => {
    setManualOverrides([])
    setManualOffice93ForPeriod([])
    setManualLockersForPeriod([])
    setManualDeskAssignmentsForPeriod([])
    setSavedWeeksByPeriod((prev) => ({ ...prev, [periodKey]: [] }))
  }
  const regenerate = () => {
    setGenerationTick((tick) => tick + 1)
  }

  const currentSnapshot = useMemo(() => ({
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
    manualLockersByPeriod,
    manualDeskAssignmentsByPeriod,
    savedWeeksByPeriod,
  }), [employees, holidays, absences, manualOverrides, params, month, year, manualParking, manualOffice93ByPeriod, manualLockersByPeriod, manualDeskAssignmentsByPeriod, savedWeeksByPeriod])
  const currentSnapshotJson = useMemo(() => JSON.stringify(currentSnapshot), [currentSnapshot])
  const buildSnapshot = useCallback(() => currentSnapshot, [currentSnapshot])

  const copyShareLink = useCallback(async () => {
    const shareUrl = buildShareUrl(currentSnapshot)
    try {
      await window.navigator.clipboard.writeText(shareUrl)
      window.alert('Link compartible copiado. Quien abra ese link vera esta misma configuracion.')
    } catch (error) {
      window.prompt('Copia y comparte este link:', shareUrl)
    }
  }, [currentSnapshot])

  const importSnapshot = useCallback((snap, options = {}) => {
    const { resetView = true } = options
    if (snap.employees) setEmployees(mergeEmployeeSeatDefaults(snap.employees))
    if (snap.holidays) setHolidays(snap.holidays)
    if (snap.absences) setAbsences(snap.absences)
    if (snap.manualOverrides) setManualOverrides(snap.manualOverrides)
    if (snap.params) setParams({ ...defaultParameters, ...snap.params })
    const nextPeriod = normalizePeriod(
      typeof snap.year === 'number' ? snap.year : year,
      typeof snap.month === 'number' ? snap.month : month
    )
    setYear(nextPeriod.year)
    setMonth(nextPeriod.month)
    if (snap.manualParking) setManualParking(snap.manualParking)
    if (snap.manualOffice93ByPeriod) setManualOffice93ByPeriod(snap.manualOffice93ByPeriod)
    if (snap.manualLockersByPeriod) setManualLockersByPeriod(snap.manualLockersByPeriod)
    if (snap.manualDeskAssignmentsByPeriod) setManualDeskAssignmentsByPeriod(snap.manualDeskAssignmentsByPeriod)
    if (snap.savedWeeksByPeriod) setSavedWeeksByPeriod(snap.savedWeeksByPeriod)
    else if (snap.manualOffice93) {
      const importedKey = periodKeyFor(nextPeriod.year, nextPeriod.month)
      setManualOffice93ByPeriod({ [importedKey]: snap.manualOffice93 })
    }
    if (resetView) setView('dashboard')
  }, [month, year])

  const saveGithubToken = useCallback((token) => {
    const normalized = token.trim()
    storeGitHubSyncToken(normalized)
    setGithubToken(normalized)
    setGithubSyncError('')
    setGithubSyncStatus(normalized ? 'connecting' : 'idle')
  }, [])

  const clearGithubToken = useCallback(() => {
    clearStoredGitHubSyncToken()
    setGithubToken('')
    setGithubSyncReady(false)
    setGithubSyncError('')
    setGithubSyncStatus('idle')
    publishedShaRef.current = null
  }, [])

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
    if (isReadOnly) return
    const previous = window.localStorage.getItem(STORAGE_KEY)
    const next = currentSnapshotJson
    if (previous && previous !== next) rememberBackup(previous)
    window.localStorage.setItem(STORAGE_KEY, next)
  }, [currentSnapshotJson, isReadOnly])

  useEffect(() => {
    if (!GITHUB_SYNC_ENABLED) return undefined

    let cancelled = false
    let intervalId = null

    const refreshPublishedSnapshot = async () => {
      try {
        const remote = await fetchPublishedSnapshot()
        if (cancelled || !remote?.snapshot) return
        lastPublishedJsonRef.current = remote.json

        if (!isReadOnly || remote.json === currentSnapshotJson) return
        importSnapshot(remote.snapshot, { resetView: false })
      } catch (error) {
        if (!isReadOnly) return
        setGithubSyncError(error.message || 'No se pudo actualizar la vista publica.')
      }
    }

    refreshPublishedSnapshot()

    if (!isReadOnly) {
      return () => {
        cancelled = true
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshPublishedSnapshot()
    }

    intervalId = window.setInterval(refreshPublishedSnapshot, GITHUB_SYNC_POLL_INTERVAL_MS)
    window.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
      window.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [currentSnapshotJson, importSnapshot, isReadOnly])

  useEffect(() => {
    if (!GITHUB_SYNC_ENABLED || !isAdmin || !githubToken) {
      setGithubSyncReady(false)
      if (!githubToken) setGithubSyncStatus('idle')
      return undefined
    }

    let cancelled = false

    setGithubSyncStatus('connecting')
    fetchPublishedSnapshot({ includeSha: true, token: githubToken })
      .then((remote) => {
        if (cancelled || !remote) return
        publishedShaRef.current = remote.sha
        lastPublishedJsonRef.current = remote.json
        setGithubSyncReady(true)
        setGithubSyncStatus('ready')
        setGithubSyncError('')
      })
      .catch((error) => {
        if (cancelled) return
        setGithubSyncReady(false)
        setGithubSyncStatus('error')
        setGithubSyncError(error.message || 'No se pudo conectar la sincronizacion publica.')
      })

    return () => {
      cancelled = true
    }
  }, [githubToken, isAdmin])

  useEffect(() => {
    if (!GITHUB_SYNC_ENABLED || !isAdmin || !githubToken || !githubSyncReady) return undefined
    if (currentSnapshotJson === lastPublishedJsonRef.current) return undefined

    setGithubSyncStatus('publishing')
    setGithubSyncError('')

    const timerId = window.setTimeout(() => {
      publishPublishedSnapshot(currentSnapshot, githubToken, publishedShaRef.current)
        .then((result) => {
          publishedShaRef.current = result?.sha || publishedShaRef.current
          lastPublishedJsonRef.current = currentSnapshotJson
          setGithubSyncStatus('synced')
        })
        .catch((error) => {
          setGithubSyncStatus('error')
          setGithubSyncError(error.message || 'No se pudo publicar la vista publica.')
        })
    }, 1500)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [currentSnapshot, currentSnapshotJson, githubSyncReady, githubToken, isAdmin])

  useEffect(() => {
    if (isReadOnly && !PUBLIC_VIEWS.includes(view)) setView('dashboard')
  }, [isReadOnly, view])

  const syncIndicator = useMemo(() => {
    if (!GITHUB_SYNC_ENABLED || !isAdmin) return null

    const byStatus = {
      idle: { tone: 'gray', label: 'Sin sync', detail: 'Carga un token en Exportar / Importar.' },
      connecting: { tone: 'navy', label: 'Conectando', detail: 'Validando acceso al repo compartido.' },
      ready: { tone: 'navy', label: 'Listo', detail: 'Esperando el siguiente cambio para publicar.' },
      publishing: { tone: 'amber', label: 'Publicando', detail: 'Actualizando la vista de visitantes.' },
      synced: { tone: 'green', label: 'Sincronizado', detail: 'La vista publica ya refleja tus cambios.' },
      error: { tone: 'red', label: 'Error sync', detail: githubSyncError || 'Revisa el token o el acceso al repo.' },
    }

    return byStatus[githubSyncStatus] || byStatus.idle
  }, [githubSyncError, githubSyncStatus, isAdmin])

  return (
    <div className="app">
      <Sidebar
        view={view}
        setView={setSafeView}
        readOnly={isReadOnly}
        isAdmin={isAdmin}
        authError={authError}
        onAdminLogin={handleAdminLogin}
        onAdminLogout={handleAdminLogout}
      />
      <div className="main">
        <header className="topbar">
          <div>
            <h2>{TITLES[view]}</h2>
            <div className="meta">
              {MONTH_LABEL[activeMonth]} {activeYear} · {activeComputed.kpis.approvedCount} en rotacion · {activeComputed.office93Assigned.length} en Oficina 93 · {activeComputed.kpis.criticalAlerts} alertas criticas
            </div>
          </div>
          <div className="topbar-actions">
            {syncIndicator && (
              <div className="topbar-sync" title={syncIndicator.detail}>
                <span className={`badge ${syncIndicator.tone}`}>{syncIndicator.label}</span>
                <span className="topbar-sync-copy">{syncIndicator.detail}</span>
              </div>
            )}
            {showPeriodControls && !activeReadOnly && (
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
            {!activeReadOnly && <button className="btn btn-ghost" onClick={clearOverrides}>Limpiar ajustes</button>}
            {!activeReadOnly && <button className="btn btn-green" onClick={regenerate}>Generar programacion</button>}
          </div>
        </header>
        <main className="content">
          {view === 'dashboard' && (
            <Dashboard
              kpis={activeComputed.kpis}
              summary={activeComputed.summary}
              alerts={activeComputed.allAlerts}
              month={activeMonth}
              year={activeYear}
              params={activeComputed.effectiveParams}
              employees={activeComputed.effectiveEmployees}
              schedule={activeComputed.schedule}
              parkingAssigned={activeComputed.parkingAssigned}
              hideAlerts={activeReadOnly}
            />
          )}
          {view === 'monthly' && (
            <MonthlySchedule
              schedule={activeComputed.schedule}
              employees={activeComputed.effectiveEmployees}
              onSaveOverride={saveOverride}
              onDeleteOverride={deleteOverride}
              manualOverrides={manualOverrides}
              onSaveWeek={saveWeek}
              onClearWeek={clearWeek}
              savedWeeks={savedWeeks}
              readOnly={activeReadOnly}
              hideAlerts={activeReadOnly}
            />
          )}
          {view === 'daily' && (
            <DailyView
              schedule={activeComputed.schedule}
              employees={activeComputed.effectiveEmployees}
              summary={activeComputed.summary}
              floatingResult={activeComputed.floatingResult}
              parkingUsage={activeComputed.parkingUsage}
              params={activeComputed.effectiveParams}
              hideAlerts={activeReadOnly}
            />
          )}
          {view === 'desks' && (
            <FloatingSeats
              schedule={activeComputed.schedule}
              employees={activeComputed.effectiveEmployees}
              floatingResult={activeComputed.floatingResult}
              month={activeMonth}
              year={activeYear}
              readOnly={activeReadOnly}
              manualDeskAssignments={manualDeskAssignments}
              setManualDeskAssignments={setManualDeskAssignmentsForPeriod}
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
          {view === 'lockers' && (
            <Lockers
              employees={activeComputed.effectiveEmployees}
              lockerResult={activeComputed.lockerResult}
              manualLockers={manualLockers}
              setManualLockers={setManualLockersForPeriod}
              params={params}
              month={activeMonth}
              year={activeYear}
              readOnly={activeReadOnly}
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
              githubSyncEnabled={GITHUB_SYNC_ENABLED}
              githubSyncRepoLabel={GITHUB_SYNC_REPO_LABEL}
              hasGithubToken={Boolean(githubToken)}
              githubSyncStatus={githubSyncStatus}
              githubSyncError={githubSyncError}
              onSaveGithubToken={saveGithubToken}
              onClearGithubToken={clearGithubToken}
              onCopyShareLink={copyShareLink}
              onImport={importSnapshot}
              onRestoreBackup={restoreBackup}
            />
          )}
        </main>
      </div>
    </div>
  )
}
