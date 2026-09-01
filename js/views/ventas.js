/* ============================================================
   VISTA · Ventas — comercialización de propiedades marcadas
   para vender (se cargan siempre desde "Propiedades", tildando
   la casilla "Vender"). Acá se gestiona documentación, marketing,
   interesados e informes de esas propiedades.
   ============================================================ */
import { getState, sel, actions, subscribe } from '../store.js';
import { icon, PROP_ESTADOS, ESTADOS_DOCUMENTO, TIPOS_DOCUMENTO_VENTA, TIPOS_CONTACTO_INTERESADO } from '../config.js';
import { esc, fmtMoneda, fmtFechaCorta, debounce, waLink, compartirArchivoPorWhatsApp, avisoEnvioWhatsApp } from '../lib.js';
import { navegar } from '../router.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { imprimirInformeCaptacion, generarPDFInformeCaptacion } from '../imprimir.js?v=2';
import { openPropForm } from './forms.js';
import {
  openDocumentoForm, openComercializacionForm,
  openInteresadoForm, openContactoForm,
} from './ventasForms.js';

const colorIndice = (color) => color === 'green' ? 'var(--success)' : color === 'yellow' ? 'var(--warning)' : 'var(--danger)';

function fila(label, val) {
  if (val === undefined || val === null || val === '' || val === '—') return '';
  return `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;font-size:.875rem"><span class="text-soft" style="min-width:130px">${label}</span><span>${esc(String(val))}</span></div>`;
}

export default function ventas(root, param) {
  if (param) return propiedadVentaDetalle(root, param);
  root.innerHTML = `<div class="view" id="vVentas"></div>`;
  let tab = 'captaciones'; // 'captaciones' | 'interesados'
  let filtroEstado = '';
  let busqueda = '';

  const render = () => {
    const el = root.querySelector('#vVentas');
    const activo = el.querySelector('#buscarVentas');
    const conFoco = !!activo && activo === document.activeElement;
    const selStart = conFoco ? activo.selectionStart : null;
    const selEnd = conFoco ? activo.selectionEnd : null;
    pintarVentas(el, { tab, filtroEstado, busqueda });
    if (conFoco) {
      const nuevo = el.querySelector('#buscarVentas');
      if (nuevo) {
        nuevo.focus();
        nuevo.setSelectionRange(selStart, selEnd);
      }
    }
  };
  render();
  const unsub = subscribe(render);

  root.querySelector('#vVentas').addEventListener('click', (e) => {
    if (e.target.closest('#btnIrPropiedades, #btnIrPropiedades2')) {
      navegar('propiedades');
      toast('Cargá la propiedad y tildá la casilla "Vender" para que aparezca acá', { tipo: 'info' });
      return;
    }
    if (e.target.closest('#btnNuevoInteresado, #btnNuevoInteresado2')) { openInteresadoForm(null, () => {}); return; }

    const vt = e.target.closest('[data-tab]');
    if (vt) { tab = vt.dataset.tab; render(); return; }

    const fe = e.target.closest('[data-filtro-estado]');
    if (fe) { filtroEstado = fe.dataset.filtroEstado; render(); return; }

    const row = e.target.closest('[data-prop]');
    if (row) { navegar(`ventas/${row.dataset.prop}`); return; }

    const eliminarInt = e.target.closest('[data-eliminar-int]');
    if (eliminarInt) {
      if (confirm('¿Eliminar este interesado?')) actions.deleteInteresado(eliminarInt.dataset.eliminarInt);
      return;
    }
    const verInt = e.target.closest('[data-ver-int]');
    if (verInt) {
      const i = getState().interesados.find(x => x.id === verInt.dataset.verInt);
      if (i) abrirFichaInteresado(i);
      return;
    }
  });
  root.querySelector('#vVentas').addEventListener('input', debounce((e) => {
    if (e.target.id === 'buscarVentas') { busqueda = e.target.value.toLowerCase(); render(); }
  }, 150));

  return unsub;
}

/* ============================================================
   LISTA — pestañas Captaciones / Interesados
   ============================================================ */
function pintarVentas(el, { tab, filtroEstado, busqueda }) {
  const { interesados } = getState();
  const enVenta = sel.propiedadesEnVenta();
  const alertas = sel.alertasVentas();

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Ventas</h1>
        <p class="view-sub">${enVenta.length} propiedad${enVenta.length !== 1 ? 'es' : ''} en venta · ${interesados.length} interesado${interesados.length !== 1 ? 's' : ''}</p>
      </div>
      ${tab === 'interesados'
        ? `<button class="btn btn-primary" id="btnNuevoInteresado">${icon('plus')} Nuevo interesado</button>`
        : `<button class="btn btn-primary" id="btnIrPropiedades">${icon('home')} Cargar propiedad</button>`}
    </div>

    <div class="tabs" style="margin-bottom:1rem">
      <button class="tab ${tab==='captaciones'?'active':''}" data-tab="captaciones">Captaciones (${enVenta.length})</button>
      <button class="tab ${tab==='interesados'?'active':''}" data-tab="interesados">Interesados (${interesados.length})</button>
    </div>

    ${tab === 'captaciones' ? pintarCaptaciones(enVenta, filtroEstado, busqueda, alertas) : pintarInteresados(interesados, busqueda)}`;
}

function pintarCaptaciones(enVenta, filtroEstado, busqueda, alertas) {
  let lista = filtroEstado ? enVenta.filter(p => p.estado === filtroEstado) : enVenta;
  if (busqueda) {
    lista = lista.filter(p => `${p.direccion} ${p.ciudad||''} ${p.provincia||''}`.toLowerCase().includes(busqueda));
  }

  return `
    <p class="text-xs text-soft" style="margin-bottom:1rem">Las propiedades en venta se cargan desde <a href="#/propiedades" style="color:var(--primary)">Propiedades</a>, tildando la casilla "Vender". Acá se gestiona su documentación, marketing e interesados.</p>

    ${alertas.length ? `
    <div style="
      margin-bottom:1.25rem;padding:1rem 1.25rem;border-radius:var(--r-md);
      background:color-mix(in srgb,var(--warning) 12%,transparent);
      border:2px solid var(--warning);display:flex;align-items:center;gap:1rem;flex-wrap:wrap
    ">
      <div style="font-size:1.5rem">🔔</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:.95rem">${alertas.length} alerta${alertas.length!==1?'s':''} en propiedades en venta</div>
        <div style="font-size:.82rem;color:var(--text-soft);margin-top:.2rem">
          ${alertas.slice(0, 3).map(a => `${esc(a.propiedad.direccion)}: ${esc(a.mensaje)}`).join(' · ')}${alertas.length > 3 ? '…' : ''}
        </div>
      </div>
    </div>` : ''}

    <div class="toolbar">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="buscarVentas" placeholder="Buscar por dirección o ciudad…" value="${esc(busqueda)}">
      </div>
    </div>

    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1.5rem">
      <button data-filtro-estado="" style="border:1.5px solid;border-radius:var(--r-full);padding:.3rem .85rem;font-size:.78rem;font-weight:600;cursor:pointer;${filtroEstado===''?'background:var(--primary);color:var(--on-primary);border-color:var(--primary)':'background:var(--surface);color:var(--text);border-color:var(--border)'}">Todas</button>
      ${PROP_ESTADOS.map(e => `
        <button data-filtro-estado="${e.id}" style="border:1.5px solid;border-radius:var(--r-full);padding:.3rem .85rem;font-size:.78rem;font-weight:600;cursor:pointer;${filtroEstado===e.id?'background:var(--primary);color:var(--on-primary);border-color:var(--primary)':'background:var(--surface);color:var(--text);border-color:var(--border)'}">${e.label}</button>`).join('')}
    </div>

    ${lista.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
      ${lista.map(p => {
        const estadoObj = PROP_ESTADOS.find(e => e.id === p.estado);
        const indice = sel.indiceVendibilidad(p);
        const alertasProp = sel.alertasVenta(p);
        return `
        <div class="card list-row-hover" data-prop="${p.id}" style="cursor:pointer;padding:1rem 1.1rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;margin-bottom:.4rem">
            <div style="min-width:0">
              <div class="list-name" style="font-size:.95rem">${esc(p.direccion || 'Sin dirección')}</div>
              <div class="text-xs text-soft truncate">${esc(p.tipo||'')}${p.ciudad?' · '+esc(p.ciudad):''}</div>
            </div>
            <span class="badge ${estadoObj?.badge||'badge-neutral'}" style="flex-shrink:0">${estadoObj?.label||p.estado}</span>
          </div>
          <div style="font-size:.9rem;font-weight:700;margin-bottom:.6rem">${p.precioVenta ? fmtMoneda(p.precioVenta, p.monedaVenta||'USD') : 'Sin precio publicado'}</div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <div style="flex:1;height:7px;border-radius:999px;background:var(--surface-2);overflow:hidden">
              <div style="height:100%;width:${indice.score}%;background:${colorIndice(indice.color)};border-radius:999px"></div>
            </div>
            <span style="font-size:.72rem;font-weight:700;color:${colorIndice(indice.color)}">${indice.score}</span>
          </div>
          ${alertasProp.length ? `<div style="margin-top:.6rem"><span class="badge badge-warning" style="font-size:.68rem">🔔 ${alertasProp.length} alerta${alertasProp.length!==1?'s':''}</span></div>` : ''}
        </div>`;
      }).join('')}
    </div>` : `
    <div class="empty">
      ${icon('building')}
      <h3>No hay propiedades en venta${busqueda||filtroEstado?' con ese criterio':''}</h3>
      <p>Cargá la propiedad desde "Propiedades" y tildá la casilla "Vender".</p>
      <button class="btn btn-primary" id="btnIrPropiedades2">${icon('home')} Ir a Propiedades</button>
    </div>`}`;
}

function pintarInteresados(interesados, busqueda) {
  let lista = interesados;
  if (busqueda) {
    lista = lista.filter(i => `${i.nombre} ${i.localidad||''} ${i.telefono||''}`.toLowerCase().includes(busqueda));
  }

  return `
    <div class="toolbar">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="buscarVentas" placeholder="Buscar por nombre, localidad o teléfono…" value="${esc(busqueda)}">
      </div>
    </div>

    ${lista.length ? `
    <div class="card" style="padding:0">
      ${lista.map(i => {
        const nProps = (i.propiedadesIds||[]).length;
        const ultimoContacto = [...(i.contactos||[])].sort((a,b) => `${b.fecha}`.localeCompare(`${a.fecha}`))[0];
        return `
        <div class="list-row list-row-hover" data-ver-int="${i.id}" style="cursor:pointer">
          <div class="list-info" style="flex:1;min-width:0">
            <div class="list-name">${esc(i.nombre)}</div>
            <div class="text-xs text-soft truncate">
              ${[i.telefono, i.localidad, i.tipoBuscado, i.presupuesto ? fmtMoneda(i.presupuesto, i.moneda) : null].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">
            ${nProps ? `<span class="badge badge-info" style="font-size:.68rem">${nProps} propiedad${nProps!==1?'es':''}</span>` : ''}
            ${ultimoContacto ? `<span class="text-xs text-soft">Últ. contacto ${fmtFechaCorta(ultimoContacto.fecha)}</span>` : ''}
            <button class="btn btn-xs btn-ghost" data-eliminar-int="${i.id}" title="Eliminar" style="color:var(--danger)">${icon('trash')}</button>
          </div>
        </div>`;
      }).join('')}
    </div>` : `
    <div class="empty">
      ${icon('users')}
      <h3>No hay interesados${busqueda?' con ese criterio':''}</h3>
      <p>Cargá tu primer interesado/lead.</p>
      <button class="btn btn-primary" id="btnNuevoInteresado2">${icon('plus')} Nuevo interesado</button>
    </div>`}`;
}

/* ============================================================
   FICHA DE INTERESADO (modal con historial de contactos)
   ============================================================ */
function abrirFichaInteresado(interesadoInicial) {
  let ctx;
  const cuerpo = () => {
    const i = getState().interesados.find(x => x.id === interesadoInicial.id) || interesadoInicial;
    const { propiedades } = getState();
    const props = (i.propiedadesIds || []).map(id => propiedades.find(p => p.id === id)).filter(Boolean);
    const contactos = [...(i.contactos || [])].sort((a, b) => `${b.fecha} ${b.hora||''}`.localeCompare(`${a.fecha} ${a.hora||''}`));

    return `
      <div style="margin-bottom:1rem">
        ${fila('Teléfono', i.telefono)}
        ${fila('WhatsApp', i.whatsapp)}
        ${fila('Email', i.email)}
        ${fila('Ubicación', [i.localidad, i.provincia].filter(Boolean).join(', '))}
        ${fila('Presupuesto', i.presupuesto ? fmtMoneda(i.presupuesto, i.moneda) : null)}
        ${fila('Tipo buscado', i.tipoBuscado)}
        ${fila('Origen', i.origen)}
        ${fila('Necesidades', i.necesidades)}
        ${fila('Observaciones', i.observaciones)}
      </div>
      ${props.length ? `
      <div style="margin-bottom:1rem">
        <div class="form-section-title">Propiedades de interés</div>
        ${props.map(p => `<span class="badge badge-info" style="margin-right:.3rem;margin-bottom:.3rem;display:inline-block;cursor:pointer" data-ir-prop="${p.id}">${esc(p.direccion)}</span>`).join('')}
      </div>` : ''}
      <div class="form-section-title">Historial de contactos</div>
      <div style="max-height:260px;overflow-y:auto;margin-bottom:.75rem">
        ${contactos.length ? contactos.map(cto => {
          const tipoObj = TIPOS_CONTACTO_INTERESADO.find(t => t.id === cto.tipo);
          return `
          <div class="list-row" style="align-items:flex-start;gap:.6rem">
            <div class="timeline-dot"></div>
            <div style="flex:1">
              <div class="text-xs text-soft">${fmtFechaCorta(cto.fecha)}${cto.hora ? ' · ' + esc(cto.hora) : ''}${cto.usuario ? ' · ' + esc(cto.usuario) : ''}</div>
              <div style="font-size:.875rem;margin-top:.15rem"><strong>${tipoObj?.label || cto.tipo}</strong>${cto.observaciones ? ' — ' + esc(cto.observaciones) : ''}</div>
            </div>
            <button class="btn btn-xs btn-ghost" data-eliminar-cto="${cto.id}" title="Eliminar" style="color:var(--danger)">${icon('trash')}</button>
          </div>`;
        }).join('') : `<div class="empty-sm">Sin contactos registrados</div>`}
      </div>
      <button class="btn btn-sm btn-ghost" id="btnNuevoContactoFicha">${icon('plus')} Registrar contacto</button>
    `;
  };

  const wire = () => {
    ctx.body.querySelector('#btnNuevoContactoFicha')?.addEventListener('click', () => {
      openContactoForm(interesadoInicial.id, refresh);
    });
    ctx.body.querySelectorAll('[data-eliminar-cto]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este contacto?')) return;
        await actions.deleteContactoInteresado(interesadoInicial.id, btn.dataset.eliminarCto);
        refresh();
      });
    });
    ctx.body.querySelectorAll('[data-ir-prop]').forEach(b => {
      b.addEventListener('click', () => { ctx.close(); navegar(`ventas/${b.dataset.irProp}`); });
    });
  };
  const refresh = () => { ctx.body.innerHTML = cuerpo(); wire(); };

  ctx = openModal({
    title: interesadoInicial.nombre,
    size: 'lg',
    bodyHTML: cuerpo(),
    footerHTML: `<button class="btn btn-ghost" data-close>Cerrar</button><button class="btn btn-primary" id="btnEditarFicha">Editar</button>`,
    onMount(c) {
      wire();
      c.overlay.querySelector('#btnEditarFicha').addEventListener('click', () => {
        c.close();
        openInteresadoForm(interesadoInicial, () => {});
      });
    }
  });
}

/* ============================================================
   DETALLE DE PROPIEDAD EN VENTA
   ============================================================ */
async function propiedadVentaDetalle(root, id) {
  root.innerHTML = `<div class="view" id="vCapDet"></div>`;
  const render = () => pintarPropiedadVentaDetalle(root.querySelector('#vCapDet'), id);
  render();
  return subscribe(render);
}

function pintarPropiedadVentaDetalle(el, id) {
  const p = sel.propiedad(id);
  if (!p) { el.innerHTML = `<div class="view"><div class="empty"><h3>Propiedad no encontrada</h3><button class="btn btn-ghost" onclick="history.back()">Volver</button></div></div>`; return; }

  const estadoObj = PROP_ESTADOS.find(e => e.id === p.estado);
  const indice = sel.indiceVendibilidad(p);
  const recomendaciones = sel.recomendacionesVenta(p);
  const alertas = sel.alertasVenta(p);
  const interesadosVinc = sel.interesadosDePropiedad(p.id);
  const { interesados, propietarios, clientes } = getState();
  const interesadosDisponibles = interesados.filter(i => !(i.propiedadesIds || []).includes(p.id));
  // Clientes que ya son inquilinos/compradores cargados y todavía no figuran como interesados en esta propiedad
  // (si el cliente ya tiene un interesado vinculado en otra propiedad, se reutiliza ese registro en vez de duplicarlo).
  const clientesVinculablesComoInteresado = [...clientes]
    .filter(c => !interesadosVinc.some(i => i.clienteId === c.id))
    .sort((a, b) => (a.nombre||'').localeCompare(b.nombre||'', 'es'));
  const propietario = propietarios.find(x => x.id === p.propietarioId);

  el.innerHTML = `
    <div class="view-head">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" onclick="history.back()">${icon('x')}</button>
        <div>
          <h1 class="view-title">${esc(p.direccion || 'Propiedad')}</h1>
          <p class="view-sub">
            <span class="badge ${estadoObj?.badge||'badge-neutral'}">${estadoObj?.label||p.estado}</span>
            ${p.tipo ? ' · ' + esc(p.tipo) : ''}${p.ciudad ? ' · ' + esc(p.ciudad) : ''}
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" id="btnVerEnPropiedades">${icon('home')} Ver en Propiedades</button>
        <button class="btn btn-ghost" id="btnEditarCap">${icon('edit')} Editar</button>
      </div>
    </div>

    ${!p.habilitadaVenta ? `
    <div style="margin-bottom:1.25rem;padding:.85rem 1.1rem;border-radius:var(--r-md);background:var(--surface-2);border:1px solid var(--border);font-size:.85rem;color:var(--text-soft)">
      Esta propiedad ya no está marcada para la venta — no aparece en el listado de Captaciones.
    </div>` : ''}

    ${alertas.length ? `
    <div style="
      margin-bottom:1.25rem;padding:1rem 1.25rem;border-radius:var(--r-md);
      background:color-mix(in srgb,var(--warning) 12%,transparent);
      border:2px solid var(--warning)
    ">
      <div style="font-weight:700;font-size:.95rem;margin-bottom:.4rem">🔔 Alertas</div>
      ${alertas.map(a => `<div style="font-size:.82rem;color:${a.urgente?'var(--danger)':'var(--text-soft)'};margin-bottom:.2rem">${a.urgente?'⚠️ ':''}${esc(a.mensaje)}</div>`).join('')}
      ${p.ultimoContactoPropietario ? '' : `<button class="btn btn-xs btn-ghost" id="btnRegistrarContactoProp" style="margin-top:.4rem">Marcar contacto con propietario hoy</button>`}
    </div>` : ''}

    <div class="two-col-grid">
      <!-- Índice de vendibilidad -->
      <div class="card">
        <div class="card-head"><h3>📊 Índice de vendibilidad</h3></div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
            <div style="flex:1;height:14px;border-radius:999px;background:var(--surface-2);overflow:hidden">
              <div style="height:100%;width:${indice.score}%;background:${colorIndice(indice.color)};border-radius:999px;transition:width .3s"></div>
            </div>
            <span style="font-size:1.3rem;font-weight:800;color:${colorIndice(indice.color)}">${indice.score}</span>
          </div>
          ${indice.factores.map(f => `
            <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:.35rem">
              <span class="text-soft">${f.label} <span style="opacity:.7">(${f.detalle})</span></span>
              <strong>${f.puntos}/${f.max}</strong>
            </div>`).join('')}
        </div>
      </div>

      <!-- Recomendaciones -->
      <div class="card">
        <div class="card-head"><h3>💡 Recomendaciones</h3></div>
        <div class="card-body">
          <ul style="margin:0;padding-left:1.1rem;font-size:.875rem">
            ${recomendaciones.map(r => `<li style="margin-bottom:.4rem">${esc(r)}</li>`).join('')}
          </ul>
        </div>
      </div>

      <!-- Datos generales -->
      <div class="card">
        <div class="card-head"><h3>Datos generales</h3></div>
        <div class="card-body">
          ${fila('Tipo', p.tipo)}
          ${fila('Ciudad', p.ciudad)}
          ${fila('Provincia', p.provincia)}
          ${p.mapsUrl ? `<div style="margin-bottom:.5rem"><a href="${esc(p.mapsUrl)}" target="_blank" class="text-xs" style="color:var(--primary)">📍 Ver en Google Maps</a></div>` : ''}
          ${fila('Ambientes', p.ambientes)}
          ${fila('Baños', p.banos)}
          ${p.m2 ? fila('Superficie', `${p.m2} m²${p.m2Cubiertos ? ` (${p.m2Cubiertos} m² cubiertos)` : ''}`) : ''}
          ${fila('Antigüedad', p.antiguedad ? `${p.antiguedad} años` : null)}
          ${fila('Comodidades', (p.amenities||[]).join(', '))}
          ${fila('Estado de conservación', p.estadoConservacion)}
          ${fila('Propietario flexible', p.flexiblePropietario ? 'Sí' : null)}
          ${p.descripcion ? `<div style="margin-top:.5rem;padding:.75rem;background:var(--bg-soft);border-radius:var(--radius-sm);font-size:.85rem"><strong>Descripción:</strong><br>${esc(p.descripcion)}</div>` : ''}
          ${p.descripcionAds ? `<div style="margin-top:.5rem;padding:.75rem;background:var(--bg-soft);border-radius:var(--radius-sm);font-size:.85rem"><strong>Descripción para publicaciones:</strong><br>${esc(p.descripcionAds)}</div>` : ''}
        </div>
      </div>

      <!-- Información comercial -->
      <div class="card">
        <div class="card-head"><h3>Información comercial</h3></div>
        <div class="card-body">
          ${fila('Precio de venta', p.precioVenta ? fmtMoneda(p.precioVenta, p.monedaVenta) : null)}
          ${fila('Expensas', p.expensas ? fmtMoneda(p.expensas, 'ARS') + '/mes' : null)}
          ${fila('Comisión inmobiliaria', p.comisionInmobiliaria ? p.comisionInmobiliaria + '%' : null)}
          ${fila('Comisión vendedor', p.comisionVendedor ? p.comisionVendedor + '%' : null)}
          ${fila('Comisión comprador', p.comisionComprador ? p.comisionComprador + '%' : null)}
          ${fila('Fecha de publicación', fmtFechaCorta(p.fechaPublicacionVenta))}
          ${fila('Exclusividad', p.exclusividad === 'compartida' ? 'Compartida con otra inmobiliaria' : p.exclusividad === 'exclusiva' ? 'Exclusiva' : null)}
          ${fila('Vencimiento autorización', fmtFechaCorta(p.fechaVencimientoAutorizacion))}
          ${fila('Plazo de comercialización', p.plazoComercializacion === 'personalizado' ? `${p.plazoComercializacionDias||'—'} días` : p.plazoComercializacion ? `${p.plazoComercializacion} días` : null)}
        </div>
      </div>

      <!-- Propietario -->
      <div class="card">
        <div class="card-head"><h3>Propietario</h3></div>
        <div class="card-body" style="padding:0">
          ${propietario ? `
            <div style="padding:.85rem 1.25rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem">
              <div style="min-width:0">
                <div class="list-name" style="font-size:.875rem">${esc(propietario.nombre || 'Sin nombre')}</div>
                <div class="text-xs text-soft truncate">${[propietario.dni && 'DNI '+propietario.dni, propietario.telefono, propietario.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
              </div>
              ${propietario.telefono ? `<a href="https://wa.me/${propietario.telefono.replace(/\D/g,'')}" target="_blank" class="btn btn-xs btn-ghost" style="flex-shrink:0" title="WhatsApp">${icon('whatsapp')}</a>` : ''}
            </div>` : `<div class="empty-sm">Sin propietario asignado</div>`}
        </div>
        <div class="card-body" style="padding-top:0">
          <p class="text-xs text-soft">Para modificar el/los propietario(s), editá la propiedad.</p>
        </div>
      </div>

      <!-- Documentos -->
      <div class="card">
        <div class="card-head"><h3>${icon('file')} Documentación</h3></div>
        <div class="card-body" style="padding:0">
          ${renderDocumentosChecklist(p)}
        </div>
      </div>

      <!-- Comercialización -->
      <div class="card">
        <div class="card-head">
          <h3>${icon('trending')} Comercialización</h3>
          <button class="btn btn-sm btn-primary" id="btnNuevaAccionMkt">${icon('plus')} Registrar</button>
        </div>
        <div class="card-body" style="padding:0">
          ${(p.comercializacion||[]).length ? [...(p.comercializacion||[])].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).map(m => `
            <div class="list-row">
              <div class="list-info" style="flex:1">
                <div class="list-name" style="font-size:.875rem">${esc(m.accion)}</div>
                <div class="text-xs text-soft">${fmtFechaCorta(m.fecha)}${m.presupuesto ? ' · ' + fmtMoneda(m.presupuesto, 'ARS') : ''}${m.fechaInicio ? ' · ' + fmtFechaCorta(m.fechaInicio) + '→' + fmtFechaCorta(m.fechaFin) : ''}</div>
              </div>
              <button class="btn btn-xs btn-ghost" data-editar-mkt="${m.id}" title="Editar">${icon('edit')}</button>
              <button class="btn btn-xs btn-ghost" data-eliminar-mkt="${m.id}" title="Eliminar" style="color:var(--danger)">${icon('trash')}</button>
            </div>`).join('') : `<div class="empty-sm">Sin acciones de comercialización registradas</div>`}
        </div>
      </div>

      <!-- Interesados vinculados -->
      <div class="card">
        <div class="card-head"><h3>${icon('users')} Interesados vinculados</h3></div>
        <div class="card-body" style="padding:0">
          ${interesadosVinc.length ? interesadosVinc.map(i => `
            <div class="list-row list-row-hover" data-ver-int-det="${i.id}" style="cursor:pointer">
              <div class="list-info" style="flex:1">
                <div class="list-name" style="font-size:.875rem">${esc(i.nombre)}${i.clienteId ? ' <span class="badge badge-info" style="font-size:.62rem">Cliente</span>' : ''}</div>
                <div class="text-xs text-soft">${[i.telefono, i.presupuesto ? fmtMoneda(i.presupuesto, i.moneda) : null].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <button class="btn btn-xs btn-ghost" data-desvincular-int="${i.id}" title="Desvincular" style="color:var(--danger)">${icon('x')}</button>
            </div>`).join('') : `<div class="empty-sm">Sin interesados vinculados todavía</div>`}
        </div>
        <div class="card-body" style="display:flex;gap:.5rem;padding-top:0;flex-wrap:wrap">
          <select id="selVincularInt" style="flex:1;min-width:200px">
            <option value="">— Vincular interesado o cliente —</option>
            ${interesadosDisponibles.length ? `<optgroup label="Interesados (leads)">
              ${interesadosDisponibles.map(i => `<option value="int:${i.id}">${esc(i.nombre)}</option>`).join('')}
            </optgroup>` : ''}
            ${clientesVinculablesComoInteresado.length ? `<optgroup label="Clientes ya cargados (Inquilinos)">
              ${clientesVinculablesComoInteresado.map(c => `<option value="cli:${c.id}">${esc(c.nombre)}</option>`).join('')}
            </optgroup>` : ''}
          </select>
          <button class="btn btn-sm btn-ghost" id="btnVincularInt">Vincular</button>
        </div>
        <div class="card-body" style="padding-top:0">
          <small class="text-soft">¿No está en la lista? Un cliente nuevo se carga primero como interesado desde la pestaña "Interesados" de Ventas.</small>
        </div>
      </div>

      <!-- Informes -->
      <div class="card">
        <div class="card-head" style="flex-wrap:wrap;gap:.5rem">
          <h3>${icon('download')} Informes</h3>
          <div style="display:flex;gap:.4rem">
            <button class="btn btn-sm btn-ghost" id="btnCompartirWA">${icon('whatsapp')} WhatsApp</button>
            <button class="btn btn-sm btn-primary" id="btnGenerarInforme">${icon('plus')} Generar</button>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          ${(p.informes||[]).length ? (p.informes||[]).map(i => `
            <div class="list-row">
              <div class="list-info">
                <div class="list-name" style="font-size:.875rem">Informe del ${fmtFechaCorta(i.fecha)}</div>
                <div class="text-xs text-soft">Período ${fmtFechaCorta(i.periodoDesde)} — ${fmtFechaCorta(i.periodoHasta)} · Índice: ${i.indiceScore}/100</div>
              </div>
            </div>`).join('') : `<div class="empty-sm">Sin informes generados todavía</div>`}
        </div>
      </div>

    </div>

    <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;gap:1rem;flex-wrap:wrap">
      ${p.habilitadaVenta ? `<button class="btn btn-ghost" id="btnDejarVender">${icon('x')} Dejar de vender esta propiedad</button>` : ''}
    </div>`;

  /* ── Eventos ─────────────────────────────────────────── */
  el.querySelector('#btnVerEnPropiedades')?.addEventListener('click', () => navegar(`propiedades/${p.id}`));
  el.querySelector('#btnEditarCap')?.addEventListener('click', () => openPropForm(p, () => {}));
  el.querySelector('#btnDejarVender')?.addEventListener('click', async () => {
    if (!confirm('¿Dejar de vender esta propiedad? Ya no va a aparecer en el listado de Captaciones (la propiedad no se elimina).')) return;
    await actions.updatePropiedad(id, { habilitadaVenta: false });
    navegar('ventas');
  });
  el.querySelector('#btnRegistrarContactoProp')?.addEventListener('click', async () => {
    await actions.updatePropiedad(id, { ultimoContactoPropietario: new Date().toISOString().slice(0, 10) });
    toast('Contacto con el propietario registrado');
  });

  // Documentos
  el.querySelectorAll('[data-agregar-doc]').forEach(btn => {
    btn.addEventListener('click', () => openDocumentoForm(id, null, () => {}, { tipo: btn.dataset.agregarDoc }));
  });
  el.querySelectorAll('[data-editar-doc]').forEach(btn => {
    btn.addEventListener('click', () => {
      const doc = (p.documentos || []).find(d => d.id === btn.dataset.editarDoc);
      if (doc) openDocumentoForm(id, doc, () => {});
    });
  });
  el.querySelectorAll('[data-eliminar-doc]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('¿Eliminar este documento?')) actions.deleteDocumentoPropiedad(id, btn.dataset.eliminarDoc);
    });
  });

  // Comercialización
  el.querySelector('#btnNuevaAccionMkt')?.addEventListener('click', () => openComercializacionForm(id, null, () => {}));
  el.querySelectorAll('[data-editar-mkt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = (p.comercializacion || []).find(x => x.id === btn.dataset.editarMkt);
      if (m) openComercializacionForm(id, m, () => {});
    });
  });
  el.querySelectorAll('[data-eliminar-mkt]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('¿Eliminar esta acción?')) actions.deleteComercializacionPropiedad(id, btn.dataset.eliminarMkt);
    });
  });

  // Interesados vinculados
  el.querySelectorAll('[data-ver-int-det]').forEach(row => {
    row.addEventListener('click', () => {
      const i = getState().interesados.find(x => x.id === row.dataset.verIntDet);
      if (i) abrirFichaInteresado(i);
    });
  });
  el.querySelectorAll('[data-desvincular-int]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const i = getState().interesados.find(x => x.id === btn.dataset.desvincularInt);
      if (!i) return;
      await actions.updateInteresado(i.id, { propiedadesIds: (i.propiedadesIds || []).filter(x => x !== id) });
    });
  });
  el.querySelector('#btnVincularInt')?.addEventListener('click', async () => {
    const sel2 = el.querySelector('#selVincularInt');
    const val = sel2.value;
    if (!val) { toast('Elegí un interesado o cliente para vincular', { tipo: 'warning' }); return; }
    const [tipo, valId] = val.split(':');
    if (tipo === 'int') {
      const i = getState().interesados.find(x => x.id === valId);
      if (!i) return;
      await actions.updateInteresado(valId, { propiedadesIds: [...(i.propiedadesIds || []), id] });
    } else if (tipo === 'cli') {
      const c = getState().clientes.find(x => x.id === valId);
      if (!c) return;
      // Reutiliza un interesado ya creado para este cliente (aunque sea de otra propiedad) en vez de duplicarlo.
      const yaExiste = getState().interesados.find(x => x.clienteId === c.id);
      if (yaExiste) {
        await actions.updateInteresado(yaExiste.id, { propiedadesIds: [...(yaExiste.propiedadesIds || []), id] });
      } else {
        await actions.createInteresado({
          nombre: c.nombre, telefono: c.telefono || '', email: c.email || '',
          clienteId: c.id, propiedadesIds: [id],
        });
      }
    }
    toast('Vinculado como interesado');
  });

  // Informes
  const periodoInforme = () => {
    const hasta = new Date().toISOString().slice(0, 10);
    const dias = p.frecuenciaInformeDias ? Number(p.frecuenciaInformeDias) : 30;
    const ultimoInforme = (p.informes || [])[0];
    const desde = ultimoInforme
      ? (ultimoInforme.periodoHasta || ultimoInforme.fecha || hasta).slice(0, 10)
      : new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    return { desde, hasta };
  };

  el.querySelector('#btnGenerarInforme')?.addEventListener('click', async () => {
    const { desde, hasta } = periodoInforme();
    const stats = computarStatsInforme(p, desde, hasta);
    imprimirInformeCaptacion({ captacion: p, periodoDesde: desde, periodoHasta: hasta, stats });
    await actions.addInformePropiedad(id, { periodoDesde: desde, periodoHasta: hasta, indiceScore: stats.indice.score });
    toast('Informe generado');
  });
  el.querySelector('#btnCompartirWA')?.addEventListener('click', async () => {
    const tel = propietario?.telefono;
    if (!tel) { toast('Cargá el teléfono del propietario para compartir por WhatsApp', { tipo: 'warning' }); return; }
    const texto = `Hola${propietario.nombre ? ' ' + propietario.nombre : ''}, te comparto el estado de comercialización de ${p.direccion}. Índice de vendibilidad actual: ${indice.score}/100.`;
    try {
      const { desde, hasta } = periodoInforme();
      const stats = computarStatsInforme(p, desde, hasta);
      const blob = await generarPDFInformeCaptacion({ captacion: p, periodoDesde: desde, periodoHasta: hasta, stats });
      const resultado = await compartirArchivoPorWhatsApp({ numero: tel, texto, archivo: blob, nombreArchivo: `informe-${p.direccion || 'propiedad'}.pdf` });
      const { msg, ...opts } = avisoEnvioWhatsApp(resultado, 'el informe');
      toast(msg, opts);
    } catch (err) {
      console.error(err);
      toast('No se pudo generar el PDF para compartir por WhatsApp', { tipo: 'danger' });
    }
  });
}

/* Checklist de documentos: recorre los tipos sugeridos + los custom que se hayan cargado */
function renderDocumentosChecklist(p) {
  const docs = p.documentos || [];
  const usados = new Set();
  const filaDoc = (tipoLabel, d) => {
    const estadoObj = ESTADOS_DOCUMENTO.find(e => e.id === (d?.estado || 'faltante'));
    return `
      <div class="list-row">
        <div class="list-info" style="flex:1;min-width:0">
          <div class="list-name" style="font-size:.875rem">${estadoObj?.simbolo || '❌'} ${esc(tipoLabel)}</div>
          ${d?.nombreArchivo ? `<div class="text-xs text-soft">📎 ${esc(d.nombreArchivo)}</div>` : ''}
        </div>
        <span class="badge ${estadoObj?.badge || 'badge-danger'}">${estadoObj?.label || 'Faltante'}</span>
        <div style="display:flex;gap:.2rem;flex-shrink:0;margin-left:.5rem">
          ${d
            ? `<button class="btn btn-xs btn-ghost" data-editar-doc="${d.id}" title="Editar">${icon('edit')}</button>
               <button class="btn btn-xs btn-ghost" data-eliminar-doc="${d.id}" title="Eliminar" style="color:var(--danger)">${icon('trash')}</button>`
            : `<button class="btn btn-xs btn-ghost" data-agregar-doc="${esc(tipoLabel)}">${icon('plus')} Agregar</button>`}
        </div>
      </div>`;
  };

  const sugeridos = TIPOS_DOCUMENTO_VENTA.map(tipo => {
    const d = docs.find(x => x.tipo.toLowerCase() === tipo.toLowerCase());
    if (d) usados.add(d.id);
    return filaDoc(tipo, d);
  }).join('');

  const extras = docs.filter(d => !usados.has(d.id)).map(d => filaDoc(d.tipo, d)).join('');

  return sugeridos + extras;
}

/* Calcula las estadísticas del período para el informe al propietario */
function computarStatsInforme(p, desde, hasta) {
  const interesadosVinc = sel.interesadosDePropiedad(p.id);
  let consultas = 0, visitas = 0, ofertas = 0;
  interesadosVinc.forEach(i => {
    (i.contactos || []).forEach(cto => {
      if (cto.propiedadId && cto.propiedadId !== p.id) return;
      if (!cto.fecha || cto.fecha < desde || cto.fecha > hasta) return;
      if (cto.tipo === 'visita') visitas++;
      else if (cto.tipo === 'oferta' || cto.tipo === 'contraoferta') ofertas++;
      else consultas++;
    });
  });

  const mkt = p.comercializacion || [];
  const accionesMkt = mkt.filter(m => m.fecha && m.fecha >= desde && m.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const canalesActivos = [...new Set(mkt.map(m => m.accion))];
  const metaAdsActivas = mkt.filter(m => m.accion === 'Publicidad Meta Ads' && m.fechaInicio && m.fechaFin);

  return {
    consultas, visitas, ofertas, accionesMkt, canalesActivos, metaAdsActivas,
    indice: sel.indiceVendibilidad(p),
    recomendaciones: sel.recomendacionesVenta(p),
  };
}
