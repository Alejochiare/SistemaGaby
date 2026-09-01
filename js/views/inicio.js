/* ============================================================
   VISTA · Inicio
   ============================================================ */
import { getState, sel, subscribe } from '../store.js';
import { icon } from '../config.js';
import { esc, fmtMoneda, nombreMes } from '../lib.js';
import { navegar } from '../router.js';
import { TIPOS_INDICE, getUltimoIndice, actualizarIndices } from '../indices.js';

function mesLabel(s) {
  if (!s) return '—';
  const [y, m] = s.split('-');
  return `${nombreMes(+m - 1)} ${y}`;
}

function saludoHora() {
  const h = new Date().getHours();
  if (h < 12) return 'Buen día';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function inicio(root) {
  root.innerHTML = `<div class="view" id="vInicio"></div>`;
  const render = () => pintarInicio(root.querySelector('#vInicio'));
  render();
  const unsub = subscribe(render);
  return unsub;
}

function pintarInicio(el) {
  const { clientes, alquileres } = getState();
  const k = sel.kpis();
  const paraAjuste  = sel.contratosParaAjuste().slice(0, 6);
  const proxVenc    = sel.proxVencimientos().slice(0, 5);
  const resumenCobrosMes = sel.resumenCobrosMes();

  // Cobros vencidos (mes actual o anteriores, cobrados o nunca registrados)
  const cobrosImpagos = alquileres
    .filter(a => !['rescindido', 'renovado'].includes(a.estado))
    .flatMap(a => sel.cobrosImpagosMes(a).map(c => ({ ...c, alq: a })))
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(0, 5);

  // Próximos cobros (dentro de los próximos 7 días)
  const proximosCobros = sel.proximosCobros().slice(0, 5);

  const { propiedades } = getState();
  const propsDisponibles = propiedades.filter(p => p.estado === 'disponible').length;

  const fechaLarga = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const esNoche = new Date().getHours() >= 20 || new Date().getHours() < 6;

  el.innerHTML = `
    <div class="inicio-hero">
      <div class="inicio-hero-icon">${icon(esNoche ? 'moon' : 'sun')}</div>
      <div>
        <h1 class="inicio-hero-title">${saludoHora()} 👋</h1>
        <p class="inicio-hero-sub">${fechaLarga}</p>
      </div>
    </div>

    <!-- Índices de ajuste vigentes (automáticos, vía API) -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
      <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-soft);font-weight:600">Índices de ajuste vigentes</span>
      <button class="btn btn-xs btn-ghost" id="btnActualizarIndices">${icon('refresh')} Actualizar</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem;margin-bottom:1.5rem">
      ${TIPOS_INDICE.map(t => {
        const ultimo = getUltimoIndice(t.id);
        return `
        <div class="card" style="padding:.85rem 1rem;text-align:center">
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-soft);margin-bottom:.35rem">${t.id}</div>
          <div style="font-size:1.35rem;font-weight:800;color:var(--primary)">${ultimo ? ultimo.pct + '%' : '—'}</div>
          <div style="font-size:.68rem;color:var(--text-faint);margin-top:.15rem">${ultimo ? mesLabel(ultimo.mes) : 'Sin datos aún'}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- KPIs -->
    <div class="kpi-grid" style="margin-bottom:2rem">
      ${kpi('users',    'Clientes',           k.totalClientes,     'clientes')}
      ${kpi('key',      'Alquileres activos', k.alquileresActivos, 'alquileres', 'var(--info-soft)',    'var(--info)')}
      ${kpi('home',      'Propiedades libres', propsDisponibles,    'propiedades','var(--success-soft)', 'var(--success)')}
      ${kpiCobrosMes(resumenCobrosMes, mesLabel(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`))}
    </div>

    <div class="two-col-grid">

      <!-- Contratos por aumentar -->
      <div class="card">
        <div class="card-head">
          <h3 style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600">
            <span style="font-size:.8rem;line-height:1">📈</span>
            Contratos por aumentar
            ${k.paraAjuste ? `<span class="badge badge-danger" style="font-size:.68rem">${k.paraAjuste}</span>` : ''}
          </h3>
          <button class="btn btn-xs btn-ghost" id="btnVerAjustes">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">
          ${paraAjuste.length ? paraAjuste.map(({ alq, dias }) => {
            const inq  = clientes.find(c => c.id === alq.inquilinoId);
            const prop = sel.dirPropiedad(alq.propiedadId);
            const vencido = dias < 0;
            const urgente = vencido || dias <= 7;
            const label = vencido
              ? `Hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
              : dias === 0 ? 'Hoy'
              : `En ${dias} día${dias !== 1 ? 's' : ''}`;
            return `
            <div class="list-row list-row-hover" data-alq="${alq.id}" style="padding:.7rem 1rem">
              <div class="list-info">
                <div class="list-name" style="font-size:.875rem">${esc(inq?.nombre || '—')}</div>
                <div class="text-xs text-soft truncate" style="margin-top:.1rem">${esc(prop)}</div>
              </div>
              <span style="font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:var(--r-full);
                background:${urgente ? 'var(--danger-soft)' : 'var(--warning-soft)'};
                color:${urgente ? 'var(--danger)' : 'var(--warning)'};white-space:nowrap">${label}</span>
            </div>`;
          }).join('') : `<div class="empty-sm">Sin contratos pendientes de ajuste</div>`}
        </div>
      </div>

      <!-- Próximos vencimientos -->
      <div class="card">
        <div class="card-head">
          <h3 style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600">
            <span style="font-size:.8rem;line-height:1">⏳</span>
            Contratos por vencer
            ${k.proxVencimientos ? `<span class="badge badge-warning" style="font-size:.68rem">${k.proxVencimientos}</span>` : ''}
          </h3>
          <button class="btn btn-xs btn-ghost" id="btnVerAlq">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">
          ${proxVenc.length ? proxVenc.map(({ alq, dias }) => {
            const inq  = clientes.find(c => c.id === alq.inquilinoId);
            const prop = sel.dirPropiedad(alq.propiedadId);
            const urgente = dias <= 30;
            return `
              <div class="list-row list-row-hover" data-alq="${alq.id}" style="padding:.7rem 1rem">
                <div class="list-info">
                  <div class="list-name" style="font-size:.875rem">${esc(inq?.nombre || '—')}</div>
                  <div class="text-xs text-soft truncate" style="margin-top:.1rem">${esc(prop)}</div>
                </div>
                <span style="font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:var(--r-full);
                  background:${urgente ? 'var(--danger-soft)' : 'var(--warning-soft)'};
                  color:${urgente ? 'var(--danger)' : 'var(--warning)'}">${dias}d</span>
              </div>`;
          }).join('') : `<div class="empty-sm">Sin vencimientos próximos</div>`}
        </div>
      </div>

      <!-- Cobros pendientes -->
      <div class="card">
        <div class="card-head">
          <h3 style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600">
            <span style="font-size:.8rem;line-height:1">💰</span>
            Cobros pendientes
            ${k.cobrosVencidos ? `<span class="badge badge-danger" style="font-size:.68rem">${k.cobrosVencidos}</span>` : ''}
          </h3>
          <button class="btn btn-xs btn-ghost" id="btnVerCobros">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">
          ${cobrosImpagos.length ? cobrosImpagos.map(c => {
            const inq = clientes.find(x => x.id === c.alq.inquilinoId);
            return `
              <div class="list-row list-row-hover" data-alq="${c.alq.id}" style="padding:.7rem 1rem">
                <div class="list-info">
                  <div class="list-name" style="font-size:.875rem">${esc(inq?.nombre || '—')}</div>
                  <div class="text-xs text-soft" style="margin-top:.1rem">${mesLabel(c.mes)} · ${fmtMoneda(c.monto, c.alq.moneda)}</div>
                </div>
                <span style="font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:var(--r-full);background:var(--danger-soft);color:var(--danger)">Pendiente</span>
              </div>`;
          }).join('') : `<div class="empty-sm">Sin cobros pendientes</div>`}
        </div>
      </div>

      <!-- Próximos cobros -->
      <div class="card">
        <div class="card-head">
          <h3 style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600">
            <span style="font-size:.8rem;line-height:1">🔔</span>
            Próximos cobros
            ${proximosCobros.length ? `<span class="badge badge-info" style="font-size:.68rem">${proximosCobros.length}</span>` : ''}
          </h3>
          <button class="btn btn-xs btn-ghost" id="btnVerProxCobros">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">
          ${proximosCobros.length ? proximosCobros.map(({ alq, mes, monto, dias }) => {
            const inq = clientes.find(x => x.id === alq.inquilinoId);
            const label = dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`;
            return `
              <div class="list-row list-row-hover" data-alq="${alq.id}" style="padding:.7rem 1rem">
                <div class="list-info">
                  <div class="list-name" style="font-size:.875rem">${esc(inq?.nombre || '—')}</div>
                  <div class="text-xs text-soft" style="margin-top:.1rem">${mesLabel(mes)} · ${fmtMoneda(monto, alq.moneda)}</div>
                </div>
                <span style="font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:var(--r-full);background:var(--info-soft);color:var(--info);white-space:nowrap">${label}</span>
              </div>`;
          }).join('') : `<div class="empty-sm">Sin cobros próximos en 7 días</div>`}
        </div>
      </div>

    </div>`;

  el.querySelector('#btnActualizarIndices')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Actualizando...';
    await actualizarIndices().catch(() => {});
    pintarInicio(el);
  });
  el.querySelector('#btnVerAjustes')?.addEventListener('click', () => navegar('alquileres'));
  el.querySelector('#btnVerAlq')?.addEventListener('click',     () => navegar('alquileres'));
  el.querySelector('#btnVerCobros')?.addEventListener('click',  () => navegar('alquileres'));
  el.querySelector('#btnVerProxCobros')?.addEventListener('click', () => navegar('alquileres'));
  el.querySelectorAll('[data-alq]').forEach(r => r.addEventListener('click', () => navegar(`alquileres/${r.dataset.alq}`)));
}

function kpi(ico, label, val, ruta, accent = 'var(--brand-100)', accentColor = 'var(--brand-600)') {
  return `
    <div class="kpi" data-ruta="${ruta}" style="cursor:pointer;--kpi-accent:${accentColor};--kpi-accent-soft:${accent}">
      <div class="kpi-top">
        <span class="kpi-label">${label}</span>
        <span class="kpi-icon">${icon(ico)}</span>
      </div>
      <div class="kpi-value">${val}</div>
    </div>`;
}

function kpiCobrosMes(resumen, mesTxt) {
  const filas = resumen.length ? resumen : [{ moneda: 'ARS', corresponde: 0, cobrado: 0 }];
  return `
    <div class="kpi" data-ruta="alquileres" style="cursor:pointer;--kpi-accent:var(--success);--kpi-accent-soft:var(--success-soft)">
      <div class="kpi-top">
        <span class="kpi-label">Cobros de ${mesTxt}</span>
        <span class="kpi-icon">${icon('wallet')}</span>
      </div>
      ${filas.map(r => {
        const pct = r.corresponde > 0 ? Math.min(100, Math.round(r.cobrado / r.corresponde * 100)) : 0;
        return `
          <div style="margin-top:.15rem">
            <div class="kpi-value" style="font-size:1.3rem">${fmtMoneda(r.cobrado, r.moneda)}</div>
            <div class="text-xs text-soft" style="margin:.15rem 0 .4rem">de ${fmtMoneda(r.corresponde, r.moneda)}</div>
            <div class="progress"><i style="width:${pct}%;background:var(--success)"></i></div>
          </div>`;
      }).join('')}
    </div>`;
}

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-ruta]');
  if (card?.dataset.ruta) navegar(card.dataset.ruta);
});
