import { isWeekend, isHoliday, weekdayKey, WEEKDAY_LABEL, getWorkdaysByWeek } from './dateUtils.js'
import { getAllowedDatesForEmployee, isRotationEligible, weeklyHomeTarget } from './rotationPolicy.js'

function restrictionApplies(employee) {
  return employee.restrictionEnabled !== false &&
    employee.restrictionType !== 'NONE' &&
    employee.restrictionType !== 'PENDING' &&
    employee.restrictionType !== 'SPECIAL'
}

function restrictionSatisfiedByHomeDays(employee, homeDays, allowedHomeDays) {
  if (!restrictionApplies(employee)) return true
  if (!employee.doubleHomeConsecutive) return homeDays.every((iso) => allowedHomeDays.has(iso))
  return homeDays.some((iso) => allowedHomeDays.has(iso))
}

export function buildDailySummary(schedule, employees, days, params, parkingUsage, floatingResult, holidays) {
  const summary = []
  const alerts = []
  const addAlert = (severity, message, rule, extra = {}) =>
    alerts.push({ id: `${rule}-${alerts.length}`, severity, message, rule, ...extra })

  for (const iso of days) {
    if (isWeekend(iso)) continue

    let totalHome = 0
    let officeWe = 0
    let office93 = 0
    const homeNames = []

    for (const employee of employees) {
      const cell = schedule.cells[`${employee.id}__${iso}`]
      if (!cell) continue
      if (cell.status === 'HOME') {
        totalHome += 1
        homeNames.push(employee.name)
      } else if (cell.status === 'OFFICE') {
        if (employee.baseLocation === 'OFICINA_93') office93 += 1
        else if (employee.baseLocation === 'WEWORK') officeWe += 1
      }
    }

    const freeWe = params.seatsWeWork - officeWe
    const free93 = params.seats93 - office93
    const floating = floatingResult?.[iso] || { assigned: [], unseated: [] }
    const parkUsed = (parkingUsage?.[iso] || []).length

    const daySummary = {
      date: iso,
      weekday: WEEKDAY_LABEL[weekdayKey(iso)],
      isHoliday: isHoliday(iso, holidays),
      totalHome,
      totalOfficeWeWork: officeWe,
      totalOffice93: office93,
      freeSeatsWeWork: freeWe,
      freeSeats93: free93,
      floatingPeoplePresent: floating.assigned.length + floating.unseated.length,
      floatingPeopleWithSeat: floating.assigned.length,
      floatingPeopleWithoutSeat: floating.unseated.length,
      parkingUsed: parkUsed,
      parkingAvailable: params.parkingSpots,
      homeNames,
      alerts: [],
    }

    if (isHoliday(iso, holidays)) {
      summary.push(daySummary)
      continue
    }

    if (freeWe < 0) {
      const message = `${iso}: WeWork tiene ${Math.abs(freeWe)} persona(s) por encima de sus ${params.seatsWeWork} puestos.`
      addAlert('CRITICAL', message, 'WEWORK_OVER_CAPACITY', { date: iso })
      daySummary.alerts.push(message)
    }

    if (free93 < 0) {
      const message = `${iso}: Oficina 93 tiene ${Math.abs(free93)} persona(s) por encima de sus ${params.seats93} puestos.`
      addAlert('CRITICAL', message, 'OFFICE93_OVER_CAPACITY', { date: iso })
      daySummary.alerts.push(message)
    }

    if (parkUsed > params.parkingSpots) {
      const message = `${iso}: demanda de parqueadero (${parkUsed}) supera cupos (${params.parkingSpots}).`
      addAlert('CRITICAL', message, 'PARKING_OVER', { date: iso })
      daySummary.alerts.push(message)
    }

    summary.push(daySummary)
  }

  return { summary, alerts }
}

export function validateSchedule(schedule, employees, year, month, holidays) {
  const alerts = []
  const add = (severity, message, rule, extra = {}) =>
    alerts.push({ id: `${rule}-${alerts.length}`, severity, message, rule, ...extra })
  const weeks = getWorkdaysByWeek(year, month, holidays)
  const eligible = employees.filter(isRotationEligible)

  for (const employee of eligible) {
    let prevWeekday = null
    let prevFridayHome = false

    weeks.forEach((week, weekIndex) => {
      if (week.workdays.length === 0) return

      const homeDays = week.workdays.filter((iso) => schedule.cells[`${employee.id}__${iso}`]?.status === 'HOME')
      const expectedHomeDays = weeklyHomeTarget(employee)
      const allowedHomeDays = new Set(getAllowedDatesForEmployee(employee, week.workdays))

      if (homeDays.length === 0) {
        if (expectedHomeDays > 0) {
          add('WARNING', `${employee.name}: sin trabajo en casa en una semana.`, 'NO_HOME_WEEK', { employeeId: employee.id })
        }
      } else if (homeDays.length > expectedHomeDays) {
        add('WARNING', `${employee.name}: mas de ${expectedHomeDays} dia(s) de trabajo en casa en una semana.`, 'EXTRA_HOME_WEEK', { employeeId: employee.id })
      } else if (employee.doubleHomeConsecutive && homeDays.length === 1) {
        add('WARNING', `${employee.name}: solo tiene un dia de TC; esperaba dos dias.`, 'MISSING_DOUBLE_HOME_WEEK', { employeeId: employee.id })
      }

      if (employee.avoidConsecutiveHomeDays) {
        for (let index = 1; index < homeDays.length; index += 1) {
          const previousIndex = week.workdays.indexOf(homeDays[index - 1])
          const currentIndex = week.workdays.indexOf(homeDays[index])
          if (currentIndex === previousIndex + 1) {
            add('WARNING', `${employee.name}: tiene dias de TC seguidos y su restriccion lo evita.`, 'AVOID_CONSECUTIVE_HOME_BROKEN', { employeeId: employee.id, date: homeDays[index] })
          }
        }
      }

      if (restrictionApplies(employee) && !restrictionSatisfiedByHomeDays(employee, homeDays, allowedHomeDays)) {
        homeDays
          .filter((iso) => !allowedHomeDays.has(iso))
          .forEach((iso) => {
            add('WARNING', `${employee.name}: tiene TC en un dia que no cumple su restriccion.`, 'HOME_RESTRICTION_BROKEN', { employeeId: employee.id, date: iso })
          })
      }

      if (homeDays.length) {
        const weekday = weekdayKey(homeDays[0])
        if (prevWeekday && weekday === prevWeekday) {
          add('INFO', `${employee.name}: repite ${WEEKDAY_LABEL[weekday]} respecto a la semana anterior.`, 'SAME_WEEKDAY', { employeeId: employee.id })
        }
        if (weekday === 'MONDAY' && prevFridayHome) {
          add('INFO', `${employee.name}: lunes en casa justo despues de un viernes en casa.`, 'FRIDAY_MONDAY', { employeeId: employee.id })
          if (employee.avoidConsecutiveHomeDays) {
            add('WARNING', `${employee.name}: tiene lunes en TC despues de viernes en TC y su restriccion lo evita.`, 'AVOID_CONSECUTIVE_HOME_BROKEN', { employeeId: employee.id, date: homeDays[0] })
          }
        }
        prevWeekday = weekday
        prevFridayHome = homeDays.some((iso) => weekdayKey(iso) === 'FRIDAY')
      }

    })

    if (employee.restrictionEnabled !== false && employee.restrictionType === 'PENDING') {
      add('INFO', `${employee.name}: restriccion pendiente por verificar.`, 'PENDING_RESTRICTION', { employeeId: employee.id })
    }
  }

  return alerts
}

export function buildDashboardKPIs(employees, summary, params, parkingAssigned, allAlerts) {
  const active = employees.filter((employee) => employee.isActive)
  const approved = employees.filter((employee) => employee.isActive && employee.hybridApproved)
  const we = employees.filter((employee) => employee.baseLocation === 'WEWORK' && employee.isActive)
  const o93 = employees.filter((employee) => employee.baseLocation === 'OFICINA_93' && employee.isActive)
  const days = summary.filter((day) => !day.isHoliday)
  const homeVals = days.map((day) => day.totalHome)
  const freeWeVals = days.map((day) => day.freeSeatsWeWork)
  const free93Vals = days.map((day) => day.freeSeats93)
  const avg = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0)
  const carsNoParking = employees.filter((employee) =>
    employee.hasCar && employee.baseLocation === 'WEWORK' && !parkingAssigned.includes(employee.id)
  )

  return {
    activeCount: active.length,
    approvedCount: approved.length,
    weCount: we.length,
    o93Count: o93.length,
    avgHome: Math.round(avg(homeVals)),
    maxHome: homeVals.length ? Math.max(...homeVals) : 0,
    overCapacityDays: days.filter((day) => day.freeSeatsWeWork < 0 || day.freeSeats93 < 0).length,
    avgFreeSeats: Math.round(avg(freeWeVals)),
    avgFreeSeats93: Math.round(avg(free93Vals)),
    offTargetDays: days.filter((day) => day.freeSeatsWeWork < 0 || day.freeSeats93 < 0).length,
    parkingAvailable: params.parkingSpots,
    parkingAssigned: parkingAssigned.length,
    carsNoParking: carsNoParking.length,
    criticalAlerts: allAlerts.filter((alert) => alert.severity === 'CRITICAL').length,
    warningAlerts: allAlerts.filter((alert) => alert.severity === 'WARNING').length,
  }
}
