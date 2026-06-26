import test from 'node:test'
import assert from 'node:assert/strict'
import { generateMonthlySchedule, enforceNoOfficeOvercapacity, enforceRotationPolicy } from './scheduleGenerator.js'
import { assignOffice93ForMonth, applyOffice93Assignment } from './locationRotation.js'
import { applyManualOverrides, assignFloatingSeats } from './parkingGenerator.js'
import { getWorkdaysByWeek, weekdayKey } from './dateUtils.js'
import { buildFloatingSeatEmployees, weeklyHomeTarget } from './rotationPolicy.js'
import { buildDailySummary } from './validators.js'
import { initialEmployees } from '../data/initialEmployees.js'
import { initialAbsences, initialHolidays, defaultParameters } from '../data/initialHolidays.js'

const params = { seatsWeWork: 20, seats93: 10, parkingSpots: 3, lockers: 36 }

function employee(id, overrides = {}) {
  return {
    id,
    name: id,
    isActive: true,
    hybridApproved: true,
    baseLocation: 'WEWORK',
    restrictionType: 'NONE',
    restrictionEnabled: true,
    doubleHomeConsecutive: false,
    avoidConsecutiveHomeDays: false,
    ...overrides,
  }
}

function generate(employees, customParams = params) {
  return generateMonthlySchedule({
    employees,
    holidays: [],
    absences: [],
    manualOverrides: [],
    month: 5,
    year: 2026,
    params: customParams,
    generationSeed: 'test',
  })
}

function homeDays(schedule, employeeId, workdays) {
  return workdays.filter((date) => schedule.cells[`${employeeId}__${date}`]?.status === 'HOME')
}

test('only approved employees receive TC', () => {
  const approved = employee('approved')
  const notApproved = employee('not-approved', { hybridApproved: false })
  const schedule = generate([approved, notApproved])

  assert.ok(schedule.days.some((date) => schedule.cells[`approved__${date}`]?.status === 'HOME'))
  assert.equal(schedule.days.some((date) => schedule.cells[`not-approved__${date}`]?.status === 'HOME'), false)
})

test('active floaters without hybrid approval still receive an office seat', () => {
  const floater = employee('ana-gallo', { isFloating: true, hybridApproved: false })
  const schedule = generate([floater])
  const date = schedule.weeks[0].workdays[0]
  const { result } = assignFloatingSeats(schedule, [floater], [date], params)

  assert.equal(schedule.cells[`${floater.id}__${date}`].status, 'OFFICE')
  assert.equal(result[date].assignedByEmp[floater.id]?.location, 'WEWORK')
})

test('floating list includes Ana and German once even without hybrid approval', () => {
  const ana = employee('gallo-ana-maria', { isFloating: true, hybridApproved: true })
  const german = employee('cortes-german', { isFloating: true, hybridApproved: false })
  const list = buildFloatingSeatEmployees([ana, german], ['cortes-german', 'gallo-ana-maria', 'cortes-german'])

  assert.deepEqual(list.map((item) => item.id), ['cortes-german', 'gallo-ana-maria'])
})

test('hard restrictions are respected', () => {
  const fixed = employee('fixed', { restrictionType: 'FIXED_DAY', fixedDay: 'WEDNESDAY' })
  const schedule = generate([fixed])
  const assigned = schedule.days.filter((date) => schedule.cells[`fixed__${date}`]?.status === 'HOME')

  assert.ok(assigned.length > 0)
  assert.ok(assigned.every((date) => weekdayKey(date) === 'WEDNESDAY'))
})

test('weekly TC target is exactly one or two when valid days exist', () => {
  const one = employee('one')
  const two = employee('two', { doubleHomeConsecutive: true })
  const schedule = generate([one, two])

  for (const week of getWorkdaysByWeek(2026, 5, [])) {
    assert.equal(homeDays(schedule, one.id, week.workdays).length, 1)
    assert.equal(homeDays(schedule, two.id, week.workdays).length, 2)
  }
})

test('capacity balancing never sends a non-approved employee home', () => {
  const approved = employee('approved')
  const notApproved = employee('not-approved', { hybridApproved: false })
  const schedule = generate([approved, notApproved], { ...params, seatsWeWork: 1 })
  const balanced = enforceNoOfficeOvercapacity(schedule, [approved, notApproved], [], { ...params, seatsWeWork: 1 }, 'test')

  assert.equal(balanced.days.some((date) => balanced.cells[`not-approved__${date}`]?.status === 'HOME'), false)
  assert.ok(balanced.alerts.some((alert) => alert.rule === 'WEWORK_CAPACITY_UNRESOLVED'))
})

test('manual TC cannot break approval, restriction or weekly target', () => {
  const fixed = employee('fixed', { restrictionType: 'FIXED_DAY', fixedDay: 'WEDNESDAY' })
  const unrestricted = employee('unrestricted')
  const notApproved = employee('not-approved', { hybridApproved: false })
  const schedule = generate([fixed, unrestricted, notApproved])
  const week = schedule.weeks[0]
  const invalidFixedDay = week.workdays.find((date) => weekdayKey(date) !== 'WEDNESDAY')
  const approvedHome = homeDays(schedule, fixed.id, week.workdays)[0]
  const extraValidDay = week.workdays.find((date) => date !== approvedHome)
  const unrestrictedHome = homeDays(schedule, unrestricted.id, week.workdays)[0]
  const unrestrictedExtra = week.workdays.find((date) => date !== unrestrictedHome)

  const result = applyManualOverrides(schedule, [
    { employeeId: notApproved.id, date: week.workdays[0], status: 'HOME' },
    { employeeId: fixed.id, date: invalidFixedDay, status: 'HOME' },
    { employeeId: fixed.id, date: extraValidDay, status: 'HOME' },
    { employeeId: unrestricted.id, date: unrestrictedExtra, status: 'HOME' },
  ], [fixed, unrestricted, notApproved], params)

  assert.equal(result.cells[`${notApproved.id}__${week.workdays[0]}`].status, 'OFFICE')
  assert.equal(result.cells[`${fixed.id}__${invalidFixedDay}`].status, 'OFFICE')
  assert.equal(homeDays(result, fixed.id, week.workdays).length, 1)
  assert.equal(result.cells[`${unrestricted.id}__${unrestrictedExtra}`].status, 'OFFICE')
  assert.ok(result.alerts.some((alert) => alert.rule === 'MANUAL_HOME_NOT_APPROVED'))
  assert.ok(result.alerts.some((alert) => alert.rule === 'MANUAL_HOME_RESTRICTION'))
  assert.ok(result.alerts.some((alert) => alert.rule === 'MANUAL_HOME_LIMIT'))
})

test('final policy removes invalid TC introduced by legacy published data', () => {
  const notApproved = employee('not-approved', { hybridApproved: false })
  const schedule = generate([notApproved])
  const date = schedule.weeks[0].workdays[0]
  schedule.cells[`${notApproved.id}__${date}`] = {
    ...schedule.cells[`${notApproved.id}__${date}`],
    status: 'HOME',
    source: 'PUBLIC',
  }

  const result = enforceRotationPolicy(schedule, [notApproved])
  assert.equal(result.cells[`${notApproved.id}__${date}`].status, 'OFFICE')
  assert.ok(result.alerts.some((alert) => alert.rule === 'INVALID_HOME_REMOVED'))
})

test('floating seats never exceed configured WeWork capacity', () => {
  const date = '2026-06-01'
  const regular = employee('regular', { isFloating: false, baseSeat: '1' })
  const floaterOne = employee('floater-one', { isFloating: true })
  const floaterTwo = employee('floater-two', { isFloating: true })
  const employees = [regular, floaterOne, floaterTwo]
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W23', workdays: [date] }],
    alerts: [],
    cells: Object.fromEntries(employees.map((item) => [`${item.id}__${date}`, { status: 'OFFICE', source: 'TEST', alerts: [] }])),
  }

  const { result } = assignFloatingSeats(schedule, employees, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(result[date].byLocation.WEWORK.assigned.length, 1)
  assert.equal(result[date].assignedByEmp[floaterOne.id]?.location, 'WEWORK')
  assert.equal(result[date].unseated.length, 1)
})

test('daily summary counts floating seats by actual assigned location', () => {
  const date = '2026-06-01'
  const floater = employee('floater', { isFloating: true, baseLocation: 'WEWORK' })
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W23', workdays: [date] }],
    alerts: [],
    cells: { [`${floater.id}__${date}`]: { status: 'OFFICE', source: 'TEST', alerts: [] } },
  }
  const floatingResult = {
    [date]: {
      assigned: [{ empId: floater.id, seat: '39', location: 'OFICINA_93' }],
      unseated: [],
      assignedByEmp: { [floater.id]: { seat: '39', location: 'OFICINA_93' } },
    },
  }

  const { summary } = buildDailySummary(schedule, [floater], [date], { ...params, seatsWeWork: 1, seats93: 1 }, {}, floatingResult, [])

  assert.equal(summary[0].totalOfficeWeWork, 0)
  assert.equal(summary[0].totalOffice93, 1)
})

test('office 93 monthly rotation prioritizes July floating seat pressure', () => {
  const pinto = employee('pinto-juan-felipe', { isFloating: true, discipline: 'Z' })
  const vera = employee('vera-steven', { isFloating: true, discipline: 'Z' })
  const regularOne = employee('regular-one', { discipline: 'A' })
  const regularTwo = employee('regular-two', { discipline: 'A' })

  const assigned = assignOffice93ForMonth({
    employees: [regularOne, regularTwo, pinto, vera],
    params: { ...params, seats93: 2 },
    monthIndex: 0,
  })
  const reassigned = applyOffice93Assignment([regularOne, regularTwo, pinto, vera], assigned)

  assert.deepEqual(assigned, [pinto.id, vera.id])
  assert.equal(reassigned.find((item) => item.id === pinto.id).baseLocation, 'OFICINA_93')
  assert.equal(reassigned.find((item) => item.id === regularOne.id).baseLocation, 'WEWORK')
})

test('july 2026 seats every floater using Oficina 93 capacity', () => {
  const month = 6
  const year = 2026
  const office93 = assignOffice93ForMonth({
    employees: initialEmployees,
    params: defaultParameters,
    monthIndex: month,
  })
  const employees = applyOffice93Assignment(initialEmployees, office93)
  const base = generateMonthlySchedule({
    employees,
    holidays: initialHolidays,
    absences: initialAbsences,
    manualOverrides: [],
    month,
    year,
    params: defaultParameters,
    generationSeed: `${year}-${month}`,
  })
  const schedule = enforceNoOfficeOvercapacity(base, employees, initialHolidays, defaultParameters, 'july-floaters')
  const { result } = assignFloatingSeats(schedule, employees, schedule.days, defaultParameters, [])
  const unseated = Object.values(result).flatMap((day) => day.unseated || [])

  assert.deepEqual(unseated, [])
})
test('capacity reports unresolved when weekly TC targets prevent a valid seating plan', () => {
  const people = Array.from({ length: 4 }, (_, index) => employee(`person-${index + 1}`))
  const schedule = generate(people, { ...params, seatsWeWork: 1 })
  const balanced = enforceNoOfficeOvercapacity(schedule, people, [], { ...params, seatsWeWork: 1 }, 'capacity-strict')

  assert.ok(balanced.alerts.some((alert) => alert.rule === 'WEWORK_CAPACITY_UNRESOLVED'))
  for (const person of people) {
    for (const week of balanced.weeks) {
      assert.equal(homeDays(balanced, person.id, week.workdays).length, weeklyHomeTarget(person))
    }
  }
})
