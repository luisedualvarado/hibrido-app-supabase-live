# Rotación Híbrida · Equipo ME&I (AECOM)

Prototipo funcional (SPA en React + Vite) para gestionar la
programación mensual de trabajo híbrido del equipo de ingeniería ME&I.
Reemplaza el Excel de rotación con asignación automática de días de trabajo en
casa, control de puestos en WeWork / Oficina 93, rotación de parqueaderos y
asignación de puestos a personal flotante.

Los datos viven en estados de React y pueden guardarse localmente o en una
fuente compartida. Puedes **exportar/importar JSON** para conservar una
configuración entre sesiones, y exportar CSV de programación, resumen diario y
alertas.

En el build público, la app abre en modo lectura. El sidebar incluye un acceso
admin para desbloquear el resto de pestañas con las credenciales definidas en
`VITE_ADMIN_USERNAME` y `VITE_ADMIN_PASSWORD`.

## Admin y público sincronizados con Supabase

Esta copia puede trabajar con dos vistas separadas:

1. Admin: entra con las credenciales del sidebar y edita la programación.
2. Público: entra en modo solo lectura.

Cuando configuras Supabase, cualquier cambio del admin se publica en una
snapshot de borrador. La vista publica solo cambia cuando el admin presiona
**Publicar**, y cada publicacion queda guardada en un historial recuperable.

### Variables de entorno

Configura estas variables en `.env.development` y `.env.production`:

```bash
VITE_PUBLIC_READ_ONLY=true
VITE_PUBLIC_PUBLISHED_JUNE=false
VITE_ADMIN_USERNAME=tu_usuario_admin
VITE_ADMIN_PASSWORD=tu_password_admin
VITE_SUPABASE_URL=tu_supabase_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
VITE_SUPABASE_SNAPSHOT_TABLE=app_snapshots
VITE_SUPABASE_DRAFT_KEY=draft
VITE_SUPABASE_PUBLISHED_KEY=public
VITE_SUPABASE_HISTORY_TABLE=app_snapshot_history
```

### Tabla de Supabase

Ejecuta el SQL de [supabase/app_snapshots.sql](supabase/app_snapshots.sql) en tu
proyecto de Supabase. Ese script crea:

- `app_snapshots` para las filas `draft` y `public`
- `app_snapshot_history` para guardar cada publicacion

La vista admin trabaja sobre `draft`. La vista publica escucha `public`.
Cuando publicas, el borrador actual se copia a `public` y se agrega una entrada
en el historial.

### Importante sobre seguridad

La sesión admin de esta app sigue siendo del lado del cliente. Para que la app
pueda escribir en Supabase usando la `anon key`, el SQL incluido deja abierta la
escritura sobre esa tabla. Eso mantiene el comportamiento simple que pediste,
pero no es seguridad fuerte. Si más adelante quieres blindar realmente quién
puede publicar cambios, hace falta autenticación real o un backend intermedio.

## Cómo correrlo

```bash
npm install
npm run dev      # abre el servidor de desarrollo (http://localhost:5173)
npm run build    # build de producción en /dist
npm run preview  # sirve el build
```

Requisitos: Node 18+.

## Acceso admin

No dejes credenciales reales versionadas en el repo. Para desarrollo local,
define `VITE_ADMIN_USERNAME` y `VITE_ADMIN_PASSWORD` en un archivo local no
versionado, por ejemplo `.env.local` o `.env.development.local`.

Para GitHub Pages, este repo ya queda preparado para leer:

```bash
Actions variable: VITE_ADMIN_USERNAME
Actions secret:   VITE_ADMIN_PASSWORD
```

Si el build público no recibe esas variables, la app se publica en solo lectura
y el acceso admin aparece como no configurado. Esto sigue siendo proteccion del
lado del cliente, no autenticacion real con backend.

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
