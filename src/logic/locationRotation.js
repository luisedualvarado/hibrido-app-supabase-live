// locationRotation.js - rotacion mensual de puestos de Oficina 93.

const FLOATING_SEAT_PRIORITY = ['pinto-juan-felipe', 'vera-steven']

function orderedPool(employees) {
  return employees
    .filter((e) => e.isActive && e.baseLocation !== 'REMOTO')
    .sort((a, b) => {
      const aPriority = FLOATING_SEAT_PRIORITY.indexOf(a.id)
      const bPriority = FLOATING_SEAT_PRIORITY.indexOf(b.id)
      if (aPriority !== -1 || bPriority !== -1) {
        if (aPriority === -1) return 1
        if (bPriority === -1) return -1
        return aPriority - bPriority
      }
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
