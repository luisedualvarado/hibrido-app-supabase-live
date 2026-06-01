# Rotación Híbrida · Equipo ME&I (AECOM)

Prototipo funcional (SPA en React + Vite, sin backend) para gestionar la
programación mensual de trabajo híbrido del equipo de ingeniería ME&I.
Reemplaza el Excel de rotación con asignación automática de días de trabajo en
casa, control de puestos en WeWork / Oficina 93, rotación de parqueaderos y
asignación de puestos a personal flotante.

Los datos viven en memoria (estados de React). Puedes **exportar/importar JSON**
para conservar una configuración entre sesiones, y exportar CSV de programación,
resumen diario y alertas.

En el build público, la app abre en modo lectura. El sidebar incluye un acceso
admin para desbloquear el resto de pestañas con las credenciales definidas en
`VITE_ADMIN_USERNAME` y `VITE_ADMIN_PASSWORD`.

## Cómo correrlo

```bash
npm install
npm run dev      # abre el servidor de desarrollo (http://localhost:5173)
npm run build    # build de producción en /dist
npm run preview  # sirve el build
```

Requisitos: Node 18+.

## Acceso admin

Por defecto, tanto en desarrollo como en producción se crean estas
credenciales:

```bash
usuario: admin
contrasena: admin123
```

Si vas a publicar el sitio, cambia esos valores en `.env.production`. Ten en
cuenta que esta proteccion es solo del lado del cliente: sirve para ocultar y
desbloquear la interfaz, no reemplaza autenticacion real con backend.

## Crear el proyecto desde cero (si lo necesitas)

```bash
npm create vite@latest rotacion-hibrida -- --template react
cd rotacion-hibrida
# reemplaza /src y package.json por los de este proyecto
npm install
npm run dev
```

## Arquitectura

```
src/
  App.jsx                  Orquesta el estado global y el cálculo (useMemo).
  main.jsx                 Punto de entrada React.
  styles.css               Diseño corporativo (azul oscuro / verde / ámbar / rojo).
  data/
    initialEmployees.js    61 personas reales tomadas del Excel + restricciones
                           confirmadas en la transcripción del Plan Híbrido.
    initialHolidays.js     Festivos de Colombia 2026 y parámetros por defecto.
  logic/                   Lógica pura, sin React (testeable de forma aislada):
    dateUtils.js           Días del mes, semanas laborales, festivos, fin de semana.
    scheduleGenerator.js   Algoritmo principal de asignación de TC con scoring.
    parkingGenerator.js    Parqueaderos por rotación + puestos de flotantes + overrides.
    validators.js          Validaciones, resumen diario y KPIs del dashboard.
    exporters.js           CSV / JSON e importación.
  components/
    Shared.jsx             Sidebar, KpiCard, AlertList.
    Dashboard.jsx          KPIs, barras por día, semáforo, alertas.
    MonthlySchedule.jsx    Matriz empleado × día + modal de ajuste manual.
    DailyView.jsx          Operación diaria (presentes, flotantes, parqueaderos).
    People.jsx             ABM de personas.
    Restrictions.jsx       Edición de restricciones individuales.
    Panels.jsx             Ausencias, Festivos, Parqueaderos, Ajustes, Config, Export.
```

El estado completo está en `App.jsx`. Toda la programación se recalcula en un
único `useMemo` que depende de los datos de entrada; el botón **Generar
programación** fuerza un recálculo y **Limpiar ajustes** elimina los overrides
manuales.

## El algoritmo (resumen)

`generateMonthlySchedule()` es heurístico, no un solver exacto:

1. Construye el esqueleto de celdas: fines de semana → `NO_APLICA`, festivos →
   `FES`, vacaciones/ausencias → `VAC`/`AUS`, inactivos/sin híbrido → `NA`.
2. Agrupa los días hábiles por **semana laboral** (lunes a viernes; el viernes
   entra en la rotación, como se acordó para junio).
3. Por cada semana asigna **1 día de trabajo en casa** a cada persona elegible
   (activa + híbrido aprobado), ordenando primero a quienes tienen restricciones
   más rígidas (menos opciones).
4. Elige el día con **menor puntaje** (`scoreDateForEmployee`):
   - Penaliza fuerte: festivo, vacaciones, ausencia, día no permitido, cupo del
     día alcanzado, repetir el mismo día de la semana anterior, lunes tras
     viernes en casa.
   - Bonifica: cumplir la restricción individual, balancear la carga diaria,
     mantener los puestos libres de WeWork en el rango objetivo.
5. Aplica un **filtro de capacidad duro**: solo se asigna a días bajo el máximo;
   si ningún día tiene cupo se fuerza con alerta crítica (o se omite en semanas
   de 1 solo día hábil para no apilar a todos).
6. Después se aplican los **ajustes manuales**, se asignan parqueaderos por
   rotación mensual, se reparten puestos a flotantes y se recalculan resumen y
   alertas.

> Nota real de capacidad: el equipo activo con híbrido supera el máximo de 9
> personas/día. El prototipo **no oculta** esa tensión: la refleja en las alertas
> y KPIs (días con sobrecupo), igual que ocurría en el archivo original cuando
> "no alcanzaban los puestos". Ajusta `Máx. en casa/día`, marca gente como
> Oficina 93 o desactiva personas para verlo balancearse.

## Reglas individuales precargadas (editables en la app)

| Persona            | Regla                          | Fuente |
|--------------------|--------------------------------|--------|
| Escobar, Andrea    | Días impares                   | transcript |
| Cardenas, Jaime    | Días pares + condición especial / pico y placa | transcript |
| Hernandez, Ivonne  | Días impares (condición aprobada) | transcript |
| Jimenez, Johana    | Días pares                     | transcript |
| Morales, Jonathan  | Jueves fijo                    | transcript |
| Escobar, Andrés    | Miércoles fijo                 | transcript |
| Hilario, Martin    | Miércoles fijo                 | transcript |
| Rodriguez, Sofia   | **Pendiente por verificar**    | transcript |
| Salazar, Diego     | Martes/Miércoles; parqueadero solo viernes | transcript |
| Camargo, Jessel    | Restricción aprobada (sin detalle) | transcript |
| Giraldo, Nelson / Guevara, Luis / Desalvador, Diego | Sin restricción | transcript |

Las condiciones médicas/personales **nunca** se muestran: solo etiquetas neutras
("Restricción aprobada", "Pendiente por verificar").

Casos del Excel/transcript ya modelados: los "Remoto" del Excel quedan inactivos
en el híbrido; **Julián González** queda sin híbrido aprobado (no rota), como se
mencionó en la reunión.

## Flotantes y parqueaderos

- Flotantes: Johana Jimenez, Andres Fuentes, Juan Arenas, Juan Pinto, Camilo
   Dulce, Ana Maria Gallo, Steven Vera y Julian Gonzalez. Rotan, tienen TC y
   ocupan puestos libres de WeWork;
  si no alcanzan los puestos se genera alerta.
- Vehículo: Luis Alvarado, Johana Jimenez, Gabriel, Juan Pinto, Diego Salazar,
  Jaime. 3 parqueaderos asignados **por rotación mensual**; un asignado solo
  consume cupo si está presencial ese día (Diego solo cuenta los viernes).

## Próximas mejoras recomendadas

1. Persistencia real (localStorage o backend) en lugar de solo JSON manual.
2. Generación de PDF (hoy es un placeholder).
3. Solver de optimización (p. ej. programación lineal) para repartir el
   sobrecupo de forma óptima cuando el equipo excede 9/día.
4. Pico y placa de Jaime parametrizable por día de la semana.
5. Vista de planta (mapa de puestos) para asignación física de flotantes.
6. Pruebas unitarias sobre `logic/` (las funciones ya son puras).
```
