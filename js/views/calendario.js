/* ============================================================
   VIEW · CALENDARIO
   Agenda de tareas, visitas y vencimientos.
   Vistas: mes (grilla), semana y día.
   ============================================================ */
import { sel, getState, subscribe } from '../store.js';
import { $, $$, esc, matrizMes, nombreMes, nombreDia, esMismoDia, esHoy, fmtHora, sumarDias } from '../lib.js';
import { icon } from '../config.js';
import { openLeadDetail } from './leadDetail.js';

let cur = new Date();
let modo = 'mes';

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Devuelve los eventos (tareas) de un día concreto */
function eventosDe(fecha) {
  return getState().tareas
    .filter(t => esMismoDia(t.fecha, fecha))
    .map(t => {
      const clase = /visita|coordinar/i.test(t.titulo) ? 'visita'
        : /reuni|negoci/i.test(t.titulo) ? 'reunion'
        : /seguimiento|recordar/i.test(t.titulo) ? 'recordatorio' : 'tarea';
      return { ...t, clase, lead: sel.lead(t.leadId) };
    })
    .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
}

function vistaMes() {
  const celdas = matrizMes(cur.getFullYear(), cur.getMonth());
  return `<div class="cal-grid">
    ${DOW.map(d => `<div class="cal-dow">${d}</div>`).join('')}
    ${celdas.map(d => {
      const otro = d.getMonth() !== cur.getMonth();
      const evs = eventosDe(d);
      return `<div class="cal-cell ${otro ? 'other-month' : ''} ${esHoy(d) ? 'today' : ''}">
        <div class="cal-daynum">${d.getDate()}</div>
        ${evs.slice(0, 3).map(e => `<div class="cal-event ${e.clase}" data-lead="${e.leadId}" title="${esc(e.titulo)}">${e.hora ? e.hora + ' ' : ''}${esc(e.titulo)}</div>`).join('')}
        ${evs.length > 3 ? `<div class="text-xs text-faint" style="margin-top:3px">+${evs.length - 3} más</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function vistaSemana() {
  const inicio = sumarDias(cur, -cur.getDay());
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));
  return `<div class="cal-week-list">
    ${dias.map(d => {
      const evs = eventosDe(d);
      return `<div class="card card-pad ${esHoy(d) ? '' : ''}" style="${esHoy(d) ? 'border-color:var(--primary)' : ''}">
        <div class="flex items-center justify-between" style="margin-bottom:.5rem">
          <strong>${nombreDia(d.getDay())} ${d.getDate()}/${d.getMonth() + 1}</strong>
          ${esHoy(d) ? '<span class="badge badge-info">Hoy</span>' : ''}
        </div>
        ${evs.length ? evs.map(e => `<div class="cal-event ${e.clase}" data-lead="${e.leadId}" style="display:inline-block;margin-right:6px">${e.hora ? e.hora + ' ' : ''}${esc(e.titulo)} · ${esc(e.lead?.nombre || '')}</div>`).join('')
          : '<span class="text-sm text-faint">Sin eventos</span>'}
      </div>`;
    }).join('')}
  </div>`;
}

function vistaDia() {
  const evs = eventosDe(cur);
  return `<div class="card">
    <div class="card-head"><h3>${nombreDia(cur.getDay())} ${cur.getDate()} de ${nombreMes(cur.getMonth())}</h3>${esHoy(cur) ? '<span class="badge badge-info">Hoy</span>' : ''}</div>
    <div class="card-body">
      ${evs.length ? evs.map(e => `
        <div class="mini-list-item" data-lead="${e.leadId}" style="cursor:pointer">
          <span class="cal-event ${e.clase}" style="margin:0">${e.hora || '—'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.86rem">${esc(e.titulo)}</div>
            <div class="text-xs text-soft">${esc(e.lead?.nombre || '')}</div>
          </div>
        </div>`).join('')
        : `<div class="empty">${icon('calendar')}<h3>Sin eventos este día</h3></div>`}
    </div>
  </div>`;
}

export default async function calendario(root) {
  function tituloPeriodo() {
    if (modo === 'mes') return `${nombreMes(cur.getMonth())} ${cur.getFullYear()}`;
    if (modo === 'dia') return `${cur.getDate()} ${nombreMes(cur.getMonth())}`;
    const ini = sumarDias(cur, -cur.getDay());
    const fin = sumarDias(ini, 6);
    return `${ini.getDate()}/${ini.getMonth() + 1} – ${fin.getDate()}/${fin.getMonth() + 1}`;
  }

  function avanzar(dir) {
    if (modo === 'mes') cur = new Date(cur.getFullYear(), cur.getMonth() + dir, 1);
    else cur = sumarDias(cur, dir * (modo === 'semana' ? 7 : 1));
    render();
  }

  function render() {
    root.innerHTML = `
      <div class="view">
        <div class="page-head">
          <div class="page-title-wrap">
            <h1>Calendario</h1>
            <div class="subtitle">Visitas, reuniones y vencimientos de tareas.</div>
          </div>
          <div class="seg" id="segModo">
            ${[['mes','Mes'],['semana','Semana'],['dia','Día']].map(([v, l]) => `<button data-v="${v}" class="${modo === v ? 'active' : ''}">${l}</button>`).join('')}
          </div>
        </div>

        <div class="toolbar" style="justify-content:space-between">
          <div class="flex items-center gap-2">
            <button class="btn btn-ghost btn-icon-only" id="prev" aria-label="Anterior">‹</button>
            <button class="btn btn-ghost" id="hoy">Hoy</button>
            <button class="btn btn-ghost btn-icon-only" id="next" aria-label="Siguiente">›</button>
          </div>
          <strong style="font-size:1.05rem">${tituloPeriodo()}</strong>
          <div class="flex items-center gap-3 text-xs text-soft flex-wrap">
            <span class="flex items-center gap-2"><span class="cal-event visita" style="margin:0">Visita</span></span>
            <span class="flex items-center gap-2"><span class="cal-event reunion" style="margin:0">Reunión</span></span>
            <span class="flex items-center gap-2"><span class="cal-event tarea" style="margin:0">Tarea</span></span>
            <span class="flex items-center gap-2"><span class="cal-event recordatorio" style="margin:0">Seguimiento</span></span>
          </div>
        </div>

        <div id="calBody">${modo === 'mes' ? vistaMes() : modo === 'semana' ? vistaSemana() : vistaDia()}</div>
      </div>`;

    $$('#segModo button', root).forEach(b => b.addEventListener('click', () => { modo = b.dataset.v; render(); }));
    $('#prev', root).addEventListener('click', () => avanzar(-1));
    $('#next', root).addEventListener('click', () => avanzar(1));
    $('#hoy', root).addEventListener('click', () => { cur = new Date(); render(); });
    $$('[data-lead]', root).forEach(n => n.addEventListener('click', () => n.dataset.lead && openLeadDetail(n.dataset.lead)));
  }

  render();
  const unsub = subscribe(() => render());
  return () => unsub();
}
