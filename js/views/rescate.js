/* ============================================================
   VIEW · RESCATE  (función innovadora)
   Detecta leads dormidos/fríos y los ordena por urgencia para
   que ninguna oportunidad se pierda por falta de seguimiento.
   Acciones de 1 clic: reactivar (crea tarea + registra actividad)
   y generar plantilla de WhatsApp lista para enviar.
   ============================================================ */
import { sel, actions, getState, subscribe } from '../store.js';
import { $, $$, esc, fmtMoneda, iniciales, colorDe, relativo } from '../lib.js';
import { estadoById, icon } from '../config.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { openLeadDetail, waLink } from './leadDetail.js';

/** Genera una plantilla de mensaje según el estado y datos del lead */
function plantilla(lead) {
  const nombre = lead.nombre.split(' ')[0];
  const est = lead.estado;
  if (est === 'negociacion' || est === 'reserva') {
    return `Hola ${nombre}, ¿cómo estás? Te escribo para retomar la conversación sobre la operación que veníamos charlando. Quedaron algunos detalles por cerrar y me gustaría avanzar. ¿Tenés un rato esta semana para hablar?`;
  }
  if (est === 'visita_realizada') {
    return `Hola ${nombre}, ¿qué tal? Pasaron unos días desde que visitaste la propiedad y quería saber qué te pareció. Tengo otras opciones en ${lead.zona || 'la zona'} que pueden interesarte. ¿Coordinamos?`;
  }
  if (est === 'visita_programada') {
    return `Hola ${nombre}, te recuerdo que teníamos pendiente coordinar la visita. ¿Qué día te queda cómodo para ir a verla?`;
  }
  return `Hola ${nombre}, ¿cómo estás? Soy de la inmobiliaria. Vi que estabas buscando ${lead.tipoPropiedad || 'una propiedad'} en ${lead.zona || 'la zona'} y aparecieron nuevas opciones acordes a tu búsqueda. ¿Querés que te las comparta?`;
}

function abrirPlantilla(lead) {
  const texto = plantilla(lead);
  const wa = waLink(lead.whatsapp || lead.telefono, texto);
  openModal({
    title: `Mensaje para ${lead.nombre.split(' ')[0]}`,
    bodyHTML: `
      <p class="text-sm text-soft" style="margin-bottom:.7rem">Plantilla sugerida según el estado del lead. Editala si querés antes de enviar.</p>
      <div class="wa-template" id="waBox" contenteditable="true">${esc(texto)}</div>`,
    footerHTML: `
      <button class="btn btn-ghost" id="copyTpl">${icon('copy')} Copiar</button>
      ${wa ? `<a class="btn btn-primary" style="background:#25d366;color:#062e13" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')} Abrir WhatsApp</a>` : ''}`,
    onMount(ctx) {
      $('#copyTpl', ctx.overlay).addEventListener('click', async () => {
        try { await navigator.clipboard.writeText($('#waBox', ctx.overlay).innerText); toast('Mensaje copiado'); }
        catch { toast('No se pudo copiar', { tipo: 'warning' }); }
      });
    }
  });
}

async function reactivar(lead, onDone) {
  // 1 clic: registra intención de seguimiento + crea tarea para hoy
  await actions.addActividad(lead.id, { tipo: 'nota', titulo: 'Reactivación de seguimiento', desc: 'Cliente recuperado para seguimiento' });
  await actions.createTarea({
    leadId: lead.id, titulo: 'Realizar seguimiento',
    fecha: new Date().toISOString().slice(0, 10), hora: '10:00',
    prioridad: 'alta', responsable: lead.asesor,
  });
  toast(`Seguimiento reactivado para ${lead.nombre.split(' ')[0]}`, { tipo: 'success' });
  onDone?.();
}

function itemHTML({ lead, alerta, dias }) {
  const sev = dias >= 15 ? 'critical' : dias >= 7 ? 'high' : '';
  const est = estadoById(lead.estado);
  const heat = sel.heatScore(lead);
  const col = dias >= 15 ? 'var(--danger)' : dias >= 7 ? 'var(--warning)' : 'var(--info)';
  return `<div class="rescue-item ${sev}" data-id="${lead.id}">
    <div class="days-cold" style="color:${col};min-width:60px;text-align:center">${dias}<small>días</small></div>
    <div class="avatar" style="width:42px;height:42px;background:${colorDe(lead.nombre)}">${iniciales(lead.nombre)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700">${esc(lead.nombre)}</div>
      <div class="text-xs text-soft flex items-center gap-2 flex-wrap" style="margin-top:2px">
        <span class="badge" style="background:${est.color}1a;color:${est.color}">${est.label}</span>
        <span>${esc(lead.tipoPropiedad || '')} en ${esc(lead.zona || '—')}</span>
        <span>${fmtMoneda(lead.presupuesto, lead.moneda)}</span>
        <span class="text-faint">Último contacto ${relativo(lead.ultimaActividad || lead.fechaIngreso)}</span>
      </div>
    </div>
    <div class="flex gap-2 flex-wrap" style="justify-content:flex-end">
      <button class="btn btn-sm" data-wa="${lead.id}" style="background:#25d366;color:#062e13">${icon('whatsapp')} Mensaje</button>
      <button class="btn btn-sm btn-primary" data-react="${lead.id}">${icon('flame')} Reactivar</button>
    </div>
  </div>`;
}

export default async function rescate(root) {
  function render() {
    const lista = sel.leadsRescate();
    const criticos = lista.filter(x => x.dias >= 15).length;
    root.innerHTML = `
      <div class="view">
        <div class="page-head">
          <div class="page-title-wrap">
            <h1>Clientes sin seguimiento ${icon('flame', 'inline-flame')}</h1>
            <div class="subtitle">Clientes que llevan días sin contacto y siguen activos. Recuperalos antes de perderlos.</div>
          </div>
        </div>

        ${lista.length ? `<div class="alert-banner ${criticos ? 'danger' : 'warning'}">
          ${icon('alert')}
          <div>Hay <strong>${lista.length}</strong> leads que necesitan seguimiento${criticos ? `, de los cuales <strong>${criticos}</strong> están en estado crítico (+15 días).` : '.'}</div>
        </div>` : ''}

        <div id="rescueList">
          ${lista.length ? lista.map(itemHTML).join('') : `<div class="empty">${icon('star')}<h3>¡No hay leads olvidados!</h3><p>Todos tus leads activos tienen seguimiento al día.</p></div>`}
        </div>
      </div>`;

    $$('[data-react]', root).forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      reactivar(sel.lead(b.dataset.react));
    }));
    $$('[data-wa]', root).forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirPlantilla(sel.lead(b.dataset.wa));
    }));
    $$('.rescue-item', root).forEach(it => it.addEventListener('click', () => openLeadDetail(it.dataset.id)));
  }

  render();
  const unsub = subscribe(() => render());
  return () => unsub();
}
