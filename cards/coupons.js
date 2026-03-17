// ============================================================
// 🎫 RuPay Coupon Fetcher — Client-Side Gmail API
// ============================================================
// Uses Google OAuth2 Implicit Flow (no server needed)
// Searches Gmail for RuPay coupon emails and extracts coupon codes
// ============================================================

const GMAIL_CLIENT_ID_KEY = 'cardvault_gmail_client_id';
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL_TOKEN_KEY = 'cardvault_gmail_token';
const GMAIL_TOKEN_EXPIRY_KEY = 'cardvault_gmail_expiry';
const USED_COUPONS_KEY = 'cardvault_used_coupons';
const CACHED_COUPONS_KEY = 'cardvault_cached_coupons';
const LAST_FETCH_TIME_KEY = 'cardvault_last_fetch_time';

// ============================
// ✅ USED COUPONS (localStorage)
// ============================

function getUsedCoupons() {
    try {
        const raw = localStorage.getItem(USED_COUPONS_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw);
        // Auto-cleanup: remove entries older than 3 months
        const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        let changed = false;
        for (const bookingId in data) {
            if (data[bookingId].usedAt < threeMonthsAgo) {
                delete data[bookingId];
                changed = true;
            }
        }
        if (changed) localStorage.setItem(USED_COUPONS_KEY, JSON.stringify(data));
        return data;
    } catch { return {}; }
}

function markCouponUsed(bookingId, couponData) {
    const used = getUsedCoupons();
    used[bookingId] = { ...couponData, usedAt: Date.now() };
    localStorage.setItem(USED_COUPONS_KEY, JSON.stringify(used));
}

function unmarkCouponUsed(bookingId) {
    const used = getUsedCoupons();
    delete used[bookingId];
    localStorage.setItem(USED_COUPONS_KEY, JSON.stringify(used));
}

// ============================
// 💾 CACHED COUPONS (localStorage)
// ============================

function saveCachedCoupons(coupons) {
    try {
        localStorage.setItem(CACHED_COUPONS_KEY, JSON.stringify(coupons));
    } catch {}
}

function loadCachedCoupons() {
    try {
        const raw = localStorage.getItem(CACHED_COUPONS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

// ============================
// 🔐 OAUTH2 (Implicit Flow)
// ============================

function getRedirectUri() {
    // Use current page URL without hash/query
    return window.location.origin + window.location.pathname;
}

function getGmailToken() {
    const token = localStorage.getItem(GMAIL_TOKEN_KEY);
    const expiry = localStorage.getItem(GMAIL_TOKEN_EXPIRY_KEY);
    if (token && expiry && Date.now() < parseInt(expiry)) {
        return token;
    }
    // Token expired — clear it
    localStorage.removeItem(GMAIL_TOKEN_KEY);
    localStorage.removeItem(GMAIL_TOKEN_EXPIRY_KEY);
    return null;
}

function saveGmailToken(token, expiresIn) {
    localStorage.setItem(GMAIL_TOKEN_KEY, token);
    localStorage.setItem(GMAIL_TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
}

function clearGmailToken() {
    localStorage.removeItem(GMAIL_TOKEN_KEY);
    localStorage.removeItem(GMAIL_TOKEN_EXPIRY_KEY);
}

function getGmailClientId() {
    return localStorage.getItem(GMAIL_CLIENT_ID_KEY) || '';
}

function saveGmailClientId(id) {
    localStorage.setItem(GMAIL_CLIENT_ID_KEY, id.trim());
}

function startGmailLogin() {
    const clientId = getGmailClientId();
    if (!clientId) {
        showCouponError('Please set your Gmail Client ID first (⚙️ below).');
        return;
    }
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: getRedirectUri(),
        response_type: 'token',
        scope: GMAIL_SCOPES,
        include_granted_scopes: 'true',
        prompt: 'consent'
    });
    window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// Check if we're returning from OAuth redirect
function handleOAuthCallback() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        const expiresIn = parseInt(params.get('expires_in') || '3600');
        if (token) {
            saveGmailToken(token, expiresIn);
            // Clean up URL hash
            history.replaceState(null, '', window.location.pathname + window.location.search);
            // Auto-open coupon modal
            setTimeout(() => {
                showCouponModal();
                updateCouponUI();
            }, 300);
        }
    }
}

// ============================
// 📧 GMAIL API
// ============================

async function gmailFetch(endpoint, token) {
    const res = await fetch(`https://www.googleapis.com/gmail/v1/users/me/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) {
        clearGmailToken();
        throw new Error('Session expired. Please login again.');
    }
    if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
    return res.json();
}

async function getGmailProfile(token) {
    return gmailFetch('profile', token);
}

async function searchEmails(token, afterTimestamp) {
    // afterTimestamp: epoch ms — if provided, search after that date; else last 30 days
    let afterDate;
    if (afterTimestamp) {
        const d = new Date(afterTimestamp);
        afterDate = d.toISOString().split('T')[0].replace(/-/g, '/');
    } else {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        afterDate = thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '/');
    }

    const query = encodeURIComponent(`from:rupay@truztee.com subject:"Booking ID" after:${afterDate}`);
    return gmailFetch(`messages?q=${query}&maxResults=50`, token);
}

function getLastFetchTime() {
    const t = localStorage.getItem(LAST_FETCH_TIME_KEY);
    return t ? parseInt(t) : null;
}

function saveLastFetchTime() {
    localStorage.setItem(LAST_FETCH_TIME_KEY, String(Date.now()));
}

async function getEmailBody(messageId, token) {
    const msg = await gmailFetch(`messages/${messageId}?format=full`, token);
    return extractBody(msg);
}

function extractBody(message) {
    let body = '';
    let rawHtml = '';
    const payload = message.payload;

    // Get subject from headers
    let subject = '';
    if (payload.headers) {
        const subjectHeader = payload.headers.find(h => h.name.toLowerCase() === 'subject');
        if (subjectHeader) subject = subjectHeader.value;
    }

    // Helper to find HTML in parts
    function findHtml(parts) {
        for (const part of parts) {
            if (part.mimeType === 'text/html' && part.body && part.body.data) {
                return decodeBase64Url(part.body.data);
            }
            if (part.parts) {
                const found = findHtml(part.parts);
                if (found) return found;
            }
        }
        return '';
    }

    // Extract body
    if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
        rawHtml = decodeBase64Url(payload.body.data);
        body = stripHtml(rawHtml);
    } else if (payload.body && payload.body.data) {
        body = decodeBase64Url(payload.body.data);
    } else if (payload.parts) {
        rawHtml = findHtml(payload.parts);
        body = rawHtml ? stripHtml(rawHtml) : '';
    }

    return { subject, body, rawHtml };
}

function decodeBase64Url(data) {
    try {
        const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
        return decodeURIComponent(atob(base64).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join(''));
    } catch {
        return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    }
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

// Parse HTML email to extract structured fields from the table
function parseHtmlEmail(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const fields = {};

    // Extract key-value pairs from table rows: <td>Label:</td><td>Value</td>
    const rows = tmp.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
            const label = (cells[0].textContent || '').trim().replace(/:$/, '').toLowerCase();
            const value = (cells[1].textContent || '').trim();
            if (label && value) fields[label] = value;
        }
    });

    return fields;
}

// Format timestamp (ms) → "16th Mar"
function formatTimestampDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const suffix = (day === 1 || day === 21 || day === 31) ? 'st'
        : (day === 2 || day === 22) ? 'nd'
        : (day === 3 || day === 23) ? 'rd' : 'th';
    return `${day}${suffix} ${month}`;
}

// Format "16-Mar-2026" → "16th Mar"
function formatCouponDate(dateStr) {
    if (!dateStr || dateStr === '—') return '—';
    const parts = dateStr.match(/(\d{1,2})[- ](\w+)/);
    if (!parts) return dateStr;
    const day = parseInt(parts[1]);
    const month = parts[2];
    const suffix = (day === 1 || day === 21 || day === 31) ? 'st'
        : (day === 2 || day === 22) ? 'nd'
        : (day === 3 || day === 23) ? 'rd' : 'th';
    return `${day}${suffix} ${month}`;
}

// ============================
// 🎫 COUPON PARSING
// ============================

function parseCoupon(subject, body, rawHtml) {
    // Extract booking ID from subject
    let booking = subject;
    const bookingMatch = subject.match(/Booking\s*ID\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
    if (bookingMatch) booking = bookingMatch[1];

    let category = '—';
    let dateStr = '—';
    let coupon = null;
    let couponPending = false;

    // If we have raw HTML, parse the table structure directly
    if (rawHtml) {
        const fields = parseHtmlEmail(rawHtml);

        // Extract Service Provider
        if (fields['service provider']) category = fields['service provider'];

        // Extract Date of Issue
        if (fields['date of issue']) dateStr = fields['date of issue'];

        // Extract Coupon Code
        const rawCoupon = fields['coupon code'] || '';
        if (rawCoupon) {
            if (/will be sent|24.?48|pending|processing|blank/i.test(rawCoupon)) {
                couponPending = true;
            } else if (rawCoupon.toUpperCase() === 'NA' || rawCoupon === '-' || rawCoupon.length < 3) {
                couponPending = true;
            } else {
                coupon = rawCoupon;
            }
        }

        // Fallback: booking ID from body fields
        if (!bookingMatch && fields['booking id']) booking = fields['booking id'];
    }

    // Fallback to plain text parsing if HTML parsing failed
    if (!coupon && !couponPending && body) {
        const pinMatch = body.match(/(\d{10,}\/pin:\d+)/i);
        if (pinMatch) coupon = pinMatch[1].trim();
    }

    // Clean up coupon
    if (coupon) coupon = coupon.replace(/^[:\-\s]+|[:\-\s]+$/g, '');
    if (coupon && coupon.length < 3) coupon = null;

    return { booking, coupon, category, dateStr, couponPending };
}

// ============================
// 🎨 UI
// ============================

const couponModal = document.getElementById('couponModal');
const couponBtn = document.getElementById('couponBtn');
const couponModalClose = document.getElementById('couponModalClose');
const gmailLoginBtn = document.getElementById('gmailLoginBtn');
const fetchCouponsBtn = document.getElementById('fetchCouponsBtn');
const gmailLogoutBtn = document.getElementById('gmailLogoutBtn');

function showCouponModal() {
    couponModal.style.display = 'flex';
    updateCouponUI();
    // Immediately show cached coupons from localStorage
    const cached = loadCachedCoupons();
    if (cached.length > 0) {
        lastFetchedCoupons = cached;
        renderCouponTable(cached);
    }
}

function hideCouponModal() {
    couponModal.style.display = 'none';
}

function updateCouponUI() {
    const token = getGmailToken();
    const authSection = document.getElementById('couponAuthSection');
    const loggedInSection = document.getElementById('couponLoggedIn');
    const couponError = document.getElementById('couponError');
    couponError.style.display = 'none';

    // Show/hide setup section based on whether client ID exists
    const setupSection = document.getElementById('couponSetupSection');
    const clientIdInput = document.getElementById('gmailClientIdInput');
    const clientId = getGmailClientId();
    if (!clientId) {
        setupSection.style.display = 'block';
        authSection.style.display = 'none';
    } else {
        setupSection.style.display = 'none';
        clientIdInput.value = clientId;
    }

    if (token && clientId) {
        authSection.style.display = 'none';
        loggedInSection.style.display = 'block';
        // Try to get user email
        getGmailProfile(token).then(profile => {
            document.getElementById('gmailUser').textContent = `✅ ${profile.emailAddress}`;
        }).catch(() => {
            document.getElementById('gmailUser').textContent = '✅ Connected';
        });
    } else {
        authSection.style.display = 'block';
        loggedInSection.style.display = 'none';
    }
}

// Helper: update progress bar with forced repaint
function updateProgress(bar, textEl, detailEl, pct, text, detail) {
    bar.style.width = pct + '%';
    if (text) textEl.textContent = text;
    if (detail !== undefined) detailEl.textContent = detail;
}

async function fetchCoupons(forceFullRefresh) {
    const token = getGmailToken();
    if (!token) { showCouponError('Not logged in. Please login first.'); return; }

    const loading = document.getElementById('couponLoading');
    const results = document.getElementById('couponResults');
    const empty = document.getElementById('couponEmpty');
    const error = document.getElementById('couponError');

    loading.style.display = 'block';
    results.style.display = 'none';
    empty.style.display = 'none';
    error.style.display = 'none';

    const progressBar = document.getElementById('couponProgressBar');
    const progressText = document.getElementById('couponProgressText');
    const progressDetail = document.getElementById('couponProgressDetail');
    progressBar.style.transition = 'none'; // disable transition for instant updates
    progressBar.style.width = '0%';
    progressBar.offsetHeight; // force reflow
    progressBar.style.transition = 'width 0.15s linear';
    progressText.textContent = '⏳ Searching Gmail...';
    progressDetail.textContent = '';

    // Decide: incremental or full refresh
    const lastFetch = forceFullRefresh ? null : getLastFetchTime();
    const isIncremental = !!lastFetch;
    const existingCached = isIncremental ? loadCachedCoupons() : [];

    if (isIncremental) {
        const ago = formatTimestampDate(lastFetch);
        progressDetail.textContent = `Incremental since ${ago}`;
    } else {
        progressDetail.textContent = 'Full scan — last 30 days';
    }

    try {
        const searchResult = await searchEmails(token, lastFetch);
        const messages = searchResult.messages || [];

        if (messages.length === 0 && isIncremental) {
            // No new emails — just show cached data
            loading.style.display = 'none';
            if (existingCached.length > 0) {
                lastFetchedCoupons = existingCached;
                renderCouponTable(existingCached);
                saveLastFetchTime();
                if (typeof showToast === 'function') showToast('✅ No new coupons — all up to date!');
            } else {
                empty.style.display = 'block';
            }
            return;
        }

        if (messages.length === 0) {
            loading.style.display = 'none';
            empty.style.display = 'block';
            return;
        }

        const label = isIncremental ? 'new emails' : 'emails';
        updateProgress(progressBar, progressText, progressDetail, 5,
            `📧 Found ${messages.length} ${label}. Reading...`, '');

        const allParsed = [];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            try {
                const { subject, body, rawHtml } = await getEmailBody(msg.id, token);
                const parsed = parseCoupon(subject, body, rawHtml);
                allParsed.push(parsed);

                // Update progress AFTER each email fetch
                const pct = 5 + Math.round(((i + 1) / messages.length) * 90);
                const dateInfo = parsed.dateStr !== '—' ? formatCouponDate(parsed.dateStr) : '';
                const catInfo = parsed.category !== '—' ? parsed.category : '';
                updateProgress(progressBar, progressText, progressDetail, pct,
                    `📨 ${i + 1} / ${messages.length} ${label}`,
                    [catInfo, dateInfo].filter(Boolean).join(' · '));
            } catch (e) {
                console.warn('Failed to parse email:', msg.id, e);
            }
            // Yield to browser for repaint
            await new Promise(r => setTimeout(r, 0));
        }

        updateProgress(progressBar, progressText, progressDetail, 100, '✅ Processing complete!', '');

        // Deduplicate: merge new results with cached (new takes priority)
        const byBooking = new Map();
        // First add existing cached (if incremental)
        for (const c of existingCached) {
            byBooking.set(c.booking, c);
        }
        // Then add/overwrite with newly fetched (new coupon > pending)
        for (const p of allParsed) {
            const existing = byBooking.get(p.booking);
            if (!existing || (p.coupon && !existing.coupon)) {
                byBooking.set(p.booking, p);
            }
        }
        const coupons = Array.from(byBooking.values());

        // Small delay to let user see 100%
        await new Promise(r => setTimeout(r, 300));
        loading.style.display = 'none';

        if (coupons.length === 0) {
            empty.style.display = 'block';
            return;
        }

        // Save fetch time, cache, and render
        saveLastFetchTime();
        lastFetchedCoupons = coupons;
        saveCachedCoupons(coupons);
        renderCouponTable(coupons);

        const newCount = allParsed.length;
        const toastMsg = isIncremental
            ? `🔄 ${newCount} new coupon${newCount !== 1 ? 's' : ''} added!`
            : '🔄 Coupons updated!';
        if (typeof showToast === 'function') showToast(toastMsg);

    } catch (err) {
        loading.style.display = 'none';
        showCouponError(err.message);
    }
}

let lastFetchedCoupons = [];

function renderCouponTable(coupons) {
    const results = document.getElementById('couponResults');
    const tbody = document.getElementById('couponTableBody');
    const usedCoupons = getUsedCoupons();

    // Split into active and used (attach usedOn date)
    const active = coupons.filter(c => !usedCoupons[c.booking]);
    const used = coupons.filter(c => usedCoupons[c.booking]).map(c => ({
        ...c,
        usedOn: formatTimestampDate(usedCoupons[c.booking].usedAt)
    }));

    function buildRow(c, isUsed) {
        const isPending = !c.coupon;
        const couponColor = isPending ? '#c89a20' : isUsed ? '#e05070' : '#00d26a';
        const couponCell = isPending
            ? `<span style="color:#c89a20;font-style:italic;font-weight:600;font-size:0.85rem;">⏳ Pending</span>`
            : `<code style="color:${couponColor};font-weight:700;font-size:0.95rem;letter-spacing:1px;background:${isUsed ? 'rgba(224,80,112,0.1)' : 'rgba(0,210,106,0.1)'};padding:3px 8px;border-radius:4px;">${escapeHtmlCoupon(c.coupon)}</code>`;
        const actionBtn = isPending ? '' : isUsed
            ? `<button class="coupon-action-btn unmark-used-btn" data-booking="${escapeHtmlCoupon(c.booking)}" title="Mark as unused">↩️</button>`
            : `<button class="coupon-action-btn mark-used-btn" data-booking="${escapeHtmlCoupon(c.booking)}" title="Mark as used">✅</button>`;
        const copyBtn = (isPending || isUsed) ? '' : `<button class="copy-coupon-btn" data-code="${escapeHtmlCoupon(c.coupon)}" title="Copy">📋</button>`;
        const rowStyle = isPending ? ' style="opacity:0.6;"' : isUsed ? ' style="opacity:0.5;"' : '';
        const usedOnCell = isUsed && c.usedOn
            ? `<span style="font-size:0.7rem;color:var(--success);font-style:italic;">used ${c.usedOn}</span>`
            : '';
        return `<tr${rowStyle}>
            <td style="font-weight:600;color:var(--text-primary);">${escapeHtmlCoupon(c.category)}</td>
            <td style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${escapeHtmlCoupon(formatCouponDate(c.dateStr))}</td>
            <td style="font-size:0.8rem;">${escapeHtmlCoupon(c.booking)}</td>
            <td>${couponCell}${usedOnCell ? '<br>' + usedOnCell : ''}</td>
            <td style="white-space:nowrap;">${copyBtn}${actionBtn}</td>
        </tr>`;
    }

    const activeCount = active.filter(c => c.coupon).length;
    const pendingCount = active.filter(c => !c.coupon).length;
    let countText = `🎫 ${activeCount} coupon${activeCount !== 1 ? 's' : ''}`;
    if (pendingCount > 0) countText += ` + ${pendingCount} pending`;
    document.getElementById('couponCount').textContent = countText;

    let html = active.map(c => buildRow(c, false)).join('');

    if (used.length > 0) {
        html += `<tr><td colspan="5" style="padding:12px 0 6px;border:none;">
            <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">
                ✅ Used (${used.length})
            </div>
        </td></tr>`;
        html += used.map(c => buildRow(c, true)).join('');
    }

    tbody.innerHTML = html;
    results.style.display = 'block';
}

function showCouponError(msg) {
    const error = document.getElementById('couponError');
    error.textContent = '❌ ' + msg;
    error.style.display = 'block';
}

function escapeHtmlCoupon(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ============================
// 📋 EVENTS
// ============================

couponBtn.addEventListener('click', showCouponModal);
couponModalClose.addEventListener('click', hideCouponModal);
couponModal.addEventListener('click', e => { if (e.target === couponModal) hideCouponModal(); });

// Save Client ID
document.getElementById('saveClientIdBtn').addEventListener('click', () => {
    const input = document.getElementById('gmailClientIdInput');
    const val = input.value.trim();
    if (!val || !val.includes('.apps.googleusercontent.com')) {
        showCouponError('Invalid Client ID. It should end with .apps.googleusercontent.com');
        return;
    }
    saveGmailClientId(val);
    updateCouponUI();
    if (typeof showToast === 'function') showToast('💾 Client ID saved!');
});

// Show setup section
document.getElementById('setupClientIdBtn').addEventListener('click', () => {
    const setup = document.getElementById('couponSetupSection');
    setup.style.display = setup.style.display === 'none' ? 'block' : 'none';
});

gmailLoginBtn.addEventListener('click', startGmailLogin);

fetchCouponsBtn.addEventListener('click', () => fetchCoupons(false));
document.getElementById('fullRefreshBtn').addEventListener('click', () => fetchCoupons(true));

gmailLogoutBtn.addEventListener('click', () => {
    clearGmailToken();
    updateCouponUI();
    document.getElementById('couponResults').style.display = 'none';
    document.getElementById('couponEmpty').style.display = 'none';
    document.getElementById('couponLoading').style.display = 'none';
    if (typeof showToast === 'function') showToast('📧 Gmail disconnected.');
});

// Copy coupon code + Mark used / Unmark used
document.getElementById('couponTableBody').addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-coupon-btn');
    if (copyBtn) {
        navigator.clipboard.writeText(copyBtn.dataset.code).then(() => {
            copyBtn.textContent = '✅';
            if (typeof showToast === 'function') showToast('📋 Coupon copied!');
            setTimeout(() => copyBtn.textContent = '📋', 1200);
        });
        return;
    }
    const markBtn = e.target.closest('.mark-used-btn');
    if (markBtn) {
        const bookingId = markBtn.dataset.booking;
        const couponData = lastFetchedCoupons.find(c => c.booking === bookingId);
        if (couponData) {
            markCouponUsed(bookingId, couponData);
            renderCouponTable(lastFetchedCoupons);
            if (typeof showToast === 'function') showToast('✅ Marked as used');
        }
        return;
    }
    const unmarkBtn = e.target.closest('.unmark-used-btn');
    if (unmarkBtn) {
        unmarkCouponUsed(unmarkBtn.dataset.booking);
        renderCouponTable(lastFetchedCoupons);
        if (typeof showToast === 'function') showToast('↩️ Moved back to active');
    }
});

// ============================
// 🚀 INIT — Check OAuth callback
// ============================
handleOAuthCallback();
