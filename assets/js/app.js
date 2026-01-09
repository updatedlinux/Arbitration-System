const API_BASE = '/api';

// State
let currentCycleId = null;
let currentStep = 1;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadWallet();
    checkActiveCycle();
    loadHistory();
});

// --- Wallet Functions ---

async function loadWallet() {
    try {
        const res = await fetch(`${API_BASE}/wallet`);
        const data = await res.json();
        document.getElementById('walletBalance').innerText = `${formatMoney(data.balance)} USDT`;
    } catch (err) {
        console.error('Error loading wallet:', err);
    }
}

async function editWallet() {
    const newBalance = prompt('Ingrese el nuevo saldo real de la billetera (USDT):');
    if (newBalance && !isNaN(newBalance)) {
        try {
            await fetch(`${API_BASE}/wallet`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ balance: parseFloat(newBalance) })
            });
            loadWallet();
        } catch (err) {
            alert('Error al actualizar saldo');
        }
    }
}

// --- Cycle Management ---

async function checkActiveCycle() {
    try {
        const res = await fetch(`${API_BASE}/cycles/active`);
        const data = await res.json();

        if (data.active) {
            currentCycleId = data.cycle.id;
            const steps = data.cycle.steps || [];

            // Determine current step based on completed steps
            // Steps sequence: 
            // 0 steps -> Step 1 (SELL_USDT_TO_VES)
            // 1 step (SELL..) -> Step 2 (BUY_USD_CASH)
            // 2 steps (BUY..) -> Step 3 (DEPOSIT_KONTIGO)
            // 3 steps (DEPOSIT..) -> Step 4 (SEND_TO_BINANCE)
            // 4 steps (SEND..) -> Step 5 (CONVERT_TO_USDT)

            currentStep = steps.length + 1;

            showActiveCycleUI(data.cycle);

            // Pre-fill inputs based on previous outputs
            if (steps.length > 0) {
                const lastStep = steps[steps.length - 1];
                // Map previous output to next input
                const nextInputMap = {
                    1: 'step2_input', // Output of Step 1 -> Input of Step 2
                    2: 'step3_input',
                    3: 'step4_input',
                    4: 'step5_input'
                };

                const inputId = nextInputMap[steps.length];
                if (inputId) {
                    const inputEl = document.getElementById(inputId);
                    if (inputEl) {
                        inputEl.value = lastStep.output_amount;
                        // Trigger calc if needed
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
    if (!confirm('¿Estás seguro de iniciar un nuevo ciclo? El saldo actual se tomará como base.')) return;

    try {
        const res = await fetch(`${API_BASE}/cycles/start`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            checkActiveCycle();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error de conexión');
    }
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

    try {
        const res = await fetch(`${API_BASE}/cycles/${currentCycleId}/step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.success) {
            // Refresh to calculate next state
            checkActiveCycle();
            form.reset();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Error al registrar paso');
    }
}

async function handleCloseCycle(e) {
    e.preventDefault();
    const form = e.target;

    // First register the last step (Step 5)
    const formData = new FormData(form);
    const bodyStep = {
        step_type: 'CONVERT_TO_USDT',
        input_amount: parseFloat(formData.get('input_amount')),
        output_amount: parseFloat(formData.get('output_amount')),
        exchange_rate: 0,
        fee: 0
    };

    try {
        // Register Step 5
        const resStep = await fetch(`${API_BASE}/cycles/${currentCycleId}/step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyStep)
        });

        if (!resStep.ok) throw new Error('Falló registro de último paso');

        // Close Cycle
        const resClose = await fetch(`${API_BASE}/cycles/${currentCycleId}/close`, { method: 'POST' });
        const dataClose = await resClose.json();

        if (dataClose.success) {
            alert(`Ciclo Cerrado!\nSpread: ${formatMoney(dataClose.results.spreadAmount)} USDT (${dataClose.results.spreadPercentage.toFixed(2)}%)`);
            showStartCycleUI();
            loadWallet(); // Update new balance
            loadHistory(); // refresh list
        } else {
            alert('Error al cerrar: ' + dataClose.error);
        }

    } catch (err) {
        console.error(err);
        alert('Error en el proceso final');
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
    // Update Indicators
    document.querySelectorAll('.step-indicator').forEach(el => {
        const step = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (step < currentStep) el.classList.add('completed');
        if (step === currentStep) el.classList.add('active');
    });

    // Show/Hide Forms
    for (let i = 1; i <= 5; i++) {
        const div = document.getElementById(`step${i}`);
        if (i === currentStep) div.classList.remove('hidden');
        else div.classList.add('hidden');
    }
}

// --- Calculators ---

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
        const res = await fetch(`${API_BASE}/cycles?limit=5`);
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

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${cycle.id}</td>
                <td>${new Date(cycle.start_date).toLocaleDateString()}</td>
                <td>${formatMoney(cycle.initial_balance)}</td>
                <td>${cycle.final_balance ? formatMoney(cycle.final_balance) : '-'}</td>
                <td class="${spreadClass}">${cycle.spread_amount ? `${spreadIcon}${formatMoney(cycle.spread_amount)} (${cycle.spread_percentage.toFixed(2)}%)` : '-'}</td>
                <td><span class="status-badge ${cycle.status === 'OPEN' ? 'status-open' : 'status-completed'}">${cycle.status}</span></td>
            `;
            tbody.appendChild(tr);
        });

        // Update top widget with last completed spread
        const completed = data.data.find(c => c.status === 'COMPLETED');
        if (completed) {
            document.getElementById('lastSpread').innerText = `${completed.spread_percentage.toFixed(2)}%`;
            document.getElementById('lastSpreadAmount').innerText = `${completed.spread_amount >= 0 ? '+' : ''}${formatMoney(completed.spread_amount)} USDT`;
            document.getElementById('lastSpreadAmount').className = `stat-label ${completed.spread_amount >= 0 ? 'text-success' : 'text-danger'}`;
        }

    } catch (err) {
        console.error('Error loading history:', err);
    }
}

function formatMoney(amount) {
    return parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
