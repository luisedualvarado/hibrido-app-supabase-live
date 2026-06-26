import React, { useState } from 'react'

const byName = (a, b) => a.name.localeCompare(b.name, 'es')

const empty = {
  name: '',
  discipline: 'ELE',
  role: 'Engineer',
  email: '',
  baseLocation: 'WEWORK',
  baseSeat: '',
  isActive: true,
  hybridApproved: true,
  isFloating: false,
  doubleHomeConsecutive: false,
  avoidConsecutiveHomeDays: false,
  hasCar: false,
  parkingEligible: false,
  restrictionType: 'NONE',
  restrictionEnabled: true,
  notes: '',
}

const LOCATION_LABELS = {
  WEWORK: 'WeWork',
  OFICINA_93: 'Oficina 93',
  REMOTO: 'Remoto',
}

const RESTRICTION_TYPES = [
  ['NONE', 'Sin restriccion'],
  ['FIXED_DAY', 'Dia fijo de TC'],
  ['EVEN_DAYS', 'Dias pares'],
  ['ODD_DAYS', 'Dias impares'],
  ['ALLOWED_DAYS', 'Dias permitidos'],
  ['NOT_ALLOWED_DAYS', 'Dias no permitidos'],
  ['SPECIAL', 'Restriccion aprobada'],
  ['PENDING', 'Pendiente por verificar'],
]

const RESTRICTION_LABELS = Object.fromEntries(RESTRICTION_TYPES)

function restrictionEnabled(employee) {
  return employee.restrictionEnabled !== false
}

function publicRestrictionLabel(employee) {
  if (!employee.restrictionType || employee.restrictionType === 'NONE') return 'Sin restriccion'
  return RESTRICTION_LABELS[employee.restrictionType] || employee.restrictionType
}

export default function People({ employees, setEmployees, onSaveEmployee, onDeleteEmployee, periodLabel = '' }) {
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('ALL')
  const [discipline, setDiscipline] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [flag, setFlag] = useState('ALL')
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const [columnFilters, setColumnFilters] = useState({
    name: '',
    baseSeat: '',
    discipline: 'ALL',
    location: 'ALL',
    active: 'ALL',
    hybrid: 'ALL',
    floating: 'ALL',
    doubleHome: 'ALL',
    avoidConsecutive: 'ALL',
    car: 'ALL',
    parking: 'ALL',
  })

  const disciplines = Array.from(new Set(employees.map((e) => e.discipline))).sort()
  const totals = {
    total: employees.length,
    active: employees.filter((e) => e.isActive).length,
    inactive: employees.filter((e) => !e.isActive).length,
    hybrid: employees.filter((e) => e.isActive && e.hybridApproved).length,
    noHybridOffice: employees.filter((e) => e.isActive && !e.hybridApproved && e.baseLocation !== 'REMOTO').length,
    wework: employees.filter((e) => e.isActive && e.baseLocation === 'WEWORK').length,
    office93: employees.filter((e) => e.isActive && e.baseLocation === 'OFICINA_93').length,
    remote: employees.filter((e) => e.baseLocation === 'REMOTO').length,
    floating: employees.filter((e) => e.isFloating).length,
    restrictions: employees.filter((e) => e.restrictionType && e.restrictionType !== 'NONE').length,
    doubleHome: employees.filter((e) => e.doubleHomeConsecutive).length,
    avoidConsecutive: employees.filter((e) => e.avoidConsecutiveHomeDays).length,
    car: employees.filter((e) => e.hasCar).length,
    parking: employees.filter((e) => e.parkingEligible).length,
  }
  const sortValue = (employee, key) => {
    if (key === 'location') return LOCATION_LABELS[employee.baseLocation] || employee.baseLocation
    if (key === 'baseSeat') return employee.baseSeat || ''
    if (key === 'active') return employee.isActive ? 1 : 0
    if (key === 'hybrid') return employee.hybridApproved ? 1 : 0
    if (key === 'floating') return employee.isFloating ? 1 : 0
    if (key === 'doubleHome') return employee.doubleHomeConsecutive ? 1 : 0
    if (key === 'avoidConsecutive') return employee.avoidConsecutiveHomeDays ? 1 : 0
    if (key === 'car') return employee.hasCar ? 1 : 0
    if (key === 'parking') return employee.parkingEligible ? 1 : 0
    return employee[key] || ''
  }
  const toggleSort = (key) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }
  const sortMark = (key) => sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''
  const updateColumnFilter = (key, value) => setColumnFilters((prev) => ({ ...prev, [key]: value }))
  const matchesYesNo = (value, filter) => filter === 'ALL' || (filter === 'YES' ? !!value : !value)

  const filtered = employees.filter((e) => {
    const text = `${e.name} ${e.email} ${e.role} ${e.discipline}`.toLowerCase()
    if (search && !text.includes(search.toLowerCase())) return false
    if (location !== 'ALL' && e.baseLocation !== location) return false
    if (discipline !== 'ALL' && e.discipline !== discipline) return false
    if (status === 'ACTIVE' && !e.isActive) return false
    if (status === 'INACTIVE' && e.isActive) return false
    if (status === 'HYBRID' && !e.hybridApproved) return false
    if (status === 'NO_HYBRID' && e.hybridApproved) return false
    if (flag === 'FLOATING' && !e.isFloating) return false
    if (flag === 'DOUBLE_HOME' && !e.doubleHomeConsecutive) return false
    if (flag === 'AVOID_CONSECUTIVE' && !e.avoidConsecutiveHomeDays) return false
    if (flag === 'CAR' && !e.hasCar) return false
    if (flag === 'PARKING' && !e.parkingEligible) return false
    if (columnFilters.name && !e.name.toLowerCase().includes(columnFilters.name.toLowerCase())) return false
    if (columnFilters.baseSeat && !String(e.baseSeat || '').toLowerCase().includes(columnFilters.baseSeat.toLowerCase())) return false
    if (columnFilters.discipline !== 'ALL' && e.discipline !== columnFilters.discipline) return false
    if (columnFilters.location !== 'ALL' && e.baseLocation !== columnFilters.location) return false
    if (!matchesYesNo(e.isActive, columnFilters.active)) return false
    if (!matchesYesNo(e.hybridApproved, columnFilters.hybrid)) return false
    if (!matchesYesNo(e.isFloating, columnFilters.floating)) return false
    if (!matchesYesNo(e.doubleHomeConsecutive, columnFilters.doubleHome)) return false
    if (!matchesYesNo(e.avoidConsecutiveHomeDays, columnFilters.avoidConsecutive)) return false
    if (!matchesYesNo(e.hasCar, columnFilters.car)) return false
    if (!matchesYesNo(e.parkingEligible, columnFilters.parking)) return false
    return true
  }).sort((a, b) => {
    const aValue = sortValue(a, sort.key)
    const bValue = sortValue(b, sort.key)
    const result = typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), 'es')
    return sort.direction === 'asc' ? result : -result
  })

  const save = (emp) => {
    if (onSaveEmployee) {
      onSaveEmployee(emp)
      setEditing(null)
      return
    }

    if (emp.id) {
      setEmployees((prev) => prev.map((employee) => {
        if (employee.id !== emp.id) return employee
        return {
          ...emp,
          nameOverride: emp.name !== employee.name ? true : employee.nameOverride,
        }
      }))
    }
    else {
      const id = (emp.name || 'persona').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)
      setEmployees((prev) => [...prev, { ...emp, id, nameOverride: true }])
    }
    setEditing(null)
  }

  const toggle = (id, field) =>
    setEmployees((prev) => prev.map((e) => {
      if (e.id !== id) return e
      return { ...e, [field]: !e[field] }
    }))

  const remove = (employee) => {
    const ok = window.confirm(`Eliminar a ${employee.name}? Esta accion tambien quitara sus ausencias, ajustes y asignaciones.`)
    if (ok) onDeleteEmployee(employee.id)
  }

  const clearFilters = () => {
    setSearch('')
    setLocation('ALL')
    setDiscipline('ALL')
    setStatus('ALL')
    setFlag('ALL')
    setColumnFilters({
      name: '',
      baseSeat: '',
      discipline: 'ALL',
      location: 'ALL',
      active: 'ALL',
      hybrid: 'ALL',
      floating: 'ALL',
      doubleHome: 'ALL',
      avoidConsecutive: 'ALL',
      car: 'ALL',
      parking: 'ALL',
    })
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="muted">
          {filtered.length} de {employees.length} personas · {employees.filter((e) => e.isActive && e.hybridApproved).length} en rotacion
        </span>
        <button className="btn btn-primary" onClick={() => setEditing(empty)}>+ Crear persona</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <MiniKpi label="Total personal" value={totals.total} />
        <MiniKpi label="Activos" value={totals.active} tone="green" />
        <MiniKpi label="Inactivos" value={totals.inactive} />
        <MiniKpi label="Hibrido aprobado" value={totals.hybrid} tone="green" />
        <MiniKpi label="Sin hibrido en oficina" value={totals.noHybridOffice} tone={totals.noHybridOffice ? 'amber' : ''} />
        <MiniKpi label="WeWork" value={totals.wework} />
        <MiniKpi label="Oficina 93 base" value={totals.office93} />
        <MiniKpi label="Remotos" value={totals.remote} />
        <MiniKpi label="Flotantes" value={totals.floating} />
        <MiniKpi label="Con condicion" value={totals.restrictions} />
        <MiniKpi label="2 TC por semana" value={totals.doubleHome} />
        <MiniKpi label="Evitan TC seguido" value={totals.avoidConsecutive} />
        <MiniKpi label="Con carro" value={totals.car} />
        <MiniKpi label="Elegibles parqueadero" value={totals.parking} />
      </div>

      <div className="filters">
        <div className="fg" style={{ minWidth: 240 }}>
          <label>Buscar</label>
          <input type="text" placeholder="Nombre, correo, rol..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="fg">
          <label>Ubicacion</label>
          <select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="ALL">Todas</option>
            <option value="WEWORK">WeWork</option>
            <option value="OFICINA_93">Oficina 93</option>
            <option value="REMOTO">Remoto</option>
          </select>
        </div>
        <div className="fg">
          <label>Disciplina</label>
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
            <option value="ALL">Todas</option>
            {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Estado</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">Todos</option>
            <option value="ACTIVE">Activos</option>
            <option value="INACTIVE">Inactivos</option>
            <option value="HYBRID">Hibrido aprobado</option>
            <option value="NO_HYBRID">Sin hibrido</option>
          </select>
        </div>
        <div className="fg">
          <label>Condicion</label>
          <select value={flag} onChange={(e) => setFlag(e.target.value)}>
            <option value="ALL">Todas</option>
            <option value="FLOATING">Flotantes</option>
            <option value="DOUBLE_HOME">2 TC por semana</option>
            <option value="AVOID_CONSECUTIVE">Sin TC seguido</option>
            <option value="CAR">Con carro</option>
            <option value="PARKING">Elegibles parqueadero</option>
          </select>
        </div>
        <div className="fg">
          <label>&nbsp;</label>
          <button className="btn btn-ghost" onClick={clearFilters}>Limpiar filtros</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th><button className="th-btn" onClick={() => toggleSort('name')}>Nombre{sortMark('name')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('baseSeat')}>Puesto {periodLabel}{sortMark('baseSeat')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('discipline')}>Disciplina{sortMark('discipline')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('location')}>Ubicacion{sortMark('location')}</button></th>
              <th>Condicion</th>
              <th><button className="th-btn" onClick={() => toggleSort('active')}>Activo{sortMark('active')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('hybrid')}>Hibrido{sortMark('hybrid')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('floating')}>Flotante{sortMark('floating')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('doubleHome')}>2 TC{sortMark('doubleHome')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('avoidConsecutive')}>No seguido{sortMark('avoidConsecutive')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('car')}>Carro{sortMark('car')}</button></th>
              <th><button className="th-btn" onClick={() => toggleSort('parking')}>Parqueadero{sortMark('parking')}</button></th>
              <th></th><th></th>
            </tr>
            <tr className="column-filter-row">
              <th><input className="col-filter" type="text" value={columnFilters.name} onChange={(e) => updateColumnFilter('name', e.target.value)} placeholder="Filtrar" /></th>
              <th><input className="col-filter" type="text" value={columnFilters.baseSeat} onChange={(e) => updateColumnFilter('baseSeat', e.target.value)} placeholder="Puesto" /></th>
              <th>
                <select className="col-filter" value={columnFilters.discipline} onChange={(e) => updateColumnFilter('discipline', e.target.value)}>
                  <option value="ALL">Todas</option>
                  {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </th>
              <th>
                <select className="col-filter" value={columnFilters.location} onChange={(e) => updateColumnFilter('location', e.target.value)}>
                  <option value="ALL">Todas</option>
                  <option value="WEWORK">WeWork</option>
                  <option value="OFICINA_93">Oficina 93</option>
                  <option value="REMOTO">Remoto</option>
                </select>
              </th>
              <th></th>
              <th><YesNoFilter value={columnFilters.active} onChange={(value) => updateColumnFilter('active', value)} /></th>
              <th><YesNoFilter value={columnFilters.hybrid} onChange={(value) => updateColumnFilter('hybrid', value)} /></th>
              <th><YesNoFilter value={columnFilters.floating} onChange={(value) => updateColumnFilter('floating', value)} /></th>
              <th><YesNoFilter value={columnFilters.doubleHome} onChange={(value) => updateColumnFilter('doubleHome', value)} /></th>
              <th><YesNoFilter value={columnFilters.avoidConsecutive} onChange={(value) => updateColumnFilter('avoidConsecutive', value)} /></th>
              <th><YesNoFilter value={columnFilters.car} onChange={(value) => updateColumnFilter('car', value)} /></th>
              <th><YesNoFilter value={columnFilters.parking} onChange={(value) => updateColumnFilter('parking', value)} /></th>
              <th></th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.baseSeat || '-'}</td>
                <td><span className="badge gray">{e.discipline}</span></td>
                <td>{LOCATION_LABELS[e.baseLocation] || e.baseLocation}</td>
                <td>
                  <span className={`badge ${restrictionEnabled(e) && e.restrictionType !== 'NONE' ? (e.restrictionType === 'PENDING' ? 'amber' : 'navy') : 'gray'}`}>
                    {publicRestrictionLabel(e)}
                  </span>
                </td>
                <td><Toggle on={e.isActive} onClick={() => toggle(e.id, 'isActive')} /></td>
                <td><Toggle on={e.hybridApproved} onClick={() => toggle(e.id, 'hybridApproved')} /></td>
                <td><Toggle on={e.isFloating} onClick={() => toggle(e.id, 'isFloating')} /></td>
                <td><Toggle on={!!e.doubleHomeConsecutive} onClick={() => toggle(e.id, 'doubleHomeConsecutive')} /></td>
                <td><Toggle on={!!e.avoidConsecutiveHomeDays} onClick={() => toggle(e.id, 'avoidConsecutiveHomeDays')} /></td>
                <td><Toggle on={e.hasCar} onClick={() => toggle(e.id, 'hasCar')} /></td>
                <td><Toggle on={e.parkingEligible} onClick={() => toggle(e.id, 'parkingEligible')} /></td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => setEditing(e)}>Editar</button></td>
                <td><button className="btn btn-sm btn-danger" onClick={() => remove(e)}>Eliminar</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={14} className="empty">No hay personas con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <EmployeeModal emp={editing} onClose={() => setEditing(null)} onSave={save} periodLabel={periodLabel} />}
    </div>
  )
}

function MiniKpi({ label, value, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

function Toggle({ on, onClick }) {
  return (
    <button className={`badge ${on ? 'green' : 'gray'}`} style={{ cursor: 'pointer', border: 'none' }} onClick={onClick}>
      {on ? 'Si' : 'No'}
    </button>
  )
}

function YesNoFilter({ value, onChange }) {
  return (
    <select className="col-filter" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="ALL">Todos</option>
      <option value="YES">Si</option>
      <option value="NO">No</option>
    </select>
  )
}

function EmployeeModal({ emp, onClose, onSave, periodLabel }) {
  const [f, setF] = useState(emp)
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-head"><h3>{emp.id ? 'Editar persona' : 'Nueva persona'}</h3><button className="x-btn" onClick={onClose}>x</button></div>
        <div className="modal-body">
          <div className="grid2" style={{ gap: 14 }}>
            <div className="field"><label>Nombre</label><input type="text" style={{ width: '100%' }} value={f.name} onChange={(e) => up('name', e.target.value)} /></div>
            <div className="field"><label>Email</label><input type="text" style={{ width: '100%' }} value={f.email} onChange={(e) => up('email', e.target.value)} /></div>
            <div className="field"><label>Disciplina</label><input type="text" style={{ width: '100%' }} value={f.discipline} onChange={(e) => up('discipline', e.target.value)} /></div>
            <div className="field"><label>Rol</label>
              <select style={{ width: '100%' }} value={f.role} onChange={(e) => up('role', e.target.value)}>
                <option>Engineer</option><option>BIM Technician</option>
              </select>
            </div>
            <div className="field"><label>Ubicacion base</label>
              <select style={{ width: '100%' }} value={f.baseLocation} onChange={(e) => up('baseLocation', e.target.value)}>
                <option value="WEWORK">WeWork</option>
                <option value="OFICINA_93">Oficina 93</option>
                <option value="REMOTO">Remoto</option>
              </select>
            </div>
            <div className="field"><label>Numero de puesto {periodLabel}</label><input type="text" style={{ width: '100%' }} value={f.baseSeat} onChange={(e) => up('baseSeat', e.target.value)} placeholder="Ej. 49" /></div>
            <div className="field"><label>Condicion / restriccion</label>
              <select style={{ width: '100%' }} value={f.restrictionType || 'NONE'} onChange={(e) => up('restrictionType', e.target.value)}>
                {RESTRICTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field"><label>Notas de condicion</label>
              <input type="text" style={{ width: '100%' }} value={f.notes || ''} onChange={(e) => up('notes', e.target.value)} />
            </div>
          </div>
          <div className="row" style={{ gap: 18, marginTop: 6 }}>
            <Check label="Activo" v={f.isActive} on={() => up('isActive', !f.isActive)} />
            <Check label="Hibrido aprobado" v={f.hybridApproved} on={() => up('hybridApproved', !f.hybridApproved)} />
            <Check label="Flotante" v={f.isFloating} on={() => up('isFloating', !f.isFloating)} />
            <Check label="Condicion habilitada" v={restrictionEnabled(f)} on={() => up('restrictionEnabled', !restrictionEnabled(f))} />
            <Check label="2 dias TC por semana" v={!!f.doubleHomeConsecutive} on={() => up('doubleHomeConsecutive', !f.doubleHomeConsecutive)} />
            <Check label="Evitar TC seguido" v={!!f.avoidConsecutiveHomeDays} on={() => up('avoidConsecutiveHomeDays', !f.avoidConsecutiveHomeDays)} />
            <Check label="Tiene carro" v={f.hasCar} on={() => up('hasCar', !f.hasCar)} />
            <Check label="Elegible parqueadero" v={f.parkingEligible} on={() => up('parkingEligible', !f.parkingEligible)} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(f)}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

function Check({ label, v, on }) {
  return (
    <label className="checkbox-row" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={v} onChange={on} /> {label}
    </label>
  )
}
