import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC5xbBoL_48Ux4RK36LSQXKgmw1nMk_I-w",
  authDomain: "whatsapp2-bbf5f.firebaseapp.com",
  databaseURL: "https://whatsapp2-bbf5f-default-rtdb.firebaseio.com",
  projectId: "whatsapp2-bbf5f",
  storageBucket: "whatsapp2-bbf5f.firebasestorage.app",
  messagingSenderId: "937104624541",
  appId: "1:937104624541:web:e448ee1d8cab2f0eab3d74",
  measurementId: "G-N987JD3Q1H"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getDatabase(app);
