/* ============================================================
   VIEW · TAREAS
   Lista global de tareas con filtros, alertas de vencimiento
   y completado en 1 clic.
   ============================================================ */
import { sel, actions, getState, subscribe } from '../store.js';
import { $, $$, esc, fmtFechaCorta, esHoy, relativo } from '../lib.js';
import { PRIORIDADES, icon } from '../config.js';
import { openModal, confirmar } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { openTareaForm } from './forms.js';
import { openLeadDetail } from './leadDetail.js';

const filtros = { estado: 'pendientes', prioridad: '', responsable: '' };

function clasificar(t) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (t.completada) return 'completada';
  return new Date(t.fecha) < hoy ? 'vencida' : 'pendiente';
}

function pasa(t) {
  const c = clasificar(t);
  if (filtros.estado === 'pendientes' && t.completada) return false;
  if (filtros.estado === 'vencidas' && c !== 'vencida') return false;
  if (filtros.estado === 'completadas' && !t.completada) return false;
  if (filtros.prioridad && t.prioridad !== filtros.prioridad) return false;
  if (filtros.responsable && t.responsable !== filtros.responsable) return false;
  return true;
}

function taskHTML(t) {
  const c = clasificar(t);
  const lead = sel.lead(t.leadId);
  return `<div class="task-item ${t.completada ? 'done' : ''} ${c === 'vencida' ? 'overdue' : ''}" data-id="${t.id}">
    <div class="task-check ${t.completada ? 'checked' : ''}" data-toggle="${t.id}">${icon('check')}</div>
    <div class="task-info" data-lead="${t.leadId}" style="cursor:pointer">
      <div class="task-title">${esc(t.titulo)}</div>
      <div class="task-meta">
        ${lead ? `<span>${icon('users')} ${esc(lead.nombre)}</span>` : ''}
        <span><span class="prio-dot prio-${t.prioridad}"></span> ${t.prioridad}</span>
        <span>${icon('clock')} ${esHoy(t.fecha) ? 'Hoy' : fmtFechaCorta(t.fecha)} ${t.hora || ''}</span>
        <span>${icon('users')} ${esc(sel.nombreAsesor(t.responsable))}</span>
        ${c === 'vencida' ? `<span style="color:var(--danger);font-weight:700">Vencida ${relativo(t.fecha)}</span>` : ''}
      </div>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-sm btn-ghost btn-icon-only" data-edit="${t.id}" title="Editar">${icon('edit')}</button>
      <button class="btn btn-sm btn-ghost btn-icon-only" data-del="${t.id}" title="Eliminar">${icon('trash')}</button>
    </div>
  </div>`;
}

export default async function tareas(root) {
  const asesores = getState().usuarios.filter(u => ['asesor','gerente','administrador'].includes(u.rol));

  function render() {
    const lista = getState().tareas.filter(pasa)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const vencidas = sel.tareasVencidas().length;

    root.innerHTML = `
      <div class="view">
        <div class="page-head">
          <div class="page-title-wrap">
            <h1>Tareas</h1>
            <div class="subtitle">${vencidas ? `Tenés <strong style="color:var(--danger)">${vencidas} tareas vencidas</strong> que requieren acción.` : 'Todo bajo control, sin tareas vencidas.'}</div>
          </div>
          <button class="btn btn-primary" id="newTask">${icon('plus')} Nueva tarea</button>
        </div>

        <div class="toolbar">
          <div class="seg" id="segEstado">
            ${[['pendientes','Pendientes'],['vencidas','Vencidas'],['completadas','Completadas'],['','Todas']]
              .map(([v, l]) => `<button data-v="${v}" class="${filtros.estado === v ? 'active' : ''}">${l}</button>`).join('')}
          </div>
          <select class="field" id="fPrio">
            <option value="">Toda prioridad</option>
            ${PRIORIDADES.map(p => `<option value="${p}" ${filtros.prioridad === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
          <select class="field" id="fResp">
            <option value="">Todos los responsables</option>
            ${asesores.map(u => `<option value="${u.id}" ${filtros.responsable === u.id ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}
          </select>
        </div>

        <div id="taskList">
          ${lista.length ? lista.map(taskHTML).join('') : `<div class="empty">${icon('check')}<h3>No hay tareas para mostrar</h3><p>Probá cambiar los filtros o creá una nueva.</p></div>`}
        </div>
      </div>`;

    // filtros
    $$('#segEstado button', root).forEach(b => b.addEventListener('click', () => { filtros.estado = b.dataset.v; render(); }));
    $('#fPrio', root).addEventListener('change', e => { filtros.prioridad = e.target.value; render(); });
    $('#fResp', root).addEventListener('change', e => { filtros.responsable = e.target.value; render(); });
    $('#newTask', root).addEventListener('click', () => openTareaForm(null, null, null));

    // acciones por tarea
    $$('[data-toggle]', root).forEach(c => c.addEventListener('click', async () => {
      const t = getState().tareas.find(x => x.id === c.dataset.toggle);
      await actions.toggleTarea(t.id, !t.completada);
    }));
    $$('[data-edit]', root).forEach(b => b.addEventListener('click', () => {
      const t = getState().tareas.find(x => x.id === b.dataset.edit);
      openTareaForm(t.leadId, t, null);
    }));
    $$('[data-del]', root).forEach(b => b.addEventListener('click', async () => {
      const ok = await confirmar({ title: 'Eliminar tarea', mensaje: '¿Seguro que querés eliminar esta tarea?', okLabel: 'Eliminar', danger: true });
      if (ok) { await actions.deleteTarea(b.dataset.del); toast('Tarea eliminada'); }
    }));
    $$('[data-lead]', root).forEach(n => n.addEventListener('click', () => openLeadDetail(n.dataset.lead)));
  }

  render();
  const unsub = subscribe(() => render());
  return () => unsub();
}
