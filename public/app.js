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
      id: 'NX-030',
      name: 'BYD Dolphin Autonomous Urban',
      category: 'economy',
      status: 'Disponível',
      price: 30.00,
      dailyReturn: 2.80,
      periodDays: 20,
      checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212260809:1',
      description: 'Robotaxi elétrico compacto para deslocamentos e entregas rápidas urbanas.'
    },
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
    appState.commissionBalance = wallet.commissionBalance || 0.00;
    appState.dailyReturnsBalance = wallet.dailyReturnsBalance || 0.00;
    appState.isLevel3 = wallet.isLevel3 || false;

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
  renderDepositPlans();
  updateCategoryCounts();


  // Verifica parâmetro de contratação direta (?hire=NX-101)
  const urlParams = new URLSearchParams(window.location.search);
  const hireTarget = urlParams.get('hire');
  if (hireTarget) {
    setTimeout(() => {
      hireVehicle(hireTarget);
    }, 400);
  }
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
  const careerContainer = document.getElementById('career-progress-container');
  if (!metricsContainer || !levelsContainer) return;

  const team = appState.team || { totalMembers: 0, activeMembers: 0, totalCommission: 0, levels: [] };
  const career = team.career || {
    currentRank: { name: 'Operador Bronze', icon: '🥉', badge: '🥉 Bronze' },
    nextRank: { name: 'Supervisor Prata', icon: '🥈', bonus: 100 },
    progressPercent: 0,
    remainingDirects: 5,
    remainingTotal: 5
  };

  // 1. Renderiza Card de Status do Plano de Carreira
  if (careerContainer) {
    careerContainer.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%); border: 1px solid var(--border-bright); border-radius: var(--radius-lg); padding: 18px 16px; box-shadow: 0 4px 20px rgba(0, 240, 255, 0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="font-size: 28px;">${career.currentRank.icon || '🥉'}</div>
            <div>
              <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Sua Patente Atual</span>
              <h4 style="color: #fff; font-size: 16px; font-weight: 800; margin-top: 2px;">${career.currentRank.name}</h4>
            </div>
          </div>
          ${career.nextRank ? `
            <div style="text-align: right;">
              <span style="font-size: 10px; color: var(--accent-gold); font-weight: 700; background: rgba(245, 158, 11, 0.15); padding: 3px 8px; border-radius: 12px;">
                Próximo: ${career.nextRank.icon} ${career.nextRank.name}
              </span>
              ${career.nextRank.bonus > 0 ? `<div style="font-size: 11px; color: var(--accent-green); font-weight: 700; margin-top: 4px;">+ R$ ${formatCurrency(career.nextRank.bonus)} Pix</div>` : ''}
            </div>
          ` : '<span style="font-size: 11px; color: var(--accent-gold); font-weight: 800;">🏆 Nível Máximo</span>'}
        </div>

        ${career.nextRank ? `
          <div style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-muted); margin-bottom: 6px;">
              <span>Progresso para ${career.nextRank.name}</span>
              <strong style="color: var(--primary);">${career.progressPercent}%</strong>
            </div>
            <div class="progress-bar" style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden;">
              <div class="progress-fill" style="width: ${career.progressPercent}%; height: 100%; background: var(--cyan-gradient); border-radius: 10px; transition: width 0.6s ease;"></div>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; display: flex; justify-content: space-between;">
              <span>${career.remainingDirects > 0 ? `Faltam <strong>${career.remainingDirects}</strong> indicados diretos` : 'Diretos concluídos ✅'}</span>
              <span>${career.remainingTotal > 0 ? `Faltam <strong>${career.remainingTotal}</strong> na equipe` : ''}</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 2. Renderiza Métricas Gerais
  metricsContainer.innerHTML = `
    <div class="metric-box">
      <span class="num">${team.totalMembers || 0}</span>
      <span class="desc">Membros Totais</span>
    </div>
    <div class="metric-box">
      <span class="num">${team.directsCount !== undefined ? team.directsCount : (team.activeMembers || 0)}</span>
      <span class="desc">Indicados Diretos</span>
    </div>
    <div class="metric-box">
      <span class="num" style="color: var(--accent-green);">R$ ${formatCurrency(team.totalCommission)}</span>
      <span class="desc">Comissão Total</span>
    </div>
  `;

  // 3. Renderiza os 5 Níveis com Desbloqueio Progressivo
  levelsContainer.innerHTML = (team.levels || []).map(lvl => `
    <div class="level-card" style="border-left: 3px solid ${lvl.unlocked ? 'var(--accent-green)' : 'rgba(255,255,255,0.15)'}; background: ${lvl.unlocked ? 'rgba(0, 240, 255, 0.03)' : 'rgba(255,255,255,0.01)'}; margin-bottom: 10px;">
      <div class="lvl-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 700; color: #fff; font-size: 13.5px;"><i class="fa-solid ${lvl.icon}"></i> ${lvl.name}</span>
        ${lvl.unlocked 
          ? `<span style="font-size: 11px; background: rgba(0, 255, 136, 0.15); color: var(--accent-green); padding: 3px 8px; border-radius: 12px; font-weight: 800;"><i class="fa-solid fa-lock-open"></i> ${lvl.percent}% Liberado</span>`
          : `<span style="font-size: 10.5px; background: rgba(245, 158, 11, 0.15); color: var(--accent-gold); padding: 3px 8px; border-radius: 12px; font-weight: 700;"><i class="fa-solid fa-lock"></i> ${lvl.percent}% Bloqueado</span>`
        }
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 12px; color: var(--text-muted);">
        <span>${lvl.members} membros ativos</span>
        <strong style="color: var(--accent-green);">+ R$ ${formatCurrency(lvl.generated)} ganhos</strong>
      </div>
      ${!lvl.unlocked ? `<div style="font-size: 10.5px; color: var(--text-tertiary); margin-top: 4px;"><i class="fa-solid fa-circle-info"></i> ${lvl.unlockRequirement}</div>` : ''}
    </div>
  `).join('');

  renderReferralCard();
}

function getAffiliateLink() {
  const code = (appState.user && appState.user.inviteCode) ? appState.user.inviteCode : (appState.user && appState.user.id ? `NEXO${appState.user.id.replace('usr_', '')}` : 'NEXO');
  const origin = window.location.origin;
  const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  return `${origin}${path}login.html?ref=${code}`;
}

function renderReferralCard() {
  const container = document.getElementById('referral-box-container');
  if (!container) return;

  const code = (appState.user && appState.user.inviteCode) ? appState.user.inviteCode : (appState.user && appState.user.id ? `NEXO${appState.user.id.replace('usr_', '')}` : 'NEXO');
  const fullLink = getAffiliateLink();

  // ESTADO LIBERADO: Link de afiliado sempre acessível para todos os operadores
  container.innerHTML = `
    <div class="referral-box unlocked-affiliate" style="border: 1px solid var(--border-bright); background: rgba(0, 240, 255, 0.04); padding: 20px 16px; border-radius: var(--radius-md);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span class="ref-title" style="color: var(--primary); font-weight: 700; font-size: 13px;">
          <i class="fa-solid fa-circle-check" style="color: var(--accent-green);"></i> Seu Link de Afiliado Oficial
        </span>
        <span style="font-size: 11px; background: rgba(0, 255, 136, 0.15); color: var(--accent-green); padding: 3px 8px; border-radius: 12px; font-weight: 700;">Ativo</span>
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

  // Se o saldo for menor que o preço do plano, abre o checkout do Cartpanda direto para esse plano!
  if (appState.balance < prod.price) {
    openProductCheckout(productId);
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

    const warnEl = document.getElementById('withdraw-cota-warning');
    if (warnEl) {
      if (appState.commissionBalance >= 30 || appState.isLevel3) {
        warnEl.style.display = 'none';
      } else if (appState.commissionBalance > 0) {
        warnEl.style.display = 'block';
        warnEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--accent-green);"></i> <strong>Saldo de Indicação Livre:</strong> R$ ${formatCurrency(appState.commissionBalance)} (Mínimo R$ 30,00 para saque). Rendimentos de frotas liberam no Nível 3.`;
      } else {
        warnEl.style.display = 'none';
      }
    }
  } else if (modalId === 'modal-deposit') {
    renderDepositPlans();
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

function renderDepositPlans() {
  const container = document.getElementById('deposit-plans-list');
  if (!container) return;

  container.innerHTML = appState.products.map(p => `
    <div style="background: rgba(0, 240, 255, 0.04); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; transition: all 0.2s ease;">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <strong style="color: #fff; font-size: 14px;">${p.name}</strong>
          <span style="font-size: 10px; background: rgba(0, 240, 255, 0.15); color: var(--primary); padding: 2px 6px; border-radius: 10px; font-weight: 700;">${p.id}</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
          Contrato: <strong style="color: #fff;">R$ ${formatCurrency(p.price)}</strong> • Retorno: <strong style="color: var(--accent-green);">+ R$ ${formatCurrency(p.dailyReturn)}/dia</strong> (${p.periodDays}d)
        </div>
      </div>
      <button class="btn btn-primary" onclick="openProductCheckout('${p.id}')" style="padding: 9px 16px; font-size: 12px; font-weight: 700; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-bolt"></i> Ativar R$ ${formatCurrency(p.price)}
      </button>
    </div>
  `).join('');
}

const CARTPANDA_CHECKOUTS = {
  'NX-030': 'https://pagamento.pricipiaskins.site/checkout/212260809:1',
  'NX-101': 'https://pagamento.pricipiaskins.site/checkout/212187584:1',
  'NX-202': 'https://pagamento.pricipiaskins.site/checkout/212187589:1',
  'NX-707': 'https://pagamento.pricipiaskins.site/checkout/212187590:1',
  'NX-404': 'https://pagamento.pricipiaskins.site/checkout/212187597:1',
  'NX-303': 'https://pagamento.pricipiaskins.site/checkout/212187598:1',
  'NX-505': 'https://pagamento.pricipiaskins.site/checkout/212187602:1',
  'NX-606': 'https://pagamento.pricipiaskins.site/checkout/212187611:1'
};

function openProductCheckout(productId) {
  const prod = appState.products.find(p => p.id === productId);
  const baseCheckoutUrl = (prod && prod.checkoutUrl && prod.checkoutUrl.startsWith('http'))
    ? prod.checkoutUrl
    : CARTPANDA_CHECKOUTS[productId];

  if (baseCheckoutUrl) {
    try {
      const url = new URL(baseCheckoutUrl);
      if (appState.user) {
        if (appState.user.phone) url.searchParams.set('phone', appState.user.phone);
        if (appState.user.operatorName) url.searchParams.set('name', appState.user.operatorName);
        if (appState.user.id) url.searchParams.set('custom_field[user_id]', appState.user.id);
        if (appState.user.inviteCode) url.searchParams.set('metadata[ref]', appState.user.inviteCode);
      }
      window.open(url.toString(), '_blank');
    } catch (e) {
      window.open(baseCheckoutUrl, '_blank');
    }
  } else {
    alert('Checkout temporariamente indisponível.');
  }
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
    closeModal('modal-withdraw');
  } else if (res && res.error) {
    alert(res.error);
    if (res.requiresLevel3) {
      closeModal('modal-withdraw');
      switchTab('team');
    }
  }

  btn.innerHTML = 'Confirmar Saque';
  btn.disabled = false;
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
