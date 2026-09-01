/* ============================================================
   VISTA · Liquidaciones — pagos a propietarios
   ============================================================ */
import { getState, actions, subscribe, sel } from '../store.js';
import { icon } from '../config.js';
import { esc, fmtMontoInput, valorMonto, debounce, compartirArchivoPorWhatsApp, avisoEnvioWhatsApp } from '../lib.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { imprimirLiquidacion, generarPDFLiquidacion } from '../imprimir.js?v=2';

function fmtFecha(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function mesLabel(s) {
  if (!s) return '—';
  const [y, m] = s.split('-');
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${MESES[+m - 1]} ${y}`;
}
function fmt$(n) { return Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }); }

/* ── Forma de pago (una o varias líneas: efectivo + transferencia, etc.) ── */
const METODOS_PAGO = [
  { id: 'Efectivo', icon: '💵' },
  { id: 'Transferencia', icon: '🏦' },
  { id: 'Cheque', icon: '📄' },
  { id: 'Otro', icon: '📝' },
];

function pagosBlockHTML() {
  return `
    <div class="form-group full">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <label style="margin:0">Forma de pago</label>
        <button type="button" data-btn-add-pago class="btn btn-xs btn-ghost">${icon('plus')} Dividir pago</button>
      </div>
      <div data-pagos-blk></div>
    </div>`;
}

/** Gestiona las líneas de pago dentro de un contenedor. `getTotal` debe devolver el total a pagar
 *  vigente. `root` debe contener el `pagosBlockHTML()` correspondiente — al estar scopeado se puede
 *  montar más de una instancia en el mismo modal (una por propietario, para co-propiedades). */
function montarPagos(root, { getTotal }) {
  const ov = root;
  const mostrarRef = (m) => ['Transferencia', 'Cheque'].includes(m);
  let pagos = [{ metodoPago: 'Efectivo', monto: getTotal(), referencia: '' }];

  const resumen = () => {
    const total = Number(getTotal()) || 0;
    // Con una sola línea de pago no hay nada que "repartir": el monto siempre
    // tiene que ser el total vigente (si no, queda desactualizado al cambiar
    // % de comisión, descuentos, etc. después de haber montado el control).
    if (pagos.length === 1 && Number(pagos[0].monto) !== total) {
      pagos[0].monto = total;
      const inp = ov.querySelector('[data-pago-idx="0"] [data-f="monto"]');
      if (inp && document.activeElement !== inp) inp.value = fmtMontoInput(total);
    }
    const el = ov.querySelector('[data-pagos-resumen]');
    if (!el) return;
    const asignado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    if (pagos.length > 1) {
      const dif = Math.round((total - asignado) * 100) / 100;
      el.textContent = `Asignado: ${fmt$(asignado)} de ${fmt$(total)}` + (dif !== 0 ? ` · Faltan ${fmt$(dif)}` : ' · ✓ Coincide');
      el.style.color = dif === 0 ? 'var(--success)' : 'var(--warning)';
    } else {
      el.textContent = '';
    }
  };

  const render = () => {
    const blk = ov.querySelector('[data-pagos-blk]');
    blk.innerHTML = pagos.map((p, i) => `
      <div style="display:flex;gap:.5rem;align-items:flex-end;margin-bottom:.5rem;flex-wrap:wrap" data-pago-idx="${i}">
        <div class="form-group" style="margin:0;min-width:150px">
          <label style="font-size:.72rem">Método</label>
          <select data-f="metodoPago">
            ${METODOS_PAGO.map(m => `<option value="${m.id}" ${p.metodoPago === m.id ? 'selected' : ''}>${m.icon} ${m.id}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;width:130px">
          <label style="font-size:.72rem">Monto $</label>
          <input type="text" inputmode="numeric" class="input-monto" data-f="monto" value="${fmtMontoInput(p.monto)}">
        </div>
        ${mostrarRef(p.metodoPago) ? `
        <div class="form-group" style="margin:0;flex:1;min-width:160px">
          <label style="font-size:.72rem">Referencia</label>
          <input type="text" data-f="referencia" value="${esc(p.referencia || '')}" placeholder="CBU / N° / banco">
        </div>` : ''}
        ${pagos.length > 1 ? `<button type="button" class="btn btn-xs btn-ghost" data-del-pago="${i}" style="color:var(--danger)">✕</button>` : ''}
      </div>`).join('') + `<div data-pagos-resumen style="font-size:.78rem;margin-top:.2rem"></div>`;

    blk.querySelectorAll('[data-pago-idx]').forEach(row => {
      const i = Number(row.dataset.pagoIdx);
      row.querySelector('[data-f="metodoPago"]').addEventListener('change', e => { pagos[i].metodoPago = e.target.value; render(); });
      row.querySelector('[data-f="monto"]').addEventListener('input', e => { pagos[i].monto = valorMonto(e.target.value); resumen(); });
      row.querySelector('[data-f="referencia"]')?.addEventListener('input', e => { pagos[i].referencia = e.target.value; });
    });
    blk.querySelectorAll('[data-del-pago]').forEach(btn => {
      btn.addEventListener('click', () => { pagos.splice(Number(btn.dataset.delPago), 1); render(); });
    });
    resumen();
  };

  ov.querySelector('[data-btn-add-pago]').addEventListener('click', () => {
    const total = Number(getTotal()) || 0;
    const asignado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const restante = Math.max(0, total - asignado);
    const usados = pagos.map(p => p.metodoPago);
    const siguiente = METODOS_PAGO.find(m => !usados.includes(m.id))?.id || 'Transferencia';
    pagos.push({ metodoPago: siguiente, monto: restante || '', referencia: '' });
    render();
  });

  render();

  return {
    getPagos: () => pagos.filter(p => Number(p.monto) > 0)
      .map(p => ({ metodoPago: p.metodoPago, monto: Number(p.monto), referencia: p.referencia || null })),
    refrescarTotal: resumen,
  };
}

/* Claves `${cobroId}::${propietarioId}` ya liquidadas — permite que un cobro de una
   propiedad con 2+ dueños se liquide a uno primero y al otro después sin desaparecer
   de la lista de pendientes antes de tiempo. */
function clavesLiquidadas(liquidaciones) {
  const set = new Set();
  (liquidaciones || []).forEach(l => {
    const ids = (l.liquidadosCobros && l.liquidadosCobros.length) ? l.liquidadosCobros : (l.cobroId ? [l.cobroId] : []);
    const ownerIds = (l.propietarios && l.propietarios.length) ? l.propietarios.map(p => p.propietarioId) : (l.propietarioId ? [l.propietarioId] : []);
    ids.forEach(cid => ownerIds.forEach(oid => set.add(`${cid}::${oid}`)));
  });
  return set;
}

/* Agrupa candidatos por propietario ÚNICO de la propiedad, prorrateando el monto de cada
   cobro (siempre será su 100%, ya que no hay más dueños) — permite bundlear varias
   propiedades del mismo dueño en una sola liquidación. Las propiedades con 2+ dueños se
   agrupan aparte, ver `agruparPorPropiedadCoPropiedad`, para salir en UNA sola liquidación
   con el reparto entre todos los dueños en vez de una liquidación por dueño. */
function agruparPorPropietarioUnico(candidatos, liquidadas, state) {
  const { propietarios } = state;
  const grupos = {};
  candidatos.forEach(({ alq, cobro, inq, prop, esImpago }) => {
    const owners = sel.propietariosDePropiedad(prop);
    if (owners.length !== 1) return; // co-propiedad: ver agruparPorPropiedadCoPropiedad
    const o = owners[0];
    if (cobro.id && liquidadas.has(`${cobro.id}::${o.propietarioId}`)) return; // ya liquidado a este dueño
    if (!grupos[o.propietarioId]) {
      grupos[o.propietarioId] = {
        propietarioId: o.propietarioId,
        own: propietarios.find(x => x.id === o.propietarioId),
        totalPropiedades: sel.propiedadesDe(o.propietarioId).filter(p => sel.propietariosDePropiedad(p).length === 1).length,
        cobros: [],
      };
    }
    // Base = valor pactado del alquiler del mes (montoAlquiler), NUNCA lo que efectivamente
    // cobró el inquilino (cobro.monto) — ese puede venir con mora sumada o con un descuento
    // restado (ej. una reparación que pagó el inquilino), y la comisión de la inmobiliaria
    // siempre se calcula sobre el valor del alquiler, sin importar esos ajustes.
    const montoBase = Number(cobro.montoAlquiler ?? cobro.monto) || 0;
    const monto = Math.round(montoBase * (Number(o.porcentaje) || 0) / 100);
    grupos[o.propietarioId].cobros.push({ alq, cobro, inq, prop, owner: o, monto, esImpago });
  });
  const arr = Object.values(grupos).map(g => {
    const meses = [...new Set(g.cobros.map(c => c.cobro.mes))].sort();
    return { ...g, meses };
  });
  arr.sort((a, b) => (a.meses[0] || '').localeCompare(b.meses[0] || ''));
  return arr;
}

/* Agrupa candidatos de propiedades con 2+ dueños — una tarjeta por PROPIEDAD (no por
   dueño), para que al liquidar salga una sola liquidación con el reparto entre todos los
   dueños adentro, en vez de una liquidación separada por cada uno. */
function agruparPorPropiedadCoPropiedad(candidatos, liquidadas) {
  const grupos = {};
  candidatos.forEach(({ alq, cobro, inq, prop, esImpago }) => {
    const owners = sel.propietariosDePropiedad(prop);
    if (owners.length <= 1) return; // dueño único: ver agruparPorPropietarioUnico
    const yaLiquidadoATodos = cobro.id && owners.every(o => liquidadas.has(`${cobro.id}::${o.propietarioId}`));
    if (yaLiquidadoATodos) return;
    if (!grupos[prop.id]) {
      grupos[prop.id] = { esCoPropiedad: true, propiedadId: prop.id, prop, owners, cobros: [] };
    }
    // Mismo criterio que en agruparPorPropietarioUnico: base = valor pactado del alquiler,
    // no lo que efectivamente cobró el inquilino.
    grupos[prop.id].cobros.push({ alq, cobro, inq, prop, monto: Number(cobro.montoAlquiler ?? cobro.monto) || 0, esImpago });
  });
  const arr = Object.values(grupos).map(g => {
    const meses = [...new Set(g.cobros.map(c => c.cobro.mes))].sort();
    return { ...g, meses };
  });
  arr.sort((a, b) => (a.meses[0] || '').localeCompare(b.meses[0] || ''));
  return arr;
}

/* Detecta todo lo pendiente de liquidar por propietario, en UNA sola lista: junta los
   cobros que ya pagó el inquilino (listos para liquidar) con los que todavía no pagó
   (se le podrían adelantar al propietario) — cada ítem lleva su propio flag `esImpago`
   para que, adentro del formulario de liquidar, quede a mano del dueño de la inmobiliaria
   elegir cuáles incluye ahora, sin importar si ya se cobraron o no. Lo que no se elija
   sigue figurando acá para la próxima. */
function cobrosALiquidar(state) {
  const { alquileres, liquidaciones, clientes, propiedades } = state;
  const liquidadas = clavesLiquidadas(liquidaciones);

  const candidatos = [];

  alquileres.forEach(a => {
    const prop = propiedades.find(x => x.id === a.propiedadId);
    if (!prop) return;
    const inq = clientes.find(x => x.id === a.inquilinoId);

    (a.cobros || []).forEach(c => {
      if (!c.pagado || !c.monto) return;
      if (c.imputarAlMes) return; // imputado a un mes atrasado: no debe figurar para liquidar hoy
      candidatos.push({ alq: a, cobro: c, inq, prop, esImpago: false });
    });

    sel.cobrosImpagosMes(a).forEach(c => {
      candidatos.push({ alq: a, cobro: c, inq, prop, esImpago: true });
    });
  });

  return [
    ...agruparPorPropietarioUnico(candidatos, liquidadas, state),
    ...agruparPorPropiedadCoPropiedad(candidatos, liquidadas),
  ];
}

export default function liquidaciones(root) {
  root.innerHTML = `<div class="view" id="vLiq"></div>`;
  let filtro = 'pendientes'; // pendientes | historial
  let histFiltro = 'todas';  // todas | cobradas | adelantos
  let busqueda = '';
  let pendientes = [];

  const render = () => {
    const el = root.querySelector('#vLiq');
    const activo = el.querySelector('#buscarLiq');
    const conFoco = !!activo && activo === document.activeElement;
    const selStart = conFoco ? activo.selectionStart : null;
    const selEnd = conFoco ? activo.selectionEnd : null;
    const state = getState();
    pendientes = cobrosALiquidar(state);
    pintar(el, filtro, pendientes, histFiltro, busqueda);
    if (conFoco) {
      const nuevo = el.querySelector('#buscarLiq');
      if (nuevo) {
        nuevo.focus();
        nuevo.setSelectionRange(selStart, selEnd);
      }
    }
  };

  render();
  const unsub = subscribe(render);

  root.querySelector('#vLiq').addEventListener('input', debounce(e => {
    if (e.target.id === 'buscarLiq') { busqueda = e.target.value.toLowerCase(); render(); }
  }, 150));

  root.querySelector('#vLiq').addEventListener('click', async e => {
    const pill = e.target.closest('[data-filtro]');
    if (pill) { filtro = pill.dataset.filtro; render(); return; }

    const histPill = e.target.closest('[data-hist-filtro]');
    if (histPill) { histFiltro = histPill.dataset.histFiltro; render(); return; }

    // Liquidar un grupo (todas las propiedades pendientes de un propietario, o una
    // co-propiedad completa) — el propio formulario deja elegir cuáles incluir,
    // ya sean cobros cobrados o todavía pendientes de cobro.
    const btnLiq = e.target.closest('[data-liq-grupo]');
    if (btnLiq) {
      const esCo = btnLiq.dataset.liqCo === '1';
      const key = btnLiq.dataset.liqProp;
      if (esCo) {
        const grupo = pendientes.find(g => g.esCoPropiedad && g.propiedadId === key);
        if (grupo) abrirFormLiquidacionCoPropiedad(grupo, render);
      } else {
        const grupo = pendientes.find(g => !g.esCoPropiedad && g.propietarioId === key);
        if (grupo) abrirFormLiquidacionGrupal(grupo, render);
      }
      return;
    }

    // Acciones sobre liquidaciones ya registradas
    const card = e.target.closest('[data-liq-id]');
    if (!card) return;
    const id = card.dataset.liqId;

    if (e.target.closest('[data-pdf]'))      { generarPDF(id); return; }
    const btnPdfOwner = e.target.closest('[data-pdf-owner]');
    if (btnPdfOwner) { generarPDF(btnPdfOwner.dataset.pdfOwner, btnPdfOwner.dataset.ownerId); return; }
    if (e.target.closest('[data-wa]'))       { enviarWA(id); return; }
    const btnWaOwner = e.target.closest('[data-wa-owner]');
    if (btnWaOwner) { enviarWA(btnWaOwner.dataset.waOwner, btnWaOwner.dataset.ownerId); return; }
    if (e.target.closest('[data-eliminar]')) {
      if (confirm('¿Eliminar esta liquidación? También se va a borrar el pago al propietario que quedó registrado en Control de caja.')) {
        await actions.deleteLiquidacion(id);
        toast('Liquidación eliminada — se sacó el pago correspondiente de la caja');
      }
      return;
    }
  });

  return unsub;
}

function textoGrupo(g) {
  if (g.esCoPropiedad) {
    const { propietarios } = getState();
    const nombresOwners = (g.owners || []).map(o => propietarios.find(p => p.id === o.propietarioId)?.nombre || '').join(' ');
    return `${nombresOwners} ${g.prop?.direccion || ''} ${g.cobros.map(c => c.inq?.nombre || '').join(' ')}`.toLowerCase();
  }
  return `${g.own?.nombre || ''} ${g.cobros.map(c => `${c.prop?.direccion || ''} ${c.inq?.nombre || ''}`).join(' ')}`.toLowerCase();
}

function textoHistorial(l) {
  const owners = l._owns ? l._owns.map(o => o.own?.nombre || '').join(' ') : (l._own?.nombre || '');
  return `${owners} ${l._prop?.direccion || ''} ${l._inq?.nombre || ''}`.toLowerCase();
}

function pintar(el, filtro, pendientes, histFiltro, busqueda) {
  const state = getState();
  const { liquidaciones: list, alquileres } = state;
  const historial  = (list || []).map(l => {
    const alq  = alquileres.find(a => a.id === l.alquilerId) || {};
    const prop = state.propiedades.find(p => p.id === (l.propiedadId || alq.propiedadId)) || {};
    const esMulti = Array.isArray(l.propietarios) && l.propietarios.length > 0;
    const own  = esMulti ? null : (state.propietarios.find(p => p.id === (l.propietarioId || alq.propietarioId)) || {});
    const owns = esMulti ? l.propietarios.map(po => ({ ...po, own: state.propietarios.find(p => p.id === po.propietarioId) })) : null;
    const inq  = state.clientes.find(c => c.id === alq.inquilinoId) || {};

    // Para liquidaciones grupales de UN dueño con varias propiedades (bundle), contar
    // propiedades distintas. Las liquidaciones de co-propiedad ya traen `propiedadId`
    // seteado (una sola propiedad), así que no cuentan como "grupales" acá.
    let nPropsGrupal = 0;
    if (!l.propiedadId && l.liquidadosCobros && l.liquidadosCobros.length > 1) {
      const propIds = new Set();
      l.liquidadosCobros.forEach(cobroId => {
        const a = alquileres.find(a => (a.cobros || []).some(c => c.id === cobroId));
        if (a) propIds.add(a.propiedadId);
      });
      nPropsGrupal = propIds.size;
    }

    return { ...l, _alq: alq, _prop: prop, _own: own, _owns: owns, _inq: inq, _nPropsGrupal: nPropsGrupal };
  }).sort((a, b) => (b.fechaPago || '').localeCompare(a.fechaPago || ''));

  let historialFiltrado = histFiltro === 'cobradas'   ? historial.filter(l => l.cobradoInquilino !== false)
                         : histFiltro === 'adelantos'  ? historial.filter(l => l.cobradoInquilino === false)
                         : historial;

  if (busqueda) {
    pendientes = pendientes.filter(g => textoGrupo(g).includes(busqueda));
    historialFiltrado = historialFiltrado.filter(l => textoHistorial(l).includes(busqueda));
  }

  const totalCobrado      = pendientes.reduce((s, g) => s + (g.cobros || []).filter(c => !c.esImpago).reduce((s2, c) => s2 + (c.monto || 0), 0), 0);
  const totalPorCobrar    = pendientes.reduce((s, g) => s + (g.cobros || []).filter(c => c.esImpago).reduce((s2, c) => s2 + (c.monto || 0), 0), 0);
  const nPend = pendientes.length;

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Liquidaciones</h1>
        <p class="view-sub">${nPend} propietario${nPend!==1?'s':''} por liquidar · ${fmt$(totalCobrado)} cobrado${totalPorCobrar ? ` · ${fmt$(totalPorCobrar)} pendiente de cobro` : ''}</p>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="buscarLiq" placeholder="Buscar por propietario, propiedad o inquilino…" value="${esc(busqueda || '')}">
      </div>
    </div>

    <!-- Pills -->
    <div style="display:flex;gap:.5rem;margin-bottom:1.25rem">
      ${[
        { id:'pendientes', label:'Por liquidar', count: nPend, danger: nPend > 0 },
        { id:'historial',  label:'Historial',    count: historial.length },
      ].map(p => {
        const activo = filtro === p.id;
        const color  = p.danger ? 'var(--danger)' : 'var(--primary)';
        return `<button data-filtro="${p.id}" style="
          padding:.35rem .9rem;border-radius:999px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;
          background:${activo ? color : 'var(--surface-2)'};
          color:${activo ? '#fff' : (p.danger ? 'var(--danger)' : 'var(--text-soft)')};
          transition:all .15s">
          ${p.label}${p.count ? ` (${p.count})` : ''}
        </button>`;
      }).join('')}
    </div>

    ${filtro === 'pendientes' ? renderPendientes(pendientes) : renderHistorial(historialFiltrado, histFiltro)}
  `;
}

function renderPendientes(pendientes) {
  if (!pendientes.length) return `
    <div class="card" style="padding:2rem 1.5rem;text-align:center;color:var(--text-soft)">
      <div style="font-size:2rem;margin-bottom:.5rem">✅</div>
      <div style="font-weight:600;margin-bottom:.25rem">Todo liquidado</div>
      <div style="font-size:.82rem;color:var(--text-faint)">No hay cobros de inquilinos pendientes de liquidar al propietario</div>
    </div>`;

  return `
    <div style="display:flex;flex-direction:column;gap:.6rem">
      ${pendientes.map(g => cardGrupo(g)).join('')}
    </div>`;
}

/* Direcciones que se repiten dentro del mismo grupo — cada fila de entrada ya es una
 * propiedad (prop.id) distinta, así que si dos comparten el mismo texto de dirección
 * casi siempre significa que esa propiedad quedó cargada dos veces por error (duplicada
 * en "Propiedades"), y por eso el inquilino/cobro sale repetido en la liquidación. Se
 * marca para que se revise antes de liquidar o de mandar el comprobante. */
function direccionesDuplicadas(filas) {
  const porDireccion = {};
  filas.forEach(f => {
    const dir = (f.prop?.direccion || '').trim().toLowerCase();
    if (!dir) return;
    (porDireccion[dir] = porDireccion[dir] || new Set()).add(f.prop?.id);
  });
  const dup = new Set();
  Object.values(porDireccion).forEach(ids => {
    if (ids.size > 1) ids.forEach(id => dup.add(id));
  });
  return dup;
}

function cardGrupo(grupo) {
  if (grupo.esCoPropiedad) return cardGrupoCoPropiedad(grupo);

  const totalCobros = grupo.cobros.reduce((s, c) => s + (c.monto || 0), 0);
  const totalPorCobrar = grupo.cobros.filter(c => c.esImpago).reduce((s, c) => s + (c.monto || 0), 0);
  const nProps = new Set(grupo.cobros.map(c => c.prop?.id)).size;
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;

  // Agrupar los cobros por propiedad para el detalle (una propiedad puede tener varios meses pendientes)
  const porProp = {};
  grupo.cobros.forEach(c => {
    const k = c.prop?.id || 'x';
    if (!porProp[k]) porProp[k] = { prop: c.prop, inq: c.inq, meses: [], total: 0, tieneImpago: false };
    porProp[k].meses.push(c.cobro.mes);
    porProp[k].total += c.monto || 0;
    if (c.esImpago) porProp[k].tieneImpago = true;
  });
  const detalle = Object.values(porProp);
  const dupIds = direccionesDuplicadas(detalle);

  return `
    <div class="card" style="padding:1rem 1.25rem;border-left:3px solid var(--warning)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
            <span style="font-weight:700;font-size:1.05rem">${esc(grupo.own?.nombre || '—')}</span>
            <span class="badge badge-warning" style="font-size:.72rem">${mesesLabelStr}</span>
            <span class="badge badge-neutral" style="font-size:.72rem">${nProps}/${grupo.totalPropiedades} ${grupo.totalPropiedades === 1 ? 'propiedad' : 'propiedades'}</span>
            ${totalPorCobrar ? `<span class="badge badge-info" style="font-size:.72rem">⏳ ${fmt$(totalPorCobrar)} sin cobrar aún</span>` : ''}
            ${dupIds.size ? `<span class="badge badge-danger" style="font-size:.72rem">⚠ Hay una dirección repetida — revisá que no esté duplicada en Propiedades</span>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            ${detalle.map(d => `
              <div style="font-size:.82rem;color:${dupIds.has(d.prop?.id) ? 'var(--danger)' : 'var(--text-soft)'}">
                ${esc(d.prop?.direccion || '—')}${dupIds.has(d.prop?.id) ? ' ⚠' : ''}
                <span style="color:var(--text-faint)"> · ${d.meses.map(mesLabel).join(', ')} · ${esc(d.inq?.nombre || '—')} · ${fmt$(d.total)}</span>
                ${d.tieneImpago ? ` <span class="badge badge-info" style="font-size:.65rem">⏳ sin cobrar</span>` : ''}
              </div>`).join('')}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.5rem">
          <div style="font-size:1.3rem;font-weight:900;color:var(--warning)">${fmt$(totalCobros)}</div>
          <button class="btn btn-primary btn-sm" data-liq-grupo data-liq-prop="${grupo.propietarioId}">
            Liquidar →
          </button>
        </div>
      </div>
    </div>`;
}

/* Tarjeta para una propiedad con 2+ dueños — liquidar acá genera UNA sola liquidación
   con el reparto entre todos los dueños adentro (ver abrirFormLiquidacionCoPropiedad). */
function cardGrupoCoPropiedad(grupo) {
  const { propietarios } = getState();
  const totalCobros = grupo.cobros.reduce((s, c) => s + (c.monto || 0), 0);
  const totalPorCobrar = grupo.cobros.filter(c => c.esImpago).reduce((s, c) => s + (c.monto || 0), 0);
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;
  const nombresOwners = grupo.owners
    .map(o => `${propietarios.find(p => p.id === o.propietarioId)?.nombre || '—'} (${o.porcentaje}%)`)
    .join(' + ');

  return `
    <div class="card" style="padding:1rem 1.25rem;border-left:3px solid var(--warning)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
            <span style="font-weight:700;font-size:1.05rem">${esc(nombresOwners)}</span>
            <span class="badge badge-neutral" style="font-size:.72rem">👥 Co-propiedad</span>
            <span class="badge badge-warning" style="font-size:.72rem">${mesesLabelStr}</span>
            ${totalPorCobrar ? `<span class="badge badge-info" style="font-size:.72rem">⏳ ${fmt$(totalPorCobrar)} sin cobrar aún</span>` : ''}
          </div>
          <div style="font-size:.82rem;color:var(--text-soft)">
            ${esc(grupo.prop?.direccion || '—')}
            <span style="color:var(--text-faint)"> · ${grupo.cobros.map(c => `${mesLabel(c.cobro.mes)} · ${esc(c.inq?.nombre || '—')} · ${fmt$(c.monto)}${c.esImpago ? ' ⏳' : ''}`).join(' · ')}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.5rem">
          <div style="font-size:1.3rem;font-weight:900;color:var(--warning)">${fmt$(totalCobros)}</div>
          <button class="btn btn-primary btn-sm" data-liq-grupo data-liq-co="1" data-liq-prop="${grupo.propiedadId}">
            Liquidar →
          </button>
        </div>
      </div>
    </div>`;
}

function renderHistorial(historial, histFiltro) {
  const chips = [
    { id: 'todas',      label: 'Todas' },
    { id: 'cobradas',   label: 'Cobradas al inquilino' },
    { id: 'adelantos',  label: 'Adelantos' },
  ];
  const chipsHTML = `
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem">
      ${chips.map(c => `
        <button data-hist-filtro="${c.id}" style="border:1.5px solid;border-radius:var(--r-full);padding:.25rem .75rem;font-size:.74rem;font-weight:600;cursor:pointer;transition:all .15s;${
          histFiltro === c.id
            ? 'background:var(--primary);color:var(--on-primary);border-color:var(--primary)'
            : 'background:var(--surface);color:var(--text);border-color:var(--border)'
        }">${c.label}</button>`).join('')}
    </div>`;

  if (!historial.length) return `
    ${chipsHTML}
    <div class="card" style="padding:2rem 1.5rem;text-align:center;color:var(--text-soft)">
      <div style="font-size:2rem;margin-bottom:.5rem">📄</div>
      <div style="font-weight:600">Sin historial aún</div>
    </div>`;

  return `
    ${chipsHTML}
    <div style="display:flex;flex-direction:column;gap:.6rem">
      ${historial.map(l => {
        const hon      = l.montoHonorarios ?? Math.round((l.montoAlquiler || 0) * (l.pctHonorarios || 0) / 100);
        // Positivo = cargos superan a los descuentos; negativo = al revés (comportamiento
        // de siempre para liquidaciones viejas, que solo tenían descuentos sin `tipo`).
        const ajusteTot = (l.descuentos || []).reduce((s, d) => s + (d.tipo === 'cargo' ? 1 : -1) * (Number(d.monto) || 0), 0);
        const esGrupal = !l.propiedadId && l.liquidadosCobros && l.liquidadosCobros.length > 1;
        const esAdelanto = l.cobradoInquilino === false;
        const nombreCabecera = l._owns
          ? l._owns.map(o => `${esc(o.own?.nombre || '—')} (${o.porcentaje}%)`).join(' + ')
          : esc(l._own?.nombre || '—');
        return `
        <div class="card" data-liq-id="${l.id}" style="padding:1rem 1.25rem;${esAdelanto ? 'border-left:3px solid var(--info)' : ''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
                <span style="font-weight:700">${nombreCabecera}</span>
                <span class="badge badge-success">Liquidado</span>
                ${l._owns ? `<span class="badge badge-neutral" style="font-size:.72rem">👥 Co-propiedad</span>` : ''}
                ${esGrupal ? `<span class="badge badge-info" style="font-size:.72rem">📋 Grupal</span>` : ''}
                ${esAdelanto ? `<span class="badge badge-info" style="font-size:.72rem">⏳ Adelanto (no cobrado al inquilino)</span>` : ''}
                ${l.noCaja ? `<span class="badge badge-neutral" style="font-size:.72rem">🚫 No cargada a caja</span>` : ''}
                ${l.porcentajeReparto != null && l.porcentajeReparto < 100 ? `<span class="badge badge-neutral" style="font-size:.72rem">${l.porcentajeReparto}% de la propiedad</span>` : ''}
                ${l.meses && l.meses.length > 1
                  ? `<span class="badge badge-neutral">${mesLabel(l.meses[0])} – ${mesLabel(l.meses[l.meses.length - 1])}</span>`
                  : (l.mes ? `<span class="badge badge-neutral">${mesLabel(l.mes)}</span>` : '')}
              </div>
              <div style="font-size:.82rem;color:var(--text-soft);margin-bottom:.4rem">
                ${esGrupal ?
                  `<strong>${l._nPropsGrupal || 1} ${l._nPropsGrupal === 1 ? 'propiedad' : 'propiedades'}</strong> · ${l.liquidadosCobros.length} cobros` :
                  `${esc(l._prop?.direccion || '—')}${l._prop?.ciudad ? ' · ' + esc(l._prop.ciudad) : ''}`
                }
              </div>
              <div style="display:flex;gap:1.25rem;flex-wrap:wrap;font-size:.8rem">
                <span><span style="color:var(--text-soft)">Alquiler: </span><strong>${fmt$(l.montoAlquiler)}</strong></span>
                <span><span style="color:var(--text-soft)">Comisión${l._owns ? '' : ` (${l.pctHonorarios || 0}%)`}: </span><strong style="color:var(--danger)">−${fmt$(hon)}</strong></span>
                ${ajusteTot ? `<span><span style="color:var(--text-soft)">${ajusteTot > 0 ? 'Cargo' : 'Desc.'}: </span><strong style="color:${ajusteTot > 0 ? 'var(--success)' : 'var(--danger)'}">${ajusteTot > 0 ? '+' : '−'}${fmt$(Math.abs(ajusteTot))}</strong></span>` : ''}
                <span><span style="color:var(--text-soft)">Pagado: </span><strong style="color:var(--success)">${fmt$(l.totalPagar)}</strong></span>
              </div>
              ${l._owns ? `
              <div style="font-size:.78rem;color:var(--text-soft);margin-top:.3rem;display:flex;flex-direction:column;gap:.3rem">
                ${l._owns.map(o => `
                <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
                  <span>• ${esc(o.own?.nombre || '—')} — ${o.porcentaje}% · ${fmt$(o.totalPagar)}${o.formaPago ? ' · ' + esc(o.formaPago) : ''}</span>
                  <button class="btn btn-xs btn-ghost" data-pdf-owner="${l.id}" data-owner-id="${o.propietarioId}">${icon('file')} PDF individual</button>
                  ${o.own?.telefono ? `<button class="btn btn-xs btn-ghost" style="color:var(--success)" data-wa-owner="${l.id}" data-owner-id="${o.propietarioId}" title="Enviar por WhatsApp">${icon('whatsapp')}</button>` : ''}
                </div>`).join('')}
              </div>` : ''}
              <div style="font-size:.78rem;color:var(--text-faint);margin-top:.35rem">
                ${fmtFecha(l.fechaPago)}${l._owns ? '' : ' · ' + esc(l.formaPago || 'Efectivo')}
                ${l.notas ? ' · ' + esc(l.notas) : ''}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:.3rem;flex-shrink:0">
              <button class="btn btn-sm btn-ghost" data-pdf="${l.id}">${icon('file')} PDF</button>
              ${!l._owns && l._own?.telefono ? `<button class="btn btn-sm btn-ghost" style="color:var(--success)" data-wa="${l.id}" title="Enviar por WhatsApp">${icon('whatsapp')}</button>` : ''}
              <button class="btn btn-xs btn-ghost" style="color:var(--danger)" data-eliminar="${l.id}">${icon('trash')}</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

/* Reconstruye, a partir de los cobros liquidados guardados en la liquidación, el detalle
   propiedad + período + importe de cada uno — para que al reimprimir desde el historial
   la factura siga identificando exactamente qué se pagó, sin depender de que el contrato
   o el cobro original sigan intactos. */
function detalleDeLiquidacion(l, state) {
  const { alquileres, propiedades } = state;
  const ids = (l.liquidadosCobros && l.liquidadosCobros.length) ? l.liquidadosCobros : (l.cobroId ? [l.cobroId] : []);
  if (!ids.length) return null;
  const detalle = [];
  ids.forEach(cid => {
    for (const a of alquileres) {
      const c = (a.cobros || []).find(x => x.id === cid);
      if (c) {
        const prop = propiedades.find(p => p.id === a.propiedadId);
        detalle.push({ propiedad: prop?.direccion || '—', periodo: mesLabel(c.mes), monto: Number(c.monto) || 0 });
        break;
      }
    }
  });
  return detalle.length ? detalle : null;
}

/* Arma los params de imprimirLiquidacion/generarPDFLiquidacion para una liquidación ya guardada.
   Si es de varios propietarios y se pasa `soloPropietarioId`, arma solo la parte de ese
   propietario (para poder entregarle a cada uno su comprobante individual). Sin ese parámetro,
   arma el comprobante combinado con el reparto completo. Devuelve también el teléfono/nombre
   del destinatario más directo, para el envío por WhatsApp. */
function paramsLiquidacionGuardada(id, soloPropietarioId = null) {
  const state = getState();
  const { liquidaciones: list, alquileres, clientes, propietarios, propiedades } = state;
  const l    = (list || []).find(x => x.id === id);
  if (!l) return null;
  const alq  = alquileres.find(a => a.id === l.alquilerId) || {};
  const inq  = clientes.find(c => c.id === alq.inquilinoId) || {};
  const prop = propiedades.find(p => p.id === (l.propiedadId || alq.propiedadId)) || {};
  const cobroSint = { monto: l.montoAlquiler, mes: l.mes, fechaPago: l.fechaPago };
  const periodoLabel = !l.mes && l.meses && l.meses.length > 1
    ? `${mesLabel(l.meses[0])} – ${mesLabel(l.meses[l.meses.length - 1])}`
    : null;
  const detalle = detalleDeLiquidacion(l, state);

  if (Array.isArray(l.propietarios) && l.propietarios.length) {
    if (soloPropietarioId) {
      const po = l.propietarios.find(p => p.propietarioId === soloPropietarioId);
      if (!po) return null;
      const own = propietarios.find(p => p.id === po.propietarioId) || {};
      return {
        own, prop,
        params: {
          alq, cobro: cobroSint, inquilino: inq, propiedad: prop, propietario: own,
          pctHonorarios: po.pagaComision ? po.comisionPct : 0, descuentos: [],
          formaPago: po.formaPago || 'Efectivo', pagos: po.pagos || [],
          porcentajeReparto: po.porcentaje, periodoLabel, detalle,
          montoOverride: { totalAlquiler: po.montoBruto, honorarios: po.montoHonorarios, totalPagar: po.totalPagar },
        },
      };
    }
    const propietariosImpresion = l.propietarios.map(po => ({
      nombre: propietarios.find(p => p.id === po.propietarioId)?.nombre || '—',
      porcentaje: po.porcentaje,
      montoBruto: po.montoBruto,
      pctHonorarios: po.pagaComision ? po.comisionPct : 0,
      montoHonorarios: po.montoHonorarios,
      totalPagar: po.totalPagar,
      formaPago: po.formaPago,
      pagos: po.pagos || [],
    }));
    return {
      own: null, prop,
      params: { alq, cobro: cobroSint, inquilino: inq, propiedad: prop, propietario: null,
        propietarios: propietariosImpresion, descuentos: l.descuentos || [], periodoLabel, detalle },
    };
  }

  const own = propietarios.find(p => p.id === (l.propietarioId || alq.propietarioId)) || {};
  return {
    own, prop,
    params: { alq, cobro: cobroSint, inquilino: inq, propiedad: prop, propietario: own,
      pctHonorarios: l.pctHonorarios || 0, descuentos: l.descuentos || [], formaPago: l.formaPago || 'Efectivo',
      pagos: l.pagos || [], porcentajeReparto: l.porcentajeReparto, periodoLabel, detalle },
  };
}

function generarPDF(id, soloPropietarioId = null) {
  const datos = paramsLiquidacionGuardada(id, soloPropietarioId);
  if (datos) imprimirLiquidacion(datos.params);
}

/* ── Enviar por WhatsApp (comprobante combinado o individual de un propietario) ── */
async function enviarWA(id, soloPropietarioId = null) {
  const datos = paramsLiquidacionGuardada(id, soloPropietarioId);
  if (!datos) return;
  const tel = datos.own?.telefono;
  if (!tel) { toast('Cargá el teléfono del propietario para enviar por WhatsApp', { tipo: 'warning' }); return; }
  const texto = `Hola${datos.own?.nombre ? ' ' + datos.own.nombre : ''}! Te comparto la liquidación de ${datos.prop?.direccion || 'tu propiedad'}.`;
  try {
    const blob = await generarPDFLiquidacion(datos.params, 'liquidacion.pdf');
    const resultado = await compartirArchivoPorWhatsApp({ numero: tel, texto, archivo: blob, nombreArchivo: 'liquidacion.pdf' });
    const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'la liquidación');
    toast(msg, opts);
  } catch (err) {
    console.error('Error generando o compartiendo la liquidación:', err);
    toast('No se pudo generar el PDF para compartir por WhatsApp', { tipo: 'danger' });
  }
}

/* ── Formulario liquidar GRUPAL (múltiples propiedades de un propietario) ── */
export function abrirFormLiquidacionGrupal(grupo, onDone) {
  const { propietarios } = getState();
  const own = grupo.own || {};

  // Calcular totales (monto de referencia inicial — la selección real se hace con los
  // checkboxes "incluir" de cada propiedad, ver totalIncluido() en onMount). Por defecto
  // solo vienen tildados los cobros ya cobrados, así que el total inicial es solo de esos.
  const totalMonto = grupo.cobros.reduce((s, c) => s + (c.monto || 0), 0);
  const totalMontoDefault = grupo.cobros.filter(c => !c.esImpago).reduce((s, c) => s + (c.monto || 0), 0);
  const pctDef = grupo.cobros[0]?.owner?.comisionPct ?? 10;
  const tieneAlgunImpago = grupo.cobros.some(c => c.esImpago);

  const hoy = new Date().toISOString().slice(0, 10);
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;

  // Agrupar los cobros por propiedad (una propiedad puede tener varios meses pendientes).
  // Cada fila guarda sus `items` (los cobros originales, con su propio esImpago) para poder
  // filtrar por selección al guardar — así se puede excluir una propiedad entera, o marcar
  // una que todavía no cobró el inquilino como adelanto, todo desde el mismo formulario.
  const porProp = {};
  grupo.cobros.forEach(c => {
    const k = c.prop?.id || 'x';
    if (!porProp[k]) porProp[k] = { prop: c.prop, inq: c.inq, periodos: [], total: 0, owner: c.owner, multiDueno: sel.propietariosDePropiedad(c.prop).length > 1, items: [], tieneImpago: false };
    porProp[k].periodos.push({ mes: c.cobro.mes, fechaPago: c.cobro.fechaPago, esImpago: c.esImpago });
    porProp[k].total += c.monto || 0;
    porProp[k].items.push(c);
    if (c.esImpago) porProp[k].tieneImpago = true;
  });
  const detalleProps = Object.values(porProp);
  const dupIds = direccionesDuplicadas(detalleProps);

  openModal({
    title: `Liquidación — ${esc(own.nombre || '—')} — ${mesesLabelStr}`,
    size: 'xl',
    bodyHTML: `
      <form id="liqGrupalForm">
        ${dupIds.size ? `
        <div style="padding:.85rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--danger) 10%,transparent);border:1px solid var(--danger);margin-bottom:1.1rem;font-size:.85rem">
          ⚠ Dos de las propiedades de abajo tienen la <strong>misma dirección</strong> — probablemente una quedó cargada dos veces en "Propiedades" por error. Revisalo antes de liquidar para no pagarle al propietario de más (y no mandarle un comprobante con el ítem repetido).
        </div>` : ''}
        ${tieneAlgunImpago ? `
        <div style="padding:.85rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--info) 10%,transparent);border:1px solid var(--info);margin-bottom:1.1rem;font-size:.85rem">
          ⏳ Algunos de estos meses el inquilino todavía no los pagó (marcados abajo). Si los incluís en esta liquidación, es un <strong>adelanto</strong> de la inmobiliaria al propietario.
        </div>` : ''}

        <!-- Resumen de propiedades y cobros -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1rem;margin-bottom:1.25rem;border:1px solid var(--border)">
          <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.2rem">Propiedades y cobros del período (${detalleProps.length}/${grupo.totalPropiedades} ${grupo.totalPropiedades === 1 ? 'propiedad' : 'propiedades'})</div>
          <div style="font-size:.74rem;color:var(--text-faint);margin-bottom:.6rem">Tildadas: las ya cobradas al inquilino. Las que todavía no cobró vienen destildadas — tildalas solo si querés adelantarle esa plata al propietario. O elegí abajo qué liquidar de una:</div>
          ${tieneAlgunImpago ? `
          <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.75rem">
            <button type="button" class="btn btn-xs btn-ghost" data-seleccionar="todo">Todo (cobrado + adelanto)</button>
            <button type="button" class="btn btn-xs btn-ghost" data-seleccionar="cobrado">Solo lo cobrado</button>
            <button type="button" class="btn btn-xs btn-ghost" data-seleccionar="impago">Solo el adelanto</button>
          </div>` : ''}
          <div style="display:flex;flex-direction:column;gap:.6rem">
            ${detalleProps.map((d, i) => `
            <div style="padding:.6rem;background:var(--surface);border-radius:var(--r-sm);border-left:3px solid ${dupIds.has(d.prop?.id) ? 'var(--danger)' : 'var(--primary)'}" data-detalle-idx="${i}">
              <div style="font-weight:600;margin-bottom:.2rem">${esc(d.prop?.direccion || '—')}${dupIds.has(d.prop?.id) ? ' <span style="color:var(--danger);font-weight:700">⚠ dirección repetida</span>' : ''}</div>
              <div style="font-size:.78rem;color:var(--text-soft);margin-bottom:.45rem">${esc(d.inq?.nombre || '—')} · ${esc(d.prop?.barrio || '')}</div>
              <!-- Un checkbox POR PERÍODO (no uno por propiedad): una propiedad puede tener
                   meses ya cobrados junto con meses todavía impagos en la misma tanda, y hay
                   que poder incluir solo los cobrados sin arrastrar los que faltan cobrar. -->
              <div style="display:flex;flex-direction:column;gap:.35rem">
                ${d.periodos.map((p, j) => `
                <label style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;font-size:.8rem;padding:.35rem .5rem;border-radius:6px;background:var(--surface-2);cursor:pointer;transition:opacity .15s;opacity:${p.esImpago ? '.55' : '1'}" data-periodo-row="${i}:${j}">
                  <span style="display:flex;align-items:center;gap:.5rem">
                    <input type="checkbox" class="incluir-periodo" data-prop-idx="${i}" data-item-idx="${j}" data-esimpago="${p.esImpago ? '1' : '0'}" ${p.esImpago ? '' : 'checked'} style="width:16px;height:16px;cursor:pointer">
                    ${mesLabel(p.mes)}${p.esImpago ? ' · <span style="color:var(--info)">⏳ Sin cobrar</span>' : (p.fechaPago ? ` · Cobrado: ${fmtFecha(p.fechaPago)}` : '')}
                  </span>
                  <strong>${fmt$(d.items[j]?.monto)}</strong>
                </label>`).join('')}
              </div>
              ${d.multiDueno ? `
              <div style="display:flex;gap:.75rem;align-items:center;margin-top:.5rem;flex-wrap:wrap;padding-top:.5rem;border-top:1px dashed var(--border)">
                <span style="font-size:.72rem;color:var(--text-soft)">Esta propiedad tiene varios dueños —</span>
                <label style="font-size:.72rem;color:var(--text-soft)">tu %:
                  <input type="number" min="0" max="100" step="0.5" class="reparto-pct" data-idx="${i}" value="${d.owner?.porcentaje ?? 100}" style="width:65px;margin-left:.25rem">
                </label>
                <label style="font-size:.72rem;color:var(--text-soft);display:flex;align-items:center;gap:.25rem">
                  <input type="checkbox" class="reparto-paga" data-idx="${i}" ${(d.owner?.pagaComision ?? true) ? 'checked' : ''}> ¿Pagás comisión vos?
                </label>
                <label style="font-size:.72rem;color:var(--text-soft)">% comisión:
                  <input type="number" min="0" max="100" step="0.5" class="reparto-comision" data-idx="${i}" value="${d.owner?.comisionPct ?? ''}" placeholder="gral." style="width:60px;margin-left:.25rem">
                </label>
              </div>` : ''}
              <div style="text-align:right;font-weight:700;font-size:1.05rem;color:var(--primary);margin-top:.4rem" data-subtotal-idx="${i}">${fmt$(d.total)}</div>
            </div>`).join('')}
          </div>
          <div style="border-top:2px solid var(--border);margin-top:.75rem;padding-top:.75rem;display:flex;justify-content:space-between;align-items:center;font-size:1.1rem;font-weight:800">
            <span>TOTAL (seleccionado)</span>
            <span id="totalSeleccionado" style="color:var(--primary);font-size:1.3rem">${fmt$(totalMontoDefault)}</span>
          </div>
        </div>

        <h3 class="form-section-title">Comisión de la inmobiliaria</h3>
        <p class="text-xs text-soft" style="margin:-.4rem 0 .5rem">La comisión siempre se calcula sobre el alquiler seleccionado — los ajustes de abajo se suman o restan después, nunca cambian este %.</p>
        <div class="form-grid" style="margin-bottom:1.1rem">
          <div class="form-group">
            <label>% Comisión ${detalleProps.some(d => d.multiDueno) ? '(general, para propiedades sin % propio)' : ''}</label>
            <input name="pctHonorarios" id="liqPct" type="number" min="0" max="100" step="0.5" value="${pctDef}">
          </div>
          <div class="form-group">
            <label>Monto comisión $</label>
            <input id="liqMontoHon" type="text" readonly style="background:var(--surface-2);font-weight:700">
          </div>
        </div>

        <h3 class="form-section-title">Ajustes (cargos y descuentos)</h3>
        <p class="text-xs text-soft" style="margin:-.4rem 0 .5rem">Sumá un cargo (ej. algo que le cobrás aparte al propietario) o restá un descuento (ej. una reparación que pagó el inquilino y se la debitás al dueño) — se aplica DESPUÉS de la comisión y queda detallado en el comprobante.</p>
        <div id="descBlk" style="margin-bottom:.5rem"></div>
        <button type="button" id="btnAddDesc" class="btn btn-sm btn-ghost" style="margin-bottom:1.25rem">${icon('plus')} Agregar ítem</button>

        <!-- Resumen del cálculo, en el orden real: alquiler → comisión → ajustes → total -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1rem;margin-bottom:1.25rem;border:1px solid var(--border)">
          <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.6rem">Resumen del cálculo</div>
          <div style="display:flex;flex-direction:column;gap:.4rem;font-size:.85rem">
            <div style="display:flex;justify-content:space-between"><span>Alquiler seleccionado</span><strong id="resAlquiler">—</strong></div>
            <div style="display:flex;justify-content:space-between;color:var(--danger)"><span>− Comisión inmobiliaria</span><strong id="resComision">—</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Ajustes</span><strong id="resAjuste">—</strong></div>
            <div style="display:flex;justify-content:space-between;border-top:2px solid var(--border);padding-top:.5rem;margin-top:.1rem;font-size:1.05rem;font-weight:800">
              <span>Total a pagar al propietario</span><strong id="resTotalFinal" style="color:var(--success)">—</strong>
            </div>
          </div>
          <input type="hidden" name="totalPagar" id="liqTotal">
        </div>

        <h3 class="form-section-title">Datos del pago</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Fecha de pago <span class="req">*</span></label>
            <input name="fechaPago" type="date" value="${hoy}">
          </div>
          ${pagosBlockHTML()}
          <div class="form-group full">
            <label>Notas</label>
            <input name="notas" placeholder="Observaciones opcionales">
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;margin-top:.25rem">
          <input type="checkbox" id="chkNoCaja"> No cargar esta liquidación a la caja del mes
        </label>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
                 <button class="btn btn-ghost" id="btnSoloGuardar">Guardar sin PDF</button>
                 ${own.telefono ? `<button class="btn btn-ghost" id="btnGuardarWA" style="color:var(--success)">${icon('whatsapp')} Guardar y enviar por WhatsApp</button>` : ''}
                 <button class="btn btn-primary" id="btnGuardarPDF">Guardar y generar PDF</button>`,
    onMount(ctx) {
      const q = (s) => ctx.overlay.querySelector(s);
      let pagosCtl = null;

      // Selección a nivel de PERÍODO (mes dentro de una propiedad), no a nivel de propiedad
      // entera — así se puede incluir el mes ya cobrado y dejar afuera el que todavía no,
      // aunque sean de la misma propiedad.
      const incluidos = () => new Set(
        [...ctx.overlay.querySelectorAll('.incluir-periodo:checked')].map(cb => `${cb.dataset.propIdx}:${cb.dataset.itemIdx}`)
      );
      const subtotalProp = (d, i, incl) => d.items.reduce((s, item, j) => incl.has(`${i}:${j}`) ? s + (item.monto || 0) : s, 0);
      const totalIncluido = () => {
        const incl = incluidos();
        return detalleProps.reduce((s, d, i) => s + subtotalProp(d, i, incl), 0);
      };

      const honorariosAuto = () => {
        // Si hay filas con reparto propio (multi-dueño), calcular por propiedad; el resto usa el % general.
        const pctGeneral = Number(q('#liqPct').value) || 0;
        const incl = incluidos();
        return detalleProps.reduce((sum, d, i) => {
          const subtotal = subtotalProp(d, i, incl);
          if (!subtotal) return sum;
          if (!d.multiDueno) return sum + Math.round(subtotal * pctGeneral / 100);
          const paga = ctx.overlay.querySelector(`.reparto-paga[data-idx="${i}"]`)?.checked ?? true;
          if (!paga) return sum;
          const comisionInp = ctx.overlay.querySelector(`.reparto-comision[data-idx="${i}"]`);
          const pctPropio = comisionInp && comisionInp.value !== '' ? Number(comisionInp.value) : pctGeneral;
          return sum + Math.round(subtotal * pctPropio / 100);
        }, 0);
      };

      const actualizarSubtotales = () => {
        const incl = incluidos();
        detalleProps.forEach((d, i) => {
          const el = ctx.overlay.querySelector(`[data-subtotal-idx="${i}"]`);
          if (el) el.textContent = fmt$(subtotalProp(d, i, incl));
        });
      };

      // Suma los cargos y resta los descuentos cargados en "Ajustes" — cada fila trae su
      // propio tipo (+/-), a diferencia de antes que todo era descuento.
      const ajusteNeto = () => {
        const form = q('#liqGrupalForm');
        return (form.descuentos || []).reduce((s, d) => s + (d.tipo === 'cargo' ? 1 : -1) * (Number(d.monto) || 0), 0);
      };

      const recalcular = () => {
        const base   = totalIncluido();
        const hon    = honorariosAuto();
        const ajuste = ajusteNeto();
        const total  = base - hon + ajuste;
        q('#liqMontoHon').value = fmtMontoInput(hon);
        q('#liqTotal').value = fmtMontoInput(total);
        const totalDisp = q('#totalSeleccionado');
        if (totalDisp) totalDisp.textContent = fmt$(base);
        // Resumen del cálculo: alquiler → comisión (siempre sobre el alquiler) → ajustes → total.
        const rAlq = q('#resAlquiler');   if (rAlq) rAlq.textContent = fmt$(base);
        const rCom = q('#resComision');   if (rCom) rCom.textContent = `− ${fmt$(hon)}`;
        const rAju = q('#resAjuste');     if (rAju) rAju.textContent = ajuste ? `${ajuste > 0 ? '+' : '−'} ${fmt$(Math.abs(ajuste))}` : 'Sin ajustes';
        const rTot = q('#resTotalFinal'); if (rTot) rTot.textContent = fmt$(total);
        actualizarSubtotales();
        pagosCtl?.refrescarTotal();
      };

      ctx.overlay.querySelectorAll('.incluir-periodo').forEach(cb => {
        cb.addEventListener('change', () => {
          const row = ctx.overlay.querySelector(`[data-periodo-row="${cb.dataset.propIdx}:${cb.dataset.itemIdx}"]`);
          if (row) row.style.opacity = cb.checked ? '1' : '.55';
          recalcular();
        });
      });

      // Selección rápida: todo (cobrado + adelanto), solo lo cobrado, o solo el adelanto —
      // opera sobre cada período individualmente, sin importar de qué propiedad sea.
      ctx.overlay.querySelectorAll('[data-seleccionar]').forEach(btn => {
        btn.addEventListener('click', () => {
          const modo = btn.dataset.seleccionar; // 'todo' | 'cobrado' | 'impago'
          ctx.overlay.querySelectorAll('.incluir-periodo').forEach(cb => {
            const esImpago = cb.dataset.esimpago === '1';
            const marcar = modo === 'todo' ? true : modo === 'cobrado' ? !esImpago : esImpago;
            cb.checked = marcar;
            const row = ctx.overlay.querySelector(`[data-periodo-row="${cb.dataset.propIdx}:${cb.dataset.itemIdx}"]`);
            if (row) row.style.opacity = marcar ? '1' : '.55';
          });
          recalcular();
        });
      });

      ctx.overlay.querySelectorAll('.reparto-pct, .reparto-paga, .reparto-comision').forEach(inp => {
        inp.addEventListener('input', recalcular);
        inp.addEventListener('change', recalcular);
      });

      const renderDescs = () => {
        const block = q('#descBlk');
        block.innerHTML = (q('#liqGrupalForm')).descuentos?.map((d, i) => `
          <div style="display:flex;gap:.6rem;align-items:flex-end;margin-bottom:.6rem">
            <div class="form-group" style="margin:0;width:110px">
              <label style="font-size:.72rem">Tipo</label>
              <select data-desc-tipo="${i}">
                <option value="descuento" ${d.tipo === 'cargo' ? '' : 'selected'}>− Descuento</option>
                <option value="cargo" ${d.tipo === 'cargo' ? 'selected' : ''}>+ Cargo</option>
              </select>
            </div>
            <div class="form-group" style="flex:2;margin:0">
              <label style="font-size:.72rem">Concepto</label>
              <input type="text" placeholder="Ej. Reparación, gasto..." value="${esc(d.concepto || '')}" data-desc-concepto="${i}">
            </div>
            <div class="form-group" style="flex:1;margin:0;max-width:130px">
              <label style="font-size:.72rem">Monto $</label>
              <input type="text" inputmode="numeric" class="input-monto" placeholder="0" value="${fmtMontoInput(d.monto)}" data-desc-monto="${i}">
            </div>
            <button type="button" data-del-desc="${i}" class="btn btn-xs btn-ghost" style="color:var(--danger);flex-shrink:0;height:42px" title="Eliminar">${icon('trash')}</button>
          </div>`).join('') || '';
        block.querySelectorAll('[data-desc-tipo]').forEach(el => {
          el.addEventListener('change', () => {
            const idx = Number(el.dataset.descTipo);
            const form = q('#liqGrupalForm');
            if (form.descuentos?.[idx]) form.descuentos[idx].tipo = el.value;
            recalcular();
          });
        });
        block.querySelectorAll('[data-desc-monto]').forEach(el => {
          el.addEventListener('input', () => {
            const idx = Number(el.dataset.descMonto);
            const form = q('#liqGrupalForm');
            if (form.descuentos?.[idx]) form.descuentos[idx].monto = valorMonto(el.value);
            recalcular();
          });
        });
        block.querySelectorAll('[data-desc-concepto]').forEach(el => {
          el.addEventListener('input', () => {
            const idx = Number(el.dataset.descConcepto);
            const form = q('#liqGrupalForm');
            if (form.descuentos?.[idx]) form.descuentos[idx].concepto = el.value;
          });
        });
      };

      q('#liqPct').addEventListener('input', recalcular);

      q('#btnAddDesc').addEventListener('click', () => {
        const form = q('#liqGrupalForm');
        form.descuentos = form.descuentos || [];
        form.descuentos.push({ concepto: '', monto: 0, tipo: 'descuento' });
        renderDescs();
        recalcular();
      });

      q('#descBlk').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-del-desc]');
        if (btn) {
          const idx = Number(btn.dataset.delDesc);
          const form = q('#liqGrupalForm');
          if (form.descuentos) form.descuentos.splice(idx, 1);
          renderDescs();
          recalcular();
        }
      });

      const guardar = async (modo) => {
        const form = q('#liqGrupalForm');
        const totalPagar = valorMonto(q('#liqTotal').value);

        // Reconstruye cada propiedad quedándose solo con los períodos (items) tildados —
        // una propiedad puede aportar solo ALGUNOS de sus meses pendientes a esta liquidación.
        const incl = incluidos();
        const seleccionados = detalleProps
          .map((d, i) => {
            const items = d.items.filter((item, j) => incl.has(`${i}:${j}`));
            const periodos = d.periodos.filter((p, j) => incl.has(`${i}:${j}`));
            return { ...d, items, periodos, total: items.reduce((s, item) => s + (item.monto || 0), 0) };
          })
          .filter(d => d.items.length > 0);
        if (!seleccionados.length) { toast('Seleccioná al menos un período para liquidar', { tipo: 'warning' }); return; }

        const pagos = pagosCtl.getPagos();
        if (!pagos.length) { toast('Indicá la forma de pago', { tipo: 'warning' }); return; }
        if (pagos.length > 1) {
          const suma = pagos.reduce((s, p) => s + p.monto, 0);
          if (Math.round(suma * 100) !== Math.round(totalPagar * 100)) {
            toast('La suma de las formas de pago no coincide con el total a pagar', { tipo: 'warning' });
            return;
          }
        }

        const totalSeleccionado = seleccionados.reduce((s, d) => s + d.total, 0);
        const mesesSeleccionados = [...new Set(seleccionados.flatMap(d => d.periodos.map(p => p.mes)))].sort();

        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        data.propietarioId = grupo.propietarioId;
        data.meses = mesesSeleccionados;
        data.mes = mesesSeleccionados.length === 1 ? mesesSeleccionados[0] : null;
        data.montoAlquiler = totalSeleccionado;
        data.pctHonorarios = Number(data.pctHonorarios) || 0;
        data.montoHonorarios = valorMonto(q('#liqMontoHon').value);
        data.totalPagar = totalPagar;
        data.descuentos = form.descuentos || [];
        data.pagos = pagos;
        data.formaPago = pagos.length > 1 ? pagos.map(p => p.metodoPago).join(' + ') : pagos[0].metodoPago;
        // "Cobrada" si al menos una propiedad seleccionada ya la pagó el inquilino; si TODAS
        // las seleccionadas son adelanto (todavía sin cobrar), queda marcada como adelanto puro.
        data.cobradoInquilino = seleccionados.some(d => d.items.some(it => !it.esImpago));
        data.noCaja = q('#chkNoCaja')?.checked || false;

        // Materializar los cobros placeholder (sin id) de las propiedades incluidas que
        // todavía no cobró el inquilino — las demás quedan pendientes para la próxima.
        const idsLiquidados = [];
        for (const d of seleccionados) {
          for (const item of d.items) {
            let cobroId = item.cobro.id;
            if (!cobroId) {
              const nuevo = await actions.addCobro(item.alq.id, {
                mes: item.cobro.mes, monto: item.cobro.monto, montoAlquiler: item.cobro.monto, pagado: false,
              });
              cobroId = nuevo?.id;
            }
            if (cobroId) idsLiquidados.push(cobroId);
          }
        }
        data.liquidadosCobros = idsLiquidados;

        const liq = await actions.createLiquidacion(data);

        // Persistir el reparto tocado por propiedad (si había filas multi-dueño), para la próxima vez
        for (let i = 0; i < detalleProps.length; i++) {
          const d = detalleProps[i];
          if (!d.multiDueno || !d.prop) continue;
          const pctInp  = ctx.overlay.querySelector(`.reparto-pct[data-idx="${i}"]`);
          const pagaInp = ctx.overlay.querySelector(`.reparto-paga[data-idx="${i}"]`);
          const comInp  = ctx.overlay.querySelector(`.reparto-comision[data-idx="${i}"]`);
          if (!pctInp) continue;
          const actuales = sel.propietariosDePropiedad(d.prop);
          const actualizados = actuales.map(o => o.propietarioId === grupo.propietarioId
            ? { ...o, porcentaje: Number(pctInp.value) || o.porcentaje, pagaComision: !!pagaInp?.checked, comisionPct: comInp?.value !== '' ? Number(comInp.value) : null }
            : o);
          await actions.updatePropiedad(d.prop.id, { propietarios: actualizados });
        }

        if (modo !== 'none' && liq) {
          const periodoLabelSel = mesesSeleccionados.length === 1
            ? mesLabel(mesesSeleccionados[0])
            : `${mesLabel(mesesSeleccionados[0])} – ${mesLabel(mesesSeleccionados[mesesSeleccionados.length - 1])}`;
          const paramsLiq = {
            alq: {},
            cobro: { monto: liq.montoAlquiler, mes: liq.mes, fechaPago: liq.fechaPago },
            inquilino: {},
            propiedad: {},
            propietario: own,
            pctHonorarios: liq.pctHonorarios || 0,
            descuentos: liq.descuentos || [],
            formaPago: liq.formaPago || 'Efectivo',
            pagos: liq.pagos || [],
            periodoLabel: periodoLabelSel,
            detalle: seleccionados.map(d => ({
              propiedad: d.prop?.direccion || '—',
              periodo: d.periodos.map(p => mesLabel(p.mes)).join(', '),
              monto: d.total,
            })),
          };
          if (modo === 'pdf') {
            imprimirLiquidacion(paramsLiq);
          } else if (modo === 'wa') {
            try {
              const texto = `Hola${own?.nombre ? ' ' + own.nombre : ''}! Te comparto la liquidación de ${periodoLabelSel}.`;
              const blob = await generarPDFLiquidacion(paramsLiq, 'liquidacion.pdf');
              const resultado = await compartirArchivoPorWhatsApp({ numero: own.telefono, texto, archivo: blob, nombreArchivo: 'liquidacion.pdf' });
              const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'la liquidación');
              toast(msg, opts);
            } catch (err) {
              console.error('Error generando o compartiendo la liquidación:', err);
              toast('No se pudo generar el PDF para compartir por WhatsApp', { tipo: 'danger' });
            }
          }
        }

        toast('Liquidación registrada');
        ctx.close();
        onDone?.();
      };

      q('#btnSoloGuardar').addEventListener('click', () => guardar('none'));
      q('#btnGuardarPDF').addEventListener('click', () => guardar('pdf'));
      q('#btnGuardarWA')?.addEventListener('click', () => guardar('wa'));

      recalcular();
      renderDescs();

      pagosCtl = montarPagos(ctx.overlay, { getTotal: () => valorMonto(q('#liqTotal').value) });
    }
  });
}

/* ── Formulario liquidar CO-PROPIEDAD: una propiedad con 2+ dueños → UNA sola
   liquidación con el reparto entre todos los dueños adentro (no una por dueño). ── */
export function abrirFormLiquidacionCoPropiedad(grupo, onDone) {
  const { propietarios } = getState();
  const prop = grupo.prop;
  const dueños = grupo.owners;

  const totalMonto = grupo.cobros.reduce((s, c) => s + (c.monto || 0), 0);
  // Por defecto solo vienen tildados los cobros ya cobrados, así que el total inicial es solo de esos.
  const totalMontoDefault = grupo.cobros.filter(c => !c.esImpago).reduce((s, c) => s + (c.monto || 0), 0);
  const tieneAlgunImpago = grupo.cobros.some(c => c.esImpago);
  const hoy = new Date().toISOString().slice(0, 10);
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;

  openModal({
    title: `Liquidación — ${esc(prop?.direccion || '—')} — ${mesesLabelStr}`,
    size: 'xl',
    bodyHTML: `
      <form id="liqCoForm">
        ${tieneAlgunImpago ? `
        <div style="padding:.85rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--info) 10%,transparent);border:1px solid var(--info);margin-bottom:1.1rem;font-size:.85rem">
          ⏳ Algunos de estos meses el inquilino todavía no los pagó (marcados abajo). Si los incluís en esta liquidación, es un <strong>adelanto</strong> de la inmobiliaria a los propietarios.
        </div>` : ''}

        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1rem;margin-bottom:1.25rem;border:1px solid var(--border)">
          <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.2rem">${esc(prop?.direccion || '—')} · Cobros del período</div>
          <div style="font-size:.74rem;color:var(--text-faint);margin-bottom:.5rem">Tildados: los meses ya cobrados al inquilino. Los que todavía no cobró vienen destildados — tildalos solo si querés adelantarles esa plata a los propietarios. O elegí abajo qué liquidar de una:</div>
          ${tieneAlgunImpago ? `
          <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.6rem">
            <button type="button" class="btn btn-xs btn-ghost" data-seleccionar="todo">Todo (cobrado + adelanto)</button>
            <button type="button" class="btn btn-xs btn-ghost" data-seleccionar="cobrado">Solo lo cobrado</button>
            <button type="button" class="btn btn-xs btn-ghost" data-seleccionar="impago">Solo el adelanto</button>
          </div>` : ''}
          <div style="display:flex;flex-direction:column;gap:.35rem">
            ${grupo.cobros.map((c, i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;font-size:.85rem;transition:opacity .15s;opacity:${c.esImpago ? '.45' : '1'}" data-cobro-idx="${i}">
                <span style="display:flex;align-items:center;gap:.5rem">
                  <input type="checkbox" class="incluir-cobro" data-idx="${i}" ${c.esImpago ? '' : 'checked'} style="width:16px;height:16px;cursor:pointer">
                  ${mesLabel(c.cobro.mes)} · ${esc(c.inq?.nombre || '—')}${c.esImpago ? ' · <span style="color:var(--info)">⏳ Sin cobrar</span>' : ''}
                </span>
                <strong>${fmt$(c.monto)}</strong>
              </div>`).join('')}
          </div>
          <div style="border-top:2px solid var(--border);margin-top:.75rem;padding-top:.75rem;display:flex;justify-content:space-between;align-items:center;font-size:1.1rem;font-weight:800">
            <span>TOTAL (seleccionado)</span>
            <span id="totalSeleccionadoCo" style="color:var(--primary);font-size:1.3rem">${fmt$(totalMontoDefault)}</span>
          </div>
        </div>

        <h3 class="form-section-title">Reparto entre propietarios</h3>
        <div id="repartoBlk" style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:.4rem">
          ${dueños.map((o, i) => `
            <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;padding:.6rem .75rem;background:var(--surface-2);border-radius:var(--r-sm)" data-reparto-idx="${i}">
              <div style="flex:1;min-width:140px;font-weight:600">${esc(propietarios.find(p => p.id === o.propietarioId)?.nombre || '—')}</div>
              <label style="font-size:.75rem;color:var(--text-soft)">%
                <input type="number" min="0" max="100" step="0.5" class="reparto-pct" value="${o.porcentaje}" style="width:65px;margin-left:.3rem">
              </label>
              <label style="font-size:.75rem;color:var(--text-soft);display:flex;align-items:center;gap:.3rem">
                <input type="checkbox" class="reparto-paga" ${o.pagaComision ? 'checked' : ''}> ¿Paga comisión?
              </label>
              <label style="font-size:.75rem;color:var(--text-soft)">% comisión
                <input type="number" min="0" max="100" step="0.5" class="reparto-comision" value="${o.comisionPct ?? 10}" style="width:60px;margin-left:.3rem">
              </label>
              <div class="reparto-monto" style="font-weight:700;min-width:90px;text-align:right"></div>
            </div>`).join('')}
        </div>
        <div id="repartoResumen" style="font-size:.78rem;margin-bottom:1.1rem"></div>

        <h3 class="form-section-title">Ajustes (cargos y descuentos)</h3>
        <p class="text-xs text-soft" style="margin:-.4rem 0 .5rem">Sumá un cargo o restá un descuento — se reparte entre los propietarios en la misma proporción que el alquiler.</p>
        <div id="descBlk" style="margin-bottom:.5rem"></div>
        <button type="button" id="btnAddDesc" class="btn btn-sm btn-ghost" style="margin-bottom:1.25rem">${icon('plus')} Agregar ítem</button>

        <div class="form-grid" style="margin-bottom:1.25rem">
          <div class="form-group">
            <label>Fecha de pago <span class="req">*</span></label>
            <input name="fechaPago" type="date" value="${hoy}">
          </div>
          <div class="form-group full">
            <label>Notas</label>
            <input name="notas" placeholder="Observaciones opcionales">
          </div>
        </div>

        <h3 class="form-section-title">Forma de pago por propietario</h3>
        <div id="pagosPorDueno" style="display:flex;flex-direction:column;gap:1rem"></div>

        <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;margin-top:1rem">
          <input type="checkbox" id="chkPdfIndividual"> Generar un PDF individual por cada propietario (en vez de uno combinado)
        </label>
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;margin-top:.4rem">
          <input type="checkbox" id="chkNoCaja"> No cargar esta liquidación a la caja del mes
        </label>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
                 <button class="btn btn-ghost" id="btnSoloGuardar">Guardar sin PDF</button>
                 <button class="btn btn-primary" id="btnGuardarPDF">Guardar y generar PDF</button>`,
    onMount(ctx) {
      const q = (s) => ctx.overlay.querySelector(s);
      const pagosCtls = [];

      const incluidos = () => new Set(
        [...ctx.overlay.querySelectorAll('.incluir-cobro:checked')].map(cb => Number(cb.dataset.idx))
      );
      const totalIncluido = () => {
        const incl = incluidos();
        return grupo.cobros.reduce((s, c, i) => incl.has(i) ? s + (c.monto || 0) : s, 0);
      };

      // Cargos suman, descuentos restan — cada fila de "Ajustes" trae su propio tipo (+/-).
      const ajusteNeto = () => [...q('#descBlk').querySelectorAll('[data-desc-monto]')].reduce((s, el) => {
        const idx = el.dataset.descMonto;
        const tipoSel = q(`[data-desc-tipo="${idx}"]`);
        const signo = tipoSel?.value === 'cargo' ? 1 : -1;
        return s + signo * valorMonto(el.value);
      }, 0);

      // La comisión pactada por cada propietario es un % del alquiler TOTAL cobrado,
      // no de su propia ganancia/porcentaje de la propiedad — por eso se aplica sobre
      // totalIncluido() y no sobre montoOwner. Así, si solo un dueño paga la comisión, a él
      // se le descuenta la comisión completa (calculada sobre el total), no una versión
      // reducida calculada sobre su porción.
      const montoOwnerActual = (i) => {
        const row = ctx.overlay.querySelectorAll('[data-reparto-idx]')[i];
        if (!row) return 0;
        const pct    = Number(row.querySelector('.reparto-pct').value) || 0;
        const paga   = row.querySelector('.reparto-paga').checked;
        const pctCom = Number(row.querySelector('.reparto-comision').value) || 0;
        const ajuste = ajusteNeto();
        const total  = totalIncluido();
        const montoOwner  = Math.round(total * pct / 100);
        const ajusteOwner = Math.round(ajuste * pct / 100);
        const honOwner    = paga ? Math.round(total * pctCom / 100) : 0;
        return montoOwner - honOwner + ajusteOwner;
      };

      const recalcular = () => {
        const ajuste = ajusteNeto();
        const total = totalIncluido();
        let totalHon = 0, totalPagarSum = 0;
        ctx.overlay.querySelectorAll('[data-reparto-idx]').forEach((row, i) => {
          const pct    = Number(row.querySelector('.reparto-pct').value) || 0;
          const paga   = row.querySelector('.reparto-paga').checked;
          const pctCom = Number(row.querySelector('.reparto-comision').value) || 0;
          const montoOwner  = Math.round(total * pct / 100);
          const ajusteOwner = Math.round(ajuste * pct / 100);
          const honOwner    = paga ? Math.round(total * pctCom / 100) : 0;
          const totalOwner  = montoOwner - honOwner + ajusteOwner;
          row.querySelector('.reparto-monto').textContent = fmt$(totalOwner);
          totalHon += honOwner;
          totalPagarSum += totalOwner;
          pagosCtls[i]?.refrescarTotal();
        });
        const sumaPct = [...ctx.overlay.querySelectorAll('.reparto-pct')].reduce((s, i) => s + (Number(i.value) || 0), 0);
        const resumen = q('#repartoResumen');
        if (resumen) {
          resumen.textContent = `% asignado: ${sumaPct}% de 100% · Comisión total: ${fmt$(totalHon)} · Total a repartir: ${fmt$(totalPagarSum)}`;
          resumen.style.color = Math.round(sumaPct) === 100 ? 'var(--success)' : 'var(--warning)';
        }
        const totalDisp = q('#totalSeleccionadoCo');
        if (totalDisp) totalDisp.textContent = fmt$(total);
      };

      ctx.overlay.querySelectorAll('.reparto-pct, .reparto-paga, .reparto-comision').forEach(inp => {
        inp.addEventListener('input', recalcular);
        inp.addEventListener('change', recalcular);
      });

      ctx.overlay.querySelectorAll('.incluir-cobro').forEach(cb => {
        cb.addEventListener('change', () => {
          const row = ctx.overlay.querySelector(`[data-cobro-idx="${cb.dataset.idx}"]`);
          if (row) row.style.opacity = cb.checked ? '1' : '.45';
          recalcular();
        });
      });

      // Selección rápida: todo (cobrado + adelanto), solo lo cobrado, o solo el adelanto.
      ctx.overlay.querySelectorAll('[data-seleccionar]').forEach(btn => {
        btn.addEventListener('click', () => {
          const modo = btn.dataset.seleccionar; // 'todo' | 'cobrado' | 'impago'
          grupo.cobros.forEach((c, i) => {
            const cb = ctx.overlay.querySelector(`.incluir-cobro[data-idx="${i}"]`);
            if (!cb) return;
            const marcar = modo === 'todo' ? true : modo === 'cobrado' ? !c.esImpago : c.esImpago;
            cb.checked = marcar;
            const row = ctx.overlay.querySelector(`[data-cobro-idx="${i}"]`);
            if (row) row.style.opacity = marcar ? '1' : '.45';
          });
          recalcular();
        });
      });

      const renderPagosPorDueno = () => {
        const blk = q('#pagosPorDueno');
        blk.innerHTML = dueños.map((o, i) => `
          <div data-pago-dueno="${i}">
            <div style="font-weight:600;font-size:.85rem;margin-bottom:.4rem">${esc(propietarios.find(p => p.id === o.propietarioId)?.nombre || '—')}</div>
            ${pagosBlockHTML()}
          </div>`).join('');
        dueños.forEach((o, i) => {
          const cont = blk.querySelector(`[data-pago-dueno="${i}"]`);
          pagosCtls[i] = montarPagos(cont, { getTotal: () => montoOwnerActual(i) });
        });
      };

      const renderDescs = () => {
        const block = q('#descBlk');
        const form = q('#liqCoForm');
        block.innerHTML = (form.descuentos || []).map((d, i) => `
          <div style="display:flex;gap:.6rem;align-items:flex-end;margin-bottom:.6rem">
            <div class="form-group" style="margin:0;width:110px">
              <label style="font-size:.72rem">Tipo</label>
              <select data-desc-tipo="${i}">
                <option value="descuento" ${d.tipo === 'cargo' ? '' : 'selected'}>− Descuento</option>
                <option value="cargo" ${d.tipo === 'cargo' ? 'selected' : ''}>+ Cargo</option>
              </select>
            </div>
            <div class="form-group" style="flex:2;margin:0">
              <label style="font-size:.72rem">Concepto</label>
              <input type="text" placeholder="Ej. Reparación, gasto..." value="${esc(d.concepto || '')}" data-desc-concepto="${i}">
            </div>
            <div class="form-group" style="flex:1;margin:0;max-width:130px">
              <label style="font-size:.72rem">Monto $</label>
              <input type="text" inputmode="numeric" class="input-monto" placeholder="0" value="${fmtMontoInput(d.monto)}" data-desc-monto="${i}">
            </div>
            <button type="button" data-del-desc="${i}" class="btn btn-xs btn-ghost" style="color:var(--danger);flex-shrink:0;height:42px" title="Eliminar">${icon('trash')}</button>
          </div>`).join('');
        block.querySelectorAll('[data-desc-tipo]').forEach(el => {
          el.addEventListener('change', () => {
            const idx = Number(el.dataset.descTipo);
            if (form.descuentos?.[idx]) form.descuentos[idx].tipo = el.value;
            recalcular();
          });
        });
        block.querySelectorAll('[data-desc-monto]').forEach(el => {
          el.addEventListener('input', () => {
            const idx = Number(el.dataset.descMonto);
            if (form.descuentos?.[idx]) form.descuentos[idx].monto = valorMonto(el.value);
            recalcular();
          });
        });
        block.querySelectorAll('[data-desc-concepto]').forEach(el => {
          el.addEventListener('input', () => {
            const idx = Number(el.dataset.descConcepto);
            if (form.descuentos?.[idx]) form.descuentos[idx].concepto = el.value;
          });
        });
      };

      q('#btnAddDesc').addEventListener('click', () => {
        const form = q('#liqCoForm');
        form.descuentos = form.descuentos || [];
        form.descuentos.push({ concepto: '', monto: 0, tipo: 'descuento' });
        renderDescs();
        recalcular();
      });

      q('#descBlk').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-del-desc]');
        if (btn) {
          const idx = Number(btn.dataset.delDesc);
          const form = q('#liqCoForm');
          if (form.descuentos) form.descuentos.splice(idx, 1);
          renderDescs();
          recalcular();
        }
      });

      renderPagosPorDueno();
      renderDescs();
      recalcular();

      const guardar = async (conPDF) => {
        const f = q('#liqCoForm');
        if (!f.fechaPago.value) { toast('Indicá la fecha de pago', { tipo: 'warning' }); return; }

        const incl = incluidos();
        const seleccionados = grupo.cobros.filter((c, i) => incl.has(i));
        if (!seleccionados.length) { toast('Seleccioná al menos un mes para liquidar', { tipo: 'warning' }); return; }
        const totalSeleccionado = seleccionados.reduce((s, c) => s + (c.monto || 0), 0);
        const mesesSeleccionados = [...new Set(seleccionados.map(c => c.cobro.mes))].sort();

        const filas = [...ctx.overlay.querySelectorAll('[data-reparto-idx]')].map((row, i) => ({
          propietarioId: dueños[i].propietarioId,
          porcentaje:    Number(row.querySelector('.reparto-pct').value) || 0,
          pagaComision:  row.querySelector('.reparto-paga').checked,
          comisionPct:   Number(row.querySelector('.reparto-comision').value) || 0,
        }));
        const sumaPct = filas.reduce((s, fl) => s + fl.porcentaje, 0);
        if (Math.round(sumaPct) !== 100) {
          toast('El % repartido entre los propietarios debe sumar 100%', { tipo: 'warning' });
          return;
        }

        const descuentos = (f.descuentos || []).filter(d => d.concepto && d.monto);
        const ajusteTotal = descuentos.reduce((s, d) => s + (d.tipo === 'cargo' ? 1 : -1) * (Number(d.monto) || 0), 0);

        const propietariosData = [];
        for (let i = 0; i < filas.length; i++) {
          const fila = filas[i];
          const nombreOwner = propietarios.find(p => p.id === fila.propietarioId)?.nombre || '';
          const pagos = pagosCtls[i]?.getPagos() || [];
          if (!pagos.length) { toast(`Indicá la forma de pago de ${esc(nombreOwner)}`, { tipo: 'warning' }); return; }
          const montoOwner  = Math.round(totalSeleccionado * fila.porcentaje / 100);
          const ajusteOwner = Math.round(ajusteTotal * fila.porcentaje / 100);
          const honOwner    = fila.pagaComision ? Math.round(totalSeleccionado * fila.comisionPct / 100) : 0;
          const totalOwner  = montoOwner - honOwner + ajusteOwner;
          const sumaPagos  = pagos.reduce((s, p) => s + p.monto, 0);
          if (Math.round(sumaPagos * 100) !== Math.round(totalOwner * 100)) {
            toast(`La forma de pago de ${esc(nombreOwner)} no coincide con su total`, { tipo: 'warning' });
            return;
          }
          propietariosData.push({
            propietarioId: fila.propietarioId,
            porcentaje: fila.porcentaje,
            pagaComision: fila.pagaComision,
            comisionPct: fila.pagaComision ? fila.comisionPct : 0,
            montoBruto: montoOwner,
            montoHonorarios: honOwner,
            descuentoMonto: -ajusteOwner,
            totalPagar: totalOwner,
            formaPago: pagos.length > 1 ? pagos.map(p => p.metodoPago).join(' + ') : pagos[0].metodoPago,
            pagos,
          });
        }

        // Materializar los cobros placeholder (sin id) de los meses incluidos que todavía
        // no cobró el inquilino — los demás quedan pendientes para la próxima.
        const idsLiquidados = [];
        for (const item of seleccionados) {
          let cobroId = item.cobro.id;
          if (!cobroId) {
            const nuevo = await actions.addCobro(item.alq.id, {
              mes: item.cobro.mes, monto: item.cobro.monto, montoAlquiler: item.cobro.monto, pagado: false,
            });
            cobroId = nuevo?.id;
          }
          if (cobroId) idsLiquidados.push(cobroId);
        }

        const data = {
          propiedadId: prop.id,
          alquilerId: seleccionados[0]?.alq?.id || null,
          propietarioId: null,
          propietarios: propietariosData,
          liquidadosCobros: idsLiquidados,
          meses: mesesSeleccionados,
          mes: mesesSeleccionados.length === 1 ? mesesSeleccionados[0] : null,
          montoAlquiler: totalSeleccionado,
          montoHonorarios: propietariosData.reduce((s, p) => s + p.montoHonorarios, 0),
          totalPagar: propietariosData.reduce((s, p) => s + p.totalPagar, 0),
          descuentos,
          estado: 'pagada',
          // "Cobrada" si al menos un mes seleccionado ya lo pagó el inquilino; si TODOS los
          // seleccionados son adelanto (todavía sin cobrar), queda marcada como adelanto puro.
          cobradoInquilino: seleccionados.some(item => !item.esImpago),
          fechaPago: f.fechaPago.value,
          notas: f.notas.value || null,
          noCaja: q('#chkNoCaja')?.checked || false,
        };

        const liq = await actions.createLiquidacion(data);

        // Persistir el reparto confirmado en la propiedad para la próxima vez
        await actions.updatePropiedad(prop.id, {
          propietarios: filas.map(fl => ({ propietarioId: fl.propietarioId, porcentaje: fl.porcentaje, pagaComision: fl.pagaComision, comisionPct: fl.comisionPct })),
        });

        if (conPDF && liq) {
          const periodoLabelSel = mesesSeleccionados.length === 1
            ? mesLabel(mesesSeleccionados[0])
            : `${mesLabel(mesesSeleccionados[0])} – ${mesLabel(mesesSeleccionados[mesesSeleccionados.length - 1])}`;
          const cobroSint = { monto: liq.montoAlquiler, mes: liq.mes, fechaPago: liq.fechaPago };
          const detalleImp = seleccionados.map(c => ({
            propiedad: prop?.direccion || '—',
            periodo: mesLabel(c.cobro.mes),
            monto: c.monto,
          }));
          const pdfIndividual = q('#chkPdfIndividual')?.checked;
          if (pdfIndividual) {
            propietariosData.forEach(po => {
              const own = propietarios.find(p => p.id === po.propietarioId) || {};
              imprimirLiquidacion({
                alq: {}, cobro: cobroSint, inquilino: {}, propiedad: prop, propietario: own,
                pctHonorarios: po.pagaComision ? po.comisionPct : 0, descuentos: [],
                formaPago: po.formaPago, pagos: po.pagos,
                porcentajeReparto: po.porcentaje, periodoLabel: periodoLabelSel, detalle: detalleImp,
                montoOverride: { totalAlquiler: po.montoBruto, honorarios: po.montoHonorarios, totalPagar: po.totalPagar },
              });
            });
          } else {
            imprimirLiquidacion({
              alq: {}, cobro: cobroSint,
              inquilino: {}, propiedad: prop, propietario: null,
              propietarios: propietariosData.map(po => ({
                nombre: propietarios.find(p => p.id === po.propietarioId)?.nombre || '—',
                porcentaje: po.porcentaje, montoBruto: po.montoBruto,
                pctHonorarios: po.pagaComision ? po.comisionPct : 0,
                montoHonorarios: po.montoHonorarios, totalPagar: po.totalPagar,
                formaPago: po.formaPago, pagos: po.pagos,
              })),
              descuentos: liq.descuentos || [],
              periodoLabel: periodoLabelSel,
              detalle: detalleImp,
            });
          }
        }

        toast('Liquidación registrada');
        ctx.close();
        onDone?.();
      };

      q('#btnSoloGuardar').addEventListener('click', () => guardar(false));
      q('#btnGuardarPDF').addEventListener('click', () => guardar(true));
    },
  });
}

/* ── Formulario liquidar (crear ya pagada), un cobro puntual de una propiedad ── */
export function abrirFormLiquidacion(pre, onDone) {
  const { propietarios, propiedades, clientes } = getState();
  const alq   = pre?.alq  || {};
  const cobro = pre?.cobro || {};
  const prop  = propiedades.find(p => p.id === alq.propiedadId) || {};
  const inq   = clientes.find(c => c.id === alq.inquilinoId)    || {};
  // Base = valor pactado del alquiler, no lo que efectivamente cobró el inquilino (cobro.monto
  // puede traer mora sumada o un descuento restado) — la comisión siempre va sobre el alquiler.
  const monto = (cobro.montoAlquiler ?? cobro.monto) || alq.montoActual || alq.montoInicial || 0;
  const hoy   = new Date().toISOString().slice(0, 10);

  const dueños = sel.propietariosDePropiedad(prop);
  const multi  = dueños.length > 1;
  const own    = propietarios.find(p => p.id === (dueños[0]?.propietarioId || alq.propietarioId)) || {};
  const pctDef = dueños[0]?.comisionPct ?? alq.pctHonorarios ?? alq.comision ?? 10;

  let descIdx = 0;

  openModal({
    title: 'Liquidar al propietario',
    size: multi ? 'xl' : 'lg',
    bodyHTML: `
      <form id="liqForm">
        <!-- Info del cobro -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.85rem 1rem;margin-bottom:1.25rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
          <div>
            <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.2rem">Cobro a liquidar</div>
            <div style="font-weight:700">${multi ? esc(dueños.map(o => propietarios.find(p=>p.id===o.propietarioId)?.nombre || '—').join(' + ')) : esc(own?.nombre || '—')}</div>
            <div style="font-size:.82rem;color:var(--text-soft)">${esc(prop?.direccion || '—')} · ${mesLabel(cobro.mes)}</div>
            <div style="font-size:.78rem;color:var(--text-faint)">Inquilino: ${esc(inq?.nombre || '—')} · Cobrado el ${fmtFecha(cobro.fechaPago)}</div>
          </div>
          <div style="font-size:1.4rem;font-weight:900">${fmt$(monto)}</div>
        </div>

        ${multi ? `
        <h3 class="form-section-title">Reparto entre propietarios</h3>
        <div id="repartoBlk" style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:.4rem">
          ${dueños.map((o, i) => `
            <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;padding:.6rem .75rem;background:var(--surface-2);border-radius:var(--r-sm)" data-reparto-idx="${i}">
              <div style="flex:1;min-width:140px;font-weight:600">${esc(propietarios.find(p=>p.id===o.propietarioId)?.nombre || '—')}</div>
              <label style="font-size:.75rem;color:var(--text-soft)">%
                <input type="number" min="0" max="100" step="0.5" class="reparto-pct" value="${o.porcentaje}" style="width:65px;margin-left:.3rem">
              </label>
              <label style="font-size:.75rem;color:var(--text-soft);display:flex;align-items:center;gap:.3rem">
                <input type="checkbox" class="reparto-paga" ${o.pagaComision ? 'checked' : ''}> ¿Paga comisión?
              </label>
              <label style="font-size:.75rem;color:var(--text-soft)">% comisión
                <input type="number" min="0" max="100" step="0.5" class="reparto-comision" value="${o.comisionPct ?? (alq.pctHonorarios ?? alq.comision ?? 10)}" style="width:60px;margin-left:.3rem">
              </label>
              <div class="reparto-monto" style="font-weight:700;min-width:90px;text-align:right"></div>
            </div>`).join('')}
        </div>
        <div id="repartoResumen" style="font-size:.78rem;margin-bottom:1.1rem"></div>
        ` : `
        <h3 class="form-section-title">Honorarios de la inmobiliaria</h3>
        <p class="text-xs text-soft" style="margin:-.4rem 0 .5rem">La comisión siempre se calcula sobre el alquiler — los ajustes de abajo se suman o restan después, nunca cambian este %.</p>
        <div class="form-grid" style="margin-bottom:1.1rem">
          <div class="form-group">
            <label>% Honorarios</label>
            <input name="pctHonorarios" id="liqPct" type="number" min="0" max="100" step="0.5" value="${pctDef}">
          </div>
          <div class="form-group">
            <label>Monto honorarios $</label>
            <input id="liqMontoHon" type="text" readonly style="background:var(--surface-2);font-weight:700">
          </div>
        </div>
        `}

        <h3 class="form-section-title">Ajustes (cargos y descuentos)</h3>
        <div id="descBlk" style="margin-bottom:.5rem"></div>
        <button type="button" id="btnAddDesc" class="btn btn-sm btn-ghost" style="margin-bottom:1.25rem">${icon('plus')} Agregar ítem</button>

        ${!multi ? `
        <!-- Resumen del cálculo, en el orden real: alquiler → comisión → ajustes → total -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1rem;margin-bottom:1.25rem;border:1px solid var(--border)">
          <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.6rem">Resumen del cálculo</div>
          <div style="display:flex;flex-direction:column;gap:.4rem;font-size:.85rem">
            <div style="display:flex;justify-content:space-between"><span>Alquiler</span><strong id="resAlquiler">—</strong></div>
            <div style="display:flex;justify-content:space-between;color:var(--danger)"><span>− Comisión inmobiliaria</span><strong id="resComision">—</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Ajustes</span><strong id="resAjuste">—</strong></div>
            <div style="display:flex;justify-content:space-between;border-top:2px solid var(--border);padding-top:.5rem;margin-top:.1rem;font-size:1.05rem;font-weight:800">
              <span>Total a pagar al propietario</span><strong id="resTotalFinal" style="color:var(--success)">—</strong>
            </div>
          </div>
          <input type="hidden" name="totalPagar" id="liqTotal">
        </div>` : ''}

        <h3 class="form-section-title">Datos del pago</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Fecha de pago <span class="req">*</span></label>
            <input name="fechaPago" type="date" value="${hoy}">
          </div>
          ${!multi ? pagosBlockHTML() : ''}
          <div class="form-group full">
            <label>Notas</label>
            <input name="notas" placeholder="Observaciones opcionales">
          </div>
        </div>

        ${multi ? `
        <h3 class="form-section-title">Forma de pago por propietario</h3>
        <div id="pagosPorDueno" style="display:flex;flex-direction:column;gap:1rem"></div>

        <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;margin-top:1rem">
          <input type="checkbox" id="chkPdfIndividual"> Generar un PDF individual por cada propietario (en vez de uno combinado)
        </label>
        ` : ''}

        <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;margin-top:.75rem">
          <input type="checkbox" id="chkNoCaja"> No cargar esta liquidación a la caja del mes
        </label>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
                 <button class="btn btn-ghost" id="btnSoloGuardar">Guardar sin PDF</button>
                 ${!multi && own.telefono ? `<button class="btn btn-ghost" id="btnGuardarWA" style="color:var(--success)">${icon('whatsapp')} Guardar y enviar por WhatsApp</button>` : ''}
                 <button class="btn btn-primary" id="btnGuardarPDF">Guardar y generar PDF</button>`,
    onMount(ctx) {
      const q = (s) => ctx.overlay.querySelector(s);
      let pagosCtl = null;
      const pagosCtls = [];

      // Cargos suman, descuentos restan — cada fila trae su propio tipo (+/-).
      const ajusteNeto = () => [...ctx.overlay.querySelectorAll('[name^="desc_monto"]')].reduce((s, inp) => {
        const idx = inp.name.replace('desc_monto_', '');
        const tipoSel = ctx.overlay.querySelector(`[name="desc_tipo_${idx}"]`);
        const signo = tipoSel?.value === 'cargo' ? 1 : -1;
        return s + signo * valorMonto(inp.value);
      }, 0);

      // La comisión pactada por cada propietario es un % del alquiler TOTAL cobrado,
      // no de su propia ganancia/porcentaje de la propiedad — por eso se aplica sobre
      // `monto` (el total del cobro) y no sobre montoOwner.
      const montoOwnerActual = (i) => {
        const row = ctx.overlay.querySelectorAll('[data-reparto-idx]')[i];
        if (!row) return 0;
        const pct    = Number(row.querySelector('.reparto-pct').value) || 0;
        const paga   = row.querySelector('.reparto-paga').checked;
        const pctCom = Number(row.querySelector('.reparto-comision').value) || 0;
        const ajuste = ajusteNeto();
        const montoOwner  = Math.round(monto * pct / 100);
        const ajusteOwner = Math.round(ajuste * pct / 100);
        const honOwner    = paga ? Math.round(monto * pctCom / 100) : 0;
        return montoOwner - honOwner + ajusteOwner;
      };

      let recalcular;

      if (multi) {
        recalcular = () => {
          const ajuste = ajusteNeto();
          let totalHon = 0, totalPagarSum = 0;
          ctx.overlay.querySelectorAll('[data-reparto-idx]').forEach((row, i) => {
            const pct    = Number(row.querySelector('.reparto-pct').value) || 0;
            const paga   = row.querySelector('.reparto-paga').checked;
            const pctCom = Number(row.querySelector('.reparto-comision').value) || 0;
            const montoOwner  = Math.round(monto * pct / 100);
            const ajusteOwner = Math.round(ajuste * pct / 100);
            const honOwner    = paga ? Math.round(monto * pctCom / 100) : 0;
            const totalOwner  = montoOwner - honOwner + ajusteOwner;
            row.querySelector('.reparto-monto').textContent = fmt$(totalOwner);
            totalHon += honOwner;
            totalPagarSum += totalOwner;
            pagosCtls[i]?.refrescarTotal();
          });
          const sumaPct = [...ctx.overlay.querySelectorAll('.reparto-pct')].reduce((s, i) => s + (Number(i.value) || 0), 0);
          const resumen = q('#repartoResumen');
          if (resumen) {
            resumen.textContent = `% asignado: ${sumaPct}% de 100% · Comisión total: ${fmt$(totalHon)} · Total a repartir: ${fmt$(totalPagarSum)}`;
            resumen.style.color = Math.round(sumaPct) === 100 ? 'var(--success)' : 'var(--warning)';
          }
        };
        ctx.overlay.querySelectorAll('.reparto-pct, .reparto-paga, .reparto-comision').forEach(inp => {
          inp.addEventListener('input', recalcular);
          inp.addEventListener('change', recalcular);
        });

        const blk = q('#pagosPorDueno');
        blk.innerHTML = dueños.map((o, i) => `
          <div data-pago-dueno="${i}">
            <div style="font-weight:600;font-size:.85rem;margin-bottom:.4rem">${esc(propietarios.find(p => p.id === o.propietarioId)?.nombre || '—')}</div>
            ${pagosBlockHTML()}
          </div>`).join('');
        dueños.forEach((o, i) => {
          const cont = blk.querySelector(`[data-pago-dueno="${i}"]`);
          pagosCtls[i] = montarPagos(cont, { getTotal: () => montoOwnerActual(i) });
        });
      } else {
        recalcular = () => {
          const pct    = Number(q('#liqPct').value) || 0;
          const hon    = Math.round(monto * pct / 100);
          const ajuste = ajusteNeto();
          const total  = Math.max(0, monto - hon + ajuste);
          q('#liqMontoHon').value = fmtMontoInput(hon);
          q('#liqTotal').value    = fmtMontoInput(total);
          // Resumen del cálculo: alquiler → comisión (siempre sobre el alquiler) → ajustes → total.
          const rAlq = q('#resAlquiler');   if (rAlq) rAlq.textContent = fmt$(monto);
          const rCom = q('#resComision');   if (rCom) rCom.textContent = `− ${fmt$(hon)}`;
          const rAju = q('#resAjuste');     if (rAju) rAju.textContent = ajuste ? `${ajuste > 0 ? '+' : '−'} ${fmt$(Math.abs(ajuste))}` : 'Sin ajustes';
          const rTot = q('#resTotalFinal'); if (rTot) rTot.textContent = fmt$(total);
          pagosCtl?.refrescarTotal();
        };
        q('#liqPct').addEventListener('input', recalcular);
      }
      recalcular();

      const addDescRow = () => {
        const blk = q('#descBlk');
        const idx = descIdx++;
        const div = document.createElement('div');
        div.className = 'desc-row form-grid';
        div.style.cssText = 'align-items:end;gap:.5rem;margin-bottom:.5rem';
        div.innerHTML = `
          <div class="form-group" style="width:110px;margin:0">
            <label style="font-size:.75rem">Tipo</label>
            <select name="desc_tipo_${idx}">
              <option value="descuento" selected>− Descuento</option>
              <option value="cargo">+ Cargo</option>
            </select>
          </div>
          <div class="form-group" style="flex:2;margin:0">
            <label style="font-size:.75rem">Concepto</label>
            <input name="desc_concepto_${idx}" placeholder="Ej. Reparación caño">
          </div>
          <div class="form-group" style="flex:1;margin:0">
            <label style="font-size:.75rem">Monto $</label>
            <input name="desc_monto_${idx}" type="text" inputmode="numeric" class="input-monto">
          </div>
          <button type="button" class="btn btn-xs btn-ghost" style="color:var(--danger);margin-bottom:.1rem" data-rm>${icon('trash')}</button>`;
        blk.appendChild(div);
        div.querySelector('[data-rm]').addEventListener('click', () => { div.remove(); recalcular(); });
        div.querySelector(`[name="desc_monto_${idx}"]`).addEventListener('input', recalcular);
        div.querySelector(`[name="desc_tipo_${idx}"]`).addEventListener('change', recalcular);
      };

      q('#btnAddDesc').addEventListener('click', addDescRow);

      if (!multi) {
        pagosCtl = montarPagos(ctx.overlay, { getTotal: () => valorMonto(q('#liqTotal').value) });
      }

      const guardar = async (modo) => {
        const f = q('#liqForm');
        if (!f.fechaPago.value) { toast('Indicá la fecha de pago', { tipo: 'warning' }); return; }

        const descuentos = [...ctx.overlay.querySelectorAll('.desc-row')].map((row) => ({
          concepto: row.querySelector('[name^="desc_concepto"]')?.value || '',
          monto:    valorMonto(row.querySelector('[name^="desc_monto"]')?.value),
          tipo:     row.querySelector('[name^="desc_tipo"]')?.value === 'cargo' ? 'cargo' : 'descuento',
        })).filter(d => d.concepto && d.monto);

        if (!multi) {
          const totalPagar = valorMonto(f.totalPagar.value);
          const pagos = pagosCtl.getPagos();
          if (!pagos.length) { toast('Indicá la forma de pago', { tipo: 'warning' }); return; }
          if (pagos.length > 1) {
            const suma = pagos.reduce((s, p) => s + p.monto, 0);
            if (Math.round(suma * 100) !== Math.round(totalPagar * 100)) {
              toast('La suma de las formas de pago no coincide con el total a pagar', { tipo: 'warning' });
              return;
            }
          }

          const data = {
            alquilerId:     alq.id,
            propiedadId:    alq.propiedadId,
            propietarioId:  dueños[0]?.propietarioId || alq.propietarioId,
            cobroId:        cobro.id,
            liquidadosCobros: cobro.id ? [cobro.id] : [],
            mes:            cobro.mes,
            montoAlquiler:  monto,
            pctHonorarios:  Number(f.pctHonorarios.value) || 0,
            montoHonorarios:valorMonto(q('#liqMontoHon').value),
            totalPagar,
            descuentos,
            estado:    'pagada',
            cobradoInquilino: cobro.pagado !== false,
            fechaPago: f.fechaPago.value,
            formaPago: pagos.length > 1 ? pagos.map(p => p.metodoPago).join(' + ') : pagos[0].metodoPago,
            pagos,
            notas:     f.notas.value || null,
            noCaja:    q('#chkNoCaja')?.checked || false,
          };

          // Guardar % en el contrato para la próxima
          if (alq.id && data.pctHonorarios !== (alq.pctHonorarios ?? alq.comision)) {
            await actions.updateAlquiler(alq.id, { pctHonorarios: data.pctHonorarios });
          }

          const liq = await actions.createLiquidacion(data);

          if (modo !== 'none' && liq) {
            const paramsLiq = {
              alq, cobro: { monto: liq.montoAlquiler, mes: liq.mes, fechaPago: liq.fechaPago },
              inquilino: inq, propiedad: prop, propietario: own,
              pctHonorarios: liq.pctHonorarios || 0, descuentos: liq.descuentos || [],
              formaPago: liq.formaPago || 'Efectivo', pagos: liq.pagos || [],
            };
            if (modo === 'pdf') {
              imprimirLiquidacion(paramsLiq);
            } else if (modo === 'wa') {
              try {
                const texto = `Hola${own?.nombre ? ' ' + own.nombre : ''}! Te comparto la liquidación de ${prop?.direccion || 'la propiedad'}.`;
                const blob = await generarPDFLiquidacion(paramsLiq, 'liquidacion.pdf');
                const resultado = await compartirArchivoPorWhatsApp({ numero: own.telefono, texto, archivo: blob, nombreArchivo: 'liquidacion.pdf' });
                const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'la liquidación');
                toast(msg, opts);
              } catch (err) {
                console.error('Error generando o compartiendo la liquidación:', err);
                toast('No se pudo generar el PDF para compartir por WhatsApp', { tipo: 'danger' });
              }
            }
          }

          toast('Liquidación registrada');
          ctx.close(); onDone?.();
          return;
        }

        // Multi-propietario: UNA sola liquidación con el reparto de todos los dueños adentro
        const filas = [...ctx.overlay.querySelectorAll('[data-reparto-idx]')].map((row, i) => ({
          propietarioId: dueños[i].propietarioId,
          porcentaje:    Number(row.querySelector('.reparto-pct').value) || 0,
          pagaComision:  row.querySelector('.reparto-paga').checked,
          comisionPct:   Number(row.querySelector('.reparto-comision').value) || 0,
        }));
        const sumaPct = filas.reduce((s, fl) => s + fl.porcentaje, 0);
        if (Math.round(sumaPct) !== 100) {
          toast('El % repartido entre los propietarios debe sumar 100%', { tipo: 'warning' });
          return;
        }

        const ajusteTotal = descuentos.reduce((s, d) => s + (d.tipo === 'cargo' ? 1 : -1) * (Number(d.monto) || 0), 0);
        const propietariosData = [];
        for (let i = 0; i < filas.length; i++) {
          const fila = filas[i];
          const nombreOwner = propietarios.find(p => p.id === fila.propietarioId)?.nombre || '';
          const pagos = pagosCtls[i]?.getPagos() || [];
          if (!pagos.length) { toast(`Indicá la forma de pago de ${esc(nombreOwner)}`, { tipo: 'warning' }); return; }
          const montoOwner  = Math.round(monto * fila.porcentaje / 100);
          const ajusteOwner = Math.round(ajusteTotal * fila.porcentaje / 100);
          const honOwner    = fila.pagaComision ? Math.round(monto * fila.comisionPct / 100) : 0;
          const totalOwner  = montoOwner - honOwner + ajusteOwner;
          const sumaPagos  = pagos.reduce((s, p) => s + p.monto, 0);
          if (Math.round(sumaPagos * 100) !== Math.round(totalOwner * 100)) {
            toast(`La forma de pago de ${esc(nombreOwner)} no coincide con su total`, { tipo: 'warning' });
            return;
          }
          propietariosData.push({
            propietarioId: fila.propietarioId,
            porcentaje: fila.porcentaje,
            pagaComision: fila.pagaComision,
            comisionPct: fila.pagaComision ? fila.comisionPct : 0,
            montoBruto: montoOwner,
            montoHonorarios: honOwner,
            descuentoMonto: -ajusteOwner,
            totalPagar: totalOwner,
            formaPago: pagos.length > 1 ? pagos.map(p => p.metodoPago).join(' + ') : pagos[0].metodoPago,
            pagos,
          });
        }

        const data = {
          alquilerId: alq.id,
          propiedadId: alq.propiedadId,
          propietarioId: null,
          propietarios: propietariosData,
          cobroId: cobro.id,
          liquidadosCobros: cobro.id ? [cobro.id] : [],
          mes: cobro.mes,
          montoAlquiler: monto,
          montoHonorarios: propietariosData.reduce((s, p) => s + p.montoHonorarios, 0),
          totalPagar: propietariosData.reduce((s, p) => s + p.totalPagar, 0),
          descuentos,
          estado: 'pagada',
          cobradoInquilino: cobro.pagado !== false,
          fechaPago: f.fechaPago.value,
          notas: f.notas.value || null,
          noCaja: q('#chkNoCaja')?.checked || false,
        };
        const liq = await actions.createLiquidacion(data);

        // Persistir el reparto confirmado en la propiedad para la próxima vez
        await actions.updatePropiedad(prop.id, {
          propietarios: filas.map(fl => ({ propietarioId: fl.propietarioId, porcentaje: fl.porcentaje, pagaComision: fl.pagaComision, comisionPct: fl.comisionPct })),
        });

        if (modo === 'pdf' && liq) {
          const cobroSint = { monto: liq.montoAlquiler, mes: liq.mes, fechaPago: liq.fechaPago };
          const pdfIndividual = q('#chkPdfIndividual')?.checked;
          if (pdfIndividual) {
            propietariosData.forEach(po => {
              const ownInd = propietarios.find(p => p.id === po.propietarioId) || {};
              imprimirLiquidacion({
                alq, cobro: cobroSint, inquilino: inq, propiedad: prop, propietario: ownInd,
                pctHonorarios: po.pagaComision ? po.comisionPct : 0, descuentos: [],
                formaPago: po.formaPago, pagos: po.pagos, porcentajeReparto: po.porcentaje,
                montoOverride: { totalAlquiler: po.montoBruto, honorarios: po.montoHonorarios, totalPagar: po.totalPagar },
              });
            });
          } else {
            imprimirLiquidacion({
              alq, cobro: cobroSint,
              inquilino: inq, propiedad: prop, propietario: null,
              propietarios: propietariosData.map(po => ({
                nombre: propietarios.find(p => p.id === po.propietarioId)?.nombre || '—',
                porcentaje: po.porcentaje, montoBruto: po.montoBruto,
                pctHonorarios: po.pagaComision ? po.comisionPct : 0,
                montoHonorarios: po.montoHonorarios, totalPagar: po.totalPagar,
                formaPago: po.formaPago, pagos: po.pagos,
              })),
              descuentos: liq.descuentos || [],
            });
          }
        }

        toast('Liquidación registrada');
        ctx.close(); onDone?.();
      };

      q('#btnSoloGuardar').addEventListener('click', () => guardar('none'));
      q('#btnGuardarPDF').addEventListener('click', () => guardar('pdf'));
      q('#btnGuardarWA')?.addEventListener('click', () => guardar('wa'));
    },
  });
}
