import test from 'node:test'
import assert from 'node:assert/strict'
import { generateMonthlySchedule, enforceNoOfficeOvercapacity, enforceRotationPolicy } from './scheduleGenerator.js'
import { applyMonthlyFloatingAssignment, applyOffice93Assignment } from './locationRotation.js'
import { applyManualOverrides, assignFloatingSeats, resolveFloatingSeatShortages } from './parkingGenerator.js'
import { getWorkdaysByWeek, weekdayKey } from './dateUtils.js'
import { buildFloatingSeatEmployees, weeklyHomeTarget } from './rotationPolicy.js'
import { buildDailySummary } from './validators.js'
import { initialEmployees } from '../data/initialEmployees.js'
import { initialAbsences, initialHolidays, defaultParameters } from '../data/initialHolidays.js'
import { PHYSICAL_SEATS_BY_LOCATION } from './deskLayouts.js'
import { assignLockersForMonth } from './lockerGenerator.js'

const params = { seatsWeWork: 20, seats93: 10, parkingSpots: 3, lockers: 36 }

test('WeWork physical inventory excludes desks 24, 25 and 26', () => {
  assert.equal(PHYSICAL_SEATS_BY_LOCATION.WEWORK.length, 36)
  assert.deepEqual(PHYSICAL_SEATS_BY_LOCATION.WEWORK.filter((seat) => ['24', '25', '26'].includes(seat)), [])
})


test('Oficina 93 physical inventory excludes desk 42', () => {
  assert.equal(PHYSICAL_SEATS_BY_LOCATION.OFICINA_93.includes('42'), false)
})
test('WeWork desk 3 can be assigned to a floater when free', () => {
  const date = '2026-06-01'
  const regularOne = employee('regular-one', { isFloating: false, baseSeat: '1' })
  const regularTwo = employee('regular-two', { isFloating: false, baseSeat: '2' })
  const floater = employee('floater', { isFloating: true })
  const people = [regularOne, regularTwo, floater]
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W23', workdays: [date] }],
    alerts: [],
    cells: Object.fromEntries(people.map((item) => [`${item.id}__${date}`, { employeeId: item.id, date, status: 'OFFICE', source: 'TEST', alerts: [] }])),
  }

  const { result } = assignFloatingSeats(schedule, people, [date], { ...params, seatsWeWork: 3, seats93: 0 })

  assert.equal(result[date].assignedByEmp[floater.id]?.seat, '3')
  assert.equal(result[date].unseated.length, 0)
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

test('office capacity TC prefers one-day before two-day employees', () => {
  const date = '2026-06-01'
  const oneDay = employee('one-day', { name: 'A One Day' })
  const twoDay = employee('two-day', { name: 'B Two Day', doubleHomeConsecutive: true })
  const people = [twoDay, oneDay]
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W23', workdays: [date] }],
    alerts: [],
    cells: Object.fromEntries(people.map((person) => [`${person.id}__${date}`, {
      employeeId: person.id,
      date,
      status: 'OFFICE',
      source: 'TEST',
      alerts: [],
    }])),
  }

  const balanced = enforceNoOfficeOvercapacity(schedule, people, [], { ...params, seatsWeWork: 1 }, 'one-before-two')

  assert.equal(balanced.cells[`${oneDay.id}__${date}`].status, 'HOME')
  assert.equal(balanced.cells[`${twoDay.id}__${date}`].status, 'OFFICE')
})
test('office capacity TC does not exceed two weekly TC days', () => {
  const date = '2026-06-03'
  const previousOne = '2026-06-01'
  const previousTwo = '2026-06-02'
  const cappedOneDay = employee('capped-one-day', { name: 'A Capped One Day' })
  const cappedTwoDay = employee('capped-two-day', { name: 'B Capped Two Day', doubleHomeConsecutive: true })
  const availableOneDay = employee('available-one-day', { name: 'C Available One Day' })
  const people = [cappedOneDay, cappedTwoDay, availableOneDay]
  const days = [previousOne, previousTwo, date]
  const schedule = {
    days,
    weeks: [{ weekId: '2026-W23', workdays: days }],
    alerts: [],
    cells: Object.fromEntries(people.flatMap((person) => days.map((iso) => [`${person.id}__${iso}`, {
      employeeId: person.id,
      date: iso,
      status: 'OFFICE',
      source: 'TEST',
      alerts: [],
    }]))),
  }
  schedule.cells[`${cappedOneDay.id}__${previousOne}`].status = 'HOME'
  schedule.cells[`${cappedOneDay.id}__${previousTwo}`].status = 'HOME'
  schedule.cells[`${cappedTwoDay.id}__${previousOne}`].status = 'HOME'
  schedule.cells[`${cappedTwoDay.id}__${previousTwo}`].status = 'HOME'
  schedule.cells[`${availableOneDay.id}__${previousOne}`].status = 'HOME'

  const balanced = enforceNoOfficeOvercapacity(schedule, people, [], { ...params, seatsWeWork: 2 }, 'max-two-capacity')

  assert.equal(people.filter((person) => balanced.cells[`${person.id}__${date}`].status === 'OFFICE').length, 2)
  for (const person of people) {
    assert.ok(days.filter((iso) => balanced.cells[`${person.id}__${iso}`].status === 'HOME').length <= 2)
  }
})
test('manual office adjustment is accepted and capacity is rebalanced', () => {
  const date = '2026-06-03'
  const previousOne = '2026-06-01'
  const previousTwo = '2026-06-02'
  const manualPerson = employee('manual-person', { name: 'Manual Person' })
  const regularOne = employee('regular-one', { name: 'Regular One' })
  const regularTwo = employee('regular-two', { name: 'Regular Two' })
  const people = [manualPerson, regularOne, regularTwo]
  const days = [previousOne, previousTwo, date]
  const schedule = {
    days,
    weeks: [{ weekId: '2026-W23', workdays: days }],
    alerts: [],
    cells: Object.fromEntries(people.flatMap((person) => days.map((iso) => [`${person.id}__${iso}`, {
      employeeId: person.id,
      date: iso,
      status: 'OFFICE',
      source: 'TEST',
      alerts: [],
    }]))),
  }
  schedule.cells[`${regularOne.id}__${previousOne}`].status = 'HOME'
  schedule.cells[`${regularTwo.id}__${previousTwo}`].status = 'HOME'

  const withManualOffice = applyManualOverrides(schedule, [{
    employeeId: manualPerson.id,
    date,
    status: 'OFFICE',
    reason: 'Necesita asistir presencial',
  }], people, { ...params, seatsWeWork: 2 })
  const balanced = enforceNoOfficeOvercapacity(withManualOffice, people, [], { ...params, seatsWeWork: 2 }, 'manual-office')

  assert.equal(balanced.cells[`${manualPerson.id}__${date}`].status, 'OFFICE')
  assert.equal(balanced.cells[`${manualPerson.id}__${date}`].source, 'MANUAL')
  assert.equal(people.filter((person) => balanced.cells[`${person.id}__${date}`].status === 'OFFICE').length, 2)
  assert.ok(people.some((person) => person.id !== manualPerson.id && balanced.cells[`${person.id}__${date}`].source === 'CAPACITY'))
})
test('manual TC overrides approval, restrictions and weekly targets', () => {
  const fixed = employee('fixed', { restrictionType: 'FIXED_DAY', fixedDay: 'WEDNESDAY' })
  const unrestricted = employee('unrestricted')
  const notApproved = employee('not-approved', { hybridApproved: false })
  const schedule = generate([fixed, unrestricted, notApproved])
  const week = schedule.weeks[0]
  const invalidFixedDay = week.workdays.find((date) => weekdayKey(date) !== 'WEDNESDAY')
  const unrestrictedHome = homeDays(schedule, unrestricted.id, week.workdays)[0]
  const unrestrictedExtra = week.workdays.find((date) => date !== unrestrictedHome)

  const result = applyManualOverrides(schedule, [
    { employeeId: notApproved.id, date: week.workdays[0], status: 'HOME' },
    { employeeId: fixed.id, date: invalidFixedDay, status: 'HOME' },
    { employeeId: unrestricted.id, date: unrestrictedExtra, status: 'HOME' },
  ], [fixed, unrestricted, notApproved], params)

  assert.equal(result.cells[`${notApproved.id}__${week.workdays[0]}`].status, 'HOME')
  assert.equal(result.cells[`${notApproved.id}__${week.workdays[0]}`].source, 'MANUAL')
  assert.equal(result.cells[`${fixed.id}__${invalidFixedDay}`].status, 'HOME')
  assert.equal(result.cells[`${fixed.id}__${invalidFixedDay}`].source, 'MANUAL')
  assert.equal(result.cells[`${unrestricted.id}__${unrestrictedExtra}`].status, 'HOME')
  assert.equal(result.cells[`${unrestricted.id}__${unrestrictedExtra}`].source, 'MANUAL')
})

test('manual adjustment can override vacation or absence cells', () => {
  const approved = employee('approved')
  const schedule = generate([approved])
  const date = schedule.weeks[0].workdays[0]
  schedule.cells[`${approved.id}__${date}`] = {
    ...schedule.cells[`${approved.id}__${date}`],
    status: 'VACATION',
    source: 'SYSTEM',
  }

  const result = applyManualOverrides(schedule, [{
    employeeId: approved.id,
    date,
    status: 'OFFICE',
    reason: 'Correccion manual',
  }], [approved], params)

  assert.equal(result.cells[`${approved.id}__${date}`].status, 'OFFICE')
  assert.equal(result.cells[`${approved.id}__${date}`].source, 'MANUAL')
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


test('saved week cells can be adjusted by operational capacity TC', () => {
  const date = '2026-06-01'
  const regular = employee('regular', { name: 'Regular', isFloating: false, baseSeat: '1' })
  const floaterOne = employee('floater-one', { name: 'Floater One', isFloating: true })
  const floaterTwo = employee('floater-two', { name: 'Floater Two', isFloating: true })
  const people = [regular, floaterOne, floaterTwo]
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W23', workdays: [date] }],
    alerts: [],
    cells: Object.fromEntries(people.map((item) => [`${item.id}__${date}`, { employeeId: item.id, date, status: 'OFFICE', source: 'AUTO', alerts: [] }])),
  }
  const saved = applyManualOverrides(schedule, [{
    id: regular.id + '-' + date,
    employeeId: regular.id,
    date,
    status: 'OFFICE',
    reason: 'Semana 2026-W23 guardada',
    createdAt: '2026-06-01T00:00:00.000Z',
  }], people, { ...params, seatsWeWork: 3, seats93: 0 })

  assert.equal(saved.cells[`${regular.id}__${date}`].source, 'SAVED')

  const resolved = resolveFloatingSeatShortages(saved, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })
  const { result } = assignFloatingSeats(resolved, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(resolved.cells[`${regular.id}__${date}`].status, 'HOME')
  assert.equal(resolved.cells[`${regular.id}__${date}`].source, 'CAPACITY')
  assert.equal(result[date].unseated.length, 0)
})

test('floating shortage is resolved with operational capacity TC', () => {
  const date = '2026-06-01'
  const regular = employee('regular', { name: 'Regular', isFloating: false, baseSeat: '1' })
  const floaterOne = employee('floater-one', { name: 'Floater One', isFloating: true })
  const floaterTwo = employee('floater-two', { name: 'Floater Two', isFloating: true })
  const people = [regular, floaterOne, floaterTwo]
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W23', workdays: [date] }],
    alerts: [],
    cells: Object.fromEntries(people.map((item) => [`${item.id}__${date}`, { employeeId: item.id, date, status: 'OFFICE', source: 'TEST', alerts: [] }])),
  }

  const resolved = resolveFloatingSeatShortages(schedule, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })
  const { result } = assignFloatingSeats(resolved, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(resolved.cells[`${regular.id}__${date}`].status, 'HOME')
  assert.equal(resolved.cells[`${regular.id}__${date}`].source, 'CAPACITY')
  assert.equal(result[date].unseated.length, 0)
  assert.equal(result[date].assigned.length, 2)
})

test('floating operational capacity TC uses two-day hybrid employees only as last resort', () => {
  const date = '2026-06-01'
  const doubleDayRegular = employee('double-day-regular', {
    name: 'Double Day Regular',
    isFloating: false,
    baseSeat: '1',
    doubleHomeConsecutive: true,
  })
  const floaterOne = employee('floater-one', { name: 'Floater One', isFloating: true })
  const floaterTwo = employee('floater-two', { name: 'Floater Two', isFloating: true })
  const people = [doubleDayRegular, floaterOne, floaterTwo]
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W23', workdays: [date] }],
    alerts: [],
    cells: Object.fromEntries(people.map((item) => [`${item.id}__${date}`, { employeeId: item.id, date, status: 'OFFICE', source: 'TEST', alerts: [] }])),
  }

  const resolved = resolveFloatingSeatShortages(schedule, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })
  const { result } = assignFloatingSeats(resolved, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(resolved.cells[`${doubleDayRegular.id}__${date}`].status, 'HOME')
  assert.equal(resolved.cells[`${doubleDayRegular.id}__${date}`].source, 'CAPACITY')
  assert.equal(result[date].unseated.length, 0)
})

test('floating operational capacity TC sweeps one-day employees before reuse', () => {
  const firstDate = '2026-06-01'
  const secondDate = '2026-06-02'
  const oneDayA = employee('one-day-a', { name: 'A One Day', isFloating: false, baseSeat: '1' })
  const oneDayB = employee('one-day-b', { name: 'B One Day', isFloating: false, baseSeat: '2' })
  const twoDay = employee('two-day', { name: 'C Two Day', isFloating: false, baseSeat: '4', doubleHomeConsecutive: true })
  const floater = employee('floater', { name: 'Floater', isFloating: true })
  const people = [oneDayA, oneDayB, twoDay, floater]
  const days = [firstDate, secondDate]
  const schedule = {
    days,
    weeks: [{ weekId: '2026-W23', workdays: days }],
    alerts: [],
    cells: Object.fromEntries(people.flatMap((person) => days.map((date) => [`${person.id}__${date}`, {
      employeeId: person.id,
      date,
      status: 'OFFICE',
      source: 'TEST',
      alerts: [],
    }]))),
  }

  const resolved = resolveFloatingSeatShortages(schedule, people, days, { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(resolved.cells[`${oneDayA.id}__${firstDate}`].source, 'CAPACITY')
  assert.equal(resolved.cells[`${oneDayB.id}__${secondDate}`].source, 'CAPACITY')
  assert.equal(resolved.cells[`${twoDay.id}__${firstDate}`].status, 'OFFICE')
  assert.equal(resolved.cells[`${twoDay.id}__${secondDate}`].status, 'OFFICE')
})
test('floating operational capacity TC prefers one-day before two-day employees', () => {
  const date = '2026-06-01'
  const oneDayRegular = employee('one-day-regular', { name: 'A One Day', isFloating: false, baseSeat: '1' })
  const doubleDayRegular = employee('double-day-regular', {
    name: 'B Double Day',
    isFloating: false,
    baseSeat: '2',
    doubleHomeConsecutive: true,
  })
  const floaterOne = employee('floater-one', { name: 'Floater One', isFloating: true })
  const people = [oneDayRegular, doubleDayRegular, floaterOne]
  const schedule = {
    days: [date],
    weeks: [{ weekId: '2026-W23', workdays: [date] }],
    alerts: [],
    cells: Object.fromEntries(people.map((item) => [`${item.id}__${date}`, { employeeId: item.id, date, status: 'OFFICE', source: 'TEST', alerts: [] }])),
  }

  const resolved = resolveFloatingSeatShortages(schedule, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(resolved.cells[`${oneDayRegular.id}__${date}`].status, 'HOME')
  assert.equal(resolved.cells[`${oneDayRegular.id}__${date}`].source, 'CAPACITY')
  assert.equal(resolved.cells[`${doubleDayRegular.id}__${date}`].status, 'OFFICE')
})

test('floating capacity TC does not exceed two weekly TC days', () => {
  const date = '2026-06-03'
  const previousOne = '2026-06-01'
  const previousTwo = '2026-06-02'
  const cappedRegular = employee('capped-regular', { name: 'A Capped Regular', isFloating: false, baseSeat: '1' })
  const availableRegular = employee('available-regular', { name: 'B Available Regular', isFloating: false, baseSeat: '2' })
  const floater = employee('floater', { name: 'Floater', isFloating: true })
  const people = [cappedRegular, availableRegular, floater]
  const days = [previousOne, previousTwo, date]
  const schedule = {
    days,
    weeks: [{ weekId: '2026-W23', workdays: days }],
    alerts: [],
    cells: Object.fromEntries(people.flatMap((person) => days.map((iso) => [`${person.id}__${iso}`, {
      employeeId: person.id,
      date: iso,
      status: 'OFFICE',
      source: 'TEST',
      alerts: [],
    }]))),
  }
  schedule.cells[`${cappedRegular.id}__${previousOne}`].status = 'HOME'
  schedule.cells[`${cappedRegular.id}__${previousTwo}`].status = 'HOME'

  const resolved = resolveFloatingSeatShortages(schedule, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(resolved.cells[`${availableRegular.id}__${date}`].status, 'HOME')
  assert.equal(resolved.cells[`${availableRegular.id}__${date}`].source, 'CAPACITY')
  assert.equal(days.filter((iso) => resolved.cells[`${cappedRegular.id}__${iso}`].status === 'HOME').length, 2)
})
test('floating seat rule allows third TC only for two-day employees', () => {
  const date = '2026-06-03'
  const previousOne = '2026-06-01'
  const previousTwo = '2026-06-02'
  const cappedRegular = employee('capped-regular', { name: 'Capped Regular', isFloating: false, baseSeat: '1', doubleHomeConsecutive: true })
  const alternativeRegular = employee('alternative-regular', { name: 'Alternative Regular', isFloating: false, baseSeat: '2' })
  const floaterOne = employee('floater-one', { name: 'Floater One', isFloating: true })
  const people = [cappedRegular, alternativeRegular, floaterOne]
  const days = [previousOne, previousTwo, date]
  const schedule = {
    days,
    weeks: [{ weekId: '2026-W23', workdays: days }],
    alerts: [],
    cells: Object.fromEntries(people.flatMap((person) => days.map((iso) => [`${person.id}__${iso}`, {
      employeeId: person.id,
      date: iso,
      status: 'OFFICE',
      source: 'TEST',
      alerts: [],
    }]))),
  }
  schedule.cells[`${cappedRegular.id}__${previousOne}`].status = 'HOME'
  schedule.cells[`${cappedRegular.id}__${previousTwo}`].status = 'HOME'
  schedule.cells[`${alternativeRegular.id}__${date}`].source = 'MANUAL'

  const resolved = resolveFloatingSeatShortages(schedule, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })
  const { result } = assignFloatingSeats(resolved, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(resolved.cells[`${cappedRegular.id}__${date}`].status, 'HOME')
  assert.equal(resolved.cells[`${cappedRegular.id}__${date}`].source, 'CAPACITY')
  assert.equal(result[date].unseated.length, 0)
  assert.equal(days.filter((iso) => resolved.cells[cappedRegular.id + '__' + iso].status === 'HOME').length, 3)
  assert.equal(resolved.cells[alternativeRegular.id + '__' + previousOne].status, 'OFFICE')
  assert.ok(resolved.cells[`${cappedRegular.id}__${date}`].alerts.some((alert) => /excepcional/i.test(alert)))
})
test('floating seat rule uses exceptional TC instead of leaving a floater without seat', () => {
  const date = '2026-06-03'
  const previousOne = '2026-06-01'
  const previousTwo = '2026-06-02'
  const cappedRegular = employee('capped-regular', { name: 'Capped Regular', isFloating: false, baseSeat: '1', doubleHomeConsecutive: true })
  const floater = employee('floater', { name: 'Floater', isFloating: true })
  const people = [cappedRegular, floater]
  const days = [previousOne, previousTwo, date]
  const schedule = {
    days,
    weeks: [{ weekId: '2026-W23', workdays: days }],
    alerts: [],
    cells: Object.fromEntries(people.flatMap((person) => days.map((iso) => [`${person.id}__${iso}`, {
      employeeId: person.id,
      date: iso,
      status: 'OFFICE',
      source: 'TEST',
      alerts: [],
    }]))),
  }
  schedule.cells[`${cappedRegular.id}__${previousOne}`].status = 'HOME'
  schedule.cells[`${cappedRegular.id}__${previousTwo}`].status = 'HOME'

  const resolved = resolveFloatingSeatShortages(schedule, people, [date], { ...params, seatsWeWork: 1, seats93: 0 })
  const { result } = assignFloatingSeats(resolved, people, [date], { ...params, seatsWeWork: 1, seats93: 0 })

  assert.equal(resolved.cells[`${cappedRegular.id}__${date}`].status, 'HOME')
  assert.equal(resolved.cells[`${cappedRegular.id}__${date}`].source, 'CAPACITY')
  assert.equal(result[date].unseated.length, 0)
  assert.ok(resolved.cells[`${cappedRegular.id}__${date}`].alerts.some((alert) => /excepcional/i.test(alert)))
})
test('floating exceptional TC never gives a third TC to one-day employees', () => {
  const date = '2026-06-03'
  const previousOne = '2026-06-01'
  const previousTwo = '2026-06-02'
  const oneDayCapped = employee('one-day-capped', { name: 'A One Day Capped', isFloating: false, baseSeat: '1' })
  const twoDayCapped = employee('two-day-capped', { name: 'B Two Day Capped', isFloating: false, baseSeat: '2', doubleHomeConsecutive: true })
  const floater = employee('floater', { name: 'Floater', isFloating: true })
  const people = [oneDayCapped, twoDayCapped, floater]
  const days = [previousOne, previousTwo, date]
  const schedule = {
    days,
    weeks: [{ weekId: '2026-W23', workdays: days }],
    alerts: [],
    cells: Object.fromEntries(people.flatMap((person) => days.map((iso) => [`${person.id}__${iso}`, {
      employeeId: person.id,
      date: iso,
      status: 'OFFICE',
      source: 'TEST',
      alerts: [],
    }]))),
  }
  for (const person of [oneDayCapped, twoDayCapped]) {
    schedule.cells[`${person.id}__${previousOne}`].status = 'HOME'
    schedule.cells[`${person.id}__${previousTwo}`].status = 'HOME'
  }

  const resolved = resolveFloatingSeatShortages(schedule, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })
  const { result } = assignFloatingSeats(resolved, people, [date], { ...params, seatsWeWork: 2, seats93: 0 })

  assert.equal(resolved.cells[`${oneDayCapped.id}__${date}`].status, 'OFFICE')
  assert.equal(resolved.cells[`${twoDayCapped.id}__${date}`].status, 'HOME')
  assert.equal(days.filter((iso) => resolved.cells[`${oneDayCapped.id}__${iso}`].status === 'HOME').length, 2)
  assert.equal(days.filter((iso) => resolved.cells[`${twoDayCapped.id}__${iso}`].status === 'HOME').length, 3)
  assert.equal(result[date].unseated.length, 0)
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
test('lockers are assigned only to employees who remain in WeWork for the month', () => {
  const weworkEmployee = employee('wework-person')
  const office93Employee = employee('office93-person')
  const effectiveEmployees = applyOffice93Assignment([weworkEmployee, office93Employee], [office93Employee.id])

  const result = assignLockersForMonth({
    employees: effectiveEmployees,
    lockerCount: 2,
    manualAssignments: [
      { employeeId: office93Employee.id, lockerNumber: '001' },
      { employeeId: weworkEmployee.id, lockerNumber: '002' },
    ],
  })

  assert.deepEqual(result.eligibleEmployees.map((item) => item.id), [weworkEmployee.id])
  assert.equal(result.assignmentByEmployee[weworkEmployee.id]?.lockerNumber, '002')
  assert.equal(result.assignmentByEmployee[office93Employee.id], undefined)
  assert.deepEqual(result.ignoredManualAssignments, [{ employeeId: office93Employee.id, lockerNumber: '001' }])
})

test('WeWork floaters receive individual lockers before regular employees share lockers', () => {
  const floaterOne = employee('floater-one', { isFloating: true })
  const floaterTwo = employee('floater-two', { isFloating: true })
  const regularOne = employee('regular-one', { isFloating: false })
  const regularTwo = employee('regular-two', { isFloating: false })

  const result = assignLockersForMonth({
    employees: [regularTwo, floaterTwo, regularOne, floaterOne],
    lockerCount: 3,
  })

  assert.equal(result.assignmentByEmployee[floaterOne.id]?.lockerNumber, '001')
  assert.equal(result.assignmentByEmployee[floaterTwo.id]?.lockerNumber, '002')
  assert.equal(result.assignmentByEmployee[floaterOne.id]?.shared, false)
  assert.equal(result.assignmentByEmployee[floaterTwo.id]?.shared, false)
  assert.equal(result.assignmentByEmployee[regularOne.id]?.lockerNumber, '003')
  assert.equal(result.assignmentByEmployee[regularTwo.id]?.lockerNumber, '003')
  assert.equal(result.lockers.find((locker) => locker.lockerNumber === '003')?.shared, true)
})

test('twenty one WeWork floaters receive individual lockers with thirty six lockers', () => {
  const floaters = Array.from({ length: 21 }, (_, index) => employee(`floater-${String(index + 1).padStart(2, '0')}`, { isFloating: true }))
  const regulars = Array.from({ length: 22 }, (_, index) => employee(`regular-${String(index + 1).padStart(2, '0')}`, { isFloating: false }))

  const result = assignLockersForMonth({
    employees: [...regulars, ...floaters],
    lockerCount: 36,
  })

  const floaterLockerNumbers = new Set(floaters.map((person) => result.assignmentByEmployee[person.id]?.lockerNumber))
  assert.equal(floaterLockerNumbers.size, 21)
  assert.equal(floaters.every((person) => result.assignmentByEmployee[person.id]?.shared === false), true)
  assert.equal(floaters.every((person) => {
    const lockerNumber = result.assignmentByEmployee[person.id]?.lockerNumber
    return result.lockers.find((locker) => locker.lockerNumber === lockerNumber)?.occupants.length === 1
  }), true)
  assert.equal(result.unassignedCount, 0)
})

test('manual locker assignments cannot make WeWork floaters share with regular employees', () => {
  const floater = employee('floater-person', { isFloating: true })
  const regular = employee('regular-person', { isFloating: false })

  const result = assignLockersForMonth({
    employees: [regular, floater],
    lockerCount: 2,
    manualAssignments: [
      { employeeId: regular.id, lockerNumber: '001' },
      { employeeId: floater.id, lockerNumber: '001' },
    ],
  })

  assert.equal(result.assignmentByEmployee[floater.id]?.lockerNumber, '001')
  assert.equal(result.assignmentByEmployee[floater.id]?.shared, false)
  assert.equal(result.assignmentByEmployee[regular.id]?.lockerNumber, '002')
  assert.equal(result.ignoredManualAssignments.some((assignment) => assignment.employeeId === regular.id), true)
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
