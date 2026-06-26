// parkingGenerator.js — asignación mensual de parqueaderos por rotación.
import { weekdayKey } from './dateUtils.js'
import { PHYSICAL_SEATS_BY_LOCATION } from './deskLayouts.js'
import { hasHardRestriction, isDateAllowedForEmployee, isFloatingSeatEligible, isRotationEligible, weeklyHomeTarget } from './rotationPolicy.js'

const BLOCKED_FLOATING_SEATS_BY_LOCATION = {
  WEWORK: new Set(['3']),
  OFICINA_93: new Set(),
}

// Historial simulado de meses previos para que la rotación arranque "justa".
// (Editable; refleja lo discutido: Johana/Gabriel, luego Pinto/Alvarado, etc.)
const ROTATION_SEED = ['jimenez-johana', 'garcia-gabriel', 'pinto-juan-felipe', 'alvarado-luis']

// Asigna los N parqueaderos del mes por rotación entre los elegibles con carro.
// monthIndex se usa para rotar la ventana de selección mes a mes.
export function assignParkingForMonth(ctx) {
  const { employees, params, monthIndex = 0, manualParking } = ctx
  if (manualParking && manualParking.length) {
    return manualParking.slice(0, params.parkingSpots)
  }
  const pool = employees
    .filter((e) => e.parkingEligible && e.isActive && e.baseLocation === 'WEWORK')
    .map((e) => e.id)
  if (pool.length === 0) return []

  // Orden base: primero el seed conocido, luego el resto por nombre.
  const ordered = [
    ...ROTATION_SEED.filter((id) => pool.includes(id)),
    ...pool.filter((id) => !ROTATION_SEED.includes(id)),
  ]
  // Rotación mensual: desplaza el inicio según el mes.
  const start = (monthIndex * params.parkingSpots) % ordered.length
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)]
  return rotated.slice(0, params.parkingSpots)
}

// Calcula el uso diario de parqueaderos: un asignado consume cupo solo si
// está presencial ese día (no en casa, vacaciones ni otra oficina).
export function parkingUsageByDay(schedule, assigned, employees, days) {
  const byEmp = Object.fromEntries(employees.map((e) => [e.id, e]))
  const usage = {}
  for (const iso of days) {
    let used = []
    for (const id of assigned) {
      const cell = schedule.cells[`${id}__${iso}`]
      if (!cell) continue
      const emp = byEmp[id]
      // Diego solo necesita parqueadero los viernes
      if (id === 'salazar-diego' && weekdayKey(iso) !== 'FRIDAY') continue
      if (cell.status === 'OFFICE' && emp.baseLocation === 'WEWORK') used.push(id)
    }
    usage[iso] = used
  }
  return usage
}

// seatAssignment.js — asignación diaria de puestos a flotantes.
// Los flotantes ocupan los puestos físicos libres de WeWork y Oficina 93.
export function assignFloatingSeats(schedule, employees, days, params, manualDeskAssignments = []) {
  const floaters = employees.filter(isFloatingSeatEligible)
  const activeEmployees = employees.filter((e) => e.isActive)
  const employeesById = Object.fromEntries(employees.map((employee) => [employee.id, employee]))
  const locationLabels = {
    WEWORK: 'WeWork',
    OFICINA_93: 'Oficina 93',
  }
  const compareSeat = (left, right) => String(left).localeCompare(String(right), 'es', { numeric: true })
  const alternateLocationFor = (location) => location === 'WEWORK' ? 'OFICINA_93' : 'WEWORK'
  const sortByName = (left, right) => left.name.localeCompare(right.name, 'es')
  const seatsByLocation = {
    WEWORK: [...PHYSICAL_SEATS_BY_LOCATION.WEWORK].sort(compareSeat),
    OFICINA_93: [...PHYSICAL_SEATS_BY_LOCATION.OFICINA_93].sort(compareSeat),
  }
  const configuredSeatLimit = (location) => {
    const configured = Number(location === 'OFICINA_93' ? params.seats93 : params.seatsWeWork)
    return Number.isFinite(configured) && configured >= 0 ? configured : seatsByLocation[location].length
  }
  const manualAssignmentsByDate = manualDeskAssignments.reduce((acc, assignment) => {
    if (!assignment?.date) return acc
    acc[assignment.date] = [...(acc[assignment.date] || []), assignment]
    return acc
  }, {})

  const result = {}   // iso -> { assigned: [{empId, seat, location}], unseated: [empId], freeSeats, byLocation }
  const alerts = []

  for (const iso of days) {
    const manualAssignmentsForDate = manualAssignmentsByDate[iso] || []
    const cell0 = schedule.cells[`${floaters[0]?.id}__${iso}`]
    if (!cell0 || cell0.status === 'NOT_APPLICABLE' || cell0.status === 'HOLIDAY') {
      result[iso] = {
        assigned: [],
        unseated: [],
        freeSeats: params.seatsWeWork,
        byLocation: {
          WEWORK: { availableSeats: seatsByLocation.WEWORK.slice(0, configuredSeatLimit('WEWORK')), assigned: [], unseated: [], occupiedSeats: [] },
          OFICINA_93: { availableSeats: seatsByLocation.OFICINA_93.slice(0, configuredSeatLimit('OFICINA_93')), assigned: [], unseated: [], occupiedSeats: [] },
        },
      }
      continue
    }
    const assigned = []
    const unseated = []
    const byLocation = {}

    for (const location of ['WEWORK', 'OFICINA_93']) {
      const blockedSeats = BLOCKED_FLOATING_SEATS_BY_LOCATION[location] || new Set()
      const presentRegularEmployees = activeEmployees
        .filter((employee) => !employee.isFloating && employee.baseLocation === location && employee.baseSeat)
        .filter((employee) => schedule.cells[`${employee.id}__${iso}`]?.status === 'OFFICE')
      const explicitOccupiedAssignments = []
      const explicitlyOccupiedSeats = new Set()

      presentRegularEmployees.forEach((employee) => {
        const seat = employee.baseSeat
        if (!seat || !seatsByLocation[location].includes(seat) || explicitlyOccupiedSeats.has(seat)) return
        explicitOccupiedAssignments.push({ empId: employee.id, seat, location, derived: false })
        explicitlyOccupiedSeats.add(seat)
      })

      const remainingInventory = seatsByLocation[location].filter((seat) => !explicitlyOccupiedSeats.has(seat))
      const derivedOccupiedAssignments = presentRegularEmployees
        .filter((employee) => !explicitlyOccupiedSeats.has(employee.baseSeat))
        .sort(sortByName)
        .map((employee, index) => {
          const seat = remainingInventory[index]
          if (!seat) return null
          return { empId: employee.id, seat, location, derived: true }
        })
        .filter(Boolean)

      const occupiedAssignments = [...explicitOccupiedAssignments, ...derivedOccupiedAssignments].sort((left, right) => compareSeat(left.seat, right.seat))
      const occupiedSeats = occupiedAssignments.map((assignment) => assignment.seat)

      const openSeatLimit = Math.max(0, configuredSeatLimit(location) - presentRegularEmployees.length)
      const availableSeats = seatsByLocation[location]
        .filter((seat) => !occupiedSeats.includes(seat) && !blockedSeats.has(seat))
        .slice(0, openSeatLimit)
      const remainingSeats = [...availableSeats]
      const presentFloaters = floaters
        .filter((employee) => employee.baseLocation === location)
        .filter((employee) => schedule.cells[`${employee.id}__${iso}`]?.status === 'OFFICE')
        .sort(sortByName)
      const pendingFloaters = [...presentFloaters]
      const manualAssignmentsForLocation = manualAssignmentsForDate.filter((assignment) => assignment.location === location)

      const locationAssigned = []
      const locationUnseated = []

      manualAssignmentsForLocation.forEach((assignment) => {
        const employeeIndex = pendingFloaters.findIndex((employee) => employee.id === assignment.employeeId)
        const seatIndex = remainingSeats.indexOf(assignment.seat)
        if (employeeIndex === -1 || seatIndex === -1) {
          alerts.push({
            id: `manual-desk-${location}-${iso}-${alerts.length}`,
            severity: 'INFO',
            date: iso,
            message: `${iso}: ajuste manual de puesto no aplicado en ${locationLabels[location]}.`,
            rule: 'MANUAL_DESK_SKIPPED',
            location,
            employeeId: assignment.employeeId,
          })
          return
        }

        const manualAssignment = {
          empId: assignment.employeeId,
          seat: assignment.seat,
          location,
          alt: false,
          manual: true,
        }
        assigned.push(manualAssignment)
        locationAssigned.push(manualAssignment)
        pendingFloaters.splice(employeeIndex, 1)
        remainingSeats.splice(seatIndex, 1)
      })

      pendingFloaters.forEach((employee) => {
        const seat = remainingSeats.shift()
        if (seat) {
          const automaticAssignment = { empId: employee.id, seat, location, alt: false, manual: false }
          assigned.push(automaticAssignment)
          locationAssigned.push(automaticAssignment)
          return
        }
        unseated.push(employee.id)
        locationUnseated.push(employee.id)
      })

      byLocation[location] = {
        availableSeats,
        openSeats: remainingSeats,
        assigned: locationAssigned,
        unseated: locationUnseated,
        occupiedSeats,
        occupiedAssignments,
      }
    }

    for (const location of ['WEWORK', 'OFICINA_93']) {
      const alternateLocation = alternateLocationFor(location)
      const sourceUnseated = [...byLocation[location].unseated]
      const alternateOpenSeats = [...byLocation[alternateLocation].openSeats]
      if (sourceUnseated.length === 0 || alternateOpenSeats.length === 0) continue

      const reassigned = []
      sourceUnseated.forEach((employeeId) => {
        const seat = alternateOpenSeats.shift()
        if (!seat) return
        const alternateAssignment = {
          empId: employeeId,
          seat,
          location: alternateLocation,
          alt: true,
          manual: false,
        }
        assigned.push(alternateAssignment)
        byLocation[alternateLocation].assigned.push(alternateAssignment)
        reassigned.push(employeeId)
        alerts.push({
          id: `floater-alt-${employeeId}-${iso}`,
          severity: 'INFO',
          date: iso,
          message: `${iso}: ${employeesById[employeeId]?.name || employeeId} usa un puesto libre en ${locationLabels[alternateLocation]}.`,
          rule: 'FLOATER_ALT_SEAT',
          location: alternateLocation,
          employeeId,
        })
      })

      byLocation[alternateLocation].openSeats = alternateOpenSeats
      byLocation[location].unseated = byLocation[location].unseated.filter((employeeId) => !reassigned.includes(employeeId))
    }

    const unresolvedUnseated = ['WEWORK', 'OFICINA_93'].flatMap((location) => byLocation[location].unseated)

    for (const location of ['WEWORK', 'OFICINA_93']) {
      if (byLocation[location].unseated.length > 0) {
        alerts.push({
          id: `floater-${location}-${iso}`,
          severity: 'WARNING',
          date: iso,
          message: `${iso}: ${byLocation[location].unseated.length} flotante(s) sin puesto disponible en ${locationLabels[location]}.`,
          rule: 'FLOATER_NO_SEAT',
          location,
        })
      }
    }

    result[iso] = {
      assigned,
      unseated: unresolvedUnseated,
      freeSeats: byLocation.WEWORK.availableSeats.length,
      byLocation,
      assignedByEmp: Object.fromEntries(assigned.map((entry) => [entry.empId, { seat: entry.seat, location: entry.location, manual: entry.manual, alt: entry.alt }])),
      employeesById,
    }
  }
  return { result, alerts }
}

// applyManualOverrides — fuerza estados manuales sobre el schedule.
export function applyManualOverrides(schedule, manualOverrides, employees = [], params = {}) {
  const cells = { ...schedule.cells }
  const employeesById = Object.fromEntries(employees.map((employee) => [employee.id, employee]))
  const alerts = [...(schedule.alerts || [])]
  const officeCount = (date, location) => employees.filter((employee) =>
    employee.baseLocation === location && cells[`${employee.id}__${date}`]?.status === 'OFFICE'
  ).length
  for (const ov of manualOverrides) {
    const key = `${ov.employeeId}__${ov.date}`
    if (!cells[key]) continue
    if (['VACATION', 'ABSENCE', 'HOLIDAY'].includes(cells[key].status)) continue
    const employee = employeesById[ov.employeeId]
    if (ov.status === 'HOME' && employee) {
      const week = schedule.weeks?.find((item) => item.workdays.includes(ov.date))
      const currentStatus = cells[key].status
      const homeDays = week?.workdays.filter((date) => cells[`${employee.id}__${date}`]?.status === 'HOME').length || 0
      const projectedHomeDays = homeDays + (currentStatus === 'HOME' ? 0 : 1)
      let message = ''
      let rule = ''
      if (!isRotationEligible(employee)) {
        message = `${employee.name}: ajuste a TC no aplicado porque no tiene plan hibrido aprobado.`
        rule = 'MANUAL_HOME_NOT_APPROVED'
      } else if (hasHardRestriction(employee) && !isDateAllowedForEmployee(employee, ov.date)) {
        message = `${employee.name}: ajuste a TC no aplicado porque rompe su restriccion.`
        rule = 'MANUAL_HOME_RESTRICTION'
      } else if (!week || projectedHomeDays > weeklyHomeTarget(employee)) {
        message = `${employee.name}: ajuste a TC no aplicado porque supera sus dias TC semanales.`
        rule = 'MANUAL_HOME_LIMIT'
      }
      if (message) {
        alerts.push({ id: `${rule}-${alerts.length}`, severity: 'CRITICAL', date: ov.date, employeeId: ov.employeeId, message, rule })
        continue
      }
    }
    if (ov.status === 'OFFICE' && employee && ['WEWORK', 'OFICINA_93'].includes(employee.baseLocation)) {
      const seats = Number(employee.baseLocation === 'OFICINA_93' ? params.seats93 : params.seatsWeWork) || 0
      const currentStatus = cells[key].status
      const currentOfficeCount = officeCount(ov.date, employee.baseLocation)
      const projectedOfficeCount = currentStatus === 'OFFICE' ? currentOfficeCount : currentOfficeCount + 1
      if (seats > 0 && projectedOfficeCount > seats) {
        alerts.push({
          id: `manual-capacity-${alerts.length}`,
          severity: 'WARNING',
          date: ov.date,
          employeeId: ov.employeeId,
          message: `${employee.name}: ajuste manual a oficina no aplicado porque genera sobrecupo.`,
          rule: 'MANUAL_OFFICE_OVER_CAPACITY_SKIPPED',
        })
        continue
      }
    }
    cells[key] = {
      ...cells[key],
      status: ov.status,
      source: 'MANUAL',
      alerts: [...(cells[key].alerts || []), 'Ajuste manual aplicado'],
    }
  }
  return { ...schedule, cells, alerts }
}
