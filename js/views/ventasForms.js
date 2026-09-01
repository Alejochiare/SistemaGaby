/* ============================================================
   VENTAS · FORMS — Modales de Documentos, Comercialización,
   Interesados y Contactos para una propiedad marcada para vender.
   (La propiedad en sí se carga y edita desde Propiedades → openPropForm.)
   ============================================================ */
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { actions, getState } from '../store.js';
import { $, esc, fmtMontoInput, valorMonto } from '../lib.js';
import { subirArchivo } from '../data.js';
import {
  TIPOS_PROPIEDAD, TIPOS_DOCUMENTO_VENTA, ESTADOS_DOCUMENTO, CANALES_COMERCIALIZACION,
  ORIGENES_INTERESADO, TIPOS_CONTACTO_INTERESADO, MONEDAS, icon,
} from '../config.js';

const opts = (arr, sel) => arr.map(o => {
  const v = typeof o === 'object' ? o.id : o;
  const l = typeof o === 'object' ? o.label : o;
  return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`;
}).join('');

const DOC_MAX_BYTES = 8 * 1024 * 1024; // 8MB — igual al límite de api/upload.php

/* ============================================================
   DOCUMENTO — checklist de gestión documental de una propiedad en venta
   ============================================================ */
export function openDocumentoForm(propiedadId, doc = null, onDone, presets = {}) {
  const ed = !!doc; doc = doc || {};
  const tipoInicial = doc.tipo || presets.tipo || '';

  openModal({
    title: ed ? 'Editar documento' : 'Agregar documento',
    bodyHTML: `
      <form id="documentoForm" class="form-grid">
        <div class="form-group full"><label>Tipo de documento <span class="req">*</span></label>
          <input name="tipo" list="tiposDocumentoSugeridos" required value="${esc(tipoInicial)}" placeholder="Ej. Escritura">
          <datalist id="tiposDocumentoSugeridos">${TIPOS_DOCUMENTO_VENTA.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
        </div>
        <div class="form-group"><label>Estado</label>
          <select name="estado">${opts(ESTADOS_DOCUMENTO, doc.estado || 'pendiente')}</select></div>
        <div class="form-group full">
          <label>Archivo (PDF o imagen, máx. 3MB)</label>
          <input id="inputArchivoDoc" type="file" accept="application/pdf,image/*">
          <div id="archivoPreview" style="margin-top:.4rem;font-size:.8rem;color:var(--text-soft)">${doc.nombreArchivo ? `📎 ${esc(doc.nombreArchivo)}` : 'Sin archivo adjunto — este documento nunca se hace público, sólo queda guardado acá.'}</div>
        </div>
        <div class="form-group full"><label>Notas</label>
          <textarea name="notas" rows="2">${esc(doc.notas || '')}</textarea></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveDocumento">${ed ? 'Guardar' : 'Agregar'}</button>`,
    onMount(ctx) {
      let url = doc.url || null;
      let nombreArchivo = doc.nombreArchivo || null;
      const preview = ctx.overlay.querySelector('#archivoPreview');

      ctx.overlay.querySelector('#inputArchivoDoc').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > DOC_MAX_BYTES) {
          toast('El archivo pesa más de 8MB. Elegí uno más liviano.', { tipo: 'danger' });
          e.target.value = '';
          return;
        }
        try {
          url = await subirArchivo(file, 'documentos');
          nombreArchivo = file.name;
          preview.textContent = `📎 ${nombreArchivo}`;
        } catch (err) {
          toast(err.message, { tipo: 'danger' });
          e.target.value = '';
        }
      });

      $('#saveDocumento', ctx.overlay).addEventListener('click', async () => {
        const f = $('#documentoForm', ctx.overlay);
        if (!f.tipo.value.trim()) { f.tipo.focus(); toast('Indicá el tipo de documento', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        if (url) { data.url = url; data.nombreArchivo = nombreArchivo; }
        if (ed) { await actions.updateDocumentoPropiedad(propiedadId, doc.id, data); toast('Documento actualizado'); }
        else { await actions.addDocumentoPropiedad(propiedadId, data); toast('Documento agregado'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   COMERCIALIZACIÓN — acciones de marketing de una propiedad en venta
   ============================================================ */
export function openComercializacionForm(propiedadId, accion = null, onDone) {
  const ed = !!accion; accion = accion || {};
  const hoy = new Date().toISOString().slice(0, 10);

  openModal({
    title: ed ? 'Editar acción de comercialización' : 'Registrar acción de comercialización',
    bodyHTML: `
      <form id="mktForm">
        <div class="form-grid">
          <div class="form-group full"><label>Acción <span class="req">*</span></label>
            <input name="accion" list="canalesSugeridos" required value="${esc(accion.accion || '')}" placeholder="Ej. Publicado en sitio web">
            <datalist id="canalesSugeridos">${CANALES_COMERCIALIZACION.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          </div>
          <div class="form-group"><label>Fecha <span class="req">*</span></label>
            <input name="fecha" type="date" required value="${accion.fecha || hoy}"></div>
        </div>
        <div id="blkMetaAds" class="form-grid" style="display:${accion.accion === 'Publicidad Meta Ads' ? 'grid' : 'none'}">
          <div class="form-group"><label>Presupuesto</label>
            <input name="presupuesto" class="input-monto" inputmode="numeric" value="${fmtMontoInput(accion.presupuesto)}"></div>
          <div class="form-group"><label>Fecha de inicio</label>
            <input name="fechaInicio" type="date" value="${accion.fechaInicio || ''}"></div>
          <div class="form-group"><label>Fecha de finalización</label>
            <input name="fechaFin" type="date" value="${accion.fechaFin || ''}"></div>
        </div>
        <div class="form-grid">
          <div class="form-group full"><label>Notas</label>
            <textarea name="notas" rows="2">${esc(accion.notas || '')}</textarea></div>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveMkt">${ed ? 'Guardar' : 'Registrar'}</button>`,
    onMount(ctx) {
      const inpAccion = ctx.overlay.querySelector('[name="accion"]');
      const blkMeta = ctx.overlay.querySelector('#blkMetaAds');
      inpAccion.addEventListener('input', () => {
        blkMeta.style.display = inpAccion.value.trim() === 'Publicidad Meta Ads' ? 'grid' : 'none';
      });

      $('#saveMkt', ctx.overlay).addEventListener('click', async () => {
        const f = $('#mktForm', ctx.overlay);
        if (!f.accion.value.trim()) { f.accion.focus(); toast('Indicá la acción realizada', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        data.presupuesto = data.presupuesto ? valorMonto(data.presupuesto) : '';
        if (!data.presupuesto) delete data.presupuesto;
        if (!data.fechaInicio) delete data.fechaInicio;
        if (!data.fechaFin) delete data.fechaFin;
        if (ed) { await actions.updateComercializacionPropiedad(propiedadId, accion.id, data); toast('Acción actualizada'); }
        else { await actions.addComercializacionPropiedad(propiedadId, data); toast('Acción registrada'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   INTERESADO — ficha de un lead/comprador potencial
   ============================================================ */
export function openInteresadoForm(interesado = null, onDone) {
  const ed = !!interesado; interesado = interesado || {};
  const propiedadesEnVenta = (getState().propiedades || []).filter(p => p.habilitadaVenta);
  const idsIniciales = interesado.propiedadesIds || [];

  openModal({
    title: ed ? 'Editar interesado' : 'Nuevo interesado',
    size: 'lg',
    bodyHTML: `
      <form id="interesadoForm" class="form-grid">
        <div class="form-group full"><label>Nombre <span class="req">*</span></label>
          <input name="nombre" required value="${esc(interesado.nombre || '')}" placeholder="Nombre y apellido"></div>
        <div class="form-group"><label>Teléfono</label><input name="telefono" value="${esc(interesado.telefono || '')}"></div>
        <div class="form-group"><label>WhatsApp</label><input name="whatsapp" value="${esc(interesado.whatsapp || '')}"></div>
        <div class="form-group"><label>Email</label><input name="email" type="email" value="${esc(interesado.email || '')}"></div>
        <div class="form-group"><label>Provincia</label><input name="provincia" value="${esc(interesado.provincia || '')}"></div>
        <div class="form-group"><label>Localidad</label><input name="localidad" value="${esc(interesado.localidad || '')}"></div>
        <div class="form-group"><label>Presupuesto</label>
          <input name="presupuesto" class="input-monto" inputmode="numeric" value="${fmtMontoInput(interesado.presupuesto)}"></div>
        <div class="form-group"><label>Moneda</label><select name="moneda">${opts(MONEDAS, interesado.moneda || 'USD')}</select></div>
        <div class="form-group"><label>Tipo de propiedad buscada</label>
          <select name="tipoBuscado"><option value="">— Sin especificar —</option>${opts(TIPOS_PROPIEDAD, interesado.tipoBuscado)}</select></div>
        <div class="form-group"><label>Origen del lead</label>
          <select name="origen"><option value="">— Sin especificar —</option>${opts(ORIGENES_INTERESADO, interesado.origen)}</select></div>
        <div class="form-group full"><label>Necesidades</label>
          <textarea name="necesidades" rows="2" placeholder="Qué busca, requisitos particulares...">${esc(interesado.necesidades || '')}</textarea></div>
        <div class="form-group full"><label>Observaciones</label>
          <textarea name="observaciones" rows="2">${esc(interesado.observaciones || '')}</textarea></div>
        <div class="form-group full"><label>Propiedades de interés</label>
          <select name="propiedadesIds" multiple size="5" style="height:auto">
            ${propiedadesEnVenta.map(p => `<option value="${p.id}" ${idsIniciales.includes(p.id) ? 'selected' : ''}>${esc(p.direccion)}${p.ciudad ? ' · ' + esc(p.ciudad) : ''}</option>`).join('')}
          </select>
          <small class="text-soft" style="display:block;margin-top:.3rem">Mantené Ctrl (o Cmd) apretado para elegir varias. Solo aparecen las propiedades marcadas para "Vender".</small></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveInteresado">${ed ? 'Guardar' : 'Crear'}</button>`,
    onMount(ctx) {
      $('#saveInteresado', ctx.overlay).addEventListener('click', async () => {
        const f = $('#interesadoForm', ctx.overlay);
        if (!f.nombre.value.trim()) { f.nombre.focus(); toast('El nombre es obligatorio', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        data.presupuesto = valorMonto(data.presupuesto);
        data.propiedadesIds = Array.from(f.propiedadesIds.selectedOptions).map(o => o.value);
        if (ed) { await actions.updateInteresado(interesado.id, data); toast('Interesado actualizado'); }
        else { await actions.createInteresado(data); toast('Interesado creado'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   CONTACTO — historial cronológico de interacciones con un interesado
   ============================================================ */
export function openContactoForm(interesadoId, onDone, presets = {}) {
  const { propiedades, interesados } = getState();
  const interesado = interesados.find(i => i.id === interesadoId);
  const propiedadesDelInteresado = (interesado?.propiedadesIds || []).map(id => propiedades.find(p => p.id === id)).filter(Boolean);
  const hoy = new Date().toISOString().slice(0, 10);
  const horaAhora = new Date().toTimeString().slice(0, 5);

  openModal({
    title: 'Registrar contacto',
    bodyHTML: `
      <form id="contactoForm" class="form-grid">
        <div class="form-group"><label>Fecha <span class="req">*</span></label>
          <input name="fecha" type="date" required value="${presets.fecha || hoy}"></div>
        <div class="form-group"><label>Hora</label>
          <input name="hora" type="time" value="${presets.hora || horaAhora}"></div>
        <div class="form-group"><label>Tipo de contacto</label>
          <select name="tipo">${opts(TIPOS_CONTACTO_INTERESADO, presets.tipo || 'consulta')}</select></div>
        <div class="form-group"><label>Usuario responsable</label>
          <input name="usuario" value="${esc(presets.usuario || '')}" placeholder="Quién hizo el contacto"></div>
        ${propiedadesDelInteresado.length ? `
        <div class="form-group full"><label>Propiedad relacionada (opcional)</label>
          <select name="propiedadId"><option value="">— Ninguna —</option>${propiedadesDelInteresado.map(p => `<option value="${p.id}">${esc(p.direccion)}</option>`).join('')}</select></div>` : ''}
        <div class="form-group full"><label>Observaciones</label>
          <textarea name="observaciones" rows="2" placeholder="Ej. Consultó por WhatsApp, visitó el inmueble, realizó una oferta..."></textarea></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveContacto">Registrar</button>`,
    onMount(ctx) {
      $('#saveContacto', ctx.overlay).addEventListener('click', async () => {
        const f = $('#contactoForm', ctx.overlay);
        if (!f.fecha.value) { toast('La fecha es obligatoria', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        if (!data.propiedadId) delete data.propiedadId;
        await actions.addContactoInteresado(interesadoId, data);
        toast('Contacto registrado');
        ctx.close(); onDone?.();
      });
    }
  });
}
