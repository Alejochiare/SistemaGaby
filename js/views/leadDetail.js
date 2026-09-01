/* ============================================================
   VIEW · DETALLE DE LEAD (modal)
   Ficha 360°: datos, historial, tareas, propiedades sugeridas,
   heat score, alerta de seguimiento y herramientas de WhatsApp.
   Se abre desde Leads, Rescate, Tareas, Calendario y Propiedades.
   ============================================================ */
import { openModal, confirmar } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { sel, actions } from '../store.js';
import { $, $$, esc, fmtMoneda, iniciales, colorDe, fmtFecha, fmtFechaCorta, relativo } from '../lib.js';
import { estadoById, TIPOS_ACTIVIDAD, icon } from '../config.js';
import { openLeadForm, openTareaForm, openActividadForm } from './forms.js';
import { navegar } from '../router.js';

/** Construye un enlace wa.me con texto pre-cargado (formato AR: 549...) */
export function waLink(numero, texto = '') {
  let n = String(numero || '').replace(/\D/g, '');
  if (!n) return null;
  if (!n.startsWith('54')) n = '549' + n;          // celular Argentina
  else if (!n.startsWith('549')) n = '54' + '9' + n.slice(2);
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

function heatBar(score) {
  const { clase } = sel.heatLabel(score);
  const col = clase === 'hot' ? 'var(--danger)' : clase === 'warm' ? 'var(--warning)' : 'var(--info)';
  return `<div class="progress" style="margin-top:.5rem"><i style="width:${score}%;background:${col}"></i></div>`;
}

function tabActividades(lead) {
  const acts = [...(lead.actividades || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  if (!acts.length) return `<p class="text-soft text-sm">Sin actividades registradas todavía.</p>`;
  return `<div class="timeline">${acts.map(a => {
    const t = TIPOS_ACTIVIDAD[a.tipo] || TIPOS_ACTIVIDAD.nota;
    return `<div class="tl-item" style="--tl-color:${t.color}">
      <div class="tl-date">${fmtFecha(a.fecha)} · ${t.label}</div>
      <div class="tl-title">${esc(a.titulo)}</div>
      ${a.desc ? `<div class="tl-desc">${esc(a.desc)}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function tabTareas(lead) {
  const tareas = sel.tareasDeLead(lead.id).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  if (!tareas.length) return `<p class="text-soft text-sm">Este cliente no tiene tareas asignadas.</p>`;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return tareas.map(t => {
    const vencida = !t.completada && new Date(t.fecha) < hoy;
    return `<div class="task-item ${t.completada ? 'done' : ''} ${vencida ? 'overdue' : ''}">
      <div class="task-check ${t.completada ? 'checked' : ''}" data-toggle="${t.id}">${icon('check')}</div>
      <div class="task-info">
        <div class="task-title">${esc(t.titulo)}</div>
        <div class="task-meta">
          <span><span class="prio-dot prio-${t.prioridad}"></span> ${t.prioridad}</span>
          <span>${icon('clock')} ${fmtFechaCorta(t.fecha)} ${t.hora || ''}</span>
          ${vencida ? '<span style="color:var(--danger);font-weight:700">Vencida</span>' : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function tabPropiedades(lead) {
  const matches = sel.propiedadesPara(lead, 40);
  if (!matches.length) return `<p class="text-soft text-sm">No hay propiedades disponibles que coincidan con este perfil.</p>`;
  return matches.map(({ prop, match }) => `
    <div class="mini-list-item" style="cursor:pointer" data-prop="${prop.id}">
      <div class="kpi-icon" style="--kpi-accent:var(--brand-600);--kpi-accent-soft:var(--brand-50)">${icon('home')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.86rem" class="truncate">${esc(prop.titulo)}</div>
        <div class="text-xs text-soft">${esc(prop.barrio || prop.ciudad || '')} · ${fmtMoneda(prop.precio, prop.moneda)}</div>
      </div>
      <span class="badge ${match >= 75 ? 'badge-success' : match >= 50 ? 'badge-warning' : 'badge-neutral'}">${match}%</span>
    </div>`).join('');
}

function render(lead) {
  const est = estadoById(lead.estado);
  const alerta = sel.nivelAlerta(lead);
  const heat = sel.heatScore(lead);
  const { clase, txt } = sel.heatLabel(heat);
  const asesor = sel.nombreAsesor(lead.asesor);
  const wa = waLink(lead.whatsapp || lead.telefono,
    `Hola ${lead.nombre.split(' ')[0]}, te contacto de la inmobiliaria por tu consulta. ¿Tenés un momento para charlar?`);

  return {
    title: '',
    size: 'xl',
    bodyHTML: `
      <div class="lead-detail" data-lead="${lead.id}">
        <div class="flex items-center gap-3" style="margin-bottom:1.2rem">
          <div class="avatar" style="width:52px;height:52px;font-size:1.1rem;background:${colorDe(lead.nombre)}">${iniciales(lead.nombre)}</div>
          <div style="flex:1;min-width:0">
            <h2 style="font-size:1.35rem;line-height:1.15">${esc(lead.nombre)}</h2>
            <div class="flex items-center gap-2 flex-wrap" style="margin-top:.35rem">
              <span class="badge" style="background:${est.color}1a;color:${est.color}"><span class="badge-dot"></span>${est.label}</span>
              <span class="heat ${clase}">${icon('flame')} ${txt} · ${heat}pts</span>
              ${alerta ? `<span class="badge ${alerta.badge}">${icon('alert')} ${alerta.label}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="lead-detail-grid">
          <!-- Columna principal: pestañas -->
          <div>
            <div class="tabs">
              <button class="tab active" data-tab="act">Historial</button>
              <button class="tab" data-tab="task">Tareas</button>
              <button class="tab" data-tab="prop">Propiedades sugeridas</button>
            </div>
            <div class="flex gap-2" style="margin-bottom:1rem">
              <button class="btn btn-sm btn-ghost" id="addAct">${icon('plus')} Registrar actividad</button>
              <button class="btn btn-sm btn-ghost" id="addTask">${icon('plus')} Nueva tarea</button>
            </div>
            <div id="tabBody">${tabActividades(lead)}</div>
          </div>

          <!-- Columna lateral: datos + acciones -->
          <div>
            <div class="card card-pad" style="margin-bottom:1rem">
              <div class="text-xs text-soft" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem">Interés del cliente</div>
              <div class="days-cold" style="color:${clase === 'hot' ? 'var(--danger)' : clase === 'warm' ? 'var(--warning)' : 'var(--info)'}">${heat}<small>Puntaje</small></div>
              ${heatBar(heat)}
              <div class="text-xs text-faint" style="margin-top:.5rem">Último contacto ${relativo(lead.ultimaActividad || lead.fechaIngreso)}</div>
            </div>

            <div class="card card-pad" style="margin-bottom:1rem">
              <div class="info-row"><span class="label">Teléfono</span><span class="val">${esc(lead.telefono || '—')}</span></div>
              <div class="info-row"><span class="label">WhatsApp</span><span class="val">${esc(lead.whatsapp || '—')}</span></div>
              <div class="info-row"><span class="label">Email</span><span class="val">${esc(lead.email || '—')}</span></div>
              <div class="info-row"><span class="label">DNI</span><span class="val">${esc(lead.dni || '—')}</span></div>
              <div class="info-row"><span class="label">Origen</span><span class="val">${esc(lead.origen || '—')}</span></div>
              <div class="info-row"><span class="label">Operación</span><span class="val">${esc(lead.operacion || '—')}</span></div>
              <div class="info-row"><span class="label">Busca</span><span class="val">${esc(lead.tipoPropiedad || '—')}</span></div>
              <div class="info-row"><span class="label">Zona</span><span class="val">${esc(lead.zona || '—')}</span></div>
              <div class="info-row"><span class="label">Presupuesto</span><span class="val">${fmtMoneda(lead.presupuesto, lead.moneda)}</span></div>
              <div class="info-row"><span class="label">Asesor</span><span class="val">${esc(asesor)}</span></div>
              <div class="info-row"><span class="label">Ingreso</span><span class="val">${fmtFecha(lead.fechaIngreso)}</span></div>
            </div>

            ${lead.observaciones ? `<div class="card card-pad" style="margin-bottom:1rem"><div class="text-xs text-soft" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem">Observaciones</div><div class="text-sm">${esc(lead.observaciones)}</div></div>` : ''}

            ${wa ? `<a class="btn btn-block" style="background:#25d366;color:#062e13;margin-bottom:.6rem" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')} Escribir por WhatsApp</a>` : ''}
          </div>
        </div>
      </div>`,
    footerHTML: `
      <button class="btn btn-ghost" id="delLead">${icon('trash')} Eliminar cliente</button>
      <button class="btn btn-ghost" data-close>Cerrar</button>
      <button class="btn btn-primary" id="editLead">${icon('edit')} Editar</button>`,
  };
}

export function openLeadDetail(id, onChange) {
  let lead = sel.lead(id);
  if (!lead) { toast('No se encontró el cliente', { tipo: 'danger' }); return; }

  const cfg = render(lead);
  const ctx = openModal({
    ...cfg,
    onMount(ctx) {
      const refresh = () => {
        lead = sel.lead(id);
        if (!lead) { ctx.close(); onChange?.(); return; }
        const fresh = render(lead);
        ctx.body.innerHTML = fresh.bodyHTML;
        wire(ctx);
        onChange?.();
      };

      function wire(ctx) {
        // Pestañas
        $$('.tab', ctx.overlay).forEach(btn => btn.addEventListener('click', () => {
          $$('.tab', ctx.overlay).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const body = $('#tabBody', ctx.overlay);
          const tab = btn.dataset.tab;
          body.innerHTML = tab === 'act' ? tabActividades(lead) : tab === 'task' ? tabTareas(lead) : tabPropiedades(lead);
          bindTabBody(ctx);
        }));
        bindTabBody(ctx);

        $('#addAct', ctx.overlay)?.addEventListener('click', () => openActividadForm(id, refresh));
        $('#addTask', ctx.overlay)?.addEventListener('click', () => openTareaForm(id, null, refresh));
        $('#editLead', ctx.overlay)?.addEventListener('click', () => openLeadForm(lead, refresh));
        $('#delLead', ctx.overlay)?.addEventListener('click', async () => {
          const ok = await confirmar({ title: 'Eliminar cliente', mensaje: `¿Eliminar a “${lead.nombre}”? Esta acción no se puede deshacer.`, okLabel: 'Eliminar', danger: true });
          if (ok) { await actions.deleteLead(id); toast('Cliente eliminado'); ctx.close(); onChange?.(); }
        });
      }

      function bindTabBody(ctx) {
        // Toggle de tareas
        $$('[data-toggle]', ctx.overlay).forEach(c => c.addEventListener('click', async () => {
          const t = sel.tareasDeLead(id).find(x => x.id === c.dataset.toggle);
          await actions.toggleTarea(c.dataset.toggle, !t.completada);
          lead = sel.lead(id);
          $('#tabBody', ctx.overlay).innerHTML = tabTareas(lead);
          bindTabBody(ctx);
          onChange?.();
        }));
        // Click en propiedad sugerida → ir a propiedades
        $$('[data-prop]', ctx.overlay).forEach(p => p.addEventListener('click', () => {
          ctx.close();
          navegar(`propiedades/${p.dataset.prop}`);
        }));
      }

      wire(ctx);
    }
  });
  return ctx;
}

/* Esta vista no se monta por ruta directa; redirige a Leads.
   Se exporta default por consistencia, pero el detalle se abre vía modal. */
export default async function () { navegar('leads'); }
