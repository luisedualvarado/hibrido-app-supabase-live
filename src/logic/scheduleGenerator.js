// scheduleGenerator.js — algoritmo heurístico de programación mensual.
//
// Estrategia general:
//   1. Construir el esqueleto de celdas (festivos, fines de semana, vacaciones).
//   2. Para cada semana laboral, asignar a cada empleado elegible exactamente
//      1 día de trabajo en casa (TC), usando un sistema de puntaje (scoring).
//   3. El scoring penaliza/bonifica según las reglas del proceso.
//   4. Se respeta el máximo de personas en casa por día y se balancea la carga.
//   5. Al final se aplican ajustes manuales y se recalculan alertas y resumen.

import {
  getDaysInMonth, getWorkdaysByWeek, isWeekend, isHoliday, holidayName,
  weekdayKey, parseISO, rangeDates, WEEKDAY_LABEL,
} from './dateUtils.js'
import {
  getAllowedDatesForEmployee,
  hasHardRestriction,
  isDateAllowedForEmployee,
  isRotationEligible,
  restrictionTypeFor,
  weeklyHomeTarget,
} from './rotationPolicy.js'

function seededTieBreaker(seed, ...parts) {
  const text = `${seed}::${parts.join('::')}`
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function rebuildHomeCountByDay(cells, days, employees) {
  const counts = Object.fromEntries(days.map((iso) => [iso, 0]))
  for (const employee of employees) {
    for (const iso of days) {
      if (cells[`${employee.id}__${iso}`]?.status === 'HOME') {
        counts[iso] = (counts[iso] || 0) + 1
      }
    }
  }
  return counts
}

function officeLocationFor(employee) {
  return ['WEWORK', 'OFICINA_93'].includes(employee.baseLocation) ? employee.baseLocation : null
}

function registerHomeAssignment(employee, iso, homeCountByDay, officeHomeAssignmentsByDay) {
  homeCountByDay[iso] = (homeCountByDay[iso] || 0) + 1
  const officeLocation = officeLocationFor(employee)
  if (!officeLocation) return
  officeHomeAssignmentsByDay[officeLocation][iso] = (officeHomeAssignmentsByDay[officeLocation][iso] || 0) + 1
}

// ---- Ausencias -----------------------------------------------------------
export function isEmployeeAbsent(employeeId, iso, absences) {
  return absences.some((a) => {
    if (a.employeeId !== employeeId) return false
    return rangeDates(a.startDate, a.endDate).includes(iso)
  })
}

export function absenceType(employeeId, iso, absences) {
  const a = absences.find(
    (x) => x.employeeId === employeeId && rangeDates(x.startDate, x.endDate).includes(iso)
  )
  return a ? a.type : null
}

// ---- Días candidatos para un empleado según su restricción individual ----
export { getAllowedDatesForEmployee } from './rotationPolicy.js'

// ---- Scoring de una fecha para un empleado -------------------------------
// Menor puntaje = mejor. Penalizaciones suman, bonificaciones restan.
export function scoreDateForEmployee(employee, iso, ctx) {
  const { absences, holidays, homeCountByDay, params, prevWeekHomeWeekday,
    prevFridayHome, officeBaseAvailabilityByDay, officeHomeAssignmentsByDay } = ctx
  let score = 0
  const wd = weekdayKey(iso)

  // Penalizaciones fuertes (descartan o casi)
  if (isHoliday(iso, holidays)) score += 1000
  if (isEmployeeAbsent(employee.id, iso, absences)) score += 1000

  // Día no permitido por restricción dura
  if (restrictionTypeFor(employee) === 'NOT_ALLOWED_DAYS' &&
      (employee.notAllowedDays || []).includes(wd)) score += 1000
  if (hasHardRestriction(employee) && !isDateAllowedForEmployee(employee, iso)) score += 500

  // Cupo de casa por día alcanzado
  const homeCount = homeCountByDay[iso] || 0

  // Repetir mismo día de la semana respecto a la semana anterior
  if (prevWeekHomeWeekday && prevWeekHomeWeekday === wd) score += 60

  // Lunes inmediatamente después de un viernes en casa
  if (wd === 'MONDAY' && prevFridayHome) score += 80

  // Balance: preferir días con menos gente en casa (puestos libres entre 8 y 9)
  score += homeCount * 8

  const officeLocation = officeLocationFor(employee)
  if (officeLocation) {
    const officeSeats = Number(officeLocation === 'OFICINA_93' ? params.seats93 : params.seatsWeWork) || 0
    const officeBaseAvailability = officeBaseAvailabilityByDay[officeLocation]?.[iso] || 0
    const officeHomeAssignments = officeHomeAssignmentsByDay[officeLocation]?.[iso] || 0
    const projectedPresent = officeBaseAvailability - officeHomeAssignments - 1
    const fillGap = officeSeats - projectedPresent

    // El óptimo es dejar los puestos completos en cada sede.
    score += Math.abs(fillGap) * 25
    if (fillGap > 0) score += fillGap * 20
  }

  // Bonificación por cumplir restricción individual obligatoria
  if (hasHardRestriction(employee)) {
    score -= 40
  }

  // Pequeña preferencia por viernes para mejorar rotación (viernes entra a rotación)
  if (wd === 'FRIDAY') score -= 3

  return score
}

function consecutivePairs(dates) {
  const pairs = []
  for (let index = 0; index < dates.length - 1; index += 1) {
    const current = parseISO(dates[index])
    const next = parseISO(dates[index + 1])
    const diffDays = (next - current) / (1000 * 60 * 60 * 24)
    if (diffDays === 1) pairs.push([dates[index], dates[index + 1]])
  }
  return pairs
}

function nonConsecutivePairs(dates, workdays) {
  const pairs = []
  for (let firstIndex = 0; firstIndex < dates.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < dates.length; secondIndex += 1) {
      const firstWorkdayIndex = workdays.indexOf(dates[firstIndex])
      const secondWorkdayIndex = workdays.indexOf(dates[secondIndex])
      if (firstWorkdayIndex === -1 || secondWorkdayIndex === -1) continue
      if (Math.abs(secondWorkdayIndex - firstWorkdayIndex) > 1) {
        pairs.push([dates[firstIndex], dates[secondIndex]])
      }
    }
  }
  return pairs
}

function pairCandidates(dates) {
  const pairs = []
  for (let firstIndex = 0; firstIndex < dates.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < dates.length; secondIndex += 1) {
      pairs.push([dates[firstIndex], dates[secondIndex]])
    }
  }
  return pairs
}

function scorePairForEmployee(employee, pair, ctx, seed, weekId) {
  const [first, second] = pair
  return scoreDateForEmployee(employee, first, ctx) +
    scoreDateForEmployee(employee, second, ctx) +
    seededTieBreaker(seed, employee.id, weekId, first, second)
}

function countHomeDays(cells, employeeId, days) {
  return days.filter((iso) => cells[`${employeeId}__${iso}`]?.status === 'HOME').length
}

function hasAdjacentHome(cells, employeeId, iso, workdays) {
  const index = workdays.indexOf(iso)
  const previous = index > 0 ? workdays[index - 1] : null
  const next = index >= 0 && index < workdays.length - 1 ? workdays[index + 1] : null
  return (previous && cells[`${employeeId}__${previous}`]?.status === 'HOME') ||
    (next && cells[`${employeeId}__${next}`]?.status === 'HOME')
}

function hasAdjacentHomeAfterMove(cells, employeeId, iso, workdays, oldHomeIso = null) {
  const index = workdays.indexOf(iso)
  const previous = index > 0 ? workdays[index - 1] : null
  const next = index >= 0 && index < workdays.length - 1 ? workdays[index + 1] : null
  return [previous, next].some((day) => {
    if (!day || day === oldHomeIso) return false
    return cells[`${employeeId}__${day}`]?.status === 'HOME'
  })
}

function canAssignHome(employee, iso, cells, monthWorkdays, oldHomeIso = null) {
  if (!isRotationEligible(employee)) return false
  if (hasHardRestriction(employee) && !isDateAllowedForEmployee(employee, iso)) return false
  if (employee.avoidConsecutiveHomeDays && hasAdjacentHomeAfterMove(cells, employee.id, iso, monthWorkdays, oldHomeIso)) return false
  return true
}

function officePresentCount(employees, cells, iso, location) {
  return employees.filter((employee) =>
    employee.isActive &&
    employee.baseLocation === location &&
    cells[`${employee.id}__${iso}`]?.status === 'OFFICE'
  ).length
}

function isProtectedManualOfficeCell(cells, employeeId, iso) {
  return cells[`${employeeId}__${iso}`]?.source === 'MANUAL'
}

function weekForDate(weeks, iso) {
  return weeks.find((week) => week.workdays.includes(iso))
}

function moveHomeDay(employee, fromIso, toIso, cells, homeCountByDay, message) {
  const fromKey = `${employee.id}__${fromIso}`
  const toKey = `${employee.id}__${toIso}`
  cells[fromKey] = { ...cells[fromKey], status: 'OFFICE', source: 'AUTO', alerts: [] }
  cells[toKey] = {
    ...cells[toKey],
    status: 'HOME',
    source: 'AUTO',
    alerts: [...(cells[toKey].alerts || []), message],
  }
  homeCountByDay[fromIso] = Math.max(0, (homeCountByDay[fromIso] || 0) - 1)
  homeCountByDay[toIso] = (homeCountByDay[toIso] || 0) + 1
}

function setExtraHomeDay(employee, iso, cells, homeCountByDay, message, extraAlerts = []) {
  const key = `${employee.id}__${iso}`
  cells[key] = {
    ...cells[key],
    status: 'HOME',
    source: 'AUTO',
    alerts: [...(cells[key].alerts || []), ...extraAlerts, message],
  }
  homeCountByDay[iso] = (homeCountByDay[iso] || 0) + 1
}

function balanceOfficeCapacity({ employees, cells, days, weeks, holidays, params, homeCountByDay, generationSeed, location, addAlert }) {
  const seats = Math.max(0, Number(location === 'OFICINA_93' ? params.seats93 : params.seatsWeWork) || 0)
  if (seats === 0) return
  const officeEmployees = employees.filter((employee) =>
    employee.isActive && employee.baseLocation === location
  )
  const officeName = location === 'OFICINA_93' ? 'Oficina 93' : 'WeWork'
  const monthWorkdays = days.filter((iso) => !isWeekend(iso) && !isHoliday(iso, holidays))

  for (const iso of days) {
    if (isWeekend(iso) || isHoliday(iso, holidays)) continue
    let present = officeEmployees.filter((employee) => cells[`${employee.id}__${iso}`]?.status === 'OFFICE')
    while (present.length > seats) {
      const week = weekForDate(weeks, iso)
      const movablePresent = present.filter((employee) => !isProtectedManualOfficeCell(cells, employee.id, iso))
      const orderedCandidates = [...movablePresent]
        .filter((employee) => isRotationEligible(employee))
        .sort((a, b) => {
          if (!!a.isFloating !== !!b.isFloating) return a.isFloating ? 1 : -1
          const aCanRespect = canAssignHome(a, iso, cells, monthWorkdays)
          const bCanRespect = canAssignHome(b, iso, cells, monthWorkdays)
          if (aCanRespect !== bCanRespect) return aCanRespect ? -1 : 1
          return seededTieBreaker(generationSeed, location, iso, a.id) - seededTieBreaker(generationSeed, location, iso, b.id)
        })

      let solved = false
      if (week) {
        for (const candidate of orderedCandidates) {
          const currentHomeDays = week.workdays.filter((day) => cells[`${candidate.id}__${day}`]?.status === 'HOME')
          const movableHomeDay = currentHomeDays.find((oldHomeIso) =>
            oldHomeIso !== iso &&
            officePresentCount(employees, cells, oldHomeIso, location) + 1 <= seats &&
            canAssignHome(candidate, iso, cells, monthWorkdays, oldHomeIso)
          )
          if (movableHomeDay) {
            moveHomeDay(candidate, movableHomeDay, iso, cells, homeCountByDay, `TC movido para evitar sobrecupo en ${officeName}`)
            solved = true
            break
          }
        }
      }

      if (!solved) {
        const extraCandidate = orderedCandidates.find((candidate) =>
          week &&
          canAssignHome(candidate, iso, cells, monthWorkdays) &&
          countHomeDays(cells, candidate.id, week.workdays) < weeklyHomeTarget(candidate)
        )
        if (!extraCandidate) {
          addAlert?.('CRITICAL',
            `${iso}: el sobrecupo de ${officeName} no puede resolverse sin romper aprobacion, restriccion o dias TC.`,
            `${location}_CAPACITY_UNRESOLVED`, { date: iso })
          break
        }
        setExtraHomeDay(
          extraCandidate,
          iso,
          cells,
          homeCountByDay,
          `TC asignado dentro del limite para evitar sobrecupo en ${officeName}`
        )
      }
      present = officeEmployees.filter((employee) => cells[`${employee.id}__${iso}`]?.status === 'OFFICE')
    }
  }
}

export function enforceNoOfficeOvercapacity(schedule, employees, holidays, params, generationSeed = 0) {
  const cells = { ...schedule.cells }
  const homeCountByDay = rebuildHomeCountByDay(cells, schedule.days, employees)
  const alerts = [...(schedule.alerts || [])]
  const addAlert = (severity, message, rule, extra = {}) =>
    alerts.push({ id: `${rule}-${alerts.length}`, severity, message, rule, ...extra })

  balanceOfficeCapacity({
    employees,
    cells,
    days: schedule.days,
    weeks: schedule.weeks,
    holidays,
    params,
    homeCountByDay,
    generationSeed,
    location: 'OFICINA_93',
    addAlert,
  })
  balanceOfficeCapacity({
    employees,
    cells,
    days: schedule.days,
    weeks: schedule.weeks,
    holidays,
    params,
    homeCountByDay,
    generationSeed,
    location: 'WEWORK',
    addAlert,
  })

  return {
    ...schedule,
    cells,
    homeCountByDay: rebuildHomeCountByDay(cells, schedule.days, employees),
    alerts,
  }
}

export function enforceRotationPolicy(schedule, employees) {
  const cells = { ...schedule.cells }
  const alerts = [...(schedule.alerts || [])]
  const add = (employee, date, rule, message) => {
    alerts.push({
      id: `${rule}-${alerts.length}`,
      severity: 'CRITICAL',
      employeeId: employee.id,
      date,
      rule,
      message,
    })
  }

  for (const employee of employees) {
    for (const week of schedule.weeks || []) {
      const homeDays = week.workdays.filter((date) => cells[`${employee.id}__${date}`]?.status === 'HOME')
      for (const date of homeDays) {
        if (isRotationEligible(employee) && (!hasHardRestriction(employee) || isDateAllowedForEmployee(employee, date))) continue
        const key = `${employee.id}__${date}`
        cells[key] = { ...cells[key], status: 'OFFICE', source: 'SYSTEM', alerts: ['TC retirado por politica obligatoria'] }
        add(employee, date, 'INVALID_HOME_REMOVED', `${employee.name}: TC retirado porque no cumple aprobacion o restriccion.`)
      }

      const validHomeDays = week.workdays
        .filter((date) => cells[`${employee.id}__${date}`]?.status === 'HOME')
        .sort((left, right) => {
          const leftManual = cells[`${employee.id}__${left}`]?.source === 'MANUAL' ? 0 : 1
          const rightManual = cells[`${employee.id}__${right}`]?.source === 'MANUAL' ? 0 : 1
          return leftManual - rightManual || left.localeCompare(right)
        })
      validHomeDays.slice(weeklyHomeTarget(employee)).forEach((date) => {
        const key = `${employee.id}__${date}`
        cells[key] = { ...cells[key], status: 'OFFICE', source: 'SYSTEM', alerts: ['TC retirado por limite semanal'] }
        add(employee, date, 'EXTRA_HOME_REMOVED', `${employee.name}: TC retirado porque supera su limite semanal.`)
      })
    }
  }

  return { ...schedule, cells, alerts }
}

// ---- Generación principal -------------------------------------------------
export function generateMonthlySchedule(ctx) {
  const { employees, holidays, absences, manualOverrides, month, year, params, generationSeed = 0 } = ctx
  const days = getDaysInMonth(year, month)
  const weeks = getWorkdaysByWeek(year, month, holidays)

  // Elegibles: activos + híbrido aprobado
  const eligible = employees.filter(isRotationEligible)

  // Mapa de celdas: key = `${empId}__${iso}`
  const cells = {}
  const homeCountByDay = {}
  const officeBaseAvailabilityByDay = { WEWORK: {}, OFICINA_93: {} }
  const officeHomeAssignmentsByDay = { WEWORK: {}, OFICINA_93: {} }
  const alerts = []
  const addAlert = (severity, message, rule, extra = {}) =>
    alerts.push({ id: `${rule}-${alerts.length}`, severity, message, rule, ...extra })

  // 1. Esqueleto: por defecto OFFICE en días hábiles; weekend/holiday/vacaciones marcados
  for (const e of employees) {
    for (const iso of days) {
      const key = `${e.id}__${iso}`
      let status = 'OFFICE'
      const cellAlerts = []
      if (isWeekend(iso)) status = 'NOT_APPLICABLE'
      else if (isHoliday(iso, holidays)) status = 'HOLIDAY'
      else if (isEmployeeAbsent(e.id, iso, absences)) {
        const t = absenceType(e.id, iso, absences)
        status = t === 'VACATION' ? 'VACATION' : 'ABSENCE'
      } else if (!e.isActive || e.baseLocation === 'REMOTO') {
        // Inactivos o remotos no consumen puesto presencial ni entran a rotacion.
        status = 'NOT_APPLICABLE'
      }
      cells[key] = { employeeId: e.id, date: iso, status, source: 'AUTO', alerts: cellAlerts }
      const officeLocation = officeLocationFor(e)
      if (status === 'OFFICE' && officeLocation) {
        officeBaseAvailabilityByDay[officeLocation][iso] = (officeBaseAvailabilityByDay[officeLocation][iso] || 0) + 1
      }
    }
  }

  // 2. Asignación semanal de TC por empleado elegible
  // Memoria de rotación por empleado
  const prevWeekday = {}     // empId -> weekday key de TC semana anterior
  const prevFriday = {}      // empId -> bool: tuvo viernes en casa la semana anterior

  for (const [weekIndex, week] of weeks.entries()) {
    const workdays = week.workdays
    if (workdays.length === 0) continue

    // Orden: primero quienes tienen menos opciones (restricciones más rígidas)
    const order = [...eligible].sort((a, b) => {
      if (!!a.doubleHomeConsecutive !== !!b.doubleHomeConsecutive) {
        return a.doubleHomeConsecutive ? -1 : 1
      }
      const oa = getAllowedDatesForEmployee(a, workdays).length
      const ob = getAllowedDatesForEmployee(b, workdays).length
      if (oa === ob) {
        return seededTieBreaker(generationSeed, week.weekId, a.id) - seededTieBreaker(generationSeed, week.weekId, b.id)
      }
      return oa - ob
    })

    for (const e of order) {
      if (e.doubleHomeConsecutive) {
        const monthWorkdays = days.filter((day) => !isWeekend(day) && !isHoliday(day, holidays))
        const buildPairs = (dates) => e.avoidConsecutiveHomeDays
          ? nonConsecutivePairs(dates, workdays)
          : pairCandidates(dates)
        let candidates = getAllowedDatesForEmployee(e, workdays).filter((iso) => {
          const c = cells[`${e.id}__${iso}`]
          return c && c.status === 'OFFICE'
        })
        let pairs = buildPairs(candidates)
        if (e.avoidConsecutiveHomeDays) {
          pairs = pairs.filter((pair) =>
            !pair.some((iso) => (prevFriday[e.id] && weekdayKey(iso) === 'MONDAY') ||
              hasAdjacentHome(cells, e.id, iso, monthWorkdays))
          )
        }

        let brokeRestriction = false
        const hardRestriction = hasHardRestriction(e)
        if (pairs.length === 0) {
          if (hardRestriction) {
            addAlert('INFO',
              `${e.name}: semana corta sin dos dias compatibles con su restriccion; sin TC doble esta semana.`,
              'SHORT_WEEK_DOUBLE_RESTRICTION', { employeeId: e.id })
            continue
          }
          pairs = buildPairs(workdays.filter((iso) => {
            const cell = cells[`${e.id}__${iso}`]
            return cell?.status === 'OFFICE'
          }))
          if (e.avoidConsecutiveHomeDays) {
            pairs = pairs.filter((pair) =>
              !pair.some((iso) => (prevFriday[e.id] && weekdayKey(iso) === 'MONDAY') ||
                hasAdjacentHome(cells, e.id, iso, monthWorkdays))
            )
          }
          if (pairs.length > 0 && hardRestriction) brokeRestriction = true
        }

        if (pairs.length === 0) {
          addAlert('WARNING',
            `${e.name}: sin dos dias disponibles de trabajo en casa en la semana del ${week.weekId}.`,
            'NO_DOUBLE_HOME_THIS_WEEK', { employeeId: e.id })
          continue
        }

        const subCtx = {
          absences, holidays, homeCountByDay, params, officeBaseAvailabilityByDay, officeHomeAssignmentsByDay,
          prevWeekHomeWeekday: prevWeekday[e.id],
          prevFridayHome: prevFriday[e.id],
        }
        let bestPair = null
        let bestScore = Infinity
        for (const pair of pairs) {
          const pairScore = scorePairForEmployee(e, pair, subCtx, generationSeed, week.weekId)
          if (pairScore < bestScore) { bestScore = pairScore; bestPair = pair }
        }

        const restrictionSatisfied = !brokeRestriction || bestPair.some((iso) => isDateAllowedForEmployee(e, iso))
        for (const iso of bestPair) {
          const key = `${e.id}__${iso}`
          const cellAlerts = []
          if (!restrictionSatisfied && !isDateAllowedForEmployee(e, iso)) {
            cellAlerts.push('Restriccion individual no se pudo cumplir')
          }
          cells[key] = { ...cells[key], status: 'HOME', source: 'AUTO', alerts: cellAlerts }
          registerHomeAssignment(e, iso, homeCountByDay, officeHomeAssignmentsByDay)
        }
        if (!restrictionSatisfied) {
          addAlert('WARNING',
            `${e.name}: no se pudo respetar su restriccion (${restrictionTypeFor(e)}) al asignar dos TC.`,
            'DOUBLE_RESTRICTION_BROKEN', { employeeId: e.id, date: bestPair[0] })
        }
        prevWeekday[e.id] = weekdayKey(bestPair[0])
        prevFriday[e.id] = bestPair.some((iso) => weekdayKey(iso) === 'FRIDAY')
        continue
      }

      // Días candidatos según restricción
      let candidates = getAllowedDatesForEmployee(e, workdays)
      // Excluir días en vacaciones/ausencia/festivo (no se programa TC)
      candidates = candidates.filter((iso) => {
        const c = cells[`${e.id}__${iso}`]
        return c && c.status === 'OFFICE'
      })
      if (e.avoidConsecutiveHomeDays) {
        const monthWorkdays = days.filter((day) => !isWeekend(day) && !isHoliday(day, holidays))
        const noConsecutive = candidates.filter((iso) =>
          !(prevFriday[e.id] && weekdayKey(iso) === 'MONDAY') &&
          !hasAdjacentHome(cells, e.id, iso, monthWorkdays)
        )
        if (noConsecutive.length > 0) candidates = noConsecutive
      }

      let brokeRestriction = false
      const hardRestriction = hasHardRestriction(e)
      // Si no hay candidatos válidos por restricción, abrir a cualquier día hábil libre
      if (candidates.length === 0) {
        // En semanas cortas (≤2 días hábiles) no rompemos una restricción dura:
        // es preferible no asignar TC esa semana y compensar en otra.
        if (hardRestriction) {
          addAlert('INFO',
            `${e.name}: semana corta sin día compatible con su restricción; sin TC esta semana.`,
            'SHORT_WEEK_RESTRICTION', { employeeId: e.id })
          continue
        }
        candidates = workdays.filter((iso) => {
          const c = cells[`${e.id}__${iso}`]
          return c && c.status === 'OFFICE'
        })
        if (candidates.length > 0 && hardRestriction) {
          brokeRestriction = true
        }
      }

      if (candidates.length === 0) {
        addAlert('WARNING',
          `${e.name}: sin día disponible de trabajo en casa en la semana del ${week.weekId}.`,
          'NO_HOME_THIS_WEEK', { employeeId: e.id })
        continue
      }

      // Elegir la mejor fecha por scoring
      const subCtx = {
        absences, holidays, homeCountByDay, params, officeBaseAvailabilityByDay, officeHomeAssignmentsByDay,
        prevWeekHomeWeekday: prevWeekday[e.id],
        prevFridayHome: prevFriday[e.id],
      }
      let best = null
      let bestScore = Infinity
      for (const iso of candidates) {
        const s = scoreDateForEmployee(e, iso, subCtx) + seededTieBreaker(generationSeed, e.id, week.weekId, iso)
        if (s < bestScore) { bestScore = s; best = iso }
      }

      const key = `${e.id}__${best}`
      const cellAlerts = []
      if (brokeRestriction) {
        cellAlerts.push('Restricción individual no se pudo cumplir')
        addAlert('WARNING',
          `${e.name}: no se pudo respetar su restricción (${restrictionTypeFor(e)}) esta semana.`,
          'RESTRICTION_BROKEN', { employeeId: e.id, date: best })
      }
      cells[key] = { ...cells[key], status: 'HOME', source: 'AUTO', alerts: cellAlerts }
      registerHomeAssignment(e, best, homeCountByDay, officeHomeAssignmentsByDay)

      // Actualizar memoria de rotación
      const wd = weekdayKey(best)
      prevWeekday[e.id] = wd
      prevFriday[e.id] = wd === 'FRIDAY'
    }
  }

  balanceOfficeCapacity({ employees, cells, days, weeks, holidays, params, homeCountByDay, generationSeed, location: 'OFICINA_93', addAlert })
  balanceOfficeCapacity({ employees, cells, days, weeks, holidays, params, homeCountByDay, generationSeed, location: 'WEWORK', addAlert })

  const finalHomeCountByDay = rebuildHomeCountByDay(cells, days, employees)

  return {
    month, year, days,
    cells,
    weeks,
    homeCountByDay: finalHomeCountByDay,
    alerts,
  }
}
