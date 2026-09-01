/* ============================================================
   VIEW · LEADS (Kanban)
   Tablero de pipeline con 8 columnas y drag & drop nativo.
   Arrastrar una tarjeta cambia el estado del lead y registra
   la actividad automáticamente (vía store.moverLead).
   ============================================================ */
import { sel, actions, getState, subscribe } from '../store.js';
import { $, $$, esc, fmtMoneda, iniciales, colorDe, debounce } from '../lib.js';
import { LEAD_ESTADOS, ORIGENES, icon } from '../config.js';
import { openLeadForm } from './forms.js';
import { openLeadDetail } from './leadDetail.js';

const filtros = { q: '', asesor: '', origen: '' };

function pasaFiltro(l) {
  if (filtros.q && !l.nombre.toLowerCase().includes(filtros.q.toLowerCase())) return false;
  if (filtros.asesor && l.asesor !== filtros.asesor) return false;
  if (filtros.origen && l.origen !== filtros.origen) return false;
  return true;
}

function cardHTML(l) {
  const est = LEAD_ESTADOS.find(e => e.id === l.estado);
  const alerta = sel.nivelAlerta(l);
  const heat = sel.heatScore(l);
  const { clase } = sel.heatLabel(heat);
  const heatCol = clase === 'hot' ? 'var(--danger)' : clase === 'warm' ? 'var(--warning)' : 'var(--info)';
  return `<div class="lead-card" draggable="true" data-id="${l.id}" style="--card-accent:${est.color}">
    <div class="lead-card-top">
      <div class="lead-card-name">${esc(l.nombre)}</div>
      <span class="heat ${clase}" title="Heat score ${heat}/100" style="color:${heatCol}">${icon('flame')}${heat}</span>
    </div>
    <div class="lead-card-meta">
      <div class="row">${icon('pin')} ${esc(l.zona || '—')} · ${esc(l.operacion || '')}</div>
      <div class="row">${icon('dollar')} ${fmtMoneda(l.presupuesto, l.moneda)}</div>
    </div>
    <div class="lead-card-foot">
      <div class="avatar lead-card-avatar" style="background:${colorDe(sel.nombreAsesor(l.asesor))}" title="${esc(sel.nombreAsesor(l.asesor))}">${iniciales(sel.nombreAsesor(l.asesor))}</div>
      ${alerta ? `<span class="followup-flag ${alerta.badge}" style="background:${alerta.nivel === 'atencion' ? 'var(--warning-soft)' : 'var(--danger-soft)'};color:${alerta.nivel === 'atencion' ? 'var(--warning)' : 'var(--danger)'}">${icon('alert')} ${alerta.dias}d</span>` : `<span class="text-xs text-faint">${icon('clock')}</span>`}
    </div>
  </div>`;
}

function columnsHTML() {
  const leads = getState().leads.filter(pasaFiltro);
  return LEAD_ESTADOS.map(est => {
    const dela = leads.filter(l => l.estado === est.id);
    return `<div class="kanban-col">
      <div class="kanban-col-head">
        <span class="col-dot" style="background:${est.color}"></span>
        <span class="col-title">${est.label}</span>
        <span class="col-count">${dela.length}</span>
      </div>
      <div class="kanban-col-body" data-estado="${est.id}">
        ${dela.map(cardHTML).join('')}
      </div>
    </div>`;
  }).join('');
}

export default async function leads(root, param) {
  const asesores = getState().usuarios.filter(u => ['asesor','gerente','administrador'].includes(u.rol));

  root.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div class="page-title-wrap">
          <h1>Clientes</h1>
          <div class="subtitle">Arrastrá las tarjetas para mover cada cliente por las etapas.</div>
        </div>
        <button class="btn btn-primary" id="newLead">${icon('plus')} Nuevo cliente</button>
      </div>

      <div class="toolbar">
        <div class="field-search" style="flex:1;min-width:220px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input class="field w-full" id="fq" placeholder="Buscar por nombre…" value="${esc(filtros.q)}">
        </div>
        <select class="field" id="fAsesor">
          <option value="">Todos los asesores</option>
          ${asesores.map(u => `<option value="${u.id}" ${filtros.asesor === u.id ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}
        </select>
        <select class="field" id="fOrigen">
          <option value="">Todos los orígenes</option>
          ${ORIGENES.map(o => `<option value="${o}" ${filtros.origen === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>

      <div class="kanban-scroll">
        <div class="kanban" id="board">${columnsHTML()}</div>
      </div>
    </div>`;

  const board = $('#board', root);

  function repintar() { board.innerHTML = columnsHTML(); enlazar(); }

  function enlazar() {
    // abrir detalle
    $$('.lead-card', board).forEach(card => {
      card.addEventListener('click', (e) => { if (!card.classList.contains('dragging')) openLeadDetail(card.dataset.id); });
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', card.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    // zonas de drop
    $$('.kanban-col-body', board).forEach(col => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        await actions.moverLead(id, col.dataset.estado);
      });
    });
  }
  enlazar();

  // filtros
  $('#fq', root).addEventListener('input', debounce((e) => { filtros.q = e.target.value; repintar(); }, 200));
  $('#fAsesor', root).addEventListener('change', (e) => { filtros.asesor = e.target.value; repintar(); });
  $('#fOrigen', root).addEventListener('change', (e) => { filtros.origen = e.target.value; repintar(); });
  $('#newLead', root).addEventListener('click', () => openLeadForm(null, repintar));

  // re-render al cambiar el store (drag, edición, etc.)
  const unsub = subscribe(() => repintar());

  // si llegó con un id de lead en el hash, abrir su detalle
  if (param) openLeadDetail(param);

  return () => unsub();
}
