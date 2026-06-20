import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { ref, push, onValue, set, update, remove, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/ddt5zbqih/image/upload';
const CLOUDINARY_UPLOAD_PRESET = 'Brasil'; 

let currentUserData = null;
let msgRespondidaId = null; 
const ADMIN_EMAIL = 'lucaslcloux12@gmail.com';

const loadingScreen = document.getElementById('loading-screen');
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');

// NAVEGAÇÃO ABAS
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
    document.getElementById(e.currentTarget.getAttribute('data-target')).classList.add('active');
    if(e.currentTarget.getAttribute('data-target') === 'tab-chat') carregarChat();
  });
});

// AUTENTICAÇÃO
document.getElementById('btn-google-login').addEventListener('click', () => { signInWithPopup(auth, provider); });
document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    onValue(ref(db, 'users/' + user.uid), (snapshot) => {
      const data = snapshot.val();
      if (data && data.username) {
        currentUserData = { uid: user.uid, email: user.email, ...data };
        iniciarApp();
      } else {
        loadingScreen.classList.add('hidden');
        authSection.classList.remove('hidden');
        document.getElementById('login-box').classList.add('hidden');
        document.getElementById('profile-setup').classList.remove('hidden');
      }
    }, { onlyOnce: true });
  } else {
    loadingScreen.classList.add('hidden');
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
  }
});

// PERFIL & UPLOAD
async function uploadToCloudinary(file) {
  const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  try { const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData }); return (await res.json()).secure_url; } catch (err) { return null; }
}

document.getElementById('btn-save-profile').addEventListener('click', async () => {
  const username = document.getElementById('username-input').value;
  const fileInput = document.getElementById('profile-pic-input');
  if (!username) return;
  let photoUrl = auth.currentUser.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
  if (fileInput.files.length > 0) {
    document.getElementById('btn-save-profile').innerText = "Enviando...";
    const url = await uploadToCloudinary(fileInput.files[0]);
    if (url) photoUrl = url;
  }
  set(ref(db, 'users/' + auth.currentUser.uid), { username, photoUrl, email: auth.currentUser.email, bio: '' });
});

document.getElementById('btn-update-profile').addEventListener('click', async () => {
  const newUsername = document.getElementById('edit-username-input').value;
  const newBio = document.getElementById('edit-bio-input').value;
  const fileInput = document.getElementById('edit-profile-pic-input');
  if (!newUsername) return;
  let updates = { username: newUsername, bio: newBio };
  const btn = document.getElementById('btn-update-profile');
  if (fileInput.files.length > 0) {
    btn.innerText = "Enviando Foto...";
    const url = await uploadToCloudinary(fileInput.files[0]);
    if (url) updates.photoUrl = url;
  }
  update(ref(db, 'users/' + auth.currentUser.uid), updates).then(() => {
    btn.innerText = "Atualizar Perfil"; alert("Perfil salvo!"); Object.assign(currentUserData, updates); iniciarApp();
  });
});

function iniciarApp() {
  loadingScreen.classList.add('hidden');
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  
  document.getElementById('menu-username').innerText = currentUserData.username;
  document.getElementById('menu-avatar').src = currentUserData.photoUrl;
  document.getElementById('edit-username-input').value = currentUserData.username;
  document.getElementById('edit-bio-input').value = currentUserData.bio || '';
  document.getElementById('edit-avatar-preview').src = currentUserData.photoUrl;
  
  carregarChat();
  carregarApostas();

  // VERIFICA SE ENTROU POR LINK (DEEP LINKING)
  const urlParams = new URLSearchParams(window.location.search);
  const conviteCode = urlParams.get('aposta');
  if (conviteCode) {
    document.querySelector('[data-target=tab-bets]').click();
    buscarEAbirModalConvite(conviteCode);
  }
}

// PERFIS
window.abrirPerfil = async function(uid) {
  const snap = await get(ref(db, 'users/' + uid));
  if(snap.exists()) {
    const user = snap.val();
    document.getElementById('modal-avatar').src = user.photoUrl;
    document.getElementById('modal-name').innerText = user.username;
    document.getElementById('modal-bio').innerText = user.bio || "Nenhuma biografia informada.";
    document.getElementById('profile-modal').classList.remove('hidden');
  }
}
document.getElementById('close-modal').addEventListener('click', () => { document.getElementById('profile-modal').classList.add('hidden'); });

// CHAT WPP (Mantido do código anterior, omiti o miolo para focar nas Apostas, MAS DEIXE SEU CÓDIGO DE CHAT AQUI!)
// ... Seu código de enviarMensagem(), carregarChat(), responderMensagem() ...

// ==========================================
// SISTEMA DE APOSTAS: RANKING E PRIVACIDADE
// ==========================================

document.getElementById('btn-create-bet').addEventListener('click', () => {
  const title = document.getElementById('bet-title').value;
  const isMoney = document.getElementById('bet-is-money').checked;
  const visibilidade = document.querySelector('input[name="bet-visibility"]:checked').value; // 'publica' ou 'privada'
  if (!title) return alert("Dê um título para o bolão!");

  push(ref(db, 'apostas'), {
    titulo: title,
    comDinheiro: isMoney,
    privada: visibilidade === 'privada',
    status: 'aberta', 
    vencedorUid: '',
    hostId: currentUserData.uid,
    hostNome: currentUserData.username,
    apostadores: {}
  });
  document.getElementById('bet-title').value = '';
  document.querySelectorAll('.btn-sub-nav')[0].click(); // Volta pra Destaques
});

// Compartilhamento Dinâmico
window.copiarLinkAposta = function(apostaId) {
  const link = `${window.location.origin}${window.location.pathname}?aposta=${apostaId}`;
  navigator.clipboard.writeText(link).then(() => alert("Link copiado! Mande para a galera."));
}
window.copiarCodigo = function(apostaId) {
  navigator.clipboard.writeText(apostaId).then(() => alert("Código copiado: " + apostaId));
}

// Renderizar o HTML do Card
function criarHTMLCardAposta(aposta, apostaId) {
  const isHost = currentUserData.uid === aposta.hostId;
  const isAberta = aposta.status === 'aberta';
  const qtdApostadores = aposta.apostadores ? Object.keys(aposta.apostadores).length : 0;
  
  let html = `
    <div class="bet-card card" style="position: relative; padding-top: 40px;">
      <span class="bet-status ${isAberta ? 'status-aberta' : 'status-fechada'}">${isAberta ? '🟢 Aberta' : '🔴 Encerrada'}</span>
      ${aposta.privada ? `<span class="badge-privada"><i class="fas fa-lock"></i> Privada</span>` : `<span class="badge-publica"><i class="fas fa-globe"></i> Pública</span>`}
      
      <h3 style="margin-bottom:5px;">${aposta.titulo}</h3>
      <p style="font-size:13px; color:#666; margin-bottom:5px;">${aposta.comDinheiro ? '💵 Dinheiro' : '⚪ Gratuita'} | Dono: ${aposta.hostNome}</p>
      <div class="participant-count"><i class="fas fa-users"></i> ${qtdApostadores} participando</div>
      
      <div class="action-buttons">
        <button class="btn-outline" onclick="copiarLinkAposta('${apostaId}')"><i class="fas fa-link"></i> Copiar Link</button>
        <button class="btn-outline" onclick="copiarCodigo('${apostaId}')"><i class="fas fa-copy"></i> Código</button>
      </div>

      <div class="apostadores-list" style="margin-top: 15px;">`;
  
  let dropdownOptions = `<option value="">-- Ganhador --</option>`;
  if (aposta.apostadores) {
    Object.keys(aposta.apostadores).forEach(key => {
      const p = aposta.apostadores[key];
      const isWinner = aposta.vencedorUid === key;
      html += `
        <div class="participant-item">
          <img src="${p.fotoUrl}">
          <span><strong>${p.nome}</strong>: ${p.palpite} ${aposta.comDinheiro ? `(R$ ${p.valor})` : ''}</span>
          ${isWinner ? `<span class="winner-badge"><i class="fas fa-crown"></i> Venceu</span>` : ''}
        </div>`;
      dropdownOptions += `<option value="${key}">${p.nome}</option>`;
    });
  }
  html += `</div>`;

  // Painel Fazer Palpite (Se não participou ainda)
  const jaParticipou = aposta.apostadores && aposta.apostadores[currentUserData.uid];
  if (isAberta && !jaParticipou) {
    html += `
      <div style="margin-top:15px; border-top: 1px solid #eee; padding-top:10px;">
        <input type="text" id="palpite-${apostaId}" placeholder="Seu Palpite (Ex: 2x1)">
        ${aposta.comDinheiro ? `<input type="number" id="valor-${apostaId}" placeholder="R$" step="0.01">` : ''}
        <button class="btn btn-verde" style="padding: 10px;" onclick="fazerAposta('${apostaId}', ${aposta.comDinheiro}, false)">Fazer Palpite</button>
      </div>`;
  } else if (jaParticipou) {
     html += `<div style="margin-top:10px; text-align:center; color: var(--verde); font-weight:bold; font-size: 13px;"><i class="fas fa-check-circle"></i> Seu palpite está registrado!</div>`;
  }

  // Painel Host
  if (isHost && isAberta) {
    html += `
      <div class="host-panel">
        <h4>👑 Host</h4>
        <select id="select-winner-${apostaId}" style="width:100%; padding:8px; margin-bottom:5px;">${dropdownOptions}</select>
        <button class="btn btn-amarelo" style="padding: 8px;" onclick="definirVencedor('${apostaId}')">Coroar Vencedor</button>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function carregarApostas() {
  onValue(ref(db, 'apostas'), (snapshot) => {
    const destContainer = document.getElementById('bets-destaques-container');
    const todasContainer = document.getElementById('bets-todas-container');
    destContainer.innerHTML = ''; todasContainer.innerHTML = '';
    
    let apostasList = [];
    snapshot.forEach(child => apostasList.push({ id: child.key, ...child.val() }));
    
    // Calcula fama (qtd de apostadores)
    apostasList.forEach(a => { a.qtd = a.apostadores ? Object.keys(a.apostadores).length : 0; });
    
    // As mais famosas (Públicas, ordenadas por qtd descrescente)
    const emAlta = [...apostasList].filter(a => !a.privada && a.status === 'aberta').sort((a,b) => b.qtd - a.qtd).slice(0, 6);
    emAlta.forEach(a => destContainer.innerHTML += criarHTMLCardAposta(a, a.id));

    // Todas as Públicas + Privadas que eu criei ou participo
    apostasList.forEach(a => {
      const isMine = a.hostId === currentUserData.uid;
      const iParticipate = a.apostadores && a.apostadores[currentUserData.uid];
      if (!a.privada || isMine || iParticipate) {
        todasContainer.innerHTML += criarHTMLCardAposta(a, a.id);
      }
    });
  });
}

// LÓGICA DE ENTRAR POR CÓDIGO OU LINK
window.buscarApostaPorCodigo = function() {
  const codigo = document.getElementById('join-code-input').value.trim();
  if(!codigo) return alert("Digite o código.");
  buscarEAbirModalConvite(codigo);
}

async function buscarEAbirModalConvite(apostaId) {
  const snap = await get(ref(db, `apostas/${apostaId}`));
  if(!snap.exists()) return alert("Aposta não encontrada! Código inválido.");
  
  const aposta = snap.val();
  if (aposta.status !== 'aberta') return alert("Esta aposta já foi encerrada!");
  if (aposta.apostadores && aposta.apostadores[currentUserData.uid]) return alert("Você já está participando desta aposta!");

  const content = document.getElementById('invite-modal-content');
  content.innerHTML = `
    <h2 style="color: var(--verde);"><i class="fas fa-ticket-alt"></i> Convite Recebido</h2>
    <p style="margin-bottom: 15px;"><strong>${aposta.hostNome}</strong> te convidou para o bolão:</p>
    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <h3 style="margin:0;">${aposta.titulo}</h3>
      <span style="font-size: 12px; color: #555;">${aposta.comDinheiro ? '💵 Dinheiro' : '⚪ Gratuita'}</span>
    </div>
    <input type="text" id="modal-palpite" placeholder="Qual o placar? (Ex: 2x1)">
    ${aposta.comDinheiro ? `<input type="number" id="modal-valor" placeholder="Valor do Pix (R$)" step="0.01">` : ''}
    <button class="btn btn-verde" onclick="confirmarPalpiteModal('${apostaId}', ${aposta.comDinheiro})">Enviar Palpite e Entrar</button>
  `;
  document.getElementById('invite-modal').classList.remove('hidden');
}

window.confirmarPalpiteModal = function(apostaId, comDinheiro) {
  const palpite = document.getElementById('modal-palpite').value;
  let valor = 0;
  if(!palpite) return alert("Digite seu palpite!");
  
  if (comDinheiro) {
    valor = parseFloat(document.getElementById('modal-valor').value);
    if(isNaN(valor) || valor < 1) return alert("Insira um valor válido!");
  }

  push(ref(db, `apostas/${apostaId}/apostadores`), {
    uid: currentUserData.uid, nome: currentUserData.username, fotoUrl: currentUserData.photoUrl,
    palpite: palpite, valor: valor.toFixed(2)
  }).then(() => {
    alert("Palpite registrado com sucesso!");
    fecharModalConvite();
    document.querySelectorAll('.btn-sub-nav')[1].click(); // Vai pra aba "Explorar" ver a aposta lá
  });
}

// Função nativa de apostar pelos cards normais (Mantida e otimizada)
window.fazerAposta = function(apostaId, comDinheiro, isProxy) {
  let nome = currentUserData.username; let foto = currentUserData.photoUrl;
  let palpite = document.getElementById(`palpite-${apostaId}`).value;
  let valor = 0;
  if (!palpite) return alert("Preencha o palpite.");
  if (comDinheiro) {
    valor = parseFloat(document.getElementById(`valor-${apostaId}`).value);
    if (isNaN(valor) || valor <= 1.00) return alert("Valor inválido.");
  }
  push(ref(db, `apostas/${apostaId}/apostadores`), {
    uid: currentUserData.uid, nome: nome, fotoUrl: foto, palpite: palpite, valor: valor.toFixed(2)
  });
}

window.definirVencedor = function(apostaId) {
  const select = document.getElementById(`select-winner-${apostaId}`);
  if (!select.value) return alert("Selecione um vencedor!");
  if(confirm("Encerrar e coroar vencedor?")) {
    update(ref(db, `apostas/${apostaId}`), { status: 'finalizada', vencedorUid: select.value });
  }
}
