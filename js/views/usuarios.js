/* ============================================================
   VIEW · USUARIOS Y ROLES
   Gestión de usuarios y matriz de permisos por rol.
   ============================================================ */
import { sel, actions, getState, subscribe } from '../store.js';
import { $, $$, esc, iniciales, colorDe } from '../lib.js';
import { ROLES, PERMISOS, icon } from '../config.js';
import { confirmar } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { openUsuarioForm } from './forms.js';

function rolePill(rolId) {
  const r = ROLES[rolId] || { label: rolId, color: 'var(--text-soft)' };
  return `<span class="role-pill" style="background:${r.color}1a;color:${r.color}"><span class="badge-dot" style="background:${r.color}"></span>${r.label}</span>`;
}

export default async function usuarios(root) {
  const puedeGestionar = sel.puede(['administrador']);

  function render() {
    const us = getState().usuarios;
    const roles = Object.keys(ROLES);

    root.innerHTML = `
      <div class="view">
        <div class="page-head">
          <div class="page-title-wrap">
            <h1>Usuarios y permisos</h1>
            <div class="subtitle">${us.length} usuarios en el equipo. Los permisos se asignan según el rol.</div>
          </div>
          ${puedeGestionar ? `<button class="btn btn-primary" id="newUser">${icon('plus')} Nuevo usuario</button>` : ''}
        </div>

        <div class="card" style="margin-bottom:1.5rem">
          <div class="card-head"><h3>Equipo</h3></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th>${puedeGestionar ? '<th></th>' : ''}</tr></thead>
              <tbody>
                ${us.map(u => `<tr>
                  <td><div class="flex items-center gap-3"><div class="avatar" style="width:34px;height:34px;font-size:.75rem;background:${colorDe(u.nombre)}">${iniciales(u.nombre)}</div><span class="cell-name">${esc(u.nombre)}</span></div></td>
                  <td class="text-soft">${esc(u.email || '—')}</td>
                  <td>${rolePill(u.rol)}</td>
                  <td><span class="badge ${u.activo !== false ? 'badge-success' : 'badge-neutral'}">${u.activo !== false ? 'Activo' : 'Inactivo'}</span></td>
                  ${puedeGestionar ? `<td><div class="flex gap-2"><button class="btn btn-sm btn-ghost btn-icon-only" data-edit="${u.id}" title="Editar">${icon('edit')}</button></div></td>` : ''}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        ${puedeGestionar ? `<div class="card" style="margin-bottom:1.5rem;border-color:var(--danger-soft)">
          <div class="card-head"><h3 style="color:var(--danger)">${icon('alert')} Zona de peligro</h3></div>
          <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
            <div>
              <div style="font-weight:600">Limpiar todos los datos</div>
              <div class="text-sm text-soft">Elimina todos los leads, propiedades y tareas. Los usuarios no se borran.</div>
            </div>
            <button class="btn btn-sm" id="btnLimpiar" style="background:var(--danger);color:#fff;white-space:nowrap">${icon('trash')} Limpiar todo</button>
          </div>
        </div>` : ''}

        <div class="card">
          <div class="card-head"><h3>Matriz de permisos</h3></div>
          <div class="table-wrap">
            <table class="perm-table">
              <thead><tr><th>Permiso</th>${roles.map(r => `<th style="text-align:center">${ROLES[r].label}</th>`).join('')}</tr></thead>
              <tbody>
                ${PERMISOS.map(p => `<tr>
                  <td class="cell-name">${esc(p.label)}</td>
                  ${roles.map(r => `<td class="check">${p.roles.includes(r) ? `<span class="yes">${icon('check')}</span>` : '<span class="no">—</span>'}</td>`).join('')}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    if (puedeGestionar) {
      $('#newUser', root)?.addEventListener('click', () => openUsuarioForm(null, null));
      $$('[data-edit]', root).forEach(b => b.addEventListener('click', () => {
        const u = getState().usuarios.find(x => x.id === b.dataset.edit);
        openUsuarioForm(u, null);
      }));
      $('#btnLimpiar', root)?.addEventListener('click', async () => {
        const ok = await confirmar('¿Limpiar todos los datos?', 'Se eliminarán todos los leads, propiedades y tareas. Esta acción no se puede deshacer.');
        if (!ok) return;
        await actions.resetDemo();
        toast('Datos eliminados correctamente', { tipo: 'success' });
      });
    }
  }

  render();
  const unsub = subscribe(() => render());
  return () => unsub();
}
