/* ============================================================
   FORMS — Modales de alta/edición
   ============================================================ */
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { actions, getState, sel as selStore } from '../store.js';
import { $, esc, garantesDeAlquiler, fmtMontoInput, valorMonto, comprimirImagen, compartirArchivoPorWhatsApp, avisoEnvioWhatsApp, iniciales } from '../lib.js';
import { subirArchivo } from '../data.js';
import { imprimirRecibo, imprimirReciboAdelanto, generarPDFReciboAdelanto, imprimirEntregaContrato, generarPDFEntregaContrato } from '../imprimir.js?v=2';
import {
  TIPOS_CLIENTE, TIPOS_PROPIEDAD, TIPOS_OPERACION, MONEDAS,
  ORIGENES, TIPOS_AJUSTE, FRECUENCIAS_AJUSTE, PROP_ESTADOS,
  VENTA_ESTADOS, TIPOS_EVENTO, icon, DIA_LIMITE_PAGO,
  EXCLUSIVIDAD_VENTA, PLAZOS_COMERCIALIZACION, FRECUENCIAS_RECORDATORIO, FRECUENCIAS_INFORME
} from '../config.js';

const opts = (arr, sel) => arr.map(o => {
  const v = typeof o === 'object' ? o.id : o;
  const l = typeof o === 'object' ? o.label : o;
  return `<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>${l}</option>`;
}).join('');

const clientesOpts = (sel) => getState().clientes
  .map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');

const propietariosOpts = (sel) => (getState().propietarios || [])
  .map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');

const propsOpts = (sel) => getState().propiedades
  .map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.direccion || p.id)}</option>`).join('');

// IDs de propiedades con alquiler activo (no rescindido, no vencido)
function propiedadesAlquiladasActivas(excluirAlqId = null) {
  const { alquileres } = getState();
  const hoy = new Date().toISOString().slice(0, 10);
  const ids = new Set();
  alquileres.forEach(a => {
    if (excluirAlqId && a.id === excluirAlqId) return; // edición del mismo contrato
    if (a.estado === 'rescindido' || a.estado === 'renovado') return;
    if (a.fechaFin && a.fechaFin < hoy) return; // ya venció
    if (a.propiedadId) ids.add(a.propiedadId);
  });
  return ids;
}

// Propiedades filtradas por propietario y tipo de operación
function propsDeOpts(propietarioId, operacion, selId, excluirAlqId = null) {
  const { propiedades } = getState();
  const yaAlquiladas = propiedadesAlquiladasActivas(excluirAlqId);

  const lista = propietarioId
    ? propiedades.filter(p => {
        if (p.propietarioId !== propietarioId) return false;
        if (operacion === 'alquiler') return ['disponible', 'alquilada'].includes(p.estado);
        if (operacion === 'venta')    return ['disponible', 'reservada'].includes(p.estado);
        return true;
      })
    : [];
  if (!lista.length) return '<option value="" disabled>— Primero seleccioná un propietario —</option>';
  return `<option value="">— Seleccionar propiedad —</option>` +
    lista.map(p => {
      const ocupada = operacion === 'alquiler' && yaAlquiladas.has(p.id) && p.id !== selId;
      return `<option value="${p.id}" ${p.id === selId ? 'selected' : ''} ${ocupada ? 'disabled' : ''}>
        ${esc(p.direccion || p.tipo || p.id)}${ocupada ? ' — YA ALQUILADA' : p.estado !== 'disponible' ? ` (${p.estado})` : ''}
      </option>`;
    }).join('');
}

function btnInteresStyle(activo) {
  return activo
    ? 'padding:.5rem 1rem;border-radius:var(--radius-sm);border:2px solid var(--primary);background:var(--primary-soft);color:var(--primary);font-weight:600;cursor:pointer;font-size:.875rem'
    : 'padding:.5rem 1rem;border-radius:var(--radius-sm);border:2px solid var(--border);background:var(--bg-card);color:var(--text-soft);cursor:pointer;font-size:.875rem';
}

/* ============================================================
   CLIENTE
   ============================================================ */
export function openClienteForm(cli = null, onDone) {
  const ed = !!cli; cli = cli || {};
  const interes = cli.interes || 'alquiler';
  const b = cli.busca || {};

  openModal({
    title: ed ? 'Editar cliente' : 'Nuevo cliente', size: 'lg',
    bodyHTML: `
      <form id="cliForm">
        <h3 class="form-section-title">Datos de contacto</h3>
        <div class="form-grid">
          <div class="form-group full"><label>Nombre y apellido <span class="req">*</span></label>
            <input name="nombre" required value="${esc(cli.nombre||'')}" placeholder="Ej. María González" autofocus></div>
          <div class="form-group"><label>DNI</label>
            <input name="dni" value="${esc(cli.dni||'')}" placeholder="Ej. 30123456"></div>
          <div class="form-group"><label>Teléfono / WhatsApp</label>
            <input name="telefono" value="${esc(cli.telefono||'')}" placeholder="351 ..."></div>
          <div class="form-group"><label>Email</label>
            <input name="email" type="email" value="${esc(cli.email||'')}"></div>
          <div class="form-group"><label>Domicilio</label>
            <input name="domicilio" value="${esc(cli.domicilio||'')}" placeholder="Ej. San Martín 123, Metán"></div>
          <div class="form-group"><label>Origen de consulta</label>
            <select name="origen"><option value="">— Seleccionar —</option>${opts(ORIGENES, cli.origen)}</select></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">¿Qué está buscando?</h3>
        <div style="display:flex;gap:.75rem;margin-bottom:1.5rem;flex-wrap:wrap">
          <button type="button" class="interes-btn" data-interes="alquiler" style="${btnInteresStyle(interes==='alquiler')}">🔑 Alquilar</button>
          <button type="button" class="interes-btn" data-interes="compra"   style="${btnInteresStyle(interes==='compra')}">🏠 Comprar</button>
          <button type="button" class="interes-btn" data-interes="otro"     style="${btnInteresStyle(interes==='otro')}">💬 Otro / No sé</button>
        </div>
        <input type="hidden" name="interes" value="${interes}">

        <!-- ALQUILER -->
        <div id="secAlquiler" style="display:${interes==='alquiler'?'block':'none'}">
          <p class="text-xs text-soft" style="margin:-1rem 0 1rem">Completá lo que te dijo. Mejora las sugerencias automáticas.</p>
          <div class="form-grid">
            <div class="form-group"><label>Tipo de propiedad</label>
              <select name="b_tipo"><option value="">— No especificó —</option>${opts(TIPOS_PROPIEDAD, b.tipo)}</select></div>
            <div class="form-group"><label>Pueblo o ciudad</label>
              <input name="b_zona" value="${esc(b.zona||'')}" placeholder="Ej. Güemes, Metán..."></div>
            <div class="form-group"><label>Ambientes mínimo</label>
              <input name="b_ambientes" type="number" min="1" max="10" value="${b.ambientes||''}" placeholder="Ej. 2"></div>
            <div class="form-group"><label>Presupuesto por mes</label>
              <input name="b_presupuesto" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(b.presupuesto)}" placeholder="0"></div>
            <div class="form-group"><label>Moneda</label>
              <select name="b_moneda">${opts(MONEDAS, b.moneda||'ARS')}</select></div>
            <div class="form-group"><label>¿Tiene mascotas?</label>
              <select name="b_mascota">
                <option value="">No lo sé</option>
                <option value="si" ${b.mascota==='si'?'selected':''}>Sí tiene</option>
                <option value="no" ${b.mascota==='no'?'selected':''}>No tiene</option>
              </select></div>
            <div class="form-group"><label>¿Necesita cochera?</label>
              <select name="b_cochera">
                <option value="">No lo sé</option>
                <option value="si" ${b.cochera==='si'?'selected':''}>Sí</option>
                <option value="no" ${b.cochera==='no'?'selected':''}>No</option>
              </select></div>
            <div class="form-group"><label>¿Planta baja?</label>
              <select name="b_plantabaja">
                <option value="">No importa</option>
                <option value="si" ${b.plantabaja==='si'?'selected':''}>Sí, prefiere PB</option>
              </select></div>
            <div class="form-group full"><label>Otras preferencias</label>
              <input name="b_extras" value="${esc(b.extras||'')}" placeholder="Ej. balcón, luminoso, amueblado..."></div>
          </div>
        </div>

        <!-- COMPRA -->
        <div id="secCompra" style="display:${interes==='compra'?'block':'none'}">
          <p class="text-xs text-soft" style="margin:-1rem 0 1rem">Completá lo que te dijo. Mejora las sugerencias automáticas.</p>
          <div class="form-grid">
            <div class="form-group"><label>Tipo de propiedad</label>
              <select name="c_tipo"><option value="">— No especificó —</option>${opts(TIPOS_PROPIEDAD, b.tipo)}</select></div>
            <div class="form-group"><label>Pueblo o ciudad</label>
              <input name="c_zona" value="${esc(b.zona||'')}" placeholder="Ej. Güemes, Metán..."></div>
            <div class="form-group"><label>Ambientes mínimo</label>
              <input name="c_ambientes" type="number" min="1" max="10" value="${b.ambientes||''}" placeholder="Ej. 3"></div>
            <div class="form-group"><label>Presupuesto</label>
              <input name="c_presupuesto" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(b.presupuesto)}" placeholder="0"></div>
            <div class="form-group"><label>Moneda</label>
              <select name="c_moneda">${opts(MONEDAS, b.moneda||'USD')}</select></div>
            <div class="form-group"><label>Superficie mínima (m²)</label>
              <input name="c_m2" type="number" min="0" value="${b.m2||''}" placeholder="Ej. 60"></div>
            <div class="form-group"><label>¿Necesita cochera?</label>
              <select name="c_cochera">
                <option value="">No lo sé</option>
                <option value="si" ${b.cochera==='si'?'selected':''}>Sí</option>
                <option value="no" ${b.cochera==='no'?'selected':''}>No</option>
              </select></div>
            <div class="form-group"><label>¿Uso propio o inversión?</label>
              <select name="c_uso">
                <option value="">No lo sé</option>
                <option value="propio"   ${b.uso==='propio'?'selected':''}>Uso propio</option>
                <option value="inversion"${b.uso==='inversion'?'selected':''}>Inversión</option>
              </select></div>
            <div class="form-group full"><label>Otras preferencias</label>
              <input name="c_extras" value="${esc(b.extras||'')}" placeholder="Ej. jardín, barrio privado, luminoso..."></div>
          </div>
        </div>

        <!-- OTRO -->
        <div id="secOtro" style="display:${interes==='otro'?'block':'none'}">
          <div class="form-group full" style="margin-top:.5rem"><label>Descripción / motivo de consulta</label>
            <textarea name="o_extras" rows="3" placeholder="Contá brevemente qué necesita o por qué consultó...">${esc(b.extras||'')}</textarea></div>
        </div>

      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveCli">${ed ? 'Guardar cambios' : 'Crear cliente'}</button>`,
    onMount(ctx) {
      const secMap = { alquiler: '#secAlquiler', compra: '#secCompra', otro: '#secOtro' };
      ctx.overlay.querySelectorAll('.interes-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.interes;
          ctx.overlay.querySelector('[name="interes"]').value = val;
          ctx.overlay.querySelectorAll('.interes-btn').forEach(b => { b.style.cssText = btnInteresStyle(b.dataset.interes === val); });
          Object.values(secMap).forEach(sel => { const el = ctx.overlay.querySelector(sel); if (el) el.style.display = 'none'; });
          const sec = ctx.overlay.querySelector(secMap[val]);
          if (sec) sec.style.display = 'block';
        });
      });

      $('#saveCli', ctx.overlay).addEventListener('click', async () => {
        const f = $('#cliForm', ctx.overlay);
        if (!f.nombre.value.trim()) { f.nombre.focus(); toast('El nombre es obligatorio', { tipo: 'warning' }); return; }
        const fd = new FormData(f);
        const interesVal = fd.get('interes');

        let buscaData = {};
        if (interesVal === 'alquiler') {
          buscaData = {
            tipo: fd.get('b_tipo') || null, zona: fd.get('b_zona') || null,
            ambientes: fd.get('b_ambientes') ? Number(fd.get('b_ambientes')) : null,
            presupuesto: fd.get('b_presupuesto') ? valorMonto(fd.get('b_presupuesto')) : null,
            moneda: fd.get('b_moneda'),
            mascota: fd.get('b_mascota') || null, cochera: fd.get('b_cochera') || null,
            plantabaja: fd.get('b_plantabaja') || null, extras: fd.get('b_extras') || null,
          };
        } else if (interesVal === 'compra') {
          buscaData = {
            tipo: fd.get('c_tipo') || null, zona: fd.get('c_zona') || null,
            ambientes: fd.get('c_ambientes') ? Number(fd.get('c_ambientes')) : null,
            presupuesto: fd.get('c_presupuesto') ? valorMonto(fd.get('c_presupuesto')) : null,
            moneda: fd.get('c_moneda'),
            m2: fd.get('c_m2') ? Number(fd.get('c_m2')) : null,
            cochera: fd.get('c_cochera') || null, uso: fd.get('c_uso') || null,
            extras: fd.get('c_extras') || null,
          };
        } else {
          buscaData = { extras: fd.get('o_extras') || null };
        }

        const data = {
          nombre: fd.get('nombre').trim(),
          dni: fd.get('dni') || null,
          telefono: fd.get('telefono'),
          email: fd.get('email'),
          domicilio: fd.get('domicilio') || null,
          origen: fd.get('origen'),
          interes: interesVal,
          busca: buscaData,
          tipos: interesVal === 'alquiler' ? ['inquilino'] : interesVal === 'compra' ? ['comprador'] : [],
        };
        if (ed) { await actions.updateCliente(cli.id, data); toast('Cliente actualizado'); }
        else { await actions.createCliente(data); toast('Cliente creado correctamente'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   PROPIETARIO (cliente con propiedad)
   ============================================================ */
export function openPropietarioForm(prop = null, onDone) {
  const ed = !!prop; prop = prop || {};
  openModal({
    title: ed ? 'Editar propietario' : 'Nuevo propietario', size: 'lg',
    bodyHTML: `
      <form id="propOwnerForm" class="form-grid">
        <div class="form-group full"><label>Nombre y apellido <span class="req">*</span></label>
          <input name="nombre" required value="${esc(prop.nombre||'')}" placeholder="Ej. Carlos Rodríguez" autofocus></div>
        <div class="form-group"><label>Teléfono / WhatsApp</label>
          <input name="telefono" value="${esc(prop.telefono||'')}" placeholder="351 ..."></div>
        <div class="form-group"><label>Email</label>
          <input name="email" type="email" value="${esc(prop.email||'')}"></div>
        <div class="form-group"><label>DNI</label>
          <input name="dni" value="${esc(prop.dni||'')}"></div>
        <div class="form-group"><label>Origen de contacto</label>
          <select name="origen"><option value="">— Seleccionar —</option>${opts(ORIGENES, prop.origen)}</select></div>
        <div class="form-group full">
          <label>¿Qué quiere hacer con su propiedad? <span class="req">*</span></label>
          <select name="objetivo" required>
            <option value="">— Seleccionar —</option>
            <option value="alquilar" ${prop.objetivo==='alquilar'?'selected':''}>Quiere alquilar</option>
            <option value="vender"   ${prop.objetivo==='vender'?'selected':''}>Quiere vender</option>
            <option value="ambas"    ${prop.objetivo==='ambas'?'selected':''}>Alquilar y/o vender</option>
          </select>
        </div>
        <div class="form-group full"><label>Notas</label>
          <textarea name="notas" rows="2" placeholder="Observaciones importantes sobre el propietario...">${esc(prop.notas||'')}</textarea></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="savePropOwner">${ed?'Guardar cambios':'Crear propietario'}</button>`,
    onMount(ctx) {
      ctx.overlay.querySelector('#savePropOwner').addEventListener('click', async () => {
        const f = ctx.overlay.querySelector('#propOwnerForm');
        if (!f.nombre.value.trim()) { f.nombre.focus(); toast('El nombre es obligatorio', { tipo: 'warning' }); return; }
        if (!f.objetivo.value) { toast('Indicá qué quiere hacer con su propiedad', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        if (ed) { await actions.updatePropietario(prop.id, data); toast('Propietario actualizado'); }
        else { await actions.createPropietario(data); toast('Propietario creado correctamente'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

export function openSeguimientoPropietarioForm(propietarioId, onDone) {
  const p = (getState().propietarios || []).find(x => x.id === propietarioId);
  openModal({
    title: `Registrar contacto — ${p?.nombre || ''}`,
    bodyHTML: `
      <form id="segPropForm" class="form-grid">
        <div class="form-group full">
          <label>¿Qué se habló / acordó? <span class="req">*</span></label>
          <textarea id="segPropNota" name="nota" rows="4" placeholder="Ej. Llamó para consultar novedades sobre su propiedad..."></textarea>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveSegProp">Guardar</button>`,
    onMount(ctx) {
      ctx.overlay.querySelector('#segPropNota')?.focus();
      ctx.overlay.querySelector('#saveSegProp').addEventListener('click', async () => {
        const nota = ctx.overlay.querySelector('#segPropNota').value.trim();
        if (!nota) { toast('Escribí una nota', { tipo: 'warning' }); return; }
        await actions.addSeguimientoPropietario(propietarioId, nota);
        toast('Contacto registrado'); ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   SEGUIMIENTO
   ============================================================ */
export function openSeguimientoForm(clienteId, onDone) {
  const cli = getState().clientes.find(c => c.id === clienteId);
  openModal({
    title: `Registrar contacto — ${cli?.nombre || ''}`,
    bodyHTML: `
      <form id="segForm" class="form-grid">
        <div class="form-group full">
          <label>¿Qué se habló / acordó? <span class="req">*</span></label>
          <textarea id="segNota" name="nota" rows="4" placeholder="Ej. Llamada de seguimiento. Está interesado en la propiedad de X, pide visita para el jueves."></textarea>
        </div>
        <div class="form-group full">
          <label>Próximo contacto</label>
          <input name="proximoContacto" type="date">
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveSeg">Guardar</button>`,
    onMount(ctx) {
      ctx.overlay.querySelector('#segNota')?.focus();
      ctx.overlay.querySelector('#saveSeg').addEventListener('click', async () => {
        const f = ctx.overlay.querySelector('#segForm');
        const nota = f.nota.value.trim();
        if (!nota) { toast('Escribí una nota', { tipo: 'warning' }); return; }
        const prox = f.proximoContacto.value || null;
        await actions.addSeguimiento(clienteId, nota);
        if (prox) await actions.updateCliente(clienteId, { proximoContacto: prox });
        toast('Contacto registrado'); ctx.close(); onDone?.();
      });
    }
  });
}

/** Gestiona N filas de propietario dentro del form de propiedad (agregar/quitar/buscar).
 *  El % de cada uno, quién paga comisión y a qué % se configuran al liquidar, no acá —
 *  por eso cada fila sólo administra `propietarioId`, preservando el resto de los campos
 *  (porcentaje, pagaComision, comisionPct) que ya pudieran venir guardados en la propiedad. */
function montarPropietarios(ctx, propietariosIniciales, propietariosList) {
  const ov = ctx.overlay;
  let filas = (propietariosIniciales || []).map(o => ({ ...o }));
  if (!filas.length) filas = [{ propietarioId: '' }];

  const render = () => {
    const blk = ov.querySelector('#propietariosBlk');
    blk.innerHTML = filas.map((f, i) => {
      const p = propietariosList.find(x => x.id === f.propietarioId);
      const avatarHTML = p
        ? `<div class="avatar avatar-sm owner-avatar">${iniciales(p.nombre)}</div>`
        : `<div class="avatar avatar-sm owner-avatar owner-avatar-empty">${icon('users')}</div>`;
      return `
      <div class="owner-row" data-prop-idx="${i}">
        ${avatarHTML}
        <div class="owner-row-field">
          <input class="prop-own-search" autocomplete="off" placeholder="Escribí el nombre del propietario..." value="${esc(p?.nombre || '')}">
          <div class="prop-own-drop" style="display:none"></div>
        </div>
        ${filas.length > 1 ? `<button type="button" class="btn btn-xs btn-ghost btn-del-own" title="Quitar" style="color:var(--danger);flex-shrink:0">${icon('trash')}</button>` : ''}
      </div>`;
    }).join('');

    blk.querySelectorAll('[data-prop-idx]').forEach(row => {
      const i = Number(row.dataset.propIdx);
      const inp  = row.querySelector('.prop-own-search');
      const drop = row.querySelector('.prop-own-drop');
      const renderDrop = (q) => {
        const query = q.toLowerCase().trim();
        const matches = propietariosList.filter(p => p.nombre.toLowerCase().includes(query)).slice(0, 8);
        if (!matches.length || !query) { drop.style.display = 'none'; return; }
        drop.innerHTML = matches.map(p => `
          <div data-id="${p.id}" class="owner-row-drop-item">
            ${esc(p.nombre)}${p.telefono ? `<span style="color:var(--text-soft);font-size:.75rem"> · ${esc(p.telefono)}</span>` : ''}
          </div>`).join('');
        drop.style.display = 'block';
        drop.querySelectorAll('[data-id]').forEach(el => {
          el.addEventListener('mousedown', () => {
            filas[i].propietarioId = el.dataset.id;
            render();
          });
        });
      };
      inp.addEventListener('input', () => { filas[i].propietarioId = ''; renderDrop(inp.value); });
      inp.addEventListener('blur',  () => setTimeout(() => { drop.style.display = 'none'; }, 150));
      inp.addEventListener('focus', () => { if (inp.value) renderDrop(inp.value); });
      row.querySelector('.btn-del-own')?.addEventListener('click', () => { filas.splice(i, 1); render(); });
    });
  };

  ov.querySelector('#btnAddPropietario').addEventListener('click', () => {
    filas.push({ propietarioId: '' });
    render();
  });

  render();

  return {
    getPropietarios: () => filas.filter(f => f.propietarioId),
  };
}

/* ============================================================
   PROPIEDAD
   ============================================================ */
export function openPropForm(prop = null, onDone) {
  const ed = !!prop; prop = prop || {};
  const propietarios = getState().propietarios || [];

  // Checkboxes de amenities
  const AMENITIES = [
    'Cochera', 'Jardín', 'Piscina', 'Balcón', 'Terraza', 'Quincho',
    'Amueblado', 'Calefacción central', 'Aire acondicionado', 'Gas natural',
    'Agua corriente', 'Cloacas', 'Seguridad / alarma', 'Apto mascotas',
  ];
  const amenSet = new Set((prop.amenities || []));
  const amenHTML = AMENITIES.map(a => `
    <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer">
      <input type="checkbox" name="amenity" value="${a}" ${amenSet.has(a)?'checked':''}> ${a}
    </label>`).join('');

  // Fotos guardadas
  const fotosGuardadas = prop.fotos || [];

  openModal({
    title: ed ? 'Editar propiedad' : 'Nueva propiedad', size: 'lg',
    bodyHTML: `
      <form id="propForm">

        <h3 class="form-section-title">Ubicación</h3>
        <div class="form-grid">
          <div class="form-group full"><label>Dirección <span class="req">*</span></label>
            <input name="direccion" required value="${esc(prop.direccion||'')}" placeholder="Ej. Belgrano 450"></div>
          <div class="form-group"><label>Pueblo / Ciudad</label>
            <input name="ciudad" value="${esc(prop.ciudad||'')}" placeholder="Ej. Güemes"></div>
          <div class="form-group"><label>Provincia</label>
            <input name="provincia" value="${esc(prop.provincia||'')}" placeholder="Ej. Salta"></div>
          <div class="form-group full"><label>Link de Google Maps</label>
            <input name="mapsUrl" value="${esc(prop.mapsUrl||'')}" placeholder="Pegá acá la URL de Google Maps de la ubicación">
            <small class="text-xs text-soft" style="margin-top:.3rem;display:block">Queda guardado como referencia de ubicación de la propiedad.</small></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Datos de la propiedad</h3>
        <div class="form-grid">
          <div class="form-group"><label>N° de carpeta</label>
            <input name="numeroCarpeta" value="${esc(prop.numeroCarpeta||'')}" placeholder="Ej. 1234"></div>
          <div class="form-group"><label>Tipo</label>
            <select name="tipo">${opts(TIPOS_PROPIEDAD, prop.tipo)}</select></div>
          <div class="form-group"><label>Estado</label>
            <select name="estado">${opts(PROP_ESTADOS, prop.estado||'disponible')}</select></div>
          <div class="form-group"><label>Ambientes</label>
            <input name="ambientes" type="number" min="0" value="${prop.ambientes||''}" placeholder="Ej. 3"></div>
          <div class="form-group"><label>Baños</label>
            <input name="banos" type="number" min="0" value="${prop.banos||''}" placeholder="Ej. 1"></div>
          <div class="form-group"><label>Superficie total (m²)</label>
            <input name="m2" type="number" min="0" value="${prop.m2||''}" placeholder="Ej. 80"></div>
          <div class="form-group"><label>Superficie cubierta (m²)</label>
            <input name="m2Cubiertos" type="number" min="0" value="${prop.m2Cubiertos||''}" placeholder="Ej. 65"></div>
          <div class="form-group"><label>Antigüedad (años)</label>
            <input name="antiguedad" type="number" min="0" value="${prop.antiguedad||''}" placeholder="Ej. 10"></div>
          <div class="form-group"><label>Orientación</label>
            <select name="orientacion">
              <option value="">— No especificada —</option>
              ${['Norte','Sur','Este','Oeste','Noreste','Noroeste','Sureste','Suroeste'].map(o=>`<option value="${o}" ${prop.orientacion===o?'selected':''}>${o}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Pisos del edificio</label>
            <input name="pisosEdificio" type="number" min="0" value="${prop.pisosEdificio||''}" placeholder="(si aplica)"></div>
          <div class="form-group"><label>Piso de la unidad</label>
            <input name="pisoUnidad" value="${esc(prop.pisoUnidad||'')}" placeholder="Ej. 2° B"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">¿Qué operaciones quieres hacer con esta propiedad?</h3>
        <div style="display:flex;flex-direction:column;gap:.6rem;margin-bottom:1rem;background:var(--surface-2);padding:1rem;border-radius:var(--r-md);border:1px solid var(--border)">
          <label style="display:flex;align-items:center;gap:.8rem;cursor:pointer;font-size:.92rem;font-weight:500">
            <input type="checkbox" name="habilitadaAlquiler" value="1" ${prop.habilitadaAlquiler!==false?'checked':''} style="width:18px;height:18px;cursor:pointer">
            <span>
              <div style="font-weight:600;color:var(--text)">🔑 Alquilar por mes</div>
              <small style="color:var(--text-soft);display:block;margin-top:.15rem">Alquileres a largo plazo</small>
            </span>
          </label>
          <label style="display:flex;align-items:center;gap:.8rem;cursor:pointer;font-size:.92rem;font-weight:500">
            <input type="checkbox" name="habilitadaTemporal" value="1" ${prop.habilitadaTemporal?'checked':''} style="width:18px;height:18px;cursor:pointer">
            <span>
              <div style="font-weight:600;color:var(--text)">🏖️ Alquiler temporal</div>
              <small style="color:var(--text-soft);display:block;margin-top:.15rem">Alquileres por noche/semana</small>
            </span>
          </label>
          <label style="display:flex;align-items:center;gap:.8rem;cursor:pointer;font-size:.92rem;font-weight:500">
            <input type="checkbox" name="habilitadaVenta" id="chkHabVenta" value="1" ${prop.habilitadaVenta?'checked':''} style="width:18px;height:18px;cursor:pointer">
            <span>
              <div style="font-weight:600;color:var(--text)">🏠 Vender</div>
              <small style="color:var(--text-soft);display:block;margin-top:.15rem">Venta de la propiedad — habilita el circuito de comercialización en "Ventas"</small>
            </span>
          </label>
        </div>

        <div id="blkInfoVenta" style="display:${prop.habilitadaVenta?'block':'none'}">
          <h3 class="form-section-title" style="margin-top:1.5rem">Información de venta</h3>
          <div class="form-grid">
            <div class="form-group"><label>Comisión inmobiliaria (%)</label>
              <input name="comisionInmobiliaria" type="number" min="0" step="0.1" value="${prop.comisionInmobiliaria ?? ''}"></div>
            <div class="form-group"><label>Comisión vendedor (%)</label>
              <input name="comisionVendedor" type="number" min="0" step="0.1" value="${prop.comisionVendedor ?? ''}"></div>
            <div class="form-group"><label>Comisión comprador (%)</label>
              <input name="comisionComprador" type="number" min="0" step="0.1" value="${prop.comisionComprador ?? ''}"></div>
            <div class="form-group"><label>Fecha de publicación</label>
              <input name="fechaPublicacionVenta" type="date" value="${(prop.fechaPublicacionVenta || '').slice(0, 10)}"></div>
            <div class="form-group"><label>Exclusividad</label>
              <select name="exclusividad">${opts(EXCLUSIVIDAD_VENTA, prop.exclusividad || 'exclusiva')}</select></div>
            <div class="form-group"><label>Vencimiento autorización de venta</label>
              <input name="fechaVencimientoAutorizacion" type="date" value="${(prop.fechaVencimientoAutorizacion || '').slice(0, 10)}"></div>
            <div class="form-group"><label>Plazo de comercialización</label>
              <select name="plazoComercializacion" id="selPlazo">${opts(PLAZOS_COMERCIALIZACION, prop.plazoComercializacion || '180')}</select></div>
            <div class="form-group" id="blkPlazoCustom" style="${prop.plazoComercializacion === 'personalizado' ? '' : 'display:none'}">
              <label>Días (personalizado)</label>
              <input name="plazoComercializacionDias" type="number" min="1" value="${prop.plazoComercializacionDias || ''}"></div>
            <div class="form-group"><label>Recordatorio de contacto al propietario</label>
              <select name="frecuenciaRecordatorioDias" id="selFrecRecordatorio">${opts(FRECUENCIAS_RECORDATORIO, prop.frecuenciaRecordatorioDias || '30')}</select></div>
            <div class="form-group" id="blkRecordatorioCustom" style="${prop.frecuenciaRecordatorioDias === 'personalizado' ? '' : 'display:none'}">
              <label>Días (personalizado)</label>
              <input name="frecuenciaRecordatorioDiasCustom" type="number" min="1" value="${prop.frecuenciaRecordatorioDiasCustom || ''}"></div>
            <div class="form-group"><label>Informes automáticos cada</label>
              <select name="frecuenciaInformeDias">${opts(FRECUENCIAS_INFORME, prop.frecuenciaInformeDias || '30')}</select></div>
            <div class="form-group"><label>Estado de conservación</label>
              <select name="estadoConservacion">
                <option value="">— Sin especificar —</option>
                <option value="excelente" ${prop.estadoConservacion === 'excelente' ? 'selected' : ''}>Excelente</option>
                <option value="bueno" ${prop.estadoConservacion === 'bueno' ? 'selected' : ''}>Bueno</option>
                <option value="regular" ${prop.estadoConservacion === 'regular' ? 'selected' : ''}>Regular</option>
                <option value="malo" ${prop.estadoConservacion === 'malo' ? 'selected' : ''}>Malo</option>
              </select></div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;margin-top:1.6rem">
                <input type="checkbox" name="flexiblePropietario" value="1" ${prop.flexiblePropietario ? 'checked' : ''} style="width:16px;height:16px">
                Propietario flexible (precio/condiciones)
              </label>
            </div>
            <div class="form-group full"><label>Descripción optimizada para publicaciones (Meta Ads, Instagram)</label>
              <textarea name="descripcionAds" rows="3" placeholder="Copy corto y atractivo para usar en anuncios pagos y redes.">${esc(prop.descripcionAds || '')}</textarea></div>
          </div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Precios</h3>
        <div class="form-grid">
          <div class="form-group"><label>Precio de alquiler</label>
            <input name="precioAlquiler" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(prop.precioAlquiler)}"></div>
          <div class="form-group"><label>Moneda alquiler</label>
            <select name="monedaAlquiler">${opts(MONEDAS, prop.monedaAlquiler||'ARS')}</select></div>
          <div class="form-group"><label>Precio de venta</label>
            <input name="precioVenta" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(prop.precioVenta)}"></div>
          <div class="form-group"><label>Moneda venta</label>
            <select name="monedaVenta">${opts(MONEDAS, prop.monedaVenta||'USD')}</select></div>
          <div class="form-group"><label>Expensas / mes</label>
            <input name="expensas" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(prop.expensas)}" placeholder="0"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Descripción</h3>
        <div class="form-group">
          <textarea name="descripcion" rows="4"
            placeholder="Descripción completa de la propiedad. Mencioná los puntos fuertes, el entorno, el estado de la propiedad...">${esc(prop.descripcion||'')}</textarea>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Comodidades</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.5rem .75rem;margin-bottom:.5rem">
          ${amenHTML}
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Fotos</h3>
        <div id="fotosPreview" style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem"></div>
        <label style="display:inline-flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.82rem;color:var(--primary);border:1.5px dashed var(--primary);padding:.5rem .9rem;border-radius:var(--r-md)">
          + Agregar fotos
          <input id="inputFotos" type="file" accept="image/*" multiple style="display:none">
        </label>
        <input type="hidden" name="fotosJSON" value="${esc(JSON.stringify(fotosGuardadas))}">
        <p class="text-xs text-soft" style="margin-top:.4rem">La primera foto (marcada como "Portada") es la que se muestra como foto principal.</p>

      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveProp">${ed?'Guardar cambios':'Crear propiedad'}</button>`,
    onMount(ctx) {
      // Mostrar/ocultar la sección de información de venta
      ctx.overlay.querySelector('#chkHabVenta').addEventListener('change', (e) => {
        ctx.overlay.querySelector('#blkInfoVenta').style.display = e.target.checked ? 'block' : 'none';
      });
      ctx.overlay.querySelector('#selPlazo')?.addEventListener('change', (e) => {
        ctx.overlay.querySelector('#blkPlazoCustom').style.display = e.target.value === 'personalizado' ? 'block' : 'none';
      });
      ctx.overlay.querySelector('#selFrecRecordatorio')?.addEventListener('change', (e) => {
        ctx.overlay.querySelector('#blkRecordatorioCustom').style.display = e.target.value === 'personalizado' ? 'block' : 'none';
      });

      // Fotos
      let fotos = [...fotosGuardadas];
      const preview = ctx.overlay.querySelector('#fotosPreview');
      const fotosJSON = ctx.overlay.querySelector('[name="fotosJSON"]');

      const renderFotos = () => {
        preview.innerHTML = fotos.map((f, i) => `
          <div style="position:relative;width:90px;height:70px;border-radius:var(--r-sm);overflow:hidden;background:var(--surface-2);${i===0?'outline:2px solid var(--primary);outline-offset:2px':''}">
            <img src="${esc(f)}" style="width:100%;height:100%;object-fit:cover">
            ${i===0
              ? `<span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);color:#fff;font-size:.6rem;text-align:center;padding:.15rem 0">Portada</span>`
              : `<button type="button" data-portada-foto="${i}" title="Usar como portada"
                  style="position:absolute;bottom:2px;left:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;line-height:1">★</button>`}
            <button type="button" data-del-foto="${i}"
              style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
          </div>`).join('');
        fotosJSON.value = JSON.stringify(fotos);
        preview.querySelectorAll('[data-del-foto]').forEach(btn => {
          btn.addEventListener('click', () => { fotos.splice(Number(btn.dataset.delFoto), 1); renderFotos(); });
        });
        preview.querySelectorAll('[data-portada-foto]').forEach(btn => {
          btn.addEventListener('click', () => {
            const i = Number(btn.dataset.portadaFoto);
            const [chosen] = fotos.splice(i, 1);
            fotos.unshift(chosen);
            renderFotos();
          });
        });
      };

      ctx.overlay.querySelector('#inputFotos').addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        e.target.value = '';
        for (const file of files) {
          try {
            const blob = await comprimirImagen(file);
            fotos.push(await subirArchivo(blob, 'propiedades'));
          } catch {
            toast(`No se pudo subir "${file.name}"`, { tipo: 'warning' });
          }
        }
        renderFotos();
      });

      renderFotos();

      $('#saveProp', ctx.overlay).addEventListener('click', async () => {
        const f = $('#propForm', ctx.overlay);
        if (!f.direccion.value.trim()) { f.direccion.focus(); toast('La dirección es obligatoria', { tipo: 'warning' }); return; }
        const fd = new FormData(f);
        const data = Object.fromEntries(fd.entries());
        // No hay sección de "Propietarios" en este sistema (las propiedades son
        // todas de la misma persona) — se usa siempre el único propietario que
        // se crea en silencio al arrancar la app (ver asegurarPropietarioUnico en store.js).
        const unicoOwnerId = (propietarios[0] || {}).id;
        data.propietarios = unicoOwnerId ? [{ propietarioId: unicoOwnerId, porcentaje: 100 }] : [];
        data.propietarioId = unicoOwnerId || null;
        // Numéricos (cantidades)
        ['ambientes','banos','m2','m2Cubiertos','antiguedad','pisosEdificio'].forEach(k => {
          data[k] = data[k] ? Number(data[k]) : null;
        });
        // Numéricos de venta
        ['comisionInmobiliaria','comisionVendedor','comisionComprador','plazoComercializacionDias','frecuenciaRecordatorioDiasCustom'].forEach(k => {
          data[k] = data[k] ? Number(data[k]) : null;
        });
        // Montos (con formato de miles a limpiar)
        ['precioAlquiler','precioVenta','expensas'].forEach(k => {
          data[k] = data[k] ? valorMonto(data[k]) : null;
        });
        // Amenities (checkboxes múltiples)
        data.amenities = Array.from(ctx.overlay.querySelectorAll('[name="amenity"]:checked')).map(c => c.value);
        // Tipo de uso
        data.habilitadaAlquiler = !!ctx.overlay.querySelector('[name="habilitadaAlquiler"]')?.checked;
        data.habilitadaTemporal = !!ctx.overlay.querySelector('[name="habilitadaTemporal"]')?.checked;
        data.habilitadaVenta = !!ctx.overlay.querySelector('[name="habilitadaVenta"]')?.checked;
        data.flexiblePropietario = !!ctx.overlay.querySelector('[name="flexiblePropietario"]')?.checked;
        // Fotos
        data.fotos = fotos;
        delete data.fotosJSON;
        delete data.amenity;

        if (ed) { await actions.updatePropiedad(prop.id, data); toast('Propiedad actualizada'); }
        else { await actions.createPropiedad(data); toast('Propiedad creada'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/** Gestiona N filas de garante dentro del formulario de contrato (agregar/quitar/editar). */
function montarGarantes(ctx, iniciales) {
  const ov = ctx.overlay;
  let garantes = (iniciales || []).map(g => ({ ...g }));

  const render = () => {
    const blk = ov.querySelector('#garantesBlk');
    if (!garantes.length) {
      blk.innerHTML = `<div style="font-size:.8rem;color:var(--text-soft);padding:.4rem 0">Sin garantes cargados.</div>`;
      return;
    }
    blk.innerHTML = garantes.map((g, i) => `
      <div style="border:1px solid var(--border);border-radius:var(--r-md);padding:.85rem;margin-bottom:.75rem" data-garante-idx="${i}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
          <strong style="font-size:.82rem;color:var(--text-soft)">Garante ${i + 1}</strong>
          <button type="button" class="btn btn-xs btn-ghost" data-del-garante style="color:var(--danger)">${icon('trash')}</button>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Nombre y apellido</label>
            <input data-f="nombre" value="${esc(g.nombre||'')}" placeholder="Nombre completo del garante"></div>
          <div class="form-group"><label>DNI / CUIT</label>
            <input data-f="dni" value="${esc(g.dni||'')}" placeholder="Ej: 30.123.456"></div>
          <div class="form-group"><label>Teléfono / WhatsApp</label>
            <input data-f="telefono" value="${esc(g.telefono||'')}" placeholder="351 ..."></div>
          <div class="form-group"><label>Email</label>
            <input data-f="email" type="email" value="${esc(g.email||'')}"></div>
          <div class="form-group full"><label>Domicilio</label>
            <input data-f="domicilio" value="${esc(g.domicilio||'')}" placeholder="Calle, número, localidad"></div>
          <div class="form-group"><label>Relación con el inquilino</label>
            <input data-f="relacion" value="${esc(g.relacion||'')}" placeholder="Ej: Padre, hermano, empleador..."></div>
          <div class="form-group"><label>Propiedad en garantía</label>
            <input data-f="propiedadGarantia" value="${esc(g.propiedadGarantia||'')}" placeholder="Ej: Bv. San Juan 540, Córdoba"></div>
        </div>
      </div>`).join('');

    blk.querySelectorAll('[data-garante-idx]').forEach(row => {
      const i = Number(row.dataset.garanteIdx);
      row.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('input', () => { garantes[i][inp.dataset.f] = inp.value; });
      });
      row.querySelector('[data-del-garante]').addEventListener('click', () => {
        garantes.splice(i, 1);
        render();
      });
    });
  };

  ov.querySelector('#btnAddGarante').addEventListener('click', () => {
    garantes.push({ nombre: '', dni: '', telefono: '', email: '', domicilio: '', relacion: '', propiedadGarantia: '' });
    render();
  });

  render();

  return {
    getGarantes: () => garantes.filter(g => Object.values(g).some(v => v && String(v).trim())),
  };
}

/* ============================================================
   ALQUILER
   ============================================================ */
/** Calcula la cantidad de meses de duración entre dos fechas (inicio y fin de contrato). */
function mesesEntreFechas(inicio, fin) {
  if (!inicio || !fin) return '';
  const ini = new Date(inicio + 'T00:00:00');
  const finAjustado = new Date(fin + 'T00:00:00');
  finAjustado.setDate(finAjustado.getDate() + 1); // el fin de contrato es el día previo al cumplimiento del mes
  const meses = (finAjustado.getFullYear() - ini.getFullYear()) * 12 + (finAjustado.getMonth() - ini.getMonth());
  return meses > 0 ? meses : '';
}

/** Calcula la fecha de fin de contrato a partir de la fecha de inicio y la duración en meses. */
function calcularFechaFin(inicio, duracionMeses) {
  if (!inicio || !duracionMeses) return '';
  const d = new Date(inicio + 'T00:00:00');
  d.setMonth(d.getMonth() + Number(duracionMeses));
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Días de atraso de un cobro: días transcurridos desde el DIA_LIMITE_PAGO del mes hasta la fecha de pago. */
function calcularDiasMora(mes, fechaPago) {
  if (!mes || !fechaPago) return 0;
  const limite = new Date(`${mes}-01T00:00:00`);
  limite.setDate(DIA_LIMITE_PAGO);
  const pago = new Date(fechaPago + 'T00:00:00');
  const dias = Math.round((pago - limite) / 86400000);
  return dias > 0 ? dias : 0;
}

export function openAlquilerForm(alq = null, onDone, formOpts = {}) {
  const renovando = !!formOpts.renovarDeId;
  const ed = !!alq && !renovando; alq = alq || {};
  const { clientes, propietarios, propiedades } = getState();

  const alqInq  = clientes.find(c => c.id === alq.inquilinoId);
  const alqProp = (propietarios || []).find(p => p.id === alq.propietarioId);
  const alqFinca = propiedades.find(p => p.id === alq.propiedadId);

  // Helper para construir el dropdown de búsqueda
  const searchField = ({ id, label, req, value, hidden }) => `
    <div class="form-group" style="position:relative">
      <label>${label}${req ? ' <span class="req">*</span>' : ''}</label>
      <input id="${id}Search" autocomplete="off" placeholder="Escribí para buscar..." value="${esc(value||'')}" style="width:100%">
      <input type="hidden" name="${hidden}" id="${hidden}" value="${esc(alq[hidden]||'')}">
      <div id="${id}Drop" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-md);z-index:60;max-height:180px;overflow-y:auto"></div>
    </div>`;

  openModal({
    title: renovando ? 'Renovar contrato' : (ed ? 'Editar contrato' : 'Nuevo contrato de alquiler'), size: 'lg',
    bodyHTML: `
      <form id="alqForm">
        <h3 class="form-section-title">Partes</h3>
        <div class="form-grid">
          ${searchField({ id:'alqInq',  label:'Inquilino',       req:true,  value:alqInq?.nombre,  hidden:'inquilinoId' })}
          ${searchField({ id:'alqOwn',  label:'Propietario',     req:false, value:alqProp?.nombre, hidden:'propietarioId' })}
          <div class="form-group">
            <label>Propiedad <span class="req">*</span></label>
            <select id="propiedadId" name="propiedadId">
              <option value="">— Seleccionar propiedad —</option>
            </select>
          </div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Condiciones del contrato</h3>
        <div class="form-grid">
          <div class="form-group"><label>Fecha inicio <span class="req">*</span></label>
            <input name="fechaInicio" type="date" value="${(alq.fechaInicio||'').slice(0,10)}" required></div>
          <div class="form-group"><label>Duración (meses) <span class="req">*</span></label>
            <input name="duracionMeses" type="number" min="1" step="1" value="${alq.duracionMeses || mesesEntreFechas(alq.fechaInicio, alq.fechaFin)}" placeholder="Ej: 24" required></div>
          <div class="form-group"><label>Fecha fin</label>
            <input name="fechaFin" type="date" value="${(alq.fechaFin||'').slice(0,10)}" readonly style="background:var(--bg-soft);color:var(--text-soft);cursor:not-allowed"></div>
          <div class="form-group"><label>Monto inicial</label>
            <input name="montoInicial" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(alq.montoInicial)}"></div>
          <div class="form-group"><label>Moneda</label>
            <select name="moneda">${opts(MONEDAS, alq.moneda||'ARS')}</select></div>
          <div class="form-group"><label>Tipo de ajuste</label>
            <select name="tipoAjuste">${opts(TIPOS_AJUSTE, alq.tipoAjuste||'ICL')}</select></div>
          <div class="form-group"><label>Frecuencia de ajuste</label>
            <select name="frecuenciaAjuste">${opts(FRECUENCIAS_AJUSTE, alq.frecuenciaAjuste||6)}</select></div>
          <div class="form-group"><label>% de aumento (si es fijo)</label>
            <input name="porcentajeAjuste" type="number" min="0" step="0.1" value="${alq.porcentajeAjuste||''}" placeholder="Ej: 30"></div>
          <div class="form-group"><label>% de mora por día de atraso</label>
            <input name="pctMora" type="number" min="0" step="0.01" value="${alq.pctMora||''}" placeholder="Ej: 0.5">
            <small style="color:var(--text-soft);display:block;margin-top:.25rem">Se cobra por día desde el ${DIA_LIMITE_PAGO} del mes, sobre el monto vigente del alquiler</small></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Datos del inquilino (contrato)</h3>
        <div class="form-grid">
          <div class="form-group"><label>DNI / CUIT</label>
            <input name="inquilinoDni" value="${esc(alq.inquilinoDni||'')}" placeholder="Ej: 30.123.456"></div>
          <div class="form-group"><label>Teléfono / WhatsApp</label>
            <input name="inquilinoTelefono" value="${esc(alq.inquilinoTelefono||'')}" placeholder="Ej: 351 123 4567"></div>
          <div class="form-group full"><label>Domicilio</label>
            <input name="inquilinoDomicilio" value="${esc(alq.inquilinoDomicilio||'')}" placeholder="Calle, número, localidad"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Datos adicionales</h3>
        <div class="form-grid">
          <div class="form-group"><label>Fecha de firma</label>
            <input name="fechaFirma" type="date" value="${(alq.fechaFirma||'').slice(0,10)}"></div>
          <div class="form-group"><label>Depósito</label>
            <input name="deposito" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(alq.deposito)}"></div>
          <div class="form-group"><label>Comisión (%)</label>
            <input name="comision" type="number" min="0" step="0.5" value="${alq.comision||''}"></div>
          <div class="form-group"><label>Cobra comisión inicial</label>
            <select name="comisionInicial">
              <option value="" ${!alq.comisionInicial ? 'selected' : ''}>No</option>
              <option value="si" ${alq.comisionInicial ? 'selected' : ''}>Sí</option>
            </select></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Garantes</h3>
        <div id="garantesBlk" style="margin-bottom:.5rem"></div>
        <button type="button" id="btnAddGarante" class="btn btn-sm btn-ghost" style="margin-bottom:1.25rem">${icon('plus')} Agregar garante</button>

        <div class="form-grid">
          <div class="form-group full"><label>Notas</label>
            <textarea name="notas">${esc(alq.notas||'')}</textarea></div>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveAlq">${renovando ? 'Guardar renovación' : (ed?'Guardar':'Crear contrato')}</button>`,
    onMount(ctx) {
      // Función genérica de buscador autocomplete
      function makeSearch({ searchId, dropId, hiddenId, lista, labelFn, subFn }) {
        const inp  = ctx.overlay.querySelector(`#${searchId}`);
        const drop = ctx.overlay.querySelector(`#${dropId}`);
        const hid  = ctx.overlay.querySelector(`#${hiddenId}`);

        const show = (q) => {
          const matches = lista.filter(x => labelFn(x).toLowerCase().includes(q.toLowerCase())).slice(0, 8);
          if (!matches.length || !q.trim()) { drop.style.display = 'none'; return; }
          drop.innerHTML = matches.map(x => `
            <div data-id="${x.id}" style="padding:.5rem .9rem;cursor:pointer;font-size:.875rem;border-bottom:1px solid var(--border)">
              ${esc(labelFn(x))}${subFn ? `<span style="color:var(--text-soft);font-size:.75rem"> · ${esc(subFn(x))}</span>` : ''}
            </div>`).join('');
          drop.style.display = 'block';
          drop.querySelectorAll('[data-id]').forEach(el => {
            el.addEventListener('mousedown', () => {
              hid.value   = el.dataset.id;
              inp.value   = labelFn(lista.find(x => x.id === el.dataset.id));
              drop.style.display = 'none';
              // Al elegir propietario, filtrar propiedades
              if (hiddenId === 'propietarioId') refreshProps();
              // Al elegir inquilino, tomar sus datos de contacto automáticamente
              if (hiddenId === 'inquilinoId') autocompletarInquilino(el.dataset.id);
            });
          });
        };
        inp.addEventListener('input', () => { hid.value = ''; show(inp.value); });
        inp.addEventListener('blur',  () => setTimeout(() => { drop.style.display = 'none'; }, 150));
        inp.addEventListener('focus', () => { if (inp.value) show(inp.value); });
      }

      const autocompletarInquilino = (clienteId) => {
        const c = clientes.find(x => x.id === clienteId);
        if (!c) return;
        const f = $('#alqForm', ctx.overlay);
        if (c.dni)       f.inquilinoDni.value = c.dni;
        if (c.telefono)  f.inquilinoTelefono.value = c.telefono;
        if (c.domicilio) f.inquilinoDomicilio.value = c.domicilio;
      };

      const refreshProps = () => {
        const ownId = ctx.overlay.querySelector('#propietarioId')?.value || '';
        const yaAlquiladas = propiedadesAlquiladasActivas(renovando ? formOpts.renovarDeId : (ed ? alq.id : null));
        const lista = propiedades.filter(p => {
          if (ownId && !selStore.propietariosDePropiedad(p).some(o => o.propietarioId === ownId)) return false;
          if (!['disponible', 'alquilada'].includes(p.estado)) return false;
          if (yaAlquiladas.has(p.id) && p.id !== alq.propiedadId) return false;
          return true;
        });
        const sel = ctx.overlay.querySelector('#propiedadId');
        const valActual = sel.value || alq.propiedadId || '';
        sel.innerHTML = `<option value="">— Seleccionar propiedad —</option>` +
          lista.map(p => `<option value="${p.id}" ${p.id === valActual ? 'selected' : ''}>
            ${esc(p.direccion || p.tipo || p.id)}${p.ciudad ? ' · ' + esc(p.ciudad) : ''}
          </option>`).join('');
      };

      makeSearch({
        searchId: 'alqInqSearch', dropId: 'alqInqDrop', hiddenId: 'inquilinoId',
        lista: clientes,
        labelFn: c => c.nombre,
        subFn:   c => c.telefono || '',
      });
      makeSearch({
        searchId: 'alqOwnSearch', dropId: 'alqOwnDrop', hiddenId: 'propietarioId',
        lista: propietarios,
        labelFn: p => p.nombre,
        subFn:   p => p.telefono || '',
      });
      refreshProps();

      // Fecha fin se calcula sola a partir de la fecha de inicio + duración en meses
      const fAlq = $('#alqForm', ctx.overlay);
      const recalcFechaFin = () => {
        fAlq.fechaFin.value = calcularFechaFin(fAlq.fechaInicio.value, fAlq.duracionMeses.value);
      };
      fAlq.fechaInicio.addEventListener('change', recalcFechaFin);
      fAlq.duracionMeses.addEventListener('input', recalcFechaFin);

      const garantesCtl = montarGarantes(ctx, garantesDeAlquiler(alq));

      $('#saveAlq', ctx.overlay).addEventListener('click', async () => {
        const f = $('#alqForm', ctx.overlay);
        recalcFechaFin();
        if (!ctx.overlay.querySelector('#inquilinoId').value) { toast('Seleccioná un inquilino', { tipo: 'warning' }); return; }
        if (!ctx.overlay.querySelector('#propiedadId').value) { toast('Seleccioná una propiedad', { tipo: 'warning' }); return; }
        if (!f.fechaInicio.value || !f.duracionMeses.value) { toast('Fecha de inicio y duración son obligatorias', { tipo: 'warning' }); return; }
        if (!ed) {
          const ocupada = propiedadesAlquiladasActivas(renovando ? formOpts.renovarDeId : null);
          if (ocupada.has(ctx.overlay.querySelector('#propiedadId').value)) {
            toast('Esa propiedad ya tiene un contrato de alquiler activo', { tipo: 'danger' }); return;
          }
        }
        const data = Object.fromEntries(new FormData(f).entries());
        data.duracionMeses = data.duracionMeses ? Number(data.duracionMeses) : null;
        ['comision','porcentajeAjuste','pctMora'].forEach(k => data[k] = data[k] ? Number(data[k]) : null);
        ['montoInicial','deposito'].forEach(k => data[k] = data[k] ? valorMonto(data[k]) : null);
        // Usar comision también como pctHonorarios para liquidaciones
        if (data.comision != null) data.pctHonorarios = data.comision;
        data.comisionInicial = data.comisionInicial === 'si';
        data.frecuenciaAjuste = Number(data.frecuenciaAjuste);
        data.garantes = garantesCtl.getGarantes();
        ['inquilinoDni','inquilinoTelefono','inquilinoDomicilio','fechaFirma']
          .forEach(k => { if (!data[k]) data[k] = null; });
        let resultado;
        if (renovando) { resultado = await actions.renovarAlquiler(formOpts.renovarDeId, data); toast('Contrato renovado correctamente'); }
        else if (ed) { resultado = await actions.updateAlquiler(alq.id, data); toast('Contrato actualizado'); }
        else { resultado = await actions.createAlquiler(data); toast('Contrato creado correctamente'); }
        ctx.close(); onDone?.(resultado);
        // Al crear un contrato nuevo (o renovarlo), ofrecemos imprimir los ejemplares
        // de una — evita tener que volver a buscar el contrato para hacerlo después.
        if (!ed && resultado) openEntregaContratoForm(resultado, () => {});
      });
    }
  });
}

/* ============================================================
   ENTREGA DE EJEMPLARES DEL CONTRATO — quién se lleva cada copia
   impresa (inquilino, propietario, inmobiliaria, etc.), y queda
   registrado en el contrato para saber quién tiene qué.
   ============================================================ */
export function openEntregaContratoForm(alq, onDone) {
  const { clientes, propietarios, propiedades } = getState();
  const inquilino   = clientes.find(c => c.id === alq.inquilinoId);
  const propietario = (propietarios || []).find(p => p.id === alq.propietarioId);
  const propiedad   = propiedades.find(p => p.id === alq.propiedadId);
  const hoy = new Date().toISOString().slice(0, 10);

  openModal({
    title: 'Entregar ejemplar del contrato',
    bodyHTML: `
      <div class="form-grid">
        <p class="text-soft full" style="font-size:.85rem;margin:0 0 .3rem">Elegí a quién le entregás una copia. Se imprime, por cada uno, una constancia de entrega (con las condiciones del contrato) para que la firme al recibirla — y queda registrado en el contrato quién tiene qué.</p>
        <div class="form-group full" style="display:flex;flex-direction:column;gap:.55rem">
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-weight:600">
            <input type="checkbox" name="destInquilino" checked style="width:16px;height:16px;cursor:pointer">
            Inquilino${inquilino?.nombre ? ` (${esc(inquilino.nombre)})` : ''}
          </label>
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-weight:600">
            <input type="checkbox" name="destPropietario" checked style="width:16px;height:16px;cursor:pointer">
            Propietario / Locador${propietario?.nombre ? ` (${esc(propietario.nombre)})` : ''}
          </label>
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-weight:600">
            <input type="checkbox" name="destInmobiliaria" checked style="width:16px;height:16px;cursor:pointer">
            Inmobiliaria
          </label>
        </div>
        <div class="form-group full"><label>Otro destinatario (opcional)</label>
          <input name="otroDestinatario" placeholder="Ej: Garante, Escribanía..."></div>
        <div class="form-group"><label>Fecha de entrega</label>
          <input name="fechaEntrega" type="date" value="${hoy}"></div>
        <div class="form-group full"><label>Notas</label>
          <input name="nota" placeholder="Observaciones opcionales"></div>
      </div>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Ahora no</button>
      <button class="btn btn-ghost" id="waEntrega" style="color:var(--success)">${icon('whatsapp')} Enviar por WhatsApp</button>
      <button class="btn btn-primary" id="saveEntrega">${icon('file')} Imprimir constancia</button>`,
    onMount(ctx) {
      const ov = ctx.overlay;

      const leerDestinatarios = () => {
        const destinatarios = [];
        if (ov.querySelector('[name="destInquilino"]').checked)    destinatarios.push('Locatario');
        if (ov.querySelector('[name="destPropietario"]').checked)  destinatarios.push('Locador');
        if (ov.querySelector('[name="destInmobiliaria"]').checked) destinatarios.push('Inmobiliaria');
        const otro = ov.querySelector('[name="otroDestinatario"]').value.trim();
        if (otro) destinatarios.push(otro);
        return destinatarios;
      };

      $('#saveEntrega', ov).addEventListener('click', async () => {
        const destinatarios = leerDestinatarios();
        if (!destinatarios.length) { toast('Elegí al menos un destinatario', { tipo: 'warning' }); return; }
        const fecha = ov.querySelector('[name="fechaEntrega"]').value || hoy;
        const nota = ov.querySelector('[name="nota"]').value || null;

        imprimirEntregaContrato({ alq, inquilino, propiedad, propietario, destinatarios, fecha, nota });
        await actions.registrarEntregaContrato(alq.id, { fecha, destinatarios, nota });
        toast(`${destinatarios.length} constancia${destinatarios.length !== 1 ? 's' : ''} impresa${destinatarios.length !== 1 ? 's' : ''}`);
        ctx.close(); onDone?.();
      });

      $('#waEntrega', ov).addEventListener('click', async () => {
        const destinatarios = leerDestinatarios();
        if (!destinatarios.length) { toast('Elegí al menos un destinatario', { tipo: 'warning' }); return; }
        const tel = inquilino?.telefono || propietario?.telefono;
        if (!tel) { toast('Cargá un teléfono (inquilino o propietario) para enviar por WhatsApp', { tipo: 'warning' }); return; }
        const fecha = ov.querySelector('[name="fechaEntrega"]').value || hoy;
        const nota = ov.querySelector('[name="nota"]').value || null;
        const texto = `Hola! Te comparto la constancia de entrega del ejemplar del contrato de ${propiedad?.direccion || 'la propiedad'}.`;
        try {
          const blob = await generarPDFEntregaContrato({ alq, inquilino, propiedad, propietario, destinatarios, fecha, nota }, 'entrega-contrato.pdf');
          const resultado = await compartirArchivoPorWhatsApp({ numero: tel, texto, archivo: blob, nombreArchivo: 'entrega-contrato.pdf' });
          await actions.registrarEntregaContrato(alq.id, { fecha, destinatarios, nota });
          const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'la constancia');
          toast(msg, opts); ctx.close(); onDone?.();
        } catch (err) {
          console.error('Error generando o compartiendo la constancia:', err);
          toast('No se pudo generar el PDF para compartir por WhatsApp', { tipo: 'danger' });
        }
      });
    }
  });
}

/** Abre el formulario de contrato precargado con los datos del contrato viejo,
 *  para crear su renovación (nuevo contrato, editable, que reemplaza al anterior). */
export function openRenovacionForm(alqViejo, onDone) {
  const hoy = new Date().toISOString().slice(0, 10);
  const nuevaInicio = alqViejo.fechaFin && alqViejo.fechaFin > hoy
    ? new Date(new Date(alqViejo.fechaFin).getTime() + 86400000).toISOString().slice(0, 10)
    : hoy;
  // Sugerir 1 año de duración por defecto (totalmente editable) para no dejar
  // el campo obligatorio vacío y evitar que la validación bloquee el guardado sin que se note.
  const finSugerida = new Date(nuevaInicio);
  finSugerida.setFullYear(finSugerida.getFullYear() + 1);
  const prefill = {
    ...alqViejo,
    fechaInicio: nuevaInicio,
    fechaFin: finSugerida.toISOString().slice(0, 10),
    fechaFirma: '',
    montoInicial: alqViejo.montoActual ?? alqViejo.montoInicial,
    comisionInicial: false,
  };
  openAlquilerForm(prefill, onDone, { renovarDeId: alqViejo.id });
}

/* ============================================================
   COBRO
   ============================================================ */
export function openCobroForm(alq, onDone, prefill = {}) {
  const hoy = new Date();
  const mesActual = prefill.mes || `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const montoSugerido = prefill.montoAlquiler ?? prefill.monto ?? alq.montoActual ?? alq.montoInicial ?? '';
  // Lo que corresponde cubrir en este registro (el saldo pendiente, si viene de un pago parcial
  // anterior, o el alquiler completo del mes si es la primera vez). Si lo que se tipea en "Monto
  // alquiler" es menor a esto, queda un saldo pendiente que se puede completar después.
  const montoEsperado = Number(montoSugerido) || 0;
  const editCobroId = prefill.cobroId || null;
  const cobroExistente = editCobroId ? (alq.cobros || []).find(c => c.id === editCobroId) : null;
  const pctMora = Number(alq.pctMora) || 0;

  const METODOS = [
    { id: 'Efectivo',      icon: '💵' },
    { id: 'Transferencia', icon: '🏦' },
    { id: 'Cheque',        icon: '📄' },
    { id: 'Débito',        icon: '💳' },
    { id: 'Otro',          icon: '📝' },
  ];

  openModal({
    title: editCobroId ? 'Confirmar cobro' : 'Registrar cobro',
    bodyHTML: `
      <form id="cobroForm">
        <!-- Mes y monto -->
        <div class="form-grid" style="margin-bottom:1.1rem">
          <div class="form-group">
            <label>Mes <span class="req">*</span></label>
            <input name="mes" type="month" value="${mesActual}" required>
          </div>
          <div class="form-group">
            <label>Monto alquiler $${montoEsperado ? ` <span class="text-soft" style="font-weight:400">(corresponde ${fmtMontoInput(montoEsperado)})</span>` : ''}</label>
            <input name="monto" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(montoSugerido)}" style="font-size:1.1rem;font-weight:700">
            <div id="saldoHint" class="text-xs" style="margin-top:.3rem"></div>
          </div>
          <div class="form-group">
            <label>Fecha de pago</label>
            <input name="fechaPago" type="date" value="${hoy.toISOString().slice(0,10)}">
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:.6rem;padding-top:1.6rem">
            <input type="checkbox" name="pagado" id="chkPagado" checked style="width:16px;height:16px;cursor:pointer">
            <label for="chkPagado" style="margin:0;cursor:pointer;font-weight:600">Marcar como pagado</label>
          </div>
        </div>

        <!-- Imputación a caja: hoy vs. el mes que correspondía (para cargar atrasos sin inflar la caja de hoy) -->
        <div style="display:flex;align-items:flex-start;gap:.6rem;padding:.7rem .9rem;margin-bottom:1.1rem;background:var(--surface-2);border-radius:var(--r-md)">
          <input type="checkbox" name="imputarAlMes" id="chkImputarMes" style="width:16px;height:16px;cursor:pointer;margin-top:.15rem">
          <label for="chkImputarMes" style="margin:0;cursor:pointer;font-size:.85rem;line-height:1.35">
            <strong>No sumar este monto a la caja de hoy</strong><br>
            <span style="color:var(--text-soft);font-weight:400">Se va a imputar al mes del alquiler (<strong id="mesImputadoLbl">${mesActual}</strong>) en vez de a la fecha de pago. Usalo para cargar meses atrasados de contratos viejos sin que se sumen al cierre de caja de hoy.</span>
          </label>
        </div>

        <!-- Recargo por mora (solo si el contrato tiene % de mora configurado) -->
        <div id="moraBlk" style="display:none;margin-bottom:1.1rem;padding:.9rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--danger) 10%,transparent);border:1px solid var(--danger)">
          <div style="font-weight:700;margin-bottom:.3rem">⏰ Recargo por mora</div>
          <div style="font-size:.82rem;color:var(--text-soft);margin-bottom:.6rem" id="moraDetalle"></div>
          <div class="form-grid" style="margin-bottom:0">
            <div class="form-group" style="margin:0;max-width:140px">
              <label style="font-size:.72rem">% aplicado</label>
              <input type="number" min="0" step="0.01" id="moraPctInput" style="width:100%">
            </div>
            <div class="form-group" style="margin:0;max-width:180px">
              <label style="font-size:.72rem">Monto de mora $</label>
              <input type="text" inputmode="numeric" class="input-monto" id="moraMontoInput">
            </div>
          </div>
        </div>

        <!-- Comisión inicial (solo si aplica a la cuota N°1) -->
        <div id="comisionInicialBlk" style="display:none;margin-bottom:1.1rem;padding:.9rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--warning) 10%,transparent);border:1px solid var(--warning)">
          <div style="font-weight:700;margin-bottom:.3rem">💼 Comisión por primer mes</div>
          <div style="font-size:.82rem;color:var(--text-soft);margin-bottom:.6rem">Este contrato tiene una comisión inicial pendiente.</div>
          <div class="form-grid" style="margin-bottom:.5rem">
            <div class="form-group"><label>Monto de la comisión $</label>
              <input type="text" inputmode="numeric" class="input-monto" id="comisionInicialMonto" placeholder="Ej: 800.000"></div>
          </div>
          <div style="display:flex;align-items:center;gap:.6rem">
            <input type="checkbox" id="chkComisionInicial" checked style="width:16px;height:16px;cursor:pointer">
            <label for="chkComisionInicial" style="margin:0;cursor:pointer;font-weight:600">Cobrar comisión junto con esta cuota</label>
          </div>
        </div>

        <!-- Otros conceptos (cargos que se suman, ej. gasto de luz, o descuentos que se
             restan del alquiler, ej. una reparación que pagó el inquilino de su bolsillo) -->
        <div style="margin-bottom:1.1rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <label style="font-size:.8rem;font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:.05em">Otros conceptos (opcional)</label>
            <button type="button" id="btnAddItemExtra" class="btn btn-xs btn-ghost">${icon('plus')} Agregar ítem</button>
          </div>
          <div id="itemsExtraBlk"></div>
        </div>

        <!-- Forma de pago (una o varias líneas: efectivo + transferencia, etc.) -->
        <div style="margin-bottom:1.1rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <label style="font-size:.8rem;font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:.05em">Forma de pago</label>
            <button type="button" id="btnAddPago" class="btn btn-xs btn-ghost">${icon('plus')} Dividir pago</button>
          </div>
          <div id="pagosBlk"></div>
        </div>

        <!-- Notas -->
        <div class="form-group">
          <label>Notas adicionales</label>
          <input name="nota" placeholder="Observaciones opcionales">
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveCobro">Registrar cobro</button>`,
    onMount(ctx) {
      const ov = ctx.overlay;
      const mostrarRef = (m) => ['Transferencia','Cheque'].includes(m);
      let pagos = [{ metodoPago: 'Efectivo', monto: montoSugerido || '', referencia: '' }];
      let moraActual = { dias: 0, monto: 0, pct: pctMora };
      let moraMontoManual = false;
      let itemsExtra = (cobroExistente?.itemsExtra || []).map(it => ({ ...it }));
      const totalItemsExtra = () => itemsExtra.reduce((s, it) => s + (it.tipo === 'descuento' ? -1 : 1) * (Number(it.monto) || 0), 0);

      const ITEMS_EXTRA_SUGERIDOS = ['Gasto de luz', 'Gasto de gas', 'Expensas', 'Reparación', 'Otro'];
      const renderItemsExtra = () => {
        const blk = ov.querySelector('#itemsExtraBlk');
        blk.innerHTML = `
          <datalist id="itemsExtraSugeridos">${ITEMS_EXTRA_SUGERIDOS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          ${itemsExtra.map((it, i) => `
          <div style="display:flex;gap:.5rem;align-items:flex-end;margin-bottom:.5rem;flex-wrap:wrap" data-item-row="${i}">
            <div class="form-group" style="margin:0;width:120px">
              <label style="font-size:.72rem">Tipo</label>
              <select data-f="tipo">
                <option value="cargo" ${it.tipo === 'descuento' ? '' : 'selected'}>+ Cargo</option>
                <option value="descuento" ${it.tipo === 'descuento' ? 'selected' : ''}>− Descuento</option>
              </select>
            </div>
            <div class="form-group" style="margin:0;flex:1;min-width:180px">
              <label style="font-size:.72rem">Concepto</label>
              <input type="text" data-f="concepto" list="itemsExtraSugeridos" value="${esc(it.concepto || '')}" placeholder="Ej: Gasto de luz">
            </div>
            <div class="form-group" style="margin:0;width:130px">
              <label style="font-size:.72rem">Monto $</label>
              <input type="text" inputmode="numeric" class="input-monto" data-f="monto" value="${fmtMontoInput(it.monto)}">
            </div>
            <button type="button" class="btn btn-xs btn-ghost" data-del-item="${i}" style="color:var(--danger)">✕</button>
          </div>`).join('')}`;

        blk.querySelectorAll('[data-item-row]').forEach(row => {
          const i = Number(row.dataset.itemRow);
          row.querySelector('[data-f="tipo"]').addEventListener('change', e => { itemsExtra[i].tipo = e.target.value; actualizarMora(); });
          row.querySelector('[data-f="concepto"]').addEventListener('input', e => { itemsExtra[i].concepto = e.target.value; });
          row.querySelector('[data-f="monto"]').addEventListener('input', e => { itemsExtra[i].monto = valorMonto(e.target.value); actualizarMora(); });
        });
        blk.querySelectorAll('[data-del-item]').forEach(btn => {
          btn.addEventListener('click', () => { itemsExtra.splice(Number(btn.dataset.delItem), 1); renderItemsExtra(); actualizarMora(); });
        });
      };

      const blkMora = ov.querySelector('#moraBlk');
      const detalleMora = ov.querySelector('#moraDetalle');
      const inputMoraPct = ov.querySelector('#moraPctInput');
      const inputMoraMonto = ov.querySelector('#moraMontoInput');
      inputMoraPct.value = pctMora || '';

      // El % y el monto de mora se calculan solos, pero quedan editables por si se
      // quiere ajustar o condonar el recargo para un cobro puntual.
      const actualizarSaldoHint = (rentaBase) => {
        const hint = ov.querySelector('#saldoHint');
        if (!hint) return;
        const saldo = Math.round((montoEsperado - rentaBase) * 100) / 100;
        if (montoEsperado > 0 && saldo > 0) {
          hint.style.color = 'var(--warning)';
          hint.textContent = `Queda un saldo pendiente de ${fmtMontoInput(saldo)} — el mes va a figurar como "Parcial" y vas a poder completarlo después.`;
        } else {
          hint.textContent = '';
        }
      };

      const actualizarMora = () => {
        const f = $('#cobroForm', ov);
        const dias = pctMora > 0 ? calcularDiasMora(f.mes.value, f.fechaPago.value) : 0;
        const rentaBase = valorMonto(f.monto.value) || 0;
        actualizarSaldoHint(rentaBase);
        const pctUsado = Number(inputMoraPct.value) || 0;
        const montoCalculado = (dias > 0 && pctUsado > 0) ? Math.round(rentaBase * pctUsado / 100 * dias) : 0;
        if (!moraMontoManual) inputMoraMonto.value = montoCalculado > 0 ? fmtMontoInput(montoCalculado) : '';
        const montoFinal = valorMonto(inputMoraMonto.value) || 0;
        moraActual = { dias, monto: montoFinal, pct: pctUsado };

        if (pctMora > 0 && (dias > 0 || montoFinal > 0)) {
          detalleMora.textContent = `${dias} día${dias === 1 ? '' : 's'} de atraso (vence el día ${DIA_LIMITE_PAGO}) × ${pctUsado}% diario sobre ${fmtMontoInput(rentaBase)} → sugerido $${montoCalculado.toLocaleString('es-AR')}. Podés ajustar el % o el monto antes de guardar.`;
          blkMora.style.display = '';
        } else {
          blkMora.style.display = 'none';
        }
        // Con una sola forma de pago, se mantiene sincronizada con el total (alquiler + mora + otros conceptos)
        if (pagos.length === 1) { pagos[0].monto = rentaBase + montoFinal + totalItemsExtra(); renderPagos(); }
        else actualizarResumen();
      };

      const actualizarResumen = () => {
        const el = ov.querySelector('#pagosResumen');
        if (!el) return;
        const total = valorMonto(ov.querySelector('#cobroForm').monto.value) + (moraActual.monto || 0) + totalItemsExtra();
        const asignado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
        if (pagos.length > 1) {
          const dif = Math.round((total - asignado) * 100) / 100;
          el.textContent = `Asignado: $${asignado.toLocaleString('es-AR')} de $${total.toLocaleString('es-AR')}` +
            (dif !== 0 ? ` · Faltan $${dif.toLocaleString('es-AR')}` : ' · ✓ Coincide');
          el.style.color = dif === 0 ? 'var(--success)' : 'var(--warning)';
        } else {
          el.textContent = '';
        }
      };

      const renderPagos = () => {
        const blk = ov.querySelector('#pagosBlk');
        blk.innerHTML = pagos.map((p, i) => `
          <div style="display:flex;gap:.5rem;align-items:flex-end;margin-bottom:.5rem;flex-wrap:wrap" data-pago-row="${i}">
            <div class="form-group" style="margin:0;min-width:150px">
              <label style="font-size:.72rem">Método</label>
              <select data-f="metodoPago">
                ${METODOS.map(m => `<option value="${m.id}" ${p.metodoPago === m.id ? 'selected' : ''}>${m.icon} ${m.id}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0;width:130px">
              <label style="font-size:.72rem">Monto $</label>
              <input type="text" inputmode="numeric" class="input-monto" data-f="monto" value="${fmtMontoInput(p.monto)}">
            </div>
            ${mostrarRef(p.metodoPago) ? `
            <div class="form-group" style="margin:0;flex:1;min-width:160px">
              <label style="font-size:.72rem">Referencia</label>
              <input type="text" data-f="referencia" value="${esc(p.referencia || '')}" placeholder="Ej: 0000234 · Banco Nación">
            </div>` : ''}
            ${pagos.length > 1 ? `<button type="button" class="btn btn-xs btn-ghost" data-del-pago="${i}" style="color:var(--danger)">✕</button>` : ''}
          </div>`).join('') + `<div id="pagosResumen" style="font-size:.78rem;margin-top:.2rem"></div>`;

        blk.querySelectorAll('[data-pago-row]').forEach(row => {
          const i = Number(row.dataset.pagoRow);
          row.querySelector('[data-f="metodoPago"]').addEventListener('change', e => { pagos[i].metodoPago = e.target.value; renderPagos(); });
          row.querySelector('[data-f="monto"]').addEventListener('input', e => { pagos[i].monto = valorMonto(e.target.value); actualizarResumen(); });
          row.querySelector('[data-f="referencia"]')?.addEventListener('input', e => { pagos[i].referencia = e.target.value; });
        });
        blk.querySelectorAll('[data-del-pago]').forEach(btn => {
          btn.addEventListener('click', () => { pagos.splice(Number(btn.dataset.delPago), 1); renderPagos(); });
        });
        actualizarResumen();
      };

      ov.querySelector('#btnAddPago').addEventListener('click', () => {
        const total = valorMonto(ov.querySelector('#cobroForm').monto.value) + (moraActual.monto || 0) + totalItemsExtra();
        const asignado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
        const restante = Math.max(0, total - asignado);
        const usados = pagos.map(p => p.metodoPago);
        const siguiente = METODOS.find(m => !usados.includes(m.id))?.id || 'Transferencia';
        pagos.push({ metodoPago: siguiente, monto: restante || '', referencia: '' });
        renderPagos();
      });

      ov.querySelector('#btnAddItemExtra').addEventListener('click', () => {
        itemsExtra.push({ concepto: '', monto: '', tipo: 'cargo' });
        renderItemsExtra();
      });

      $('#cobroForm', ov).monto.addEventListener('input', actualizarMora);
      $('#cobroForm', ov).fechaPago.addEventListener('change', actualizarMora);
      $('#cobroForm', ov).mes.addEventListener('change', actualizarMora);
      inputMoraPct.addEventListener('input', actualizarMora);
      inputMoraMonto.addEventListener('input', () => { moraMontoManual = true; actualizarMora(); });

      renderItemsExtra();
      renderPagos();
      actualizarMora();

      // Mostrar el bloque de comisión inicial solo para la cuota del mes de inicio del contrato
      const elegibleComision = !!alq.comisionInicial && !alq.comisionInicialCobrada;
      const blkComision = ov.querySelector('#comisionInicialBlk');
      const actualizarBlkComision = () => {
        const esPrimeraCuota = $('#cobroForm', ov).mes.value === (alq.fechaInicio || '').slice(0, 7);
        blkComision.style.display = (elegibleComision && esPrimeraCuota) ? '' : 'none';
      };
      actualizarBlkComision();
      $('#cobroForm', ov).mes.addEventListener('change', actualizarBlkComision);

      const mesImputadoLbl = ov.querySelector('#mesImputadoLbl');
      $('#cobroForm', ov).mes.addEventListener('change', e => {
        if (mesImputadoLbl) mesImputadoLbl.textContent = e.target.value;
      });

      $('#saveCobro', ov).addEventListener('click', async () => {
        const f = $('#cobroForm', ov);
        if (!f.mes.value) { toast('Indicá el mes', { tipo: 'warning' }); return; }
        actualizarMora();

        const pagosValidos = pagos.filter(p => Number(p.monto) > 0)
          .map(p => ({ metodoPago: p.metodoPago, monto: Number(p.monto), referencia: p.referencia || null }));
        if (!pagosValidos.length) { toast('Indicá el monto de al menos una forma de pago', { tipo: 'warning' }); return; }

        const rentaBase = f.monto.value ? valorMonto(f.monto.value) : 0;
        const itemsValidos = itemsExtra
          .filter(it => Number(it.monto) > 0)
          .map(it => ({ concepto: (it.concepto || '').trim() || 'Otro', monto: Number(it.monto), tipo: it.tipo === 'descuento' ? 'descuento' : 'cargo' }));
        const totalConMora = rentaBase + (moraActual.monto || 0) + itemsValidos.reduce((s, it) => s + (it.tipo === 'descuento' ? -it.monto : it.monto), 0);
        if (totalConMora < 0) {
          toast('Los descuentos no pueden superar el monto a cobrar', { tipo: 'warning' });
          return;
        }
        if (pagosValidos.length > 1) {
          const suma = pagosValidos.reduce((s, p) => s + p.monto, 0);
          if (Math.round(suma * 100) !== Math.round(totalConMora * 100)) {
            toast('La suma de las formas de pago no coincide con el monto total (alquiler + mora + otros conceptos)', { tipo: 'warning' });
            return;
          }
        }

        const metodoResumen = pagosValidos.length > 1
          ? pagosValidos.map(p => p.metodoPago).join(' + ')
          : pagosValidos[0].metodoPago;

        // Si lo que se tipeó es menos de lo que corresponde a este mes, queda un saldo pendiente:
        // el mes no se cierra como pagado del todo, y ese resto se va a poder completar después
        // (con su propia mora si se termina pagando fuera de término).
        const saldoPendiente = Math.max(0, Math.round((montoEsperado - rentaBase) * 100) / 100);
        const esParcial = montoEsperado > 0 && saldoPendiente > 0 && f.pagado.checked;
        // Si ya venía un pago parcial de antes (pagado:true), lo cobrado ahora se SUMA a lo que ya
        // había entrado (para que "Total cobrado" del contrato no pierda el primer abono), y el
        // "corresponde" del mes se mantiene fijo en el alquiler original (no en el saldo restante).
        const yaVeniaPagado = !!cobroExistente?.pagado;
        const montoEsperadoMes = yaVeniaPagado ? (cobroExistente.montoEsperado ?? montoEsperado) : (montoEsperado || rentaBase);

        const cobro = {
          mes:            f.mes.value,
          monto:          (yaVeniaPagado ? (cobroExistente.monto || 0) : 0) + totalConMora,
          montoAlquiler:  (yaVeniaPagado ? (cobroExistente.montoAlquiler || 0) : 0) + rentaBase,
          montoEsperado:  montoEsperadoMes,
          saldoPendiente,
          parcial:        esParcial,
          fechaPago:      f.fechaPago.value || null,
          pagado:         f.pagado.checked,
          imputarAlMes:   f.imputarAlMes.checked,
          metodoPago:     metodoResumen,
          referencia:     pagosValidos.length === 1 ? pagosValidos[0].referencia : null,
          pagos:          pagosValidos,
          nota:           f.nota.value || null,
        };

        if (moraActual.monto > 0) {
          cobro.diasMora = moraActual.dias;
          cobro.pctMoraAplicado = moraActual.pct;
          cobro.montoMora = moraActual.monto;
        }

        const itemsExtraPrevios = yaVeniaPagado ? (cobroExistente.itemsExtra || []) : [];
        const itemsExtraFinal = [...itemsExtraPrevios, ...itemsValidos];
        if (itemsExtraFinal.length) cobro.itemsExtra = itemsExtraFinal;

        if (blkComision.style.display !== 'none' && ov.querySelector('#chkComisionInicial').checked) {
          const montoComision = valorMonto(ov.querySelector('#comisionInicialMonto').value);
          if (montoComision > 0) cobro.comisionInicialMonto = montoComision;
        }

        // Un mes con saldo pendiente de una vez anterior (pagado:true, saldoPendiente>0) necesita
        // un movimiento de caja nuevo por este abono — updateCobro solo lo crea la primera vez que
        // el mes pasa a pagado, así que para un abono siguiente hay que usar registrarAbonoCobro.
        const completaUnParcialAnterior = editCobroId && cobroExistente?.pagado && cobroExistente?.saldoPendiente > 0;
        if (completaUnParcialAnterior) await actions.registrarAbonoCobro(alq.id, editCobroId, cobro);
        else if (editCobroId) await actions.updateCobro(alq.id, editCobroId, cobro);
        else await actions.addCobro(alq.id, cobro);

        if (esParcial) {
          toast(`Pago parcial registrado — queda un saldo de ${fmtMontoInput(saldoPendiente)}`, { tipo: 'warning', duracion: 6000 });
          // El recibo de este abono se imprime ahora porque el registro se va a actualizar con el
          // próximo pago (y ahí se perdería el detalle de este monto puntual si no quedó impreso).
          imprimirRecibo({
            alq, cobro,
            inquilino: getState().clientes.find(c => c.id === alq.inquilinoId),
            propiedad: getState().propiedades.find(p => p.id === alq.propiedadId),
            propietario: getState().propietarios.find(p => p.id === alq.propietarioId),
          });
        } else if (completaUnParcialAnterior) {
          toast('Pago completado — mes saldado en su totalidad');
          // Este pago termina de cubrir un saldo que había quedado pendiente de un abono
          // anterior. El recibo muestra solo lo cobrado en ESTE pago (no lo acumulado del
          // mes, que ya se recibió y se documentó en el recibo del abono previo).
          imprimirRecibo({
            alq,
            cobro: { ...cobro, monto: totalConMora, montoAlquiler: rentaBase, saldoPendiente: 0, completaParcial: true, itemsExtra: itemsValidos },
            inquilino: getState().clientes.find(c => c.id === alq.inquilinoId),
            propiedad: getState().propiedades.find(p => p.id === alq.propiedadId),
            propietario: getState().propietarios.find(p => p.id === alq.propietarioId),
          });
        } else {
          toast('Cobro registrado');
        }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   ADELANTO DE PAGO — el inquilino paga varios meses de una sola vez
   (ej. un local que paga el contrato completo por adelantado). Registra
   un cobro "pagado" por cada mes cubierto y emite un único recibo que
   detalla todos los meses juntos.
   ============================================================ */
export function openAdelantoForm(alq, mesInicial, onDone) {
  const hoy = new Date().toISOString().slice(0, 10);
  const montoSugerido = alq.montoActual ?? alq.montoInicial ?? '';

  const METODOS = [
    { id: 'Efectivo',      icon: '💵' },
    { id: 'Transferencia', icon: '🏦' },
    { id: 'Cheque',        icon: '📄' },
    { id: 'Débito',        icon: '💳' },
    { id: 'Otro',          icon: '📝' },
  ];

  const sumarMeses = (mes, n) => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, (m - 1) + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  openModal({
    title: 'Adelanto de pago',
    bodyHTML: `
      <form id="adelantoForm" class="form-grid">
        <p class="text-soft full" style="font-size:.85rem;margin:0 0 .3rem">Registrá varios meses pagados juntos (por ejemplo, todo el contrato adelantado) y se emite un único recibo con el detalle mes por mes.</p>
        <div class="form-group"><label>Desde el mes <span class="req">*</span></label>
          <input name="desde" type="month" value="${mesInicial}" required></div>
        <div class="form-group"><label>Cantidad de meses <span class="req">*</span></label>
          <input name="cantidad" type="number" min="1" max="24" value="6" required></div>
        <div class="form-group"><label>Monto mensual $</label>
          <input name="montoMensual" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(montoSugerido)}" style="font-size:1.05rem;font-weight:700"></div>
        <div class="form-group"><label>Fecha de pago</label>
          <input name="fechaPago" type="date" value="${hoy}"></div>
        <div class="form-group"><label>Forma de pago</label>
          <select name="metodoPago">${METODOS.map(m => `<option value="${m.id}">${m.icon} ${m.id}</option>`).join('')}</select></div>
        <div class="form-group" id="refBlk" style="display:none"><label>Referencia</label>
          <input name="referencia" placeholder="Ej: 0000234 · Banco Nación"></div>
        <div class="form-group full"><label>Notas</label>
          <input name="nota" placeholder="Ej: pago adelantado de todo el contrato"></div>
        <div class="form-group full" id="previewAdelanto" style="background:var(--surface-2);border-radius:var(--r-md);padding:.75rem 1rem;font-size:.82rem;line-height:1.6"></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-ghost" id="waAdelanto" style="color:var(--success)">${icon('whatsapp')} Registrar y enviar por WhatsApp</button>
      <button class="btn btn-primary" id="saveAdelanto">${icon('wallet')} Registrar adelanto</button>`,
    onMount(ctx) {
      const ov = ctx.overlay;
      const f = $('#adelantoForm', ov);

      const mostrarRef = () => { ov.querySelector('#refBlk').style.display = ['Transferencia', 'Cheque'].includes(f.metodoPago.value) ? '' : 'none'; };
      f.metodoPago.addEventListener('change', mostrarRef);
      mostrarRef();

      const actualizarPreview = () => {
        const desde = f.desde.value;
        const cantidad = Math.max(1, Number(f.cantidad.value) || 0);
        const montoMensual = valorMonto(f.montoMensual.value) || 0;
        const prev = ov.querySelector('#previewAdelanto');
        if (!desde || !cantidad) { prev.innerHTML = ''; return; }

        const cobrosExistentes = alq.cobros || [];
        const metaMeses = Array.from({ length: cantidad }, (_, i) => sumarMeses(desde, i));
        const yaPagados = metaMeses.filter(m => cobrosExistentes.find(c => c.mes === m)?.pagado);
        const aRegistrar = metaMeses.filter(m => !yaPagados.includes(m));
        const total = aRegistrar.length * montoMensual;

        prev.innerHTML = `
          <div><strong>${aRegistrar.length}</strong> mes${aRegistrar.length !== 1 ? 'es' : ''} a registrar como pagado${aRegistrar.length !== 1 ? 's' : ''} (${mesLabelCorta(metaMeses[0])} a ${mesLabelCorta(metaMeses.at(-1))}) · Total: <strong>${fmtMontoInput(total)}</strong></div>
          ${yaPagados.length ? `<div style="color:var(--warning);margin-top:.2rem">⚠ ${yaPagados.length} de esos meses ya estaban pagados y no se van a duplicar.</div>` : ''}`;
      };
      function mesLabelCorta(mes) {
        if (!mes) return '—';
        const [y, m] = mes.split('-');
        const n = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        return `${n[+m - 1]} ${y}`;
      }
      ['desde', 'cantidad', 'montoMensual'].forEach(name => f[name].addEventListener('input', actualizarPreview));
      actualizarPreview();

      /* Valida y registra los cobros del adelanto; devuelve los datos para el recibo o null si falló. */
      async function registrarAdelanto() {
        const desde = f.desde.value;
        const cantidad = Math.max(1, Number(f.cantidad.value) || 0);
        const montoMensual = valorMonto(f.montoMensual.value) || 0;
        if (!desde) { toast('Indicá desde qué mes empieza el adelanto', { tipo: 'warning' }); return null; }
        if (!montoMensual) { toast('Indicá el monto mensual', { tipo: 'warning' }); return null; }

        const metaMeses = Array.from({ length: cantidad }, (_, i) => sumarMeses(desde, i));
        const cobrosExistentes = alq.cobros || [];
        const yaPagados = metaMeses.filter(m => cobrosExistentes.find(c => c.mes === m)?.pagado);
        const meses = metaMeses.filter(m => !yaPagados.includes(m));
        if (!meses.length) { toast('Todos esos meses ya estaban pagados', { tipo: 'warning' }); return null; }

        const adelantoId = `adel_${Date.now()}`;
        const referencia = f.referencia.value || null;
        const nota = f.nota.value || null;

        for (const mes of meses) {
          const existente = cobrosExistentes.find(c => c.mes === mes);
          const data = {
            mes, monto: montoMensual, montoAlquiler: montoMensual,
            fechaPago: f.fechaPago.value || hoy, pagado: true, imputarAlMes: false,
            metodoPago: f.metodoPago.value, referencia, nota, adelantoId,
          };
          if (existente) await actions.updateCobro(alq.id, existente.id, data);
          else await actions.addCobro(alq.id, data);
        }

        toast(`Adelanto registrado: ${meses.length} mes${meses.length !== 1 ? 'es' : ''}`);

        const alqFresco = getState().alquileres.find(x => x.id === alq.id);
        return {
          alq: alqFresco,
          cobros: (alqFresco?.cobros || []).filter(c => c.adelantoId === adelantoId),
          inquilino: getState().clientes.find(c => c.id === alq.inquilinoId),
          propiedad: getState().propiedades.find(p => p.id === alq.propiedadId),
          propietario: getState().propietarios.find(p => p.id === alq.propietarioId),
        };
      }

      $('#saveAdelanto', ov).addEventListener('click', async () => {
        const datos = await registrarAdelanto();
        if (!datos) return;
        ctx.close();
        imprimirReciboAdelanto(datos);
        onDone?.();
      });

      $('#waAdelanto', ov).addEventListener('click', async () => {
        const tel = getState().clientes.find(c => c.id === alq.inquilinoId)?.telefono;
        if (!tel) { toast('Cargá el teléfono del inquilino para enviar por WhatsApp', { tipo: 'warning' }); return; }
        const datos = await registrarAdelanto();
        if (!datos) return;
        ctx.close();
        const texto = `Hola${datos.inquilino?.nombre ? ' ' + datos.inquilino.nombre : ''}! Te comparto el recibo de adelanto de alquiler de ${datos.propiedad?.direccion || 'la propiedad'}.`;
        try {
          const blob = await generarPDFReciboAdelanto(datos, 'recibo-adelanto.pdf');
          const resultado = await compartirArchivoPorWhatsApp({ numero: tel, texto, archivo: blob, nombreArchivo: 'recibo-adelanto.pdf' });
          const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'el recibo');
          toast(msg, opts);
        } catch (err) {
          console.error('Error generando o compartiendo el recibo de adelanto:', err);
          toast('No se pudo generar el PDF para compartir por WhatsApp', { tipo: 'danger' });
        }
        onDone?.();
      });
    }
  });
}

/* ============================================================
   VENTA
   ============================================================ */
export function openVentaForm(venta = null, onDone) {
  const ed = !!venta; venta = venta || {};
  openModal({
    title: ed ? 'Editar venta' : 'Nueva venta', size: 'lg',
    bodyHTML: `
      <form id="ventaForm">
        <h3 class="form-section-title">Partes</h3>
        <div class="form-grid">
          <div class="form-group"><label>Comprador <span class="req">*</span></label>
            <select name="compradorId"><option value="">— Seleccionar —</option>${clientesOpts(venta.compradorId)}</select></div>
          <div class="form-group"><label>Vendedor (propietario)</label>
            <select name="vendedorId" id="vtaVendedorId"><option value="">— Ninguno —</option>${propietariosOpts(venta.vendedorId)}</select></div>
          <div class="form-group full"><label>Propiedad <span class="req">*</span></label>
            <select name="propiedadId" id="vtaPropiedadId">${propsDeOpts(venta.vendedorId, 'venta', venta.propiedadId)}</select></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Datos económicos</h3>
        <div class="form-grid">
          <div class="form-group"><label>Precio de venta <span class="req">*</span></label>
            <input name="precio" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(venta.precio)}" required></div>
          <div class="form-group"><label>Moneda</label>
            <select name="moneda">${opts(MONEDAS, venta.moneda||'USD')}</select></div>
          <div class="form-group"><label>Seña</label>
            <input name="sena" type="text" inputmode="numeric" class="input-monto" value="${fmtMontoInput(venta.sena)}"></div>
          <div class="form-group"><label>Comisión (%)</label>
            <input name="comision" type="number" min="0" step="0.5" value="${venta.comision||''}"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Escritura</h3>
        <div class="form-grid">
          <div class="form-group full"><label>Escribano / Escribana</label>
            <input name="escribano" value="${esc(venta.escribano||'')}" placeholder="Nombre del escribano"></div>
          <div class="form-group"><label>Fecha de reserva</label>
            <input name="fechaReserva" type="date" value="${(venta.fechaReserva||'').slice(0,10)}"></div>
          <div class="form-group"><label>Fecha de escritura</label>
            <input name="fechaEscritura" type="date" value="${(venta.fechaEscritura||'').slice(0,10)}"></div>
          <div class="form-group"><label>Estado</label>
            <select name="estado">${opts(VENTA_ESTADOS, venta.estado||'en_curso')}</select></div>
          <div class="form-group full"><label>Notas</label>
            <textarea name="notas">${esc(venta.notas||'')}</textarea></div>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveVenta">${ed?'Guardar':'Registrar venta'}</button>`,
    onMount(ctx) {
      // Actualizar propiedades al cambiar el vendedor
      ctx.overlay.querySelector('#vtaVendedorId')?.addEventListener('change', (e) => {
        const sel = ctx.overlay.querySelector('#vtaPropiedadId');
        sel.innerHTML = propsDeOpts(e.target.value, 'venta', '');
      });

      $('#saveVenta', ctx.overlay).addEventListener('click', async () => {
        const f = $('#ventaForm', ctx.overlay);
        if (!f.compradorId.value) { toast('Seleccioná un comprador', { tipo: 'warning' }); return; }
        if (!f.propiedadId.value) { toast('Seleccioná una propiedad', { tipo: 'warning' }); return; }
        if (!f.precio.value) { toast('El precio es obligatorio', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        data.comision = data.comision ? Number(data.comision) : null;
        ['precio','sena'].forEach(k => data[k] = data[k] ? valorMonto(data[k]) : null);
        if (ed) { await actions.updateVenta(venta.id, data); toast('Venta actualizada'); }
        else { await actions.createVenta(data); toast('Venta registrada correctamente'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   EVENTO DE AGENDA
   ============================================================ */
export function openEventoForm(evento = null, onDone, fechaPre = null) {
  const ed = !!evento; evento = evento || {};
  const hoy = new Date().toISOString().slice(0,10);
  openModal({
    title: ed ? 'Editar evento' : 'Nuevo evento',
    bodyHTML: `
      <form id="eventoForm" class="form-grid">
        <div class="form-group full"><label>Título <span class="req">*</span></label>
          <input name="titulo" required value="${esc(evento.titulo||'')}" placeholder="Ej. Visita departamento centro"></div>
        <div class="form-group"><label>Tipo</label>
          <select name="tipo">${opts(TIPOS_EVENTO, evento.tipo||'visita')}</select></div>
        <div class="form-group"><label>Fecha <span class="req">*</span></label>
          <input name="fecha" type="date" required value="${evento.fecha||fechaPre||hoy}"></div>
        <div class="form-group"><label>Hora</label>
          <input name="hora" type="time" value="${evento.hora||'10:00'}"></div>
        <div class="form-group full"><label>Cliente relacionado</label>
          <select name="clienteId"><option value="">— Ninguno —</option>${clientesOpts(evento.clienteId)}</select></div>
        <div class="form-group full"><label>Propiedad relacionada</label>
          <select name="propiedadId"><option value="">— Ninguna —</option>${propsOpts(evento.propiedadId)}</select></div>
        <div class="form-group full"><label>Notas</label>
          <textarea name="notas" placeholder="Detalles del evento...">${esc(evento.notas||'')}</textarea></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveEvento">${ed?'Guardar':'Crear evento'}</button>`,
    onMount(ctx) {
      $('#saveEvento', ctx.overlay).addEventListener('click', async () => {
        const f = $('#eventoForm', ctx.overlay);
        if (!f.titulo.value.trim()) { f.titulo.focus(); toast('El título es obligatorio', { tipo: 'warning' }); return; }
        if (!f.fecha.value) { toast('La fecha es obligatoria', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        if (!data.clienteId) delete data.clienteId;
        if (!data.propiedadId) delete data.propiedadId;
        if (ed) { await actions.updateEvento(evento.id, data); toast('Evento actualizado'); }
        else { await actions.createEvento(data); toast('Evento creado'); }
        ctx.close(); onDone?.();
      });
    }
  });
}
