/* ============================================================
   COMPONENT · Modal — diálogos reutilizables
   openModal({ title, body, footer, size }) → controlador { close }
   ============================================================ */
import { icon } from '../config.js';
import { el } from '../lib.js';

const root = () => document.getElementById('modalRoot');

export function openModal({ title = '', bodyHTML = '', footerHTML = '', size = '', onMount } = {}) {
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${footerHTML ? `<div class="modal-foot">${footerHTML}</div>` : ''}
      </div>
    </div>`);

  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 160);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);

  root().appendChild(overlay);
  const ctx = { overlay, body: overlay.querySelector('.modal-body'), close };
  onMount?.(ctx);
  return ctx;
}

/** Confirmación rápida. Devuelve Promise<boolean>. */
export function confirmar({ title = '¿Confirmar?', mensaje = '', okLabel = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = openModal({
      title, size: '',
      bodyHTML: `<p class="text-soft">${mensaje}</p>`,
      footerHTML: `
        <button class="btn btn-ghost" data-cancel>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${okLabel}</button>`,
      onMount(ctx) {
        ctx.overlay.querySelector('[data-cancel]').addEventListener('click', () => { ctx.close(); resolve(false); });
        ctx.overlay.querySelector('[data-ok]').addEventListener('click', () => { ctx.close(); resolve(true); });
      }
    });
  });
}
