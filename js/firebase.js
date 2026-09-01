/* ============================================================
   FIREBASE — inicialización de la app, Firestore, Auth y Storage.
   Se importa el SDK modular directo desde el CDN de Google (gstatic),
   sin npm ni paso de build, igual que el resto del proyecto.
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyD3DN_jFW6euoa87cYyuo0kXViqRGa1C7E",
  authDomain: "inmobiliaria--gaby.firebaseapp.com",
  projectId: "inmobiliaria--gaby",
  storageBucket: "inmobiliaria--gaby.firebasestorage.app",
  messagingSenderId: "721561907302",
  appId: "1:721561907302:web:7d8c89d057680dd6073da7",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
