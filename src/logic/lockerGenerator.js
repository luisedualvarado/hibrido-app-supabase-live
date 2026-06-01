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

  const lockerMap = new Map(lockerCodes.map((lockerCode) => [lockerCode, []]))
  const assignmentByEmployee = {}
  const ignoredManualAssignments = []

  for (const assignment of manualAssignments) {
    const employee = eligibleEmployees.find((item) => item.id === assignment.employeeId)
    const lockerNumber = normalizeLockerCode(assignment.lockerNumber, lockerCodes)
    if (!employee || !lockerNumber) {
      ignoredManualAssignments.push(assignment)
      continue
    }

    const occupants = lockerMap.get(lockerNumber)
    if (!occupants || occupants.some((item) => item.employeeId === employee.id) || occupants.length >= 2) {
      ignoredManualAssignments.push(assignment)
      continue
    }

    const record = { employeeId: employee.id, lockerNumber, manual: true }
    occupants.push(record)
    assignmentByEmployee[employee.id] = record
  }

  const unassignedEmployees = eligibleEmployees.filter((employee) => !assignmentByEmployee[employee.id])
  const lockersWithSpace = () => Array.from(lockerMap.entries()).filter(([, occupants]) => occupants.length < 2)

  for (const employee of unassignedEmployees) {
    const emptyLocker = Array.from(lockerMap.entries()).find(([, occupants]) => occupants.length === 0)
    const sharedLocker = lockersWithSpace().sort((left, right) => left[1].length - right[1].length || left[0].localeCompare(right[0], 'es'))[0]
    const target = emptyLocker || sharedLocker

    if (!target) {
      assignmentByEmployee[employee.id] = { employeeId: employee.id, lockerNumber: null, manual: false, unassigned: true }
      continue
    }

    const [lockerNumber, occupants] = target
    const record = { employeeId: employee.id, lockerNumber, manual: false, shared: occupants.length === 1 }
    occupants.push(record)
    assignmentByEmployee[employee.id] = record
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
    sharedLockerCount: lockers.filter((locker) => locker.shared).length,
    unassignedCount: Object.values(assignmentByEmployee).filter((assignment) => assignment.unassigned).length,
  }
}