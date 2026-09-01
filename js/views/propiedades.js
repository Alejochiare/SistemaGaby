/* ============================================================
   VISTA · Propiedades — catálogo con estado
   ============================================================ */
import { getState, sel, actions, subscribe } from '../store.js';
import { icon, PROP_ESTADOS } from '../config.js';
import { esc, fmtMoneda, debounce } from '../lib.js';
import { navegar } from '../router.js';
import { openPropForm } from './forms.js';
import { openModal } from '../components/modal.js';

function operacionesProp(p) {
  const ops = [];
  
  // No mostrar operaciones si la propiedad está en otro estado
  if (p.estado === 'alquilada' || p.estado === 'vendida') {
    return ops;
  }
  
  // Si está disponible, mostrar qué puede hacerse
  if (p.habilitadaAlquiler || p.precioAlquiler) ops.push('Alquiler');
  if (p.habilitadaTemporal) ops.push('Alquiler temporario');
  if (p.habilitadaVenta || p.precioVenta) ops.push('Venta');
  return ops;
}

function resumenMatchCliente(c) {
  const b = c.busca || {};
  const partes = [];
  if (b.zona) partes.push(b.zona);
  if (b.ambientes) partes.push(`${b.ambientes}+ amb.`);
  if (b.presupuesto) partes.push(`${b.moneda||''} ${Number(b.presupuesto).toLocaleString('es-AR')}`);
  return partes.join(' · ') || (c.interes === 'alquiler' ? 'Busca alquiler' : 'Busca compra');
}

export default function propiedades(root, param) {
  if (param) return propDetalle(root, param);
  root.innerHTML = `<div class="view" id="vProps"></div>`;
  let filtro = '';
  let estadoFiltro = '';

  const render = () => pintarLista(root.querySelector('#vProps'), filtro, estadoFiltro);
  render();
  const unsub = subscribe(render);

  root.querySelector('#vProps').addEventListener('input', debounce((e) => {
    if (e.target.id === 'buscarProp') {
      filtro = e.target.value.toLowerCase();
      const pos = e.target.selectionStart;
      render();
      const inp = root.querySelector('#buscarProp');
      if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    }
  }, 150));

  root.querySelector('#vProps').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro-estado]');
    if (btn) { estadoFiltro = btn.dataset.filtroEstado; render(); }
  });

  return unsub;
}

function pintarLista(el, filtro, estadoFiltro) {
  const { propiedades } = getState();
  let lista = propiedades.filter(p => {
    const ok = !filtro || `${p.direccion} ${p.barrio||''} ${p.ciudad||''} ${p.tipo||''} ${p.numeroCarpeta||''}`.toLowerCase().includes(filtro);
    const okE = !estadoFiltro || p.estado === estadoFiltro;
    return ok && okE;
  });

  const FILTROS = [
    { id: '',            label: 'Todas' },
    { id: 'disponible',  label: 'Para alquilar / vender' },
    { id: 'alquilada',   label: 'Alquiladas' },
    { id: 'vendida',     label: 'Vendidas' },
  ];

  const pillStyle = (activo) => activo
    ? 'background:var(--primary);color:var(--on-primary);border-color:var(--primary)'
    : 'background:var(--surface);color:var(--text);border-color:var(--border)';

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Propiedades</h1>
        <p class="view-sub">${propiedades.length} en total · ${lista.length} mostradas</p>
      </div>
      <button class="btn btn-primary" id="btnNuevaProp">${icon('plus')} Nueva propiedad</button>
    </div>

    <div class="toolbar" style="flex-wrap:wrap;gap:.6rem">
      <div class="search-bar" style="flex:1;min-width:200px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="buscarProp" placeholder="Buscar por dirección, ciudad, tipo, N° de carpeta…" value="${esc(filtro)}">
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">
        ${FILTROS.map(f => `
          <button data-filtro-estado="${f.id}" style="border:1.5px solid;border-radius:var(--r-full);padding:.3rem .85rem;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s;${pillStyle(estadoFiltro===f.id)}">
            ${f.label}
          </button>`).join('')}
      </div>
    </div>

    ${lista.length ? `
    <div class="prop-grid">
      ${lista.map(p => {
        const est     = PROP_ESTADOS.find(e => e.id === p.estado);
        const matches = sel.matchClientesPara(p).slice(0, 4); // top 4 en la tarjeta
        return `
          <div class="prop-card" data-id="${p.id}" style="cursor:pointer">
            <div class="prop-card-head">
              <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
                <span class="badge ${est?.badge || 'badge-neutral'}">${est?.label || p.estado}</span>
                ${p.numeroCarpeta ? `<span class="badge badge-neutral" title="N° de carpeta">📁 ${esc(p.numeroCarpeta)}</span>` : ''}
              </div>
              <button class="btn btn-xs btn-edit-prop" data-id="${p.id}" title="Editar" onclick="event.stopPropagation()" style="background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2)">${icon('edit')}</button>
            </div>
            <div class="prop-card-body">
              <div class="prop-tipo" style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
                <span>${esc(p.tipo || 'Propiedad')}</span>
                ${operacionesProp(p).map(op => `<span class="badge badge-neutral" style="font-size:.65rem;padding:.15rem .5rem">${op}</span>`).join('')}
              </div>
              <div class="prop-dir">${esc(p.direccion || '—')}</div>
              ${(p.barrio || p.ciudad) ? `<div class="text-xs text-soft" style="margin-top:.15rem">${[p.barrio, p.ciudad].filter(Boolean).map(esc).join(', ')}</div>` : ''}
              ${sel.propietariosDePropiedad(p).length ? `<div class="text-xs text-soft" style="margin-top:.3rem;display:flex;align-items:center;gap:.3rem"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> ${esc(sel.propietariosDePropiedad(p).map(o => sel.nombrePropietario(o.propietarioId)).join(' · '))}</div>` : ''}
            </div>
            <div class="prop-card-foot">
              ${p.ambientes ? `<span>${p.ambientes} amb.</span>` : ''}
              ${p.banos ? `<span>${p.banos} baños</span>` : ''}
              ${p.m2 ? `<span>${p.m2} m²</span>` : ''}
              ${p.precioAlquiler ? `<span style="font-weight:700;color:var(--primary);margin-left:auto">${fmtMoneda(p.precioAlquiler, p.monedaAlquiler || 'ARS')}/mes</span>` : ''}
              ${p.precioVenta && !p.precioAlquiler ? `<span style="font-weight:700;color:var(--primary);margin-left:auto">${fmtMoneda(p.precioVenta, p.monedaVenta || 'USD')}</span>` : ''}
            </div>
            ${(matches.length && p.estado === 'disponible') ? `
            <div class="prop-card-matches" onclick="event.stopPropagation()">
              <div class="prop-matches-label">Interesados</div>
              ${matches.map(({ cliente: c, pct }) => {
                const tel = (c.telefono||'').replace(/\D/g,'');
                const waUrl = tel ? `https://wa.me/${tel.startsWith('54')?tel:'54'+tel}` : null;
                return `
                <div class="prop-match-row" data-cli="${c.id}">
                  <div class="prop-match-ring ${pct >= 70 ? 'high' : pct >= 40 ? 'mid' : 'low'}" style="--pct:${pct}" title="${pct}% de coincidencia">
                    <span>${pct}%</span>
                  </div>
                  <span class="prop-match-name truncate">${esc(c.nombre)}</span>
                  ${waUrl ? `<a href="${waUrl}" target="_blank" title="WhatsApp" style="flex-shrink:0;display:flex;align-items:center;color:#25D366;padding:.15rem .2rem;border-radius:var(--r-sm)" onclick="event.stopPropagation()">${icon('whatsapp')}</a>` : `<span class="prop-match-interes">${c.interes === 'alquiler' ? '🔑' : '🏠'}</span>`}
                </div>`;
              }).join('')}
            </div>` : ''}
          </div>`;
      }).join('')}
    </div>` : `
    <div class="empty">
      ${icon('home')}
      <h3>No hay propiedades${filtro ? ' con ese criterio' : ''}</h3>
      <p>${filtro ? 'Probá con otro término.' : 'Cargá tu primera propiedad.'}</p>
      ${!filtro ? `<button class="btn btn-primary" id="btnNuevaProp2">${icon('plus')} Nueva propiedad</button>` : ''}
    </div>`}`;

  el.querySelector('#btnNuevaProp')?.addEventListener('click', () => openPropForm(null, () => {}));
  el.querySelector('#btnNuevaProp2')?.addEventListener('click', () => openPropForm(null, () => {}));

  el.querySelectorAll('.prop-card[data-id]').forEach(card => {
    card.addEventListener('click', () => navegar(`propiedades/${card.dataset.id}`));
  });
  el.querySelectorAll('.btn-edit-prop[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getState().propiedades.find(x => x.id === btn.dataset.id);
      if (p) openPropForm(p, () => {});
    });
  });
  el.querySelectorAll('.prop-match-row[data-cli]').forEach(row => {
    row.addEventListener('click', () => {
      const { clientes, propiedades } = getState();
      const c = clientes.find(x => x.id === row.dataset.cli);
      const p = propiedades.find(x => x.id === row.closest('[data-id]')?.dataset.id);
      if (c) abrirPerfilBusqueda(c, p || null);
    });
  });
}

/* ---- Detalle ---- */
async function propDetalle(root, id) {
  root.innerHTML = `<div class="view" id="vPropDet"></div>`;
  const render = () => pintarDetalle(root.querySelector('#vPropDet'), id);
  render();
  return subscribe(render);
}

function pintarDetalle(el, id) {
  const { propiedades, alquileres, ventas, clientes } = getState();
  const p = propiedades.find(x => x.id === id);
  if (!p) {
    el.innerHTML = `<div class="view"><div class="empty"><h3>Propiedad no encontrada</h3></div></div>`;
    return;
  }

  const est = PROP_ESTADOS.find(e => e.id === p.estado);
  const alqRel = alquileres.filter(a => a.propiedadId === id);
  const vtaRel = ventas.filter(v => v.propiedadId === id);

  el.innerHTML = `
    <div class="view-head">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" onclick="history.back()">${icon('x')}</button>
        <div>
          <h1 class="view-title">${esc(p.direccion || 'Propiedad')}</h1>
          <p class="view-sub">${p.tipo || ''}</p>
        </div>
      </div>
      <div class="flex gap-2">
        ${p.habilitadaVenta ? `<button class="btn btn-ghost" id="btnVerEnVentas">${icon('trending')} Ver en Ventas</button>` : ''}
        <button class="btn btn-ghost" id="btnEditarProp">${icon('edit')} Editar</button>
      </div>
    </div>

    <div class="two-col-grid">
      <div class="card">
        <div class="card-head"><h3>Datos de la propiedad</h3>
          <span class="badge ${est?.badge || 'badge-neutral'}">${est?.label || p.estado}</span>
        </div>
        <div class="card-body">
          ${fila('N° de carpeta', p.numeroCarpeta)}
          ${fila('Tipo', p.tipo)}
          ${fila('Dirección', p.direccion)}
          ${fila('Barrio', p.barrio)}
          ${fila('Ciudad', p.ciudad)}
          ${fila('Ambientes', p.ambientes)}
          ${fila('Baños', p.banos)}
          ${p.m2 ? fila('Superficie', `${p.m2} m²`) : ''}
          ${p.precio ? fila('Precio', fmtMoneda(p.precio, p.moneda)) : ''}
          ${p.precioAlquiler ? fila('Alquiler', fmtMoneda(p.precioAlquiler, p.monedaAlquiler)) : ''}
          ${p.precioVenta ? fila('Venta', fmtMoneda(p.precioVenta, p.monedaVenta)) : ''}
          ${p.caracteristicas ? `<div style="margin-top:1rem;padding:1rem;background:var(--bg-soft);border-radius:var(--radius-sm);font-size:.875rem">${esc(p.caracteristicas)}</div>` : ''}
        </div>
      </div>

      <!-- Clientes interesados con match % -->
      <div>
        ${(() => {
          const matches = sel.matchClientesPara(p);
          if (!matches.length) return `<div class="card" style="margin-bottom:1.5rem"><div class="card-head"><h3>Clientes interesados</h3></div><div class="empty-sm">No hay clientes cargados que coincidan con esta propiedad.</div></div>`;
          return `
            <div class="card" style="margin-bottom:1.5rem">
              <div class="card-head">
                <h3>Clientes interesados</h3>
                <span class="badge badge-info">${matches.length}</span>
              </div>
              <div class="card-body" style="padding:0">
                ${matches.map(({ cliente: c, pct }) => {
                  const sinDatos = !(c.busca && Object.values(c.busca).some(Boolean));
                  return `
                  <div class="list-row list-row-hover" style="cursor:pointer" data-match-cli="${c.id}">
                    <div class="match-pct-ring" style="--pct:${pct}" title="${pct}% de coincidencia">
                      <span>${pct}%</span>
                    </div>
                    <div class="list-info">
                      <div class="list-name">${esc(c.nombre)}</div>
                      <div class="text-xs text-soft">${sinDatos ? 'Sin criterios cargados — agregá datos al cliente para mejorar el %' : resumenMatchCliente(c)}</div>
                    </div>
                    ${(() => { const tel = (c.telefono||'').replace(/\D/g,''); const num = tel ? (tel.startsWith('54')?tel:'54'+tel) : null; return num ? `<a class="btn btn-xs btn-ghost" href="https://wa.me/${num}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp" style="color:#25D366">${icon('whatsapp')}</a>` : ''; })()}
                  </div>`;
                }).join('')}
              </div>
            </div>`;
        })()}

        ${alqRel.length ? `
        <div class="card" style="margin-bottom:1.5rem">
          <div class="card-head"><h3>${icon('key')} Alquileres</h3></div>
          <div class="card-body" style="padding:0">
            ${alqRel.map(a => {
              const inq = clientes.find(c => c.id === a.inquilinoId);
              return `<div class="list-row">
                <div class="list-info">
                  <div class="list-name">${esc(inq?.nombre || '—')}</div>
                  <div class="text-xs text-soft">${fmtFechaCorta(a.fechaInicio)} → ${fmtFechaCorta(a.fechaFin)}</div>
                </div>
                <span class="badge badge-info">${a.estado}</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

        ${vtaRel.length ? `
        <div class="card">
          <div class="card-head"><h3>${icon('dollar')} Ventas</h3></div>
          <div class="card-body" style="padding:0">
            ${vtaRel.map(v => {
              const comp = clientes.find(c => c.id === v.compradorId);
              return `<div class="list-row">
                <div class="list-info">
                  <div class="list-name">${esc(comp?.nombre || '—')}</div>
                  <div class="text-xs text-soft">${fmtMoneda(v.precio, v.moneda)}</div>
                </div>
                <span class="badge badge-success">${v.estado}</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>

    <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border)">
      <button class="btn" id="btnEliminarProp" style="background:var(--danger);color:#fff">${icon('trash')} Eliminar propiedad</button>
    </div>`;

  el.querySelector('#btnEditarProp')?.addEventListener('click', () => openPropForm(p, () => {}));
  el.querySelector('#btnVerEnVentas')?.addEventListener('click', () => navegar(`ventas/${p.id}`));
  el.querySelectorAll('[data-goto-prop]').forEach(btn => {
    btn.addEventListener('click', () => navegar(`propietarios/${btn.dataset.gotoProp}`));
  });
  el.querySelector('#btnEliminarProp')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta propiedad? No se puede deshacer.')) return;
    await actions.deletePropiedad(id);
    navegar('propiedades');
  });
  el.querySelectorAll('[data-match-cli]').forEach(row => {
    row.addEventListener('click', () => {
      const c = getState().clientes.find(x => x.id === row.dataset.matchCli);
      if (c) abrirPerfilBusqueda(c, p);
    });
  });
}

/* ---- Modal perfil de búsqueda del cliente interesado + comparación con la propiedad ---- */
function abrirPerfilBusqueda(c, prop = null) {
  const b   = c.busca || {};
  const tel = (c.telefono || '').replace(/\D/g, '');
  const num = tel ? (tel.startsWith('54') ? tel : '54' + tel) : null;
  const waUrl = num ? `https://wa.me/${num}` : null;
  const interes = c.interes === 'alquiler' ? '🔑 Alquiler' : c.interes === 'compra' ? '🏠 Compra' : '💬 Otro / No sé';

  /* Función de comparación: devuelve true/false/null (null = sin dato para comparar) */
  function comparar(label, valorCliente, evalFn) {
    if (!valorCliente && valorCliente !== 0) return null; // cliente no especificó
    const ok = evalFn();
    const ico = ok
      ? `<span style="color:var(--success);font-size:1rem;font-weight:700">✓</span>`
      : `<span style="color:var(--danger);font-size:1rem;font-weight:700">✗</span>`;
    return { label, valorCliente, ok, ico };
  }

  /* Armar comparaciones si hay propiedad */
  const items = [];
  if (prop) {
    const amenities = (prop.amenities || []).map(a => a.toLowerCase());
    const propTexto = `${prop.tipo||''} ${prop.ciudad||''} ${prop.barrio||''} ${prop.caracteristicas||''} ${prop.descripcion||''} ${amenities.join(' ')}`.toLowerCase();

    // ── Operación (SIEMPRE primero, es excluyente) ──
    const ofAlquiler = !!(prop.precioAlquiler);
    const ofVenta    = !!(prop.precioVenta);
    const opOk = c.interes === 'alquiler' ? ofAlquiler || (!ofAlquiler && !ofVenta)
               : c.interes === 'compra'   ? ofVenta    || (!ofAlquiler && !ofVenta)
               : true;
    items.push({
      label:        'Tipo de operación',
      valorCliente: c.interes === 'alquiler' ? 'Alquilar' : 'Comprar',
      propVal:      ofAlquiler && ofVenta ? 'Alquiler y venta'
                  : ofAlquiler ? 'Alquiler' : ofVenta ? 'Venta' : 'Sin especificar',
      ok: opOk,
      ico: opOk
        ? `<span style="color:var(--success);font-size:1rem;font-weight:700">✓</span>`
        : `<span style="color:var(--danger);font-size:1rem;font-weight:900">✗</span>`,
    });

    // Zona
    const r0 = comparar('Zona / ciudad', b.zona, () => {
      const zonas = b.zona.toLowerCase().split(/[,\s]+/).filter(Boolean);
      return zonas.some(z => propTexto.includes(z));
    });
    if (r0) items.push({ ...r0, propVal: `${prop.ciudad||''}${prop.barrio?' · '+prop.barrio:''}` });

    // Tipo
    const r1 = comparar('Tipo de propiedad', b.tipo, () =>
      (prop.tipo||'').toLowerCase().includes(b.tipo.toLowerCase()));
    if (r1) items.push({ ...r1, propVal: prop.tipo || '—' });

    // Ambientes
    const r2 = comparar('Ambientes mínimos', b.ambientes, () =>
      prop.ambientes && Number(prop.ambientes) >= Number(b.ambientes));
    if (r2) items.push({ ...r2, propVal: prop.ambientes ? `${prop.ambientes} amb.` : 'No especificado' });

    // Presupuesto
    const precio = c.interes === 'compra' ? prop.precioVenta : prop.precioAlquiler;
    const r3 = comparar('Presupuesto', b.presupuesto, () =>
      precio && Number(b.presupuesto) >= Number(precio));
    if (r3) items.push({ ...r3,
      propVal: precio ? `${b.moneda||'$'} ${Number(precio).toLocaleString('es-AR')}` : 'Sin precio cargado'
    });

    // Amenities comunes que buscan clientes
    const keywords = [
      { key: 'cochera',   labels: ['cochera','garage','garaje'] },
      { key: 'pileta',    labels: ['pileta','piscina','pool'] },
      { key: 'jardín',    labels: ['jardín','jardin','patio','parque'] },
      { key: 'parrilla',  labels: ['parrilla','quincho','bbq'] },
      { key: 'seguridad', labels: ['seguridad','barrio cerrado','countries'] },
    ];
    const prefText = (c.otrasPreferencias || '').toLowerCase();
    keywords.forEach(({ key, labels }) => {
      const clientePide = labels.some(l => prefText.includes(l));
      if (!clientePide) return;
      const propTiene = labels.some(l => propTexto.includes(l));
      items.push({
        label: key.charAt(0).toUpperCase() + key.slice(1),
        valorCliente: key,
        propVal: propTiene ? 'Sí' : 'No',
        ok: propTiene,
        ico: propTiene
          ? `<span style="color:var(--success);font-size:1rem;font-weight:700">✓</span>`
          : `<span style="color:var(--danger);font-size:1rem;font-weight:700">✗</span>`,
      });
    });
  }

  const hayComparacion = items.length > 0;
  const matches = items.filter(i => i.ok).length;
  const total   = items.length;

  openModal({
    title: `Lo que busca — ${esc(c.nombre)}`,
    bodyHTML: `
      <!-- Header cliente -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;padding:.75rem 1rem;background:var(--primary-soft);border-radius:var(--r-md)">
        <div>
          <div style="font-weight:700;font-size:1rem">${esc(c.nombre)}</div>
          ${c.telefono ? `<div style="font-size:.8rem;color:var(--text-soft);margin-top:.1rem">${esc(c.telefono)}</div>` : ''}
        </div>
        <div style="display:flex;gap:.5rem;align-items:center">
          <span style="font-size:.78rem;font-weight:600;background:var(--surface);padding:.2rem .6rem;border-radius:999px;border:1px solid var(--border)">${interes}</span>
          ${waUrl ? `<a href="${waUrl}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.35rem;text-decoration:none">${icon('whatsapp')} WA</a>` : ''}
        </div>
      </div>

      ${hayComparacion ? `
        <!-- Resumen de compatibilidad -->
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;padding:.65rem 1rem;background:${matches===total?'color-mix(in srgb,var(--success) 10%,transparent)':matches===0?'color-mix(in srgb,var(--danger) 8%,transparent)':'color-mix(in srgb,var(--warning) 10%,transparent)'};border-radius:var(--r-md)">
          <div style="font-size:1.4rem;font-weight:800;color:${matches===total?'var(--success)':matches===0?'var(--danger)':'var(--warning)'}">${matches}/${total}</div>
          <div style="font-size:.82rem;color:var(--text-soft)">criterios coinciden con esta propiedad</div>
        </div>

        <!-- Tabla de comparación -->
        <div style="border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;margin-bottom:1rem">
          <div style="display:grid;grid-template-columns:1fr auto auto;background:var(--surface-2);padding:.45rem .85rem;font-size:.7rem;font-weight:700;color:var(--text-soft);text-transform:uppercase;letter-spacing:.05em;gap:.5rem">
            <span>Criterio</span><span>Propiedad</span><span style="text-align:center">Match</span>
          </div>
          ${items.map(it => `
            <div style="display:grid;grid-template-columns:1fr auto auto;padding:.55rem .85rem;border-top:1px solid var(--border);gap:.5rem;align-items:center;background:${it.ok?'color-mix(in srgb,var(--success) 4%,transparent)':'color-mix(in srgb,var(--danger) 4%,transparent)'}">
              <div>
                <div style="font-size:.8rem;font-weight:600">${esc(it.label)}</div>
                <div style="font-size:.72rem;color:var(--text-soft)">Busca: ${esc(String(it.valorCliente))}</div>
              </div>
              <div style="font-size:.78rem;color:var(--text-soft);text-align:right">${esc(it.propVal||'—')}</div>
              <div style="text-align:center;padding-left:.5rem">${it.ico}</div>
            </div>`).join('')}
        </div>` : ''}

      ${c.otrasPreferencias ? `
        <div style="background:var(--surface-2);border-radius:var(--r-sm);padding:.75rem 1rem">
          <div style="font-size:.72rem;font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem">Otras preferencias</div>
          <div style="font-size:.85rem">${esc(c.otrasPreferencias)}</div>
        </div>` : ''}

      ${!hayComparacion && !c.otrasPreferencias ? `
        <div style="text-align:center;color:var(--text-faint);font-size:.85rem;padding:1rem 0">
          Este cliente no tiene criterios de búsqueda cargados.
        </div>` : ''}`,
    footerHTML: `
      <button class="btn btn-ghost" data-close>Cerrar</button>
      ${waUrl ? `<a href="${waUrl}" target="_blank" class="btn btn-primary" style="background:#25D366;border-color:#25D366;display:flex;align-items:center;gap:.4rem;text-decoration:none">${icon('whatsapp')} Contactar por WhatsApp</a>` : ''}`,
    onMount({ overlay, close }) {
      overlay.querySelector('[data-close]')?.addEventListener('click', close);
    },
  });
}

function fila(label, val) {
  if (val === undefined || val === null || val === '') return '';
  return `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;font-size:.875rem"><span class="text-soft" style="min-width:90px">${label}</span><span>${esc(String(val))}</span></div>`;
}

function fmtFechaCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
