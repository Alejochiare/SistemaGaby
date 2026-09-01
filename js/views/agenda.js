/* ============================================================
   VISTA · Agenda — calendario mensual + tareas con filtros
   ============================================================ */
import { getState, sel, actions, subscribe } from '../store.js';
import { icon, TIPOS_EVENTO } from '../config.js';
import { esc, fmtFechaCorta } from '../lib.js';
import { openEventoForm } from './forms.js';
import { alertasAuto } from '../notificaciones.js';

function navegar(ruta) { location.hash = `#/${ruta}`; }

export default function agenda(root) {
  root.innerHTML = `<div class="view" id="vAgenda"></div>`;

  const hoy = new Date();
  let mesVista       = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  let diaSeleccionado = hoy.toISOString().slice(0, 10);
  let filtroActivo   = 'hoy';  // 'hoy' | 'proximas' | 'vencidas'

  const render = () => pintarAgenda(root.querySelector('#vAgenda'), mesVista, diaSeleccionado, filtroActivo);
  render();
  const unsub = subscribe(render);

  root.querySelector('#vAgenda').addEventListener('click', e => {
    const dia = e.target.closest('[data-dia]');
    if (dia) { diaSeleccionado = dia.dataset.dia; filtroActivo = 'hoy'; render(); return; }

    if (e.target.closest('#btnPrevMes')) { mesVista = new Date(mesVista.getFullYear(), mesVista.getMonth() - 1, 1); render(); return; }
    if (e.target.closest('#btnNextMes')) { mesVista = new Date(mesVista.getFullYear(), mesVista.getMonth() + 1, 1); render(); return; }
    if (e.target.closest('#btnHoy'))     { mesVista = new Date(hoy.getFullYear(), hoy.getMonth(), 1); diaSeleccionado = hoy.toISOString().slice(0,10); filtroActivo = 'hoy'; render(); return; }
    if (e.target.closest('#btnNuevoEvento')) { openEventoForm(null, () => {}, diaSeleccionado); return; }

    const pill = e.target.closest('[data-filtro-agenda]');
    if (pill) { filtroActivo = pill.dataset.filtroAgenda; render(); return; }

    const completar = e.target.closest('[data-completar]');
    if (completar) { e.stopPropagation(); actions.updateEvento(completar.dataset.completar, { completado: true }); return; }

    const editar = e.target.closest('[data-editar]');
    if (editar) {
      e.stopPropagation();
      const ev = getState().agenda.find(x => x.id === editar.dataset.editar);
      if (ev) openEventoForm(ev, () => {});
      return;
    }
    const eliminar = e.target.closest('[data-eliminar]');
    if (eliminar) {
      e.stopPropagation();
      if (confirm('¿Eliminar este evento?')) actions.deleteEvento(eliminar.dataset.eliminar);
      return;
    }
    const irAlq = e.target.closest('[data-ir-alq]');
    if (irAlq) { navegar(`alquileres/${irAlq.dataset.irAlq}`); return; }
  });

  return unsub;
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function pintarAgenda(el, mesVista, diaSeleccionado, filtroActivo) {
  const { agenda, clientes } = getState();
  const hoyStr = new Date().toISOString().slice(0, 10);
  const autos  = alertasAuto();

  // Combinar todos los eventos (manuales + auto) en listas por filtro
  const todosMan = agenda.filter(e => !e.completado).map(e => ({ ...e, _auto: false }));
  const todosAut = autos.map(a => ({ ...a, _auto: true }));
  const todos    = [...todosMan, ...todosAut];

  // Hoy: fecha === hoyStr  (o === diaSeleccionado si no es hoy, para ver el día clickeado)
  const fechaDia = diaSeleccionado;
  const tareasHoy = todos
    .filter(t => t.fecha === fechaDia)
    .sort((a,b) => (a.hora||'99:99').localeCompare(b.hora||'99:99'));

  // Próximas: fecha > hoyStr (siempre futuro respecto a hoy real)
  const proximas = todos
    .filter(t => t.fecha > hoyStr)
    .sort((a,b) => a.fecha.localeCompare(b.fecha) || (a.hora||'').localeCompare(b.hora||''));

  // Vencidas: fecha < hoyStr (estrictamente antes de hoy)
  const vencidas = todos
    .filter(t => t.fecha < hoyStr)
    .sort((a,b) => b.fecha.localeCompare(a.fecha));

  // Conteos para pills
  const counts = { hoy: tareasHoy.length, proximas: proximas.length, vencidas: vencidas.length };

  // Qué lista mostrar según filtro
  const listaActiva = filtroActivo === 'proximas' ? proximas : filtroActivo === 'vencidas' ? vencidas : tareasHoy;

  // Label del título según filtro
  const labelFiltro = {
    hoy:      fechaDia === hoyStr ? 'Hoy' : fmtFechaCorta(fechaDia),
    proximas: 'Próximas',
    vencidas: 'Vencidas sin completar',
  }[filtroActivo];

  // Mapa de puntos para el calendario
  const eventosPorFecha = {};
  todos.forEach(t => {
    (eventosPorFecha[t.fecha] = eventosPorFecha[t.fecha] || []).push(t);
  });

  const año = mesVista.getFullYear();
  const mes  = mesVista.getMonth();
  const primerDia = new Date(año, mes, 1).getDay();
  const diasMes   = new Date(año, mes + 1, 0).getDate();
  const celdas = [];
  for (let i = 0; i < primerDia; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) {
    const fecha = `${año}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    celdas.push(fecha);
  }

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Agenda</h1>
        <p class="view-sub">${agenda.filter(e=>!e.completado).length} eventos manuales · ${autos.length} alertas de contratos</p>
      </div>
      <button class="btn btn-primary" id="btnNuevoEvento">${icon('plus')} Nuevo evento</button>
    </div>

    <!-- CALENDARIO -->
    <div class="card" style="padding:1.25rem;margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <button id="btnPrevMes" class="btn btn-xs btn-ghost">${icon('arrow-left')}</button>
        <div style="display:flex;align-items:center;gap:.75rem">
          <span style="font-size:1.05rem;font-weight:700">${MESES[mes]} ${año}</span>
          <button id="btnHoy" class="btn btn-xs btn-ghost" style="font-size:.72rem">Hoy</button>
        </div>
        <button id="btnNextMes" class="btn btn-xs btn-ghost">${icon('arrow-right')}</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">
        ${DIAS_CORTO.map(d => `<div style="text-align:center;font-size:.7rem;font-weight:600;color:var(--text-soft);padding:.3rem 0">${d}</div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
        ${celdas.map(fecha => {
          if (!fecha) return `<div></div>`;
          const evs    = eventosPorFecha[fecha] || [];
          const esHoyC = fecha === hoyStr;
          const esSel  = fecha === diaSeleccionado;
          const tieneAuto = evs.some(e => e._auto);
          const tieneMan  = evs.some(e => !e._auto);
          const dia = parseInt(fecha.split('-')[2]);
          return `
            <div data-dia="${fecha}" style="
              min-height:50px;padding:.35rem .3rem;border-radius:var(--r-sm);cursor:pointer;
              border:2px solid ${esSel ? 'var(--primary)' : 'transparent'};
              background:${esHoyC ? 'var(--primary-soft)' : esSel ? 'color-mix(in srgb,var(--primary) 8%,transparent)' : 'var(--surface-2)'};
              transition:background .1s,border-color .1s">
              <div style="font-size:.8rem;font-weight:${esHoyC?'800':'500'};color:${esHoyC?'var(--primary)':'var(--text)'};text-align:center">${dia}</div>
              <div style="display:flex;justify-content:center;gap:2px;margin-top:3px">
                ${tieneMan  ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--primary);display:inline-block"></span>` : ''}
                ${tieneAuto ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--warning);display:inline-block"></span>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>

      <div style="display:flex;gap:1.5rem;margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:var(--text-soft)">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--primary);display:inline-block"></span>Evento manual
        </div>
        <div style="display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:var(--text-soft)">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--warning);display:inline-block"></span>Alerta automática
        </div>
      </div>
    </div>

    <!-- PILLS FILTRO -->
    <div style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">
      ${[
        { id:'hoy',      label: fechaDia === hoyStr ? 'Hoy' : fmtFechaCorta(fechaDia) },
        { id:'proximas', label: 'Próximas' },
        { id:'vencidas', label: 'Vencidas', danger: true },
      ].map(p => {
        const activo = filtroActivo === p.id;
        const color  = p.danger && counts[p.id] ? 'var(--danger)' : 'var(--primary)';
        return `<button data-filtro-agenda="${p.id}" style="
          padding:.35rem .9rem;border-radius:999px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;
          background:${activo ? color : 'var(--surface-2)'};
          color:${activo ? '#fff' : (p.danger && counts[p.id] ? 'var(--danger)' : 'var(--text-soft)')};
          transition:all .15s">
          ${p.label}${counts[p.id] ? ` <span style="opacity:.75">(${counts[p.id]})</span>` : ''}
        </button>`;
      }).join('')}
    </div>

    <!-- LISTA DE TAREAS -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
      <h2 style="font-size:.95rem;font-weight:700;margin:0;color:${filtroActivo==='vencidas'&&vencidas.length?'var(--danger)':'var(--text)'}">
        ${labelFiltro}
      </h2>
      ${filtroActivo === 'hoy' ? `<button class="btn btn-xs btn-ghost" id="btnNuevoEvento" style="color:var(--primary)">${icon('plus')} Agregar</button>` : ''}
    </div>

    ${listaActiva.length ? `
    <div class="card" style="overflow:hidden">
      ${listaActiva.map((t,i) => renderTarea(t, clientes, i < listaActiva.length - 1, filtroActivo === 'vencidas')).join('')}
    </div>` : `
    <div class="card" style="padding:1.5rem;text-align:center;color:var(--text-faint);font-size:.85rem">
      ${filtroActivo === 'hoy' ? 'Sin tareas para este día' : filtroActivo === 'proximas' ? 'No hay eventos futuros' : 'Sin pendientes vencidas'}
    </div>`}`;
}

function renderTarea(t, clientes, conBorde, esVencida = false) {
  const borde = conBorde ? 'border-bottom:1px solid var(--border);' : '';

  if (t._auto) {
    return `
      <div data-ir-alq="${t.alqId}" style="${borde}padding:.85rem 1.1rem;cursor:pointer;display:flex;align-items:center;gap:.85rem;transition:background .1s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--warning);flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.85rem;font-weight:600;color:${esVencida?'var(--danger)':'var(--text)'}">${esc(t.titulo)}</div>
          <div style="font-size:.75rem;color:var(--text-soft);margin-top:.1rem">${esc(t.cuerpo)}${esVencida&&t.fecha ? ` · ${fmtFechaCorta(t.fecha)}` : ''}</div>
        </div>
        <span style="font-size:.72rem;color:var(--primary);white-space:nowrap;flex-shrink:0">Ver contrato →</span>
      </div>`;
  }

  const cli = clientes.find(c => c.id === t.clienteId);
  const tipoObj = TIPOS_EVENTO?.find(tp => tp.id === t.tipo);
  return `
    <div style="${borde}padding:.85rem 1.1rem;display:flex;align-items:center;gap:.85rem">
      <span style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.85rem;font-weight:600;color:${esVencida?'var(--danger)':'var(--text)'}">${esc(t.titulo)}</div>
        <div style="font-size:.75rem;color:var(--text-soft);margin-top:.1rem">
          ${esVencida&&t.fecha ? `${fmtFechaCorta(t.fecha)} · ` : ''}${t.hora ? `<strong>${t.hora}</strong> · ` : ''}${tipoObj?.label||''}${cli?' · '+esc(cli.nombre):''}${t.notas?' · '+esc(t.notas):''}
        </div>
      </div>
      <div style="display:flex;gap:.25rem;flex-shrink:0">
        <button class="btn btn-xs btn-ghost" data-completar="${t.id}" title="Completar">${icon('check')}</button>
        <button class="btn btn-xs btn-ghost" data-editar="${t.id}" title="Editar">${icon('edit')}</button>
        <button class="btn btn-xs btn-ghost" data-eliminar="${t.id}" title="Eliminar">${icon('trash')}</button>
      </div>
    </div>`;
}
