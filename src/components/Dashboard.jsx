import React from 'react'
import { KpiCard, AlertList } from './Shared.jsx'
import { MONTH_LABEL, dayOfMonth } from '../logic/dateUtils.js'

const pct = (value) => `${Math.round(value)}%`
const avg = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0)

const statusLabel = {
  green: 'Listo para publicar',
  amber: 'Requiere revision',
  red: 'Requiere ajuste',
}

function InsightItem({ tone = 'green', label, value, detail }) {
  return (
    <div className={`insight-item ${tone}`}>
      <div>
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </div>
      <b>{value}</b>
    </div>
  )
}

function occupancyTone(freeSeats) {
  if (freeSeats < 0) return 'red'
  if (freeSeats > 0) return 'amber'
  return 'green'
}

function dayLabel(day) {
  return `${day.weekday.slice(0, 3)} ${dayOfMonth(day.date)}`
}

export default function Dashboard({
  kpis,
  summary,
  alerts,
  month,
  year,
  params,
  employees = [],
  schedule,
  parkingAssigned = [],
  hideAlerts = false,
}) {
  const workdays = summary.filter((day) => !day.isHoliday)
  const maxHome = Math.max(1, ...workdays.map((day) => day.totalHome))
  const maxFreeSeats = Math.max(
    1,
    ...workdays.flatMap((day) => [Math.max(0, day.freeSeatsWeWork), Math.max(0, day.freeSeats93)]),
    params.seatsWeWork,
    params.seats93
  )
  const eligibleEmployees = employees.filter((employee) => employee.isActive && employee.hybridApproved)
  const floaters = eligibleEmployees.filter((employee) => employee.isFloating)
  const workdayCount = workdays.length
  const healthyDays = workdays.filter((day) => day.alerts.length === 0).length
  const healthyRate = workdayCount ? (healthyDays / workdayCount) * 100 : 0
  const seatedDays = workdays.filter((day) => day.freeSeatsWeWork >= 0 && day.freeSeats93 >= 0).length
  const seatedRate = workdayCount ? (seatedDays / workdayCount) * 100 : 0
  const unusedWeDays = workdays.filter((day) => day.freeSeatsWeWork > 0).length
  const unused93Days = workdays.filter((day) => day.freeSeats93 > 0).length
  const overWeDays = workdays.filter((day) => day.freeSeatsWeWork < 0).length
  const over93Days = workdays.filter((day) => day.freeSeats93 < 0).length
  const avgOfficeWeWork = Math.round(avg(workdays.map((day) => day.totalOfficeWeWork)))
  const avgOffice93 = Math.round(avg(workdays.map((day) => day.totalOffice93)))
  const fairnessRows = eligibleEmployees.map((employee) => {
    const homeDays = schedule?.days?.filter((date) => schedule.cells[`${employee.id}__${date}`]?.status === 'HOME') || []
    return { employee, homeDays: homeDays.length }
  })
  const fairnessMin = fairnessRows.length ? Math.min(...fairnessRows.map((row) => row.homeDays)) : 0
  const fairnessMax = fairnessRows.length ? Math.max(...fairnessRows.map((row) => row.homeDays)) : 0
  const fairnessGap = fairnessMax - fairnessMin
  const fairnessTone = fairnessGap > 1 ? 'amber' : 'green'
  const mainRiskDays = workdays.filter((day) =>
    day.freeSeatsWeWork !== 0 ||
    day.freeSeats93 !== 0 ||
    day.parkingUsed > params.parkingSpots ||
    day.floatingPeopleWithoutSeat > 0
  )

  let semColor = 'green'
  if (!hideAlerts && kpis.criticalAlerts > 0) semColor = 'red'
  else if (!hideAlerts && (kpis.warningAlerts > 0 || kpis.offTargetDays > 0)) semColor = 'amber'

  const actionItems = [
    !hideAlerts && kpis.criticalAlerts > 0 && `${kpis.criticalAlerts} alerta(s) critica(s) antes de publicar.`,
    !hideAlerts && (overWeDays + over93Days) > 0 && `${overWeDays + over93Days} dia(s) con sobrecupo de oficina.`,
    kpis.carsNoParking > 0 && `${kpis.carsNoParking} persona(s) con carro quedaron sin cupo mensual.`,
    fairnessGap > 1 && `La rotacion no esta pareja: diferencia de ${fairnessGap} dia(s) de TC.`,
  ].filter(Boolean)

  return (
    <div>
      <div className={`dashboard-hero ${semColor}`}>
        <div>
          <div className="hero-kicker">{MONTH_LABEL[month]} {year}</div>
          <h3>{statusLabel[semColor]}</h3>
          <p>
            {semColor === 'green' && 'La programacion garantiza puesto para cada persona presencial, sin conflictos relevantes.'}
            {semColor === 'amber' && 'La programacion es usable, pero hay advertencias operativas por revisar.'}
            {semColor === 'red' && 'Hay sobrecupo o conflictos criticos. Ajusta los dias marcados antes de publicar.'}
          </p>
        </div>
        <div className="hero-score">
          <span>{pct(seatedRate)}</span>
          <small>dias sin sobrecupo</small>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Mes" value={MONTH_LABEL[month]} hint={String(year)} />
        <KpiCard label="Dias habiles" value={workdayCount} hint={`${healthyDays} sin alertas`} tone={healthyRate >= 85 ? 'green' : 'amber'} />
        <KpiCard label="Personas activas" value={kpis.activeCount} hint={`${eligibleEmployees.length} rotan`} />
        <KpiCard label="Hibrido aprobado" value={kpis.approvedCount} tone="green" />
        <KpiCard label="WeWork ocupacion prom." value={avgOfficeWeWork} hint={`de ${params.seatsWeWork} puestos`} />
        <KpiCard label="93 ocupacion prom." value={avgOffice93} hint={`de ${params.seats93} puestos`} />
        <KpiCard label="Prom. en casa / dia" value={kpis.avgHome} />
        <KpiCard label="Max. en casa" value={kpis.maxHome} />
        <KpiCard label="Dias con sobrecupo" value={kpis.overCapacityDays}
          tone={kpis.overCapacityDays > 0 ? 'red' : 'green'} />
        <KpiCard label="Dias sin sobrecupo" value={pct(seatedRate)}
          hint={`${seatedDays}/${workdayCount} dias`} tone={seatedRate >= 95 ? 'green' : 'amber'} />
        <KpiCard label="Parqueaderos" value={`${kpis.parkingAssigned}/${kpis.parkingAvailable}`}
          hint={kpis.carsNoParking > 0 ? `${kpis.carsNoParking} con carro sin cupo` : 'asignados'} />
        {!hideAlerts && (
          <KpiCard label="Alertas criticas" value={kpis.criticalAlerts}
            tone={kpis.criticalAlerts > 0 ? 'red' : 'green'} />
        )}
        {!hideAlerts && (
          <KpiCard label="Advertencias" value={kpis.warningAlerts}
            tone={kpis.warningAlerts > 0 ? 'amber' : 'green'} />
        )}
      </div>

      <div className="grid2 dashboard-section">
        <div className="card">
          <div className="card-head"><h3>Lectura operativa</h3></div>
          <div className="card-body insight-stack">
            <InsightItem
              label="Personas con puesto"
              value={pct(seatedRate)}
              tone={seatedRate >= 95 ? 'green' : seatedRate >= 80 ? 'amber' : 'red'}
              detail={`${seatedDays} de ${workdayCount} dias sin sobrecupo`}
            />
            <InsightItem
              label="Puestos disponibles"
              value={unusedWeDays + unused93Days}
              tone="green"
              detail={`${unusedWeDays} WeWork, ${unused93Days} Oficina 93`}
            />
            <InsightItem
              label="Equidad de TC"
              value={`${fairnessMin}-${fairnessMax}`}
              tone={fairnessTone}
              detail="dias en casa por persona aprobada"
            />
            <InsightItem
              label="Flotantes"
              value={`${floaters.length}`}
              tone={workdays.some((day) => day.floatingPeopleWithoutSeat > 0) ? 'amber' : 'green'}
              detail="personas dependen de puestos liberados"
            />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Acciones recomendadas</h3></div>
          <div className="card-body action-list">
            {actionItems.length > 0 ? actionItems.map((item) => (
              <div className="action-row" key={item}>
                <span />
                <p>{item}</p>
              </div>
            )) : (
              <div className="empty compact">No hay acciones pendientes para este mes.</div>
            )}
            <div className="dashboard-note">
              {mainRiskDays.length} dia(s) concentran riesgos operativos. Revisa la vista diaria.
            </div>
          </div>
        </div>
      </div>

      <div className="grid2 dashboard-section">
        <div className="card">
          <div className="card-head chart-head">
            <div>
              <h3>Personas en casa por dia</h3>
              <span>Maximo diario: {maxHome}</span>
            </div>
            <b>{kpis.avgHome}</b>
          </div>
          <div className="card-body chart-list">
            {workdays.map((day) => (
              <div className="chart-row" key={day.date}>
                <span className="chart-label">{dayLabel(day)}</span>
                <span className="chart-track">
                  <span
                    className="chart-fill home"
                    style={{ width: `${(day.totalHome / maxHome) * 100}%` }}
                  />
                </span>
                <span className="chart-value">{day.totalHome}</span>
              </div>
            ))}
            {workdays.length === 0 && <div className="empty">Genera la programacion para ver datos.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head chart-head">
            <div>
              <h3>Puestos libres por oficina</h3>
              <span>Comparativo diario WeWork / 93</span>
            </div>
          </div>
          <div className="card-body chart-list office-chart">
            {workdays.map((day) => (
              <div key={day.date} className="office-chart-row">
                <span className="chart-label">{dayLabel(day)}</span>
                <div className="office-bars">
                  <span className="office-label">WW</span>
                  <span className="chart-track">
                    <span
                      className={`chart-fill ${occupancyTone(day.freeSeatsWeWork)}`}
                      style={{ width: `${(Math.max(0, day.freeSeatsWeWork) / maxFreeSeats) * 100}%` }}
                    />
                  </span>
                  <span className="chart-value">{day.freeSeatsWeWork}</span>
                  <span className="office-label">93</span>
                  <span className="chart-track">
                    <span
                      className={`chart-fill ${occupancyTone(day.freeSeats93)}`}
                      style={{ width: `${(Math.max(0, day.freeSeats93) / maxFreeSeats) * 100}%` }}
                    />
                  </span>
                  <span className="chart-value">{day.freeSeats93}</span>
                </div>
              </div>
            ))}
            {workdays.length === 0 && <div className="empty">Sin datos.</div>}
          </div>
        </div>
      </div>
      {!hideAlerts && (
        <div className="grid2 dashboard-section">
          <div className="card">
            <div className="card-head"><h3>Alertas ({alerts.length})</h3></div>
            <div className="card-body" style={{ maxHeight: 280, overflow: 'auto' }}>
              <AlertList alerts={alerts.slice(0, 40)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
