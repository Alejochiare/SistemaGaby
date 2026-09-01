/* ============================================================
   AUTH — pantalla de acceso con Firebase Authentication (email + contraseña).
   La validación la hace Firebase, no un password fijo en el código —
   así los datos quedan protegidos de verdad detrás de las reglas de Firestore.
   ============================================================ */
import { auth } from './firebase.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';

const NOMBRE_APP = 'Inmobiliaria Gaby';

function eyeIcon(open) {
  return open
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7c1.6 0 3 .3 4.2.9M22 12s-1 2-3 3.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M4 4l16 16"/></svg>';
}

export async function cerrarSesion() {
  try { await signOut(auth); } catch {}
  location.reload();
}

function mensajeError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Usuario o contraseña incorrectos.';
  }
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Probá de nuevo en un rato.';
  return 'No se pudo conectar. Revisá tu conexión a internet.';
}

function renderLogin(onSuccess) {
  const root = document.getElementById('loginScreen');
  root.innerHTML = `
    <div class="login-card">
      <h1>${NOMBRE_APP}</h1>
      <p class="login-sub">Ingresá tus credenciales para continuar</p>
      <form id="loginForm" autocomplete="on">
        <div class="login-field">
          <label for="loginUsuario">Email</label>
          <input type="email" name="usuario" id="loginUsuario" autocomplete="username" required>
        </div>
        <div class="login-field">
          <label for="loginClave">Contraseña</label>
          <div class="login-pass-wrap">
            <input type="password" name="clave" id="loginClave" autocomplete="current-password" required>
            <button type="button" class="login-eye" id="loginToggleEye" aria-label="Mostrar contraseña">${eyeIcon(false)}</button>
          </div>
        </div>
        <p class="login-error" id="loginError" hidden>Usuario o contraseña incorrectos.</p>
        <button type="submit" class="btn btn-primary btn-block login-submit">Ingresar</button>
      </form>
    </div>`;
  root.style.display = 'flex';

  const form = document.getElementById('loginForm');
  const claveInput = document.getElementById('loginClave');
  const eyeBtn = document.getElementById('loginToggleEye');
  const errEl = document.getElementById('loginError');
  const submitBtn = form.querySelector('.login-submit');

  let visible = false;
  eyeBtn.addEventListener('click', () => {
    visible = !visible;
    claveInput.type = visible ? 'text' : 'password';
    eyeBtn.innerHTML = eyeIcon(visible);
    eyeBtn.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const usuario = String(fd.get('usuario') || '').trim();
    const clave = String(fd.get('clave') || '');
    submitBtn.disabled = true;
    errEl.hidden = true;
    try {
      await signInWithEmailAndPassword(auth, usuario, clave);
      root.style.display = 'none';
      root.innerHTML = '';
      onSuccess();
      return;
    } catch (err) {
      errEl.textContent = mensajeError(err);
      errEl.hidden = false;
      submitBtn.classList.remove('shake');
      void submitBtn.offsetWidth;
      submitBtn.classList.add('shake');
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('loginUsuario').focus();
}

function esperarEstadoAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => { unsub(); resolve(user); });
  });
}

export async function requireLogin() {
  const app = document.getElementById('app');
  const user = await esperarEstadoAuth();
  if (user) { app.style.display = ''; return; }
  app.style.display = 'none';
  await new Promise((resolve) => {
    renderLogin(() => { app.style.display = ''; resolve(); });
  });
}
