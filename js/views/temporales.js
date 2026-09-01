/* ============================================================
   VISTA · Alquileres Temporales
   ============================================================ */
import { getState, actions, subscribe } from '../store.js';
import { icon } from '../config.js';
import { esc, fmtFechaCorta, fmtMontoInput, valorMonto } from '../lib.js';
import { openModal } from '../components/modal.js';

const ESTADOS = [
  { id: 'confirmado', label: 'Confirmado', color: 'var(--primary)' },
  { id: 'activo',     label: 'Activo',     color: 'var(--success)' },
  { id: 'completado', label: 'Completado', color: 'var(--text-soft)' },
  { id: 'cancelado',  label: 'Cancelado',  color: 'var(--danger)' },
];

function estadoInfo(id) { return ESTADOS.find(e => e.id === id) || ESTADOS[0]; }

function noches(t) {
  if (!t.checkIn || !t.checkOut) return 0;
  const a = new Date(t.checkIn), b = new Date(t.checkOut);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function totalReserva(t) {
  return t.precioTotal || (noches(t) * (t.precioPorNoche || 0));
}

export default function temporales(root) {
  root.innerHTML = `<div class="view" id="vTemp"></div>`;

  let filtro = 'activos'; // 'activos' | 'todos' | 'completados'

  const render = () => pintarTemporales(root.querySelector('#vTemp'), filtro);
  render();
  const unsub = subscribe(render);

  root.querySelector('#vTemp').addEventListener('click', e => {
    if (e.target.closest('#btnNuevoTemp')) { abrirFormTemporal(null, render); return; }

    const pf = e.target.closest('[data-filtro-temp]');
    if (pf) { filtro = pf.dataset.filtroTemp; render(); return; }

    const editar = e.target.closest('[data-editar]');
    if (editar) {
      const t = getState().temporales.find(x => x.id === editar.dataset.editar);
      if (t) abrirFormTemporal(t, render);
      return;
    }
    const eliminar = e.target.closest('[data-eliminar]');
    if (eliminar) {
      if (confirm('¿Eliminar esta reserva?')) actions.deleteTemporal(eliminar.dataset.eliminar);
      return;
    }
    const cambiarEstado = e.target.closest('[data-estado-id]');
    if (cambiarEstado) {
      const { id, estadoId } = cambiarEstado.dataset;
      actions.updateTemporal(id, { estado: estadoId });
      return;
    }
  });

  return unsub;
}

function pintarTemporales(el, filtro) {
  const { temporales, propiedades } = getState();
  const hoy = new Date().toISOString().slice(0, 10);

  const lista = [...temporales].sort((a,b) => (a.checkIn||'').localeCompare(b.checkIn||''));

  const activos     = lista.filter(t => t.estado === 'activo' || t.estado === 'confirmado');
  const completados = lista.filter(t => t.estado === 'completado' || t.estado === 'cancelado');

  const visible = filtro === 'todos' ? lista : filtro === 'completados' ? completados : activos;

  const counts = { activos: activos.length, completados: completados.length, todos: lista.length };

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Temporales</h1>
        <p class="view-sub">${activos.length} reserva${activos.length!==1?'s':''} activa${activos.length!==1?'s':''}</p>
      </div>
      <button class="btn btn-primary" id="btnNuevoTemp">${icon('plus')} Nueva reserva</button>
    </div>

    <!-- PILLS -->
    <div style="display:flex;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
      ${[
        { id:'activos',     label:'Activas / Confirmadas' },
        { id:'completados', label:'Historial' },
        { id:'todos',       label:'Todas' },
      ].map(p => {
        const activo = filtro === p.id;
        return `<button data-filtro-temp="${p.id}" style="
          padding:.35rem .9rem;border-radius:999px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;
          background:${activo?'var(--primary)':'var(--surface-2)'};
          color:${activo?'#fff':'var(--text-soft)'};transition:all .15s">
          ${p.label} <span style="opacity:.7">(${counts[p.id]})</span>
        </button>`;
      }).join('')}
    </div>

    ${visible.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem">
      ${visible.map(t => renderCard(t, propiedades, hoy)).join('')}
    </div>` : `
    <div class="card" style="padding:2.5rem;text-align:center;color:var(--text-faint)">
      <div style="font-size:2rem;margin-bottom:.5rem">🏖</div>
      <div style="font-weight:600;margin-bottom:.25rem">Sin reservas</div>
      <div style="font-size:.82rem">Agregá la primera con el botón de arriba</div>
    </div>`}`;
}

function renderCard(t, propiedades, hoy) {
  const prop  = propiedades.find(p => p.id === t.propiedadId);
  const est   = estadoInfo(t.estado);
  const noct  = noches(t);
  const total = totalReserva(t);
  const senia = t.senia || 0;
  const resta = total - senia;

  const checkInPasado = t.checkIn && t.checkIn <= hoy;
  const checkOutPasado = t.checkOut && t.checkOut <= hoy;

  // Auto-sugerir cambio de estado
  const sugerirActivo     = t.estado === 'confirmado' && checkInPasado && !checkOutPasado;
  const sugerirCompletado = (t.estado === 'activo' || t.estado === 'confirmado') && checkOutPasado;

  return `
    <div class="card" style="padding:0;overflow:hidden">
      <!-- Header con color de estado -->
      <div style="background:color-mix(in srgb,${est.color} 12%,transparent);padding:.85rem 1.1rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:.7rem;font-weight:600;color:${est.color};text-transform:uppercase;letter-spacing:.05em">${est.label}</div>
          <div style="font-weight:700;font-size:.95rem;margin-top:.1rem">${esc(t.huesped || '—')}</div>
        </div>
        <div style="display:flex;gap:.25rem">
          <button class="btn btn-xs btn-ghost" data-editar="${t.id}">${icon('edit')}</button>
          <button class="btn btn-xs btn-ghost" data-eliminar="${t.id}">${icon('trash')}</button>
        </div>
      </div>

      <!-- Cuerpo -->
      <div style="padding:.9rem 1.1rem;display:flex;flex-direction:column;gap:.55rem">
        ${prop ? `<div style="font-size:.82rem;color:var(--text-soft)">${icon('home')} ${esc(prop.direccion)}</div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem">
          <div style="background:var(--surface-2);border-radius:var(--r-sm);padding:.5rem .7rem">
            <div style="font-size:.65rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em">Check-in</div>
            <div style="font-size:.88rem;font-weight:600;margin-top:.1rem">${t.checkIn ? fmtFechaCorta(t.checkIn) : '—'}</div>
          </div>
          <div style="background:var(--surface-2);border-radius:var(--r-sm);padding:.5rem .7rem">
            <div style="font-size:.65rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em">Check-out</div>
            <div style="font-size:.88rem;font-weight:600;margin-top:.1rem">${t.checkOut ? fmtFechaCorta(t.checkOut) : '—'}</div>
          </div>
        </div>

        ${noct ? `<div style="font-size:.78rem;color:var(--text-soft);text-align:center">${noct} noche${noct!==1?'s':''}</div>` : ''}

        <!-- Precio -->
        <div style="border-top:1px solid var(--border);padding-top:.55rem;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:.7rem;color:var(--text-soft)">Total</div>
            <div style="font-size:1.05rem;font-weight:700;color:var(--primary)">${total ? '$' + total.toLocaleString('es-AR') : '—'}</div>
          </div>
          ${senia ? `<div style="text-align:right">
            <div style="font-size:.7rem;color:var(--text-soft)">Seña cobrada</div>
            <div style="font-size:.85rem;font-weight:600;color:var(--success)">$${senia.toLocaleString('es-AR')}</div>
            ${resta > 0 ? `<div style="font-size:.7rem;color:var(--warning)">Resta: $${resta.toLocaleString('es-AR')}</div>` : ''}
          </div>` : ''}
        </div>

        ${t.notas ? `<div style="font-size:.75rem;color:var(--text-soft);font-style:italic">${esc(t.notas)}</div>` : ''}

        <!-- Acciones de estado -->
        ${sugerirCompletado ? `
        <button data-estado-id="completado" data-id="${t.id}" class="btn btn-xs" style="background:var(--success);color:#fff;width:100%;justify-content:center">
          ✓ Marcar como completado
        </button>` : sugerirActivo ? `
        <button data-estado-id="activo" data-id="${t.id}" class="btn btn-xs btn-primary" style="width:100%;justify-content:center">
          Marcar como activo (ya hizo check-in)
        </button>` : ''}
      </div>
    </div>`;
}

/* ---- Formulario ---- */
function abrirFormTemporal(t, onDone) {
  const ed  = !!t; t = t || {};
  const { propiedades } = getState();
  // Solo propiedades habilitadas para temporal
  const propsTemp = propiedades.filter(p => p.habilitadaTemporal);

  openModal({
    title: ed ? 'Editar reserva' : 'Nueva reserva temporal',
    bodyHTML: `
      <form id="fTemp">
        <h3 class="form-section-title">Datos del huésped</h3>
        <div class="form-grid">
          <div class="form-group full">
            <label>Nombre y apellido <span class="req">*</span></label>
            <input name="huesped" value="${esc(t.huesped||'')}" placeholder="Nombre del huésped" autofocus>
          </div>
          <div class="form-group">
            <label>DNI</label>
            <input name="dni" value="${esc(t.dni||'')}" placeholder="Ej. 30123456">
          </div>
          <div class="form-group">
            <label>Teléfono / WhatsApp</label>
            <input name="telefono" value="${esc(t.telefono||'')}" placeholder="Opcional">
          </div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Propiedad y fechas</h3>
        <div class="form-grid">
          <div class="form-group full">
            <label>Propiedad</label>
            <select name="propiedadId">
              <option value="">— Sin asignar —</option>
              ${propsTemp.length
                ? propsTemp.map(p => `<option value="${p.id}" ${t.propiedadId===p.id?'selected':''}>${esc(p.direccion)}</option>`).join('')
                : `<option disabled>No hay propiedades habilitadas para temporales</option>`}
            </select>
            ${!propsTemp.length ? `<p style="font-size:.75rem;color:var(--warning);margin-top:.3rem">Habilitá propiedades para temporales desde la sección Propiedades → editar → Tipo de uso.</p>` : ''}
          </div>
          <div class="form-group">
            <label>Check-in <span class="req">*</span></label>
            <input name="checkIn" id="tCheckIn" type="date" value="${t.checkIn||''}">
          </div>
          <div class="form-group">
            <label>Check-out <span class="req">*</span></label>
            <input name="checkOut" id="tCheckOut" type="date" value="${t.checkOut||''}">
          </div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Precios</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Precio por noche $</label>
            <input name="precioPorNoche" id="tPPN" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(t.precioPorNoche)}">
          </div>
          <div class="form-group">
            <label>Noches</label>
            <input id="tNoches" type="number" readonly style="background:var(--surface-2)" value="">
          </div>
          <div class="form-group">
            <label style="font-weight:700;color:var(--primary)">Total $</label>
            <input name="precioTotal" id="tTotal" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(t.precioTotal)}" style="font-weight:700;font-size:1.05rem">
          </div>
          <div class="form-group">
            <label>Seña cobrada $</label>
            <input name="senia" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(t.senia)}">
          </div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Notas</h3>
        <div class="form-group">
          <textarea name="notas" rows="2">${esc(t.notas||'')}</textarea>
        </div>
      </form>`,
    footerHTML: `
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary" id="btnGuardarTemp">${ed ? 'Guardar cambios' : 'Crear reserva'}</button>`,
    onMount({ overlay, close }) {
      const q = sel => overlay.querySelector(sel);

      const recalcular = () => {
        const ci  = q('#tCheckIn').value;
        const co  = q('#tCheckOut').value;
        const ppn = valorMonto(q('#tPPN').value);
        if (ci && co && co > ci) {
          const n = Math.round((new Date(co) - new Date(ci)) / 86400000);
          q('#tNoches').value = n;
          if (ppn) q('#tTotal').value = fmtMontoInput(n * ppn);
        } else {
          q('#tNoches').value = '';
        }
      };

      q('#tCheckIn').addEventListener('change', recalcular);
      q('#tCheckOut').addEventListener('change', recalcular);
      q('#tPPN').addEventListener('input', recalcular);
      recalcular();

      q('#btnGuardarTemp').addEventListener('click', async () => {
        const get = n => (q(`[name="${n}"]`)?.value || '').trim();
        const num = n => valorMonto(q(`[name="${n}"]`)?.value);

        const huesped  = get('huesped');
        const checkIn  = get('checkIn');
        const checkOut = get('checkOut');
        if (!huesped)             { q('[name="huesped"]').focus(); return; }
        if (!checkIn || !checkOut){ return; }
        if (checkOut <= checkIn)  { alert('El check-out debe ser posterior al check-in'); return; }

        // Estado se calcula automáticamente por fechas
        const hoy = new Date().toISOString().slice(0, 10);
        let estado = 'confirmado';
        if (checkIn <= hoy && checkOut > hoy) estado = 'activo';
        else if (checkOut <= hoy)             estado = 'completado';

        const data = {
          huesped, checkIn, checkOut,
          dni:           get('dni') || null,
          telefono:      get('telefono') || null,
          propiedadId:   get('propiedadId') || null,
          precioPorNoche: num('precioPorNoche') || null,
          precioTotal:   num('precioTotal') || null,
          senia:         num('senia') || null,
          estado,
          notas:         get('notas') || null,
        };

        if (ed) await actions.updateTemporal(t.id, data);
        else    await actions.createTemporal(data);
        close();
        onDone();
      });
    },
  });
}
