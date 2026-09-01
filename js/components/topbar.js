/* ============================================================
   COMPONENT · Topbar — tema, colapso sidebar, búsqueda global,
   panel de notificaciones.
   ============================================================ */
import { icon } from '../config.js';
import { getState, sel, subscribe } from '../store.js';
import { $, debounce, esc, fmtFechaCorta } from '../lib.js';
import { navegar } from '../router.js';
import { pedirPermiso, tocar } from '../notifications.js';

const THEME_KEY = 'inmocrm_theme';

export function initTopbar() {
  initTheme();
  initCollapse();
  initSearch();
  initNotif();
}

/* ---------- TEMA claro/oscuro ---------- */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  aplicarTema(saved);
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    aplicarTema(next);
    localStorage.setItem(THEME_KEY, next);
    document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  });
}
function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  $('#themeIcon').innerHTML = t === 'dark'
    ? icon('moon').match(/<svg[^>]*>(.*)<\/svg>/s)[1]
    : icon('sun').match(/<svg[^>]*>(.*)<\/svg>/s)[1];
}

/* ---------- COLAPSO / MENÚ MÓVIL ---------- */
function initCollapse() {
  const app = $('#app');
  const scrim = $('#scrim');
  $('#collapseToggle')?.addEventListener('click', () => app.classList.toggle('sidebar-collapsed'));
  $('#menuToggle')?.addEventListener('click', () => { app.classList.add('sidebar-open'); scrim.classList.add('show'); });
  scrim.addEventListener('click', () => { app.classList.remove('sidebar-open'); scrim.classList.remove('show'); });
  window.addEventListener('hashchange', () => { app.classList.remove('sidebar-open'); scrim.classList.remove('show'); });
}

/* ---------- BÚSQUEDA GLOBAL ---------- */
function initSearch() {
  const input = $('#globalSearch');
  if (!input) return; // eliminado del HTML
  const box = $('#searchResults');

  const run = debounce(() => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.innerHTML = ''; return; }
    const { clientes, propiedades, alquileres, ventas } = getState();
    const res = [];

    clientes.forEach(c => {
      if (`${c.nombre} ${c.telefono || ''} ${c.email || ''}`.toLowerCase().includes(q))
        res.push({ tipo: 'Cliente', label: c.nombre, sub: (c.tipos || []).join(', '), go: () => navegar(`clientes/${c.id}`) });
    });
    propiedades.forEach(p => {
      if (`${p.direccion} ${p.barrio || ''} ${p.ciudad || ''}`.toLowerCase().includes(q))
        res.push({ tipo: 'Propiedad', label: p.direccion, sub: `${p.tipo || ''} · ${p.barrio || ''}`, go: () => navegar(`propiedades/${p.id}`) });
    });
    alquileres.forEach(a => {
      const inq = clientes.find(c => c.id === a.inquilinoId);
      const prop = propiedades.find(p => p.id === a.propiedadId);
      if (inq && (inq.nombre.toLowerCase().includes(q) || prop?.direccion?.toLowerCase().includes(q)))
        res.push({ tipo: 'Alquiler', label: inq?.nombre || '—', sub: prop?.direccion || '—', go: () => navegar('alquileres') });
    });
    ventas.forEach(v => {
      const comp = clientes.find(c => c.id === v.compradorId);
      const prop = propiedades.find(p => p.id === v.propiedadId);
      if (comp?.nombre.toLowerCase().includes(q) || prop?.direccion?.toLowerCase().includes(q))
        res.push({ tipo: 'Venta', label: comp?.nombre || '—', sub: prop?.direccion || '—', go: () => navegar('ventas') });
    });

    if (!res.length) { box.innerHTML = `<div class="search-results"><div class="search-result text-soft">Sin resultados para "${esc(q)}"</div></div>`; return; }
    box.innerHTML = `<div class="search-results">${res.slice(0, 8).map((r, i) => `
      <div class="search-result" data-i="${i}">
        <span class="sr-type">${r.tipo}</span>
        <div style="min-width:0"><div class="truncate" style="font-weight:600">${esc(r.label)}</div><div class="text-xs text-soft truncate">${esc(r.sub)}</div></div>
      </div>`).join('')}</div>`;
    box.querySelectorAll('.search-result[data-i]').forEach(node => {
      node.addEventListener('click', () => { res[+node.dataset.i].go(); cerrar(); });
    });
  }, 180);

  const cerrar = () => { box.innerHTML = ''; input.value = ''; };
  input.addEventListener('input', run);
  document.addEventListener('click', (e) => { if (!e.target.closest('.global-search')) box.innerHTML = ''; });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') box.innerHTML = '';
  });
}

/* ---------- NOTIFICACIONES / ALERTAS ---------- */
function initNotif() {
  const btn = $('#notifBtn');
  const panel = $('#notifPanel');
  const dot = $('#notifDot');

  const construirAlertas = () => {
    const alertas = [];
    const { clientes, alquileres } = getState();

    sel.proxVencimientos().slice(0, 4).forEach(({ alq, dias }) => {
      const inq = clientes.find(c => c.id === alq.inquilinoId);
      alertas.push({
        icon: 'alert', color: dias <= 30 ? 'var(--danger)' : 'var(--warning)',
        soft: dias <= 30 ? 'var(--danger-soft)' : 'var(--warning-soft)',
        titulo: `Contrato vence en ${dias} días`,
        sub: inq?.nombre || '—',
        go: () => navegar('alquileres'),
      });
    });

    sel.eventosHoy().slice(0, 3).forEach(e => {
      alertas.push({
        icon: 'calendar', color: 'var(--info)', soft: 'var(--info-soft)',
        titulo: e.titulo,
        sub: `Hoy ${e.hora || ''}`,
        go: () => navegar('agenda'),
      });
    });

    return alertas;
  };

  const refrescarDot = () => {
    const n = sel.proxVencimientos().length + sel.eventosHoy().length;
    dot.style.display = n ? 'block' : 'none';
  };

  const estadoNotif = () => {
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    if (perm === 'granted') {
      return `<div style="padding:.6rem 1rem;background:var(--success-soft);color:var(--success);font-size:.78rem;font-weight:600;display:flex;align-items:center;justify-content:space-between">
        <span>✓ Alertas del sistema activas</span>
        <button id="btnTestSonido" style="font-size:.72rem;padding:2px 8px;border-radius:4px;border:1px solid var(--success);background:transparent;color:var(--success);cursor:pointer">Probar sonido</button>
      </div>`;
    }
    if (perm === 'denied') {
      return `<div id="notifPermisoBox" style="padding:.7rem 1rem;background:var(--danger-soft);color:var(--danger);font-size:.78rem">
        ⚠ Las notificaciones del sistema están bloqueadas en el navegador. Habilitálas en la barra de direcciones.
      </div>`;
    }
    // default — todavía no pidió permiso
    return `<div id="notifPermisoBox" style="padding:.75rem 1rem;background:var(--warning-soft);border-bottom:1px solid var(--border)">
      <div style="font-size:.82rem;font-weight:600;margin-bottom:.4rem">🔔 Activar alertas del sistema</div>
      <div style="font-size:.78rem;color:var(--text-soft);margin-bottom:.6rem">Para recibir notificaciones con sonido cuando llegue la hora de un evento.</div>
      <button id="btnActivarNotif" class="btn btn-primary btn-sm" style="width:100%">Activar alertas y probar sonido</button>
    </div>`;
  };

  const abrir = () => {
    const alertas = construirAlertas();
    panel.innerHTML = `
      <div class="notif-panel">
        <div class="notif-head">
          <strong>Alertas</strong>
          ${alertas.length ? `<span class="badge badge-danger">${alertas.length}</span>` : ''}
        </div>
        ${estadoNotif()}
        <div class="notif-list">
          ${alertas.length ? alertas.map((a, i) => `
            <div class="notif-item" data-i="${i}">
              <span class="ni-icon" style="background:${a.soft};color:${a.color}">${icon(a.icon)}</span>
              <div style="min-width:0">
                <div style="font-weight:600;font-size:.85rem" class="truncate">${esc(a.titulo)}</div>
                <div class="text-xs text-soft truncate">${esc(a.sub)}</div>
              </div>
            </div>`).join('') : `<div class="empty" style="padding:2rem">${icon('check')}<p>Todo al día</p></div>`}
        </div>
      </div>`;
    panel.querySelectorAll('.notif-item').forEach(node => {
      node.addEventListener('click', () => { alertas[+node.dataset.i].go(); panel.innerHTML = ''; });
    });
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.innerHTML) { panel.innerHTML = ''; return; }
    abrir();
    // Botón "Activar alertas del sistema"
    panel.querySelector('#btnActivarNotif')?.addEventListener('click', async () => {
      const result = await pedirPermiso();
      tocar(); // probar sonido inmediatamente
      panel.querySelector('#notifPermisoBox').outerHTML =
        result === 'granted'
          ? `<div style="padding:.75rem 1rem;background:var(--success-soft);color:var(--success);font-size:.82rem;font-weight:600">✓ Alertas del sistema activadas</div>`
          : `<div style="padding:.75rem 1rem;background:var(--danger-soft);color:var(--danger);font-size:.82rem">Permiso denegado. Habilitalo desde la configuración del navegador.</div>`;
    });
    panel.querySelector('#btnTestSonido')?.addEventListener('click', () => tocar());
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown')) panel.innerHTML = ''; });

  refrescarDot();
  subscribe(() => { refrescarDot(); if (panel.innerHTML) abrir(); });
}
