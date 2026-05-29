// initialEmployees.js
// Datos derivados del Excel "Rotacion ME&I - Piloto trabajo en Casa" y de la
// transcripción "Plan Híbrido". Los campos son editables desde la app.
//
// Convenciones:
//  - baseLocation: "WEWORK" | "OFICINA_93" | "REMOTO"
//  - restrictionType: NONE | FIXED_DAY | EVEN_DAYS | ODD_DAYS | ALLOWED_DAYS |
//                     NOT_ALLOWED_DAYS | SPECIAL | PENDING
//  - Solo entran a la generación automática los que están isActive && hybridApproved.
//  - "Remoto" en el Excel se modela como inactivo en el híbrido (no rota en oficina).
//
// Etiquetas de privacidad: nunca se exponen detalles médicos. Las condiciones
// especiales se muestran solo como "Restricción aprobada" / "Condición especial".

const FLOATERS = [
  'González, Julian',
  'Dulce, Camilo',
  'Fuentes, Andres',
  'Gallo, Ana Maria',
  'Pinto, Juan Felipe',
  'Arenas, Juan',
  'Jimenez, Johana',
  'Vera, Steven',
  'Valdez, Lianeth Carolina',
  'Salazar, Diego',
  'Cortes, German',
]

const CARS = [
  'Alvarado, Luis',
  'Jimenez, Johana',
  'Garcia, Gabriel',
  'Pinto, Juan Felipe',
  'Salazar, Diego',
  'Cardenas, Jaime',
]

// id, name, role, email, team(letra), subdiscipline, oficina/remoto del Excel
const RAW = [
  [1, 'Achury, Ashly', 'BIM Technician', 'Ashly.Achury@aecom.com', 'H', 'HVAC', 'Oficina'],
  [2, 'Almeida, Daniel', 'Engineer', 'daniel.almeida@aecom.com', 'E', 'ELE', 'Oficina'],
  [3, 'Alvarado, Luis', 'Engineer', 'Luis.Alvarado@aecom.com', 'E', 'ELE', 'Oficina'],
  [4, 'Arbelaez, Luis', 'Engineer', 'luis.arbelaez@aecom.com', 'I', 'FADS', 'Remoto'],
  [5, 'Arenas, Juan', 'BIM Technician', 'juan.arenas1@aecom.com', 'H', 'HVAC', 'Oficina'],
  [6, 'Bejarano, Fernando', 'Engineer', 'fernando.bejarano@aecom.com', 'E', 'ELE', 'Oficina'],
  [7, 'Bello, Astrid', 'Engineer', 'astrid.bello@aecom.com', 'E', 'ELE', 'Oficina'],
  [8, 'Bohorquez, Samuel', 'BIM Technician', 'samuel.f.bohorquez@aecom.com', 'E', 'ELE', 'Oficina'],
  [9, 'Buitrago, Lisseth', 'BIM Technician', 'lisseth.buitrago@aecom.com', 'I', 'FADS', 'Remoto'],
  [10, 'Camargo, Jessel', 'Engineer', 'jessel.camargo@aecom.com', 'I', 'COM', 'Oficina'],
  [11, 'Cárdenas, Andrés Felipe', 'Engineer', 'andres.f.cardenas@aecom.com', 'E', 'ELE', 'Oficina'],
  [12, 'Cardenas, Jaime', 'Engineer', 'jaime.cardenas@aecom.com', 'I', 'COORD', 'Oficina'],
  [13, 'Cortes, German', 'Engineer', 'german.cortes@aecom.com', 'I', 'SEG', 'Oficina'],
  [14, 'Daza, Santiago', 'Engineer', 'santiago.daza@aecom.com', 'E', 'ELE', 'Oficina'],
  [15, 'Desalvador, Diego', 'Engineer', 'diego.desalvador@aecom.com', 'E', 'ELE', 'Oficina'],
  [16, 'Dulce, Camilo', 'BIM Technician', 'camilo.dulce@aecom.com', 'E', 'ELE', 'Oficina'],
  [17, 'Escobar, Andrea', 'BIM Technician', 'andrea.escobar@aecom.com', 'H', 'HVAC', 'Oficina'],
  [18, 'Escobar, Andrés', 'Engineer', 'andres.escobar@aecom.com', 'E', 'ELE', 'Oficina'],
  [19, 'Fuentes, Andres', 'Engineer', 'andres.fuentes@aecom.com', 'LIDER', 'COORD', 'Oficina'],
  [20, 'Gallo, Ana Maria', 'BIM Technician', 'anamaria.gallo@aecom.com', 'E', 'ELE', 'Oficina'],
  [21, 'Garcia, Gabriel', 'Engineer', 'gabriel.garcia@aecom.com', 'I', 'COM', 'Oficina'],
  [22, 'Giraldo, Nelson', 'BIM Technician', 'nelson.giraldo@aecom.com', 'E', 'ELE', 'Oficina'],
  [23, 'Gomez, John', 'Engineer', 'john.gomez@aecom.com', 'I', 'COM', 'Remoto'],
  [24, 'González, Julian', 'Engineer', 'julian.j.gonzalez@aecom.com', 'E', 'COORD', 'Oficina'],
  [25, 'Gonzalez, Luis', 'Engineer', 'luis.gonzalez@aecom.com', 'H', 'HVAC', 'Oficina'],
  [26, 'Guevara, Luis', 'Engineer', 'luis.guevara@aecom.com', 'E', 'ELE', 'Oficina'],
  [27, 'Guevara, Marylin', 'BIM Technician', 'marylin.guevara@aecom.com', 'E', 'ELE', 'Oficina'],
  [28, 'Hernandez, Ivonne', 'BIM Technician', 'ivonne.hernandez@aecom.com', 'I', 'COM', 'Oficina'],
  [29, 'Hilario, Martin', 'Engineer', 'martin.hilario@aecom.com', 'I', 'SEG', 'Oficina'],
  [30, 'Jimenez, Johana', 'Engineer', 'johana.jimenez@aecom.com', 'I', 'COORD', 'Oficina'],
  [31, 'Lancheros, Rafael', 'Engineer', 'rafael.lancheros@aecom.com', 'E', 'ELE', 'Oficina'],
  [32, 'Latorre, Juan Camilo', 'BIM Technician', 'juan.latorre@aecom.com', 'E', 'ELE', 'Oficina'],
  [33, 'Lizarazo, David', 'Engineer', 'jesus.lizarazo@aecom.com', 'H', 'COORD', 'Remoto'],
  [34, 'Molina, Jessica', 'BIM Technician', 'jessica.molina2@aecom.com', 'E', 'ELE', 'Oficina'],
  [35, 'Morales, Fabio', 'Engineer', 'fabio.morales@aecom.com', 'E', 'ELE', 'Oficina'],
  [36, 'Morales, Jonathan', 'BIM Technician', 'jonathan.morales@aecom.com', 'E', 'ELE', 'Oficina'],
  [37, 'Munoz, Cesar', 'Engineer', 'cesar.munoz@aecom.com', 'I', 'FADS', 'Remoto'],
  [38, 'Niño, Samuel', 'Engineer', 'samuel.nino@aecom.com', 'E', 'ELE', 'Oficina'],
  [39, 'Ochoa, Rafael', 'Engineer', 'rafael.ochoa@aecom.com', 'I', 'FADS', 'Oficina'],
  [40, 'Olea, David', 'BIM Technician', 'david.olea@aecom.com', 'I', 'COM', 'Oficina'],
  [41, 'Ortiz, Miller', 'Engineer', 'miller.ortiz@aecom.com', 'I', 'COORD', 'Remoto'],
  [42, 'Pacheco, Catalina', 'BIM Technician', 'catalina.pacheco@aecom.com', 'E', 'ELE', 'Remoto'],
  [43, 'Pinto, Juan Felipe', 'Engineer', 'juan.pinto@aecom.com', 'H', 'HVAC', 'Oficina'],
  [44, 'Plazas, Paula', 'BIM Technician', 'paula.plazas@aecom.com', 'I', 'SEG', 'Oficina'],
  [45, 'Quintero, Brayan', 'BIM Technician', 'brayan.quintero@aecom.com', 'I', 'SEG', 'Oficina'],
  [46, 'Quiroz Millan, Juan', 'BIM Technician', 'juan.quirozmillan@aecom.com', 'I', 'COM', 'Oficina'],
  [47, 'Rodriguez, Francisco', 'BIM Technician', 'francisco.rodriguez@aecom.com', 'I', 'FADS', 'Remoto'],
  [48, 'Rojas, Camilo', 'Engineer', 'camilo.rojas@aecom.com', 'E', 'ELE', 'Oficina'],
  [49, 'Salazar, Diego', 'Engineer', 'diego.salazar1@aecom.com', 'I', 'COORD', 'Oficina'],
  [50, 'Sierra, Ivan', 'Engineer', 'ivan.sierra@aecom.com', 'H', 'HVAC', 'Remoto'],
  [51, 'Tarazona, Elkin', 'Engineer', 'elkin.tarazona@aecom.com', 'I', 'COM', 'Oficina'],
  [52, 'Tibocha, Jhonattan', 'Engineer', 'jhonattan.tibocha@aecom.com', 'E', 'ELE', 'Oficina'],
  [53, 'Valdez, Lianeth Carolina', 'Engineer', 'lianethcarolina.valdez@aecom.com', 'I', 'SEG', 'Oficina'],
  [54, 'Vanegas, Kaory', 'Engineer', 'kaory.vanegas@aecom.com', 'E', 'ELE', 'Oficina'],
  [55, 'Vargas, Camilo', 'BIM Technician', 'camilo.vargasrivera@aecom.com', 'I', 'FADS', 'Remoto'],
  [56, 'Velosa, Over', 'Engineer', 'andrey.velosa@aecom.com', 'E', 'ELE', 'Oficina'],
  [57, 'Vera, Steven', 'Engineer', 'steven.vera@aecom.com', 'H', 'HVAC', 'Oficina'],
  [58, 'Contreras, Julian', 'Engineer', 'julian.contreras@aecom.com', 'H', 'HVAC', 'Oficina'],
  [59, 'Rodriguez, Sofia', 'BIM Technician', 'sofia.rodriguez@aecom.com', 'E', 'ELE', 'Oficina'],
  [60, 'Barboza, Liset', 'BIM Technician', 'Lizet.barbosa@aecom.com', 'H', 'HVAC', 'Oficina'],
  [61, 'Teheran, Gabriel', 'Engineer', 'gabriel.teheran@aecom.com', 'H', 'HVAC', 'Oficina'],
]

// Restricciones individuales confirmadas en la transcripción del Plan Híbrido.
// clave = name del Excel
const RESTRICTIONS = {
  'Escobar, Andrea':       { restrictionType: 'ODD_DAYS', notes: 'Regla individual aprobada (movilidad).' },
  'Cardenas, Jaime':       { restrictionType: 'EVEN_DAYS', special: true, notes: 'Condición especial + pico y placa. Parqueadero si está asignado.' },
  'Hernandez, Ivonne':     { restrictionType: 'ODD_DAYS', notes: 'Condición especial aprobada.' },
  'Jimenez, Johana':       { restrictionType: 'EVEN_DAYS', notes: 'Regla individual aprobada.' },
  'Morales, Jonathan':     { restrictionType: 'FIXED_DAY', fixedDay: 'THURSDAY', notes: 'Día fijo aprobado (formación).' },
  'Escobar, Andrés':       { restrictionType: 'FIXED_DAY', fixedDay: 'WEDNESDAY', notes: 'Día fijo aprobado (estudios).' },
  'Hilario, Martin':       { restrictionType: 'FIXED_DAY', fixedDay: 'WEDNESDAY', notes: 'Día fijo aprobado.' },
  'Rodriguez, Sofia':      { restrictionType: 'PENDING', notes: 'Pendiente por verificar (¿lunes? día SENA).' },
  'Salazar, Diego':        { restrictionType: 'ALLOWED_DAYS', allowedDays: ['TUESDAY', 'WEDNESDAY'], notes: 'Solo necesita parqueadero los viernes.' },
  'Camargo, Jessel':       { restrictionType: 'SPECIAL', special: true, notes: 'Restricción aprobada (compensado).' },
  'Giraldo, Nelson':       { restrictionType: 'NONE' },
  'Guevara, Luis':         { restrictionType: 'NONE' },
  'Desalvador, Diego':     { restrictionType: 'NONE' },
}

const DAY_TO_WEEKDAY = (name) => RESTRICTIONS[name] || { restrictionType: 'NONE' }

function slugId(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export const initialEmployees = RAW.map(([item, name, role, email, team, sub, mode]) => {
  const r = DAY_TO_WEEKDAY(name)
  const isRemote = mode === 'Remoto'
  const isFloating = FLOATERS.includes(name)
  const hasCar = CARS.includes(name)
  return {
    id: slugId(name),
    item,
    name,
    role,                       // Engineer | BIM Technician
    email,
    discipline: sub,            // HVAC, ELE, COM, SEG, FADS, COORD
    team,                       // H, E, I, LIDER
    baseLocation: isRemote ? 'REMOTO' : 'WEWORK',
    baseSeat: '',
    isActive: !isRemote,        // Remotos quedan inactivos en el híbrido
    hybridApproved: !isRemote,  // Julian González: sin aprobación (caso del transcript)
    isFloating,
    doubleHomeConsecutive: false,
    avoidConsecutiveHomeDays: false,
    hasCar,
    parkingEligible: hasCar,
    restrictionType: r.restrictionType || 'NONE',
    restrictionEnabled: r.restrictionEnabled !== false,
    fixedDay: r.fixedDay,
    allowedDays: r.allowedDays,
    notAllowedDays: r.notAllowedDays,
    special: !!r.special,
    notes: r.notes || '',
  }
})

// Caso confirmado en transcript: Julián González no tiene híbrido aprobado.
const julian = initialEmployees.find((e) => e.id === 'gonzalez-julian')
if (julian) { julian.hybridApproved = false; julian.notes = 'Sin aprobación de híbrido (no rota).' }
