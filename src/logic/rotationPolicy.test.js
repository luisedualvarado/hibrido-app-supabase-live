import test from 'node:test'
import assert from 'node:assert/strict'
import { generateMonthlySchedule, enforceNoOfficeOvercapacity, enforceRotationPolicy } from './scheduleGenerator.js'
import { applyMonthlyFloatingAssignment, applyOffice93Assignment } from './locationRotation.js'
import { applyManualOverrides, assignFloatingSeats } from './parkingGenerator.js'
import { getWorkdaysByWeek, weekdayKey } from './dateUtils.js'
import { buildFloatingSeatEmployees, weeklyHomeTarget } from './rotationPolicy.js'
import { buildDailySummary } from './validators.js'
import { initialEmployees } from '../data/initialEmployees.js'
import { initialAbsences, initialHolidays, defaultParameters } from '../data/initialHolidays.js'
import { PHYSICAL_SEATS_BY_LOCATION } from './deskLayouts.js'

const params = { seatsWeWork: 20, seats93: 10, parkingSpots: 3, lockers: 36 }

test('WeWork physical inventory excludes desks 24, 25 and 26', () => {
  assert.equal(PHYSICAL_SEATS_BY_LOCATION.WEWORK.length, 36)
  assert.deepEqual(PHYSICAL_SEATS_BY_LOCATION.WEWORK.filter((seat) => ['24', '25', '26'].includes(seat)), [])
})
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

test('capacity balancing uses automatic capacity TC without sending non-approved employees home', () => {
  const approved = employee('approved')
  const notApproved = employee('not-approved', { hybridApproved: false })
  const schedule = generate([approved, notApproved], { ...params, seatsWeWork: 1 })
  const balanced = enforceNoOfficeOvercapacity(schedule, [approved, notApproved], [], { ...params, seatsWeWork: 1 }, 'test')

  assert.equal(balanced.days.some((date) => balanced.cells[`not-approved__${date}`]?.status === 'HOME'), false)
  assert.ok(balanced.days.some((date) => balanced.cells[`approved__${date}`]?.source === 'CAPACITY'))
  assert.ok(balanced.alerts.some((alert) => alert.rule === 'WEWORK_CAPACITY_HOME_ASSIGNED'))
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

test('manual TC still cannot exceed weekly target even with capacity wording', () => {
  const approved = employee('approved')
  const schedule = generate([approved])
  const week = schedule.weeks[0]
  const [firstHomeDate] = homeDays(schedule, approved.id, week.workdays)
  const extraOfficeDate = week.workdays.find((date) => date !== firstHomeDate && schedule.cells[`${approved.id}__${date}`]?.status === 'OFFICE')
  const result = applyManualOverrides(schedule, [{
    employeeId: approved.id,
    date: extraOfficeDate,
    status: 'HOME',
    reason: 'Ajuste operativo por cupo',
  }], [approved], params)

  assert.equal(result.cells[`${approved.id}__${extraOfficeDate}`].status, 'OFFICE')
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

test('floating seats avoid desks occupied by their regular owner', () => {
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

  const { result, alerts } = assignFloatingSeats(schedule, employees, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(result[date].byLocation.WEWORK.assigned.length, 1)
  assert.equal(result[date].assignedByEmp[floaterOne.id]?.location, 'WEWORK')
  assert.equal(result[date].assignedByEmp[floaterOne.id]?.seat, '2')
  assert.equal(result[date].assignedByEmp[floaterTwo.id], undefined)
  assert.deepEqual(result[date].unseated, [floaterTwo.id])
  assert.ok(alerts.some((alert) => alert.rule === 'FLOATER_NO_SEAT' && alert.severity === 'CRITICAL'))
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

test('july office 93 has only Gabriel and Juan as monthly floaters', () => {
  const office93Ids = [
    'almeida-daniel',
    'desalvador-diego',
    'escobar-andres',
    'garcia-gabriel',
    'guevara-marylin',
    'molina-jessica',
    'morales-fabio',
    'morales-jonathan',
    'quiroz-millan-juan',
    'rodriguez-sofia',
    'rojas-camilo',
    'vanegas-kaory',
  ]
  const people = office93Ids.map((id) => employee(id, { isFloating: false }))
  const office93Employees = applyOffice93Assignment(people, office93Ids)
  const effective = applyMonthlyFloatingAssignment(office93Employees, {
    year: 2026,
    month: 6,
    office93Assigned: office93Ids,
  })

  const monthlyFloaters = effective
    .filter((item) => item.baseLocation === 'OFICINA_93' && item.isFloating)
    .map((item) => item.id)

  assert.deepEqual(monthlyFloaters, ['garcia-gabriel', 'quiroz-millan-juan'])
})
test('floating seats do not borrow desks from another monthly office group', () => {
  const date = '2026-07-15'
  const weRegular = employee('we-regular', { isFloating: false, baseLocation: 'WEWORK', baseSeat: '1' })
  const weFloater = employee('we-floater', { isFloating: true, baseLocation: 'WEWORK' })
  const o93Regular = employee('o93-regular', { isFloating: false, baseLocation: 'OFICINA_93', baseSeat: '39' })
  const employees = [weRegular, weFloater, o93Regular]
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W29', workdays: [date] }],
    alerts: [],
    cells: Object.fromEntries(employees.map((item) => [`${item.id}__${date}`, { status: 'OFFICE', source: 'TEST', alerts: [] }])),
  }

  const { result } = assignFloatingSeats(schedule, employees, [date], { ...params, seatsWeWork: 0, seats93: 2 })

  assert.equal(result[date].assignedByEmp[weFloater.id], undefined)
  assert.deepEqual(result[date].unseated, [weFloater.id])
})

test('capacity reports unresolved when no approved candidate can take TC', () => {
  const people = Array.from({ length: 3 }, (_, index) => employee(`person-${index + 1}`, { hybridApproved: false }))
  const schedule = generate(people, { ...params, seatsWeWork: 1 })
  const balanced = enforceNoOfficeOvercapacity(schedule, people, [], { ...params, seatsWeWork: 1 }, 'capacity-strict')

  assert.ok(balanced.alerts.some((alert) => alert.rule === 'WEWORK_CAPACITY_UNRESOLVED'))
  for (const person of people) {
    for (const week of balanced.weeks) {
      assert.equal(homeDays(balanced, person.id, week.workdays).length, 0)
    }
  }
})