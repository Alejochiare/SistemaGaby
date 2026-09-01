/* ============================================================
   ROUTER — Hash router. Cada vista es un módulo independiente.
   ============================================================ */
import inicio       from './views/inicio.js';
import clientes     from './views/clientes.js';
import propiedades  from './views/propiedades.js';
import alquileres   from './views/alquileres.js';
import recibos         from './views/recibos.js';

const RUTAS = { inicio, clientes, propiedades, alquileres, recibos };

let _cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [ruta, ...rest] = raw.split('/');
  return { ruta: ruta || 'inicio', param: rest.join('/') || null };
}

async function resolver() {
  const root = document.getElementById('viewRoot');
  const { ruta, param } = parseHash();
  const view = RUTAS[ruta] || inicio;

  if (typeof _cleanup === 'function') { try { _cleanup(); } catch {} _cleanup = null; }
  root.innerHTML = '';
  root.scrollTop = 0;
  document.querySelector('.view-scroll').scrollTop = 0;

  try {
    _cleanup = await view(root, param) || null;
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="view"><div class="empty"><h3>Error al cargar la vista</h3><p>${err.message}</p></div></div>`;
  }
}

export function navegar(ruta) { location.hash = `#/${ruta}`; }

export function initRouter() {
  window.addEventListener('hashchange', resolver);
  if (!location.hash) location.hash = '#/inicio';
  else resolver();
}
