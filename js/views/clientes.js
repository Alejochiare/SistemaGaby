/* ============================================================
   VISTA · Clientes — lista con seguimiento simple
   ============================================================ */
import { getState, sel, actions, subscribe } from '../store.js';
import { icon } from '../config.js';
import { esc, fmtMoneda, fmtFechaCorta, debounce } from '../lib.js';
import { navegar } from '../router.js';
import { openClienteForm, openSeguimientoForm } from './forms.js';

const INTERES_LABELS = { alquiler: 'Quiere alquilar', compra: 'Quiere comprar', propietario: 'Es propietario' };
const INTERES_BADGE  = { alquiler: 'badge-info', compra: 'badge-success', propietario: 'badge-warning' };

export default function clientes(root, param) {
  if (param) return clienteDetalle(root, param);
  root.innerHTML = `<div class="view" id="vClientes"></div>`;
  let filtro = '';
  let interesFiltro = '';
  let tab = 'buscando';

  const render = () => {
    const el = root.querySelector('#vClientes');
    const activo = el.querySelector('#buscarCliente');
    const conFoco = !!activo && activo === document.activeElement;
    const selStart = conFoco ? activo.selectionStart : null;
    const selEnd = conFoco ? activo.selectionEnd : null;
    pintarLista(el, filtro, interesFiltro, tab);
    if (conFoco) {
      const nuevo = el.querySelector('#buscarCliente');
      if (nuevo) {
        nuevo.focus();
        nuevo.setSelectionRange(selStart, selEnd);
      }
    }
  };
  render();
  const unsub = subscribe(render);

  root.querySelector('#vClientes').addEventListener('input', debounce((e) => {
    if (e.target.id === 'buscarCliente') { filtro = e.target.value.toLowerCase(); render(); }
  }, 150));
  root.querySelector('#vClientes').addEventListener('change', (e) => {
    if (e.target.id === 'filtroInteres') { interesFiltro = e.target.value; render(); }
  });
  root.querySelector('#vClientes').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(); }
  });

  return unsub;
}

function pintarLista(el, filtro, interesFiltro, tab) {
  const { clientes } = getState();
  // "Buscando" = todavía no firmó contrato; "Ya alquilaron" = tiene un alquiler vigente.
  const buscando   = clientes.filter(c => !sel.tieneAlquilerVigente(c.id));
  const alquilaron = clientes.filter(c => sel.tieneAlquilerVigente(c.id));
  const base = tab === 'alquilaron' ? alquilaron : tab === 'todos' ? clientes : buscando;

  let lista = base.filter(c => {
    const ok = !filtro || `${c.nombre} ${c.telefono||''} ${c.email||''} ${c.dni||''}`.toLowerCase().includes(filtro);
    const okI = !interesFiltro || c.interes === interesFiltro;
    return ok && okI;
  });

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Clientes</h1>
        <p class="view-sub">${buscando.length} buscando · ${alquilaron.length} ya alquilaron</p>
      </div>
      <button class="btn btn-primary" id="btnNuevoCliente">${icon('plus')} Nuevo cliente</button>
    </div>

    <div class="tabs" style="margin-bottom:1rem">
      <button class="tab ${tab==='buscando'?'active':''}" data-tab="buscando">Buscando (${buscando.length})</button>
      <button class="tab ${tab==='alquilaron'?'active':''}" data-tab="alquilaron">Ya alquilaron (${alquilaron.length})</button>
      <button class="tab ${tab==='todos'?'active':''}" data-tab="todos">Todos (${clientes.length})</button>
    </div>

    <div class="toolbar">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="buscarCliente" placeholder="Buscar por nombre, teléfono o email…" value="${esc(filtro)}">
      </div>
      <select id="filtroInteres" class="select-sm">
        <option value="">Todos</option>
        <option value="alquiler"    ${interesFiltro==='alquiler'?'selected':''}>Quieren alquilar</option>
        <option value="compra"      ${interesFiltro==='compra'?'selected':''}>Quieren comprar</option>
        <option value="propietario" ${interesFiltro==='propietario'?'selected':''}>Propietarios</option>
      </select>
    </div>

    ${lista.length ? `
    <div class="card" style="padding:0">
      ${lista.map(c => {
        const subLabel = resumenBusca(c);
        const interesLabel = INTERES_LABELS[c.interes];
        const yaAlquilo = sel.tieneAlquilerVigente(c.id);
        return `
          <div class="list-row list-row-hover" data-id="${c.id}" style="cursor:pointer">
            <div class="avatar" style="flex-shrink:0">${iniciales(c.nombre)}</div>
            <div class="list-info" style="flex:1;min-width:0">
              <div class="list-name">${esc(c.nombre)}</div>
              <div class="text-xs text-soft truncate">${subLabel || 'Sin datos de búsqueda'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">
              ${yaAlquilo ? `<span class="badge badge-success">Ya alquiló</span>` : interesLabel ? `<span class="badge ${INTERES_BADGE[c.interes]}">${interesLabel}</span>` : ''}
              ${c.telefono ? `<a class="btn btn-xs btn-ghost" href="https://wa.me/${limpiarTel(c.telefono)}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">${icon('whatsapp')}</a>` : ''}
              <button class="btn btn-xs btn-ghost btn-seg" data-id="${c.id}" title="Registrar contacto" onclick="event.stopPropagation()">${icon('check')}</button>
            </div>
          </div>`;
      }).join('')}
    </div>` : `
    <div class="empty">
      ${icon('users')}
      <h3>No hay clientes${filtro ? ' con ese criterio' : tab === 'alquilaron' ? ' que ya hayan alquilado' : tab === 'buscando' ? ' buscando todavía' : ''}</h3>
      <p>${filtro ? 'Probá con otro término.' : 'Empezá cargando tu primer cliente.'}</p>
      ${!filtro ? `<button class="btn btn-primary" id="btnNuevoCliente2">${icon('plus')} Nuevo cliente</button>` : ''}
    </div>`}`;

  el.querySelector('#btnNuevoCliente')?.addEventListener('click', () => openClienteForm(null, () => {}));
  el.querySelector('#btnNuevoCliente2')?.addEventListener('click', () => openClienteForm(null, () => {}));

  el.querySelectorAll('.list-row-hover[data-id]').forEach(row => {
    row.addEventListener('click', () => navegar(`clientes/${row.dataset.id}`));
  });
  el.querySelectorAll('.btn-seg[data-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSeguimientoForm(btn.dataset.id);
    });
  });
}

function resumenBusca(c) {
  const b = c.busca || {};
  if (c.interes === 'alquiler') {
    const partes = [];
    if (b.tipo) partes.push(b.tipo);
    if (b.zona) partes.push(b.zona);
    if (b.ambientes) partes.push(`${b.ambientes} amb.`);
    if (b.presupuesto) partes.push(`$${Number(b.presupuesto).toLocaleString('es-AR')} ${b.moneda||'ARS'}`);
    return partes.length ? partes.join(' · ') : 'Alquiler — sin detalles';
  }
  if (c.interes === 'compra') {
    const partes = [];
    if (b.tipo) partes.push(b.tipo);
    if (b.zona) partes.push(b.zona);
    if (b.ambientes) partes.push(`${b.ambientes} amb.`);
    if (b.presupuesto) partes.push(`${b.moneda||'USD'} ${Number(b.presupuesto).toLocaleString('es-AR')}`);
    return partes.length ? partes.join(' · ') : 'Compra — sin detalles';
  }
  if (c.interes === 'propietario') {
    const obj = { alquilar: 'quiere alquilar', vender: 'quiere vender', ambas: 'alquilar o vender' };
    return b.descripcion ? esc(b.descripcion) : (obj[b.objetivo] || 'Propietario');
  }
  return '—';
}

/* ---- Detalle de cliente ---- */
async function clienteDetalle(root, id) {
  root.innerHTML = `<div class="view" id="vDetalle"></div>`;
  const render = () => pintarDetalle(root.querySelector('#vDetalle'), id);
  render();
  const unsub = subscribe(render);
  return unsub;
}

function pintarDetalle(el, id) {
  const { clientes, alquileres, ventas } = getState();
  const c = clientes.find(x => x.id === id);
  if (!c) { el.innerHTML = `<div class="view"><div class="empty"><h3>Cliente no encontrado</h3><button class="btn btn-ghost" onclick="history.back()">Volver</button></div></div>`; return; }

  const alqsRel = alquileres.filter(a => a.inquilinoId === id || a.propietarioId === id);
  const vtasRel = ventas.filter(v => v.compradorId === id || v.vendedorId === id);
  const segs = (c.seguimientos || []).slice().reverse();
  const b = c.busca || {};

  el.innerHTML = `
    <div class="view-head">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" onclick="history.back()">${icon('x')}</button>
        <div>
          <h1 class="view-title">${esc(c.nombre)}</h1>
          <p class="view-sub"><span class="badge ${INTERES_BADGE[c.interes]||'badge-neutral'}">${INTERES_LABELS[c.interes]||'Sin clasificar'}</span></p>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" id="btnEditar">${icon('edit')} Editar</button>
        <button class="btn btn-primary" id="btnSeguimiento">${icon('check')} Registrar contacto</button>
      </div>
    </div>

    <div class="two-col-grid">
      <!-- Datos personales -->
      <div class="card">
        <div class="card-head"><h3>Datos de contacto</h3></div>
        <div class="card-body">
          ${fila('Teléfono', c.telefono)}
          ${fila('WhatsApp', c.whatsapp)}
          ${fila('Email', c.email)}
          ${fila('DNI', c.dni)}
          ${c.origen ? fila('Origen', c.origen) : ''}
          ${c.notas ? `<div style="margin-top:1rem;padding:1rem;background:var(--bg-soft);border-radius:var(--radius-sm);font-size:.875rem">${esc(c.notas)}</div>` : ''}
        </div>
      </div>

      <!-- Qué busca -->
      <div class="card">
        <div class="card-head"><h3>${c.interes === 'alquiler' ? '🔑 Busca para alquilar' : '🏠 Busca para comprar'}</h3></div>
        <div class="card-body">
          ${fila('Tipo de propiedad', b.tipo)}
          ${fila('Zona / Barrio', b.zona)}
          ${fila('Ambientes mínimo', b.ambientes ? `${b.ambientes}+` : null)}
          ${fila('Presupuesto', b.presupuesto ? `${b.moneda||''} ${Number(b.presupuesto).toLocaleString('es-AR')}` : null)}
          ${c.interes === 'compra' && b.m2 ? fila('Superficie mín.', `${b.m2} m²`) : ''}
          ${c.interes === 'compra' && b.uso ? fila('Para', b.uso === 'propio' ? 'Uso propio / vivienda' : 'Inversión') : ''}
          ${c.interes === 'alquiler' && b.mascota ? fila('Mascotas', b.mascota === 'si' ? 'Sí tiene' : 'No tiene') : ''}
          ${c.interes === 'alquiler' && b.plantabaja ? fila('Planta baja', b.plantabaja === 'si' ? 'Prefiere PB' : null) : ''}
          ${b.cochera ? fila('Cochera', b.cochera === 'si' ? 'La necesita' : 'No la necesita') : ''}
          ${fila('Otras preferencias', b.extras)}
          ${!b.tipo && !b.zona && !b.presupuesto && !b.ambientes ? '<div class="text-xs text-soft">Sin detalles cargados aún. Editá el cliente para completar.</div>' : ''}
        </div>
      </div>

      <!-- Historial de seguimiento -->
      <div class="card">
        <div class="card-head"><h3>Historial de contactos</h3></div>
        <div class="card-body" style="padding:0;max-height:300px;overflow-y:auto">
          ${segs.length ? segs.map(s => `
            <div class="list-row" style="align-items:flex-start;gap:.75rem">
              <div class="timeline-dot"></div>
              <div>
                <div class="text-xs text-soft">${fmtFechaCorta(s.fecha)}</div>
                <div style="font-size:.875rem;margin-top:.2rem">${esc(s.nota)}</div>
              </div>
            </div>`).join('') : `<div class="empty-sm">Sin contactos registrados</div>`}
        </div>
      </div>

      ${alqsRel.length ? `
      <div class="card">
        <div class="card-head"><h3>${icon('key')} Alquileres relacionados</h3></div>
        <div class="card-body" style="padding:0">
          ${alqsRel.map(a => `
            <div class="list-row">
              <div class="list-info">
                <div class="list-name">${sel.dirPropiedad(a.propiedadId)}</div>
                <div class="text-xs text-soft">${fmtFechaCorta(a.fechaInicio)} → ${fmtFechaCorta(a.fechaFin)}</div>
              </div>
              <span class="badge badge-info">${a.estado}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${vtasRel.length ? `
      <div class="card">
        <div class="card-head"><h3>${icon('dollar')} Ventas relacionadas</h3></div>
        <div class="card-body" style="padding:0">
          ${vtasRel.map(v => `
            <div class="list-row">
              <div class="list-info">
                <div class="list-name">${sel.dirPropiedad(v.propiedadId)}</div>
                <div class="text-xs text-soft">${fmtMoneda(v.precio, v.moneda)}</div>
              </div>
              <span class="badge badge-success">${v.estado}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

    </div>

    <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border)">
      <button class="btn" id="btnEliminar" style="background:var(--danger);color:#fff">${icon('trash')} Eliminar cliente</button>
    </div>`;

  el.querySelector('#btnEditar')?.addEventListener('click', () => openClienteForm(c, () => {}));
  el.querySelector('#btnSeguimiento')?.addEventListener('click', () => openSeguimientoForm(id));
  el.querySelector('#btnEliminar')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar a ${c.nombre}? Esta acción no se puede deshacer.`)) return;
    await actions.deleteCliente(id);
    navegar('clientes');
  });
}

function fila(label, val) {
  if (!val) return '';
  return `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;font-size:.875rem"><span class="text-soft" style="min-width:90px">${label}</span><span>${esc(String(val))}</span></div>`;
}

function iniciales(nombre = '') {
  return nombre.split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('');
}

function limpiarTel(t = '') {
  return t.replace(/\D/g, '');
}
