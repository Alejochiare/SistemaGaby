/* ============================================================
   VISTA · Alquileres — contratos activos, cobros y vencimientos
   ============================================================ */
import { getState, sel, actions, subscribe } from '../store.js';
import { icon, CONTRATO_ESTADOS, MONEDAS, DIA_LIMITE_PAGO } from '../config.js';
import { esc, fmtMoneda, fmtFechaCorta, garantesDeAlquiler, valorMonto, fmtMontoInput, parseFechaLocal, debounce, waLink, compartirArchivoPorWhatsApp, avisoEnvioWhatsApp } from '../lib.js';
import { navegar } from '../router.js';
import { openAlquilerForm, openCobroForm, openRenovacionForm, openAdelantoForm, openEntregaContratoForm } from './forms.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { imprimirRecibo, generarPDFRecibo, imprimirLiquidacion, generarPDFLiquidacion, imprimirFacturaDeuda, generarPDFFacturaDeuda, getAgencia, setAgencia } from '../imprimir.js?v=2';
import { getUltimoIndice, calcularVariacionICL, calcularVariacionIPC } from '../indices.js';
import { api } from '../data.js';

export default function alquileres(root, param) {
  if (param) return alqDetalle(root, param);
  root.innerHTML = `<div class="view" id="vAlq"></div>`;
  let filtro = '';
  let busqueda = '';

  const render = () => {
    const el = root.querySelector('#vAlq');
    const activo = el.querySelector('#buscarAlq');
    const conFoco = !!activo && activo === document.activeElement;
    const selStart = conFoco ? activo.selectionStart : null;
    const selEnd = conFoco ? activo.selectionEnd : null;
    pintarLista(el, filtro, busqueda);
    if (conFoco) {
      const nuevo = el.querySelector('#buscarAlq');
      if (nuevo) {
        nuevo.focus();
        nuevo.setSelectionRange(selStart, selEnd);
      }
    }
  };
  render();
  const unsub = subscribe(render);

  root.querySelector('#vAlq').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (btn) { filtro = btn.dataset.filtro; render(); }
  });
  root.querySelector('#vAlq').addEventListener('input', debounce((e) => {
    if (e.target.id === 'buscarAlq') { busqueda = e.target.value.toLowerCase(); render(); }
  }, 150));

  return unsub;
}

function pintarLista(el, filtro, busqueda) {
  const { alquileres, clientes, propiedades } = getState();

  const activos = alquileres.filter(a => !['rescindido', 'renovado'].includes(a.estado) && sel.diasAlVencimiento(a) >= 0);

  // Contadores para los badges
  const cntVencer   = activos.filter(a => { const d = sel.diasAlVencimiento(a); return d >= 0 && d <= 90; }).length;
  const cntAumento  = activos.filter(a => (sel.infoAjuste(a)?.pendientes || 0) > 0).length;
  const cntDeuda    = activos.filter(a => sel.cobrosImpagosMes(a).length > 0).length;
  const cntVencidos = alquileres.filter(a => !['rescindido', 'renovado'].includes(a.estado) && sel.diasAlVencimiento(a) < 0).length;

  const FILTROS = [
    { id: '',         label: 'Todos',            cnt: activos.length },
    { id: 'vencer',   label: 'Por vencer',       cnt: cntVencer,  color: 'var(--warning)' },
    { id: 'aumento',  label: 'Necesitan aumento',cnt: cntAumento, color: 'var(--warning)' },
    { id: 'deuda',    label: 'Con deuda',         cnt: cntDeuda,   color: 'var(--danger)'  },
    { id: 'vencidos', label: 'Vencidos',          cnt: cntVencidos,color: 'var(--danger)'  },
  ];

  const baseActivos = [...activos].sort((a, b) => sel.diasAlVencimiento(a) - sel.diasAlVencimiento(b));

  let lista;
  if      (filtro === 'vencer')   lista = baseActivos.filter(a => { const d = sel.diasAlVencimiento(a); return d >= 0 && d <= 90; });
  else if (filtro === 'aumento')  lista = baseActivos.filter(a => (sel.infoAjuste(a)?.pendientes || 0) > 0);
  else if (filtro === 'deuda')    lista = baseActivos.filter(a => sel.cobrosImpagosMes(a).length > 0);
  else if (filtro === 'vencidos') lista = alquileres.filter(a => !['rescindido', 'renovado'].includes(a.estado) && sel.diasAlVencimiento(a) < 0).sort((a, b) => sel.diasAlVencimiento(a) - sel.diasAlVencimiento(b));
  else                            lista = baseActivos;

  if (busqueda) {
    lista = lista.filter(a => (clientes.find(c => c.id === a.inquilinoId)?.nombre || '').toLowerCase().includes(busqueda));
  }

  const pillStyle = (activo) => activo
    ? 'background:var(--primary);color:var(--on-primary);border-color:var(--primary)'
    : 'background:var(--surface);color:var(--text);border-color:var(--border)';

  // Franja de color lateral según urgencia
  const urgenciaColor = (dias) => {
    if (dias < 0)   return '#dc2626'; // vencido
    if (dias <= 30) return '#dc2626'; // rojo — menos de 1 mes
    if (dias <= 90) return '#d97706'; // naranja — 1-3 meses
    return '#16a34a';                  // verde — más de 3 meses
  };
  const urgenciaLabel = (dias) => {
    if (dias < 0)   return `Venció hace ${Math.abs(dias)}d`;
    if (dias === 0) return 'Vence hoy';
    if (dias <= 30) return `Vence en ${dias}d`;
    if (dias <= 90) return `${dias}d restantes`;
    return fmtFechaCorta(activos.find(() => true)?.fechaFin || ''); // fallback
  };

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Alquileres</h1>
        <p class="view-sub">${activos.length} activo${activos.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" id="btnNuevoAlq">${icon('plus')} Nuevo contrato</button>
    </div>

    <div class="toolbar">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="buscarAlq" placeholder="Buscar por nombre del inquilino…" value="${esc(busqueda)}">
      </div>
    </div>

    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1.5rem">
      ${FILTROS.map(f => `
        <button data-filtro="${f.id}" style="border:1.5px solid;border-radius:var(--r-full);padding:.3rem .85rem;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s;${pillStyle(filtro===f.id)}">
          ${f.label}${f.cnt ? ` <span style="opacity:.75">(${f.cnt})</span>` : ''}
        </button>`).join('')}
    </div>

    ${lista.length ? `
    <div class="card" style="padding:0;overflow:hidden">
      ${lista.map(a => {
        const inq = clientes.find(c => c.id === a.inquilinoId);
        const prop = propiedades.find(p => p.id === a.propiedadId);
        const estado = sel.estadoAlquiler(a);
        const estadoObj = CONTRATO_ESTADOS.find(e => e.id === estado);
        const dias = sel.diasAlVencimiento(a);
        const cobrosImpagos = sel.cobrosImpagosMes(a);
        const ajInfo = sel.infoAjuste(a);
        const necesitaAumento = ajInfo && ajInfo.pendientes > 0;
        const montoActual = a.montoActual ?? a.montoInicial;
        const color = urgenciaColor(dias);

        return `
          <div class="list-row list-row-hover" data-id="${a.id}"
            style="cursor:pointer;align-items:stretch;padding:0;border-bottom:1px solid var(--border)">
            <!-- Franja de color lateral -->
            <div style="width:4px;background:${color};flex-shrink:0;border-radius:0"></div>
            <div style="flex:1;min-width:0;padding:.9rem 1.1rem;display:flex;align-items:center;gap:.75rem">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem">
                  <span class="list-name">${esc(inq?.nombre || '—')}</span>
                  ${cobrosImpagos.length ? `<span class="badge badge-danger" style="font-size:.68rem">${cobrosImpagos.length} mes${cobrosImpagos.length!==1?'es':''} sin pagar</span>` : ''}
                  ${necesitaAumento ? `<span class="badge badge-warning" style="font-size:.68rem">⬆ Aumentar${ajInfo.vencidos > 0 ? '' : ajInfo.diasHastaProx <= 0 ? ' · hoy' : ` · en ${ajInfo.diasHastaProx}d`}</span>` : ''}
                </div>
                <div class="text-xs text-soft">${esc(prop?.direccion || '—')}${prop?.ciudad ? ' · ' + esc(prop.ciudad) : ''}</div>
                <div class="text-xs" style="margin-top:.2rem;color:var(--text-soft)">
                  ${fmtMoneda(montoActual, a.moneda)}/mes
                </div>
              </div>
              <!-- Días restantes -->
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:.75rem;font-weight:700;color:${color}">${urgenciaLabel(dias)}</div>
                <div style="font-size:.7rem;color:var(--text-faint);margin-top:.1rem">Vence ${fmtFechaCorta(a.fechaFin)}</div>
              </div>
              <div style="display:flex;gap:.25rem;flex-shrink:0">
                <button class="btn btn-xs btn-ghost btn-cobro" data-id="${a.id}" title="Registrar cobro" onclick="event.stopPropagation()">${icon('dollar')}</button>
                <button class="btn btn-xs btn-ghost btn-edit-alq" data-id="${a.id}" title="Editar" onclick="event.stopPropagation()">${icon('edit')}</button>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>` : `
    <div class="empty">
      ${icon('key')}
      <h3>No hay contratos de alquiler</h3>
      <p>Cargá tu primer contrato.</p>
      <button class="btn btn-primary" id="btnNuevoAlq2">${icon('plus')} Nuevo contrato</button>
    </div>`}`;

  el.querySelector('#btnNuevoAlq')?.addEventListener('click', () => openAlquilerForm(null, () => {}));
  el.querySelector('#btnNuevoAlq2')?.addEventListener('click', () => openAlquilerForm(null, () => {}));

  el.querySelectorAll('.list-row-hover[data-id]').forEach(row => {
    row.addEventListener('click', () => navegar(`alquileres/${row.dataset.id}`));
  });
  el.querySelectorAll('.btn-cobro[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = getState().alquileres.find(x => x.id === btn.dataset.id);
      if (a) openCobroForm(a, () => {});
    });
  });
  el.querySelectorAll('.btn-edit-alq[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = getState().alquileres.find(x => x.id === btn.dataset.id);
      if (a) openAlquilerForm(a, () => {});
    });
  });
}

/* ---- Detalle de contrato ---- */
async function alqDetalle(root, id) {
  root.innerHTML = `<div class="view" id="vAlqDet"></div>`;
  const render = () => pintarDetalle(root.querySelector('#vAlqDet'), id);
  render();
  return subscribe(render);
}

function pintarDetalle(el, id) {
  const { alquileres, clientes, propiedades, propietarios } = getState();
  const a = alquileres.find(x => x.id === id);
  if (!a) { el.innerHTML = `<div class="view"><div class="empty"><h3>Contrato no encontrado</h3></div></div>`; return; }

  const inq      = clientes.find(c => c.id === a.inquilinoId);
  const prop     = propiedades.find(p => p.id === a.propiedadId);
  const dueños   = sel.propietariosDePropiedad(prop);
  const nombrePropietario = dueños.length
    ? dueños.map(o => propietarios.find(p => p.id === o.propietarioId)?.nombre || '—').join(' + ')
    : (propietarios.find(p => p.id === a.propietarioId)?.nombre || null);
  const estado   = sel.estadoAlquiler(a);
  const estadoObj = CONTRATO_ESTADOS.find(e => e.id === estado);
  const dias     = sel.diasAlVencimiento(a);
  const ajInfo   = sel.infoAjuste(a);
  const montoActual = a.montoActual ?? a.montoInicial ?? 0;

  // ── Calendario de meses ──────────────────────────────────
  const meses = generarMeses(a);
  const cobrosPorMes = {};
  (a.cobros || []).forEach(c => { cobrosPorMes[c.mes] = c; });

  const totalCobrado = (a.cobros || []).filter(c => c.pagado).reduce((s, c) => s + (Number(c.monto)||0), 0);
  const nPagados     = (a.cobros || []).filter(c => c.pagado).length;
  const nDebe        = meses.filter(m => m.tipo === 'sin_cobro' || m.tipo === 'parcial').length;

  // ── Render ────────────────────────────────────────────────
  el.innerHTML = `
    <div class="view-head">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" onclick="history.back()">${icon('x')}</button>
        <div>
          <h1 class="view-title">${esc(inq?.nombre || 'Contrato')}</h1>
          <p class="view-sub">${esc(prop?.direccion || '—')}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" id="btnVerContrato">${icon('file')} Ver contrato</button>
        <button class="btn btn-ghost" id="btnImprimirContrato" title="Imprimir ejemplares del contrato">${icon('download')} Imprimir ejemplares</button>
        <button class="btn btn-ghost" id="btnConfigAgencia" title="Datos de la inmobiliaria para documentos">${icon('edit')} Datos imprenta</button>
        <button class="btn btn-ghost" id="btnEditarAlq">${icon('edit')} Editar</button>
        <button class="btn btn-primary" id="btnRegistrarCobro">${icon('dollar')} Registrar cobro</button>
      </div>
    </div>

    <!-- Datos del contrato (resumen) -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-head">
        <h3>Contrato</h3>
        <span class="badge ${estadoObj?.badge || 'badge-neutral'}">${estadoObj?.label || estado}</span>
      </div>
      <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:.4rem .75rem">
        ${filaInline('Propiedad', prop?.direccion)}
        ${filaInline('Inicio', fmtFechaCorta(a.fechaInicio))}
        ${filaInline('Vencimiento', fmtFechaCorta(a.fechaFin))}
        ${filaInline('Fecha firma', a.fechaFirma ? fmtFechaCorta(a.fechaFirma) : null)}
        ${filaInline('Monto inicial', fmtMoneda(a.montoInicial, a.moneda))}
        ${filaInline('Monto actual', a.montoActual ? fmtMoneda(a.montoActual, a.moneda) : null)}
        ${filaInline('Ajuste', a.tipoAjuste ? `${a.tipoAjuste}${a.porcentajeAjuste ? ' · ' + a.porcentajeAjuste + '%' : ''} · c/${a.frecuenciaAjuste} meses` : null)}
        ${filaInline('Mora', a.pctMora ? `${a.pctMora}% por día (desde el ${DIA_LIMITE_PAGO})` : null)}
        ${filaInline('Depósito', fmtMoneda(a.deposito, a.moneda))}
        ${filaInline('Comisión', a.comision ? `${a.comision}%` : null)}
        ${filaInline('Comisión inicial', a.comisionInicial ? (a.comisionInicialCobrada ? 'Cobrada' : 'Pendiente') : null)}
      </div>

      <!-- Inquilino con WhatsApp -->
      <div style="border-top:1px solid var(--border);margin:0 1.25rem;padding:.75rem 0 .25rem">
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft);font-weight:600;margin-bottom:.6rem">Inquilino</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:.4rem .75rem;flex:1">
            ${filaInline('Nombre', inq?.nombre)}
            ${filaInline('Teléfono', a.inquilinoTelefono || inq?.telefono)}
            ${filaInline('DNI', a.inquilinoDni)}
            ${filaInline('Domicilio', a.inquilinoDomicilio)}
          </div>
          ${(() => { const tel = (a.inquilinoTelefono || inq?.telefono || '').replace(/\D/g,''); const num = tel ? (tel.startsWith('54')?tel:'54'+tel) : null; return num ? `<a href="https://wa.me/${num}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.4rem;text-decoration:none;flex-shrink:0">${icon('whatsapp')} WhatsApp</a>` : ''; })()}
        </div>
      </div>

      <!-- Garantes con WhatsApp -->
      ${garantesDeAlquiler(a).map((g, i, arr) => `
      <div style="border-top:1px solid var(--border);margin:0 1.25rem;padding:.75rem 0 .25rem">
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft);font-weight:600;margin-bottom:.6rem">Garante${arr.length > 1 ? ` ${i + 1}` : ''}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:.4rem .75rem;flex:1">
            ${filaInline('Nombre', g.nombre)}
            ${filaInline('DNI / CUIT', g.dni)}
            ${filaInline('Teléfono', g.telefono)}
            ${filaInline('Email', g.email)}
            ${filaInline('Domicilio', g.domicilio)}
            ${filaInline('Relación', g.relacion)}
            ${filaInline('Propiedad en garantía', g.propiedadGarantia)}
          </div>
          ${(() => { const tel = (g.telefono || '').replace(/\D/g,''); const num = tel ? (tel.startsWith('54')?tel:'54'+tel) : null; return num ? `<a href="https://wa.me/${num}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.4rem;text-decoration:none;flex-shrink:0">${icon('whatsapp')} WhatsApp</a>` : ''; })()}
        </div>
      </div>`).join('')}

      <!-- Ejemplares del contrato entregados -->
      ${(a.entregasContrato || []).length ? `
      <div style="border-top:1px solid var(--border);margin:0 1.25rem;padding:.75rem 0 .25rem">
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft);font-weight:600;margin-bottom:.6rem">Ejemplares del contrato entregados</div>
        <div style="display:flex;flex-direction:column;gap:.35rem">
          ${(a.entregasContrato || []).map(en => `
            <div style="font-size:.82rem">
              <strong>${fmtFechaCorta(en.fecha)}</strong> — ${esc((en.destinatarios || []).join(', '))}
              ${en.nota ? `<span class="text-soft"> · ${esc(en.nota)}</span>` : ''}
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div style="height:.5rem"></div>
      <div style="padding:.25rem 1.25rem .9rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
        ${dias >= 0
          ? `<span class="badge ${dias <= 30 ? 'badge-danger' : dias <= 60 ? 'badge-warning' : 'badge-success'}">Faltan ${dias} días para vencer</span>`
          : `<span class="badge badge-danger">Venció hace ${Math.abs(dias)} días</span>`}
        ${a.notas ? `<span class="text-soft" style="font-size:.82rem">📝 ${esc(a.notas)}</span>` : ''}
      </div>
    </div>

    <!-- Banner CONTRATO RENOVADO -->
    ${a.estado === 'renovado' ? `
    <div style="
      margin-bottom:1.25rem;padding:1rem 1.25rem;border-radius:var(--r-md);
      background:color-mix(in srgb,var(--info) 12%,transparent);
      border:2px solid var(--info);display:flex;align-items:center;gap:1rem;flex-wrap:wrap
    ">
      <div style="font-size:1.5rem">🔄</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:.95rem">Este contrato fue renovado</div>
        <div style="font-size:.82rem;color:var(--text-soft);margin-top:.2rem">Ya existe un nuevo contrato vigente para esta propiedad.</div>
      </div>
      ${a.renovadoEnId ? `<button class="btn btn-primary" id="btnVerRenovacion" style="flex-shrink:0">Ver contrato nuevo →</button>` : ''}
    </div>` : ''}

    <!-- Banner CONTRATO CANCELADO -->
    ${a.estado === 'rescindido' ? `
    <div style="
      margin-bottom:1.25rem;padding:1rem 1.25rem;border-radius:var(--r-md);
      background:var(--surface-2);border:2px solid var(--border);display:flex;align-items:center;gap:1rem;flex-wrap:wrap
    ">
      <div style="font-size:1.5rem">🚫</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:.95rem">Contrato cancelado</div>
        <div style="font-size:.82rem;color:var(--text-soft);margin-top:.2rem">
          ${a.fechaCancelacion ? `Cancelado el ${fmtFechaCorta(a.fechaCancelacion)}` : 'Este contrato fue cancelado.'} · La propiedad quedó disponible.
        </div>
      </div>
    </div>` : ''}

    <!-- Banner POR VENCER / VENCIDO -->
    ${a.estado === 'activo' && (estado === 'por_vencer' || estado === 'vencido') ? `
    <div style="
      margin-bottom:1.25rem;padding:1rem 1.25rem;border-radius:var(--r-md);
      background:color-mix(in srgb,var(--danger) 12%,transparent);
      border:2px solid var(--danger);display:flex;align-items:center;gap:1rem;flex-wrap:wrap
    ">
      <div style="font-size:1.5rem">⏳</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:.95rem">${estado === 'vencido' ? 'Contrato vencido' : 'Contrato por vencer'}</div>
        <div style="font-size:.82rem;color:var(--text-soft);margin-top:.2rem">
          ${estado === 'vencido' ? `Venció hace ${Math.abs(dias)} día${Math.abs(dias)!==1?'s':''}` : `Faltan ${dias} día${dias!==1?'s':''} para el vencimiento`} · ¿Renovás el contrato o lo cancelás?
        </div>
      </div>
      <div style="display:flex;gap:.6rem;flex-shrink:0">
        <button class="btn btn-ghost" id="btnCancelarAlqBanner" style="border:1.5px solid var(--danger);color:var(--danger)">Cancelar contrato</button>
        <button class="btn btn-primary" id="btnRenovarAlqBanner" style="background:var(--danger);border-color:var(--danger)">Renovar contrato</button>
      </div>
    </div>` : ''}

    <!-- Banner AUMENTO -->
    ${ajInfo && ajInfo.pendientes > 0 ? `
    <div style="
      margin-bottom:1.25rem;padding:1rem 1.25rem;border-radius:var(--r-md);
      background:color-mix(in srgb,var(--warning) 12%,transparent);
      border:2px solid var(--warning);display:flex;align-items:center;gap:1rem;flex-wrap:wrap
    ">
      <div style="font-size:1.5rem">⬆️</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:.95rem">Contrato por aumentar</div>
        <div style="font-size:.82rem;color:var(--text-soft);margin-top:.2rem">
          ${ajInfo.vencidos > 0
            ? `${ajInfo.pendientes} aumento${ajInfo.pendientes>1?'s':''} pendiente${ajInfo.pendientes>1?'s':''}`
            : `Próximo aumento ${ajInfo.diasHastaProx <= 0 ? 'hoy' : `dentro de ${ajInfo.diasHastaProx} día${ajInfo.diasHastaProx!==1?'s':''}`}`} ·
          Monto actual: <strong>${fmtMoneda(montoActual, a.moneda)}</strong> ·
          ${a.tipoAjuste === 'fijo' && a.porcentajeAjuste
            ? `Calculado automáticamente (+${a.porcentajeAjuste}%) → <strong style="color:var(--success)">${fmtMoneda(Math.round(montoActual*(1+a.porcentajeAjuste/100)), a.moneda)}</strong>`
            : a.tipoAjuste
              ? `Ajuste por <strong>${a.tipoAjuste}</strong> — el modal calcula automático`
              : 'Sin tipo de ajuste configurado'}
        </div>
      </div>
      <button class="btn btn-primary" id="btnRegistrarAumento" style="background:var(--warning);border-color:var(--warning);flex-shrink:0">
        Registrar aumento
      </button>
    </div>` : ''}

    <!-- Cobros mes a mes -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-head">
        <h3>${icon('dollar')} Cobros mes a mes</h3>
        <button class="btn btn-sm btn-primary" id="btnRegistrarCobro2">${icon('plus')} Agregar</button>
      </div>

      <!-- Resumen rápido -->
      <div style="display:flex;gap:2rem;padding:.75rem 1.25rem;border-bottom:1px solid var(--border);background:var(--surface-2);flex-wrap:wrap">
        <div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--success);line-height:1">${nPagados}</div>
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft)">Cobrados</div>
        </div>
        <div>
          <div style="font-size:1.3rem;font-weight:800;color:${nDebe?'var(--danger)':'var(--text-faint)'};line-height:1">${nDebe}</div>
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft)">Deben</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:1rem;font-weight:700">${fmtMoneda(totalCobrado, a.moneda)}</div>
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft)">Total cobrado</div>
        </div>
      </div>

      <!-- Lista de meses -->
      <div style="padding:.6rem .75rem;display:flex;flex-direction:column;gap:.4rem;max-height:480px;overflow-y:auto">
        ${meses.map(m => renderMesCobro(m, a)).join('')}
      </div>
    </div>

    <!-- Historial de ajustes -->
    ${(a.historialAjustes||[]).length ? `
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-head"><h3>${icon('trending')} Historial de aumentos</h3></div>
      <div style="padding:0">
        ${[...(a.historialAjustes||[])].reverse().map((aj, i) => {
          const esUltimo = i === 0; // solo el más reciente se puede corregir sin romper la cadena de montos
          return `
          <div class="list-row">
            <div class="list-info">
              <div class="list-name">${fmtFechaCorta(aj.fecha)}</div>
              <div class="text-xs text-soft">${aj.nota || 'Sin nota'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:.6rem">
              <div style="text-align:right">
                <div style="font-size:.75rem;color:var(--text-soft);text-decoration:line-through">${fmtMoneda(aj.montoAnterior, a.moneda)}</div>
                <div style="font-weight:700;color:var(--success)">${fmtMoneda(aj.montoNuevo, a.moneda)}</div>
              </div>
              ${esUltimo ? `
              <div style="display:flex;gap:.15rem;flex-shrink:0">
                <button class="btn btn-xs btn-ghost" data-editar-ajuste="${a.id}" title="Corregir este aumento">${icon('edit')}</button>
                <button class="btn btn-xs btn-ghost" data-deshacer-ajuste="${a.id}" title="Deshacer este aumento" style="color:var(--danger)">${icon('trash')}</button>
              </div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div style="padding-top:.75rem;border-top:1px solid var(--border);display:flex;gap:1rem;flex-wrap:wrap">
      ${a.estado === 'activo' ? `
      <button class="btn btn-ghost" id="btnRenovarAlq">${icon('refresh')} Renovar contrato</button>
      <button class="btn btn-ghost" id="btnCancelarAlq" style="color:var(--danger)">${icon('x')} Cancelar contrato</button>` : ''}
      <button class="btn" id="btnEliminarAlq" style="background:var(--danger);color:#fff;margin-left:auto">${icon('trash')} Eliminar</button>
    </div>`;

  /* ── Eventos ─────────────────────────────────────────── */
  el.querySelector('#btnVerContrato')?.addEventListener('click', () => abrirVistaContrato(a, inq, prop));
  el.querySelector('#btnImprimirContrato')?.addEventListener('click', () => openEntregaContratoForm(a, () => {}));
  el.querySelector('#btnEditarAlq')?.addEventListener('click', () => openAlquilerForm(a, () => {}));
  el.querySelector('#btnRegistrarCobro')?.addEventListener('click',  () => openCobroForm(a, () => {}));
  el.querySelector('#btnRegistrarCobro2')?.addEventListener('click', () => openCobroForm(a, () => {}));

  el.querySelector('#btnRegistrarAumento')?.addEventListener('click', () => openAumentoModal(a));
  el.querySelector('#btnConfigAgencia')?.addEventListener('click', () => openAgenciaModal());

  el.querySelector('[data-editar-ajuste]')?.addEventListener('click', () => openEditarAjusteModal(a));
  el.querySelector('[data-deshacer-ajuste]')?.addEventListener('click', () => {
    const ultimo = (a.historialAjustes || []).at(-1);
    if (!ultimo) return;
    if (confirm(`¿Deshacer el último aumento? El monto vuelve a ${fmtMoneda(ultimo.montoAnterior, a.moneda)}.`)) {
      actions.deshacerUltimoAjuste(a.id);
      toast('Aumento deshecho');
    }
  });

  /* imprimir recibo / liquidación */
  const datosImpresion = () => ({
    alq: a,
    inquilino: inq,
    propiedad: prop,
    propietario: getState().propietarios?.find(p => p.id === a.propietarioId),
  });
  el.querySelectorAll('[data-print-rec]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cobro = (a.cobros || []).find(c => c.mes === btn.dataset.printRec);
      if (cobro) imprimirRecibo({ ...datosImpresion(), cobro });
    });
  });
  el.querySelectorAll('[data-wa-rec]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cobro = (a.cobros || []).find(c => c.mes === btn.dataset.waRec);
      if (!cobro) return;
      const tel = a.inquilinoTelefono || inq?.telefono;
      if (!tel) { toast('Cargá el teléfono del inquilino para enviar por WhatsApp', { tipo: 'warning' }); return; }
      const texto = textoReciboWA(a, cobro, prop);
      try {
        const blob = await generarPDFRecibo({ ...datosImpresion(), cobro }, `recibo-${cobro.mes || 'documento'}.pdf`);
        const resultado = await compartirArchivoPorWhatsApp({ numero: tel, texto, archivo: blob, nombreArchivo: `recibo-${cobro.mes || 'documento'}.pdf` });
        const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'el recibo');
        toast(msg, opts);
      } catch (err) {
        console.error('Error generando o compartiendo PDF:', err);
        window.open(waLink(tel, texto), '_blank');
      }
    });
  });

  /* deshacer un cobro (pagado por error, o registrado como deuda por error) — en ambos
     casos el mes vuelve a quedar "sin registrar", como si nunca se hubiera cargado */
  el.querySelectorAll('[data-cob-deshacer]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cobroId = btn.dataset.cobDeshacer;
      const cobro = (a.cobros || []).find(c => c.id === cobroId);
      const msg = cobro?.pagado
        ? '¿Deshacer este cobro? Volverá a quedar sin registrar y se eliminará el movimiento de caja asociado.'
        : '¿Quitar este registro? El mes volverá a figurar como no registrado.';
      if (!confirm(msg)) return;
      await actions.deshacerCobro(id, cobroId);
      toast('Registro eliminado');
    });
  });

  /* registrar (o completar/confirmar, si ya había un registro parcial sin pagar) el cobro de un mes */
  el.querySelectorAll('[data-mes-nuevo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cobroId = btn.dataset.cobroId || null;
      const cobroExistente = cobroId ? (a.cobros || []).find(c => c.id === cobroId) : null;
      const esParcial = cobroExistente?.pagado && cobroExistente?.saldoPendiente > 0;
      openCobroForm(a, () => {}, {
        mes: btn.dataset.mesNuevo,
        monto: esParcial ? cobroExistente.saldoPendiente : (cobroExistente?.montoAlquiler ?? cobroExistente?.monto ?? montoActual),
        cobroId: cobroExistente?.id || null,
      });
    });
  });
  el.querySelectorAll('[data-adelanto]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAdelantoForm(a, btn.dataset.adelanto, () => {});
    });
  });

  const abrirRenovacion = () => {
    try {
      openRenovacionForm(a, (nuevo) => navegar(`alquileres/${nuevo?.id || id}`));
    } catch (err) {
      console.error('Error al abrir el formulario de renovación:', err);
      toast(`No se pudo abrir la renovación: ${err.message || err}`, { tipo: 'danger' });
    }
  };
  el.querySelector('#btnRenovarAlq')?.addEventListener('click', abrirRenovacion);
  el.querySelector('#btnRenovarAlqBanner')?.addEventListener('click', abrirRenovacion);
  el.querySelector('#btnCancelarAlq')?.addEventListener('click', () => abrirCancelacionModal(a));
  el.querySelector('#btnCancelarAlqBanner')?.addEventListener('click', () => abrirCancelacionModal(a));
  el.querySelector('#btnVerRenovacion')?.addEventListener('click', () => { if (a.renovadoEnId) navegar(`alquileres/${a.renovadoEnId}`); });
  el.querySelector('#btnEliminarAlq')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este contrato?')) return;
    await actions.deleteAlquiler(id);
    navegar('alquileres');
  });
}

const METODOS_CANCELACION = [
  { id: 'efectivo',      label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'cheque',        label: 'Cheque' },
  { id: 'debito',        label: 'Débito' },
  { id: 'credito',       label: 'Crédito' },
  { id: 'otro',          label: 'Otro' },
];

/* ── Modal de cancelación de contrato (muestra deuda pendiente si la hay) ── */
function abrirCancelacionModal(a) {
  const { clientes, propiedades, propietarios } = getState();
  const inq  = clientes.find(c => c.id === a.inquilinoId);
  const prop = propiedades.find(p => p.id === a.propiedadId);
  const own  = propietarios.find(p => p.id === a.propietarioId);

  const cobrosPend = sel.cobrosImpagosMes(a);
  const totalDeuda = cobrosPend.reduce((s, c) => s + (Number(c.monto) || 0), 0);

  openModal({
    title: 'Cancelar contrato',
    bodyHTML: `
      ${cobrosPend.length ? `
        <div style="padding:.9rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--danger) 10%,transparent);border:1px solid var(--danger);margin-bottom:1rem">
          <div style="font-weight:700;color:var(--danger);margin-bottom:.4rem">⚠ Este contrato tiene cobros pendientes</div>
          <div style="font-size:.85rem;color:var(--text-soft)">
            ${cobrosPend.length} mes${cobrosPend.length!==1?'es':''} sin cobrar por un total de <strong>${fmtMoneda(totalDeuda, a.moneda)}</strong>.
          </div>
        </div>` : `
        <div style="padding:.9rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--success) 10%,transparent);border:1px solid var(--success);margin-bottom:1rem">
          <div style="font-weight:700;color:var(--success)">✓ Sin cobros pendientes</div>
        </div>`}

      <div style="padding:.9rem 1rem;border-radius:var(--r-md);background:var(--surface-2);border:1px solid var(--border);margin-bottom:1rem">
        <div style="font-weight:700;margin-bottom:.5rem">Cargo adicional (opcional)</div>
        <div style="font-size:.8rem;color:var(--text-soft);margin-bottom:.6rem">
          Por ejemplo, una multa por rescisión anticipada si el contrato se cancela antes de la fecha de vencimiento.
        </div>
        <div class="form-grid">
          <div class="form-group full"><label>Concepto</label>
            <input id="cancConcepto" value="Multa por rescisión anticipada"></div>
          <div class="form-group"><label>Monto</label>
            <input id="cancMonto" type="text" inputmode="numeric" class="input-monto" placeholder="0"></div>
          <div class="form-group"><label>Moneda</label>
            <select id="cancMoneda">${MONEDAS.map(m => `<option value="${m}" ${m === 'ARS' ? 'selected' : ''}>${m}</option>`).join('')}</select>
            <div style="font-size:.72rem;color:var(--text-faint);margin-top:.2rem">Puede ser distinta a la moneda del contrato (${a.moneda || 'ARS'}).</div>
          </div>
          <div class="form-group"><label>Forma de pago</label>
            <select id="cancMetodoPago">${METODOS_CANCELACION.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}</select>
          </div>
          <div class="form-group full" id="cancRefBlk" style="display:none"><label>Referencia</label>
            <input id="cancReferencia" placeholder="Ej: N° de transferencia, banco...">
          </div>
        </div>
      </div>

      <p style="font-size:.88rem;color:var(--text-soft)">
        Al cancelar, el contrato queda marcado como rescindido, la propiedad pasa a estar <strong>disponible</strong>
        automáticamente (si no tiene otro contrato activo), y se genera un comprobante con la deuda pendiente y el cargo adicional si corresponde.
        El cargo adicional se registra como ingreso en la caja del día.
      </p>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Volver</button>
                 ${cobrosPend.length || inq?.telefono ? `<button class="btn btn-ghost" id="btnCancelacionWA" style="color:var(--success)">${icon('whatsapp')} Cancelar y enviar por WhatsApp</button>` : ''}
                 <button class="btn" id="btnConfirmarCancelacion" style="background:var(--danger);color:#fff">Cancelar contrato</button>`,
    onMount(ctx) {
      const mostrarRef = (m) => ['transferencia', 'cheque'].includes(m);
      const metodoSel = ctx.overlay.querySelector('#cancMetodoPago');
      const refBlk = ctx.overlay.querySelector('#cancRefBlk');
      const actualizarRef = () => { refBlk.style.display = mostrarRef(metodoSel.value) ? '' : 'none'; };
      metodoSel.addEventListener('change', actualizarRef);
      actualizarRef();

      /* Ejecuta la cancelación (registra el cargo adicional si hay) y arma los ítems
         de la factura de deuda; devuelve null si falla. */
      async function ejecutarCancelacion() {
        const conceptoMulta = ctx.overlay.querySelector('#cancConcepto').value.trim() || 'Multa por rescisión anticipada';
        const montoMulta = valorMonto(ctx.overlay.querySelector('#cancMonto').value);
        const monedaMulta = ctx.overlay.querySelector('#cancMoneda').value;
        const metodoPagoMulta = metodoSel.value;
        const referenciaMulta = ctx.overlay.querySelector('#cancReferencia').value.trim();

        await actions.cancelarAlquiler(a.id);

        if (montoMulta > 0) {
          const diaHoy = await actions.cajaHoy();
          await actions.addMovimiento(diaHoy.id, {
            tipo: 'ingreso',
            concepto: `${conceptoMulta} (${monedaMulta}) • ${inq?.nombre || 'Inquilino'} • ${prop?.direccion || 'Propiedad'}`,
            monto: montoMulta,
            metodoPago: metodoPagoMulta,
            nota: [referenciaMulta, 'Cancelación de contrato'].filter(Boolean).join(' · '),
            origen: 'cancelacion-contrato',
            refTipo: 'alquiler',
            refId: a.id,
            moneda: monedaMulta,
          });
        }

        const itemsFactura = cobrosPend.map(c => ({ ...c, moneda: a.moneda || 'ARS' }));
        if (montoMulta > 0) itemsFactura.push({ concepto: conceptoMulta, monto: montoMulta, moneda: monedaMulta });
        return itemsFactura;
      }

      ctx.overlay.querySelector('#btnConfirmarCancelacion').addEventListener('click', async () => {
        try {
          const itemsFactura = await ejecutarCancelacion();
          if (itemsFactura.length) {
            imprimirFacturaDeuda({ alq: a, inquilino: inq, propiedad: prop, propietario: own, cobrosPendientes: itemsFactura });
            toast('Contrato cancelado — se generó el comprobante');
          } else {
            toast('Contrato cancelado — la propiedad quedó disponible');
          }
          ctx.close();
        } catch (err) {
          console.error(err);
          toast(`Error al cancelar el contrato: ${err.message || err}`, { tipo: 'danger' });
        }
      });

      ctx.overlay.querySelector('#btnCancelacionWA')?.addEventListener('click', async () => {
        const tel = inq?.telefono;
        if (!tel) { toast('Cargá el teléfono del inquilino para enviar por WhatsApp', { tipo: 'warning' }); return; }
        try {
          const itemsFactura = await ejecutarCancelacion();
          ctx.close();
          if (!itemsFactura.length) { toast('Contrato cancelado — no había deuda para enviar'); return; }
          const texto = `Hola${inq?.nombre ? ' ' + inq.nombre : ''}! Te comparto el detalle de deuda pendiente al cancelar el contrato de ${prop?.direccion || 'la propiedad'}.`;
          const blob = await generarPDFFacturaDeuda({ alq: a, inquilino: inq, propiedad: prop, propietario: own, cobrosPendientes: itemsFactura }, 'deuda.pdf');
          const resultado = await compartirArchivoPorWhatsApp({ numero: tel, texto, archivo: blob, nombreArchivo: 'deuda.pdf' });
          const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'el detalle de deuda');
          toast(msg, opts);
        } catch (err) {
          console.error(err);
          toast(`Error al cancelar el contrato: ${err.message || err}`, { tipo: 'danger' });
        }
      });
    }
  });
}

/* ── Modal de cálculo de liquidación ────────────────────── */
function openLiquidacionModal(datos) {
  const { alq, cobro, propietario } = datos;
  const totalAlquiler = cobro.monto || alq.montoActual || alq.montoInicial || 0;
  const pctDefault    = alq.comision || 0;

  // Estado reactivo de descuentos (lista mutable)
  let descuentos = [{ id: 1, monto: '', nota: '' }];
  let nextId = 2;

  const calcHonorarios = (pct) => Math.round(totalAlquiler * (Number(pct) || 0) / 100);
  const calcTotal      = (pct, descs) =>
    totalAlquiler - calcHonorarios(pct) - descs.reduce((s, d) => s + (Number(d.monto) || 0), 0);

  const fmt = (n) => '$' + Math.abs(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });

  const renderDescuentos = (overlay) =>
    overlay.querySelector('#descuentosContainer').innerHTML =
      descuentos.map(d => `
        <div style="display:flex;gap:.5rem;align-items:center" data-desc-row="${d.id}">
          <input class="input desc-monto" data-id="${d.id}" type="number" min="0"
            placeholder="Monto" value="${d.monto}" style="width:130px;flex-shrink:0">
          <input class="input desc-nota" data-id="${d.id}"
            placeholder="Descripción (ej: plomería, pintura...)" value="${d.nota}" style="flex:1">
          <button type="button" class="btn btn-xs btn-ghost btn-del-desc" data-id="${d.id}"
            style="color:var(--danger);flex-shrink:0">${icon('x')}</button>
        </div>`).join('');

  const recalcular = (overlay) => {
    const pct      = parseFloat(overlay.querySelector('#pctHonorarios').value) || 0;
    const honor    = calcHonorarios(pct);
    const totalDesc = descuentos.reduce((s, d) => s + (Number(d.monto) || 0), 0);
    const total    = calcTotal(pct, descuentos);
    overlay.querySelector('#resHonorarios').textContent     = fmt(honor);
    overlay.querySelector('#resHonorariosFin').textContent  = fmt(honor);
    const descFin = overlay.querySelector('#resDescMonto');
    if (descFin) descFin.textContent = totalDesc > 0 ? fmt(totalDesc) : '—';
    overlay.querySelector('#resTotal').textContent = fmt(total);
    overlay.querySelector('#resTotal').style.color = total >= 0 ? 'var(--success)' : 'var(--danger)';
  };

  const bindDescuentos = (overlay) => {
    overlay.querySelectorAll('.desc-monto').forEach(inp => {
      inp.addEventListener('input', () => {
        const d = descuentos.find(x => String(x.id) === inp.dataset.id);
        if (d) { d.monto = inp.value; recalcular(overlay); }
      });
    });
    overlay.querySelectorAll('.desc-nota').forEach(inp => {
      inp.addEventListener('input', () => {
        const d = descuentos.find(x => String(x.id) === inp.dataset.id);
        if (d) d.nota = inp.value;
      });
    });
    overlay.querySelectorAll('.btn-del-desc').forEach(btn => {
      btn.addEventListener('click', () => {
        descuentos = descuentos.filter(x => String(x.id) !== btn.dataset.id);
        renderDescuentos(overlay);
        bindDescuentos(overlay);
        recalcular(overlay);
      });
    });
  };

  openModal({
    title: '📋 Calcular liquidación',
    size: 'lg',
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:1.1rem">

        <!-- Info del cobro -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.85rem 1rem;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:.75rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em">Alquiler cobrado</div>
            <div style="font-weight:600;font-size:.9rem">${esc(propietario?.nombre || '—')} · ${cobro.mes ? mesLabel(cobro.mes) : '—'}</div>
          </div>
          <div style="font-size:1.3rem;font-weight:800">${fmt(totalAlquiler)}</div>
        </div>

        <!-- Honorarios -->
        <div>
          <label class="form-label">% Honorarios de la inmobiliaria</label>
          <div style="display:flex;align-items:center;gap:.6rem">
            <input id="pctHonorarios" class="input" type="number" min="0" max="100" step="0.5"
              value="${pctDefault}" style="width:110px;font-size:1.1rem;font-weight:700;text-align:center">
            <span style="color:var(--text-soft)">%</span>
            <span style="color:var(--text-soft);font-size:.82rem">→ se queda la inmobiliaria:</span>
            <span id="resHonorarios" style="font-weight:800;font-size:1rem;color:var(--primary)">${fmt(calcHonorarios(pctDefault))}</span>
          </div>
        </div>

        <!-- Descuentos adicionales -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <label class="form-label" style="margin:0">Descuentos adicionales</label>
            <button type="button" class="btn btn-xs btn-ghost" id="btnAgregarDesc" style="color:var(--primary)">
              ${icon('plus')} Agregar descuento
            </button>
          </div>
          <div id="descuentosContainer" style="display:flex;flex-direction:column;gap:.4rem">
          </div>
          <div style="font-size:.76rem;color:var(--text-soft);margin-top:.35rem">
            Podés agregar gastos, reparaciones, deudas u otros conceptos que se descuenten del pago al propietario. Cada uno aparece detallado en el documento.
          </div>
        </div>

        <!-- Forma de pago -->
        <div>
          <label class="form-label">Forma de pago</label>
          <select id="formaPago" class="input">
            <option>Efectivo</option>
            <option>Transferencia</option>
            <option>Cheque</option>
            <option>Otro</option>
          </select>
        </div>

        <!-- Resumen final -->
        <div style="background:color-mix(in srgb,var(--success) 8%,transparent);border:2px solid var(--success);border-radius:var(--r-md);padding:1rem 1.25rem">
          <div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-soft);margin-bottom:.3rem">
            <span>Total alquiler</span><span>${fmt(totalAlquiler)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-soft);margin-bottom:.3rem">
            <span>− Honorarios</span><span id="resHonorariosFin">${fmt(calcHonorarios(pctDefault))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-soft);padding-bottom:.4rem;border-bottom:1px solid var(--border);margin-bottom:.4rem" id="resDescuentosFin" ${!descuentos.length ? 'style="display:none"' : ''}>
            <span>− Otros descuentos</span><span id="resDescMonto">—</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:800">
            <span>Total al propietario</span>
            <span id="resTotal" style="color:var(--success)">${fmt(calcTotal(pctDefault, descuentos))}</span>
          </div>
        </div>
      </div>`,

    footerHTML: `
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <button class="btn btn-primary" id="btnGenLiq">${icon('file')} Generar liquidación</button>`,

    onMount({ overlay, close }) {
      // Render inicial de descuentos
      renderDescuentos(overlay);
      bindDescuentos(overlay);

      // Honorarios cambia
      const inpPct = overlay.querySelector('#pctHonorarios');
      inpPct.addEventListener('input', () => {
        const honor = calcHonorarios(inpPct.value);
        overlay.querySelector('#resHonorarios').textContent = fmt(honor);
        overlay.querySelector('#resHonorariosFin').textContent = fmt(honor);
        recalcular(overlay);
      });

      // Agregar descuento
      overlay.querySelector('#btnAgregarDesc').addEventListener('click', () => {
        descuentos.push({ id: nextId++, monto: '', nota: '' });
        renderDescuentos(overlay);
        bindDescuentos(overlay);
        recalcular(overlay);
      });

      overlay.querySelector('[data-cancel]').addEventListener('click', close);

      overlay.querySelector('#btnGenLiq').addEventListener('click', () => {
        const pct      = parseFloat(inpPct.value) || 0;
        const formaPago = overlay.querySelector('#formaPago').value;
        const descs     = descuentos.filter(d => d.monto && Number(d.monto) > 0);
        imprimirLiquidacion({ ...datos, pctHonorarios: pct, descuentos: descs, formaPago });
        close();
      });
    },
  });
}

/* ── Modal datos para los documentos ─────────────────────── */
function openAgenciaModal() {
  const ag = getAgencia();
  openModal({
    title: '📄 Datos para los documentos',
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:.85rem">
        <p style="font-size:.82rem;color:var(--text-soft)">
          Estos datos aparecen en el encabezado de los recibos.
        </p>
        <div class="form-grid">
          <div class="form-group full"><label class="form-label">Tu nombre</label>
            <input id="agNombre" class="input" value="${esc(ag.nombre||'')}" placeholder="Ej: Gaby"></div>
          <div class="form-group full"><label class="form-label">Dirección</label>
            <input id="agDireccion" class="input" value="${esc(ag.direccion||'')}" placeholder="Av. Colón 1234"></div>
          <div class="form-group"><label class="form-label">Localidad</label>
            <input id="agLocalidad" class="input" value="${esc(ag.localidad||'')}" placeholder="Córdoba"></div>
          <div class="form-group"><label class="form-label">Teléfono</label>
            <input id="agTelefono" class="input" value="${esc(ag.telefono||'')}" placeholder="0351-1234567"></div>
          <div class="form-group"><label class="form-label">Inicio de actividades</label>
            <input id="agInicio" class="input" type="date" value="${ag.inicioActividades||''}"></div>
        </div>
      </div>`,
    footerHTML: `<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" id="btnGuardarAgencia">Guardar</button>`,
    onMount({ overlay, close }) {
      overlay.querySelector('[data-cancel]').addEventListener('click', close);
      overlay.querySelector('#btnGuardarAgencia').addEventListener('click', async () => {
        const datos = {
          nombre:            overlay.querySelector('#agNombre').value.trim(),
          direccion:         overlay.querySelector('#agDireccion').value.trim(),
          localidad:         overlay.querySelector('#agLocalidad').value.trim(),
          telefono:          overlay.querySelector('#agTelefono').value.trim(),
          inicioActividades: overlay.querySelector('#agInicio').value,
        };
        setAgencia(datos);
        try { await api.updateAgencia(datos); } catch { toast('No se pudo guardar en el servidor — se guardó solo en este navegador.', { tipo: 'warning' }); }
        close();
      });
    },
  });
}

/* ── Generar lista de meses del contrato ────────────────── */
function generarMeses(a) {
  if (!a.fechaInicio) return [];
  const hoy   = new Date();
  const inicio = parseFechaLocal(a.fechaInicio);
  // Se muestra el contrato completo (no solo unos meses para adelante) para que se pueda
  // registrar un Adelanto de pago sobre cualquier mes, sin importar qué tan lejos esté.
  const fin = a.fechaFin ? parseFechaLocal(a.fechaFin) : new Date(hoy.getFullYear(), hoy.getMonth() + 2, 1);

  const meses = [];
  const cobrosPorMes = {};
  (a.cobros || []).forEach(c => { cobrosPorMes[c.mes] = c; });

  let cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(fin.getFullYear(), fin.getMonth(), 1);

  while (cur <= limite) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
    const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
    const esFuturo = key > hoyKey;
    const cobro = cobrosPorMes[key];

    // Un mes no pagado se ve siempre igual (mismo color/acción), exista o no ya un
    // registro parcial de cobro atrás — evita que un contrato se vea distinto de otro
    // solo porque a uno se le había pre-cargado el mes y al otro no.
    let tipo;
    if (cobro?.pagado && cobro.saldoPendiente > 0) {
      tipo = 'parcial'; // se cobró algo de este mes, pero todavía queda un saldo por cobrar
    } else if (cobro?.pagado) {
      tipo = 'pagado';
    } else if (esFuturo) {
      tipo = 'futuro';
    } else {
      tipo = 'sin_cobro';
    }

    meses.unshift({ key, cobro, tipo }); // más reciente primero
    cur.setMonth(cur.getMonth() + 1);
  }
  return meses;
}

/* ── Render de una fila de mes ──────────────────────────── */
function renderMesCobro(m, a) {
  const { key, cobro, tipo } = m;
  const label = mesLabel(key);

  const configs = {
    pagado:    { bg: 'color-mix(in srgb,var(--success) 8%,transparent)',  border: 'color-mix(in srgb,var(--success) 25%,transparent)', dot: 'var(--success)',      icon: '✓' },
    parcial:   { bg: 'color-mix(in srgb,var(--info) 8%,transparent)',      border: 'color-mix(in srgb,var(--info) 40%,transparent)',    dot: 'var(--info)',         icon: '½' },
    sin_cobro: { bg: 'color-mix(in srgb,var(--warning) 10%,transparent)',  border: 'color-mix(in srgb,var(--warning) 50%,transparent)', dot: 'var(--warning)',      icon: '?' },
    futuro:    { bg: 'var(--surface-2)',                                    border: 'var(--border)',                                      dot: 'var(--text-faint)',   icon: '·' },
  };
  const cfg = configs[tipo];

  return `
  <div style="
    display:flex;align-items:center;gap:.85rem;padding:.65rem .9rem;
    border-radius:var(--r-md);background:${cfg.bg};border:1.5px solid ${cfg.border}
  ">
    <!-- Dot estado -->
    <div style="
      width:34px;height:34px;border-radius:50%;flex-shrink:0;
      background:${cfg.dot};display:grid;place-items:center;
      color:#fff;font-weight:800;font-size:.95rem
    ">${cfg.icon}</div>

    <!-- Mes + detalle -->
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:.9rem">${label}</div>
      <div style="font-size:.76rem;color:var(--text-soft)">
        ${tipo === 'pagado'    ? `Cobrado el ${fmtFechaCorta(cobro.fechaPago)}` : ''}
        ${tipo === 'parcial'   ? `Abonó ${fmtMoneda(cobro.montoAlquiler, a.moneda)} de ${fmtMoneda(cobro.montoEsperado, a.moneda)} el ${fmtFechaCorta(cobro.fechaPago)}` : ''}
        ${tipo === 'sin_cobro' ? 'Sin registrar' : ''}
        ${tipo === 'futuro'    ? 'Mes futuro' : ''}
      </div>
    </div>

    <!-- Monto -->
    <div style="font-size:1rem;font-weight:700;white-space:nowrap;color:${tipo==='pagado'?'var(--success)':tipo==='parcial'?'var(--info)':tipo==='futuro'?'var(--text-faint)':'inherit'}">
      ${tipo === 'parcial' ? `Debe ${fmtMoneda(cobro.saldoPendiente, a.moneda)}`
        : cobro?.monto ? fmtMoneda(cobro.monto, a.moneda) : tipo !== 'futuro' ? fmtMoneda(a.montoActual ?? a.montoInicial, a.moneda) : '—'}
    </div>

    <!-- Acción -->
    ${tipo === 'pagado'
      ? `<div style="display:flex;gap:.4rem;flex-shrink:0;align-items:center">
           <button class="btn btn-xs btn-ghost" data-print-rec="${key}" title="Imprimir recibo">${icon('file')} Recibo</button>
           <button class="btn btn-xs btn-ghost" data-wa-rec="${key}" title="Enviar recibo por WhatsApp" style="color:var(--success)">${icon('whatsapp')}</button>
           <button class="btn btn-xs btn-ghost" data-cob-deshacer="${cobro.id}" title="Deshacer cobro (por error)" style="color:var(--danger)">${icon('refresh')} Deshacer</button>
         </div>`
      : tipo === 'parcial'
        ? `<div style="display:flex;gap:.4rem;flex-shrink:0;align-items:center">
             <button class="btn btn-sm" data-mes-nuevo="${key}" data-cobro-id="${cobro.id}" style="background:var(--info);color:#fff;border:none">Completar</button>
             <button class="btn btn-xs btn-ghost" data-cob-deshacer="${cobro.id}" title="Deshacer todo lo cobrado de este mes" style="color:var(--danger)">${icon('refresh')}</button>
           </div>`
      : tipo === 'sin_cobro'
        ? `<div style="display:flex;gap:.4rem;flex-shrink:0;align-items:center">
             <button class="btn btn-sm" data-mes-nuevo="${key}" data-cobro-id="${cobro?.id || ''}" style="background:var(--warning);color:#fff;border:none">Registrar</button>
             ${cobro ? `<button class="btn btn-xs btn-ghost" data-cob-deshacer="${cobro.id}" title="Quitar este registro" style="color:var(--danger)">${icon('trash')}</button>` : ''}
           </div>`
        : `<div style="display:flex;gap:.4rem;flex-shrink:0;align-items:center">
             <span class="badge badge-neutral">Pendiente</span>
             <button class="btn btn-xs btn-ghost" data-adelanto="${key}" title="Registrar adelanto de pago desde este mes">${icon('wallet')} Adelanto</button>
           </div>`}
  </div>`;
}

/* ── Modal registrar aumento ────────────────────────────── */
function openAumentoModal(a) {
  const montoActual = a.montoActual ?? a.montoInicial ?? 0;
  const tipo        = a.tipoAjuste || 'otro';
  const pctFijo     = Number(a.porcentajeAjuste) || 0;

  const esFijo   = tipo === 'fijo';
  const esIndice = tipo === 'ICL' || tipo === 'IPC';

  const calcNuevoMonto = (pct, ajuste) =>
    Math.round(montoActual * (1 + (pct + (ajuste || 0)) / 100));

  const montoInicial = esFijo ? calcNuevoMonto(pctFijo, 0) : '';

  const tipoLabels = { ICL: 'ICL (Índice Casa Propia)', IPC: 'IPC (Inflación)', fijo: 'Porcentaje fijo', otro: 'Otro' };

  const linkFuente = 'https://arquiler.com/';

  const indiceActual = esIndice ? getUltimoIndice(tipo) : null;

  // Período real de este contrato: desde el último ajuste aplicado (o el inicio
  // del contrato si todavía no tuvo ninguno) hasta la fecha teórica de este
  // período — es lo que determina el % real a aplicar, no un genérico "% mensual".
  const hoyISO = new Date().toISOString().slice(0, 10);
  const ultimoAjusteAplicado = (a.historialAjustes || []).at(-1);
  const fechaDesdeAjuste = ultimoAjusteAplicado?.fecha || a.fechaInicio;

  // Cuántos ajustes de este contrato ya deberían haberse aplicado según la
  // frecuencia pactada (ej: contrato de 12 meses, ajuste c/4 meses → 3 pendientes).
  // El usuario los va aplicando de a uno; este modal se reabre solo hasta ponerlo al día.
  const ajInfo = sel.infoAjuste(a);
  const numeroPeriodo = ajInfo ? ajInfo.applied + 1 : 1;
  const totalPeriodos = ajInfo ? ajInfo.expected : 1;

  // El % del índice debe medirse solo sobre el período pactado (ej: los 4 meses
  // que corresponden a este ajuste), no hasta hoy — si hay meses de atraso sin
  // registrar el aumento, esos meses de más no deben inflar el % de este período.
  const fechaHastaAjuste = ajInfo && ajInfo.proxFecha < hoyISO ? ajInfo.proxFecha : hoyISO;

  openModal({
    title: ajInfo && ajInfo.pendientes > 1 ? `Registrar aumento (período ${numeroPeriodo} de ${totalPeriodos})` : 'Registrar aumento',
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:1.25rem">

        ${ajInfo && ajInfo.pendientes > 1 ? `
        <div style="padding:.75rem 1rem;background:color-mix(in srgb,var(--warning) 12%,transparent);border:1.5px solid var(--warning);border-radius:var(--r-md);font-size:.85rem">
          Este contrato acumula <strong>${ajInfo.pendientes} ajustes sin aplicar</strong> (uno cada ${a.frecuenciaAjuste} meses).
          Corresponde al período que vencía el <strong>${fmtFechaCorta(ajInfo.proxFecha)}</strong>.
          Después de este quedarán <strong>${ajInfo.pendientes - 1}</strong> más por registrar.
        </div>` : ''}

        ${esIndice ? `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <label class="form-label" style="margin:0">Ajuste por ${tipo}</label>
            <a href="${linkFuente}" target="_blank" rel="noopener"
              style="font-size:.75rem;color:var(--primary);text-decoration:none">Ver calculadora →</a>
          </div>
          <div style="padding:.6rem .75rem;background:var(--surface-2);border-radius:var(--r-md);margin-bottom:.6rem">
            <div style="font-size:.68rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.2rem">% real desde ${fmtFechaCorta(fechaDesdeAjuste)} hasta ${fmtFechaCorta(fechaHastaAjuste)}</div>
            <div id="indiceRealVal" style="font-size:1.3rem;font-weight:800;color:var(--primary)">${fechaDesdeAjuste ? 'Calculando…' : '—'}</div>
            <div style="font-size:.68rem;color:var(--text-faint);margin-top:.1rem">Variación acumulada real del índice para este contrato (no es el % mensual genérico)</div>
          </div>
          <div>
            <label style="font-size:.68rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:.2rem">% a aplicar</label>
            <div style="display:flex;align-items:center;gap:.4rem">
              <input id="pctIndice" class="input" type="number" min="0" step="0.01" value="${indiceActual ? indiceActual.pct : ''}"
                style="flex:1;font-size:1.2rem;font-weight:700;text-align:center;height:2.65rem">
              <span style="color:var(--text-soft)">%</span>
            </div>
            <div style="font-size:.68rem;color:var(--text-faint);margin-top:.2rem">Precargado con el % mensual (${indiceActual ? indiceActual.pct + '%, ' + mesLabel(indiceActual.mes) : 'sin datos'}) — se actualiza solo al calcular el % real, y siempre lo podés modificar vos.</div>
          </div>
        </div>` : `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <label class="form-label" style="margin:0">% de aumento</label>
            <span style="font-size:.75rem;color:var(--text-soft)">Pactado en el contrato: <strong>${pctFijo}%</strong></span>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <input id="pctFijoInput" class="input" type="number" min="0" step="0.1" value="${pctFijo}"
              style="flex:1;font-size:1.3rem;font-weight:700;text-align:center;height:3rem">
            <span style="color:var(--text-soft)">%</span>
          </div>
        </div>`}

        <div>
          <label class="form-label">% extra
            <span style="font-weight:400;color:var(--text-soft)"> — acordado con el inquilino (opcional)</span>
          </label>
          <div style="display:flex;align-items:center;gap:.5rem">
            <input id="pctAdicional" class="input" type="number" step="0.1" value="0"
              style="flex:1;text-align:center;font-size:1.3rem;font-weight:700;height:3rem">
            <span style="color:var(--text-soft)">%</span>
          </div>
        </div>

        <!-- Resultado -->
        <div style="padding:1.1rem 1.25rem;background:var(--surface-2);border-radius:var(--r-md);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:.72rem;color:var(--text-soft);margin-bottom:.2rem">Monto actual</div>
            <div style="font-size:1rem;font-weight:600">${fmtMoneda(montoActual, a.moneda)}</div>
          </div>
          <div style="color:var(--text-faint)">→</div>
          <div style="text-align:right">
            <label class="form-label" style="margin:0 0 .2rem;font-size:.72rem;color:var(--text-soft)" for="nuevoMonto">Nuevo monto <span style="font-weight:400">(editable)</span></label>
            <input id="nuevoMonto" class="input input-monto" type="text" inputmode="numeric"
              value="${montoInicial ? fmtMontoInput(montoInicial) : ''}"
              style="font-size:1.2rem;font-weight:800;color:var(--primary);text-align:right;height:2.6rem;width:150px">
          </div>
        </div>

        <div>
          <label class="form-label">Nota <span style="font-weight:400;color:var(--text-soft)">(opcional)</span></label>
          <input id="notaAumento" class="input" placeholder="Ej: Ajuste ${tipo} junio 2025">
        </div>

      </div>`,

    footerHTML: `
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <button class="btn btn-primary" id="btnConfAumento">Confirmar aumento</button>`,

    onMount({ overlay, close }) {
      const $pctIndice    = overlay.querySelector('#pctIndice');
      const $pctFijo      = overlay.querySelector('#pctFijoInput');
      const $pctAdicional = overlay.querySelector('#pctAdicional');
      const $nuevoMonto   = overlay.querySelector('#nuevoMonto'); // input editable

      let _montoCalculado = montoInicial || 0;
      // Si el usuario tipea el monto final a mano, dejamos de recalcularlo
      // desde los % — en cambio el % extra se deriva del monto ingresado.
      let _montoEditadoManual = false;

      const recalcular = () => {
        if (_montoEditadoManual) return;
        const pctBase  = esIndice ? (parseFloat($pctIndice?.value) || 0) : (parseFloat($pctFijo?.value) || 0);
        const pctExtra = parseFloat($pctAdicional?.value) || 0;
        const pctTotal = pctBase + pctExtra;
        _montoCalculado = calcNuevoMonto(pctBase, pctExtra);
        if ($nuevoMonto) {
          $nuevoMonto.value = pctTotal > 0 ? fmtMontoInput(_montoCalculado) : '';
        }
      };

      const recalcularDesdeMonto = () => {
        _montoEditadoManual = true;
        const monto = valorMonto($nuevoMonto.value);
        _montoCalculado = monto;
        if (!montoActual || !$pctAdicional) return;
        const pctBase  = esIndice ? (parseFloat($pctIndice?.value) || 0) : (parseFloat($pctFijo?.value) || 0);
        const pctTotal = ((monto / montoActual) - 1) * 100;
        $pctAdicional.value = Math.round((pctTotal - pctBase) * 100) / 100;
      };

      const onPctInput = () => { _montoEditadoManual = false; recalcular(); };

      if (esIndice) recalcular();
      if (esIndice && !indiceActual) $pctIndice?.focus();

      $pctIndice?.addEventListener('input', onPctInput);
      $pctFijo?.addEventListener('input', onPctInput);
      $pctAdicional?.addEventListener('input', onPctInput);
      $nuevoMonto?.addEventListener('input', recalcularDesdeMonto);

      if (esFijo) recalcular();

      // Calcular el % real del período (desde el último ajuste hasta hoy) vía API.
      // Si el input todavía tiene el valor mensual precargado (sin tocar), se
      // reemplaza por el real; si el usuario ya lo modificó, se lo respeta.
      if (esIndice && fechaDesdeAjuste) {
        const valorPrecargado = $pctIndice?.value || '';
        const fnCalc = tipo === 'IPC' ? calcularVariacionIPC : calcularVariacionICL;
        fnCalc(fechaDesdeAjuste, fechaHastaAjuste).then(pctReal => {
          const $val = overlay.querySelector('#indiceRealVal');
          if ($val) $val.textContent = `${pctReal}%`;
          if ($pctIndice && $pctIndice.value === valorPrecargado) {
            $pctIndice.value = pctReal;
            recalcular();
          }
        }).catch(err => {
          console.warn(`[aumento] No se pudo calcular el % real de ${tipo}:`, err);
          const $val = overlay.querySelector('#indiceRealVal');
          if ($val) $val.textContent = 'No disponible';
        });
      }


      overlay.querySelector('[data-cancel]').addEventListener('click', close);

      overlay.querySelector('#btnConfAumento').addEventListener('click', async () => {
        const nota     = overlay.querySelector('#notaAumento').value.trim();
        const pctBase  = esIndice ? (parseFloat($pctIndice?.value) || 0) : (parseFloat($pctFijo?.value) || 0);
        const pctExtra = parseFloat($pctAdicional?.value) || 0;

        if (_montoCalculado <= 0) {
          if ($pctIndice) { $pctIndice.style.borderColor = 'var(--danger)'; $pctIndice.focus(); }
          return;
        }
        if (_montoCalculado <= montoActual) {
          if (!confirm(`El nuevo monto es igual o menor al actual. ¿Confirmar igual?`)) return;
        }
        const notaAuto = nota || `Ajuste ${tipo} ${pctBase}%${pctExtra ? ` + ${pctExtra}% adicional` : ''}`;
        await actions.registrarAumento(a.id, _montoCalculado, notaAuto);
        close();

        // Si todavía quedan ajustes de períodos anteriores sin aplicar, se
        // reabre el modal automáticamente para el siguiente en vez de darlo por hecho.
        const fresh = getState().alquileres.find(x => x.id === a.id);
        const ajInfoFresh = fresh ? sel.infoAjuste(fresh) : null;
        if (ajInfoFresh && ajInfoFresh.pendientes > 0) {
          toast(`Ajuste registrado · quedan ${ajInfoFresh.pendientes} pendiente${ajInfoFresh.pendientes > 1 ? 's' : ''}`, { tipo: 'warning' });
          setTimeout(() => openAumentoModal(fresh), 250);
        } else {
          toast('Contrato al día con los aumentos');
        }
      });
    },
  });
}

/* ── Modal corregir/deshacer el último aumento ───────────── */
function openEditarAjusteModal(a) {
  const ultimo = (a.historialAjustes || []).at(-1);
  if (!ultimo) return;

  openModal({
    title: 'Corregir último aumento',
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div style="padding:.75rem 1rem;background:var(--surface-2);border-radius:var(--r-md);font-size:.82rem;color:var(--text-soft)">
          Este aumento cambió el monto de <strong>${fmtMoneda(ultimo.montoAnterior, a.moneda)}</strong> a <strong>${fmtMoneda(ultimo.montoNuevo, a.moneda)}</strong>. Solo se puede corregir el último aumento registrado (los anteriores quedan fijos para no desordenar el historial).
        </div>
        <div>
          <label class="form-label">Fecha</label>
          <input id="editFecha" class="input" type="date" value="${ultimo.fecha || ''}">
        </div>
        <div>
          <label class="form-label">Nuevo monto $</label>
          <input id="editMonto" class="input input-monto" type="text" inputmode="numeric" value="${fmtMontoInput(ultimo.montoNuevo)}" style="font-size:1.2rem;font-weight:700">
        </div>
        <div>
          <label class="form-label">Nota</label>
          <input id="editNota" class="input" value="${esc(ultimo.nota || '')}">
        </div>
      </div>`,
    footerHTML: `
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <button class="btn btn-primary" id="btnGuardarEditAjuste">Guardar corrección</button>`,
    onMount({ overlay, close }) {
      overlay.querySelector('[data-cancel]').addEventListener('click', close);
      overlay.querySelector('#btnGuardarEditAjuste').addEventListener('click', async () => {
        const fecha = overlay.querySelector('#editFecha').value;
        const montoNuevo = valorMonto(overlay.querySelector('#editMonto').value);
        const nota = overlay.querySelector('#editNota').value.trim();
        if (!montoNuevo || montoNuevo <= 0) { toast('Indicá un monto válido', { tipo: 'warning' }); return; }
        await actions.editarUltimoAjuste(a.id, { fecha: fecha || ultimo.fecha, montoNuevo, nota });
        toast('Aumento corregido');
        close();
      });
    },
  });
}

function fila(label, val) {
  if (val === undefined || val === null || val === '' || val === '—') return '';
  return `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;font-size:.875rem"><span class="text-soft" style="min-width:90px">${label}</span><span>${esc(String(val))}</span></div>`;
}

/* ---- Vista contrato completo (solo lectura) ---- */
function abrirVistaContrato(a, inq, prop) {
  const waUrl = (tel) => { const t = (tel || '').replace(/\D/g,''); return t ? `https://wa.me/${t.startsWith('54')?t:'54'+t}` : null; };
  const waInq = waUrl(a.inquilinoTelefono || inq?.telefono);
  const garantes = garantesDeAlquiler(a);

  const seccion = (titulo, html) => `
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--primary);border-bottom:2px solid var(--primary);padding-bottom:.3rem;margin-bottom:.65rem">${titulo}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.35rem .75rem">${html}</div>
    </div>`;

  const f = (label, val) => val ? `
    <div style="font-size:.84rem;padding:.3rem 0;border-bottom:1px solid var(--border)">
      <span style="font-size:.7rem;color:var(--text-soft);display:block;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.05rem">${label}</span>
      <span style="font-weight:500">${esc(String(val))}</span>
    </div>` : '';

  const wa = (label, url) => url ? `<a href="${url}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:inline-flex;align-items:center;gap:.35rem;text-decoration:none;margin-top:.5rem">${icon('whatsapp')} ${label}</a>` : '';

  openModal({
    title: `Contrato — ${esc(inq?.nombre || '—')}`,
    size: 'lg',
    bodyHTML: `
      <div style="font-size:.78rem;color:var(--text-soft);margin-bottom:1.25rem;padding:.5rem .75rem;background:var(--surface-2);border-radius:var(--r-sm)">
        Esta vista es de solo lectura. Para modificar el contrato, usá el botón <strong>Editar</strong>.
      </div>

      ${seccion('Propiedad', `
        ${f('Dirección', prop?.direccion)}
        ${f('Ciudad', prop?.ciudad)}
        ${f('Barrio', prop?.barrio)}
        ${f('Tipo', prop?.tipo)}
      `)}

      ${seccion('Condiciones del contrato', `
        ${f('Fecha de firma', a.fechaFirma ? fmtFechaCorta(a.fechaFirma) : null)}
        ${f('Inicio del contrato', fmtFechaCorta(a.fechaInicio))}
        ${f('Vencimiento', fmtFechaCorta(a.fechaFin))}
        ${f('Monto inicial', fmtMoneda(a.montoInicial, a.moneda))}
        ${f('Monto actual', a.montoActual ? fmtMoneda(a.montoActual, a.moneda) : null)}
        ${f('Tipo de ajuste', a.tipoAjuste)}
        ${f('Frecuencia de ajuste', a.frecuenciaAjuste ? `Cada ${a.frecuenciaAjuste} meses` : null)}
        ${f('% de ajuste fijo', a.porcentajeAjuste ? `${a.porcentajeAjuste}%` : null)}
        ${f('% de mora por día', a.pctMora ? `${a.pctMora}% (a partir del día ${DIA_LIMITE_PAGO})` : null)}
        ${f('Depósito', a.deposito ? fmtMoneda(a.deposito, a.moneda) : null)}
        ${f('Comisión', a.comision ? `${a.comision}%` : null)}
      `)}

      <div style="margin-bottom:1.25rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--primary);border-bottom:2px solid var(--primary);padding-bottom:.3rem;margin-bottom:.65rem">Inquilino</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.35rem .75rem">
          ${f('Nombre', inq?.nombre)}
          ${f('Teléfono / WhatsApp', a.inquilinoTelefono || inq?.telefono)}
          ${f('DNI / CUIT', a.inquilinoDni)}
          ${f('Domicilio', a.inquilinoDomicilio)}
          ${f('Email', inq?.email)}
        </div>
        ${wa('WhatsApp inquilino', waInq)}
      </div>

      ${garantes.map((g, i) => `
      <div style="margin-bottom:1.25rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--primary);border-bottom:2px solid var(--primary);padding-bottom:.3rem;margin-bottom:.65rem">Garante${garantes.length > 1 ? ` ${i + 1}` : ''}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.35rem .75rem">
          ${f('Nombre', g.nombre)}
          ${f('DNI / CUIT', g.dni)}
          ${f('Teléfono / WhatsApp', g.telefono)}
          ${f('Email', g.email)}
          ${f('Domicilio', g.domicilio)}
          ${f('Relación con inquilino', g.relacion)}
          ${f('Propiedad en garantía', g.propiedadGarantia)}
        </div>
        ${wa(`WhatsApp garante${garantes.length > 1 ? ` ${i + 1}` : ''}`, waUrl(g.telefono))}
      </div>`).join('')}

      ${a.notas ? `
      <div style="margin-bottom:1rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--primary);border-bottom:2px solid var(--primary);padding-bottom:.3rem;margin-bottom:.65rem">Notas</div>
        <div style="font-size:.85rem;white-space:pre-wrap">${esc(a.notas)}</div>
      </div>` : ''}`,
    footerHTML: `
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${waInq ? `<a href="${waInq}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.35rem;text-decoration:none">${icon('whatsapp')} Inquilino</a>` : ''}
        ${garantes.map((g, i) => { const url = waUrl(g.telefono); return url ? `<a href="${url}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.35rem;text-decoration:none">${icon('whatsapp')} Garante${garantes.length > 1 ? ` ${i + 1}` : ''}</a>` : ''; }).join('')}
      </div>
      <button class="btn btn-ghost" data-close>Cerrar</button>`,
    onMount({ overlay, close }) {
      overlay.querySelector('[data-close]')?.addEventListener('click', close);
    },
  });
}

function filaInline(label, val) {
  if (val === undefined || val === null || val === '' || val === '—') return '';
  return `<div style="padding:.3rem 0;font-size:.85rem;border-bottom:1px solid var(--border)">
    <span style="color:var(--text-soft);font-size:.73rem;display:block;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.1rem">${label}</span>
    <span style="font-weight:500">${esc(String(val))}</span>
  </div>`;
}

function mesLabel(mes) {
  const [y, m] = mes.split('-');
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${nombres[+m-1]} ${y}`;
}

/* Arma el texto del mensaje de WhatsApp para enviar el comprobante de un cobro. */
function textoReciboWA(a, cobro, prop) {
  const dir = prop?.direccion || 'la propiedad';
  const partes = [`Hola! Te confirmamos tu pago de alquiler de ${dir} — ${mesLabel(cobro.mes)}.`];
  partes.push(`Monto recibido: ${fmtMoneda(cobro.monto, a.moneda)}`);
  if (Number(cobro.saldoPendiente) > 0) {
    partes.push(`Corresponde el mes: ${fmtMoneda(cobro.montoEsperado, a.moneda)}`);
    partes.push(`Queda pendiente: ${fmtMoneda(cobro.saldoPendiente, a.moneda)}`);
  } else if (cobro.montoEsperado && Math.round(cobro.monto * 100) !== Math.round(cobro.montoEsperado * 100)) {
    partes.push('Saldo: cancelado ✅');
  }
  if (cobro.fechaPago) partes.push(`Fecha de pago: ${fmtFechaCorta(cobro.fechaPago)}`);
  partes.push('¡Gracias!');
  return partes.join('\n');
}
