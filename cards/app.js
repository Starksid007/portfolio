// ============================================================
// 🔐 Card Vault v2 — Client-Side Encrypted Card Storage
// ============================================================
// - AES-256-GCM encryption with PBKDF2 key derivation
// - Cards stored in localStorage (encrypted)
// - Add / Delete / Export / Import cards from the UI
// ============================================================

const STORAGE_KEY = 'cardvault_cards';
const HOLDER_KEY = 'cardvault_holder';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

// ============================
// 🔐 CRYPTO
// ============================

async function deriveKey(pin, salt, usage) {
    const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, [usage]
    );
}

async function encryptData(jsonObj, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(pin, salt, "encrypt");
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(jsonObj))
    );
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
    return btoa(String.fromCharCode(...combined));
}

async function decryptData(encryptedBase64, pin) {
    const data = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const salt = data.slice(0, SALT_LENGTH);
    const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH);
    const key = await deriveKey(pin, salt, "decrypt");
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted));
}

// ============================
// 💾 STORAGE
// ============================

function loadCards() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveCards(cards) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

// ============================
// 🎨 UI
// ============================

const cardGrid = document.getElementById('cardGrid');
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const noResults = document.getElementById('noResults');
const pinModal = document.getElementById('pinModal');
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');
const unlockBtn = document.getElementById('unlockBtn');
const addCardBtn = document.getElementById('addCardBtn');
const addCardModal = document.getElementById('addCardModal');
const saveCardBtn = document.getElementById('saveCardBtn');
const addCardError = document.getElementById('addCardError');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const deleteModal = document.getElementById('deleteModal');
const deleteMsg = document.getElementById('deleteMsg');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

let cards = loadCards();
let sessionPin = null;
let revealedCards = new Set();
let decryptedCache = {};
let pendingRevealIndex = null;
let pendingDeleteIndex = null;
let editingIndex = null; // tracks which card is being edited
let activeTypeFilter = 'all'; // 'all', 'Credit Card', or 'Debit Card'

function escapeHtml(str) {
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

function formatCardNumber(num) {
    return num.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function renderCards(filter = '') {
    const q = filter.toLowerCase().trim();
    let count = 0;
    cardGrid.innerHTML = '';

    cards.forEach((card, i) => {
        if (q && !card.bankName.toLowerCase().includes(q) && !card.cardName.toLowerCase().includes(q)) return;
        if (activeTypeFilter !== 'all' && (card.cardType || 'Credit Card') !== activeTypeFilter) return;
        count++;
        const shown = revealedCards.has(i);
        const dec = decryptedCache[i];

        const el = document.createElement('div');
        el.className = 'credit-card';
        el.innerHTML = `
            <div class="card-top">
                <div>
                    <div class="bank-name">🏦 ${escapeHtml(card.bankName)}</div>
                    <div class="card-name">${card.cardType === 'Debit Card' ? '🏧' : '💳'} ${escapeHtml(card.cardName)} <span class="card-type-badge ${card.cardType === 'Debit Card' ? 'debit' : 'credit'}">${card.cardType || 'Credit Card'}</span></div>
                </div>
                <div class="card-top-icons">
                    <button class="card-edit-btn" data-action="edit" data-index="${i}" title="Edit card">✏️</button>
                    <button class="card-copy-all ${shown ? 'active' : ''}" data-action="copyall" data-index="${i}" title="Copy all details">📋</button>
                </div>
            </div>
            <div class="card-details">
                <div class="detail-row">
                    <span class="detail-label">Number</span>
                    <span class="detail-value card-number-display ${shown ? 'revealed' : ''}">${shown && dec ? formatCardNumber(dec.number) : '•••• •••• •••• ••••'}</span>
                    <button class="copy-btn ${shown ? 'visible' : ''}" data-copy="${shown && dec ? dec.number : ''}" title="Copy number">📋</button>
                </div>
                <div class="card-bottom-row">
                    <div class="detail-row">
                        <span class="detail-label">Expiry</span>
                        <span class="detail-value ${shown ? 'revealed' : ''}">${shown && dec ? dec.expiry : '••/••'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">CVV</span>
                        <span class="detail-value ${shown ? 'revealed' : ''}">${shown && dec ? dec.cvv : '•••'}</span>
                    </div>
                </div>
                ${card.holderName ? `<div class="holder-name">${escapeHtml(card.holderName)}</div>` : ''}
            </div>
            <div class="card-action-row">
                ${shown
                    ? `<button class="view-btn hide-btn" data-action="hide" data-index="${i}">🔒 Hide</button>`
                    : `<button class="view-btn" data-action="reveal" data-index="${i}">🔓 View Details</button>`}
                <button class="view-btn delete-btn" data-action="delete" data-index="${i}">🗑️ Delete</button>
            </div>`;
        cardGrid.appendChild(el);
    });

    noResults.style.display = count === 0 ? 'block' : 'none';
    const total = cards.length;
    const showing = count;
    const filtered = activeTypeFilter !== 'all' || q;
    document.getElementById('cardCount').innerHTML = filtered
        ? `<span class="card-count-num">${showing}</span> of ${total} card${total !== 1 ? 's' : ''}`
        : `<span class="card-count-num">${total}</span> card${total !== 1 ? 's' : ''}`;
}

// Delegate click events on card grid
cardGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) {
        // Check for copy button
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn && copyBtn.dataset.copy) {
            navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
                copyBtn.textContent = '✅'; showToast('📋 Copied!');
                setTimeout(() => copyBtn.textContent = '📋', 1200);
            });
        }
        return;
    }
    const idx = parseInt(btn.dataset.index);
    if (btn.dataset.action === 'reveal') requestReveal(idx);
    else if (btn.dataset.action === 'hide') hideCard(idx);
    else if (btn.dataset.action === 'delete') requestDelete(idx);
    else if (btn.dataset.action === 'copyall') copyAllDetails(idx, btn);
    else if (btn.dataset.action === 'edit') openEditCard(idx);
});

// ============================
// 🔓 PIN / REVEAL
// ============================

function requestReveal(i) {
    if (sessionPin) { revealCard(i, sessionPin); return; }
    pendingRevealIndex = i;
    showPinModal();
}

async function revealCard(i, pin) {
    try {
        decryptedCache[i] = await decryptData(cards[i].encryptedData, pin);
        revealedCards.add(i);
        sessionPin = pin;
        renderCards(searchInput.value);
    } catch {
        sessionPin = null;
        pinError.textContent = '❌ Incorrect PIN.';
        pinError.style.display = 'block';
        pinInput.value = ''; pinInput.focus();
    }
}

function hideCard(i) {
    revealedCards.delete(i); delete decryptedCache[i];
    renderCards(searchInput.value);
}

/**
 * Copy all card details in a formatted text block
 */
function copyAllDetails(i, btnEl) {
    const card = cards[i];
    const dec = decryptedCache[i];
    if (!dec) return;

    const lines = [
        `${card.bankName} : ${card.cardName}`,
        dec.number,
        dec.expiry,
        dec.cvv
    ];
    if (card.holderName) lines.push(card.holderName);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
        btnEl.textContent = '✅';
        showToast('📋 All details copied!');
        setTimeout(() => { btnEl.textContent = '📋'; }, 1500);
    });
}

function showPinModal() {
    pinModal.style.display = 'flex'; pinInput.value = ''; pinError.style.display = 'none';
    setTimeout(() => pinInput.focus(), 100);
}
function hidePinModal() {
    pinModal.style.display = 'none'; pendingRevealIndex = null;
}

unlockBtn.addEventListener('click', async () => {
    const pin = pinInput.value.trim();
    if (!pin) { pinError.textContent = '❌ Enter a PIN.'; pinError.style.display = 'block'; return; }
    pinError.style.display = 'none';
    try {
        const i = pendingRevealIndex;
        decryptedCache[i] = await decryptData(cards[i].encryptedData, pin);
        revealedCards.add(i); sessionPin = pin;
        hidePinModal(); renderCards(searchInput.value);
    } catch {
        sessionPin = null;
        pinError.textContent = '❌ Incorrect PIN. Try again.'; pinError.style.display = 'block';
        pinInput.value = ''; pinInput.focus();
    }
});
pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlockBtn.click(); });
document.querySelector('#pinModal .modal-close').addEventListener('click', hidePinModal);
pinModal.addEventListener('click', e => { if (e.target === pinModal) hidePinModal(); });

// ============================
// ➕ ADD CARD
// ============================

addCardBtn.addEventListener('click', () => {
    editingIndex = null;
    addCardModal.style.display = 'flex'; addCardError.style.display = 'none';
    document.querySelector('#addCardModal .modal-header h2').textContent = '➕ Add New Card';
    saveCardBtn.textContent = '🔐 Encrypt & Save';
    document.getElementById('newBankName').value = '';
    document.getElementById('newCardName').value = '';
    document.querySelector('input[name="cardType"][value="Credit Card"]').checked = true;
    // Pre-fill holder name from localStorage (persists across sessions)
    document.getElementById('newHolderName').value = localStorage.getItem(HOLDER_KEY) || '';
    document.getElementById('newCardNumber').value = '';
    document.getElementById('newExpiry').value = '';
    document.getElementById('newCvv').value = '';
    // Pre-fill PIN from current session only (not stored in localStorage)
    document.getElementById('newPin').value = sessionPin || '';
    setTimeout(() => document.getElementById('newBankName').focus(), 100);
});

// ✏️ EDIT CARD — opens the same modal pre-filled with card data
async function openEditCard(i) {
    const card = cards[i];
    let dec = decryptedCache[i];

    // If not already decrypted, need PIN first
    if (!dec) {
        if (!sessionPin) {
            showToast('🔓 Please view the card first to edit it.');
            return;
        }
        try {
            dec = await decryptData(card.encryptedData, sessionPin);
            decryptedCache[i] = dec;
        } catch {
            showToast('❌ Could not decrypt. View the card first.');
            return;
        }
    }

    editingIndex = i;
    addCardModal.style.display = 'flex'; addCardError.style.display = 'none';
    document.querySelector('#addCardModal .modal-header h2').textContent = '✏️ Edit Card';
    saveCardBtn.textContent = '💾 Update Card';

    document.getElementById('newBankName').value = card.bankName;
    document.getElementById('newCardName').value = card.cardName;
    const typeRadio = document.querySelector(`input[name="cardType"][value="${card.cardType || 'Credit Card'}"]`);
    if (typeRadio) typeRadio.checked = true;
    document.getElementById('newHolderName').value = card.holderName || '';
    document.getElementById('newCardNumber').value = formatCardNumber(dec.number);
    document.getElementById('newExpiry').value = dec.expiry;
    document.getElementById('newCvv').value = dec.cvv;
    document.getElementById('newPin').value = sessionPin || '';
    setTimeout(() => document.getElementById('newBankName').focus(), 100);
}

function hideAddCardModal() { addCardModal.style.display = 'none'; }
document.querySelector('#addCardModal .modal-close').addEventListener('click', hideAddCardModal);
addCardModal.addEventListener('click', e => { if (e.target === addCardModal) hideAddCardModal(); });

// Auto-format card number → auto-advance to expiry when 16 digits
document.getElementById('newCardNumber').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '').substring(0, 16);
    this.value = v.replace(/(.{4})/g, '$1 ').trim();
    if (v.length === 16) document.getElementById('newExpiry').focus();
});

// Auto-format expiry → auto-advance to CVV when MM/YY complete
document.getElementById('newExpiry').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '').substring(0, 4);
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    this.value = v;
    if (v.length === 5) document.getElementById('newCvv').focus();
});

// Auto-advance CVV to PIN when 3 digits
document.getElementById('newCvv').addEventListener('input', function() {
    if (this.value.length >= 3) document.getElementById('newPin').focus();
});

saveCardBtn.addEventListener('click', async () => {
    const bankName = document.getElementById('newBankName').value.trim();
    const cardName = document.getElementById('newCardName').value.trim();
    const holderName = document.getElementById('newHolderName').value.trim();
    const number = document.getElementById('newCardNumber').value.replace(/\s/g, '').trim();
    const expiry = document.getElementById('newExpiry').value.trim();
    const cvv = document.getElementById('newCvv').value.trim();
    const pin = document.getElementById('newPin').value.trim();

    if (!bankName || !cardName || !number || !expiry || !cvv || !pin) {
        addCardError.textContent = '❌ All fields are required.'; addCardError.style.display = 'block'; return;
    }
    if (number.length < 13) {
        addCardError.textContent = '❌ Card number too short.'; addCardError.style.display = 'block'; return;
    }
    if (pin.length < 3) {
        addCardError.textContent = '❌ PIN must be at least 3 characters.'; addCardError.style.display = 'block'; return;
    }

    addCardError.style.display = 'none';
    saveCardBtn.disabled = true; saveCardBtn.textContent = '⏳ Encrypting...';

    try {
        const encryptedData = await encryptData({ number, expiry, cvv }, pin);
        const cardType = document.querySelector('input[name="cardType"]:checked').value;
        const updatedCard = { bankName, cardName, cardType, encryptedData };
        if (holderName) updatedCard.holderName = holderName;

        if (editingIndex !== null) {
            // Edit mode — replace existing card
            cards[editingIndex] = updatedCard;
            revealedCards.delete(editingIndex);
            delete decryptedCache[editingIndex];
            editingIndex = null;
            saveCards(cards);
            sessionPin = pin;
            if (holderName) localStorage.setItem(HOLDER_KEY, holderName);
            hideAddCardModal();
            renderCards(searchInput.value);
            showToast('✏️ Card updated!');
        } else {
            // Add mode — push new card
            cards.push(updatedCard);
            saveCards(cards);
            sessionPin = pin;
            if (holderName) localStorage.setItem(HOLDER_KEY, holderName);
            hideAddCardModal();
            renderCards(searchInput.value);
            showToast('✅ Card encrypted & saved!');
        }
    } catch (err) {
        addCardError.textContent = '❌ Encryption failed: ' + err.message; addCardError.style.display = 'block';
    } finally {
        saveCardBtn.disabled = false; saveCardBtn.textContent = '🔐 Encrypt & Save';
    }
});

// ============================
// 🗑️ DELETE
// ============================

function requestDelete(i) {
    pendingDeleteIndex = i;
    deleteMsg.textContent = `Delete "${cards[i].bankName} — ${cards[i].cardName}"?`;
    deleteModal.style.display = 'flex';
}
function hideDeleteModal() { deleteModal.style.display = 'none'; pendingDeleteIndex = null; }
document.querySelector('#deleteModal .modal-close').addEventListener('click', hideDeleteModal);
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) hideDeleteModal(); });

confirmDeleteBtn.addEventListener('click', () => {
    if (pendingDeleteIndex !== null) {
        cards.splice(pendingDeleteIndex, 1);
        saveCards(cards);
        revealedCards.clear(); decryptedCache = {};
        hideDeleteModal();
        renderCards(searchInput.value);
        showToast('🗑️ Card deleted.');
    }
});

// ============================
// 📤 EXPORT / 📥 IMPORT
// ============================

exportBtn.addEventListener('click', () => {
    if (cards.length === 0) { showToast('⚠️ No cards to export.'); return; }
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'card-vault-backup.json';
    a.click(); URL.revokeObjectURL(a.href);
    showToast('📤 Exported ' + cards.length + ' card(s)!');
});

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const imported = JSON.parse(reader.result);
            if (!Array.isArray(imported)) throw new Error('Invalid format');
            // Validate structure
            for (const c of imported) {
                if (!c.bankName || !c.cardName || !c.encryptedData) throw new Error('Missing fields');
            }
            cards = imported;
            saveCards(cards);
            revealedCards.clear(); decryptedCache = {}; sessionPin = null;
            renderCards(searchInput.value);
            showToast('📥 Imported ' + imported.length + ' card(s)!');
        } catch (err) {
            showToast('❌ Import failed: ' + err.message);
        }
    };
    reader.readAsText(file);
    importFile.value = '';
});

// ============================
// 🔍 SEARCH
// ============================

searchInput.addEventListener('input', () => {
    clearSearch.classList.toggle('visible', searchInput.value.length > 0);
    renderCards(searchInput.value);
});
clearSearch.addEventListener('click', () => {
    searchInput.value = ''; clearSearch.classList.remove('visible');
    renderCards(); searchInput.focus();
});

// ============================
// 🍞 TOAST
// ============================

function showToast(msg) {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2000);
}

// ============================
// 🏦 BANK DROPDOWN
// ============================

const BANKS = [
    "Axis Bank", "Bandhan Bank", "Bank of Baroda", "Bank of India", "Bank of Maharashtra",
    "Canara Bank", "Central Bank of India", "City Union Bank", "CSB Bank",
    "DCB Bank", "Dhanlaxmi Bank", "Federal Bank",
    "HDFC Bank", "ICICI Bank", "IDBI Bank", "IDFC First Bank",
    "Indian Bank", "Indian Overseas Bank", "IndusInd Bank",
    "Jammu & Kashmir Bank", "Karnataka Bank", "Karur Vysya Bank", "Kotak Mahindra Bank",
    "Nainital Bank", "Punjab & Sind Bank", "Punjab National Bank",
    "RBL Bank", "South Indian Bank", "State Bank of India (SBI)",
    "Tamilnad Mercantile Bank", "UCO Bank", "Union Bank of India",
    "YES Bank",
    "American Express", "Citibank", "DBS Bank", "Deutsche Bank",
    "HSBC", "Standard Chartered Bank",
    "AU Small Finance Bank", "Equitas Small Finance Bank", "Ujjivan Small Finance Bank",
    "Jana Small Finance Bank", "Suryoday Small Finance Bank",
    "Paytm Payments Bank", "Airtel Payments Bank", "India Post Payments Bank",
    "Fino Payments Bank", "Jio Payments Bank",
    "Bajaj Finserv", "OneCard", "Slice", "Fi Money", "Jupiter"
];

const bankInput = document.getElementById('newBankName');
const bankDropdown = document.getElementById('bankDropdown');
let selectedBankIndex = -1;

bankInput.addEventListener('input', () => {
    const query = bankInput.value.toLowerCase().trim();
    selectedBankIndex = -1;
    if (!query) { bankDropdown.style.display = 'none'; return; }

    const matches = BANKS.filter(b => b.toLowerCase().includes(query));
    if (matches.length === 0) { bankDropdown.style.display = 'none'; return; }

    bankDropdown.innerHTML = matches.map((b, i) =>
        `<div class="dropdown-item" data-index="${i}">${highlightMatch(b, query)}</div>`
    ).join('');
    bankDropdown.style.display = 'block';
});

bankInput.addEventListener('keydown', (e) => {
    const items = bankDropdown.querySelectorAll('.dropdown-item');
    if (!items.length || bankDropdown.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedBankIndex = Math.min(selectedBankIndex + 1, items.length - 1);
        updateDropdownHighlight(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedBankIndex = Math.max(selectedBankIndex - 1, 0);
        updateDropdownHighlight(items);
    } else if (e.key === 'Enter' && selectedBankIndex >= 0) {
        e.preventDefault();
        bankInput.value = items[selectedBankIndex].textContent;
        bankDropdown.style.display = 'none';
    }
});

bankInput.addEventListener('focus', () => {
    if (bankInput.value.trim()) bankInput.dispatchEvent(new Event('input'));
});

bankDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (item) {
        bankInput.value = item.textContent;
        bankDropdown.style.display = 'none';
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-group')) bankDropdown.style.display = 'none';
});

function updateDropdownHighlight(items) {
    items.forEach((el, i) => el.classList.toggle('active', i === selectedBankIndex));
    if (items[selectedBankIndex]) items[selectedBankIndex].scrollIntoView({ block: 'nearest' });
}

function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.substring(0, idx)) +
        `<strong>${escapeHtml(text.substring(idx, idx + query.length))}</strong>` +
        escapeHtml(text.substring(idx + query.length));
}

// ============================
// 🚀 INIT
// ============================

// Type filter buttons
document.querySelector('.type-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.type-filter-btn');
    if (!btn) return;
    activeTypeFilter = btn.dataset.filter;
    document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderCards(searchInput.value);
});

renderCards();
