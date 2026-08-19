const API_BASE = (window.location.hostname === 'localhost' && window.location.port === '8080')
  ? 'http://localhost:3000/api' 
  : '/api';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const appState = {
  token: localStorage.getItem('taxinexo_token') || null,
  balance: 1250.80,
  balanceVisible: true,
  theme: 'dark',
  currentFilter: 'all',
  activeVehicles: [],
  products: [],
  team: {
    totalMembers: 14,
    activeMembers: 8,
    totalCommission: 520.00,
    levels: []
  }
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await autoLoginOrLoadData();
});

// Helper de requisições autenticadas
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
    return await res.json();
  } catch (err) {
    console.warn(`API [${endpoint}] indisponível, usando dados locais.`, err);
    return null;
  }
}

// Carrega ou autentica automaticamente com usuário demo
async function autoLoginOrLoadData() {
  // Se não tiver token, faz login com a conta demo
  if (!appState.token) {
    const loginRes = await apiRequest('/auth/login', 'POST', {
      phone: '11987654321',
      password: '123456'
    });

    if (loginRes && loginRes.token) {
      appState.token = loginRes.token;
      localStorage.setItem('taxinexo_token', loginRes.token);
    }
  }

  // 1. Carrega produtos
  const products = await apiRequest('/fleet/products');
  if (products && products.length > 0) {
    appState.products = products;
  }

  // 2. Carrega resumo de saldo
  const wallet = await apiRequest('/wallet/summary');
  if (wallet && wallet.balance !== undefined) {
    appState.balance = wallet.balance;
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl && appState.balanceVisible) balanceEl.textContent = formatCurrency(appState.balance);
  }

  // 3. Carrega contratos ativos
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

  // 4. Carrega dados de equipe
  const team = await apiRequest('/team/overview');
  if (team && team.levels) {
    appState.team = team;
  }

  // Renderiza tudo na tela
  renderProducts();
  renderActiveVehicles();
  renderTeamData();
  updateCategoryCounts();
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

  if (filteredProducts.length === 0) {
    container.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 30px;">Nenhum veículo disponível nesta categoria.</p>';
    return;
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
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.remove('active');
  });
  
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
          Explorar Frotas
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
}

function setupEventListeners() {
  const toggleBalanceBtn = document.getElementById('toggle-balance');
  const balanceEl = document.getElementById('user-balance');
  const iconBtn = toggleBalanceBtn?.querySelector('i');

  if (balanceEl) {
    balanceEl.textContent = formatCurrency(appState.balance);
  }

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

  setDynamicGreeting();
}

function setDynamicGreeting() {
  const greetingEl = document.getElementById('user-greeting');
  if (!greetingEl) return;

  const hour = new Date().getHours();
  let greeting = 'Boa noite';
  
  if (hour >= 5 && hour < 12) greeting = 'Bom dia';
  else if (hour >= 12 && hour < 18) greeting = 'Boa tarde';

  greetingEl.innerHTML = `${greeting}, <br><strong>Operador #8843</strong>`;
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
  }).catch(() => {
    alert(`Código de convite: ${codeInput.value}`);
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
  if (event.target.id === modalId) {
    closeModal(modalId);
  }
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
  const amount = document.getElementById('deposit-input')?.value;
  const btn = document.getElementById('btn-process-deposit');
  
  if (!amount || parseFloat(amount) < 20) return alert('Insira um valor válido (Mínimo R$ 20).');
  
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando Pix...';
  btn.disabled = true;

  const res = await apiRequest('/wallet/deposit/confirm', 'POST', {
    amount: parseFloat(amount)
  });

  if (res && res.newBalance !== undefined) {
    appState.balance = res.newBalance;
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl && appState.balanceVisible) balanceEl.textContent = formatCurrency(appState.balance);

    alert(`✅ Pagamento Pix de R$ ${formatCurrency(amount)} confirmado pelo Backend!
Novo Saldo: R$ ${formatCurrency(res.newBalance)}`);
  } else {
    alert(`QrCode gerado para R$ ${formatCurrency(amount)}.`);
  }

  btn.innerHTML = 'Gerar QrCode Pix';
  btn.disabled = false;
  closeModal('modal-deposit');
}

async function processWithdraw() {
  const amount = document.getElementById('withdraw-amount')?.value;
  const key = document.getElementById('withdraw-key')?.value;
  const btn = document.getElementById('btn-process-withdraw');
  
  if (!key) return alert('Preencha a Chave Pix.');
  if (!amount || parseFloat(amount) < 30) return alert('O valor mínimo de saque é R$ 30.');
  if (parseFloat(amount) > appState.balance) return alert('Saldo insuficiente para este saque.');
  
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Solicitando ao Servidor...';
  btn.disabled = true;

  const res = await apiRequest('/wallet/withdraw', 'POST', {
    amount: parseFloat(amount),
    pixKey: key
  });

  if (res && res.newBalance !== undefined) {
    appState.balance = res.newBalance;
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl && appState.balanceVisible) balanceEl.textContent = formatCurrency(appState.balance);
    alert(`🚀 Saque de R$ ${formatCurrency(amount)} registrado no banco de dados com sucesso!`);
  } else if (res && res.error) {
    alert(`Erro no saque: ${res.error}`);
  }

  btn.innerHTML = 'Confirmar Saque';
  btn.disabled = false;
  closeModal('modal-withdraw');
}

async function hireVehicle(productId) {
  const prod = appState.products.find(p => p.id === productId);
  if (!prod) return;

  if (appState.balance < prod.price) {
    if (prod.checkoutUrl) {
      if (confirm(`Saldo em carteira insuficiente!\n\nDeseja pagar R$ ${formatCurrency(prod.price)} agora no Pix seguro Cartpanda Pay?`)) {
        window.open(prod.checkoutUrl, '_blank');
        return;
      }
    }
    alert(`Saldo insuficiente! Você possui R$ ${formatCurrency(appState.balance)} e o contrato custa R$ ${formatCurrency(prod.price)}.\n\nPor favor, faça uma recarga via Pix.`);
    openModal('modal-deposit');
    return;
  }

  if (confirm(`Confirmar contratação de ${prod.name} por R$ ${formatCurrency(prod.price)}?\n\nRendimento Diário: + R$ ${formatCurrency(prod.dailyReturn)}\nDuração: ${prod.periodDays} dias`)) {
    const res = await apiRequest('/fleet/hire', 'POST', { productId });

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
      alert('🎉 Contrato gravado no Banco de Dados! Rendimentos serão creditados diariamente pelo motor do servidor.');
      switchTab('home');
    } else if (res && res.error) {
      alert(`Erro: ${res.error}`);
    }
  }
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
    alert(`🎉 Bônus diário de R$ ${formatCurrency(res.bonus)} creditado no servidor!`);
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
    const logoutBtn = document.querySelector('.menu-item.logout span');
    if (logoutBtn) logoutBtn.textContent = 'Saindo...';
    
    setTimeout(() => {
      document.body.style.opacity = '0';
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 300);
    }, 800);
  }
}
