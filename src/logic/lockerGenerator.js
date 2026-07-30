const byName = (a, b) => a.name.localeCompare(b.name, 'es')

export const DEFAULT_LOCKER_CODES = [
  '001', '002', '003', '004', '005', '006', '007', '008', '009',
  '010', '011', '012', '013', '014', '015', '016', '017', '018',
  '100', '101', '102', '103', '104', '105', '106', '107', '108',
  '109', '110', '111', '112', '113', '114', '115', '116', '117',
]

export function buildLockerCodes(lockerCount) {
  const totalLockers = Math.max(0, Number(lockerCount) || 0)
  if (totalLockers <= DEFAULT_LOCKER_CODES.length) return DEFAULT_LOCKER_CODES.slice(0, totalLockers)

  const extraCodes = Array.from({ length: totalLockers - DEFAULT_LOCKER_CODES.length }, (_, index) => String(118 + index).padStart(3, '0'))
  return [...DEFAULT_LOCKER_CODES, ...extraCodes]
}

function normalizeLockerCode(value, lockerCodes) {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  if (lockerCodes.includes(raw)) return raw

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  const rounded = Math.trunc(parsed)
  if (rounded < 1 || rounded > lockerCodes.length) return null
  return lockerCodes[rounded - 1] || null
}

export function assignLockersForMonth({ employees, lockerCount, manualAssignments = [] }) {
  const lockerCodes = buildLockerCodes(lockerCount)
  const eligibleEmployees = employees
    .filter((employee) => employee.isActive && employee.baseLocation === 'WEWORK')
    .sort(byName)
  const eligibleById = new Map(eligibleEmployees.map((employee) => [employee.id, employee]))
  const floaters = eligibleEmployees.filter((employee) => employee.isFloating).sort(byName)
  const regulars = eligibleEmployees.filter((employee) => !employee.isFloating).sort(byName)

  const lockerMap = new Map(lockerCodes.map((lockerCode) => [lockerCode, []]))
  const assignmentByEmployee = {}
  const ignoredManualAssignments = []
  const manualByEmployee = new Map()

  for (const assignment of manualAssignments) {
    const employee = eligibleById.get(assignment.employeeId)
    const lockerNumber = normalizeLockerCode(assignment.lockerNumber, lockerCodes)
    if (!employee || !lockerNumber || manualByEmployee.has(employee.id)) {
      ignoredManualAssignments.push(assignment)
      continue
    }
    manualByEmployee.set(employee.id, { ...assignment, lockerNumber })
  }

  const lockerEntries = () => Array.from(lockerMap.entries())
  const lockersWithSpace = () => lockerEntries().filter(([, occupants]) => occupants.length < 2)
  const emptyLocker = () => lockerEntries().find(([, occupants]) => occupants.length === 0)
  const sharedLockerWithoutFloaters = () => lockersWithSpace()
    .filter(([, occupants]) => occupants.length === 1)
    .filter(([, occupants]) => {
      const occupant = eligibleById.get(occupants[0].employeeId)
      return occupant && !occupant.isFloating
    })
    .sort((left, right) => left[0].localeCompare(right[0], 'es'))[0]
  const fallbackSharedLocker = () => lockersWithSpace()
    .sort((left, right) => left[1].length - right[1].length || left[0].localeCompare(right[0], 'es'))[0]

  const assignEmployeeToLocker = (employee, target, manual = false) => {
    if (!target) {
      assignmentByEmployee[employee.id] = { employeeId: employee.id, lockerNumber: null, manual, unassigned: true }
      return false
    }

    const [lockerNumber, occupants] = target
    const record = { employeeId: employee.id, lockerNumber, manual, shared: occupants.length === 1 }
    occupants.push(record)
    assignmentByEmployee[employee.id] = record
    return true
  }

  for (const employee of floaters) {
    const manualAssignment = manualByEmployee.get(employee.id)
    if (manualAssignment) {
      const occupants = lockerMap.get(manualAssignment.lockerNumber)
      if (occupants && occupants.length === 0) {
        assignEmployeeToLocker(employee, [manualAssignment.lockerNumber, occupants], true)
        continue
      }
      ignoredManualAssignments.push(manualAssignment)
    }
    assignEmployeeToLocker(employee, emptyLocker(), false)
  }

  for (const employee of regulars) {
    const manualAssignment = manualByEmployee.get(employee.id)
    if (!manualAssignment) continue

    const occupants = lockerMap.get(manualAssignment.lockerNumber)
    const hasFloaterOccupant = occupants?.some((occupant) => eligibleById.get(occupant.employeeId)?.isFloating)
    if (occupants && occupants.length < 2 && !hasFloaterOccupant) {
      assignEmployeeToLocker(employee, [manualAssignment.lockerNumber, occupants], true)
      continue
    }
    ignoredManualAssignments.push(manualAssignment)
  }

  for (const employee of regulars.filter((employee) => !assignmentByEmployee[employee.id])) {
    assignEmployeeToLocker(employee, sharedLockerWithoutFloaters() || emptyLocker() || fallbackSharedLocker(), false)
  }

  const lockers = Array.from(lockerMap.entries()).map(([lockerNumber, occupants]) => ({
    lockerNumber,
    occupants: occupants.map((occupant) => ({ ...occupant, shared: occupants.length > 1 })),
    shared: occupants.length > 1,
  }))

  return {
    eligibleEmployees,
    lockerCodes,
    assignmentByEmployee,
    lockers,
    ignoredManualAssignments,
    individualFloaterLockerCount: lockers.filter((locker) => locker.occupants.length === 1 && eligibleById.get(locker.occupants[0].employeeId)?.isFloating).length,
    sharedLockerCount: lockers.filter((locker) => locker.shared).length,
    unassignedCount: Object.values(assignmentByEmployee).filter((assignment) => assignment.unassigned).length,
  }
}
