// initialHolidays.js
// Festivos de Colombia (precargados como ejemplo, editables desde la app).
// Fechas en formato YYYY-MM-DD.

export const initialHolidays2026 = [
  { date: '2026-01-01', name: 'Año Nuevo' },
  { date: '2026-01-12', name: 'Día de los Reyes Magos' },
  { date: '2026-03-23', name: 'Día de San José' },
  { date: '2026-04-02', name: 'Jueves Santo' },
  { date: '2026-04-03', name: 'Viernes Santo' },
  { date: '2026-05-01', name: 'Día del Trabajo' },
  { date: '2026-05-18', name: 'Día de la Ascensión' },
  { date: '2026-06-08', name: 'Corpus Christi' },
  { date: '2026-06-15', name: 'Sagrado Corazón' },
  { date: '2026-06-29', name: 'San Pedro y San Pablo' },
  { date: '2026-07-20', name: 'Día de la Independencia' },
  { date: '2026-08-07', name: 'Batalla de Boyacá' },
  { date: '2026-08-17', name: 'Asunción de la Virgen' },
  { date: '2026-10-12', name: 'Día de la Raza' },
  { date: '2026-11-02', name: 'Día de Todos los Santos' },
  { date: '2026-11-16', name: 'Independencia de Cartagena' },
  { date: '2026-12-08', name: 'Día de la Inmaculada Concepción' },
  { date: '2026-12-25', name: 'Navidad' },
]

export const initialHolidays = [...initialHolidays2026]

export const defaultParameters = {
  seatsWeWork: 36,
  seats93: 11,
  lockers: 36,
  parkingSpots: 3,
}

export const initialAbsences = [
  // Ejemplo editable. type: VACATION | ABSENCE | PERMISSION
  // { employeeId: 'cardenas-jaime', startDate: '2026-06-10', endDate: '2026-06-12', type: 'VACATION', notes: '' },
  { employeeId: 'gallo-ana-maria', startDate: '2026-05-29', endDate: '2026-06-26', type: 'VACATION', notes: '' },
  { employeeId: 'gonzalez-julian', startDate: '2026-06-04', endDate: '2026-06-15', type: 'VACATION', notes: '' },
  { employeeId: 'lancheros-rafael', startDate: '2026-06-09', endDate: '2026-06-23', type: 'VACATION', notes: '' },
  { employeeId: 'desalvador-diego', startDate: '2026-06-19', endDate: '2026-07-03', type: 'VACATION', notes: '' },
]
