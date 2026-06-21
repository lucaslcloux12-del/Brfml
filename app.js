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

// === MENU HAMBÚRGUER E NAVEGAÇÃO CORRIGIDA ===
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');
const menuBackdrop = document.getElementById('menu-backdrop');

function toggleMenu() {
  menuToggle.classList.toggle('active');
  sidebar.classList.toggle('open');
  menuBackdrop.classList.toggle('open');
}

menuToggle.addEventListener('click', toggleMenu);
menuBackdrop.addEventListener('click', toggleMenu);

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', function() { // Usa "function()" para poder usar o "this"
    // Remove as marcações de todos
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    // Adiciona na aba selecionada
    this.classList.add('active');
    const targetId = this.getAttribute('data-target');
    document.getElementById(targetId).classList.add('active');
    
    // Fecha o menu depois de clicar
    if(sidebar.classList.contains('open')) toggleMenu();

    // Se for o chat, rola para a última mensagem perfeitamente
    if(targetId === 'tab-chat') {
       setTimeout(() => { // Timeout mínimo só pro navegador entender que a aba abriu
         const c = document.getElementById('chat-messages');
         c.scrollTop = c.scrollHeight;
       }, 50);
    }
  });
});


// === AUTENTICAÇÃO ===
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

// === PERFIL ===
async function uploadToCloudinary(file) {
  const f = new FormData(); f.append('file', file); f.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  try { return (await (await fetch(CLOUDINARY_URL, { method: 'POST', body: f })).json()).secure_url; } catch (err) { return null; }
}

document.getElementById('btn-save-profile').addEventListener('click', async () => {
  const username = document.getElementById('username-input').value;
  if (!username) return;
  let photoUrl = auth.currentUser.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
  const file = document.getElementById('profile-pic-input').files[0];
  if (file) {
    document.getElementById('btn-save-profile').innerText = "Enviando...";
    const url = await uploadToCloudinary(file);
    if (url) photoUrl = url;
  }
  set(ref(db, 'users/' + auth.currentUser.uid), { username, photoUrl, email: auth.currentUser.email, bio: '' });
});

document.getElementById('btn-update-profile').addEventListener('click', async () => {
  const username = document.getElementById('edit-username-input').value;
  const bio = document.getElementById('edit-bio-input').value;
  if (!username) return;
  let updates = { username, bio };
  const btn = document.getElementById('btn-update-profile');
  const file = document.getElementById('edit-profile-pic-input').files[0];
  if (file) {
    btn.innerText = "Enviando Foto...";
    const url = await uploadToCloudinary(file);
    if (url) updates.photoUrl = url;
  }
  update(ref(db, 'users/' + auth.currentUser.uid), updates).then(() => {
    btn.innerText = "Atualizar Perfil"; alert("Salvo!"); Object.assign(currentUserData, updates); iniciarApp();
  });
});

window.abrirPerfil = async function(uid) {
  const snap = await get(ref(db, 'users/' + uid));
  if(snap.exists()) {
    const user = snap.val();
    document.getElementById('modal-avatar').src = user.photoUrl;
    document.getElementById('modal-name').innerText = user.username;
    document.getElementById('modal-bio').innerText = user.bio || "Nenhuma biografia.";
    document.getElementById('profile-modal').classList.remove('hidden');
  }
}
document.getElementById('close-modal').addEventListener('click', () => { document.getElementById('profile-modal').classList.add('hidden'); });

function iniciarApp() {
  loadingScreen.classList.add('hidden');
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  
  document.getElementById('menu-username').innerText = currentUserData.username;
  document.getElementById('menu-avatar').src = currentUserData.photoUrl;
  document.getElementById('edit-username-input').value = currentUserData.username;
  document.getElementById('edit-bio-input').value = currentUserData.bio || '';
  document.getElementById('edit-avatar-preview').src = currentUserData.photoUrl;
  
  // Painel Admin da Tabela
  if (currentUserData.email === ADMIN_EMAIL) {
     document.getElementById('admin-match-controls').classList.remove('hidden');
  }

  carregarChat();
  carregarApostas();
  carregarJogos();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('aposta')) {
    document.querySelector('[data-target=tab-bets]').click();
    buscarEAbirModalConvite(urlParams.get('aposta'));
  }
}

// === LÓGICA DO CHAT CORRIGIDA ===
document.getElementById('btn-send-chat').addEventListener('click', enviarMensagem);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') enviarMensagem() });
document.getElementById('btn-cancel-reply').addEventListener('click', cancelarResposta);

function cancelarResposta() {
  msgRespondidaId = null;
  document.getElementById('reply-context').classList.add('hidden');
}

function responderMensagem(msgId, nome, texto) {
  msgRespondidaId = { id: msgId, nome, texto };
  document.getElementById('reply-name').innerText = nome;
  document.getElementById('reply-text').innerText = texto;
  document.getElementById('reply-context').classList.remove('hidden');
  document.getElementById('chat-input').focus();
}

function enviarMensagem() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return; // Se vazio, não envia
  
  const novaMsg = {
    uid: currentUserData.uid,
    nome: currentUserData.username,
    fotoUrl: currentUserData.photoUrl,
    texto: text,
    timestamp: Date.now(),
    apagada: false,
    lidoPor: {} 
  };

  if(msgRespondidaId) novaMsg.replyTo = msgRespondidaId;

  // Envio garantido para o Firebase
  push(ref(db, 'chats'), novaMsg).then(() => {
    input.value = ''; // Limpa o input
    cancelarResposta(); // Limpa estado de resposta
  }).catch(err => alert("Erro ao enviar mensagem: " + err));
}

document.addEventListener('click', (e) => {
  if(!e.target.closest('.context-menu')) document.querySelectorAll('.context-menu').forEach(m => m.remove());
});

function mostrarOpcoesMensagem(e, msgId, msgObj, isMine, bubbleEl) {
  e.preventDefault();
  document.querySelectorAll('.context-menu').forEach(m => m.remove()); 
  const isAdmin = currentUserData.email === ADMIN_EMAIL;
  if (msgObj.apagada && !isAdmin) return;

  const menu = document.createElement('div'); menu.className = 'context-menu';
  const rect = bubbleEl.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY}px`; menu.style.left = `${isMine ? rect.right - 150 : rect.left}px`;

  if(!msgObj.apagada) {
    const btnResp = document.createElement('button'); btnResp.innerHTML = '<i class="fas fa-reply"></i> Responder';
    btnResp.onclick = () => responderMensagem(msgId, msgObj.nome, msgObj.texto);
    menu.appendChild(btnResp);
  }

  if ((isMine || isAdmin) && !msgObj.apagada) {
    const btnApag = document.createElement('button'); btnApag.className = 'text-danger'; btnApag.innerHTML = '<i class="fas fa-trash"></i> Apagar';
    btnApag.onclick = () => { if(confirm("Apagar mensagem?")) update(ref(db, `chats/${msgId}`), { apagada: true, texto: null, replyTo: null }); };
    menu.appendChild(btnApag);
  }

  if (isAdmin && msgObj.apagada) {
    const btnAdmin = document.createElement('button'); btnAdmin.className = 'text-danger'; btnAdmin.innerHTML = '<i class="fas fa-eraser"></i> Excluir Rastro (Admin)';
    btnAdmin.onclick = () => { if(confirm("Remover permanentemente?")) remove(ref(db, `chats/${msgId}`)); };
    menu.appendChild(btnAdmin);
  }

  if(menu.children.length > 0) document.body.appendChild(menu);
}

function carregarChat() {
  onValue(ref(db, 'chats'), (snapshot) => {
    const isChatVisible = document.getElementById('tab-chat').classList.contains('active');
    const container = document.getElementById('chat-messages');
    let needsScroll = container.scrollTop + container.clientHeight >= container.scrollHeight - 50;
    container.innerHTML = '';
    
    snapshot.forEach(child => {
      const msg = child.val(); const msgId = child.key; const isMine = msg.uid === currentUserData.uid;

      if (isChatVisible && !isMine && (!msg.lidoPor || !msg.lidoPor[currentUserData.uid])) {
        update(ref(db, `chats/${msgId}/lidoPor/${currentUserData.uid}`), currentUserData.username);
      }

      const row = document.createElement('div'); row.className = `msg-row ${isMine ? 'mine' : 'theirs'}`;
      let html = '';
      if (!isMine) html += `<img src="${msg.fotoUrl || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="chat-avatar-small" onclick="abrirPerfil('${msg.uid}')">`;
      html += `<div class="bubble">`;
      if (!isMine && !msg.apagada) html += `<span class="bubble-name">${msg.nome}</span>`;
      if (msg.apagada) { html += `<p class="msg-deleted"><i class="fas fa-ban"></i> Mensagem apagada</p>`; } 
      else {
        if (msg.replyTo) html += `<div class="replied-to-box"><strong>${msg.replyTo.nome}</strong>${msg.replyTo.texto}</div>`;
        html += `<p>${msg.texto}</p>`;
      }
      html += `<span class="bubble-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
      
      if (isMine && !msg.apagada && msg.lidoPor) {
        const nomesLidos = Object.values(msg.lidoPor);
        if(nomesLidos.length > 0) html += `<span class="read-receipts"><i class="fas fa-check-double"></i> Lido por: ${nomesLidos.join(', ')}</span>`;
      }
      html += `</div>`; row.innerHTML = html;

      const bubbleEl = row.querySelector('.bubble');
      let pressTimer;
      const startPress = (e) => { pressTimer = setTimeout(() => { mostrarOpcoesMensagem(e, msgId, msg, isMine, bubbleEl) }, 600); };
      const cancelPress = () => clearTimeout(pressTimer);

      bubbleEl.addEventListener('mousedown', startPress); bubbleEl.addEventListener('mouseup', cancelPress); bubbleEl.addEventListener('mouseleave', cancelPress);
      bubbleEl.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; startPress(e); }, {passive: true});
      bubbleEl.addEventListener('touchend', cancelPress); bubbleEl.addEventListener('touchmove', cancelPress);

      let touchStartX = 0;
      bubbleEl.addEventListener('touchend', (e) => {
        if (e.changedTouches[0].screenX - touchStartX > 60 && !msg.apagada) responderMensagem(msgId, msg.nome, msg.texto);
      });
      bubbleEl.addEventListener('dblclick', () => { if(!msg.apagada) responderMensagem(msgId, msg.nome, msg.texto); });

      container.appendChild(row);
    });
    if(needsScroll) container.scrollTop = container.scrollHeight;
  });
}

// === JOGOS DA COPA (TABELA ADMIN) ===
window.adicionarJogoBD = function() {
  const data = document.getElementById('admin-match-date').value;
  const t1 = document.getElementById('admin-match-t1').value;
  const t2 = document.getElementById('admin-match-t2').value;
  const venue = document.getElementById('admin-match-venue').value;

  if(!data || !t1 || !t2) return alert("Preencha ao menos data e os dois times!");

  push(ref(db, 'jogos'), { data, t1, t2, venue }).then(() => {
    alert("Jogo adicionado à tabela com sucesso!");
    document.getElementById('admin-match-date').value = '';
    document.getElementById('admin-match-t1').value = '';
    document.getElementById('admin-match-t2').value = '';
    document.getElementById('admin-match-venue').value = '';
  });
}

window.apagarJogo = function(jogoId) {
  if(confirm("Admin: Deseja apagar este jogo da tabela permanentemente?")) {
    remove(ref(db, `jogos/${jogoId}`));
  }
}

function carregarJogos() {
  onValue(ref(db, 'jogos'), (snapshot) => {
    const container = document.getElementById('matches-container');
    container.innerHTML = '';
    const isAdmin = currentUserData.email === ADMIN_EMAIL;
    
    if(!snapshot.exists()) {
      container.innerHTML = '<p style="text-align:center; color:#666;">A tabela de jogos ainda não foi definida.</p>';
      return;
    }

    snapshot.forEach(child => {
      const j = child.val();
      container.innerHTML += `
        <div class="match-card card">
          ${isAdmin ? `<button class="admin-delete-btn" onclick="apagarJogo('${child.key}')"><i class="fas fa-trash"></i></button>` : ''}
          <div class="match-date"><i class="fas fa-clock"></i> ${j.data}</div>
          <div class="match-teams"><div class="team">${j.t1}</div><div class="vs">X</div><div class="team">${j.t2}</div></div>
          <div class="match-venue"><i class="fas fa-map-marker-alt"></i> ${j.venue || 'A definir'}</div>
        </div>
      `;
    });
  });
}

// === CENTRAL DE APOSTAS ===
document.getElementById('btn-create-bet').addEventListener('click', () => {
  const title = document.getElementById('bet-title').value;
  const isMoney = document.getElementById('bet-is-money').checked;
  const visibilidade = document.querySelector('input[name="bet-visibility"]:checked').value;
  if (!title) return alert("Dê um título para o bolão!");

  push(ref(db, 'apostas'), {
    titulo: title, comDinheiro: isMoney, privada: visibilidade === 'privada', status: 'aberta', 
    vencedorUid: '', hostId: currentUserData.uid, hostNome: currentUserData.username, apostadores: {}
  });
  document.getElementById('bet-title').value = '';
  document.querySelectorAll('.btn-sub-nav')[2].click(); // Vai pra "Meus Bolões"
});

window.copiarLinkAposta = (id) => { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?aposta=${id}`).then(() => alert("Link copiado!")); }
window.copiarCodigo = (id) => { navigator.clipboard.writeText(id).then(() => alert("Código copiado: " + id)); }

function criarHTMLCardAposta(aposta, apostaId) {
  const isHost = currentUserData.uid === aposta.hostId;
  const isAberta = aposta.status === 'aberta';
  const qtdApostadores = aposta.apostadores ? Object.keys(aposta.apostadores).length : 0;
  
  let html = `
    <div class="bet-card card">
      <span style="font-size:12px; font-weight:bold; color: ${isAberta?'var(--verde)':'#d32f2f'};">${isAberta ? '🟢 Aberta' : '🔴 Encerrada'}</span>
      ${aposta.privada ? `<span class="badge-privada"><i class="fas fa-lock"></i> Privada</span>` : `<span class="badge-publica"><i class="fas fa-globe"></i> Pública</span>`}
      <h3 style="margin-top:10px; margin-bottom:5px;">${aposta.titulo}</h3>
      <p style="font-size:13px; color:#666; margin-bottom:5px;">${aposta.comDinheiro ? '💵 Dinheiro' : '⚪ Gratuita'} | Dono: ${aposta.hostNome}</p>
      <div style="font-size: 13px; color: #666; margin-bottom: 10px;"><i class="fas fa-users" style="color:var(--amarelo);"></i> ${qtdApostadores} participando</div>
      
      <div class="action-buttons">
        <button class="btn-outline" onclick="copiarLinkAposta('${apostaId}')"><i class="fas fa-link"></i> Link</button>
        <button class="btn-outline" onclick="copiarCodigo('${apostaId}')"><i class="fas fa-copy"></i> Código</button>
      </div>
      <div class="apostadores-list" style="margin-top: 15px;">`;
  
  let dropdownOptions = `<option value="">-- Escolher Ganhador --</option>`;
  if (aposta.apostadores) {
    Object.keys(aposta.apostadores).forEach(key => {
      const p = aposta.apostadores[key];
      html += `
        <div class="participant-item">
          <img src="${p.fotoUrl}">
          <span><strong>${p.nome}</strong>: ${p.palpite} ${aposta.comDinheiro ? `(R$ ${p.valor})` : ''}</span>
          ${aposta.vencedorUid === key ? `<span style="margin-left:auto; color:var(--amarelo);"><i class="fas fa-crown"></i> Venceu</span>` : ''}
        </div>`;
      dropdownOptions += `<option value="${key}">${p.nome}</option>`;
    });
  }
  html += `</div>`;

  const jaParticipou = aposta.apostadores && aposta.apostadores[currentUserData.uid];
  if (isAberta && !jaParticipou) {
    html += `
      <div style="margin-top:15px; border-top: 1px solid #eee; padding-top:10px;">
        <input type="text" id="palpite-${apostaId}" placeholder="Seu Palpite (Ex: 2x1)">
        ${aposta.comDinheiro ? `<input type="number" id="valor-${apostaId}" placeholder="R$" step="0.01">` : ''}
        <button class="btn btn-verde" style="padding: 10px;" onclick="fazerAposta('${apostaId}', ${aposta.comDinheiro})">Fazer Palpite</button>
      </div>`;
  } else if (jaParticipou) {
     html += `<div style="margin-top:10px; text-align:center; color: var(--verde); font-weight:bold; font-size: 13px;"><i class="fas fa-check-circle"></i> Seu palpite está registrado!</div>`;
  }

  if (isHost && isAberta) {
    html += `
      <div style="margin-top:15px; background:#fff8e1; padding:10px; border-radius:8px; border: 1px dashed var(--amarelo);">
        <h4>👑 Painel do Host</h4>
        <select id="select-winner-${apostaId}" style="width:100%; padding:8px; margin-bottom:5px;">${dropdownOptions}</select>
        <button class="btn btn-amarelo" style="padding: 8px;" onclick="definirVencedor('${apostaId}')">Encerrar e Coroar</button>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function carregarApostas() {
  onValue(ref(db, 'apostas'), (snapshot) => {
    const destContainer = document.getElementById('bets-destaques-container');
    const todasContainer = document.getElementById('bets-todas-container');
    const meusContainer = document.getElementById('bets-meus-container');
    
    destContainer.innerHTML = ''; todasContainer.innerHTML = ''; meusContainer.innerHTML = '';
    
    let apostasList = [];
    snapshot.forEach(child => apostasList.push({ id: child.key, ...child.val(), qtd: child.val().apostadores ? Object.keys(child.val().apostadores).length : 0 }));
    
    // Meus Bolões (Que eu sou host)
    apostasList.filter(a => a.hostId === currentUserData.uid).forEach(a => meusContainer.innerHTML += criarHTMLCardAposta(a, a.id));

    // Destaques (Públicas mais cheias)
    [...apostasList].filter(a => !a.privada && a.status === 'aberta').sort((a,b) => b.qtd - a.qtd).slice(0, 6).forEach(a => destContainer.innerHTML += criarHTMLCardAposta(a, a.id));

    // Explorar (Públicas ou que participo)
    apostasList.forEach(a => {
      const iParticipate = a.apostadores && a.apostadores[currentUserData.uid];
      if (!a.privada || iParticipate) todasContainer.innerHTML += criarHTMLCardAposta(a, a.id);
    });
  });
}

window.fazerAposta = function(apostaId, comDinheiro) {
  let palpite = document.getElementById(`palpite-${apostaId}`).value;
  let valor = 0;
  if (!palpite) return alert("Preencha o palpite.");
  if (comDinheiro) {
    valor = parseFloat(document.getElementById(`valor-${apostaId}`).value);
    if (isNaN(valor) || valor < 1.00) return alert("Valor inválido.");
  }
  push(ref(db, `apostas/${apostaId}/apostadores`), { uid: currentUserData.uid, nome: currentUserData.username, fotoUrl: currentUserData.photoUrl, palpite: palpite, valor: valor.toFixed(2) });
}

window.definirVencedor = function(apostaId) {
  const select = document.getElementById(`select-winner-${apostaId}`);
  if (!select.value) return alert("Selecione um vencedor!");
  if(confirm("Encerrar e coroar vencedor?")) update(ref(db, `apostas/${apostaId}`), { status: 'finalizada', vencedorUid: select.value });
}

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

  document.getElementById('invite-modal-content').innerHTML = `
    <h2 style="color: var(--verde);"><i class="fas fa-ticket-alt"></i> Convite</h2>
    <p><strong>${aposta.hostNome}</strong> te convidou para:</p>
    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <h3 style="margin:0;">${aposta.titulo}</h3>
      <span style="font-size: 12px;">${aposta.comDinheiro ? '💵 Dinheiro' : '⚪ Gratuita'}</span>
    </div>
    <input type="text" id="modal-palpite" placeholder="Qual o placar?">
    ${aposta.comDinheiro ? `<input type="number" id="modal-valor" placeholder="Valor (R$)" step="0.01">` : ''}
    <button class="btn btn-verde" onclick="confirmarPalpiteModal('${apostaId}', ${aposta.comDinheiro})">Entrar na Aposta</button>
  `;
  document.getElementById('invite-modal').classList.remove('hidden');
}

window.confirmarPalpiteModal = function(apostaId, comDinheiro) {
  const palpite = document.getElementById('modal-palpite').value;
  let valor = 0;
  if(!palpite) return alert("Digite seu palpite!");
  if (comDinheiro) { valor = parseFloat(document.getElementById('modal-valor').value); if(isNaN(valor) || valor < 1) return alert("Valor inválido!"); }
  push(ref(db, `apostas/${apostaId}/apostadores`), { uid: currentUserData.uid, nome: currentUserData.username, fotoUrl: currentUserData.photoUrl, palpite: palpite, valor: valor.toFixed(2) }).then(() => {
    alert("Palpite registrado!"); fecharModalConvite(); document.querySelectorAll('.btn-sub-nav')[1].click(); 
  });
                                           }
