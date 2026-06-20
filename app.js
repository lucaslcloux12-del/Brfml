import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { ref, push, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// --- CONFIGURAÇÃO CLOUDINARY ---
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/ddt5zbqih/image/upload';
// ATENÇÃO: Crie um "Upload Preset" não assinado no Cloudinary e coloque o nome dele aqui!
const CLOUDINARY_UPLOAD_PRESET = 'Brasil'; 

let currentUserData = null;

// Elementos DOM
const authSection = document.getElementById('auth-section');
const loginBox = document.getElementById('login-box');
const profileSetup = document.getElementById('profile-setup');
const appSection = document.getElementById('app-section');

// --- AUTENTICAÇÃO E PERFIL ---
document.getElementById('btn-google-login').addEventListener('click', () => {
  signInWithPopup(auth, provider).catch(error => console.error("Erro no login:", error));
});

document.getElementById('btn-logout').addEventListener('click', () => {
  signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Verifica se o usuário já tem perfil salvo no Realtime DB
    const userRef = ref(db, 'users/' + user.uid);
    onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.username) {
        currentUserData = { uid: user.uid, ...data };
        iniciarApp();
      } else {
        // Novo usuário, mostra setup de perfil
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

document.getElementById('btn-save-profile').addEventListener('click', async () => {
  const username = document.getElementById('username-input').value;
  const fileInput = document.getElementById('profile-pic-input');
  if (!username) return alert("Escolha um nome!");

  let photoUrl = auth.currentUser.photoURL; // Padrão: foto do Google

  if (fileInput.files.length > 0) {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
      document.getElementById('btn-save-profile').innerText = "Enviando...";
      const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
      const data = await res.json();
      if(data.secure_url) photoUrl = data.secure_url;
    } catch (err) {
      console.error("Erro no Cloudinary", err);
      alert("Erro ao enviar foto. Usando a do Google.");
    }
  }

  // Salva no Firebase
  set(ref(db, 'users/' + auth.currentUser.uid), { username, photoUrl });
  document.getElementById('btn-save-profile').innerText = "Salvar e Entrar";
});

function iniciarApp() {
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  document.getElementById('user-display-name').innerText = currentUserData.username;
  document.getElementById('user-avatar').src = currentUserData.photoUrl;
  
  carregarChat();
  carregarApostas();
}

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
      container.innerHTML += `<div class="chat-msg"><strong>${msg.nome}:</strong> ${msg.texto}</div>`;
    });
    container.scrollTop = container.scrollHeight;
  });
}

// --- APOSTAS ---
document.getElementById('btn-create-bet').addEventListener('click', () => {
  const title = document.getElementById('bet-title').value;
  const isMoney = document.getElementById('bet-is-money').checked;
  if (!title) return alert("Dê um título para a aposta!");

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
          <h4>${aposta.titulo} ${aposta.comDinheiro ? '💵 (Com Dinheiro)' : '⚪ (Sem Dinheiro)'}</h4>
          <p><strong>Anfitrião:</strong> ${aposta.hostNome}</p>
          <ul>`;
      
      // Renderiza as apostas feitas
      if (aposta.apostadores) {
        Object.values(aposta.apostadores).forEach(p => {
          html += `<li><strong>${p.nome}</strong> apostou: ${p.palpite} ${aposta.comDinheiro ? `(R$ ${p.valor})` : ''}</li>`;
        });
      }
      html += `</ul>`;

      // Formulário para o próprio usuário apostar
      html += `
        <div style="margin-top:10px;">
          <input type="text" id="palpite-${apostaId}" placeholder="Seu Palpite (Ex: 2x1)">
          ${aposta.comDinheiro ? `<input type="number" id="valor-${apostaId}" placeholder="Valor R$" step="0.01">` : ''}
          <button class="btn btn-verde" onclick="fazerAposta('${apostaId}', ${aposta.comDinheiro}, false)">Fazer minha Aposta</button>
        </div>`;

      // Formulário "Escolher por outro" (Apenas para o Anfitrião)
      if (isHost) {
        html += `
          <div class="proxy-bet-section">
            <strong>👑 Painel do Anfitrião: Apostar por outro</strong>
            <input type="text" id="proxy-nome-${apostaId}" placeholder="Nome do amigo">
            <input type="text" id="proxy-palpite-${apostaId}" placeholder="Palpite dele">
            ${aposta.comDinheiro ? `<input type="number" id="proxy-valor-${apostaId}" placeholder="Valor R$" step="0.01">` : ''}
            <button class="btn btn-azul" onclick="fazerAposta('${apostaId}', ${aposta.comDinheiro}, true)">Registrar por Outro</button>
          </div>`;
      }
      
      html += `</div>`;
      container.innerHTML += html;
    });
  });
}

// Expõe a função para o escopo global para o botão inline (onclick) funcionar
window.fazerAposta = function(apostaId, comDinheiro, isProxy) {
  let nomeApostador = currentUserData.username;
  let palpite = document.getElementById(`palpite-${apostaId}`).value;
  let valor = 0;

  if (isProxy) {
    nomeApostador = document.getElementById(`proxy-nome-${apostaId}`).value;
    palpite = document.getElementById(`proxy-palpite-${apostaId}`).value;
  }

  if (!palpite || (isProxy && !nomeApostador)) return alert("Preencha o palpite e o nome corretamente.");

  if (comDinheiro) {
    const inputValor = isProxy ? document.getElementById(`proxy-valor-${apostaId}`).value : document.getElementById(`valor-${apostaId}`).value;
    valor = parseFloat(inputValor);
    
    // Regra: valor deve ser estritamente maior que R$ 1,00
    if (isNaN(valor) || valor <= 1.00) {
      return alert("Apostas em dinheiro devem ter valor MAIOR que R$ 1,00 (ex: R$ 1,01).");
    }
  }

  push(ref(db, `apostas/${apostaId}/apostadores`), {
    nome: nomeApostador,
    palpite: palpite,
    valor: valor.toFixed(2)
  });
}

