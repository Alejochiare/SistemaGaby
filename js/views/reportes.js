/* ============================================================
   VIEW · REPORTES
   Análisis de la operación: conversión, ventas, alquileres,
   rendimiento por asesor, origen y clientes perdidos.
   Exporta a CSV (Excel) e imprime a PDF.
   ============================================================ */
import { sel, getState } from '../store.js';
import { $, $$, esc, fmtMoneda, exportarCSV, lineChart, barChart, doughnutChart, destroyAll } from '../lib.js';
import { icon } from '../config.js';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function leadsPorMes() {
  const ahora = new Date(); const labels = [], data = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    labels.push(MESES[d.getMonth()]);
    data.push(getState().leads.filter(l => { const f = new Date(l.fechaIngreso); return f.getFullYear() === d.getFullYear() && f.getMonth() === d.getMonth(); }).length);
  }
  return { labels, data };
}

function statsAsesores() {
  return getState().usuarios
    .filter(u => ['asesor','gerente','administrador'].includes(u.rol))
    .map(u => {
      const suyos = getState().leads.filter(l => l.asesor === u.id);
      const cerrados = suyos.filter(l => l.estado === 'cerrado').length;
      const activos = sel.leadsActivos().filter(l => l.asesor === u.id).length;
      return { nombre: u.nombre, total: suyos.length, activos, cerrados, conv: suyos.length ? Math.round(cerrados / suyos.length * 100) : 0 };
    })
    .sort((a, b) => b.cerrados - a.cerrados);
}

function statsOrigen() {
  const m = {};
  getState().leads.forEach(l => {
    m[l.origen] = m[l.origen] || { origen: l.origen, total: 0, cerrados: 0 };
    m[l.origen].total++; if (l.estado === 'cerrado') m[l.origen].cerrados++;
  });
  return Object.values(m).map(o => ({ ...o, conv: o.total ? Math.round(o.cerrados / o.total * 100) : 0 })).sort((a, b) => b.total - a.total);
}

export default async function reportes(root) {
  if (!sel.puede(['administrador', 'gerente'])) {
    root.innerHTML = `<div class="view"><div class="empty">${icon('shield')}<h3>Acceso restringido</h3><p>Solo administradores y gerentes pueden ver los reportes.</p></div></div>`;
    return;
  }

  const total = getState().leads.length;
  const ventas = getState().leads.filter(l => l.estado === 'cerrado' && l.operacion === 'Venta');
  const alquileres = getState().leads.filter(l => l.estado === 'cerrado' && l.operacion !== 'Venta');
  const perdidos = getState().leads.filter(l => l.estado === 'perdido');
  const asesores = statsAsesores();
  const origenes = statsOrigen();
  const montoVentas = ventas.reduce((s, l) => s + (Number(l.presupuesto) || 0), 0);

  root.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div class="page-title-wrap">
          <h1>Reportes</h1>
          <div class="subtitle">Resumen de desempeño comercial.</div>
        </div>
        <button class="btn btn-ghost" id="pdf">${icon('download')} Exportar PDF</button>
      <div class="kpi-grid">
        <div class="kpi" style="--kpi-accent:var(--brand-600);--kpi-accent-soft:var(--brand-50)"><div class="kpi-top"><span class="kpi-label">Total leads</span><span class="kpi-icon">${icon('users')}</span></div><div class="kpi-value mono">${total}</div></div>
        <div class="kpi" style="--kpi-accent:var(--success);--kpi-accent-soft:var(--success-soft)"><div class="kpi-top"><span class="kpi-label">Conversión</span><span class="kpi-icon">${icon('trending')}</span></div><div class="kpi-value mono">${sel.conversion()}%</div></div>
        <div class="kpi" style="--kpi-accent:var(--success);--kpi-accent-soft:var(--success-soft)"><div class="kpi-top"><span class="kpi-label">Ventas cerradas</span><span class="kpi-icon">${icon('dollar')}</span></div><div class="kpi-value mono">${ventas.length}</div></div>
        <div class="kpi" style="--kpi-accent:var(--info);--kpi-accent-soft:var(--info-soft)"><div class="kpi-top"><span class="kpi-label">Alquileres</span><span class="kpi-icon">${icon('home')}</span></div><div class="kpi-value mono">${alquileres.length}</div></div>
        <div class="kpi" style="--kpi-accent:var(--danger);--kpi-accent-soft:var(--danger-soft)"><div class="kpi-top"><span class="kpi-label">Perdidos</span><span class="kpi-icon">${icon('alert')}</span></div><div class="kpi-value mono">${perdidos.length}</div></div>
      </div>

      <div class="dash-grid" style="margin-bottom:1.2rem">
        <div class="card chart-card"><div class="card-head"><h3>Evolución de leads</h3></div><div class="card-body"><div class="chart-box"><canvas id="rMes"></canvas></div></div></div>
        <div class="card chart-card"><div class="card-head"><h3>Origen</h3></div><div class="card-body"><div class="chart-box sm"><canvas id="rOrigen"></canvas></div></div></div>
      </div>

      <div class="card" style="margin-bottom:1.2rem">
        <div class="card-head"><h3>Rendimiento por asesor</h3><button class="btn btn-sm btn-ghost" id="csvAsesor">${icon('download')} CSV</button></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Asesor</th><th>Total</th><th>Activos</th><th>Cerrados</th><th>Conversión</th></tr></thead>
            <tbody>${asesores.map(a => `<tr><td class="cell-name">${esc(a.nombre)}</td><td class="mono">${a.total}</td><td class="mono">${a.activos}</td><td class="mono cell-strong">${a.cerrados}</td><td><span class="badge ${a.conv >= 30 ? 'badge-success' : a.conv >= 15 ? 'badge-warning' : 'badge-neutral'}">${a.conv}%</span></td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><h3>Por origen</h3><button class="btn btn-sm btn-ghost" id="csvOrigen">${icon('download')} CSV</button></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Origen</th><th>Leads</th><th>Cerrados</th><th>Conv.</th></tr></thead>
              <tbody>${origenes.map(o => `<tr><td class="cell-name">${esc(o.origen)}</td><td class="mono">${o.total}</td><td class="mono">${o.cerrados}</td><td class="mono">${o.conv}%</td></tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Clientes perdidos</h3><button class="btn btn-sm btn-ghost" id="csvPerdidos">${icon('download')} CSV</button></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Zona</th><th>Origen</th></tr></thead>
              <tbody>${perdidos.length ? perdidos.map(l => `<tr><td class="cell-name">${esc(l.nombre)}</td><td>${esc(l.zona || '—')}</td><td>${esc(l.origen || '—')}</td></tr>`).join('') : '<tr><td colspan="3" class="text-faint">Sin clientes perdidos.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>

      <p class="text-sm text-faint" style="margin-top:1.2rem">Monto estimado en ventas cerradas: <strong>${fmtMoneda(montoVentas, 'USD')}</strong></p>
    </div>`;

  function pintar() {
    const m = leadsPorMes();
    lineChart($('#rMes', root), m.labels, m.data, { label: 'Leads' });
    doughnutChart($('#rOrigen', root), origenes.map(o => o.origen), origenes.map(o => o.total));
  }
  pintar();

  $('#csvAsesor', root).addEventListener('click', () => exportarCSV(asesores, 'rendimiento-asesores.csv'));
  $('#csvOrigen', root).addEventListener('click', () => exportarCSV(origenes, 'leads-por-origen.csv'));
  $('#csvPerdidos', root).addEventListener('click', () => exportarCSV(
    perdidos.map(l => ({ nombre: l.nombre, zona: l.zona, origen: l.origen, asesor: sel.nombreAsesor(l.asesor) })),
    'clientes-perdidos.csv'));
  $('#pdf', root).addEventListener('click', () => window.print());

  const onTheme = () => pintar();
  document.addEventListener('themechange', onTheme);
  return () => { document.removeEventListener('themechange', onTheme); destroyAll(); };
}
