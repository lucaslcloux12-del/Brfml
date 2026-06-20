import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { ref, push, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// --- CONFIGURAÇÃO CLOUDINARY ---
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/ddt5zbqih/image/upload';
const CLOUDINARY_UPLOAD_PRESET = 'Brasil'; // Lembre-se: TEM QUE SER "UNSIGNED" NO CLOUDINARY

let currentUserData = null;

// Elementos DOM Principais
const authSection = document.getElementById('auth-section');
const loginBox = document.getElementById('login-box');
const profileSetup = document.getElementById('profile-setup');
const appSection = document.getElementById('app-section');

// --- SISTEMA DE ABAS (NAVEGAÇÃO) ---
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Remove classe active de todos
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    // Adiciona no clicado
    const target = e.currentTarget.getAttribute('data-target');
    e.currentTarget.classList.add('active');
    document.getElementById(target).classList.add('active');
  });
});

// --- AUTENTICAÇÃO E PERFIL INICIAL ---
document.getElementById('btn-google-login').addEventListener('click', () => {
  signInWithPopup(auth, provider).catch(error => console.error("Erro no login:", error));
});

document.getElementById('btn-logout').addEventListener('click', () => { signOut(auth); });

onAuthStateChanged(auth, (user) => {
  if (user) {
    const userRef = ref(db, 'users/' + user.uid);
    onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.username) {
        currentUserData = { uid: user.uid, ...data };
        iniciarApp();
      } else {
        loginBox.classList.add('hidden');
        profileSetup.classList.remove('hidden');
      }
    }, { onlyOnce: true });
  } else {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    loginBox.classList.remove('hidden');
    profileSetup.classList.add('hidden');
  }
});

// Função para fazer o upload da imagem pro Cloudinary
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  try {
    const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) {
      console.error("Erro retornado pelo Cloudinary:", data.error.message);
      alert(`Erro no Cloudinary: ${data.error.message}\nVerifique se o preset 'Brasil' é Unsigned.`);
      return null;
    }
    return data.secure_url;
  } catch (err) {
    console.error("Falha na requisição Cloudinary", err);
    alert("Falha na conexão com o Cloudinary.");
    return null;
  }
}

// Salvar perfil pela primeira vez
document.getElementById('btn-save-profile').addEventListener('click', async () => {
  const username = document.getElementById('username-input').value;
  const fileInput = document.getElementById('profile-pic-input');
  if (!username) return alert("Defina seu codinome!");

  let photoUrl = auth.currentUser.photoURL; 

  if (fileInput.files.length > 0) {
    document.getElementById('btn-save-profile').innerText = "Processando Uplink...";
    const uploadedUrl = await uploadToCloudinary(fileInput.files[0]);
    if (uploadedUrl) photoUrl = uploadedUrl;
  }

  set(ref(db, 'users/' + auth.currentUser.uid), { username, photoUrl });
  document.getElementById('btn-save-profile').innerText = "Iniciar Sistema";
});

function iniciarApp() {
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  
  // Preenche dados no menu
  document.getElementById('menu-username').innerText = currentUserData.username;
  document.getElementById('menu-avatar').src = currentUserData.photoUrl;
  
  // Preenche dados na aba de edição de perfil
  document.getElementById('edit-username-input').value = currentUserData.username;
  document.getElementById('edit-avatar-preview').src = currentUserData.photoUrl;

  carregarChat();
  carregarApostas();
}

// --- EDITAR PERFIL (NOVA FUNÇÃO) ---
document.getElementById('btn-update-profile').addEventListener('click', async () => {
  const newUsername = document.getElementById('edit-username-input').value;
  const fileInput = document.getElementById('edit-profile-pic-input');
  
  if (!newUsername) return alert("O codinome não pode ser vazio.");

  let updates = { username: newUsername };
  const btn = document.getElementById('btn-update-profile');

  if (fileInput.files.length > 0) {
    btn.innerText = "Enviando Nova Imagem...";
    const uploadedUrl = await uploadToCloudinary(fileInput.files[0]);
    if (uploadedUrl) {
      updates.photoUrl = uploadedUrl;
    }
  }

  btn.innerText = "Salvando no Banco de Dados...";
  update(ref(db, 'users/' + auth.currentUser.uid), updates).then(() => {
    btn.innerText = "Atualizar Dados";
    alert("Perfil atualizado com sucesso!");
    // O onValue inicial do AuthStateChanged não roda de novo automaticamente pra atualizar a UI globalmente de forma simples, 
    // então atualizamos localmente na memória e UI:
    currentUserData.username = updates.username;
    if(updates.photoUrl) currentUserData.photoUrl = updates.photoUrl;
    
    document.getElementById('menu-username').innerText = currentUserData.username;
    document.getElementById('menu-avatar').src = currentUserData.photoUrl;
    document.getElementById('edit-avatar-preview').src = currentUserData.photoUrl;
  }).catch(err => {
    console.error(err);
    alert("Erro ao salvar perfil.");
    btn.innerText = "Atualizar Dados";
  });
});

// --- CHAT ---
document.getElementById('btn-send-chat').addEventListener('click', enviarMensagem);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') enviarMensagem() });

function enviarMensagem() {
  const text = document.getElementById('chat-input').value;
  if (!text) return;
  push(ref(db, 'chats'), {
    uid: currentUserData.uid,
    nome: currentUserData.username,
    texto: text,
    timestamp: Date.now()
  });
  document.getElementById('chat-input').value = '';
}

function carregarChat() {
  onValue(ref(db, 'chats'), (snapshot) => {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    snapshot.forEach(child => {
      const msg = child.val();
      container.innerHTML += `<div class="chat-msg"><strong>[${msg.nome}]:</strong> ${msg.texto}</div>`;
    });
    container.scrollTop = container.scrollHeight;
  });
}

// --- APOSTAS ---
document.getElementById('btn-create-bet').addEventListener('click', () => {
  const title = document.getElementById('bet-title').value;
  const isMoney = document.getElementById('bet-is-money').checked;
  if (!title) return alert("Dê um título para o contrato!");

  push(ref(db, 'apostas'), {
    titulo: title,
    comDinheiro: isMoney,
    hostId: currentUserData.uid,
    hostNome: currentUserData.username,
    apostadores: {}
  });
  document.getElementById('bet-title').value = '';
});

function carregarApostas() {
  onValue(ref(db, 'apostas'), (snapshot) => {
    const container = document.getElementById('active-bets-container');
    container.innerHTML = '';
    
    snapshot.forEach(child => {
      const aposta = child.val();
      const apostaId = child.key;
      const isHost = currentUserData.uid === aposta.hostId;
      
      let html = `
        <div class="bet-card">
          <h4>${aposta.titulo} ${aposta.comDinheiro ? '<i class="fas fa-dollar-sign text-verde"></i>' : '<i class="fas fa-eye text-azul"></i>'}</h4>
          <p style="font-size:12px; color:#aaa;">Host: ${aposta.hostNome}</p>
          <ul>`;
      
      if (aposta.apostadores) {
        Object.values(aposta.apostadores).forEach(p => {
          html += `<li><strong style="color:var(--neon-verde)">${p.nome}</strong>: ${p.palpite} ${aposta.comDinheiro ? `[R$ ${p.valor}]` : ''}</li>`;
        });
      }
      html += `</ul>`;

      html += `
        <div style="margin-top:10px;">
          <input type="text" id="palpite-${apostaId}" placeholder="Palpite (Ex: 2x1)">
          ${aposta.comDinheiro ? `<input type="number" id="valor-${apostaId}" placeholder="R$" step="0.01">` : ''}
          <button class="btn btn-neon-verde" style="padding: 8px; font-size:12px;" onclick="fazerAposta('${apostaId}', ${aposta.comDinheiro}, false)">Confirmar</button>
        </div>`;

      if (isHost) {
        html += `
          <div class="proxy-bet-section">
            <span style="font-size:12px; color:var(--neon-azul);"><i class="fas fa-user-secret"></i> Acesso Host (Apostar por outro)</span>
            <input type="text" id="proxy-nome-${apostaId}" placeholder="Codinome Alvo">
            <input type="text" id="proxy-palpite-${apostaId}" placeholder="Palpite Alvo">
            ${aposta.comDinheiro ? `<input type="number" id="proxy-valor-${apostaId}" placeholder="R$" step="0.01">` : ''}
            <button class="btn btn-neon-azul" style="padding: 8px; font-size:12px;" onclick="fazerAposta('${apostaId}', ${aposta.comDinheiro}, true)">Inserir Dados</button>
          </div>`;
      }
      
      html += `</div>`;
      container.innerHTML += html;
    });
  });
}

window.fazerAposta = function(apostaId, comDinheiro, isProxy) {
  let nomeApostador = currentUserData.username;
  let palpite = document.getElementById(`palpite-${apostaId}`).value;
  let valor = 0;

  if (isProxy) {
    nomeApostador = document.getElementById(`proxy-nome-${apostaId}`).value;
    palpite = document.getElementById(`proxy-palpite-${apostaId}`).value;
  }

  if (!palpite || (isProxy && !nomeApostador)) return alert("Dados insuficientes para processar palpite.");

  if (comDinheiro) {
    const inputValor = isProxy ? document.getElementById(`proxy-valor-${apostaId}`).value : document.getElementById(`valor-${apostaId}`).value;
    valor = parseFloat(inputValor);
    
    if (isNaN(valor) || valor <= 1.00) {
      return alert("Apostas financeiras exigem transferência superior a R$ 1,00.");
    }
  }

  push(ref(db, `apostas/${apostaId}/apostadores`), {
    nome: nomeApostador,
    palpite: palpite,
    valor: valor.toFixed(2)
  });
}
