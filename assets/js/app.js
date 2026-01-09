const API_BASE = '/api';

// State
let currentCycleId = null;
let currentStep = 1;
let authToken = localStorage.getItem('authToken');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        // Verify token implicitly by trying to load data
        showMainInterface();
        loadWallet();
        checkActiveCycle();
        loadHistory();
    } else {
        showLoginInterface();
    }
});

// --- Auth Functions ---

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('loginError');

    btn.disabled = true;
    errorMsg.classList.add('hidden');

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            showMainInterface();
            loadWallet();
            checkActiveCycle();
            loadHistory();
        } else {
            errorMsg.innerText = data.error || 'Error al iniciar sesión';
            errorMsg.classList.remove('hidden');
        }
    } catch (err) {
        errorMsg.innerText = 'Error de conexión';
        errorMsg.classList.remove('hidden');
    } finally {
        btn.disabled = false;
    }
}

function handleLogout() {
    authToken = null;
    localStorage.removeItem('authToken');
    showLoginInterface();
}

function showLoginInterface() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('mainHeader').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
}

function showMainInterface() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('mainHeader').classList.remove('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
}

async function fetchWithAuth(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(url, options);

    if (res.status === 401 || res.status === 403) {
        handleLogout();
        showModal('Sesión Expirada', 'Tu sesión ha caducado. Por favor inicia sesión nuevamente.');
        throw new Error('Unauthorized');
    }

    return res;
}

// --- Modals ---

function showModal(title, message) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = message;

    const actions = document.getElementById('modalActions');
    actions.innerHTML = '<button class="btn btn-primary" onclick="closeModal()">Aceptar</button>';

    document.getElementById('modalContainer').classList.remove('hidden');
}

function showConfirm(title, message, callback) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = message;

    const actions = document.getElementById('modalActions');
    actions.innerHTML = `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="confirmBtn">Confirmar</button>
    `;

    document.getElementById('confirmBtn').onclick = () => {
        closeModal();
        callback();
    };

    document.getElementById('modalContainer').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modalContainer').classList.add('hidden');
}

function showInputModal(title, message, callback) {
    document.getElementById('inputModalTitle').innerText = title;
    document.getElementById('inputModalMessage').innerText = message;
    const input = document.getElementById('inputModalValue');
    input.value = '';

    document.getElementById('inputModalConfirmBtn').onclick = () => {
        const value = input.value;
        if (value) {
            closeInputModal();
            callback(value);
        }
    };

    document.getElementById('inputModalContainer').classList.remove('hidden');
    input.focus();
}

function closeInputModal() {
    document.getElementById('inputModalContainer').classList.add('hidden');
}

// --- Wallet Functions ---

async function loadWallet() {
    try {
        const res = await fetchWithAuth(`${API_BASE}/wallet`);
        const wallets = await res.json();

        // Main USDT Wallet (ID 1)
        const usdtWallet = wallets.find(w => w.id === 1);
        if (usdtWallet) {
            document.getElementById('walletBalance').innerText = `${formatMoney(usdtWallet.balance)} USDT`;
        }

        // Secondary Wallets
        const secondaryContainer = document.getElementById('secondaryWalletsContainer');
        const secondaryGrid = document.getElementById('secondaryWalletsGrid');
        secondaryGrid.innerHTML = '';

        const secondaryWallets = wallets.filter(w => w.id !== 1 && parseFloat(w.balance) > 0);

        // VES Wallet check for VES Cycle button
        const vesWallet = wallets.find(w => w.id === 2);
        const vesBalance = vesWallet ? parseFloat(vesWallet.balance) : 0;
        const vesCycleBtn = document.getElementById('startVesCycleBtn');
        if (vesCycleBtn) {
            if (vesBalance > 0) {
                vesCycleBtn.classList.remove('hidden');
                vesCycleBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Iniciar Ciclo VES (${formatMoney(vesBalance)} VES)`;
            } else {
                vesCycleBtn.classList.add('hidden');
            }
        }

        if (secondaryWallets.length > 0) {
            secondaryContainer.classList.remove('hidden');
            secondaryWallets.forEach(w => {
                const div = document.createElement('div');
                div.innerHTML = `
                    <div class="stat-value" style="font-size: 1.2rem;">${formatMoney(w.balance)}</div>
                    <div class="stat-label">${w.currency}</div>
                 `;
                secondaryGrid.appendChild(div);
            });
        } else {
            secondaryContainer.classList.add('hidden');
        }

    } catch (err) {
        console.error('Error loading wallet:', err);
    }
}

async function editWallet() {
    showInputModal('Actualizar Saldo', 'Ingrese el nuevo saldo real de la billetera (USDT):', async (newBalance) => {
        if (newBalance && !isNaN(newBalance)) {
            try {
                await fetchWithAuth(`${API_BASE}/wallet`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ balance: parseFloat(newBalance) })
                });
                loadWallet();
            } catch (err) {
                showModal('Error', 'Error al actualizar saldo');
            }
        } else {
            showModal('Error', 'Por favor ingrese un número válido');
        }
    });
}

// --- Cycle Management ---

async function cancelCycle() {
    showConfirm('Finalizar Ciclo Manualmente', 'ADVERTENCIA: ¿Estás seguro de finalizar este ciclo? \n\nEl sistema detectará el último paso realizado y acreditará los fondos en la billetera correspondiente (Ej: VES, Efectivo, Kontigo...).', async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE}/cycles/${currentCycleId}/cancel`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                showModal('Ciclo Finalizado', data.message);
                showStartCycleUI();
                loadWallet();
                loadHistory();
            } else {
                showModal('Error', data.error);
            }
        } catch (err) {
            showModal('Error', 'Error al cancelar el ciclo');
        }
    });
}

async function checkActiveCycle() {
    try {
        const res = await fetchWithAuth(`${API_BASE}/cycles/active`);
        const data = await res.json();

        if (data.active) {
            currentCycleId = data.cycle.id;
            const steps = data.cycle.steps || [];
            currentStep = steps.length + 1;

            showActiveCycleUI(data.cycle);

            if (steps.length > 0) {
                const lastStep = steps[steps.length - 1];
                const nextInputMap = {
                    1: 'step2_input',
                    2: 'step3_input',
                    3: 'step4_input',
                    4: 'step5_input'
                };

                const inputId = nextInputMap[steps.length];
                if (inputId) {
                    const inputEl = document.getElementById(inputId);
                    if (inputEl) {
                        inputEl.value = lastStep.output_amount;
                        if (inputId === 'step2_input') calcStep2();
                        if (inputId === 'step4_input') calcStep4();
                    }
                }
            }

        } else {
            showStartCycleUI();
        }
    } catch (err) {
        console.error('Error checking active cycle:', err);
    }
}

async function startCycle() {
    showConfirm('Iniciar Ciclo', '¿Estás seguro de iniciar un nuevo ciclo? El saldo actual se tomará como base.', async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE}/cycles/start`, { method: 'POST' });
            const data = await res.json();

            if (res.status === 201) {
                checkActiveCycle();
            } else {
                // Manejo de Error específico para Kontigo
                if (data.error && data.error.includes('Kontigo')) {
                    showModal('Fondos en Kontigo', data.error + '\n\nDebes mover esos fondos a Binance primero.');
                } else {
                    showModal('Error', data.error);
                }
            }
        } catch (err) {
            showModal('Error', 'Error de conexión');
        }
    });
}

async function startVesCycle() {
    showConfirm('Iniciar Ciclo VES→USD', '¿Deseas iniciar un ciclo usando tu saldo en VES? Este saldo se usará para comprar USD en efectivo.', async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE}/cycles/start-ves`, { method: 'POST' });
            const data = await res.json();

            if (res.status === 201) {
                showModal('Ciclo VES Iniciado', `Se inició el ciclo #${data.cycleId} con ${formatMoney(data.initialBalance)} VES.`);
                checkActiveCycle();
                loadWallet();
            } else {
                showModal('Error', data.error);
            }
        } catch (err) {
            showModal('Error', 'Error de conexión');
        }
    });
}

async function handleStep(e, stepType) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const body = {
        step_type: stepType,
        input_amount: parseFloat(formData.get('input_amount')),
        output_amount: parseFloat(formData.get('output_amount')),
        exchange_rate: parseFloat(formData.get('exchange_rate') || 0),
        fee: parseFloat(formData.get('fee') || 0)
    };

    // Para Step 4 (SEND_TO_BINANCE), agregar debit_amount
    if (stepType === 'SEND_TO_BINANCE') {
        body.debit_amount = parseFloat(formData.get('debit_amount') || 0);
    }

    try {
        const res = await fetchWithAuth(`${API_BASE}/cycles/${currentCycleId}/step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.success) {
            // Mostrar VES surplus si aplica
            if (data.ves_surplus && data.ves_surplus > 0) {
                showModal('Ganancia VES', `Se acreditaron ${formatMoney(data.ves_surplus)} VES a tu billetera.`);
            }
            checkActiveCycle();
            loadWallet();
            form.reset();
        } else {
            showModal('Error', data.error);
        }
    } catch (err) {
        showModal('Error', 'Error al registrar paso');
    }
}

async function handleCloseCycle(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    // Register last step first
    const bodyStep = {
        step_type: 'CONVERT_TO_USDT',
        input_amount: parseFloat(formData.get('input_amount')),
        output_amount: parseFloat(formData.get('output_amount')),
        exchange_rate: 0,
        fee: 0
    };

    try {
        const resStep = await fetchWithAuth(`${API_BASE}/cycles/${currentCycleId}/step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyStep)
        });

        if (!resStep.ok) throw new Error('Falló registro de último paso');

        // Close Cycle
        const resClose = await fetchWithAuth(`${API_BASE}/cycles/${currentCycleId}/close`, { method: 'POST' });
        const dataClose = await resClose.json();

        if (dataClose.success) {
            showModal('¡Ciclo Cerrado!', `Spread: ${formatMoney(dataClose.results.spreadAmount)} USDT (${dataClose.results.spreadPercentage.toFixed(2)}%)`);
            showStartCycleUI();
            loadWallet();
            loadHistory();
        } else {
            showModal('Error', 'Error al cerrar: ' + dataClose.error);
        }

    } catch (err) {
        showModal('Error', 'Error en el proceso final');
    }
}

// --- UI Helpers ---

function showStartCycleUI() {
    document.getElementById('startCycleState').classList.remove('hidden');
    document.getElementById('activeCycleState').classList.add('hidden');
    currentCycleId = null;
    currentStep = 1;
}

function showActiveCycleUI(cycle) {
    document.getElementById('startCycleState').classList.add('hidden');
    document.getElementById('activeCycleState').classList.remove('hidden');
    document.getElementById('cycleIdDisplay').innerText = `ID: #${cycle.id}`;
    updateWizardUI();
}

function updateWizardUI() {
    document.querySelectorAll('.step-indicator').forEach(el => {
        const step = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (step < currentStep) el.classList.add('completed');
        if (step === currentStep) el.classList.add('active');
    });

    for (let i = 1; i <= 5; i++) {
        const div = document.getElementById(`step${i}`);
        if (i === currentStep) div.classList.remove('hidden');
        else div.classList.add('hidden');
    }
}

// --- Calculators --- (Same as before)
function calcStep1() {
    const input = parseFloat(document.getElementById('step1_input').value) || 0;
    const rate = parseFloat(document.getElementById('step1_rate').value) || 0;
    document.getElementById('step1_output').value = (input * rate).toFixed(2);
}

function calcStep2() {
    const input = parseFloat(document.getElementById('step2_input').value) || 0;
    const rate = parseFloat(document.getElementById('step2_rate').value) || 0;
    if (rate > 0) {
        document.getElementById('step2_output').value = (input / rate).toFixed(2);
    }
}

function calcStep4() {
    const input = parseFloat(document.getElementById('step4_input').value) || 0;
    const fee = parseFloat(document.getElementById('step4_fee').value) || 0;
    document.getElementById('step4_output').value = (input - fee).toFixed(2);
}

// --- History ---

async function loadHistory() {
    try {
        const res = await fetchWithAuth(`${API_BASE}/cycles?limit=10`);
        const data = await res.json();
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = '';

        if (data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay ciclos registrados</td></tr>';
            return;
        }

        data.data.forEach(cycle => {
            const spreadClass = cycle.spread_amount >= 0 ? 'text-success' : 'text-danger';
            const spreadIcon = cycle.spread_amount >= 0 ? '+' : '';
            const typeLabel = cycle.cycle_type === 'VES_TO_USD' ? '🔄 VES' : '💱 MAIN';

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.onclick = () => showCycleDetails(cycle.id);
            tr.innerHTML = `
                <td>#${cycle.id} ${typeLabel}</td>
                <td>${new Date(cycle.start_date).toLocaleDateString()}</td>
                <td>${formatMoney(cycle.initial_balance)} ${cycle.initial_currency || 'USDT'}</td>
                <td>${cycle.final_balance ? formatMoney(cycle.final_balance) : '-'}</td>
                <td class="${spreadClass}">${cycle.spread_amount !== null ? `${spreadIcon}${formatMoney(cycle.spread_amount)} (${cycle.spread_percentage !== null ? parseFloat(cycle.spread_percentage).toFixed(2) : 0}%)` : '-'}</td>
                <td><span class="status-badge ${cycle.status === 'OPEN' ? 'status-open' : cycle.status === 'CANCELLED' ? 'status-cancelled' : 'status-completed'}">${cycle.status}</span></td>
            `;
            tbody.appendChild(tr);
        });

        const completed = data.data.find(c => c.status === 'COMPLETED');
        if (completed && completed.spread_percentage !== null) {
            document.getElementById('lastSpread').innerText = `${parseFloat(completed.spread_percentage).toFixed(2)}%`;
            document.getElementById('lastSpreadAmount').innerText = `${completed.spread_amount >= 0 ? '+' : ''}${formatMoney(completed.spread_amount)} USDT`;
            document.getElementById('lastSpreadAmount').className = `stat-label ${completed.spread_amount >= 0 ? 'text-success' : 'text-danger'}`;
        }

    } catch (err) {
        console.error('Error loading history:', err);
    }
}

async function showCycleDetails(cycleId) {
    try {
        const res = await fetchWithAuth(`${API_BASE}/cycles/${cycleId}`);
        const cycle = await res.json();

        const stepNames = {
            'SELL_USDT_TO_VES': 'Venta USDT → VES',
            'BUY_USD_CASH': 'Compra USD Efectivo',
            'DEPOSIT_KONTIGO': 'Depósito Kontigo',
            'SEND_TO_BINANCE': 'Envío a Binance',
            'CONVERT_TO_USDT': 'Conversión a USDT'
        };

        let stepsHtml = '';
        if (cycle.steps && cycle.steps.length > 0) {
            stepsHtml = cycle.steps.map((step, i) => `
                <div style="padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                    <strong>${i + 1}. ${stepNames[step.step_type] || step.step_type}</strong><br>
                    <small>Entrada: ${formatMoney(step.input_amount)} → Salida: ${formatMoney(step.output_amount)}</small>
                    ${step.exchange_rate ? `<br><small>Tasa: ${step.exchange_rate}</small>` : ''}
                    ${step.ves_surplus > 0 ? `<br><small class="text-success">+${formatMoney(step.ves_surplus)} VES (Ganancia)</small>` : ''}
                </div>
            `).join('');
        } else {
            stepsHtml = '<p>No hay pasos registrados.</p>';
        }

        const typeLabel = cycle.cycle_type === 'VES_TO_USD' ? 'VES → USD' : 'USDT → VES → USD → USDT';
        const spreadClass = cycle.spread_amount >= 0 ? 'text-success' : 'text-danger';

        const content = `
            <div style="text-align: left;">
                <p><strong>Tipo:</strong> ${typeLabel}</p>
                <p><strong>Estado:</strong> ${cycle.status}</p>
                <p><strong>Base:</strong> ${formatMoney(cycle.initial_balance)} ${cycle.initial_currency || 'USDT'}</p>
                <p><strong>Final:</strong> ${cycle.final_balance ? formatMoney(cycle.final_balance) + ' USDT' : '-'}</p>
                <p><strong>Spread:</strong> <span class="${spreadClass}">${cycle.spread_amount !== null ? formatMoney(cycle.spread_amount) + ' USDT (' + cycle.spread_percentage?.toFixed(2) + '%)' : '-'}</span></p>
                <hr style="border-color: var(--border); margin: 1rem 0;">
                <h4>Pasos del Ciclo</h4>
                ${stepsHtml}
            </div>
        `;

        document.getElementById('modalTitle').innerText = `Ciclo #${cycleId}`;
        document.getElementById('modalMessage').innerHTML = content;
        document.getElementById('modalActions').innerHTML = '<button class="btn btn-primary" onclick="closeModal()">Cerrar</button>';
        document.getElementById('modalContainer').classList.remove('hidden');

    } catch (err) {
        showModal('Error', 'No se pudo cargar el detalle del ciclo');
    }
}

function formatMoney(amount) {
    if (amount === null || amount === undefined) return '0.00';
    return parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
