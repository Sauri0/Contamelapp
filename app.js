/**
 * Contamelapp - Core Application Logic (SPA)
 * Version 3.1.0 - Multi-currency & Dólar Blue
 */

let AppState = {
    user: { name: '', email: '', registered: false },
    auth: { username: '', password: '', isLoggedIn: false },
    rates: { ARS: 1, USD_BUY: 1415, USD_SELL: 1435, USD_AVG: 1425 },
    preferences: { displayCurrency: 'MIXED', analyticsCurrency: 'ARS' }, // MIXED, ARS, USD
    currentView: 'dashboard',
    movements: [],
    cards: [],
    contacts: [],
    budgets: [], // { category, limit, currency }
    goals: [], // { name, target, current, currency }
    recurring: [], // { name, amount, currency, category, day, type }
    lastRecurringSync: '', // YYYY-MM
    chatHistory: [
        { role: 'ai', text: '¡Hola! Soy tu asistente de Contamelapp. ¿Cómo puedo ayudarte hoy?' }
    ]
};

const CARD_GRADIENTS = [
    { id: 'emerald', class: 'from-emerald-500 via-emerald-600 to-emerald-800', bg: '#10b981' },
    { id: 'slate', class: 'from-slate-800 via-slate-900 to-black', bg: '#1e293b' },
    { id: 'rose', class: 'from-rose-500 via-rose-600 to-rose-800', bg: '#f43f5e' },
    { id: 'blue', class: 'from-blue-500 via-blue-600 to-blue-800', bg: '#3b82f6' },
    { id: 'indigo', class: 'from-indigo-500 via-indigo-600 to-indigo-800', bg: '#6366f1' },
    { id: 'amber', class: 'from-amber-400 via-amber-500 to-amber-700', bg: '#f59e0b' }
];

// --- Storage Logic ---
const STORAGE_KEY = 'contamelapp_state_v3';

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        AppState = JSON.parse(saved);
        // Migrations
        if (!AppState.auth) AppState.auth = { username: '', password: '', isLoggedIn: false };
        if (!AppState.preferences) AppState.preferences = { displayCurrency: 'MIXED' };
        if (!AppState.rates.USD_AVG) AppState.rates.USD_AVG = (AppState.rates.USD_BUY + AppState.rates.USD_SELL) / 2;
        if (!AppState.budgets) AppState.budgets = [];
        if (!AppState.goals) AppState.goals = [];
        if (!AppState.installments) AppState.installments = [];
        if (!AppState.lastInstallmentSync) AppState.lastInstallmentSync = '';
        if (!AppState.pendingAction) AppState.pendingAction = null;
        if (!AppState.preferences.analyticsCurrency) AppState.preferences.analyticsCurrency = 'ARS';
        
        // Migrate contacts to new balances object
        AppState.contacts.forEach(c => {
            if (c.amount !== undefined && !c.balances) {
                c.balances = { ARS: 0, USD: 0 };
                c.balances[c.currency || 'ARS'] = c.amount;
                delete c.amount;
                delete c.currency;
            }
            if (!c.balances) c.balances = { ARS: 0, USD: 0 };
        });

        // Migrate cards to include type
        AppState.cards.forEach(c => {
            if (!c.cardType) c.cardType = 'credit'; // Default to credit for existing cards
        });
        return true;
    }
    return false;
}

async function syncRates() {
    try {
        // Use a CORS-friendly public API for reliable client-side updates
        const response = await fetch('https://dolarapi.com/v1/dolares/blue');
        if (response.ok) {
            const data = await response.text();
            const json = JSON.parse(data);
            
            if (json && json.compra && json.venta) {
                AppState.rates.USD_BUY = parseFloat(json.compra);
                AppState.rates.USD_SELL = parseFloat(json.venta);
                AppState.rates.USD_AVG = (AppState.rates.USD_BUY + AppState.rates.USD_SELL) / 2;
                saveState();
                console.log("Rates updated automatically from DolarAPI:", AppState.rates);
            }
        }
    } catch (e) {
        console.warn("Could not fetch live rates automatically. Using stored rates.", e);
        // Ensure average is at least calculated from last known values
        AppState.rates.USD_AVG = (AppState.rates.USD_BUY + AppState.rates.USD_SELL) / 2;
    }
}

function formatCurrency(amount, currency = 'ARS') {
    const symbol = currency === 'USD' ? 'u$s ' : '$';
    // es-AR uses . for thousands and , for decimals
    const formatted = Math.abs(amount).toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    return (amount < 0 ? '-' : '') + symbol + formatted;
}

function convert(amount, from, to) {
    if (from === to) return amount;
    if (from === 'USD' && to === 'ARS') return amount * AppState.rates.USD_AVG;
    if (from === 'ARS' && to === 'USD') return amount / AppState.rates.USD_AVG;
    return amount;
}

function convertToARS(amount, currency) {
    return convert(amount, currency, 'ARS');
}

// --- Budget Engine ---
function getBudgetStatus(category) {
    const budget = AppState.budgets.find(b => b.category.toLowerCase() === category.toLowerCase());
    if (!budget) return null;

    const spent = AppState.movements
        .filter(m => m.type === 'expense' && m.category.toLowerCase() === category.toLowerCase())
        .reduce((sum, m) => sum + convert(m.amount, m.currency, budget.currency), 0);

    return {
        limit: budget.limit,
        spent: spent,
        remaining: budget.limit - spent,
        percent: Math.min(100, (spent / budget.limit) * 100),
        currency: budget.currency
    };
}

function checkBudget(category, amount, currency) {
    // ... code ...
}

function calculateGlobalBalance() {
    const cardNet = AppState.cards.reduce((acc, c) => {
        acc.ARS += (c.balances?.ARS || 0);
        acc.USD += (c.balances?.USD || 0);
        return acc;
    }, { ARS: 0, USD: 0 });

    const contactNet = AppState.contacts.reduce((acc, c) => {
        acc.ARS += (c.balances?.ARS || 0);
        acc.USD += (c.balances?.USD || 0);
        return acc;
    }, { ARS: 0, USD: 0 });

    const floatingNet = AppState.movements.reduce((acc, m) => {
        if (!m.cardId && !m.contactId) {
            const val = m.type === 'income' ? m.amount : -m.amount;
            if (m.currency === 'USD') acc.USD += val; else acc.ARS += val;
        }
        return acc;
    }, { ARS: 0, USD: 0 });

    return {
        ARS: cardNet.ARS + contactNet.ARS + floatingNet.ARS,
        USD: cardNet.USD + contactNet.USD + floatingNet.USD
    };
}

function processRecurring() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const dayOfMonth = now.getDate();
    let updated = false;

    AppState.recurring.forEach(r => {
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dayToProcess = Math.min(r.day || 1, lastDayOfMonth);
        
        if (dayOfMonth >= dayToProcess) {
            // Check if already processed this month for THIS subscription
            const alreadyAdded = AppState.movements.some(m => 
                m.text === r.name && 
                m.category === 'Suscripción' &&
                new Date(m.date).getMonth() === now.getMonth() &&
                new Date(m.date).getFullYear() === now.getFullYear()
            );

            if (!alreadyAdded) {
                const newMovement = {
                    id: Date.now() + Math.random(),
                    type: r.type,
                    amount: r.amount,
                    currency: r.currency,
                    category: 'Suscripción',
                    text: r.name,
                    date: now.toISOString(),
                    icon: r.type === 'expense' ? 'sync' : 'payments',
                    isRecurring: true // Extra safety for future checks
                };

                // Deduct from card balance if assigned
                if (r.cardId) {
                    const card = AppState.cards.find(c => c.id == r.cardId);
                    if (card) {
                        card.balances[r.currency] += (r.type === 'income' ? r.amount : -r.amount);
                    }
                }

                AppState.movements.unshift(newMovement);
                updated = true;
            }
        }
    });

    if (updated) saveState();
}

function parseLocaleFloat(str) {
    if (typeof str !== 'string') return parseFloat(str) || 0;
    let clean = str.replace(/\s/g, '');
    
    // Heuristic: If there is a comma and a dot, comma is usually decimal in es-AR
    // but if there's only one of them, we check if it's acting as a decimal.
    if (clean.includes(',') && clean.includes('.')) {
        // Assume . is thousands and , is decimal
        return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
    }
    
    if (clean.includes(',')) {
        // Only commas? If one comma, it's decimal. If multiple, it's thousands (weird but possible)
        const parts = clean.split(',');
        if (parts.length === 2) return parseFloat(clean.replace(',', '.')) || 0;
        return parseFloat(clean.replace(/,/g, '')) || 0;
    }

    if (clean.includes('.')) {
        // Only dots? If one dot AND it's not followed by exactly 3 digits (unless it's the only dot)
        // Actually, if there's only one dot, many users intend it as a decimal (US style).
        // If there's more than one dot, it's definitely thousands.
        const parts = clean.split('.');
        if (parts.length === 2) {
            // Check if it looks like thousands (e.g. 1.000)
            const afterDot = parts[1];
            if (afterDot.length === 3 && parseInt(parts[0]) < 1000) {
                // Could be 1.000 (one thousand) or 1.000 (one point zero zero zero).
                // In finance, usually thousands. But we'll treat single dots as decimals
                // ONLY if the user is typing decimals. This is tricky.
                // Let's assume single dot = decimal for values < 1000 or with non-3 decimal length.
                return parseFloat(clean) || 0; 
            }
            return parseFloat(clean) || 0;
        }
        return parseFloat(clean.replace(/\./g, '')) || 0;
    }

    return parseFloat(clean) || 0;
}

// --- Fuzzy Matching Logic ---
function normalizeString(str) {
    return str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s]/g, "") // Remove special chars
        .trim();
}

function getSimilarity(s1, s2) {
    const longer = s1.length < s2.length ? s2 : s1;
    const shorter = s1.length < s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    
    // Simple Levenshtein-based similarity
    const distance = (function(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = Array.from({ length: b.length + 1 }, () => []);
        for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = a[j - 1] === b[i - 1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        return matrix[b.length][a.length];
    })(longer, shorter);

    return (longer.length - distance) / longer.length;
}

function fuzzyMatch(input, list, key, threshold = 0.7) {
    const normalizedInput = normalizeString(input);
    if (!normalizedInput) return null;

    let bestMatch = null;
    let highestSimilarity = 0;
    let matchedSegment = "";

    // First try: Exact substring match (high priority)
    for (const item of list) {
        const itemValue = normalizeString(item[key]);
        // Check if item name is in input or vice versa
        if (normalizedInput.includes(itemValue)) {
            // Find the actual segment in the input (not normalized for removal)
            const regex = new RegExp(itemValue.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^a-z0-9]*').join(''), 'i');
            const match = input.match(regex);
            return { item, similarity: 1.0, exact: true, segment: match ? match[0] : item[key] };
        }
    }

    // Second try: Fuzzy word-by-word match
    const inputWords = normalizedInput.split(/\s+/);
    
    for (const item of list) {
        const itemValue = normalizeString(item[key]);
        const itemWords = itemValue.split(/\s+/);
        
        // Compare full strings
        const similarity = getSimilarity(normalizedInput, itemValue);
        
        // Check word by word
        let maxWordSimilarity = 0;
        let bestWordSegment = "";
        
        inputWords.forEach(iw => {
            itemWords.forEach(itw => {
                const s = getSimilarity(iw, itw);
                if (s > maxWordSimilarity) {
                    maxWordSimilarity = s;
                    bestWordSegment = iw;
                }
            });
        });

        const finalScore = Math.max(similarity, maxWordSimilarity * 0.9);

        if (finalScore > highestSimilarity && finalScore >= threshold) {
            highestSimilarity = finalScore;
            bestMatch = item;
            
            // Determine matched segment
            if (similarity > maxWordSimilarity * 0.9) {
                // The whole input matched somewhat
                matchedSegment = input;
            } else {
                // A specific word matched best
                // Find the original word in the input
                const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordMatch = input.match(new RegExp(escapeRegex(bestWordSegment), 'i'));
                matchedSegment = wordMatch ? wordMatch[0] : bestWordSegment;
            }
        }
    }

    return bestMatch ? { item: bestMatch, similarity: highestSimilarity, exact: false, segment: matchedSegment } : null;
}

// --- Installment Aging ---
function processInstallments() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
    
    // We reuse lastRecurringSync for simplicity or add lastInstallmentSync
    if (AppState.lastInstallmentSync === currentMonth) return;

    AppState.installments.forEach(ins => {
        if (ins.remaining > 1) { // 1 because the first one was already processed
            ins.remaining--;
            
            // Create a movement for the current month's installment
            const installmentNumber = ins.count - ins.remaining;
            const newMovement = {
                id: Date.now() + Math.random(),
                text: `${ins.name} (Cuota ${installmentNumber}/${ins.count})`,
                amount: ins.amount,
                currency: ins.currency,
                type: 'expense',
                category: 'Cuotas',
                date: now.toISOString(),
                icon: 'calendar_month',
                cardId: ins.cardId,
                isInstallment: true
            };
            AppState.movements.unshift(newMovement);

            // Deduct from card balance if assigned
            if (ins.cardId) {
                const card = AppState.cards.find(c => c.id == ins.cardId);
                if (card) {
                    if (!card.balances) card.balances = { ARS: 0, USD: 0 };
                    card.balances[ins.currency] -= ins.amount;
                }
            }
        }
    });

    AppState.lastInstallmentSync = currentMonth;
    saveState();
}

// --- View Templates ---
const ViewTemplates = {
    modal: (title, content, actionId, actionText) => `
        <div id="modal-container" class="fixed inset-0 z-[100] modal-overlay animate-in fade-in duration-300">
            <div class="w-full max-w-sm modal-glass rounded-[2.5rem] p-8 relative overflow-hidden">
                <!-- Decorative background -->
                <div class="absolute top-[-10%] right-[-10%] size-32 bg-primary/10 blur-3xl rounded-full"></div>
                
                <div class="relative z-10">
                    <div class="flex items-center justify-between mb-8">
                        <div>
                            <h2 class="text-2xl font-black text-slate-100 tracking-tighter">${title}</h2>
                            <div class="h-1 w-8 bg-primary rounded-full mt-1"></div>
                        </div>
                        <button id="close-modal" class="size-10 glass rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div class="mb-8 text-slate-300">
                        ${content}
                    </div>

                    <div class="flex gap-3">
                        <button id="cancel-modal" class="flex-1 py-4 glass rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Cancelar</button>
                        <button id="${actionId}" class="flex-[2] py-4 bg-primary text-background-dark font-black rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-[10px] uppercase tracking-widest leading-none">
                            ${actionText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,
    cardForm: () => `
        <div class="space-y-4">
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Nombre de la Tarjeta</label>
                <input id="f-card-name" type="text" placeholder="Ej: Visa Santander" class="w-full p-4 rounded-2xl">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-primary uppercase">Saldo ARS</label>
                    <input id="f-card-balance-ars" type="number" placeholder="0" value="0" class="w-full p-4 rounded-2xl">
                </div>
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-primary uppercase">Saldo USD</label>
                    <input id="f-card-balance-usd" type="number" placeholder="0" value="0" class="w-full p-4 rounded-2xl">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-primary uppercase">Últimos 4 dígitos</label>
                    <input id="f-card-last4" type="text" placeholder="1234" maxlength="4" class="w-full p-4 rounded-2xl">
                </div>
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-primary uppercase">Tipo</label>
                    <select id="f-card-type" class="w-full p-4 rounded-2xl">
                        <option value="credit">Crédito</option>
                        <option value="debit">Débito</option>
                    </select>
                </div>
            </div>
            <div class="space-y-2">
                <label class="text-[10px] font-bold text-primary uppercase ml-1">Color de la Tarjeta</label>
                <div class="flex justify-between items-center glass p-3 rounded-2xl">
                    ${CARD_GRADIENTS.map(g => `
                        <button type="button" onclick="selectCardColor('${g.id}')" data-color-id="${g.id}" class="color-swatch size-8 rounded-full border-2 border-transparent transition-all scale-90 hover:scale-100" style="background-color: ${g.bg}"></button>
                    `).join('')}
                    <input type="hidden" id="f-card-color" value="emerald">
                </div>
            </div>
        </div>
    `,
    budgetForm: () => `
        <div class="space-y-4">
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Categoría</label>
                <input id="f-budget-cat" type="text" placeholder="Ej: Comida" class="w-full p-4 rounded-2xl">
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Límite Mensual</label>
                <input id="f-budget-limit" type="number" placeholder="0.00" class="w-full p-4 rounded-2xl">
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Moneda</label>
                <select id="f-budget-currency" class="w-full p-4 rounded-2xl">
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                </select>
            </div>
        </div>
    `,
    goalForm: () => `
        <div class="space-y-4">
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Nombre de la Meta</label>
                <input id="f-goal-name" type="text" placeholder="Ej: Nuevo Auto" class="w-full p-4 rounded-2xl">
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Objetivo Total</label>
                <input id="f-goal-target" type="number" placeholder="0.00" class="w-full p-4 rounded-2xl">
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Moneda</label>
                <select id="f-goal-currency" class="w-full p-4 rounded-2xl">
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                </select>
            </div>
        </div>
    `,
    recurringForm: () => `
        <div class="space-y-4">
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Nombre (Ej: Netflix)</label>
                <input id="f-rec-name" type="text" class="w-full p-4 rounded-2xl">
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase ml-1">Monto</label>
                <input id="f-rec-amount" type="text" placeholder="0,00" class="w-full p-4 rounded-2xl">
            </div>
            <div class="space-y-1 flex gap-4">
                <div class="flex-1 space-y-1">
                    <label class="text-[10px] font-bold text-primary uppercase ml-1">Día (1-31)</label>
                    <input id="f-rec-day" type="number" value="1" min="1" max="31" class="w-full p-4 rounded-2xl">
                </div>
                <div class="flex-1 space-y-1">
                    <label class="text-[10px] font-bold text-primary uppercase">Moneda</label>
                    <select id="f-rec-currency" class="w-full p-4 rounded-2xl">
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                    </select>
                </div>
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Tipo</label>
                <select id="f-rec-type" class="w-full p-4 rounded-2xl">
                    <option value="expense">Gasto</option>
                    <option value="income">Ingreso</option>
                </select>
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase ml-1">Tarjeta Asociada</label>
                <select id="f-rec-card" class="w-full p-4 rounded-2xl">
                    <option value="">Ninguna</option>
                    ${AppState.cards.map(c => `<option value="${c.id}">${c.name} (${c.cardType === 'credit' ? 'Crédito' : 'Débito'} •••• ${c.last4})</option>`).join('')}
                </select>
            </div>
        </div>
    `,
    analytics: () => {
        const now = new Date();
        const thisMonthMovements = AppState.movements.filter(m => {
            const mDate = new Date(m.date === 'Hoy' ? new Date().toISOString() : m.date);
            return mDate.getMonth() === now.getMonth() && mDate.getFullYear() === now.getFullYear();
        });

        const activeCur = AppState.preferences.analyticsCurrency || 'ARS';
        
        // Calculation logic for current month totals
        const getDisplayAmount = (m) => {
            if (activeCur === 'MIXED') return m.currency === 'ARS' ? m.amount : m.amount * AppState.rates.USD_AVG;
            if (activeCur === 'ARS') return m.currency === 'ARS' ? m.amount : m.amount * AppState.rates.USD_AVG;
            // USD view: convert ARS movements to USD if in USD view
            return m.currency === 'USD' ? m.amount : m.amount / AppState.rates.USD_AVG;
        };

        const totalExpense = thisMonthMovements.filter(m => m.type === 'expense').reduce((acc, m) => acc + getDisplayAmount(m), 0);
        const totalIncome = thisMonthMovements.filter(m => m.type === 'income').reduce((acc, m) => acc + getDisplayAmount(m), 0);
        
        // Category Breakdown (Always ARS for consistent progress bars unless specified? No, use activeCur)
        const cats = {};
        thisMonthMovements.filter(m => m.type === 'expense').forEach(m => {
            cats[m.category] = (cats[m.category] || 0) + getDisplayAmount(m);
        });
        const sortedCats = Object.entries(cats).sort((a,b) => b[1] - a[1]);
        
        // Top 3 Expenses
        const topExpenses = AppState.movements
            .filter(m => m.type === 'expense')
            .sort((a,b) => getDisplayAmount(b) - getDisplayAmount(a))
            .slice(0, 3);

        const savingsRatio = totalIncome > 0 ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100)) : 0;
        let savingsAdvice = "Carga tus primeros movimientos para ver el progreso de tus metas.";
        if (AppState.movements.length > 0) {
            if (savingsRatio > 0) {
                savingsAdvice = `¡Vas por buen camino! Estás ahorrando un <span class="text-emerald-400">${savingsRatio}%</span> de lo que ingresas este mes.`;
            } else if (totalIncome > 0) {
                savingsAdvice = "Tus gastos están alcanzando tus ingresos. ¡Ojo con el presupuesto!";
            } else {
                savingsAdvice = "Registrá tus ingresos para calcular cuánto lográs ahorrar este mes.";
            }
        }

        const globalBalance = calculateGlobalBalance();

        return `
        <div class="px-6 py-8 view-transition font-display relative bg-gradient-to-b from-navy-dark to-background-dark min-h-screen">
            <button onclick="renderView('dashboard')" class="absolute top-8 right-6 size-10 rounded-full glass flex items-center justify-center text-slate-400 hover:text-white transition-all hover:scale-110 active:scale-90 z-20">
                <span class="material-symbols-outlined">close</span>
            </button>
            <div class="mb-8">
                <h2 class="text-3xl font-extrabold tracking-tighter leading-tight italic">Métricas<span class="text-primary">.</span></h2>
                <p class="text-slate-400 text-sm font-medium uppercase tracking-[0.3em] text-[10px] opacity-60">Control de Rendimiento</p>
            </div>

            <!-- Global Balance Focus -->
            <div class="glass px-4 py-8 rounded-[40px] border-white/5 mb-8 text-center relative overflow-hidden">
                <div class="absolute inset-0 bg-primary/5 blur-3xl rounded-full"></div>
                <p class="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-4 opacity-80 italic relative z-10">Balance Neto Total</p>
                <div class="flex flex-col items-center gap-2 relative z-10 w-full overflow-hidden">
                    <p class="text-4xl font-black text-white italic tracking-tighter leading-none break-all">$ ${globalBalance.ARS.toLocaleString()}</p>
                    <p class="text-4xl font-bold text-emerald-400 italic tracking-tight opacity-90 break-all">u$s ${globalBalance.USD.toLocaleString()}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-8">
                <div id="toggle-exp-cur" class="glass p-5 rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/5 to-transparent cursor-pointer active:scale-95 transition-all">
                    <div class="flex justify-between items-center mb-1">
                        <p class="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Gastos Mes</p>
                        <span class="material-symbols-outlined text-[10px] text-rose-400 opacity-40">sync</span>
                    </div>
                    <p class="text-xl font-black text-rose-500 italic">
                        ${activeCur === 'USD' ? 'u$s ' : '$ '}${Math.round(totalExpense).toLocaleString()}
                    </p>
                </div>
                <div id="toggle-inc-cur" class="glass p-5 rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/5 to-transparent cursor-pointer active:scale-95 transition-all">
                    <div class="flex justify-between items-center mb-1">
                        <p class="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Ingresos Mes</p>
                        <span class="material-symbols-outlined text-[10px] text-emerald-400 opacity-40">sync</span>
                    </div>
                    <p class="text-xl font-black text-emerald-500 italic">
                        ${activeCur === 'USD' ? 'u$s ' : '$ '}${Math.round(totalIncome).toLocaleString()}
                    </p>
                </div>
            </div>

            <div class="space-y-6 pb-32">
                <!-- Trend Chart -->
                <div class="glass p-6 rounded-[2.5rem] border border-white/10">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary text-sm">trending_up</span>
                            Evolución Mensual
                        </h3>
                        <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Gasto por mes</span>
                    </div>
                    <div class="h-48 w-full relative">
                        <canvas id="analytics-trend-chart"></canvas>
                    </div>
                </div>

                <!-- Category Breakdown -->
                <div class="glass p-6 rounded-[2.5rem] border border-white/10">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-sm">pie_chart</span>
                        Distribución de Gastos
                    </h3>
                    <div class="space-y-5">
                        ${sortedCats.length === 0 ? `
                            <p class="text-center py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">No hay gastos este mes</p>
                        ` : sortedCats.slice(0, 5).map(([cat, amount]) => {
                            const percent = Math.round((amount / totalExpense) * 100);
                            return `
                                <div class="space-y-2">
                                    <div class="flex justify-between items-end">
                                        <span class="text-[10px] font-black text-slate-200 uppercase tracking-widest">${cat}</span>
                                        <span class="text-[10px] font-black text-primary">${percent}%</span>
                                    </div>
                                    <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div class="h-full bg-primary rounded-full transition-all duration-1000" style="width: ${percent}%"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- Ratio de Ahorro -->
                <div class="glass p-6 rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-primary/10 to-transparent relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10">
                        <span class="material-symbols-outlined text-8xl text-primary">rocket_launch</span>
                    </div>
                    <div class="relative z-10">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Ratio de Ahorro</h3>
                                <p class="text-5xl font-black text-white italic">${AppState.movements.length === 0 ? '--' : savingsRatio}<span class="text-primary text-2xl NOT-italic">%</span></p>
                            </div>
                        </div>
                        <p class="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-wider">${savingsAdvice}</p>
                    </div>
                </div>

                <!-- Top Expenses -->
                ${topExpenses.length > 0 ? `
                <div class="space-y-4">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 px-1">Mayores Gastos</h3>
                    <div class="space-y-3">
                        ${topExpenses.map(m => `
                            <div class="glass-card p-4 rounded-3xl border border-white/5 flex justify-between items-center transition-all hover:bg-white/5">
                                <div class="flex items-center gap-4">
                                    <div class="size-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                                        <span class="material-symbols-outlined text-rose-500 text-lg">${m.icon}</span>
                                    </div>
                                    <div>
                                        <p class="text-sm font-bold text-slate-100">${m.text}</p>
                                        <p class="text-[9px] text-slate-500 uppercase font-black tracking-widest">${m.category}</p>
                                    </div>
                                </div>
                                <p class="font-black text-slate-100 italic">${formatCurrency(m.amount, m.currency)}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
        `;
    },
    contactForm: () => `
        <div class="space-y-4">
            <div class="flex justify-center mb-4">
                <div class="avatar-upload size-24 rounded-full bg-navy-muted border border-white/10 overflow-hidden flex items-center justify-center relative">
                    <img id="f-contact-preview" class="hidden size-full object-cover">
                    <span id="f-contact-icon" class="material-symbols-outlined text-4xl text-slate-700">person</span>
                    <input type="file" id="f-contact-photo" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*">
                    <div class="upload-overlay absolute inset-0 flex items-center justify-center text-white pointer-events-none"><span class="material-symbols-outlined">add_a_photo</span></div>
                </div>
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase">Nombre del Contacto</label>
                <input id="f-contact-name" type="text" placeholder="Ej: Juan Gigli" class="w-full p-4 rounded-2xl">
            </div>
        </div>
    `,
    auth: () => `
        <main class="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center view-transition min-h-screen bg-background-dark font-display relative overflow-hidden">
            <div class="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-primary/10 blur-[120px] rounded-full"></div>
            <div class="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-emerald-700/10 blur-[120px] rounded-full"></div>
            
            <div class="size-20 rounded-3xl bg-primary/20 flex items-center justify-center mb-8 animate-pulse relative z-10">
                <span class="material-symbols-outlined text-primary text-5xl">lock</span>
            </div>
            <h1 class="text-4xl font-extrabold tracking-tighter mb-4 relative z-10">Contamelapp</h1>
            <p class="text-slate-400 mb-12 relative z-10">${AppState.user.registered ? 'Ingresa tus credenciales para continuar' : 'Crea tu cuenta local protegida'}</p>
            
            <div class="w-full space-y-4 relative z-10">
                <div class="space-y-2 text-left">
                    <label class="text-[10px] font-bold text-primary uppercase ml-1 tracking-widest">Usuario</label>
                    <input id="auth-user" type="text" placeholder="Tu nombre de usuario" value="${AppState.auth.username}" class="w-full glass rounded-2xl p-4 text-slate-100 border-none focus:ring-2 focus:ring-primary outline-none">
                </div>
                <div class="space-y-2 text-left relative">
                    <label class="text-[10px] font-bold text-primary uppercase ml-1 tracking-widest">Contraseña</label>
                    <div class="relative">
                        <input id="auth-pass" type="password" placeholder="••••••••" class="w-full glass rounded-2xl p-4 text-slate-100 border-none focus:ring-2 focus:ring-primary outline-none">
                        <button id="toggle-pass" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span class="material-symbols-outlined text-xl">visibility_off</span>
                        </button>
                    </div>
                </div>
                <button id="auth-btn" class="w-full py-5 bg-primary text-background-dark font-black rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest mt-6">
                    ${AppState.user.registered ? 'Entrar' : 'Registrarse'}
                </button>
            </div>
        </main>
    `,

    dashboard: () => {
        const convert = (val, from, to) => {
            if (from === to) return val;
            return from === 'ARS' ? val / AppState.rates.USD_AVG : val * AppState.rates.USD_AVG;
        };

        const totals = calculateGlobalBalance();
        const totalAsARS = totals.ARS + convert(totals.USD, 'USD', 'ARS');
        const totalAsUSD = totals.USD + convert(totals.ARS, 'ARS', 'USD');
        
        let primaryLabel = "Patrimonio Neto (Mixto)";
        let primaryValue = "";
        let secondaryLabel = "";

        if (AppState.preferences.displayCurrency === 'ARS') {
            primaryLabel = "Patrimonio Neto (ARS)";
            primaryValue = `$${totalAsARS.toLocaleString()}`;
            secondaryLabel = `u$s ${totalAsUSD.toLocaleString()} aprox.`;
        } else if (AppState.preferences.displayCurrency === 'USD') {
            primaryLabel = "Patrimonio Neto (USD)";
            primaryValue = `u$s ${totalAsUSD.toLocaleString()}`;
            secondaryLabel = `$${totalAsARS.toLocaleString()} aprox.`;
        } else {
            primaryValue = `$${totals.ARS.toLocaleString()} + u$s ${totals.USD.toLocaleString()}`;
            secondaryLabel = `Total: $${totalAsARS.toLocaleString()} ARS`;
        }

        const netARS = totals.ARS;
        const netUSD = totals.USD;

        return `
        <div class="px-6 pt-10 pb-12 relative overflow-hidden">
            <div class="flex justify-between items-start mb-8 relative z-10">
                <button id="settings-btn" class="size-12 rounded-full glass border border-white/10 flex items-center justify-center hover:bg-white/10 hover:scale-110 active:scale-90 transition-all duration-200 text-slate-300">
                    <span class="material-symbols-outlined text-2xl font-light">settings</span>
                </button>
                <h1 class="text-lg font-black tracking-[0.2em] text-center pt-2">CONTAMEL<span class="text-primary">APP</span></h1>
                <button id="analytics-btn" class="size-12 rounded-full glass border border-white/10 flex items-center justify-center hover:bg-white/10 hover:scale-110 active:scale-90 transition-all duration-200 text-slate-300">
                    <span class="material-symbols-outlined text-2xl font-light">trending_up</span>
                </button>
            </div>

            <!-- Net Worth Area -->
            <div id="net-worth-toggle" class="relative z-10 text-center cursor-pointer active:scale-95 transition-transform flex flex-col items-center">
                <p class="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-4 opacity-80 italic">Patrimonio Neto</p>
                <div class="flex flex-col items-center gap-2">
                    ${AppState.preferences.displayCurrency === 'ARS' || AppState.preferences.displayCurrency === 'MIXED' ? 
                        `<p class="text-4xl font-black text-white italic tracking-tighter leading-none">$ ${netARS.toLocaleString()}</p>` : ''}
                    ${AppState.preferences.displayCurrency === 'USD' || AppState.preferences.displayCurrency === 'MIXED' ? 
                        `<p class="text-4xl font-black text-emerald-400 italic tracking-tighter leading-none">u$s ${netUSD.toLocaleString()}</p>` : ''}
                </div>
                <div class="mt-6 flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                    <span class="material-symbols-outlined text-xs text-slate-500">touch_app</span>
                    <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Toca para cambiar moneda</span>
                </div>
            </div>
        </div>

        <!-- Dólar Ticker -->
        <section class="px-4 py-2">
            <div class="glass flex items-center justify-between px-4 py-3 rounded-2xl border border-white/5">
                <div class="flex items-center gap-2">
                    <div class="size-2 rounded-full bg-blue-400 animate-pulse"></div>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dólar Blue (Promedio: $${AppState.rates.USD_AVG})</span>
                </div>
                <div class="flex gap-4">
                    <div class="text-center">
                        <p class="text-[8px] uppercase font-bold text-slate-500">Compra</p>
                        <p class="text-xs font-bold text-slate-100">$${AppState.rates.USD_BUY}</p>
                    </div>
                    <div class="text-center">
                        <p class="text-[8px] uppercase font-bold text-slate-500">Venta</p>
                        <p class="text-xs font-bold text-primary">$${AppState.rates.USD_SELL}</p>
                    </div>
                </div>
            </div>
        </section>


        <!-- Budget Quick View -->
        ${AppState.budgets.length > 0 ? `
        <section class="px-4 py-2">
            <h3 class="text-slate-100 text-[10px] font-black uppercase tracking-widest mb-3 opacity-60">Presupuestos Activos</h3>
            <div class="space-y-3">
                ${AppState.budgets.slice(0, 2).map(b => {
                    const status = getBudgetStatus(b.category);
                    return `
                    <div class="glass p-3 rounded-2xl">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-bold text-slate-100">${b.category}</span>
                            <span class="text-[10px] font-bold text-slate-400">${Math.round(status.percent)}%</span>
                        </div>
                        <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div class="h-full ${status.percent > 90 ? 'bg-rose-500' : 'bg-primary'} transition-all duration-1000" style="width: ${status.percent}%"></div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </section>
        ` : ''}

        <section class="px-4 py-2">
            <div class="glass-card rounded-xl p-5 overflow-hidden">
                <div class="flex justify-between items-end mb-6">
                    <div class="font-display">
                        <h3 class="text-slate-100 text-base font-bold">Resumen Semanal</h3>
                        <p class="text-slate-500 text-xs uppercase tracking-tighter">Variación en Pesos</p>
                    </div>
                </div>
                <div class="h-32 w-full relative">
                    <canvas id="mainChart"></canvas>
                </div>
            </div>
        </section>

        <!-- Savings Goals -->
        ${AppState.goals.length > 0 ? `
        <section class="px-4 py-2">
            <h3 class="text-slate-100 text-[10px] font-black uppercase tracking-widest mb-3 opacity-60">Metas de Ahorro</h3>
            <div class="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                ${AppState.goals.map(g => {
                    const progress = Math.min(100, (g.current / g.target) * 100);
                    return `
                    <div class="min-w-[160px] glass p-4 rounded-3xl shrink-0">
                        <p class="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">${g.name}</p>
                        <p class="text-lg font-black text-slate-100">${formatCurrency(g.current, g.currency)}</p>
                        <p class="text-[8px] text-slate-500 mb-3">Meta: ${formatCurrency(g.target, g.currency)}</p>
                        <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div class="h-full bg-cyan-400" style="width: ${progress}% transition: width 1s ease-out"></div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </section>
        ` : ''}

        <section class="p-4 grid grid-cols-2 gap-4">
            <div class="glass-card rounded-xl p-4 flex flex-col justify-between h-36">
                <div class="p-2 rounded-lg bg-emerald-500/10 text-primary w-fit"><span class="material-symbols-outlined">payments</span></div>
                <div>
                    <p class="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Bóveda</p>
                    <p class="text-slate-100 text-lg font-bold truncate">${AppState.preferences.displayCurrency === 'USD' ? 'u$s ' + totalAsUSD.toFixed(0) : '$' + totalAsARS.toLocaleString()}</p>
                </div>
            </div>
            <div class="glass-card rounded-xl p-4 flex flex-col justify-between h-36">
                <div class="p-2 rounded-lg bg-cyan-400/10 text-cyan-400 w-fit"><span class="material-symbols-outlined">group</span></div>
                <div>
                    <p class="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Contactos</p>
                    <p class="text-slate-100 text-lg font-bold">${AppState.contacts.length} Activos</p>
                </div>
            </div>
        </section>

        <!-- Pagos en Cuotas -->
        ${AppState.installments.length > 0 ? `
        <section class="px-4 py-2">
            <h3 class="text-slate-100 text-[10px] font-black uppercase tracking-widest mb-3 opacity-60">Pagos en Cuotas</h3>
            <div class="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                ${AppState.installments.filter(ins => ins.remaining > 0).map(ins => {
                    const card = AppState.cards.find(c => c.id == ins.cardId);
                    const cardName = card ? card.name : 'Efectivo';
                    return `
                    <div class="min-w-[200px] glass p-4 rounded-3xl shrink-0">
                        <div class="flex justify-between items-start mb-2">
                            <p class="text-[10px] font-bold text-slate-300 uppercase truncate pr-2">${ins.name}</p>
                            <div class="flex items-center gap-1">
                                <span class="text-[8px] bg-white/5 px-2 py-0.5 rounded-full text-slate-400">${ins.count - ins.remaining + 1}/${ins.count}</span>
                                <button onclick="removeInstallment(${ins.id})" class="text-rose-500/50 hover:text-rose-500 active:scale-90 transition-all"><span class="material-symbols-outlined text-[10px]">delete</span></button>
                            </div>
                        </div>
                        <p class="text-lg font-black text-slate-100 leading-tight">${formatCurrency(ins.amount, ins.currency)}</p>
                        <div class="flex items-center gap-1 mt-2">
                            <span class="material-symbols-outlined text-[10px] text-primary">credit_card</span>
                            <span class="text-[9px] text-slate-500 font-bold uppercase">${cardName}</span>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </section>
        ` : ''}

        <section class="px-6 py-2 flex justify-between items-center mt-4">
            <h3 class="text-slate-100 font-bold">Actividad Reciente</h3>
            <button id="view-all-activity" class="text-primary text-xs font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95">Ver Todo</button>
        </section>

        <section id="recent-list" class="px-4 space-y-3 pb-32">
            ${AppState.movements.length === 0 ? `
                <div class="py-12 text-center">
                    <div class="size-16 rounded-full glass mx-auto flex items-center justify-center text-slate-800 mb-4">
                        <span class="material-symbols-outlined text-3xl text-slate-600">inbox</span>
                    </div>
                    <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Sin movimientos</p>
                </div>
            ` : AppState.movements.slice(0, 5).map(m => `
                <div class="flex items-center justify-between p-3 glass-card rounded-xl border border-white/5">
                    <div class="flex items-center gap-3">
                        <div class="size-10 rounded-full bg-slate-800 flex items-center justify-center shadow-lg">
                            <span class="material-symbols-outlined text-slate-400 text-xl">${m.icon}</span>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-slate-100 leading-none mb-1">${m.text}</p>
                            <p class="text-[9px] text-slate-500 uppercase font-black tracking-tighter">${m.category} • ${m.date}</p>
                        </div>
                    </div>
                    <p class="font-black text-sm ${m.type === 'income' ? 'text-primary' : 'text-rose-500'}">
                        ${m.type === 'income' ? '+' : '-'}${formatCurrency(m.amount, m.currency)}
                    </p>
                </div>
            `).join('')}
        </section>
    `;
    },

    history: () => {
        return `
        <div class="px-6 py-8 view-transition font-display bg-gradient-to-b from-navy-dark to-background-dark min-h-screen">
            <div class="flex items-center gap-4 mb-8">
                <button onclick="renderView('dashboard')" class="size-10 rounded-full glass flex items-center justify-center text-slate-400 hover:text-white transition-all hover:scale-110 active:scale-90">
                    <span class="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                    <h2 class="text-2xl font-extrabold tracking-tighter italic">Historial<span class="text-primary">.</span></h2>
                    <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-none">Todos los movimientos</p>
                </div>
            </div>

            <section class="space-y-3 pb-32">
                ${AppState.movements.length === 0 ? `
                    <div class="py-12 text-center">
                        <div class="size-16 rounded-full glass mx-auto flex items-center justify-center text-slate-800 mb-4">
                            <span class="material-symbols-outlined text-3xl text-slate-600">inbox</span>
                        </div>
                        <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Sin movimientos</p>
                    </div>
                ` : AppState.movements.map(m => `
                    <div class="flex items-center justify-between p-3 glass rounded-xl border border-white/5">
                        <div class="flex items-center gap-3">
                            <div class="size-10 rounded-full bg-slate-800 flex items-center justify-center shadow-lg">
                                <span class="material-symbols-outlined text-slate-400 text-xl">${m.icon}</span>
                            </div>
                            <div>
                                <p class="text-sm font-bold text-slate-100 leading-none mb-1">${m.text}</p>
                                <p class="text-[9px] text-slate-500 uppercase font-black tracking-tighter">${m.category} • ${m.date}</p>
                            </div>
                        </div>
                        <p class="font-black text-sm ${m.type === 'income' ? 'text-primary' : 'text-rose-500'}">
                            ${m.type === 'income' ? '+' : '-'}${formatCurrency(m.amount, m.currency)}
                        </p>
                    </div>
                `).join('')}
            </section>
        </div>
        `;
    },

    vault: () => {
        const renderCardList = (type, title) => {
            const list = AppState.cards.filter(c => c.cardType === type);
            if (list.length === 0) return '';
            return `
                <div class="px-6 mb-4">
                    <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">${title}</h3>
                    <div class="flex flex-col gap-4">
                        ${list.map(card => `
                            <div class="w-full h-[180px] rounded-2xl p-6 flex flex-col justify-between card-shadow relative overflow-hidden bg-gradient-to-br ${card.gradient} border border-white/20">
                                <div class="flex justify-between items-start">
                                    <span class="material-symbols-outlined text-white/80 text-3xl">contactless</span>
                                    <div class="bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                                        <p class="text-[10px] font-bold text-white uppercase italic tracking-tighter">${card.name}</p>
                                    </div>
                                </div>
                                <div class="space-y-1">
                                    <p class="text-white/70 text-[8px] font-bold uppercase tracking-wider">Saldos</p>
                                    <div class="flex justify-between items-center">
                                        <p class="text-white text-lg font-bold tracking-tight">$ ${card.balances?.ARS.toLocaleString() || 0}</p>
                                        <p class="text-white/90 text-sm font-medium">u$s ${card.balances?.USD.toLocaleString() || 0}</p>
                                    </div>
                                </div>
                                <div class="flex justify-between items-end">
                                    <p class="text-white/90 font-mono tracking-widest text-sm">•••• ${card.last4}</p>
                                    <div class="flex gap-2">
                                        <button onclick="editCard(${card.id})" class="size-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"><span class="material-symbols-outlined text-sm">edit</span></button>
                                        <button onclick="removeCard(${card.id})" class="size-8 rounded-full bg-rose-500/20 flex items-center justify-center hover:bg-rose-500/40 transition-colors"><span class="material-symbols-outlined text-sm">delete</span></button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        };

        return `
        <div class="px-6 py-8 view-transition font-display">
            <h2 class="text-3xl font-extrabold tracking-tighter leading-tight">Bóveda Digital</h2>
            <p class="text-slate-400 text-sm font-medium">Gestiona tus activos y tarjetas físicas</p>
        </div>
        
        ${AppState.cards.length === 0 ? `
            <div class="px-6 mb-8">
                <div class="w-full h-[190px] rounded-2xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-slate-500 text-center px-8">
                    <span class="material-symbols-outlined text-4xl mb-2">add_card</span>
                    <p class="text-xs font-bold uppercase tracking-widest">Sin Tarjetas</p>
                </div>
            </div>
        ` : `
            <div class="pb-4">
                ${renderCardList('credit', 'Tarjetas de Crédito')}
                ${renderCardList('debit', 'Tarjetas de Débito')}
            </div>
        `}

        <section class="px-6 mt-4 pb-32">
            <button id="add-card-btn" class="w-full py-4 glass-card rounded-2xl border-dashed border-primary/40 text-primary font-bold flex items-center justify-center gap-2 hover:bg-primary/5 transition-all">
                <span class="material-symbols-outlined">add</span> Agregar Nueva Tarjeta
            </button>
        </section>
    `;
    },

    social: () => `
        <div class="px-6 py-8 view-transition font-display text-slate-100">
            <h1 class="text-3xl font-extrabold tracking-tighter">Social Ledger</h1>
            <p class="text-slate-400 text-sm font-medium">Personas y deudas compartidas</p>
        </div>
        
        <div class="px-6 pb-6 space-y-8 pb-32">
            <section class="grid grid-cols-2 gap-4">
                <div class="glass-card p-4 rounded-2xl">
                    <span class="text-[10px] font-black text-primary uppercase tracking-widest">Me deben</span>
                    <div class="mt-1 space-y-0.5">
                        <p class="text-sm font-bold text-slate-100 italic">
                            $${AppState.contacts.reduce((acc, c) => acc + Math.max(0, c.balances?.ARS || 0), 0).toLocaleString()}
                        </p>
                        <p class="text-[10px] font-bold text-slate-400 italic">
                            u$s ${AppState.contacts.reduce((acc, c) => acc + Math.max(0, c.balances?.USD || 0), 0).toLocaleString()}
                        </p>
                    </div>
                </div>
                <div class="glass-card p-4 rounded-2xl">
                    <span class="text-[10px] font-black text-rose-500 uppercase tracking-widest">Debo</span>
                    <div class="mt-1 space-y-0.5">
                        <p class="text-sm font-bold text-slate-100 italic">
                            $${AppState.contacts.reduce((acc, c) => acc + Math.abs(Math.min(0, c.balances?.ARS || 0)), 0).toLocaleString()}
                        </p>
                        <p class="text-[10px] font-bold text-slate-400 italic">
                            u$s ${AppState.contacts.reduce((acc, c) => acc + Math.abs(Math.min(0, c.balances?.USD || 0)), 0).toLocaleString()}
                        </p>
                    </div>
                </div>
            </section>

            <section class="space-y-4">
                <div class="flex items-center justify-between">
                    <h2 class="text-lg font-bold font-display">Contactos</h2>
                    <button id="add-contact-btn" class="text-primary font-bold text-xs">+ Agregar</button>
                </div>
                ${AppState.contacts.length === 0 ? `
                    <div class="py-12 text-center glass rounded-3xl border-dashed border-white/5">
                        <p class="text-slate-500 text-xs font-bold">Lista de contactos vacía</p>
                    </div>
                ` : AppState.contacts.sort((a,b) => (b.balances?.ARS||0) - (a.balances?.ARS||0)).map(c => {
                    const hasARS = c.balances?.ARS !== 0;
                    const hasUSD = c.balances?.USD !== 0;
                    return `
                    <div class="glass-card p-4 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div class="flex items-center gap-4">
                            <div class="size-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 uppercase overflow-hidden text-sm">
                                ${c.photo ? `<img src="${c.photo}" class="size-full object-cover">` : c.name.substring(0, 1)}
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-100">${c.name}</h3>
                                <p class="text-[9px] uppercase font-bold text-slate-500 tracking-tight">
                                    ${(c.balances?.ARS > 0 || c.balances?.USD > 0) ? 'Me debe' : (c.balances?.ARS < 0 || c.balances?.USD < 0) ? 'Le debo' : 'Al día'}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                ${hasARS ? `<p class="font-black text-xs ${c.balances.ARS > 0 ? 'text-primary' : 'text-rose-500'} italic leading-none">${formatCurrency(c.balances.ARS, 'ARS')}</p>` : ''}
                                ${hasUSD ? `<p class="font-black text-[10px] ${c.balances.USD > 0 ? 'text-primary' : 'text-rose-500'} italic mt-0.5 leading-none">${formatCurrency(c.balances.USD, 'USD')}</p>` : ''}
                                ${(!hasARS && !hasUSD) ? `<p class="text-[10px] text-slate-600 italic">En cero</p>` : ''}
                            </div>
                            <div class="flex flex-col gap-1 border-l border-white/5 pl-2">
                                <button onclick="editContact(${c.id})" class="text-slate-500 hover:text-primary transition-colors"><span class="material-symbols-outlined text-xs">edit</span></button>
                                <button onclick="removeContact(${c.id})" class="text-slate-600 hover:text-rose-500 transition-colors"><span class="material-symbols-outlined text-xs">delete</span></button>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </section>
        </div>
    `,

    settings: () => `
        <header class="sticky top-0 z-50 glass-header px-6 py-4 flex items-center justify-between font-display relative">
            <h1 class="text-xl font-bold tracking-tight text-slate-100">Configuración</h1>
            <button onclick="renderView('dashboard')" class="size-10 rounded-full glass hover:bg-white/10 transition-all flex items-center justify-center text-slate-400">
                <span class="material-symbols-outlined text-xl">close</span>
            </button>
        </header>
        <main class="px-6 py-6 space-y-8 pb-32 max-w-md mx-auto font-display">
            <section class="flex flex-col items-center gap-4 py-8 glass rounded-[40px] border-white/5 relative overflow-hidden">
                <div class="absolute inset-0 bg-primary/5 blur-3xl rounded-full"></div>
                <div class="size-24 rounded-full border-2 border-primary p-1 relative z-10">
                    <div class="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-4xl font-bold text-primary">${AppState.user.name.substring(0, 1)}</div>
                </div>
                <div class="text-center relative z-10">
                    <h2 class="text-xl font-bold">${AppState.user.name}</h2>
                    <p class="text-slate-400 text-sm">${AppState.user.email || 'Usuario de Contamela'}</p>
                </div>
            </section>

            <section class="space-y-3">
                <h3 class="text-xs font-bold uppercase tracking-widest text-primary px-1">Preferencias</h3>
                <div class="glass rounded-3xl overflow-hidden divide-y divide-white/5">
                    <div id="toggle-pref-currency" class="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors">
                        <div class="flex items-center gap-4"><span class="material-symbols-outlined text-primary">payments</span><p class="font-bold">Moneda (${AppState.preferences.displayCurrency})</p></div>
                        <span class="material-symbols-outlined opacity-30">chevron_right</span>
                    </div>
                    <div id="clear-data" class="flex items-center justify-between p-5 text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer">
                        <div class="flex items-center gap-4"><span class="material-symbols-outlined">delete_forever</span><p class="font-bold">Borrar todos los datos</p></div>
                    </div>
                    <div id="logout-btn" class="flex items-center justify-between p-5 text-slate-400 hover:bg-white/5 transition-colors cursor-pointer">
                        <div class="flex items-center gap-4"><span class="material-symbols-outlined">logout</span><p class="font-bold">Cerrar Sesión</p></div>
                    </div>
                </div>
            </section>
        </main>
    `,

    plan: () => `
        <header class="sticky top-0 z-50 glass-header px-6 py-4 flex items-center justify-between font-display">
            <h1 class="text-xl font-bold tracking-tight text-slate-100 uppercase">Planificación</h1>
        </header>
        <main class="px-6 py-6 space-y-8 pb-32 max-w-md mx-auto font-display">
            <section class="space-y-3">
                <div class="flex justify-between items-center px-1">
                    <h3 class="text-xs font-bold uppercase tracking-widest text-primary">Gestión de Presupuestos</h3>
                    <button id="add-budget-btn" class="text-xs font-black text-primary uppercase">+ Nuevo</button>
                </div>
                <div class="glass rounded-3xl overflow-hidden divide-y divide-white/5">
                    ${AppState.budgets.length === 0 ? `
                        <div class="p-5 text-center text-slate-500 text-[10px] font-bold uppercase">No has definido presupuestos</div>
                    ` : AppState.budgets.map(b => `
                        <div class="flex items-center justify-between p-5">
                            <div>
                                <p class="font-bold">${b.category}</p>
                                <p class="text-[10px] text-slate-500">${b.limit} ${b.currency}</p>
                            </div>
                            <button onclick="removeBudget('${b.category}')" class="text-rose-500"><span class="material-symbols-outlined text-lg">delete</span></button>
                        </div>
                    `).join('')}
                </div>
            </section>

            <section class="space-y-3">
                <div class="flex justify-between items-center px-1">
                    <h3 class="text-xs font-bold uppercase tracking-widest text-primary">Metas de Ahorro</h3>
                    <button id="add-goal-btn" class="text-xs font-black text-primary uppercase">+ Nueva</button>
                </div>
                <div class="glass rounded-3xl overflow-hidden divide-y divide-white/5">
                    ${AppState.goals.length === 0 ? `
                        <div class="p-5 text-center text-slate-500 text-[10px] font-bold uppercase">No has definido metas</div>
                    ` : AppState.goals.map(g => `
                        <div class="flex items-center justify-between p-5">
                            <div>
                                <p class="font-bold">${g.name}</p>
                                <p class="text-[10px] text-slate-500">${g.current} / ${g.target} ${g.currency}</p>
                            </div>
                            <button onclick="removeGoal('${g.name}')" class="text-rose-500"><span class="material-symbols-outlined text-lg">delete</span></button>
                        </div>
                    `).join('')}
                </div>
            </section>

            <section class="space-y-3">
                <div class="flex justify-between items-center px-1">
                    <h3 class="text-xs font-bold uppercase tracking-widest text-primary">Suscripciones</h3>
                    <button id="add-recurring-btn" class="text-xs font-black text-primary uppercase">+ Nueva</button>
                </div>
                <div class="glass rounded-3xl overflow-hidden divide-y divide-white/5">
                    ${AppState.recurring.length === 0 ? `
                        <div class="p-5 text-center text-slate-500 text-[10px] font-bold uppercase">No has definido suscripciones</div>
                    ` : AppState.recurring.map(r => `
                        <div class="flex items-center justify-between p-5">
                            <div>
                                <p class="font-bold">${r.name}</p>
                                <p class="text-[10px] text-slate-500">${r.type === 'expense' ? 'Gasto' : 'Ingreso'} - Día ${r.day}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-bold">${formatCurrency(r.amount, r.currency)}</p>
                                <button onclick="removeRecurring('${r.name}')" class="text-rose-500"><span class="material-symbols-outlined text-sm">delete</span></button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
        </main>
    `,

    chat: () => `
        <div class="fixed inset-0 bg-background-dark z-[200] flex flex-col max-w-md mx-auto overflow-hidden">
            <header class="h-16 shrink-0 flex items-center justify-between px-6 bg-background-dark border-b border-white/5 z-30 shadow-xl">
                <div class="flex items-center gap-3">
                    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-lg shadow-primary/10">
                        <span class="material-symbols-outlined font-black">bolt</span>
                    </div>
                    <div>
                        <h1 class="text-[10px] font-black text-primary uppercase tracking-[0.2em] leading-none mb-1">Asistente AI</h1>
                        <p class="text-sm font-bold text-slate-100 leading-none">Contamelapp</p>
                    </div>
                </div>
                <button id="close-chat" class="size-10 rounded-full glass flex items-center justify-center text-slate-400 active:scale-90 transition-all">
                    <span class="material-symbols-outlined text-xl">close</span>
                </button>
            </header>
            
            <main id="chat-scroller" class="flex-1 overflow-y-auto px-4 py-6 space-y-6 no-scrollbar scroll-smooth">
                ${AppState.chatHistory.map(msg => `
                    <div class="flex ${msg.role === 'ai' ? 'items-start' : 'items-start justify-end ml-auto'} gap-3 max-w-[90%] animate-in fade-in slide-in-from-bottom-2">
                        ${msg.role === 'ai' ? `
                            <div class="h-8 w-8 shrink-0 rounded-lg bg-emerald-500/10 border border-primary/20 flex items-center justify-center">
                                <span class="material-symbols-outlined text-primary text-xl">smart_toy</span>
                            </div>
                        ` : ''}
                        <div class="flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : ''}">
                            <div class="${msg.role === 'ai' ? 'glass text-slate-100 rounded-2xl rounded-tl-none' : 'bg-primary text-background-dark font-bold rounded-2xl rounded-tr-none shadow-lg shadow-primary/10'} px-5 py-3.5 text-sm leading-relaxed">
                                ${msg.text}
                            </div>
                            <p class="text-[8px] font-bold text-slate-600 uppercase tracking-widest px-1">${msg.role === 'ai' ? 'Contamelapp' : 'Tú'}</p>
                        </div>
                    </div>
                `).join('')}
                <div class="h-32"></div> <!-- Spacer for footer -->
            </main>

            <div class="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background-dark via-background-dark/95 to-transparent pt-12 z-40 max-w-md mx-auto">
                <div class="flex gap-2 overflow-x-auto no-scrollbar mb-4">
                    <button class="chat-chip whitespace-nowrap px-4 py-2 glass rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-white/5">Gasté 500 en café</button>
                    <button class="chat-chip whitespace-nowrap px-4 py-2 glass rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-white/5">Cobré u$s 100</button>
                    <button class="chat-chip whitespace-nowrap px-4 py-2 glass rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-white/5">Le debo 300 a Gigli</button>
                </div>
                <div class="flex gap-2 glass p-1.5 rounded-3xl border border-white/10 shadow-2xl">
                    <input id="chat-input" type="text" placeholder="¿Qué registramos hoy?" class="flex-1 bg-transparent border-none rounded-2xl px-4 text-slate-100 placeholder:text-slate-600 outline-none h-12">
                    <button id="send-chat" class="size-12 bg-primary text-background-dark rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all">
                        <span class="material-symbols-outlined font-black">send</span>
                    </button>
                </div>
            </div>
        </div>
    `,

    profileForm: () => `
        <div class="space-y-4">
            <div class="flex justify-center mb-6">
                <div class="avatar-upload size-28 rounded-full bg-navy-muted border-2 border-primary/40 overflow-hidden flex items-center justify-center relative shadow-2xl">
                    <img id="f-profile-preview" src="${AppState.user.photo || ''}" class="${AppState.user.photo ? '' : 'hidden'} size-full object-cover">
                    <span id="f-profile-icon" class="material-symbols-outlined text-5xl text-slate-700 ${AppState.user.photo ? 'hidden' : ''}">account_circle</span>
                    <input type="file" id="f-profile-photo" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*">
                    <div class="upload-overlay absolute inset-0 flex flex-col items-center justify-center text-white p-2 pointer-events-none">
                        <span class="material-symbols-outlined mb-1">photo_camera</span>
                        <span class="text-[8px] font-bold uppercase">Cambiar</span>
                    </div>
                </div>
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase ml-1">Tu Nombre</label>
                <input id="f-profile-name" type="text" value="${AppState.user.name}" class="w-full p-4 rounded-2xl">
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-primary uppercase ml-1">Email</label>
                <input id="f-profile-email" type="email" value="${AppState.user.email || ''}" placeholder="ejemplo@correo.com" class="w-full p-4 rounded-2xl">
            </div>
        </div>
    `,
};

// --- View Controller ---
async function initApp() {
    loadState();
    await syncRates();
    processRecurring(); 
    processInstallments();
    if (!AppState.auth.isLoggedIn) {
        renderAuth();
    } else {
        renderView('dashboard');
    }
    attachNavListeners();
}

function renderAuth() {
    const app = document.getElementById('app');
    app.innerHTML = ViewTemplates.auth();
    
    const passInput = document.getElementById('auth-pass');
    const toggleBtn = document.getElementById('toggle-pass');
    
    if (toggleBtn && passInput) {
        toggleBtn.onclick = () => {
            const icon = toggleBtn.querySelector('.material-symbols-outlined');
            if (passInput.type === 'password') {
                passInput.type = 'text';
                icon.innerText = 'visibility';
            } else {
                passInput.type = 'password';
                icon.innerText = 'visibility_off';
            }
        };
    }
    
    document.getElementById('auth-btn').onclick = () => {
        const user = document.getElementById('auth-user').value.trim();
        const pass = document.getElementById('auth-pass').value.trim();
        
        if (!user || !pass) {
            alert("Completa todos los campos");
            return;
        }

        if (!AppState.user.registered) {
            // First time - Register
            AppState.auth.username = user;
            AppState.auth.password = pass; 
            AppState.auth.isLoggedIn = true;
            AppState.user.name = user;
            AppState.user.registered = true;
            AppState.user.currency = 'ARS';
            saveState();
            location.reload();
        } else {
            // Login
            if (user === AppState.auth.username && pass === AppState.auth.password) {
                AppState.auth.isLoggedIn = true;
                saveState();
                location.reload();
            } else {
                alert("Usuario o contraseña incorrectos");
            }
        }
    };
}

function attachNavListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            
            // Update UI Active State
            document.querySelectorAll('.nav-item').forEach(i => {
                i.classList.remove('text-primary');
                i.classList.add('text-slate-400');
                const icon = i.querySelector('.material-symbols-outlined');
                if (icon) icon.style.fontVariationSettings = "'FILL' 0";
            });
            item.classList.remove('text-slate-400');
            item.classList.add('text-primary');
            const icon = item.querySelector('.material-symbols-outlined');
            if (icon) icon.style.fontVariationSettings = "'FILL' 1";

            renderView(view);
        });
    });

    const trigger = document.getElementById('chat-trigger');
    const modal = document.getElementById('chat-modal');
    const backdrop = document.getElementById('chat-backdrop');
    const panel = document.getElementById('chat-panel');

    trigger.onclick = () => {
        modal.classList.remove('hidden');
        panel.innerHTML = ViewTemplates.chat();
        attachChatListeners();
        setTimeout(() => panel.classList.remove('translate-y-full'), 10);
        const scroller = document.getElementById('chat-scroller');
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
    };

    backdrop.onclick = closeChat;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChat(); });
}

function closeChat() {
    const modal = document.getElementById('chat-modal');
    const panel = document.getElementById('chat-panel');
    if (!panel) return;
    
    panel.classList.add('translate-y-full');
    setTimeout(() => {
        if (modal) modal.classList.add('hidden');
    }, 300);
}

function attachChatListeners() {
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('send-chat');
    const close = document.getElementById('close-chat');

    const handleSend = () => {
        const text = input.value.trim();
        if (text) {
            AppState.chatHistory.push({ role: 'user', text: text });
            input.value = '';
            document.getElementById('chat-panel').innerHTML = ViewTemplates.chat();
            attachChatListeners();
            processCommand(text);
            const scroller = document.getElementById('chat-scroller');
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        }
    };

    if (btn) btn.onclick = handleSend;
    if (input) input.onkeydown = (e) => { if (e.key === 'Enter') handleSend(); };
    if (close) close.onclick = closeChat;

    document.querySelectorAll('.chat-chip').forEach(chip => {
        chip.onclick = () => {
            input.value = chip.innerText;
            input.focus();
        };
    });
}

function processCommand(text) {
    const lower = text.toLowerCase();
    let reply = "No pude procesar eso. Prueba con: 'Gasté 500,50 en comida' o 'Cobré u$s 100'.";

    // 1. Handle Pending Actions (Interactive Flow)
    if (AppState.pendingAction) {
        const action = AppState.pendingAction;
        if (lower.includes('cancela') || lower.includes('olvidalo')) {
            AppState.pendingAction = null;
            reply = "Vale, cancelé la operación anterior. ¿En qué más puedo ayudarte?";
        } else if (action.type === 'installment_card') {
            // Try to find the card name in the text
            const cardMatch = fuzzyMatch(text, AppState.cards, 'name');
            foundCard = cardMatch ? cardMatch.item : null;
            
            if (foundCard) {
                const data = action.data;
                AppState.installments.push({
                    id: Date.now(),
                    name: data.itemName,
                    count: data.count,
                    remaining: data.count,
                    amount: data.amountVal,
                    currency: data.currency,
                    cardId: foundCard.id,
                    date: new Date().toISOString()
                });
                // Deduct first installment from card balance
                if (!foundCard.balances) foundCard.balances = { ARS: 0, USD: 0 };
                foundCard.balances[data.currency] -= data.amountVal;
                
                AppState.pendingAction = null;
                saveState();
                reply = `✅ ¡Listo! Asigné las cuotas de "${data.itemName}" a tu tarjeta ${foundCard.name}.`;
                renderView('dashboard');
            } else {
                reply = `No encontré esa tarjeta. ¿A cuál la asigno? (O decime 'cancelar')`;
            }
        }
        
        if (AppState.pendingAction !== action) { // If action resolved/cancelled
             setTimeout(() => {
                AppState.chatHistory.push({ role: 'ai', text: reply });
                const panel = document.getElementById('chat-panel');
                if (panel && !panel.classList.contains('translate-y-full')) {
                    panel.innerHTML = ViewTemplates.chat();
                    attachChatListeners();
                    const scroller = document.getElementById('chat-scroller');
                    if (scroller) scroller.scrollTop = scroller.scrollHeight;
                }
            }, 800);
            return;
        }
    }

    // 0. Detect installments (Cuotas) - Heuristic Approach
    if (text.toLowerCase().includes('cuota')) {
        let count = 0, amountVal = 0, currency = 'ARS', itemName = '', targetCard = null;

        // A. Find Count: A number followed or preceded by "cuota/s"
        const countMatch = text.match(/(\d+)\s*cuotas?/i) || text.match(/cuotas?\s*(?:de\s+)?(\d+)/i);
        if (countMatch) count = parseInt(countMatch[1] || countMatch[2] || 0);

        // B. Find Amount
        const allNumbers = text.match(/\d+[\d\.]*(?:,\d+)?/g);
        let rawAmountStr = '';
        if (allNumbers) {
            allNumbers.forEach(n => {
                const val = parseFloat(n.replace(/\./g, '').replace(',', '.'));
                if (val !== count && val > 0) {
                    amountVal = val;
                    rawAmountStr = n;
                }
            });
            if (amountVal === 0 && allNumbers.length === 1 && parseInt(allNumbers[0]) !== count) {
                amountVal = parseFloat(allNumbers[0].replace(/\./g, '').replace(',', '.'));
                rawAmountStr = allNumbers[0];
            }
        }

        if (count > 0 && amountVal > 0) {
            // C. Find Currency
            if (lower.includes('usd') || lower.includes('u$s') || lower.includes('dolar')) currency = 'USD';

            // D. Find Card (FUZZY + Type filter)
            let cardTypeFilter = null;
            if (lower.includes('credito')) cardTypeFilter = 'credit';
            if (lower.includes('debito')) cardTypeFilter = 'debit';

            const filteredCards = cardTypeFilter ? AppState.cards.filter(c => c.cardType === cardTypeFilter) : AppState.cards;
            const cardMatch = fuzzyMatch(text, filteredCards, 'name');
            let explicitCard = cardMatch ? cardMatch.item : null;

            // E. Extract Item Name
            const cardSegment = cardMatch ? cardMatch.segment : '';
            itemName = text
                .replace(countMatch[0], '')
                .replace(rawAmountStr, '') 
                .replace(/(credito|debito|cuotas?|de\s+\d+|en\s+\d+)/gi, '') // Remove keywords
                .replace(/(compr[eó]|pagu[eé]|pago|compra|una?|el|la|de|en|con|tarjeta|ars|usd|u\$s)\s+/gi, ' ')
                .replace(/(?:ars|usd|u\$s)$/i, '');
            
            if (cardSegment) {
                itemName = itemName.replace(cardSegment, '');
            }

            itemName = itemName.replace(/\s+/g, ' ').trim();
            
            if (itemName.length < 2) itemName = 'Compra en cuotas';
            itemName = itemName.charAt(0).toUpperCase() + itemName.slice(1);

            if (!explicitCard && AppState.cards.length > 0) {
                // ASK THE USER
                AppState.pendingAction = {
                    type: 'installment_card',
                    data: { count, amountVal, currency, itemName }
                };
                reply = `Entendido, registré ${count} cuotas de ${formatCurrency(amountVal, currency)} para "${itemName}". \n\n¿A qué tarjeta lo asigno?`;
            } else {
                targetCard = explicitCard || (AppState.cards.length > 0 ? AppState.cards[0] : null);
                AppState.installments.push({
                    id: Date.now(),
                    name: itemName,
                    count: count,
                    remaining: count,
                    amount: amountVal,
                    currency: currency,
                    cardId: targetCard ? targetCard.id : null,
                    date: new Date().toISOString()
                });

                // Create the FIRST movement for the first installment
                const newMovement = {
                    id: Date.now() + 1,
                    text: `${itemName} (Cuota 1/${count})`,
                    amount: amountVal,
                    currency: currency,
                    type: 'expense',
                    category: 'Cuotas',
                    date: new Date().toISOString(),
                    icon: 'calendar_month',
                    cardId: targetCard ? targetCard.id : null,
                    isInstallment: true
                };
                AppState.movements.unshift(newMovement);

                // Deduct first installment from card if assigned
                if (targetCard) {
                    if (!targetCard.balances) targetCard.balances = { ARS: 0, USD: 0 };
                    targetCard.balances[currency] -= amountVal;
                }
                const isFuzzy = cardMatch && !cardMatch.exact;
                reply = `✅ ¡Perfecto! Registré ${count} cuotas para "${itemName}"${targetCard ? ` en la tarjeta ${targetCard.name}` : ''}. He cargado la primera cuota de ${formatCurrency(amountVal, currency)} como gasto de este mes.`;
            }

            saveState();
            setTimeout(() => {
                AppState.chatHistory.push({ role: 'ai', text: reply });
                renderView('dashboard');
                // Force chat refresh
                const chatPanel = document.getElementById('chat-panel');
                if (chatPanel && !chatPanel.classList.contains('translate-y-full')) {
                    chatPanel.innerHTML = ViewTemplates.chat();
                    attachChatListeners();
                    const scroller = document.getElementById('chat-scroller');
                    if (scroller) scroller.scrollTop = scroller.scrollHeight;
                }
            }, 800);
            return;
        }
    }

    // Recognize numbers with , as decimal and . as thousands
    // Example: "300.000,50" -> we need to remove . and replace , with . for parseFloat
    const rawMatch = text.match(/\d+[\d\.]*(?:,\d+)?/);
    let amount = 0;
    if (rawMatch) {
        let clean = rawMatch[0].replace(/\./g, '').replace(',', '.');
        amount = parseFloat(clean);
    }
    
    reply = "No pude procesar eso. Prueba con: 'Gasté 500,50 en comida' o 'Cobré u$s 100'.";
    
    if (amount > 0) {
        const lower = text.toLowerCase();
        let type = 'expense';
        let category = 'General';
        let icon = 'shopping_cart';
        let currency = 'ARS';

        if (lower.includes('u$s') || lower.includes('usd') || lower.includes('dolar') || lower.includes('dólar')) {
            currency = 'USD';
        }

        const incomeVerbs = ['cobré', 'gano', 'recibí', 'ingreso', 'sueldo', 'pago de', 'depósito', 'regalo', 'premio', 'encontré', 'ventas', 'comisión', 'me dio', 'me pagó', 'me prestó'];
        const expenseVerbs = ['gasté', 'pagué', 'compré', 'saqué', 'perdí', 'fui a', 'almuerzo', 'cena', 'uber', 'nafta', 'peaje', 'supermercado', 'farmacia', 'delivery', 'le di', 'le pagué', 'le presté'];
        const debtVerbs = ['presté', 'debe', 'prestamo', 'le di', 'debo', 'deuda', 'le pasé'];
        const goalVerbs = ['ahorré', 'guardé', 'metí', 'para mi', 'hacia mi meta', 'objetivo'];
        
        let targetCard = null;
        let targetContact = null;

        let cardTypeFilter = null;
        if (lower.includes('credito')) cardTypeFilter = 'credit';
        if (lower.includes('debito')) cardTypeFilter = 'debit';

        const filteredCards = cardTypeFilter ? AppState.cards.filter(c => c.cardType === cardTypeFilter) : AppState.cards;
        const cardMatch = fuzzyMatch(text, filteredCards, 'name');
        const contactMatch = fuzzyMatch(text, AppState.contacts, 'name');
        
        targetCard = cardMatch ? cardMatch.item : null;
        targetContact = contactMatch ? contactMatch.item : null;

        // Logic split: Meta vs Contact vs General
        if (goalVerbs.some(v => lower.includes(v))) {
            const foundGoal = AppState.goals.find(g => lower.includes(g.name.toLowerCase()));
            if (foundGoal) {
                foundGoal.current += convert(amount, currency, foundGoal.currency);
                type = 'expense';
                category = 'Ahorro';
                icon = 'savings';
                reply = `🚀 ¡Excelente ${AppState.user.name}! Sumaste ${formatCurrency(amount, currency)} a tu meta '${foundGoal.name}'.`;
            }
        } else if (incomeVerbs.some(v => lower.includes(v))) {
            type = 'income';
            icon = 'payments';
            category = 'Ingreso';
        } else {
            type = 'expense';
            icon = 'shopping_cart';
            category = 'Varios';
        }

        // Special Debt logic if "debo" is explicit
        if (lower.includes('debo') || lower.includes('deuda')) {
            category = 'Deudas';
            icon = 'group';
        }

        // Unified Contact Accounting
        if (targetContact) {
            let delta = 0;
            const givingMoneyVerbs = ['le di', 'pagué', 'presté', 'le pagué', 'le presté', 'le pasé'];
            const receivingMoneyVerbs = ['me dio', 'me pagó', 'me prestó', 'recibí', 'cobré'];

            if (lower.includes('debo') || lower.includes('deuda')) {
                delta = -amount;
            } else if (givingMoneyVerbs.some(v => lower.includes(v)) || type === 'expense') {
                delta = amount;
            } else if (receivingMoneyVerbs.some(v => lower.includes(v)) || type === 'income') {
                delta = -amount;
            }

            if (!targetContact.balances) targetContact.balances = { ARS: 0, USD: 0 };
            targetContact.balances[currency] += delta;
            
            if (!targetContact.history) targetContact.history = [];
            targetContact.history.unshift({ date: new Date().toISOString(), amount, type, currency, note: text });

            const currentBalance = targetContact.balances[currency];
            const status = currentBalance > 0 ? 'te debe' : (currentBalance < 0 ? 'le debes' : 'está al día con');
            reply = `📝 ¡Entendido! Registré el movimiento con ${targetContact.name}. Ahora ${status} ${formatCurrency(Math.abs(currentBalance), currency)}${currency === 'USD' ? ' y también tiene saldo en ARS' : ''}.`;
        }

        // Card update
        if (targetCard) {
            if (!targetCard.balances) targetCard.balances = { ARS: 0, USD: 0 };
            targetCard.balances[currency] += (type === 'income' ? amount : -amount);
            const isFuzzy = cardMatch && !cardMatch.exact;
            reply += ` (En ${targetCard.name})${isFuzzy ? ` *(Detecté "${cardMatch.segment}")*` : ''}`;
        } else if (type === 'expense') {
            // Default deduction from first available "Efectivo" or any card if no card specified
            // to ensure Net Worth stays consistent
            const efectivo = AppState.cards.find(c => c.name.includes('EFECTIVO')) || AppState.cards[0];
            if (efectivo) {
                if (!efectivo.balances) efectivo.balances = { ARS: 0, USD: 0 };
                efectivo.balances[currency] -= amount;
                reply += ` (Descontado de ${efectivo.name})`;
            }
        }

        if (targetContact) {
            const isFuzzy = contactMatch && !contactMatch.exact;
            if (isFuzzy) reply += ` *(Identifiqué a "${contactMatch.segment}" como ${targetContact.name})*`;
        }

        const newMovement = {
            id: Date.now(),
            text: text.length > 25 ? text.substring(0, 25) + '...' : text,
            amount: amount,
            currency: currency,
            type: type,
            category: category,
            date: 'Hoy',
            icon: icon,
            cardId: targetCard ? targetCard.id : null
        };
        
        AppState.movements.unshift(newMovement);
        
        let budgetAdvice = "";
        if (type === 'expense') {
            budgetAdvice = "\n" + checkBudget(category, amount, currency);
        }

        reply = `✅ ¡Entendido ${AppState.user.name}! Registré tu ${type === 'expense' ? 'gasto' : 'ingreso'} de ${formatCurrency(amount, currency)}.${budgetAdvice}`;
        saveState();
    }

    setTimeout(() => {
        AppState.chatHistory.push({ role: 'ai', text: reply });
        const panel = document.getElementById('chat-panel');
        if (panel && !panel.classList.contains('translate-y-full')) {
            panel.innerHTML = ViewTemplates.chat();
            attachChatListeners();
            const scroller = document.getElementById('chat-scroller');
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        }
    }, 800);
}

function showModal(title, content, actionId, actionText, onConfirm) {
    const overlay = document.createElement('div');
    overlay.innerHTML = ViewTemplates.modal(title, content, actionId, actionText);
    document.body.appendChild(overlay.firstElementChild);

    const close = () => document.getElementById('modal-container').remove();
    document.getElementById('close-modal').onclick = close;
    document.getElementById('cancel-modal').onclick = close;
    document.getElementById(actionId).onclick = () => {
        onConfirm();
        close();
    };
}

function handlePhotoUpload(inputId, previewId, iconId, onComplete) {
    const input = document.getElementById(inputId);
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
                const base64 = re.target.result;
                document.getElementById(previewId).src = base64;
                document.getElementById(previewId).classList.remove('hidden');
                document.getElementById(iconId).classList.add('hidden');
                onComplete(base64);
            };
            reader.readAsDataURL(file);
        }
    };
}

function renderView(view) {
    AppState.currentView = view;
    const main = document.getElementById('main-content');
    
    // Smooth transition
    main.classList.remove('view-transition');
    void main.offsetWidth; // Trigger reflow
    main.classList.add('view-transition');
    
    main.innerHTML = ViewTemplates[view]();

    if (view === 'analytics') {
        renderAnalyticsCharts();
        const toggleExp = document.getElementById('toggle-exp-cur');
        if (toggleExp) toggleExp.onclick = () => {
            AppState.preferences.analyticsCurrency = AppState.preferences.analyticsCurrency === 'ARS' ? 'USD' : 'ARS';
            saveState();
            renderView('analytics');
        };
        const toggleInc = document.getElementById('toggle-inc-cur');
        if (toggleInc) toggleInc.onclick = () => {
            AppState.preferences.analyticsCurrency = AppState.preferences.analyticsCurrency === 'ARS' ? 'USD' : 'ARS';
            saveState();
            renderView('analytics');
        };
    }
    if (view === 'dashboard') {
        renderChart();
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.onclick = () => renderView('settings');
        }
        const analyticsBtn = document.getElementById('analytics-btn');
        if (analyticsBtn) analyticsBtn.onclick = () => renderView('analytics');

        const viewAllBtn = document.getElementById('view-all-activity');
        if (viewAllBtn) viewAllBtn.onclick = () => renderView('history');

        const netWorthBtn = document.getElementById('net-worth-toggle');
        if (netWorthBtn) netWorthBtn.onclick = toggleDisplayCurrency;
    }
    
    if (view === 'plan') {
        const addBudgetBtn = document.getElementById('add-budget-btn');
        if (addBudgetBtn) {
            addBudgetBtn.onclick = () => {
                showModal("Nuevo Presupuesto", ViewTemplates.budgetForm(), "save-budget", "Establecer Límite", () => {
                    const cat = document.getElementById('f-budget-cat').value;
                    const limit = parseLocaleFloat(document.getElementById('f-budget-limit').value);
                    const currency = document.getElementById('f-budget-currency').value;
                    if (cat && !isNaN(limit)) {
                        AppState.budgets.push({ category: cat, limit, currency });
                        saveState();
                        renderView('plan');
                    }
                });
            };
        }

        const addGoalBtn = document.getElementById('add-goal-btn');
        if (addGoalBtn) {
            addGoalBtn.onclick = () => {
                showModal("Nueva Meta de Ahorro", ViewTemplates.goalForm(), "save-goal", "Crear Meta", () => {
                    const name = document.getElementById('f-goal-name').value;
                    const target = parseLocaleFloat(document.getElementById('f-goal-target').value);
                    const currency = document.getElementById('f-goal-currency').value;
                    if (name && !isNaN(target)) {
                        AppState.goals.push({ name, target, current: 0, currency });
                        saveState();
                        renderView('plan');
                    }
                });
            };
        }

        const addRecurringBtn = document.getElementById('add-recurring-btn');
        if (addRecurringBtn) {
            addRecurringBtn.onclick = () => {
                showModal("Nueva Suscripción", ViewTemplates.recurringForm(), "save-rec", "Guardar", () => {
                    const name = document.getElementById('f-rec-name').value;
                    const amount = parseLocaleFloat(document.getElementById('f-rec-amount').value);
                    const day = parseInt(document.getElementById('f-rec-day').value);
                    const currency = document.getElementById('f-rec-currency').value;
                    const type = document.getElementById('f-rec-type').value;
                    const cardId = document.getElementById('f-rec-card').value;
                    
                    if (name && !isNaN(amount) && day > 0 && day <= 31) {
                        AppState.recurring.push({ name, amount, currency, category: 'Suscripción', day, type, cardId });
                        processRecurring();
                        saveState();
                        renderView('plan');
                    }
                });
            };
        }
    }
    
    // Setup View Specific Listeners
    if (view === 'vault') {
        const addBtn = document.getElementById('add-card-btn');
        if (addBtn) addBtn.onclick = () => {
            showModal("Nueva Tarjeta", ViewTemplates.cardForm(), "save-card", "Crear Tarjeta", () => {
                const name = document.getElementById('f-card-name').value;
                const balARS = parseLocaleFloat(document.getElementById('f-card-balance-ars').value);
                const balUSD = parseLocaleFloat(document.getElementById('f-card-balance-usd').value);
                const last4 = document.getElementById('f-card-last4').value;
                const type = document.getElementById('f-card-type').value;
                const colorId = document.getElementById('f-card-color').value;
                const gradient = CARD_GRADIENTS.find(g => g.id === colorId)?.class || CARD_GRADIENTS[0].class;
                
                if (name) {
                    AppState.cards.push({
                        id: Date.now(),
                        name: name.toUpperCase(),
                        balances: { ARS: balARS, USD: balUSD },
                        last4: last4 || '0000',
                        cardType: type,
                        colorId: colorId,
                        type: type === 'debit' ? 'visa' : 'mastercard', 
                        gradient: gradient
                    });
                    saveState();
                    renderView('vault');
                }
            });
        };
    }

    if (view === 'social' || view === 'social_ledger') {
        const addBtn = document.getElementById('add-contact-btn');
        if (addBtn) {
            addBtn.onclick = () => {
                let photoBase64 = null;
                showModal("Nuevo Contacto", ViewTemplates.contactForm(), "save-contact", "Guardar Contacto", () => {
                    const name = document.getElementById('f-contact-name').value;
                    if (name) {
                        AppState.contacts.push({ 
                            id: Date.now(), 
                            name, 
                            balances: { ARS: 0, USD: 0 },
                            photo: photoBase64,
                            history: [],
                            date: 'Hoy'
                        });
                        saveState();
                        renderView(view);
                    }
                });
                handlePhotoUpload('f-contact-photo', 'f-contact-preview', 'f-contact-icon', (b64) => photoBase64 = b64);
            };
        }
    }

    if (view === 'settings') {
        const editProfileBtn = document.querySelector('section.flex.flex-col.items-center.gap-4');
        if (editProfileBtn) {
            editProfileBtn.style.cursor = 'pointer';
            editProfileBtn.onclick = () => {
                let photoB64 = AppState.user.photo;
                showModal("Editar Perfil", ViewTemplates.profileForm(), "save-profile", "Guardar Cambios", () => {
                    const newName = document.getElementById('f-profile-name').value;
                    const newEmail = document.getElementById('f-profile-email').value;
                    if (newName) {
                        AppState.user.name = newName;
                        AppState.user.email = newEmail;
                        AppState.user.photo = photoB64;
                        saveState();
                        renderView('settings');
                    }
                });
                handlePhotoUpload('f-profile-photo', 'f-profile-preview', 'f-profile-icon', (b64) => photoB64 = b64);
            };
        }

        const togglePrefBtn = document.getElementById('toggle-pref-currency');
        if (togglePrefBtn) {
            togglePrefBtn.onclick = () => {
                const modes = ['MIXED', 'ARS', 'USD'];
                const currentIndex = modes.indexOf(AppState.preferences.displayCurrency);
                AppState.preferences.displayCurrency = modes[(currentIndex + 1) % modes.length];
                saveState();
                renderView('settings');
            };
        }

        const clearDataBtn = document.getElementById('clear-data');
        if (clearDataBtn) {
            clearDataBtn.onclick = () => {
                if (confirm("¿Estás seguro de que quieres borrar TODOS tus datos? Esto no se puede deshacer.")) {
                    localStorage.clear();
                    location.reload();
                }
            };
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = () => {
                AppState.auth.isLoggedIn = false;
                saveState();
                location.reload();
            };
        }
    }
}

function renderChart() {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;

    if (window.myChart) window.myChart.destroy();

    const ctx = canvas.getContext('2d');
    const incomeData = AppState.movements.filter(m => m.type === 'income').slice(0, 6).map(m => m.amount).reverse();
    const expenseData = AppState.movements.filter(m => m.type === 'expense').slice(0, 6).map(m => m.amount).reverse();

    // Fill with zeros if less than 6 data points
    while (incomeData.length < 6) incomeData.unshift(0);
    while (expenseData.length < 6) expenseData.unshift(0);

    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['L', 'M', 'X', 'J', 'V', 'S'], // Simplified labels for weekly view
            datasets: [{
                label: 'Ingresos',
                data: incomeData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }, {
                label: 'Gastos',
                data: expenseData,
                borderColor: '#22d3ee',
                borderDash: [5, 5],
                fill: false,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: true, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } } },
                y: { display: false }
            }
        }
    });
}


function renderAnalyticsCharts() {
    const ctx = document.getElementById('analytics-trend-chart');
    if (!ctx) return;

    // Last 6 months gasto real
    const monthlyData = [];
    const labels = [];
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const monthStr = d.toLocaleDateString('es-AR', { month: 'short' }).charAt(0).toUpperCase() + d.toLocaleDateString('es-AR', { month: 'short' }).slice(1);
        labels.push(monthStr);
        
        const totalMonth = AppState.movements
            .filter(m => {
                const mDate = new Date(m.date === 'Hoy' ? new Date().toISOString() : m.date);
                return mDate.getMonth() === d.getMonth() && mDate.getFullYear() === d.getFullYear() && m.type === 'expense';
            })
            .reduce((acc, m) => acc + (m.currency === 'ARS' ? m.amount : m.amount * AppState.rates.USD_AVG), 0);
        
        monthlyData.push(totalMonth);
    }

    if (window.analyticsChart) window.analyticsChart.destroy();

    window.analyticsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: monthlyData,
                backgroundColor: '#10b981',
                borderRadius: 8,
                barThickness: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: true, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } } },
                y: { display: false }
            }
        }
    });
}

function removeBudget(category) {
    if (confirm("¿Eliminar presupuesto?")) {
        AppState.budgets = AppState.budgets.filter(b => b.category !== category);
        saveState();
        renderView('plan');
    }
}

function removeGoal(name) {
    if (confirm("¿Eliminar meta?")) {
        AppState.goals = AppState.goals.filter(g => g.name !== name);
        saveState();
        renderView('plan');
    }
}

function removeRecurring(name) {
    if (confirm(`¿Eliminar suscripción "${name}"? Esto también anulará el gasto de este mes si ya se debitó.`)) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // 1. Find and reverse card balance if it was debit this month
        // Match by text and category 'Suscripción'
        const moveToDelete = AppState.movements.find(m => 
            m.text === name && 
            m.category === 'Suscripción' &&
            new Date(m.date).getMonth() === currentMonth &&
            new Date(m.date).getFullYear() === currentYear
        );

        if (moveToDelete) {
            const r = AppState.recurring.find(rec => rec.name === name);
            if (r && r.cardId) {
                const card = AppState.cards.find(c => c.id == r.cardId);
                if (card) {
                    card.balances[r.currency] -= (r.type === 'income' ? r.amount : -r.amount);
                }
            }
            AppState.movements = AppState.movements.filter(m => m !== moveToDelete);
        }

        // 2. Remove the recurring template
        AppState.recurring = AppState.recurring.filter(r => r.name !== name);
        
        saveState();
        renderView('plan');
    }
}

function toggleDisplayCurrency() {
    const modes = ['ARS', 'USD', 'MIXED'];
    const currentIdx = modes.indexOf(AppState.preferences.displayCurrency || 'MIXED');
    AppState.preferences.displayCurrency = modes[(currentIdx + 1) % modes.length];
    saveState();
    renderView('dashboard');
}

function removeInstallment(id) {
    if (confirm("¿Eliminar este pago en cuotas?")) {
        AppState.installments = AppState.installments.filter(ins => ins.id !== id);
        saveState();
        renderView('dashboard');
    }
}

function removeCard(id) {
    if (confirm("¿Eliminar esta tarjeta? Se borrarán sus saldos y todos los gastos, cuotas y suscripciones asociados.")) {
        // Cleanup associated data
        AppState.installments = AppState.installments.filter(ins => ins.cardId != id);
        AppState.recurring = AppState.recurring.filter(r => r.cardId != id);
        AppState.movements = AppState.movements.filter(m => m.cardId != id);
        
        AppState.cards = AppState.cards.filter(c => c.id !== id);
        saveState();
        renderView('vault');
    }
}

function removeContact(id) {
    if (confirm("¿Eliminar contacto? El historial de deudas se mantendrá en registros globales.")) {
        AppState.contacts = AppState.contacts.filter(c => c.id !== id);
        saveState();
        renderView('social');
    }
}

function editContact(id) {
    const contact = AppState.contacts.find(c => c.id === id);
    if (!contact) return;

    let photoB64 = contact.photo;
    showModal("Editar Contacto", ViewTemplates.contactForm(), "update-contact", "Guardar Cambios", () => {
        const name = document.getElementById('f-contact-name').value;
        if (name) {
            contact.name = name;
            contact.photo = photoB64;
            saveState();
            renderView('social');
        }
    });

    // Populate
    document.getElementById('f-contact-name').value = contact.name;
    if (contact.photo) {
        document.getElementById('f-contact-preview').src = contact.photo;
        document.getElementById('f-contact-preview').classList.remove('hidden');
        document.getElementById('f-contact-icon').classList.add('hidden');
    }
    
    handlePhotoUpload('f-contact-photo', 'f-contact-preview', 'f-contact-icon', (b64) => photoB64 = b64);
}

function editCard(id) {
    const card = AppState.cards.find(c => c.id === id);
    if (!card) return;

    showModal("Editar Tarjeta", ViewTemplates.cardForm(), "update-card", "Guardar Cambios", () => {
        const name = document.getElementById('f-card-name').value;
        const balARS = parseLocaleFloat(document.getElementById('f-card-balance-ars').value);
        const balUSD = parseLocaleFloat(document.getElementById('f-card-balance-usd').value);
        const last4 = document.getElementById('f-card-last4').value;
        const type = document.getElementById('f-card-type').value;
        const colorId = document.getElementById('f-card-color').value;
        const gradient = CARD_GRADIENTS.find(g => g.id === colorId)?.class || CARD_GRADIENTS[0].class;
        
        if (name) {
            card.name = name.toUpperCase();
            card.balances = { ARS: balARS, USD: balUSD };
            card.last4 = last4 || '0000';
            card.cardType = type;
            card.colorId = colorId;
            card.gradient = gradient;
            saveState();
            renderView('vault');
        }
    });

    // Populate fields
    document.getElementById('f-card-name').value = card.name;
    document.getElementById('f-card-balance-ars').value = card.balances?.ARS || 0;
    document.getElementById('f-card-balance-usd').value = card.balances?.USD || 0;
    document.getElementById('f-card-last4').value = card.last4;
    document.getElementById('f-card-type').value = card.cardType || 'credit';
    selectCardColor(card.colorId || 'emerald');
}

function selectCardColor(id) {
    const input = document.getElementById('f-card-color');
    if (input) input.value = id;
    
    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.remove('border-white', 'scale-110');
        s.classList.add('border-transparent', 'scale-90');
        if (s.getAttribute('data-color-id') === id) {
            s.classList.add('border-white', 'scale-110');
            s.classList.remove('border-transparent', 'scale-90');
        }
    });
}

document.addEventListener('DOMContentLoaded', initApp);
