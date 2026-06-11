import { isOddCalendarDay, weekdayKey } from './dateUtils.js'

export function isRotationEligible(employee) {
  return Boolean(employee?.isActive && employee?.hybridApproved && employee?.baseLocation !== 'REMOTO')
}

export function isFloatingSeatEligible(employee) {
  return Boolean(employee?.isFloating && employee?.isActive && employee?.baseLocation !== 'REMOTO')
}

export function buildFloatingSeatEmployees(employees, preferredIds = []) {
  const eligibleById = new Map(
    employees.filter(isFloatingSeatEligible).map((employee) => [employee.id, employee])
  )
  const preferredIdSet = new Set(preferredIds)
  const ordered = Array.from(preferredIdSet).map((id) => eligibleById.get(id)).filter(Boolean)
  const remaining = Array.from(eligibleById.values()).filter((employee) => !preferredIdSet.has(employee.id))
  return [...ordered, ...remaining]
}

export function weeklyHomeTarget(employee) {
  return isRotationEligible(employee) ? (employee.doubleHomeConsecutive ? 2 : 1) : 0
}

export function restrictionTypeFor(employee) {
  return employee?.restrictionEnabled === false ? 'NONE' : (employee?.restrictionType || 'NONE')
}

export function hasHardRestriction(employee) {
  return ['FIXED_DAY', 'EVEN_DAYS', 'ODD_DAYS', 'ALLOWED_DAYS', 'NOT_ALLOWED_DAYS']
    .includes(restrictionTypeFor(employee))
}

export function isDateAllowedForEmployee(employee, iso) {
  const weekday = weekdayKey(iso)
  switch (restrictionTypeFor(employee)) {
    case 'FIXED_DAY': return weekday === employee.fixedDay
    case 'EVEN_DAYS': return !isOddCalendarDay(iso)
    case 'ODD_DAYS': return isOddCalendarDay(iso)
    case 'ALLOWED_DAYS': return (employee.allowedDays || []).includes(weekday)
    case 'NOT_ALLOWED_DAYS': return !(employee.notAllowedDays || []).includes(weekday)
    default: return true
  }
}

export function getAllowedDatesForEmployee(employee, dates) {
  return dates.filter((iso) => isDateAllowedForEmployee(employee, iso))
}
