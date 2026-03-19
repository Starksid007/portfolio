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

// Format number in Indian style: 3,00,000
function formatIndianNumber(num) {
    const n = String(num).replace(/\D/g, '');
    if (!n) return '';
    const last3 = n.slice(-3);
    const rest = n.slice(0, -3);
    if (!rest) return last3;
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
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
                    <button class="card-copy-all ${shown ? 'active' : ''}" data-action="share" data-index="${i}" title="Share card details">📤</button>
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
                ${card.creditLimit ? `<div class="detail-row" style="margin-top:0.5rem"><span class="detail-label">Limit</span><span class="detail-value limit-hidden" data-limit="₹${formatIndianNumber(card.creditLimit)}" style="font-weight:600;font-size:0.90rem;letter-spacing:1px;cursor:pointer" title="Click to reveal">••••••</span><button class="copy-btn" data-action="toggle-limit" style="display:inline-block;cursor:pointer;font-size:0.9rem" title="Show/Hide limit">👁</button></div>` : ''}
                ${card.holderName ? `<div class="holder-name">${escapeHtml(card.holderName)}</div>` : ''}
                <div class="card-network-badge">${getNetworkIcon(card.cardNetwork || 'Visa')}</div>
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
    // Calculate total credit limit (shared groups counted once)
    const seenGroups = new Set();
    let totalLimit = 0;
    cards.forEach(c => {
        if (!c.creditLimit) return;
        if (c.sharedLimitGroup) {
            const grp = c.sharedLimitGroup.toLowerCase().trim();
            if (seenGroups.has(grp)) return; // already counted
            seenGroups.add(grp);
        }
        totalLimit += parseInt(c.creditLimit);
    });
    const limitHtml = totalLimit > 0 ? ` &nbsp;|&nbsp; Total Limit: <span style="color:var(--gold);font-weight:700">₹${formatIndianNumber(totalLimit)}</span>` : '';

    document.getElementById('cardCount').innerHTML = (filtered
        ? `<span class="card-count-num">${showing}</span> of ${total} card${total !== 1 ? 's' : ''}`
        : `<span class="card-count-num">${total}</span> card${total !== 1 ? 's' : ''}`) + limitHtml;
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
    else if (btn.dataset.action === 'share') shareCardDetails(idx, btn);
    else if (btn.dataset.action === 'edit') openEditCard(idx);
    else if (btn.dataset.action === 'toggle-limit' || btn.classList.contains('limit-hidden') || (btn.classList.contains('detail-value') && btn.dataset.limit)) {
        const limitSpan = btn.classList.contains('detail-value') ? btn : btn.parentElement.querySelector('.detail-value');
        if (limitSpan.classList.contains('limit-hidden')) {
            limitSpan.textContent = limitSpan.dataset.limit;
            limitSpan.classList.remove('limit-hidden');
            limitSpan.style.color = 'var(--gold)';
            btn.textContent = '🙈';
            btn.title = 'Hide limit';
        } else {
            limitSpan.textContent = '••••••';
            limitSpan.classList.add('limit-hidden');
            limitSpan.style.color = '';
            btn.textContent = '👁';
            btn.title = 'Show limit';
        }
    }
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
    if (card.creditLimit) lines.push('Limit: ₹' + formatIndianNumber(card.creditLimit));

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
        btnEl.textContent = '✅';
        showToast('📋 All details copied!');
        setTimeout(() => { btnEl.textContent = '📋'; }, 1500);
    });
}

/**
 * Share card details via Web Share API (native share sheet on mobile)
 * Falls back to copy-to-clipboard on desktop
 */
async function shareCardDetails(i, btnEl) {
    const card = cards[i];
    const dec = decryptedCache[i];
    if (!dec) { showToast('🔓 View card details first to share.'); return; }

    const lines = [
        `${card.bankName} : ${card.cardName}`,
        dec.number,
        dec.expiry,
        dec.cvv
    ];
    if (card.holderName) lines.push(card.holderName);
    if (card.creditLimit) lines.push('Limit: ₹' + formatIndianNumber(card.creditLimit));
    const shareText = lines.join('\n');

    // Try Web Share API (mobile — opens native share sheet)
    if (navigator.share) {
        try {
            await navigator.share({
                title: `${card.bankName} — ${card.cardName}`,
                text: shareText
            });
            btnEl.textContent = '✅';
            showToast('📤 Shared!');
            setTimeout(() => { btnEl.textContent = '📤'; }, 1500);
            return;
        } catch (err) {
            // User cancelled share — that's fine
            if (err.name === 'AbortError') return;
        }
    }

    // Fallback: copy to clipboard (desktop)
    try {
        await navigator.clipboard.writeText(shareText);
        btnEl.textContent = '✅';
        showToast('📋 Copied to clipboard (share not available on this device)');
        setTimeout(() => { btnEl.textContent = '📤'; }, 1500);
    } catch {
        showToast('❌ Share not available on this device.');
    }
}

async function showPinModal() {
    pinModal.style.display = 'flex'; pinInput.value = ''; pinError.style.display = 'none';

    // Auto-trigger biometric if enrolled
    if (hasBiometricSetup()) {
        pinError.textContent = '🔐 Verifying biometric...';
        pinError.style.display = 'block'; pinError.style.color = 'var(--text-secondary)';
        const pin = await authenticateWithBiometric();
        pinError.style.color = ''; // reset
        if (pin && pendingRevealIndex !== null) {
            try {
                const i = pendingRevealIndex;
                decryptedCache[i] = await decryptData(cards[i].encryptedData, pin);
                revealedCards.add(i); sessionPin = pin;
                hidePinModal(); renderCards(searchInput.value);
                return; // Success — no need to show modal
            } catch {
                pinError.textContent = '❌ Biometric PIN mismatch. Enter PIN manually.';
                pinError.style.display = 'block';
            }
        } else {
            pinError.textContent = '❌ Biometric failed. Enter PIN manually.';
            pinError.style.display = 'block';
        }
    }

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
        offerBiometricEnrollment(pin);
    } catch {
        sessionPin = null;
        pinError.textContent = '❌ Incorrect PIN. Try again.'; pinError.style.display = 'block';
        pinInput.value = ''; pinInput.focus();
    }
});
// Force numeric-only on PIN inputs
[pinInput, document.getElementById('newPin')].forEach(el => {
    el.addEventListener('input', function() { this.value = this.value.replace(/\D/g, ''); });
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
    document.getElementById('networkIcon').textContent = '';
    document.getElementById('networkIcon').className = 'network-icon';
    // Pre-fill holder name from localStorage (persists across sessions)
    document.getElementById('newHolderName').value = localStorage.getItem(HOLDER_KEY) || '';
    document.getElementById('newCardNumber').value = '';
    document.getElementById('newExpiry').value = '';
    document.getElementById('newCvv').value = '';
    document.getElementById('newCreditLimit').value = '';
    creditLimitGroup.style.display = 'block'; // Credit Card is default, show limit
    document.getElementById('sharedLimitGroup').style.display = 'block';
    lastSharedBankName = '';
    renderSharedCardsCheckboxes('');
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
    // Show detected network icon for edit
    const editNetwork = card.cardNetwork || detectCardNetwork(dec.number) || '';
    const editIconEl = document.getElementById('networkIcon');
    if (editNetwork) {
        editIconEl.innerHTML = getNetworkIcon(editNetwork);
        editIconEl.className = 'network-icon visible';
    }
    document.getElementById('newExpiry').value = dec.expiry;
    document.getElementById('newCvv').value = dec.cvv;
    document.getElementById('newCreditLimit').value = card.creditLimit ? formatIndianNumber(card.creditLimit) : '';
    const isDebit = (card.cardType || 'Credit Card') === 'Debit Card';
    creditLimitGroup.style.display = isDebit ? 'none' : 'block';
    document.getElementById('sharedLimitGroup').style.display = isDebit ? 'none' : 'block';
    lastSharedBankName = card.bankName;
    renderSharedCardsCheckboxes(card.bankName);
    document.getElementById('newPin').value = sessionPin || '';
    setTimeout(() => document.getElementById('newBankName').focus(), 100);
}

function hideAddCardModal() { addCardModal.style.display = 'none'; }
document.querySelector('#addCardModal .modal-close').addEventListener('click', hideAddCardModal);
addCardModal.addEventListener('click', e => { if (e.target === addCardModal) hideAddCardModal(); });

function getNetworkLabel(network) {
    const labels = { Visa: 'VISA', Mastercard: 'Mastercard', RuPay: 'RuPay', Amex: 'AMEX', Diners: 'DINERS', JCB: 'RuPay JCB' };
    return labels[network] || '';
}

// SVG icons for card networks (used on card display)
function getNetworkIcon(network) {
    const icons = {
        Visa: `<svg viewBox="0 0 48 16" class="network-svg"><text x="24" y="13" font-size="16" font-weight="900" font-style="italic" fill="#1a1f71" font-family="Arial,sans-serif" text-anchor="middle">VISA</text></svg>`,
        Mastercard: `<svg viewBox="0 0 40 24" class="network-svg"><circle cx="14" cy="12" r="10" fill="#eb001b" opacity="0.9"/><circle cx="26" cy="12" r="10" fill="#f79e1b" opacity="0.9"/><path d="M20 4.6a10 10 0 010 14.8 10 10 0 000-14.8z" fill="#ff5f00"/></svg>`,
        RuPay: `<svg viewBox="0 0 82 24" class="network-svg"><text x="2" y="18" font-size="17" font-weight="800" font-style="italic" fill="#1A2674" font-family="Arial,sans-serif">RuPay</text><polygon points="62,4 72,12 62,20" fill="#F7941D"/><polygon points="68,4 78,12 68,20" fill="#009E49"/></svg>`,
        Amex: `<svg viewBox="0 0 48 16" class="network-svg"><rect width="48" height="16" rx="3" fill="#006FCF"/><text x="24" y="12" font-size="10" font-weight="800" fill="white" text-anchor="middle" font-family="Arial,sans-serif">AMEX</text></svg>`,
        Diners: `<svg viewBox="0 0 24 24" class="network-svg"><circle cx="12" cy="12" r="11" fill="none" stroke="#004B87" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="#004B87"/><rect x="6" y="11" width="12" height="2" rx="1" fill="white"/></svg>`,
        JCB: `<svg viewBox="0 0 96 24" class="network-svg"><text x="2" y="18" font-size="14" font-weight="800" font-style="italic" fill="#1A2674" font-family="Arial,sans-serif">RuPay</text><polygon points="50,5 58,12 50,19" fill="#F7941D"/><polygon points="55,5 63,12 55,19" fill="#009E49"/><rect x="66" y="2" width="9" height="20" rx="2" fill="#0062AC"/><text x="70.5" y="16" font-size="8" font-weight="800" fill="white" text-anchor="middle" font-family="Arial,sans-serif">J</text><rect x="75.5" y="2" width="9" height="20" rx="2" fill="#CB3837"/><text x="80" y="16" font-size="8" font-weight="800" fill="white" text-anchor="middle" font-family="Arial,sans-serif">C</text><rect x="85" y="2" width="9" height="20" rx="2" fill="#00874B"/><text x="89.5" y="16" font-size="8" font-weight="800" fill="white" text-anchor="middle" font-family="Arial,sans-serif">B</text></svg>`
    };
    return icons[network] || `<span class="network-text-fallback">${escapeHtml(getNetworkLabel(network))}</span>`;
}

// Detect card network from BIN (first digits) — same as real payment apps
function detectCardNetwork(number) {
    const n = number.replace(/\D/g, '');
    if (!n) return null;
    // Amex: 34, 37
    if (/^3[47]/.test(n)) return 'Amex';
    // JCB: 3528-3589
    if (/^35(2[89]|[3-8]\d)/.test(n)) return 'JCB';
    // Diners: 36, 38, 300-305
    if (/^(36|38|30[0-5])/.test(n)) return 'Diners';
    // RuPay: 60, 65, 81, 82, 508
    if (/^(60|65|81|82|508)/.test(n)) return 'RuPay';
    // Mastercard: 51-55, 2221-2720
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'Mastercard';
    // Visa: 4
    if (/^4/.test(n)) return 'Visa';
    return null;
}

// Auto-format card number → auto-detect network → auto-advance to expiry when 16 digits
document.getElementById('newCardNumber').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '').substring(0, 16);
    this.value = v.replace(/(.{4})/g, '$1 ').trim();

    // Auto-detect and show network SVG icon
    const detected = detectCardNetwork(v);
    const iconEl = document.getElementById('networkIcon');
    if (detected) {
        iconEl.innerHTML = getNetworkIcon(detected);
        iconEl.className = 'network-icon visible';
    } else {
        iconEl.innerHTML = '';
        iconEl.className = 'network-icon';
    }

    if (v.length === 16) document.getElementById('newExpiry').focus();
});

// Auto-format expiry → auto-advance to CVV when MM/YY complete
document.getElementById('newExpiry').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '').substring(0, 4);
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    this.value = v;
    if (v.length === 5) document.getElementById('newCvv').focus();
});

// Auto-advance CVV to Credit Limit when 3 digits
document.getElementById('newCvv').addEventListener('input', function() {
    if (this.value.length >= 3) document.getElementById('newCreditLimit').focus();
});

// Auto-format credit limit in Indian number style as you type
document.getElementById('newCreditLimit').addEventListener('input', function() {
    const raw = this.value.replace(/\D/g, '');
    this.value = raw ? formatIndianNumber(raw) : '';
});

// Show/hide credit limit based on card type
const creditLimitGroup = document.getElementById('newCreditLimit').closest('.form-group');
document.querySelectorAll('input[name="cardType"]').forEach(radio => {
    radio.addEventListener('change', function() {
        if (this.value === 'Debit Card') {
            creditLimitGroup.style.display = 'none';
            document.getElementById('sharedLimitGroup').style.display = 'none';
            document.getElementById('newCreditLimit').value = '';
        } else {
            creditLimitGroup.style.display = 'block';
            document.getElementById('sharedLimitGroup').style.display = 'block';
            renderSharedCardsCheckboxes(document.getElementById('newBankName').value.trim());
        }
    });
});

// ============================
// 🔗 SHARED LIMIT CHECKBOXES
// ============================

function renderSharedCardsCheckboxes(bankName) {
    const container = document.getElementById('sharedCardsContainer');
    if (!bankName) { container.innerHTML = '<span style="color:var(--text-muted)">Enter bank name first</span>'; return; }

    const sameBankCards = [];
    cards.forEach((c, i) => {
        if (i === editingIndex) return; // skip the card being edited
        if (c.bankName.toLowerCase() === bankName.toLowerCase() && (c.cardType || 'Credit Card') === 'Credit Card') {
            sameBankCards.push({ index: i, card: c });
        }
    });

    if (sameBankCards.length === 0) {
        container.innerHTML = '<span style="color:var(--text-muted)">No other credit cards from this bank</span>';
        return;
    }

    // Check which cards were previously linked (via sharedLimitGroup)
    const currentCard = editingIndex !== null ? cards[editingIndex] : null;
    const currentGroup = currentCard?.sharedLimitGroup || '';
    const hasChecked = sameBankCards.some(({ card }) => currentGroup && card.sharedLimitGroup === currentGroup);

    const checkboxes = sameBankCards.map(({ index, card }) => {
        const checked = currentGroup && card.sharedLimitGroup === currentGroup ? 'checked' : '';
        const limitStr = card.creditLimit ? ` (₹${formatIndianNumber(card.creditLimit)})` : '';
        return `<label style="display:flex;align-items:center;gap:6px;padding:5px 4px;cursor:pointer;color:var(--text-secondary);font-size:0.85rem;">
            <input type="checkbox" class="shared-card-cb" data-index="${index}" ${checked} style="accent-color:var(--accent);cursor:pointer;">
            💳 ${escapeHtml(card.cardName)}${limitStr}
        </label>`;
    }).join('');

    const expandId = 'sharedExpand_' + Date.now();
    container.innerHTML = `<div>
        <button type="button" id="${expandId}" style="background:none;border:1.5px solid var(--border);border-radius:8px;padding:6px 14px;color:var(--text-secondary);font-size:0.85rem;cursor:pointer;width:100%;text-align:left;transition:all 0.2s;">
            ▶ 📋 ${sameBankCards.length} same-bank card${sameBankCards.length > 1 ? 's' : ''} — tap to expand
        </button>
        <div id="${expandId}_list" style="display:${hasChecked ? 'block' : 'none'};padding:6px 0 0 8px;">${checkboxes}</div>
    </div>`;
    // If pre-checked, show expanded text
    const toggleBtn = document.getElementById(expandId);
    const listDiv = document.getElementById(expandId + '_list');
    if (hasChecked) toggleBtn.textContent = '▼ 📋 ' + sameBankCards.length + ' same-bank card' + (sameBankCards.length > 1 ? 's' : '');
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const isOpen = listDiv.style.display !== 'none';
        listDiv.style.display = isOpen ? 'none' : 'block';
        toggleBtn.textContent = (isOpen ? '▶' : '▼') + ' 📋 ' + sameBankCards.length + ' same-bank card' + (sameBankCards.length > 1 ? 's' : '') + (isOpen ? ' — tap to expand' : '');
    });
}

// Refresh checkboxes when bank name changes (after dropdown selection or blur)
// NOTE: bankInput is defined later — use deferred binding
// Only re-render if bank name actually changed (to avoid collapsing <details>)
let lastSharedBankName = '';
document.getElementById('newBankName').addEventListener('blur', () => {
    setTimeout(() => {
        const current = document.getElementById('newBankName').value.trim();
        if (current !== lastSharedBankName) {
            lastSharedBankName = current;
            renderSharedCardsCheckboxes(current);
        }
    }, 200);
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
    if (!/^\d{4}$/.test(pin)) {
        addCardError.textContent = '❌ PIN must be exactly 4 digits.'; addCardError.style.display = 'block'; return;
    }
    const creditLimitVal = document.getElementById('newCreditLimit').value.replace(/\D/g, '').trim();
    if (creditLimitVal) {
        const limitNum = parseInt(creditLimitVal);
        if (limitNum < 1000) {
            addCardError.textContent = '❌ Credit limit must be at least ₹1,000.'; addCardError.style.display = 'block'; return;
        }
        if (limitNum > 10000000) {
            addCardError.textContent = '❌ Credit limit cannot exceed ₹1,00,00,000.'; addCardError.style.display = 'block'; return;
        }
    }

    addCardError.style.display = 'none';
    saveCardBtn.disabled = true; saveCardBtn.textContent = '⏳ Encrypting...';

    try {
        const encryptedData = await encryptData({ number, expiry, cvv }, pin);
        const cardType = document.querySelector('input[name="cardType"]:checked').value;
        const cardNetwork = detectCardNetwork(number) || 'Visa';
        const creditLimitRaw = document.getElementById('newCreditLimit').value.replace(/\D/g, '').trim();
        const updatedCard = { bankName, cardName, cardType, cardNetwork, encryptedData };
        if (holderName) updatedCard.holderName = holderName;
        if (creditLimitRaw) updatedCard.creditLimit = creditLimitRaw;

        // Get checked shared-limit cards
        const checkedBoxes = document.querySelectorAll('.shared-card-cb:checked');
        const sharedIndices = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.index));

        // If any cards are checked, create/use a shared group and sync limits
        if (sharedIndices.length > 0 && creditLimitRaw) {
            // Generate group ID from bank name
            const groupId = 'shared_' + bankName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
            // Check if linked cards already have a group — reuse it
            const existingGroup = sharedIndices.map(idx => cards[idx].sharedLimitGroup).find(g => g) || groupId;

            updatedCard.sharedLimitGroup = existingGroup;
            // Sync limit and group to all checked cards
            sharedIndices.forEach(idx => {
                cards[idx].creditLimit = creditLimitRaw;
                cards[idx].sharedLimitGroup = existingGroup;
            });
        }

        if (editingIndex !== null) {
            cards[editingIndex] = updatedCard;
            revealedCards.delete(editingIndex);
            delete decryptedCache[editingIndex];
            editingIndex = null;
            saveCards(cards);
            sessionPin = pin;
            if (holderName) localStorage.setItem(HOLDER_KEY, holderName);
            hideAddCardModal();
            renderCards(searchInput.value);
            const syncCount = sharedIndices.length;
            showToast(syncCount > 0 ? `✏️ Card updated! Limit synced to ${syncCount} card(s).` : '✏️ Card updated!');
        } else {
            cards.push(updatedCard);
            saveCards(cards);
            sessionPin = pin;
            if (holderName) localStorage.setItem(HOLDER_KEY, holderName);
            hideAddCardModal();
            renderCards(searchInput.value);
            const syncCount = sharedIndices.length;
            showToast(syncCount > 0 ? `✅ Saved! Limit synced to ${syncCount} card(s).` : '✅ Card encrypted & saved!');
        }
    } catch (err) {
        addCardError.textContent = '❌ Encryption failed: ' + err.message; addCardError.style.display = 'block';
    } finally {
        saveCardBtn.disabled = false;
        saveCardBtn.textContent = editingIndex !== null ? '💾 Update Card' : '🔐 Encrypt & Save';
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

// ============================
// 🔐 BIOMETRIC UNLOCK (Face ID / Touch ID)
// ============================

const BIOMETRIC_PIN_KEY = 'cardvault_bio_pin';
const BIOMETRIC_CRED_KEY = 'cardvault_bio_cred';

function isBiometricAvailable() {
    return window.PublicKeyCredential && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
        ? window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        : Promise.resolve(false);
}

function hasBiometricSetup() {
    return !!localStorage.getItem(BIOMETRIC_CRED_KEY) && !!localStorage.getItem(BIOMETRIC_PIN_KEY);
}

async function enrollBiometric(pin) {
    try {
        const available = await isBiometricAvailable();
        if (!available) return;

        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const userId = crypto.getRandomValues(new Uint8Array(16));

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: "Card Vault", id: window.location.hostname || 'localhost' },
                user: { id: userId, name: "vault-user", displayName: "Card Vault User" },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    userVerification: "required",
                    residentKey: "preferred"
                },
                timeout: 60000
            }
        });

        if (credential) {
            // Store credential ID and PIN (PIN is needed for AES decryption)
            const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
            localStorage.setItem(BIOMETRIC_CRED_KEY, credId);
            // Lightly obfuscate PIN in storage
            localStorage.setItem(BIOMETRIC_PIN_KEY, btoa(pin));
            showToast('✅ Face ID / Touch ID enabled!');
        }
    } catch (err) {
        console.log('Biometric enrollment skipped:', err.message);
    }
}

async function authenticateWithBiometric() {
    try {
        const credId = localStorage.getItem(BIOMETRIC_CRED_KEY);
        if (!credId) return null;

        const rawId = Uint8Array.from(atob(credId), c => c.charCodeAt(0));
        const challenge = crypto.getRandomValues(new Uint8Array(32));

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                allowCredentials: [{ id: rawId, type: "public-key", transports: ["internal"] }],
                userVerification: "required",
                timeout: 60000
            }
        });

        if (assertion) {
            const storedPin = localStorage.getItem(BIOMETRIC_PIN_KEY);
            return storedPin ? atob(storedPin) : null;
        }
    } catch (err) {
        console.log('Biometric auth failed:', err.message);
    }
    return null;
}

// Offer biometric after successful PIN unlock
async function offerBiometricEnrollment(pin) {
    if (hasBiometricSetup()) return; // Already set up
    const available = await isBiometricAvailable();
    if (!available) return;
    // Show a toast asking to enable — using a small delay so the card reveal shows first
    setTimeout(() => {
        if (confirm('🔐 Enable Face ID / Touch ID for quick unlock next time?')) {
            enrollBiometric(pin);
        }
    }, 500);
}

// Show biometric button if available
async function initBiometricButton() {
    const bioBtn = document.getElementById('biometricBtn');
    if (!bioBtn) return;
    if (hasBiometricSetup()) {
        bioBtn.style.display = 'block';
    } else {
        const available = await isBiometricAvailable();
        bioBtn.style.display = available ? 'none' : 'none'; // Show only after enrollment
    }
}

// Biometric button click handler
document.getElementById('biometricBtn').addEventListener('click', async () => {
    const bioBtn = document.getElementById('biometricBtn');
    bioBtn.textContent = '⏳ Verifying...'; bioBtn.disabled = true;
    const pin = await authenticateWithBiometric();
    bioBtn.textContent = '🫥 Unlock with Face ID'; bioBtn.disabled = false;
    if (pin && pendingRevealIndex !== null) {
        try {
            const i = pendingRevealIndex;
            decryptedCache[i] = await decryptData(cards[i].encryptedData, pin);
            revealedCards.add(i); sessionPin = pin;
            hidePinModal(); renderCards(searchInput.value);
        } catch {
            pinError.textContent = '❌ Biometric PIN failed. Enter PIN manually.';
            pinError.style.display = 'block';
        }
    } else if (!pin) {
        pinError.textContent = '❌ Biometric verification failed.';
        pinError.style.display = 'block';
    }
});

// ============================
// 🌗 THEME TOGGLE
// ============================

const themeToggle = document.getElementById('themeToggle');
const THEME_KEY = 'cardvault_theme';

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
    localStorage.setItem(THEME_KEY, theme);
}

// Load saved theme (default: dark)
setTheme(localStorage.getItem(THEME_KEY) || 'dark');

themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
});

// ============================
// 🗂️ TAB SWITCHING
// ============================
const TAB_KEY = 'cardvault_active_tab';
document.getElementById('tabNav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tabId = btn.dataset.tab;
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Update content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(tabId === 'cards' ? 'tabCards' : 'tabCoupons');
    if (target) target.classList.add('active');
    localStorage.setItem(TAB_KEY, tabId);
    // When switching to coupons, update UI
    if (tabId === 'coupons' && typeof updateCouponUI === 'function') updateCouponUI();
});
// Restore last active tab
(function restoreTab() {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === 'coupons') {
        document.querySelector('.tab-btn[data-tab="coupons"]')?.click();
    }
})();
