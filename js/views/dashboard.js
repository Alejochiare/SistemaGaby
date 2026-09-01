/* ============================================================
   VIEW · DASHBOARD
   Panel de control: KPIs, gráficos y agenda del día.
   ============================================================ */
import { sel, getState, subscribe } from '../store.js';
import { $, $$, esc, iniciales, colorDe, relativo, fmtFechaCorta, esHoy, lineChart, barChart, doughnutChart, destroyAll } from '../lib.js';
import { LEAD_ESTADOS, ORIGENES, TIPOS_ACTIVIDAD, icon } from '../config.js';
import { openLeadForm } from './forms.js';
import { openLeadDetail } from './leadDetail.js';
import { navegar } from '../router.js';

/* --- agregaciones para gráficos --- */
function leadsPorMes() {
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const ahora = new Date();
  const labels = [], data = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    labels.push(meses[d.getMonth()]);
    data.push(getState().leads.filter(l => {
      const f = new Date(l.fechaIngreso);
      return f.getFullYear() === d.getFullYear() && f.getMonth() === d.getMonth();
    }).length);
  }
  return { labels, data };
}

function embudo() {
  const activos = LEAD_ESTADOS.filter(e => !['perdido'].includes(e.id));
  return {
    labels: activos.map(e => e.label),
    data: activos.map(e => getState().leads.filter(l => l.estado === e.id).length),
    colors: activos.map(e => e.color),
  };
}

function porOrigen() {
  const conteo = {};
  getState().leads.forEach(l => { conteo[l.origen] = (conteo[l.origen] || 0) + 1; });
  const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  return { labels: entradas.map(e => e[0]), data: entradas.map(e => e[1]) };
}

function rendimientoAsesores() {
  const asesores = getState().usuarios.filter(u => ['asesor','gerente','administrador'].includes(u.rol));
  const conData = asesores.map(u => ({
    nombre: u.nombre.split(' ')[0],
    cerrados: getState().leads.filter(l => l.asesor === u.id && l.estado === 'cerrado').length,
  })).filter(x => x.cerrados >= 0);
  return { labels: conData.map(x => x.nombre), data: conData.map(x => x.cerrados) };
}

function actividadReciente() {
  const items = [];
  getState().leads.forEach(l => (l.actividades || []).forEach(a => items.push({ ...a, lead: l })));
  return items.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 7);
}

function kpiCard(label, value, iconName, accent, soft, ruta) {
  return `<div class="kpi" ${ruta ? `data-go="${ruta}" style="cursor:pointer;--kpi-accent:${accent};--kpi-accent-soft:${soft}"` : `style="--kpi-accent:${accent};--kpi-accent-soft:${soft}"`}>
    <div class="kpi-top">
      <span class="kpi-label">${label}</span>
      <span class="kpi-icon">${icon(iconName)}</span>
    </div>
    <div class="kpi-value mono">${value}</div>
  </div>`;
}

export default async function dashboard(root) {
  const k = sel.kpis();
  const conv = sel.conversion();

  root.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div class="page-title-wrap">
          <h1>Hola, ${esc((getState().usuarioActual?.nombre || '').split(' ')[0])} 👋</h1>
          <div class="subtitle">Este es el estado de tu cartera hoy. Tenés <strong>${k.sinSeguimiento}</strong> clientes que necesitan atención.</div>
        </div>
        <button class="btn btn-primary" id="quickLead">${icon('plus')} Nuevo cliente</button>
      </div>

      <div class="kpi-grid stagger">
        ${kpiCard('Clientes activos', k.leadsActivos, 'users', 'var(--brand-600)', 'var(--brand-50)', 'leads')}
        ${kpiCard('Nuevos', k.leadsNuevos, 'star', '#2563eb', '#eff6ff', 'leads')}
        ${kpiCard('Sin seguimiento', k.sinSeguimiento, 'alert', 'var(--warning)', 'var(--warning-soft)', 'rescate')}
        ${kpiCard('En negociación', k.negociacion, 'trending', 'var(--accent-600)', 'rgba(245,166,35,.14)', 'leads')}
        ${kpiCard('Ventas cerradas', k.ventas, 'dollar', 'var(--success)', 'var(--success-soft)', 'reportes')}
        ${kpiCard('Alquileres', k.alquileres, 'home', 'var(--info)', 'var(--info-soft)', 'reportes')}
        ${kpiCard('Tareas pendientes', k.tareasPendientes, 'check', 'var(--brand-600)', 'var(--brand-50)', 'tareas')}
        ${kpiCard('Próximas visitas', k.proximasVisitas, 'calendar', 'var(--accent-600)', 'rgba(245,166,35,.14)', 'calendario')}
      </div>

      <div class="dash-grid" style="margin-bottom:1.2rem">
        <div class="card chart-card">
          <div class="card-head"><h3>Clientes por mes</h3><span class="badge badge-neutral">Últimos 6 meses</span></div>
          <div class="card-body"><div class="chart-box"><canvas id="chMes"></canvas></div></div>
        </div>
        <div class="card chart-card">
          <div class="card-head"><h3>Conversión global</h3></div>
          <div class="card-body" style="text-align:center">
            <div class="chart-box sm"><canvas id="chConv"></canvas></div>
            <div class="days-cold" style="color:var(--primary);margin-top:-150px;pointer-events:none">${conv}%<small>tasa de cierre</small></div>
          </div>
        </div>
      </div>

      <div class="dash-grid-3" style="margin-bottom:1.2rem">
        <div class="card chart-card">
          <div class="card-head"><h3>Origen de consultas</h3></div>
          <div class="card-body"><div class="chart-box sm"><canvas id="chOrigen"></canvas></div></div>
        </div>
        <div class="card chart-card">
          <div class="card-head"><h3>Embudo de ventas</h3></div>
          <div class="card-body"><div class="chart-box sm"><canvas id="chEmbudo"></canvas></div></div>
        </div>
        <div class="card chart-card">
          <div class="card-head"><h3>Cierres por asesor</h3></div>
          <div class="card-body"><div class="chart-box sm"><canvas id="chAsesor"></canvas></div></div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><h3>Actividad reciente</h3></div>
          <div class="card-body" id="recentBox"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Agenda de hoy</h3><span class="badge badge-warning">${k.tareasVencidas} vencidas</span></div>
          <div class="card-body" id="agendaBox"></div>
        </div>
      </div>
    </div>`;

  /* --- actividad reciente --- */
  const recientes = actividadReciente();
  $('#recentBox', root).innerHTML = recientes.length ? recientes.map(a => {
    const t = TIPOS_ACTIVIDAD[a.tipo] || TIPOS_ACTIVIDAD.nota;
    return `<div class="activity-item" data-lead="${a.lead.id}" style="cursor:pointer">
      <div class="activity-dot" style="background:${t.color}1a;color:${t.color}">${icon(a.tipo === 'estado' ? 'trending' : a.tipo === 'llamada' ? 'phone' : a.tipo === 'correo' ? 'mail' : a.tipo === 'mensaje' ? 'message' : a.tipo === 'visita' ? 'pin' : a.tipo === 'reunion' ? 'users' : 'edit')}</div>
      <div style="flex:1;min-width:0">
        <div class="activity-text"><strong>${esc(a.lead.nombre)}</strong> · ${esc(a.titulo)}</div>
        <div class="activity-time">${relativo(a.fecha)}</div>
      </div>
    </div>`;
  }).join('') : `<div class="empty"><h3>Sin actividad reciente</h3></div>`;

  /* --- agenda de hoy: tareas de hoy + vencidas --- */
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const agenda = getState().tareas
    .filter(t => !t.completada && new Date(t.fecha) <= new Date(hoy.getTime() + 86400000 * 2))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .slice(0, 8);
  $('#agendaBox', root).innerHTML = agenda.length ? agenda.map(t => {
    const lead = sel.lead(t.leadId);
    const vencida = new Date(t.fecha) < hoy;
    return `<div class="mini-list-item" data-lead="${t.leadId}" style="cursor:pointer">
      <span class="prio-dot prio-${t.prioridad}" style="width:10px;height:10px"></span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.85rem" class="truncate">${esc(t.titulo)}</div>
        <div class="text-xs text-soft">${lead ? esc(lead.nombre) : ''}</div>
      </div>
      <span class="text-xs ${vencida ? '' : 'text-soft'}" style="${vencida ? 'color:var(--danger);font-weight:700' : ''}">${esHoy(t.fecha) ? 'Hoy' : fmtFechaCorta(t.fecha)}</span>
    </div>`;
  }).join('') : `<div class="empty"><h3>Nada pendiente para hoy</h3><p>¡Buen trabajo!</p></div>`;

  /* --- gráficos --- */
  function pintarCharts() {
    const m = leadsPorMes();
    lineChart($('#chMes', root), m.labels, m.data, { label: 'Clientes' });
    doughnutChart($('#chConv', root), ['Cerrados', 'Activos', 'Perdidos'], [
      getState().leads.filter(l => l.estado === 'cerrado').length,
      sel.leadsActivos().length,
      getState().leads.filter(l => l.estado === 'perdido').length,
    ], ['#16a34a', 'var(--brand-500)', '#dc2626']);
    const o = porOrigen();
    doughnutChart($('#chOrigen', root), o.labels, o.data);
    const e = embudo();
    barChart($('#chEmbudo', root), e.labels, e.data, { colors: e.colors });
    const a = rendimientoAsesores();
    barChart($('#chAsesor', root), a.labels, a.data, { label: 'Cierres' });
  }
  pintarCharts();

  /* --- interacciones --- */
  $('#quickLead', root).addEventListener('click', () => openLeadForm(null, () => navegar('leads')));
  $$('[data-go]', root).forEach(c => c.addEventListener('click', () => navegar(c.dataset.go)));
  const abrirLead = (e) => { const n = e.target.closest('[data-lead]'); if (n) openLeadDetail(n.dataset.lead); };
  $('#recentBox', root).addEventListener('click', abrirLead);
  $('#agendaBox', root).addEventListener('click', abrirLead);

  /* --- re-pintar charts al cambiar de tema --- */
  const onTheme = () => pintarCharts();
  document.addEventListener('themechange', onTheme);

  /* cleanup */
  return () => { document.removeEventListener('themechange', onTheme); destroyAll(); };
}
