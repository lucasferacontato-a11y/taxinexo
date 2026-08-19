const API_BASE = (window.location.hostname === 'localhost' && window.location.port === '8080')
  ? 'http://localhost:3000/api' 
  : '/api';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value || 0);
};

const appState = {
  token: localStorage.getItem('taxinexo_token') || null,
  user: null,
  balance: 0.00,
  dailyIncome: 0.00,
  totalIncome: 0.00,
  balanceVisible: true,
  theme: 'dark',
  currentFilter: 'all',
  activeVehicles: [],
  products: [
    {
      id: 'NX-101',
      name: 'Tesla Robotaxi Model 3',
      category: 'economy',
      status: 'Disponível',
      price: 150.00,
      dailyReturn: 14.50,
      periodDays: 30,
      checkoutUrl: 'login.html',
      description: 'Veículo elétrico autônomo para corridas urbanas diárias.'
    },
    {
      id: 'NX-202',
      name: 'Baidu Apollo RT6',
      category: 'popular',
      status: 'Alta Demanda',
      price: 350.00,
      dailyReturn: 36.00,
      periodDays: 45,
      checkoutUrl: 'login.html',
      description: 'Robotaxi com 38 sensores LiDAR e IA de nível 4 integrada.'
    },
    {
      id: 'NX-707',
      name: 'Tesla Cybercab Next-Gen',
      category: 'popular',
      status: 'Alta Demanda',
      price: 600.00,
      dailyReturn: 68.00,
      periodDays: 40,
      checkoutUrl: 'login.html',
      description: 'Frota de carregamento por indução e operação 24/7 sem volante.'
    },
    {
      id: 'NX-404',
      name: 'Cruise Origin Autonomous',
      category: 'popular',
      status: 'Alta Demanda',
      price: 900.00,
      dailyReturn: 105.00,
      periodDays: 45,
      checkoutUrl: 'login.html',
      description: 'Lançadeira autônoma espaçosa para transporte compartilhado.'
    },
    {
      id: 'NX-303',
      name: 'Waymo Autonomous Van',
      category: 'vip',
      status: 'VIP',
      price: 1500.00,
      dailyReturn: 185.00,
      periodDays: 60,
      checkoutUrl: 'login.html',
      description: 'Van autônoma de alta capacidade operando em rotas corporativas.'
    },
    {
      id: 'NX-505',
      name: 'Zoox Urban Bi-Directional',
      category: 'vip',
      status: 'VIP',
      price: 2800.00,
      dailyReturn: 360.00,
      periodDays: 60,
      checkoutUrl: 'login.html',
      description: 'Veículo bidirecional com tração nas 4 rodas para tráfego denso.'
    },
    {
      id: 'NX-606',
      name: 'NIO Autonomous Executive Fleet',
      category: 'vip',
      status: 'VIP',
      price: 5000.00,
      dailyReturn: 720.00,
      periodDays: 90,
      checkoutUrl: 'login.html',
      description: 'Frota executiva premium com troca de bateria em 3 min.'
    }
  ],
  team: {
    totalMembers: 0,
    activeMembers: 0,
    totalCommission: 0.00,
    levels: [
      { id: 1, name: 'Nível 1 (Diretos)', percent: 10, members: 0, generated: 0.00, icon: 'fa-users-viewfinder' },
      { id: 2, name: 'Nível 2', percent: 5, members: 0, generated: 0.00, icon: 'fa-network-wired' },
      { id: 3, name: 'Nível 3', percent: 2, members: 0, generated: 0.00, icon: 'fa-diagram-project' }
    ]
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  
  // Se não estiver logado, redireciona para login.html
  if (!appState.token) {
    window.location.href = 'login.html';
    return;
  }

  await loadUserData();
});

async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (appState.token) {
    headers['Authorization'] = `Bearer ${appState.token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (res.status === 401) {
      localStorage.removeItem('taxinexo_token');
      window.location.href = 'login.html';
      return null;
    }

    return await res.json();
  } catch (err) {
    console.warn(`API [${endpoint}] offline.`, err);
    return null;
  }
}

async function loadUserData() {
  // 1. Carrega Perfil do Usuário
  const me = await apiRequest('/auth/me');
  if (me && me.id) {
    appState.user = me;
    updateUserHeader(me);
  }

  // 2. Carrega Resumo da Carteira (Saldo, Rendimento do Dia e Total)
  const wallet = await apiRequest('/wallet/summary');
  if (wallet) {
    appState.balance = wallet.balance || 0.00;
    appState.dailyIncome = wallet.dailyIncome || 0.00;
    appState.totalIncome = wallet.totalIncome || 0.00;

    const balEl = document.getElementById('user-balance');
    if (balEl && appState.balanceVisible) balEl.textContent = formatCurrency(appState.balance);

    const dailyEl = document.getElementById('stat-daily-income');
    if (dailyEl) dailyEl.textContent = `+ R$ ${formatCurrency(appState.dailyIncome)}`;

    const totEl = document.getElementById('stat-total-income');
    if (totEl) totEl.textContent = `R$ ${formatCurrency(appState.totalIncome)}`;
  }

  // 3. Carrega Contratos de Veículos Ativos
  const contracts = await apiRequest('/fleet/my-contracts');
  if (contracts && Array.isArray(contracts)) {
    appState.activeVehicles = contracts.map(c => ({
      id: c.id,
      name: c.productName,
      dailyEarned: c.dailyReturn,
      daysLeft: c.daysRemaining,
      totalDays: c.totalDays,
      status: c.status
    }));
  }

  // 4. Carrega Dados de Equipe do Usuário
  const team = await apiRequest('/team/overview');
  if (team) {
    appState.team = team;
  }

  // Renderiza todos os componentes
  renderProducts();
  renderActiveVehicles();
  renderTeamData();
  renderReferralCard();
  updateCategoryCounts();
}


function updateUserHeader(user) {
  const greetingEl = document.getElementById('user-greeting');
  if (greetingEl) {
    const hour = new Date().getHours();
    let greeting = 'Boa noite';
    if (hour >= 5 && hour < 12) greeting = 'Bom dia';
    else if (hour >= 12 && hour < 18) greeting = 'Boa tarde';

    greetingEl.innerHTML = `${greeting}, <br><strong>${user.operatorName}</strong>`;
  }

  const profileTitle = document.getElementById('profile-operator-title');
  if (profileTitle) profileTitle.textContent = user.operatorName;

  const profilePhone = document.getElementById('profile-operator-phone');
  if (profilePhone) profilePhone.textContent = `+55 ${user.phone}`;

  const inviteInput = document.getElementById('invite-code');
  if (inviteInput) inviteInput.value = getAffiliateLink();
}


function updateCategoryCounts() {
  const countAll = document.getElementById('count-all');
  const countPopular = document.getElementById('count-popular');
  const countVip = document.getElementById('count-vip');
  const countEconomy = document.getElementById('count-economy');

  if (countAll) countAll.textContent = appState.products.length;
  if (countPopular) countPopular.textContent = appState.products.filter(p => p.category === 'popular').length;
  if (countVip) countVip.textContent = appState.products.filter(p => p.category === 'vip').length;
  if (countEconomy) countEconomy.textContent = appState.products.filter(p => p.category === 'economy').length;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) targetPane.classList.add('active');

  const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(b => 
    b.getAttribute('onclick')?.includes(tabId)
  );
  if (activeBtn) activeBtn.classList.add('active');
}

function renderProducts(filter = 'all') {
  const container = document.getElementById('product-list-container');
  if (!container) return;

  appState.currentFilter = filter;

  let filteredProducts = appState.products;
  if (filter === 'popular') {
    filteredProducts = appState.products.filter(p => p.category === 'popular');
  } else if (filter === 'vip') {
    filteredProducts = appState.products.filter(p => p.category === 'vip');
  } else if (filter === 'economy') {
    filteredProducts = appState.products.filter(p => p.category === 'economy');
  }

  container.innerHTML = filteredProducts.map(prod => {
    let statusClass = 'available';
    if (prod.status === 'Alta Demanda') statusClass = 'hot';
    if (prod.status === 'VIP') statusClass = 'vip';

    const totalReturn = prod.dailyReturn * prod.periodDays;
    const profit = totalReturn - prod.price;
    const roiPercent = Math.round((profit / prod.price) * 100);

    return `
      <article class="vehicle-card" data-category="${prod.category}">
        <div class="vehicle-header">
          <div>
            <h5>${prod.name}</h5>
            <span class="contract-id">Código: #${prod.id} • ${prod.periodDays} Dias</span>
          </div>
          <span class="status-badge ${statusClass}">${prod.status}</span>
        </div>
        
        <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.3;">
          ${prod.description}
        </p>

        <div class="vehicle-metrics">
          <div class="metric">
            <span class="m-title">Preço Contrato</span>
            <span class="m-val">R$ ${formatCurrency(prod.price)}</span>
          </div>
          <div class="metric">
            <span class="m-title">Renda Diária</span>
            <span class="m-val" style="color: var(--accent-green);">+ R$ ${formatCurrency(prod.dailyReturn)}</span>
          </div>
          <div class="metric">
            <span class="m-title">Retorno Estimado</span>
            <span class="m-val" style="color: var(--primary);">R$ ${formatCurrency(totalReturn)}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 0 4px; font-size: 11px; color: var(--text-muted);">
          <span>Lucro Líquido Estimado:</span>
          <strong style="color: var(--accent-green); font-size: 12px;">+ R$ ${formatCurrency(profit)} (+${roiPercent}%)</strong>
        </div>

        <button class="btn btn-primary btn-block" onclick="hireVehicle('${prod.id}')">
          <i class="fa-solid fa-key"></i> Contratar Veículo
        </button>
      </article>
    `;
  }).join('');
}

function filterProducts(category) {
  document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.remove('active'));
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
  renderProducts(category);
}

function renderActiveVehicles() {
  const container = document.getElementById('active-vehicles-container');
  const countEl = document.getElementById('active-count');
  if (!container || !countEl) return;

  countEl.textContent = appState.activeVehicles.length;

  if (appState.activeVehicles.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 16px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
        <i class="fa-solid fa-car" style="font-size: 28px; color: var(--text-muted); margin-bottom: 8px;"></i>
        <p style="color: var(--text-muted); font-size: 12px;">Nenhum veículo em operação no momento.</p>
        <button class="btn btn-primary" onclick="switchTab('products')" style="margin-top: 10px; padding: 8px 16px; font-size: 12px;">
          Explorar Frotas Disponíveis
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = appState.activeVehicles.map(vehicle => {
    const progressPct = Math.round(((vehicle.totalDays - vehicle.daysLeft) / vehicle.totalDays) * 100);
    
    return `
      <div class="vehicle-card active-item">
        <div class="vehicle-header">
          <div>
            <h5>${vehicle.name}</h5>
            <span class="contract-id">Contrato #${vehicle.id}</span>
          </div>
          <span class="status-badge running"><i class="fa-solid fa-circle"></i> ${vehicle.status}</span>
        </div>
        <div class="vehicle-metrics">
          <div class="metric">
            <span class="m-title">Ganho Diário</span>
            <span class="m-val" style="color: var(--accent-green);">+ R$ ${formatCurrency(vehicle.dailyEarned)}</span>
          </div>
          <div class="metric">
            <span class="m-title">Tempo Restante</span>
            <span class="m-val">${vehicle.daysLeft} de ${vehicle.totalDays} dias</span>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%;" data-target="${progressPct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  setTimeout(() => {
    document.querySelectorAll('.progress-fill').forEach(bar => {
      bar.style.width = bar.getAttribute('data-target');
    });
  }, 50);
}

function renderTeamData() {
  const metricsContainer = document.getElementById('team-metrics-container');
  const levelsContainer = document.getElementById('team-levels-container');
  if (!metricsContainer || !levelsContainer) return;

  metricsContainer.innerHTML = `
    <div class="metric-box">
      <span class="num">${appState.team.totalMembers}</span>
      <span class="desc">Membros Totais</span>
    </div>
    <div class="metric-box">
      <span class="num">${appState.team.activeMembers}</span>
      <span class="desc">Membros Ativos</span>
    </div>
    <div class="metric-box">
      <span class="num" style="color: var(--accent-green);">R$ ${formatCurrency(appState.team.totalCommission)}</span>
      <span class="desc">Comissão Total</span>
    </div>
  `;

  levelsContainer.innerHTML = appState.team.levels.map(lvl => `
    <div class="level-card">
      <div class="lvl-header">
        <span><i class="fa-solid ${lvl.icon}"></i> ${lvl.name}</span>
        <strong style="color: var(--primary);">${lvl.percent}%</strong>
      </div>
      <p>${lvl.members} membros ativos • R$ ${formatCurrency(lvl.generated)} gerados</p>
    </div>
  `).join('');

  renderReferralCard();
}

function getAffiliateLink() {
  const code = (appState.user && appState.user.inviteCode) ? appState.user.inviteCode : 'NEXO8843';
  const origin = window.location.origin;
  const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  return `${origin}${path}login.html?ref=${code}`;
}

function renderReferralCard() {
  const container = document.getElementById('referral-box-container');
  if (!container) return;

  const hasActiveContract = appState.activeVehicles && appState.activeVehicles.length > 0;
  const code = (appState.user && appState.user.inviteCode) ? appState.user.inviteCode : 'NEXO8843';
  const fullLink = getAffiliateLink();

  if (!hasActiveContract) {
    // ESTADO BLOQUEADO: Usuário ainda não ativou nenhum contrato
    container.innerHTML = `
      <div class="referral-box locked-affiliate" style="text-align: center; border: 1px dashed rgba(250, 219, 95, 0.4); background: rgba(250, 219, 95, 0.05); padding: 24px 18px; border-radius: var(--radius-md);">
        <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(250, 219, 95, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; color: var(--accent-gold); font-size: 22px;">
          <i class="fa-solid fa-lock"></i>
        </div>
        <h4 style="color: #fff; font-size: 16px; margin-bottom: 6px; font-weight: 700;">Código de Afiliado Bloqueado</h4>
        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px; max-width: 340px; margin-left: auto; margin-right: auto;">
          Para liberar seu link de indicação e receber até <strong>10% de comissão diária</strong> em 3 níveis, ative sua primeira frota autônoma.
        </p>
        <button class="btn btn-primary" onclick="switchTab('products')" style="padding: 10px 22px; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-bolt"></i> Ativar Minha Primeira Frota
        </button>
      </div>
    `;
  } else {
    // ESTADO LIBERADO: Usuário possui contrato ativo
    container.innerHTML = `
      <div class="referral-box unlocked-affiliate" style="border: 1px solid var(--border-bright); background: rgba(0, 240, 255, 0.04); padding: 20px 16px; border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span class="ref-title" style="color: var(--primary); font-weight: 700; font-size: 13px;">
            <i class="fa-solid fa-circle-check" style="color: var(--accent-green);"></i> Seu Link de Afiliado Oficial
          </span>
          <span style="font-size: 11px; background: rgba(0, 255, 136, 0.15); color: var(--accent-green); padding: 3px 8px; border-radius: 12px; font-weight: 700;">Liberado</span>
        </div>
        
        <div class="copy-field" style="margin-bottom: 10px;">
          <input type="text" id="invite-code" value="${fullLink}" readonly aria-label="Link de convite" style="font-size: 12px; font-family: monospace;">
          <button class="btn-copy" id="btn-copy" onclick="copyInviteCode()" aria-label="Copiar link direto" style="min-width: 95px;">
            <i class="fa-regular fa-copy"></i> <span id="copy-text">Copiar Link</span>
          </button>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; gap: 6px;">
          <span>Código: <strong style="color: #fff; font-family: monospace;">${code}</strong></span>
          <a href="https://api.whatsapp.com/send?text=${encodeURIComponent('🚀 Acesse o TAXINEXO comigo e receba rendimentos diários com frotas de táxis autônomos! Cadastre-se pelo meu link oficial: ' + fullLink)}" target="_blank" style="color: var(--accent-green); text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
            <i class="fa-brands fa-whatsapp" style="font-size: 15px;"></i> Compartilhar no WhatsApp
          </a>
        </div>
        
        <div class="copy-feedback" id="copy-feedback" style="display: none; color: var(--accent-green); font-size: 11px; margin-top: 8px; text-align: center;">
          <i class="fa-solid fa-check"></i> Link direto com seu código de convite copiado com sucesso!
        </div>
      </div>
    `;
  }
}

function copyInviteCode() {
  const fullLink = getAffiliateLink();
  const btn = document.getElementById('btn-copy');
  const copyText = document.getElementById('copy-text');
  const feedback = document.getElementById('copy-feedback');

  navigator.clipboard.writeText(fullLink).then(() => {
    if (btn) btn.classList.add('success');
    if (copyText) copyText.textContent = 'Copiado!';
    if (feedback) {
      feedback.style.display = 'block';
      setTimeout(() => { feedback.style.display = 'none'; }, 3000);
    }
    setTimeout(() => {
      if (btn) btn.classList.remove('success');
      if (copyText) copyText.textContent = 'Copiar Link';
    }, 2500);
  }).catch(() => {
    const input = document.getElementById('invite-code');
    if (input) {
      input.select();
      document.execCommand('copy');
      if (copyText) copyText.textContent = 'Copiado!';
    }
  });
}


function hireVehicle(productId) {
  const prod = appState.products.find(p => p.id === productId);
  if (!prod) return;

  // Se o saldo for menor que o preço do plano
  if (appState.balance < prod.price) {
    if (prod.checkoutUrl) {
      if (confirm(`Saldo insuficiente! (Você possui R$ ${formatCurrency(appState.balance)} e o contrato custa R$ ${formatCurrency(prod.price)}).\n\nDeseja pagar R$ ${formatCurrency(prod.price)} agora no Pix Seguro do Cartpanda Pay?`)) {
        window.open(prod.checkoutUrl, '_blank');
        return;
      }
    }
    openModal('modal-deposit');
    return;
  }

  if (confirm(`Confirmar contratação de ${prod.name} por R$ ${formatCurrency(prod.price)}?\n\nRendimento Diário: + R$ ${formatCurrency(prod.dailyReturn)}\nDuração: ${prod.periodDays} dias`)) {
    hireVehicleWithBalance(prod);
  }
}

async function hireVehicleWithBalance(prod) {
  const res = await apiRequest('/fleet/hire', 'POST', { productId: prod.id });

  if (res && res.contract) {
    appState.balance = res.newBalance;
    appState.activeVehicles.unshift({
      id: res.contract.id,
      name: res.contract.productName,
      dailyEarned: res.contract.dailyReturn,
      daysLeft: res.contract.daysRemaining,
      totalDays: res.contract.totalDays,
      status: res.contract.status
    });

    const balanceEl = document.getElementById('user-balance');
    if (balanceEl && appState.balanceVisible) balanceEl.textContent = formatCurrency(appState.balance);

    renderActiveVehicles();
    alert('🎉 Contrato ativado com sucesso! Rendimentos serão creditados diariamente.');
    switchTab('home');
  } else if (res && res.error) {
    alert(`Erro: ${res.error}`);
  }
}

function setupEventListeners() {
  const toggleBalanceBtn = document.getElementById('toggle-balance');
  const balanceEl = document.getElementById('user-balance');
  const iconBtn = toggleBalanceBtn?.querySelector('i');

  toggleBalanceBtn?.addEventListener('click', () => {
    appState.balanceVisible = !appState.balanceVisible;
    if (appState.balanceVisible) {
      balanceEl.classList.remove('blurred');
      iconBtn.className = 'fa-regular fa-eye';
      toggleBalanceBtn.setAttribute('aria-label', 'Ocultar saldo');
    } else {
      balanceEl.classList.add('blurred');
      iconBtn.className = 'fa-regular fa-eye-slash';
      toggleBalanceBtn.setAttribute('aria-label', 'Mostrar saldo');
    }
  });

  const themeBtn = document.getElementById('btn-theme-toggle');
  themeBtn?.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    appState.theme = isLight ? 'light' : 'dark';
    themeBtn.style.transform = 'rotate(360deg)';
    setTimeout(() => themeBtn.style.transform = 'none', 300);
    themeBtn.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  });

  const btnNotification = document.getElementById('btn-notification');
  btnNotification?.addEventListener('click', () => {
    const dot = btnNotification.querySelector('.badge-dot');
    if (dot) dot.classList.remove('pulse');
    alert('Nenhuma notificação pendente.');
  });
}

function copyInviteCode() {
  const codeInput = document.getElementById('invite-code');
  const btnCopy = document.getElementById('btn-copy');
  const feedback = document.getElementById('copy-feedback');
  if (!codeInput || !btnCopy) return;

  navigator.clipboard.writeText(codeInput.value).then(() => {
    btnCopy.classList.add('success');
    btnCopy.innerHTML = '<i class="fa-solid fa-check"></i> <span>Copiado</span>';
    if (feedback) feedback.classList.add('show');

    setTimeout(() => {
      btnCopy.classList.remove('success');
      btnCopy.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Copiar</span>';
      if (feedback) feedback.classList.remove('show');
    }, 2500);
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  if (modalId === 'modal-withdraw') {
    const withdrawAvail = document.getElementById('withdraw-available');
    if (withdrawAvail) withdrawAvail.textContent = `R$ ${formatCurrency(appState.balance)}`;
  }
  
  modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    const inputs = modal.querySelectorAll('input');
    inputs.forEach(input => input.value = '');
  }
}

function closeModalOutside(event, modalId) {
  if (event.target.id === modalId) closeModal(modalId);
}

function setDepositAmount(amount) {
  const input = document.getElementById('deposit-input');
  if (input) input.value = amount;

  document.querySelectorAll('.preset-btn').forEach(btn => {
    const isMatch = btn.textContent.replace(/\D/g, '') === String(amount);
    btn.classList.toggle('active', isMatch);
  });
}

async function processDeposit() {
  const amountInput = document.getElementById('deposit-input');
  const amount = parseFloat(amountInput?.value);
  const btn = document.getElementById('btn-process-deposit');
  
  if (!amount || amount < 20) return alert('O valor mínimo de recarga via Pix é R$ 20,00.');

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando QrCode...';
  btn.disabled = true;

  const res = await apiRequest('/wallet/deposit/pix', 'POST', { amount });

  if (res && res.pixCopyPaste) {
    document.getElementById('deposit-step-select').style.display = 'none';
    document.getElementById('deposit-step-qrcode').style.display = 'block';

    document.getElementById('pix-val-tag').textContent = `R$ ${formatCurrency(amount)}`;
    document.getElementById('pix-payload-input').value = res.pixCopyPaste;

    const qrContainer = document.getElementById('qrcode-canvas');
    qrContainer.innerHTML = '';
    
    new QRCode(qrContainer, {
      text: res.pixCopyPaste,
      width: 170,
      height: 170,
      colorDark: "#05070a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });

    startPixCountdown(res.expiresInSeconds || 900);
  } else {
    alert('Erro ao gerar Pix. Verifique a conexão com o servidor.');
  }

  btn.innerHTML = '<i class="fa-solid fa-qrcode"></i> Gerar QrCode Pix';
  btn.disabled = false;
}

let countdownTimer = null;
function startPixCountdown(durationSeconds) {
  if (countdownTimer) clearInterval(countdownTimer);
  let remaining = durationSeconds;
  const timerEl = document.getElementById('pix-countdown');

  countdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      if (timerEl) timerEl.textContent = 'Expirado';
      alert('O QrCode Pix expirou.');
      resetDepositView();
      return;
    }

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    if (timerEl) {
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }, 1000);
}

function copyPixCode() {
  const input = document.getElementById('pix-payload-input');
  const btn = document.getElementById('btn-copy-pix');
  if (!input) return;

  navigator.clipboard.writeText(input.value).then(() => {
    btn.classList.add('success');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Copiado</span>';
    setTimeout(() => {
      btn.classList.remove('success');
      btn.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Copiar</span>';
    }, 2500);
  });
}

async function simulateInstantPayment() {
  const amount = parseFloat(document.getElementById('deposit-input')?.value || 100);
  const res = await apiRequest('/wallet/deposit/confirm', 'POST', { amount });

  if (res && res.newBalance !== undefined) {
    appState.balance = res.newBalance;
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl && appState.balanceVisible) balanceEl.textContent = formatCurrency(appState.balance);

    alert(`🎉 Pagamento Pix de R$ ${formatCurrency(amount)} identificado!\nNovo saldo: R$ ${formatCurrency(res.newBalance)}`);
    closeModal('modal-deposit');
  }
}

function resetDepositView() {
  if (countdownTimer) clearInterval(countdownTimer);
  document.getElementById('deposit-step-select').style.display = 'block';
  document.getElementById('deposit-step-qrcode').style.display = 'none';
}

async function processWithdraw() {
  const amount = document.getElementById('withdraw-amount')?.value;
  const key = document.getElementById('withdraw-key')?.value;
  const btn = document.getElementById('btn-process-withdraw');
  
  if (!key) return alert('Preencha a Chave Pix.');
  if (!amount || parseFloat(amount) < 30) return alert('O valor mínimo de saque é R$ 30.');
  if (parseFloat(amount) > appState.balance) return alert('Saldo insuficiente para este saque.');
  
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Solicitando...';
  btn.disabled = true;

  const res = await apiRequest('/wallet/withdraw', 'POST', {
    amount: parseFloat(amount),
    pixKey: key
  });

  if (res && res.newBalance !== undefined) {
    appState.balance = res.newBalance;
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl && appState.balanceVisible) balanceEl.textContent = formatCurrency(appState.balance);
    alert(`🚀 Saque de R$ ${formatCurrency(amount)} solicitado com sucesso!`);
  } else if (res && res.error) {
    alert(`Erro no saque: ${res.error}`);
  }

  btn.innerHTML = 'Confirmar Saque';
  btn.disabled = false;
  closeModal('modal-withdraw');
}

async function claimCheckin() {
  const btn = document.getElementById('btn-process-checkin');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
  btn.disabled = true;

  const res = await apiRequest('/wallet/checkin', 'POST');

  if (res && res.newBalance !== undefined) {
    appState.balance = res.newBalance;
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl && appState.balanceVisible) balanceEl.textContent = formatCurrency(appState.balance);
    alert(`🎉 Bônus diário de R$ ${formatCurrency(res.bonus)} creditado!`);
  } else if (res && res.error) {
    alert(res.error);
  }

  btn.innerHTML = 'Resgatar Bônus';
  btn.disabled = false;
  closeModal('modal-checkin');
}

function handleLogout() {
  const confirmLogout = confirm('Deseja realmente sair da sua conta?');
  if (confirmLogout) {
    localStorage.removeItem('taxinexo_token');
    window.location.href = 'login.html';
  }
}
