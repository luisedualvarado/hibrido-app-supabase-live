// locationRotation.js - rotacion mensual de puestos de Oficina 93.

const MONTHLY_FLOATING_BY_PERIOD = {
  '2026-6': {
    OFICINA_93: ['garcia-gabriel', 'quiroz-millan-juan'],
  },
}

export function applyMonthlyFloatingAssignment(employees, { year, month, office93Assigned = [] }) {
  const period = MONTHLY_FLOATING_BY_PERIOD[`${year}-${month}`]
  if (!period) return employees
  const office93Floaters = new Set(period.OFICINA_93 || [])
  const office93AssignedSet = new Set(office93Assigned)

  return employees.map((employee) => {
    const isOffice93Floater = office93Floaters.has(employee.id) && office93AssignedSet.has(employee.id)
    if (!isOffice93Floater) return employee
    return {
      ...employee,
      isFloating: true,
      monthlyFloatingLocation: 'OFICINA_93',
    }
  })
}

function orderedPool(employees) {
  return employees
    .filter((e) => e.isActive && e.baseLocation !== 'REMOTO')
    .sort((a, b) => {
      if (a.discipline === b.discipline) return a.name.localeCompare(b.name, 'es')
      return a.discipline.localeCompare(b.discipline, 'es')
    })
}

export function assignOffice93ForMonth({ employees, params, monthIndex = 0, manualOffice93 = [] }) {
  const seats = Math.max(0, Number(params.seats93) || 0)
  if (seats === 0) return []
  const pool = orderedPool(employees)
  const eligibleIds = new Set(pool.map((e) => e.id))
  if (manualOffice93 && manualOffice93.length) {
    return Array.from(new Set(manualOffice93)).filter((id) => eligibleIds.has(id))
  }
  if (pool.length === 0) return []

  const start = (monthIndex * seats) % pool.length
  const rotated = [...pool.slice(start), ...pool.slice(0, start)]
  return rotated.slice(0, seats).map((e) => e.id)
}

export function applyOffice93Assignment(employees, office93Assigned) {
  const assigned = new Set(office93Assigned)
  return employees.map((employee) => {
    if (!employee.isActive || employee.baseLocation === 'REMOTO') {
      return { ...employee, monthlyOffice93Assigned: false }
    }
    return {
      ...employee,
      baseLocation: assigned.has(employee.id) ? 'OFICINA_93' : 'WEWORK',
      monthlyOffice93Assigned: assigned.has(employee.id),
    }
  })
}
