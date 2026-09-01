/* ============================================================
   VISTA · Generador de Recibo — recibo genérico (no atado a un
   contrato) para cualquier persona cargada en el sistema (clientes
   o propietarios) o para una persona nueva sin cargar.
   ============================================================ */
import { getState } from '../store.js';
import { icon, MONEDAS } from '../config.js';
import { esc, valorMonto, waLink, compartirArchivoPorWhatsApp, avisoEnvioWhatsApp } from '../lib.js';
import { imprimirReciboGeneral, generarPDFReciboGeneral } from '../imprimir.js?v=2';
import { toast } from '../components/toast.js';

const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Débito', 'Otro'];
const CONCEPTOS_SUGERIDOS = ['Pago de alquiler', 'Seña', 'Comisión', 'Pago a cuenta', 'Depósito de garantía', 'Alquiler temporario', 'Venta de propiedad'];

export default function recibos(root) {
  root.innerHTML = `<div class="view" id="vRecibos"></div>`;
  pintar(root.querySelector('#vRecibos'));
}

function pintar(el) {
  const hoy = new Date().toISOString().slice(0, 10);

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Generador de recibo</h1>
        <p class="view-sub">Generá un recibo (original y duplicado) para cualquier persona del sistema o una nueva</p>
      </div>
    </div>

    <div class="card" style="max-width:680px">
      <div class="card-body">
        <form id="reciboForm">
          <div class="form-group" style="position:relative">
            <label>Buscar persona cargada</label>
            <input id="personaSearch" autocomplete="off" placeholder="Escribí un nombre para buscar entre clientes y propietarios…" style="width:100%">
            <div id="personaDrop" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-md);z-index:60;max-height:200px;overflow-y:auto"></div>
            <small class="text-soft" style="display:block;margin-top:.35rem">Si la persona no está cargada, simplemente completá sus datos abajo.</small>
          </div>

          <h3 class="form-section-title" style="margin-top:1.25rem">Datos de la persona</h3>
          <div class="form-grid">
            <div class="form-group full"><label>Nombre y apellido <span class="req">*</span></label>
              <input name="nombre" required placeholder="Ej. María González"></div>
            <div class="form-group"><label>DNI</label>
              <input name="dni" placeholder="Ej. 30.123.456"></div>
            <div class="form-group"><label>Teléfono</label>
              <input name="telefono" placeholder="Ej. 351 123 4567"></div>
            <div class="form-group full"><label>Domicilio</label>
              <input name="domicilio" placeholder="Calle, número, localidad"></div>
          </div>

          <h3 class="form-section-title" style="margin-top:1.25rem">Detalle del recibo</h3>
          <div class="form-grid">
            <div class="form-group full"><label>Concepto <span class="req">*</span></label>
              <input name="concepto" list="conceptosSugeridos" required placeholder="Ej. Pago de alquiler, seña, comisión...">
              <datalist id="conceptosSugeridos">
                ${CONCEPTOS_SUGERIDOS.map(c => `<option value="${esc(c)}">`).join('')}
              </datalist>
            </div>
            <div class="form-group"><label>Monto <span class="req">*</span></label>
              <input name="monto" class="input-monto" inputmode="numeric" required placeholder="0"></div>
            <div class="form-group"><label>Moneda</label>
              <select name="moneda">${MONEDAS.map(m => `<option value="${m}">${m}</option>`).join('')}</select></div>
            <div class="form-group"><label>Forma de pago</label>
              <select name="formaPago">${METODOS_PAGO.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select></div>
            <div class="form-group"><label>Fecha</label>
              <input name="fecha" type="date" value="${hoy}"></div>
            <div class="form-group"><label>Referencia (opcional)</label>
              <input name="referencia" placeholder="Ej. N° de operación / transferencia"></div>
            <div class="form-group full"><label>Observaciones</label>
              <textarea name="nota" rows="2" placeholder="Notas adicionales para el recibo..."></textarea></div>
          </div>

          <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap">
            <button type="submit" class="btn btn-primary" id="btnGenerarRecibo">${icon('file')} Generar recibo (original y duplicado)</button>
            <button type="button" class="btn btn-ghost" id="btnEnviarWA" style="color:var(--success)">${icon('whatsapp')} Enviar por WhatsApp</button>
            <button type="button" class="btn btn-ghost" id="btnLimpiar">Limpiar</button>
          </div>
        </form>
      </div>
    </div>`;

  const form = el.querySelector('#reciboForm');

  /* ---- Buscador autocomplete: clientes + propietarios ---- */
  const { clientes, propietarios } = getState();
  const personas = [
    ...clientes.map(c => ({ ...c, _tipo: 'Cliente' })),
    ...(propietarios || []).map(p => ({ ...p, _tipo: 'Propietario' })),
  ];

  const searchInp = el.querySelector('#personaSearch');
  const drop      = el.querySelector('#personaDrop');

  const mostrarResultados = (q) => {
    const term = q.trim().toLowerCase();
    if (!term) { drop.style.display = 'none'; return; }
    const matches = personas.filter(p => (p.nombre || '').toLowerCase().includes(term)).slice(0, 8);
    if (!matches.length) { drop.style.display = 'none'; return; }
    drop.innerHTML = matches.map((p, i) => `
      <div data-i="${i}" style="padding:.5rem .9rem;cursor:pointer;font-size:.875rem;border-bottom:1px solid var(--border)">
        ${esc(p.nombre)}
        <span style="color:var(--text-soft);font-size:.75rem"> · ${p._tipo}${p.telefono ? ' · ' + esc(p.telefono) : ''}</span>
      </div>`).join('');
    drop.style.display = 'block';
    drop.querySelectorAll('[data-i]').forEach(row => {
      row.addEventListener('mousedown', () => {
        const p = matches[Number(row.dataset.i)];
        form.nombre.value    = p.nombre || '';
        form.dni.value       = p.dni || '';
        form.telefono.value  = p.telefono || '';
        form.domicilio.value = p.domicilio || p.direccion || '';
        searchInp.value = p.nombre;
        drop.style.display = 'none';
      });
    });
  };

  searchInp.addEventListener('input', () => mostrarResultados(searchInp.value));
  searchInp.addEventListener('focus', () => { if (searchInp.value) mostrarResultados(searchInp.value); });
  searchInp.addEventListener('blur', () => setTimeout(() => { drop.style.display = 'none'; }, 150));

  /* ---- Arma los datos del recibo a partir del form, validando lo mínimo ---- */
  function datosRecibo() {
    if (!form.nombre.value.trim()) { form.nombre.focus(); toast('Ingresá el nombre de la persona', { tipo: 'warning' }); return null; }
    if (!form.concepto.value.trim()) { form.concepto.focus(); toast('Ingresá el concepto del recibo', { tipo: 'warning' }); return null; }
    const monto = valorMonto(form.monto.value);
    if (!monto) { form.monto.focus(); toast('Ingresá un monto válido', { tipo: 'warning' }); return null; }

    return {
      persona: {
        nombre: form.nombre.value.trim(),
        dni: form.dni.value.trim(),
        telefono: form.telefono.value.trim(),
        domicilio: form.domicilio.value.trim(),
      },
      concepto: form.concepto.value.trim(),
      monto,
      moneda: form.moneda.value,
      fecha: form.fecha.value || hoy,
      formaPago: form.formaPago.value,
      referencia: form.referencia.value.trim(),
      nota: form.nota.value.trim(),
    };
  }

  /* ---- Generar recibo (imprimir / PDF) ---- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = datosRecibo();
    if (!datos) return;
    imprimirReciboGeneral(datos);
    toast('Recibo generado');
  });

  /* ---- Enviar el recibo (PDF completo, no un mensaje) por WhatsApp ---- */
  el.querySelector('#btnEnviarWA').addEventListener('click', async () => {
    const datos = datosRecibo();
    if (!datos) return;
    const tel = datos.persona.telefono;
    if (!tel) { form.telefono.focus(); toast('Cargá el teléfono de la persona para enviar por WhatsApp', { tipo: 'warning' }); return; }
    const texto = `Hola${datos.persona.nombre ? ' ' + datos.persona.nombre : ''}! Te comparto el recibo de "${datos.concepto}".`;
    try {
      const blob = await generarPDFReciboGeneral(datos, 'recibo.pdf');
      const resultado = await compartirArchivoPorWhatsApp({ numero: tel, texto, archivo: blob, nombreArchivo: 'recibo.pdf' });
      const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'el recibo');
      toast(msg, opts);
    } catch (err) {
      console.error('Error generando o compartiendo el recibo:', err);
      toast('No se pudo generar el PDF para compartir por WhatsApp', { tipo: 'danger' });
      window.open(waLink(tel, texto), '_blank');
    }
  });

  el.querySelector('#btnLimpiar').addEventListener('click', () => {
    form.reset();
    form.fecha.value = hoy;
    searchInp.value = '';
  });
}
