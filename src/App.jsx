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

import { enforceNoOfficeOvercapacity, generateMonthlySchedule } from './logic/scheduleGenerator.js'
import { assignParkingForMonth, parkingUsageByDay, assignFloatingSeats, applyManualOverrides } from './logic/parkingGenerator.js'
import { assignOffice93ForMonth, applyMonthlyFloatingAssignment, applyOffice93Assignment } from './logic/locationRotation.js'
import { assignLockersForMonth } from './logic/lockerGenerator.js'
import { buildDailySummary, validateSchedule, buildDashboardKPIs } from './logic/validators.js'
import { MONTH_LABEL, isHoliday, isOddCalendarDay, isWeekend } from './logic/dateUtils.js'
import {
  LIVE_SYNC_DRAFT_KEY,
  LIVE_SYNC_ENABLED,
  LIVE_SYNC_PUBLISHED_KEY,
  fetchSnapshotHistory,
  fetchSnapshotRecord,
  insertSnapshotHistory,
  saveSnapshotRecord,
  subscribeToSnapshot,
} from './logic/liveSnapshot.js'

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
const EMPTY_OBJECT = {}
const MIN_YEAR = 2026
const MIN_MONTH = 5
const PUBLIC_READ_ONLY = import.meta.env.VITE_PUBLIC_READ_ONLY === 'true'
const PUBLIC_PUBLISHED_JUNE_LOCK = import.meta.env.VITE_PUBLIC_PUBLISHED_JUNE === 'true'
const PREVIEW_SNAPSHOT_URL = import.meta.env.VITE_PREVIEW_SNAPSHOT_URL || ''
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
const ADMIN_SESSION_KEY = 'hibrido-app-admin-session'
const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || ''
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || ''
const ADMIN_ACCESS_ENABLED = Boolean(ADMIN_USERNAME && ADMIN_PASSWORD)
const INITIAL_EMPLOYEES_BY_ID = Object.fromEntries(initialEmployees.map((employee) => [employee.id, employee]))
const LIVE_SYNC_DEBOUNCE_MS = 1200
const LIVE_SYNC_HISTORY_LIMIT = 10

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

function isRotationEligible(employee) {
  return Boolean(employee?.isActive && employee?.hybridApproved && employee?.baseLocation !== 'REMOTO')
}

function buildPreservedOverrides({ schedule, employees, existingOverrides, excludedEmployeeIds }) {
  if (!schedule?.days?.length) return existingOverrides

  const excluded = new Set(excludedEmployeeIds)
  const existingKeys = new Set(existingOverrides.map((override) => `${override.employeeId}__${override.date}`))
  const preserved = [...existingOverrides]
  const createdAt = new Date().toISOString()

  employees.forEach((employee) => {
    if (excluded.has(employee.id)) return

    schedule.days.forEach((iso) => {
      const cell = schedule.cells[`${employee.id}__${iso}`]
      if (!cell || !['HOME', 'OFFICE'].includes(cell.status)) return

      const key = `${employee.id}__${iso}`
      if (existingKeys.has(key)) return

      preserved.push({
        id: `${employee.id}-${iso}`,
        employeeId: employee.id,
        date: iso,
        status: cell.status,
        reason: 'Programacion preservada al habilitar nuevas personas',
        createdAt,
      })
      existingKeys.add(key)
    })
  })

  return preserved
}

function applyEmployeeSeatOverrides(employeeList, seatOverrides = EMPTY_OBJECT) {
  return employeeList.map((employee) => {
    if (!Object.prototype.hasOwnProperty.call(seatOverrides, employee.id)) return employee
    return { ...employee, baseSeat: seatOverrides[employee.id] }
  })
}

function nextPeriodMapWithEmployeeRemoved(map, employeeId) {
  return Object.fromEntries(
    Object.entries(map).map(([key, entries]) => {
      const nextEntries = { ...entries }
      delete nextEntries[employeeId]
      return [key, nextEntries]
    })
  )
}

function makeEmployeeId(name) {
  return `${(name || 'persona').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`
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
  try {
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
    window.localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify([nextEntry, ...withoutDuplicate].slice(0, 3)))
  } catch (error) {
    try {
      window.localStorage.removeItem(BACKUP_HISTORY_KEY)
    } catch (cleanupError) {
      // The backup is optional; never let storage cleanup break editing.
    }
  }
}

function latestBackup() {
  const history = parseJSON(window.localStorage.getItem(BACKUP_HISTORY_KEY)) || []
  if (history[0]?.data) return history[0].data
  return parseJSON(window.localStorage.getItem(BACKUP_KEY))
}

function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = parseJSON(raw) || {}
    if (!Array.isArray(parsed.employees)) return parsed

    return {
      ...parsed,
      employees: mergeEmployeeSeatDefaults(parsed.employees),
    }
  } catch (error) {
    return {}
  }
}

function loadAdminSession() {
  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'
  } catch (error) {
    return false
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
  const [isAdmin, setIsAdmin] = useState(() => ADMIN_ACCESS_ENABLED && loadAdminSession())
  const [authError, setAuthError] = useState('')
  const isReadOnly = PUBLIC_READ_ONLY && !isAdmin
  const editableStored = isReadOnly ? {} : stored
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
  const monthOptions = isReadOnly
    ? [MIN_MONTH, MIN_MONTH + 1]
    : MONTH_LABEL.map((_, index) => index).filter((index) => year !== MIN_YEAR || index >= MIN_MONTH)
  const showMonthControl = showPeriodControls
  const [manualParking, setManualParking] = useState(editableStored.manualParking || [])
  const [manualOffice93ByPeriod, setManualOffice93ByPeriod] = useState(editableStored.manualOffice93ByPeriod || {})
  const [manualLockersByPeriod, setManualLockersByPeriod] = useState(editableStored.manualLockersByPeriod || {})
  const [manualDeskAssignmentsByPeriod, setManualDeskAssignmentsByPeriod] = useState(editableStored.manualDeskAssignmentsByPeriod || {})
  const [employeeSeatOverridesByPeriod, setEmployeeSeatOverridesByPeriod] = useState(editableStored.employeeSeatOverridesByPeriod || {})
  const [savedWeeksByPeriod, setSavedWeeksByPeriod] = useState(editableStored.savedWeeksByPeriod || {})
  const [didHydrateStoredState, setDidHydrateStoredState] = useState(false)
  const [didHydratePreviewSnapshot, setDidHydratePreviewSnapshot] = useState(false)
  const [liveSyncReady, setLiveSyncReady] = useState(() => !LIVE_SYNC_ENABLED)
  const [liveSyncStatus, setLiveSyncStatus] = useState(() => LIVE_SYNC_ENABLED ? 'idle' : 'disabled')
  const [liveSyncError, setLiveSyncError] = useState('')
  const [liveSyncDraftSavedAt, setLiveSyncDraftSavedAt] = useState('')
  const [liveSyncPublishedAt, setLiveSyncPublishedAt] = useState('')
  const [liveSyncHistory, setLiveSyncHistory] = useState([])
  const [liveSyncHistoryLoading, setLiveSyncHistoryLoading] = useState(false)
  const [liveSyncHistoryError, setLiveSyncHistoryError] = useState('')
  const [generationTick, setGenerationTick] = useState(0)
  const currentSnapshotJsonRef = useRef('')
  const lastDraftSnapshotJsonRef = useRef('')
  const pendingRemoteSnapshotJsonRef = useRef('')
  const publishBeforeLogoutRef = useRef(null)
  const periodKey = periodKeyFor(year, month)
  const hasManualOffice93 = Object.prototype.hasOwnProperty.call(manualOffice93ByPeriod, periodKey)
  const manualOffice93 = hasManualOffice93 ? manualOffice93ByPeriod[periodKey] : EMPTY_ARRAY
  const manualLockers = manualLockersByPeriod[periodKey] || EMPTY_ARRAY
  const manualDeskAssignments = manualDeskAssignmentsByPeriod[periodKey] || EMPTY_ARRAY
  const employeeSeatOverrides = employeeSeatOverridesByPeriod[periodKey] || EMPTY_OBJECT
  const employeesForPeriod = useMemo(
    () => applyEmployeeSeatOverrides(employees, employeeSeatOverrides),
    [employees, employeeSeatOverrides]
  )
  const periodLabel = `${MONTH_LABEL[month]} ${year}`
  const savedWeeks = savedWeeksByPeriod[periodKey] || EMPTY_ARRAY

  const setSafeView = useCallback((nextView) => {
    setView(isReadOnly && !PUBLIC_VIEWS.includes(nextView) ? 'dashboard' : nextView)
  }, [isReadOnly])

  const handleAdminLogin = useCallback((username, password) => {
    if (!ADMIN_ACCESS_ENABLED) {
      setAuthError('Este build no tiene acceso admin configurado.')
      return false
    }

    const normalizedUsername = username.trim().toLowerCase()
    const normalizedPassword = password.trim()
    if (normalizedUsername !== ADMIN_USERNAME.trim().toLowerCase() || normalizedPassword !== ADMIN_PASSWORD.trim()) {
      setAuthError('Credenciales admin invalidas.')
      return false
    }

    window.sessionStorage.setItem(ADMIN_SESSION_KEY, 'true')
    setIsAdmin(true)
    setAuthError('')
    return true
  }, [])

  const handleAdminLogout = useCallback(async () => {
    const published = await publishBeforeLogoutRef.current?.()
    if (published === false) return
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

  useEffect(() => {
    if (ADMIN_ACCESS_ENABLED) return
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY)
    if (isAdmin) setIsAdmin(false)
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

  const computed = useMemo(() => {
    const isPublishedJune = PUBLIC_PUBLISHED_JUNE_LOCK && isReadOnly && year === MIN_YEAR && month === MIN_MONTH
    const publicJuneOffice93 = isPublishedJune
      ? PUBLIC_JUNE_OFFICE93_IDS
      : null
    const effectiveParams = isPublishedJune
      ? { ...params, ...PUBLIC_JUNE_PARAMS_OVERRIDE }
      : params
    const office93AssignedAuto = assignOffice93ForMonth({ employees: employeesForPeriod, params, monthIndex: month, manualOffice93 })
    const office93Assigned = publicJuneOffice93 || (hasManualOffice93 ? Array.from(new Set(manualOffice93)) : office93AssignedAuto)
    const office93Employees = applyOffice93Assignment(employeesForPeriod, office93Assigned)
    const effectiveEmployees = applyMonthlyFloatingAssignment(office93Employees, { year, month, office93Assigned })
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
    const balancedBase = enforceNoOfficeOvercapacity(
      base,
      effectiveEmployees,
      holidays,
      effectiveParams,
      `${year}-${month}-base`
    )
    const scheduleWithManualOverrides = applyManualOverrides(
      balancedBase,
      effectiveManualOverrides,
      effectiveEmployees,
      effectiveParams
    )
    const schedule = enforceNoOfficeOvercapacity(
      scheduleWithManualOverrides,
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
    const effectiveManualLockers = isPublishedJune && isReadOnly
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
    const validationAlerts = validateSchedule(effectiveSchedule, effectiveEmployeesView, year, month, holidays, effectiveParams)

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
  }, [employeesForPeriod, holidays, absences, manualOverrides, month, year, params, manualParking, manualOffice93, hasManualOffice93, generationTick, isReadOnly, manualDeskAssignments, manualLockers])

  const updateEmployees = useCallback((updater) => {
    const nextEmployees = typeof updater === 'function' ? updater(employees) : updater
    const previousEmployeesById = Object.fromEntries(employees.map((employee) => [employee.id, employee]))
    const newlyEligibleIds = nextEmployees
      .filter((employee) => isRotationEligible(employee) && !isRotationEligible(previousEmployeesById[employee.id]))
      .map((employee) => employee.id)

    if (newlyEligibleIds.length > 0) {
      setManualOverrides((prev) => buildPreservedOverrides({
        schedule: computed.schedule,
        employees,
        existingOverrides: prev,
        excludedEmployeeIds: newlyEligibleIds,
      }))
    }

    setEmployees(nextEmployees)
  }, [computed.schedule, employees])

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

  const saveEmployeeForPeriod = useCallback((emp) => {
    const nextSeat = String(emp.baseSeat || '').trim()

    if (!emp.id) {
      const id = makeEmployeeId(emp.name)
      setEmployees((prev) => [...prev, { ...emp, id, baseSeat: nextSeat, nameOverride: true }])
      return
    }

    const original = employees.find((employee) => employee.id === emp.id)
    const baseSeat = original?.baseSeat || ''

    setEmployees((prev) => prev.map((employee) => {
      if (employee.id !== emp.id) return employee
      return {
        ...emp,
        baseSeat,
        nameOverride: emp.name !== employee.name ? true : employee.nameOverride,
      }
    }))

    setEmployeeSeatOverridesByPeriod((prev) => ({
      ...prev,
      [periodKey]: {
        ...(prev[periodKey] || {}),
        [emp.id]: nextSeat,
      },
    }))
  }, [employees, periodKey])

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
    setEmployeeSeatOverridesByPeriod((prev) => nextPeriodMapWithEmployeeRemoved(prev, employeeId))
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
    version: 3,
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
    employeeSeatOverridesByPeriod,
    savedWeeksByPeriod,
  }), [employees, holidays, absences, manualOverrides, params, month, year, manualParking, manualOffice93ByPeriod, manualLockersByPeriod, manualDeskAssignmentsByPeriod, employeeSeatOverridesByPeriod, savedWeeksByPeriod])
  const currentSnapshotJson = useMemo(() => JSON.stringify(currentSnapshot), [currentSnapshot])
  const buildSnapshot = useCallback(() => currentSnapshot, [currentSnapshot])

  const importSnapshot = useCallback((snap, options = {}) => {
    const { resetView = true } = options
    if (snap.employees) setEmployees(mergeEmployeeSeatDefaults(snap.employees))
    if (snap.holidays) setHolidays(snap.holidays)
    if (snap.absences) setAbsences(snap.absences)
    if (snap.manualOverrides) setManualOverrides(snap.manualOverrides)
    if (snap.params) setParams({ ...defaultParameters, ...snap.params })
    const nextPeriod = normalizePeriod(
      typeof snap.year === 'number' ? snap.year : MIN_YEAR,
      typeof snap.month === 'number' ? snap.month : MIN_MONTH
    )
    setYear(nextPeriod.year)
    setMonth(nextPeriod.month)
    if (snap.manualParking) setManualParking(snap.manualParking)
    if (snap.manualOffice93ByPeriod) setManualOffice93ByPeriod(snap.manualOffice93ByPeriod)
    if (snap.manualLockersByPeriod) setManualLockersByPeriod(snap.manualLockersByPeriod)
    if (snap.manualDeskAssignmentsByPeriod) setManualDeskAssignmentsByPeriod(snap.manualDeskAssignmentsByPeriod)
    setEmployeeSeatOverridesByPeriod(snap.employeeSeatOverridesByPeriod || {})
    if (snap.savedWeeksByPeriod) setSavedWeeksByPeriod(snap.savedWeeksByPeriod)
    else if (snap.manualOffice93) {
      const importedKey = periodKeyFor(nextPeriod.year, nextPeriod.month)
      setManualOffice93ByPeriod({ [importedKey]: snap.manualOffice93 })
    }
    if (resetView) setView('dashboard')
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
    if (!PREVIEW_SNAPSHOT_URL || didHydratePreviewSnapshot) return
    let cancelled = false
    fetch(PREVIEW_SNAPSHOT_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`No se pudo cargar ${PREVIEW_SNAPSHOT_URL}`)
        return response.json()
      })
      .then((payload) => {
        if (cancelled) return
        importSnapshot(payload.snapshot || payload, { resetView: false })
        setDidHydratePreviewSnapshot(true)
        setDidHydrateStoredState(true)
        setLiveSyncStatus('preview')
      })
      .catch((error) => {
        if (cancelled) return
        setDidHydratePreviewSnapshot(true)
        setLiveSyncStatus('error')
        setLiveSyncError(error.message || 'No se pudo cargar la copia local de trabajo.')
      })
    return () => {
      cancelled = true
    }
  }, [didHydratePreviewSnapshot, importSnapshot])
  const refreshLiveSyncHistory = useCallback(async () => {
    if (!LIVE_SYNC_ENABLED || !isAdmin) {
      setLiveSyncHistory([])
      setLiveSyncHistoryError('')
      setLiveSyncHistoryLoading(false)
      return []
    }

    setLiveSyncHistoryLoading(true)
    setLiveSyncHistoryError('')
    try {
      const entries = await fetchSnapshotHistory(LIVE_SYNC_HISTORY_LIMIT, LIVE_SYNC_PUBLISHED_KEY)
      setLiveSyncHistory(entries)
      if (entries[0]?.created_at) setLiveSyncPublishedAt(entries[0].created_at)
      return entries
    } catch (error) {
      setLiveSyncHistoryError(error.message || 'No se pudo cargar el historial de publicaciones.')
      return []
    } finally {
      setLiveSyncHistoryLoading(false)
    }
  }, [isAdmin])

  const handlePublishSnapshot = useCallback(async () => {
    if (!LIVE_SYNC_ENABLED || !isAdmin) return true

    try {
      setLiveSyncStatus('publishing')
      setLiveSyncError('')

      const [draftResult, publishedResult] = await Promise.all([
        saveSnapshotRecord(LIVE_SYNC_DRAFT_KEY, currentSnapshot),
        saveSnapshotRecord(LIVE_SYNC_PUBLISHED_KEY, currentSnapshot),
      ])

      await insertSnapshotHistory(currentSnapshot, LIVE_SYNC_PUBLISHED_KEY)

      lastDraftSnapshotJsonRef.current = currentSnapshotJson
      setLiveSyncDraftSavedAt(draftResult?.updatedAt || new Date().toISOString())
      setLiveSyncPublishedAt(publishedResult?.updatedAt || new Date().toISOString())
      setLiveSyncStatus('published')
      await refreshLiveSyncHistory()
      return true
    } catch (error) {
      setLiveSyncStatus('error')
      setLiveSyncError(error.message || 'No se pudo publicar el borrador actual.')
      return false
    }
  }, [currentSnapshot, currentSnapshotJson, isAdmin, refreshLiveSyncHistory])

  useEffect(() => {
    publishBeforeLogoutRef.current = handlePublishSnapshot
  }, [handlePublishSnapshot])

  const handleRestoreHistoryEntry = useCallback(async (entry) => {
    if (!LIVE_SYNC_ENABLED || !isAdmin || !entry?.snapshot) return

    const publishedAt = entry.created_at ? new Date(entry.created_at).toLocaleString('es-CO') : 'esa version'
    const ok = window.confirm(`Cargar al borrador la publicacion del ${publishedAt}? El publico no cambiara hasta que vuelvas a publicar.`)
    if (!ok) return

    try {
      setLiveSyncStatus('saving-draft')
      setLiveSyncError('')

      const nextJson = JSON.stringify(entry.snapshot)
      const draftResult = await saveSnapshotRecord(LIVE_SYNC_DRAFT_KEY, entry.snapshot)

      lastDraftSnapshotJsonRef.current = nextJson
      setLiveSyncDraftSavedAt(draftResult?.updatedAt || new Date().toISOString())
      importSnapshot(entry.snapshot)
      setLiveSyncStatus('draft-saved')
    } catch (error) {
      setLiveSyncStatus('error')
      setLiveSyncError(error.message || 'No se pudo cargar la version seleccionada al borrador.')
    }
  }, [importSnapshot, isAdmin])

  useEffect(() => {
    if (LIVE_SYNC_ENABLED || !PUBLIC_READ_ONLY || !isAdmin || didHydrateStoredState) return
    if (!stored.employees?.length) {
      setDidHydrateStoredState(true)
      return
    }
    importSnapshot(stored)
    setDidHydrateStoredState(true)
  }, [didHydrateStoredState, importSnapshot, isAdmin, stored])

  useEffect(() => {
    currentSnapshotJsonRef.current = currentSnapshotJson
  }, [currentSnapshotJson])

  useEffect(() => {
    if (!LIVE_SYNC_ENABLED) return undefined
    if (!isReadOnly && !isAdmin) {
      setLiveSyncReady(false)
      setLiveSyncStatus('idle')
      setLiveSyncError('')
      return undefined
    }

    let cancelled = false
    const activeKey = isAdmin ? LIVE_SYNC_DRAFT_KEY : LIVE_SYNC_PUBLISHED_KEY
    const readyStatus = isAdmin ? 'draft-saved' : 'ready'

    const acceptRemoteSnapshot = (snapshot, options = {}) => {
      const nextJson = JSON.stringify(snapshot)
      if (activeKey === LIVE_SYNC_DRAFT_KEY) lastDraftSnapshotJsonRef.current = nextJson
      if (options.updatedAt) {
        if (activeKey === LIVE_SYNC_DRAFT_KEY) setLiveSyncDraftSavedAt(options.updatedAt)
        else setLiveSyncPublishedAt(options.updatedAt)
      }
      if (currentSnapshotJsonRef.current === nextJson) {
        pendingRemoteSnapshotJsonRef.current = ''
        setLiveSyncReady(true)
        setLiveSyncStatus(readyStatus)
        setLiveSyncError('')
        return
      }

      pendingRemoteSnapshotJsonRef.current = nextJson
      importSnapshot(snapshot, { resetView: false })
    }

    setLiveSyncReady(false)
    setLiveSyncStatus('connecting')
    setLiveSyncError('')

    Promise.all([
      isAdmin ? fetchSnapshotRecord(LIVE_SYNC_DRAFT_KEY) : Promise.resolve(null),
      fetchSnapshotRecord(LIVE_SYNC_PUBLISHED_KEY),
    ])
      .then(async ([draftRow, publishedRow]) => {
        if (cancelled) return

        if (publishedRow?.updatedAt) setLiveSyncPublishedAt(publishedRow.updatedAt)

        if (isAdmin) {
          if (draftRow?.snapshot) {
            acceptRemoteSnapshot(draftRow.snapshot, { updatedAt: draftRow.updatedAt })
          } else if (publishedRow?.snapshot) {
            acceptRemoteSnapshot(publishedRow.snapshot, { updatedAt: publishedRow.updatedAt })
            const seededDraft = await saveSnapshotRecord(LIVE_SYNC_DRAFT_KEY, publishedRow.snapshot)
            if (cancelled) return
            lastDraftSnapshotJsonRef.current = JSON.stringify(publishedRow.snapshot)
            setLiveSyncDraftSavedAt(seededDraft?.updatedAt || publishedRow.updatedAt || '')
            setLiveSyncStatus('draft-saved')
          } else {
            setLiveSyncReady(true)
            setLiveSyncStatus('ready')
          }
          await refreshLiveSyncHistory()
          return
        }

        if (publishedRow?.snapshot) {
          acceptRemoteSnapshot(publishedRow.snapshot, { updatedAt: publishedRow.updatedAt })
          return
        }

        setLiveSyncReady(true)
        setLiveSyncStatus('ready')
      })
      .catch((error) => {
        if (cancelled) return
        setLiveSyncReady(true)
        setLiveSyncStatus('error')
        setLiveSyncError(error.message || 'No se pudo cargar la vista compartida.')
      })

    const unsubscribe = subscribeToSnapshot(
      activeKey,
      (snapshot) => {
        if (cancelled || !snapshot) return
        acceptRemoteSnapshot(snapshot)
      },
      (error) => {
        if (cancelled) return
        setLiveSyncStatus('error')
        setLiveSyncError(error.message || 'No se pudo conectar la sincronizacion en tiempo real.')
      }
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [importSnapshot, isAdmin, isReadOnly, refreshLiveSyncHistory])

  useEffect(() => {
    if (!LIVE_SYNC_ENABLED) return
    if (!pendingRemoteSnapshotJsonRef.current) return
    if (currentSnapshotJson !== pendingRemoteSnapshotJsonRef.current) return

    pendingRemoteSnapshotJsonRef.current = ''
    setLiveSyncReady(true)
    setLiveSyncStatus(isAdmin ? 'draft-saved' : 'ready')
    setLiveSyncError('')
  }, [currentSnapshotJson, isAdmin])

  useEffect(() => {
    if (isReadOnly) return
    const next = currentSnapshotJson

    try {
      const previous = window.localStorage.getItem(STORAGE_KEY)
      if (previous && previous !== next) rememberBackup(previous)
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch (error) {
      try {
        window.localStorage.removeItem(BACKUP_HISTORY_KEY)
        window.localStorage.removeItem(BACKUP_KEY)
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch (retryError) {
        setLiveSyncStatus('error')
        setLiveSyncError('No se pudo guardar en este navegador. Publica para conservar los cambios en Supabase.')
      }
    }
  }, [currentSnapshotJson, isReadOnly])

  useEffect(() => {
    if (!LIVE_SYNC_ENABLED || isReadOnly || !isAdmin || !liveSyncReady) return undefined
    if (currentSnapshotJson === lastDraftSnapshotJsonRef.current) return undefined

    setLiveSyncStatus('saving-draft')
    setLiveSyncError('')

    const timerId = window.setTimeout(() => {
      saveSnapshotRecord(LIVE_SYNC_DRAFT_KEY, currentSnapshot)
        .then(() => {
          lastDraftSnapshotJsonRef.current = currentSnapshotJson
          setLiveSyncDraftSavedAt(new Date().toISOString())
          setLiveSyncStatus('draft-saved')
        })
        .catch((error) => {
          setLiveSyncStatus('error')
          setLiveSyncError(error.message || 'No se pudo guardar el borrador compartido.')
        })
    }, LIVE_SYNC_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [currentSnapshot, currentSnapshotJson, isAdmin, isReadOnly, liveSyncReady])

  useEffect(() => {
    if (isReadOnly && !PUBLIC_VIEWS.includes(view)) setView('dashboard')
  }, [isReadOnly, view])

  return (
    <div className="app">
      <Sidebar
        view={view}
        setView={setSafeView}
        readOnly={isReadOnly}
        isAdmin={isAdmin}
        adminAccessEnabled={ADMIN_ACCESS_ENABLED}
        authError={authError}
        onAdminLogin={handleAdminLogin}
        onAdminLogout={handleAdminLogout}
      />
      <div className="main">
        <header className="topbar">
          <div>
            <h2>{TITLES[view]}</h2>
            <div className="meta">
              {MONTH_LABEL[month]} {year} · {computed.kpis.approvedCount} en rotacion · {computed.office93Assigned.length} en Oficina 93 · {computed.kpis.criticalAlerts} alertas criticas
            </div>
          </div>
          <div className="topbar-actions">
            {showMonthControl && (
              <div className="topbar-period">
                <div className="topbar-field">
                  <label>Mes</label>
                  <select value={month} onChange={(e) => handleMonthChange(Number(e.target.value))}>
                    {monthOptions.map((index) => (
                      <option key={MONTH_LABEL[index]} value={index}>{MONTH_LABEL[index]}</option>
                    ))}
                  </select>
                </div>
                {!isReadOnly && (
                  <div className="topbar-field topbar-field-year">
                    <label>Anio</label>
                    <input type="number" min={MIN_YEAR} value={year} onChange={(e) => handleYearChange(Number(e.target.value))} />
                  </div>
                )}
              </div>
            )}
            {!isReadOnly && <button className="btn btn-ghost" onClick={clearOverrides}>Limpiar ajustes</button>}
            {!isReadOnly && <button className="btn btn-green" onClick={regenerate}>Generar programacion</button>}
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
              hideAlerts={isReadOnly}
            />
          )}
          {view === 'monthly' && (
            <MonthlySchedule
              schedule={computed.schedule}
              employees={computed.effectiveEmployees}
              onSaveOverride={saveOverride}
              onDeleteOverride={deleteOverride}
              manualOverrides={manualOverrides}
              onSaveWeek={saveWeek}
              onClearWeek={clearWeek}
              savedWeeks={savedWeeks}
              readOnly={isReadOnly}
              hideAlerts={isReadOnly}
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
              hideAlerts={isReadOnly}
            />
          )}
          {view === 'desks' && (
            <FloatingSeats
              schedule={computed.schedule}
              employees={computed.effectiveEmployees}
              floatingResult={computed.floatingResult}
              month={month}
              year={year}
              readOnly={isReadOnly}
              manualDeskAssignments={manualDeskAssignments}
              setManualDeskAssignments={setManualDeskAssignmentsForPeriod}
            />
          )}
          {view === 'people' && <People employees={employeesForPeriod} setEmployees={updateEmployees} onSaveEmployee={saveEmployeeForPeriod} onDeleteEmployee={deleteEmployee} periodLabel={periodLabel} />}
          {view === 'restrictions' && <Restrictions employees={employees} setEmployees={updateEmployees} />}
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
              employees={computed.effectiveEmployees}
              lockerResult={computed.lockerResult}
              manualLockers={manualLockers}
              setManualLockers={setManualLockersForPeriod}
              params={params}
              month={month}
              year={year}
              readOnly={isReadOnly}
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
              liveSyncEnabled={LIVE_SYNC_ENABLED}
              liveSyncStatus={liveSyncStatus}
              liveSyncError={liveSyncError}
              liveSyncDraftSavedAt={liveSyncDraftSavedAt}
              liveSyncPublishedAt={liveSyncPublishedAt}
              liveSyncHistory={liveSyncHistory}
              liveSyncHistoryLoading={liveSyncHistoryLoading}
              liveSyncHistoryError={liveSyncHistoryError}
              onPublish={handlePublishSnapshot}
              onRestoreHistoryEntry={handleRestoreHistoryEntry}
              onImport={importSnapshot}
              onRestoreBackup={restoreBackup}
              isAdmin={isAdmin}
            />
          )}
        </main>
      </div>
    </div>
  )
}
