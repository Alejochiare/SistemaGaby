/* ============================================================
   VISTA · Propietarios (Clientes con propiedades)
   ============================================================ */
import { getState, sel, actions, subscribe } from '../store.js';
import { icon, PROP_ESTADOS } from '../config.js';
import { esc, fmtMoneda, fmtFechaCorta, debounce } from '../lib.js';
import { navegar } from '../router.js';
import { openPropietarioForm, openSeguimientoPropietarioForm } from './forms.js';

const OBJETIVO_LABELS = { alquilar: 'Para alquilar', vender: 'Para vender', ambas: 'Alquilar y vender' };
const OBJETIVO_BADGE  = { alquilar: 'badge-info', vender: 'badge-success', ambas: 'badge-warning' };

export default function propietarios(root, param) {
  if (param) return propietarioDetalle(root, param);
  root.innerHTML = `<div class="view" id="vPropietarios"></div>`;
  let filtro = '';
  let objetivoFiltro = '';

  const render = () => {
    const el = root.querySelector('#vPropietarios');
    const activo = el.querySelector('#buscarPropietario');
    const conFoco = !!activo && activo === document.activeElement;
    const selStart = conFoco ? activo.selectionStart : null;
    const selEnd = conFoco ? activo.selectionEnd : null;
    pintarLista(el, filtro, objetivoFiltro);
    if (conFoco) {
      const nuevo = el.querySelector('#buscarPropietario');
      if (nuevo) {
        nuevo.focus();
        nuevo.setSelectionRange(selStart, selEnd);
      }
    }
  };
  render();
  const unsub = subscribe(render);

  root.querySelector('#vPropietarios').addEventListener('input', debounce((e) => {
    if (e.target.id === 'buscarPropietario') { filtro = e.target.value.toLowerCase(); render(); }
  }, 150));
  root.querySelector('#vPropietarios').addEventListener('change', (e) => {
    if (e.target.id === 'filtroObjetivo') { objetivoFiltro = e.target.value; render(); }
  });

  return unsub;
}

function pintarLista(el, filtro, objetivoFiltro) {
  const { propietarios } = getState();
  const lista = propietarios.filter(p => {
    const ok = !filtro || `${p.nombre} ${p.telefono||''} ${p.email||''}`.toLowerCase().includes(filtro);
    const okO = !objetivoFiltro || p.objetivo === objetivoFiltro;
    return ok && okO;
  });

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Clientes con propiedades</h1>
        <p class="view-sub">${propietarios.length} propietario${propietarios.length !== 1 ? 's' : ''} cargado${propietarios.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" id="btnNuevoProp">${icon('plus')} Nuevo propietario</button>
    </div>

    <div class="toolbar">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="buscarPropietario" placeholder="Buscar por nombre, teléfono o email…" value="${esc(filtro)}">
      </div>
      <select id="filtroObjetivo" class="select-sm">
        <option value="">Todos</option>
        <option value="alquilar" ${objetivoFiltro==='alquilar'?'selected':''}>Para alquilar</option>
        <option value="vender"   ${objetivoFiltro==='vender'?'selected':''}>Para vender</option>
        <option value="ambas"    ${objetivoFiltro==='ambas'?'selected':''}>Alquilar y vender</option>
      </select>
    </div>

    ${lista.length ? `
    <div class="card" style="padding:0">
      ${lista.map(p => {
        const props = sel.propiedadesDe(p.id);
        const badgeObj = OBJETIVO_BADGE[p.objetivo] || 'badge-neutral';
        const labelObj = OBJETIVO_LABELS[p.objetivo] || 'Sin definir';
        return `
          <div class="list-row list-row-hover" data-id="${p.id}" style="cursor:pointer">
            <div class="avatar" style="flex-shrink:0;background:linear-gradient(135deg,var(--brand-500),var(--brand-800))">${iniciales(p.nombre)}</div>
            <div class="list-info" style="flex:1;min-width:0">
              <div class="list-name">${esc(p.nombre)}</div>
              <div class="text-xs text-soft truncate">${props.length ? props.map(pr => esc(pr.direccion || pr.tipo || 'Sin dirección')).join(' · ') : 'Sin propiedades vinculadas'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">
              <span class="badge ${badgeObj}">${labelObj}</span>
              ${props.length ? `<span class="badge badge-neutral">${props.length} prop.</span>` : ''}
              ${p.telefono ? `<a class="btn btn-xs btn-ghost" href="https://wa.me/${limpiarTel(p.telefono)}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">${icon('whatsapp')}</a>` : ''}
              <button class="btn btn-xs btn-ghost btn-seg-prop" data-id="${p.id}" title="Registrar contacto" onclick="event.stopPropagation()">${icon('check')}</button>
            </div>
          </div>`;
      }).join('')}
    </div>` : `
    <div class="empty">
      ${icon('briefcase')}
      <h3>No hay propietarios${filtro ? ' con ese criterio' : ''}</h3>
      <p>${filtro ? 'Probá con otro término.' : 'Cargá el primer propietario que quiere alquilar o vender su propiedad.'}</p>
      ${!filtro ? `<button class="btn btn-primary" id="btnNuevoProp2">${icon('plus')} Nuevo propietario</button>` : ''}
    </div>`}`;

  el.querySelector('#btnNuevoProp')?.addEventListener('click', () => openPropietarioForm(null, () => {}));
  el.querySelector('#btnNuevoProp2')?.addEventListener('click', () => openPropietarioForm(null, () => {}));

  el.querySelectorAll('.list-row-hover[data-id]').forEach(row => {
    row.addEventListener('click', () => navegar(`propietarios/${row.dataset.id}`));
  });
  el.querySelectorAll('.btn-seg-prop[data-id]').forEach(btn => {
    btn.addEventListener('click', () => openSeguimientoPropietarioForm(btn.dataset.id));
  });
}

/* ---- Detalle ---- */
async function propietarioDetalle(root, id) {
  root.innerHTML = `<div class="view" id="vPropDet"></div>`;
  const render = () => pintarDetalle(root.querySelector('#vPropDet'), id);
  render();
  return subscribe(render);
}

function pintarDetalle(el, id) {
  const { propietarios, alquileres, ventas } = getState();
  const p = propietarios.find(x => x.id === id);
  if (!p) {
    el.innerHTML = `<div class="view"><div class="empty"><h3>Propietario no encontrado</h3><button class="btn btn-ghost" onclick="history.back()">Volver</button></div></div>`;
    return;
  }

  const props = sel.propiedadesDe(id);
  const segs  = (p.seguimientos || []).slice().reverse();
  const alqsRel = alquileres.filter(a => a.propietarioId === id);
  const vtasRel = ventas.filter(v => v.vendedorId === id);

  el.innerHTML = `
    <div class="view-head">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" onclick="history.back()">${icon('x')}</button>
        <div>
          <h1 class="view-title">${esc(p.nombre)}</h1>
          <p class="view-sub">
            <span class="badge ${OBJETIVO_BADGE[p.objetivo]||'badge-neutral'}">${OBJETIVO_LABELS[p.objetivo]||'Sin definir'}</span>
            <span style="margin-left:.5rem">${props.length} propiedad${props.length !== 1 ? 'es' : ''} vinculada${props.length !== 1 ? 's' : ''}</span>
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" id="btnEditarProp">${icon('edit')} Editar</button>
        <button class="btn btn-primary" id="btnSegProp">${icon('check')} Registrar contacto</button>
      </div>
    </div>

    <div class="two-col-grid">
      <div class="card">
        <div class="card-head"><h3>Datos de contacto</h3></div>
        <div class="card-body">
          ${fila('Teléfono', p.telefono)}
          ${fila('WhatsApp', p.whatsapp)}
          ${fila('Email', p.email)}
          ${fila('DNI', p.dni)}
          ${fila('Origen', p.origen)}
          ${p.notas ? `<div style="margin-top:1rem;padding:1rem;background:var(--surface-2);border-radius:var(--r-sm);font-size:.875rem">${esc(p.notas)}</div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>${icon('home')} Sus propiedades</h3>
          <button class="btn btn-xs btn-ghost" onclick="location.hash='#/propiedades'">${icon('plus')} Cargar propiedad</button>
        </div>
        <div class="card-body" style="padding:0">
          ${props.length ? props.map(pr => {
            const est = PROP_ESTADOS.find(e => e.id === pr.estado);
            return `
              <div class="list-row list-row-hover" style="cursor:pointer" data-prop="${pr.id}">
                <div class="list-info">
                  <div class="list-name">${esc(pr.direccion || pr.tipo || '—')}</div>
                  <div class="text-xs text-soft">${[pr.tipo, pr.barrio, pr.ciudad].filter(Boolean).map(esc).join(' · ')}</div>
                </div>
                <span class="badge ${est?.badge||'badge-neutral'}">${est?.label||pr.estado}</span>
              </div>`;
          }).join('') : `
            <div class="empty-sm" style="text-align:center">
              <p style="margin-bottom:.75rem">Aún no tiene propiedades vinculadas.</p>
              <button class="btn btn-sm btn-primary" onclick="location.hash='#/propiedades'">${icon('plus')} Ir a Propiedades</button>
            </div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Historial de contactos</h3></div>
        <div class="card-body" style="padding:0;max-height:280px;overflow-y:auto">
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
        <div class="card-head"><h3>${icon('key')} Contratos de alquiler</h3></div>
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
        <div class="card-head"><h3>${icon('dollar')} Ventas</h3></div>
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
      <button class="btn btn-danger" id="btnEliminar">${icon('trash')} Eliminar propietario</button>
    </div>`;

  el.querySelector('#btnEditarProp')?.addEventListener('click', () => openPropietarioForm(p, () => {}));
  el.querySelector('#btnSegProp')?.addEventListener('click', () => openSeguimientoPropietarioForm(id));
  el.querySelector('#btnEliminar')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar a ${p.nombre}? Esta acción no se puede deshacer.`)) return;
    await actions.deletePropietario(id);
    navegar('propietarios');
  });
  el.querySelectorAll('[data-prop]').forEach(r => {
    r.addEventListener('click', () => navegar(`propiedades/${r.dataset.prop}`));
  });
}

function fila(label, val) {
  if (!val) return '';
  return `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;font-size:.875rem"><span class="text-soft" style="min-width:90px">${label}</span><span>${esc(String(val))}</span></div>`;
}

function iniciales(nombre = '') {
  return nombre.split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('');
}

function limpiarTel(t = '') { return t.replace(/\D/g, ''); }
