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
const COUPON_RANGE_KEY = 'cardvault_coupon_range';
const FETCH_RANGE_KEY = 'cardvault_fetch_range';

function getSelectedMonths() {
    return parseInt(localStorage.getItem(COUPON_RANGE_KEY) || '1');
}

function setSelectedMonths(m) {
    localStorage.setItem(COUPON_RANGE_KEY, String(m));
}

function getFetchRangeMonths() {
    return parseInt(localStorage.getItem(FETCH_RANGE_KEY) || '1');
}

function setFetchRangeMonths(m) {
    localStorage.setItem(FETCH_RANGE_KEY, String(m));
}

// ============================
// ✅ USED COUPONS (localStorage)
// ============================

function getUsedCoupons() {
    try {
        const raw = localStorage.getItem(USED_COUPONS_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw);
        // Auto-cleanup: remove entries older than 1 year
        const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
        let changed = false;
        for (const bookingId in data) {
            if (data[bookingId].usedAt < oneYearAgo) {
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
            // Auto-switch to coupons tab
            setTimeout(() => {
                const couponTabBtn = document.querySelector('.tab-btn[data-tab="coupons"]');
                if (couponTabBtn) couponTabBtn.click();
                initCouponsTab();
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
    // Gmail supports after:EPOCH_SECONDS for precise time filtering
    let afterParam;
    if (afterTimestamp) {
        afterParam = Math.floor(afterTimestamp / 1000);
    } else {
        const months = getFetchRangeMonths();
        if (months === 0) {
            // "All" — no date filter
            afterParam = 0;
        } else {
            const rangeStart = new Date();
            rangeStart.setMonth(rangeStart.getMonth() - months);
            afterParam = Math.floor(rangeStart.getTime() / 1000);
        }
    }

    const afterFilter = afterParam > 0 ? ` after:${afterParam}` : '';
    const query = encodeURIComponent(`from:(rupay@truztee.com OR rupay@golftripz.com) subject:"Booking ID"${afterFilter}`);
    
    // Paginate through all results (Gmail max 200 per page, supports nextPageToken)
    let allMessages = [];
    let pageToken = null;
    let page = 0;
    do {
        page++;
        let url = `messages?q=${query}&maxResults=200`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        const result = await gmailFetch(url, token);
        const msgs = result.messages || [];
        allMessages = allMessages.concat(msgs);
        pageToken = result.nextPageToken || null;
    } while (pageToken && page < 10); // Safety cap: max 10 pages = 2000 emails

    return { messages: allMessages };
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

// Format timestamp (ms) → "16th Mar, 8:30 PM"
function formatTimestampDate(ts, includeTime) {
    if (!ts) return '—';
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const suffix = (day === 1 || day === 21 || day === 31) ? 'st'
        : (day === 2 || day === 22) ? 'nd'
        : (day === 3 || day === 23) ? 'rd' : 'th';
    const yr = "'" + String(d.getFullYear()).slice(-2);
    let result = `${day}${suffix} ${month} ${yr}`;
    if (includeTime) {
        let h = d.getHours(), ampm = 'AM';
        if (h >= 12) { ampm = 'PM'; if (h > 12) h -= 12; }
        if (h === 0) h = 12;
        const m = String(d.getMinutes()).padStart(2, '0');
        result += `, ${h}:${m} ${ampm}`;
    }
    return result;
}

// Parse "16-Mar-2026" or "16-Mar-26" → Date object (for sorting)
function parseDateStr(dateStr) {
    if (!dateStr || dateStr === '—') return 0;
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const m = dateStr.match(/(\d{1,2})[- ](\w{3})[- ]?(\d{2,4})?/);
    if (!m) return 0;
    const day = parseInt(m[1]);
    const mon = months[m[2].toLowerCase()] ?? 0;
    let year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return new Date(year, mon, day).getTime();
}

// Format "16-Mar-2026" → "16th Mar '26"
function formatCouponDate(dateStr) {
    if (!dateStr || dateStr === '—') return '—';
    const parts = dateStr.match(/(\d{1,2})[- ](\w+)[- ]?(\d{2,4})?/);
    if (!parts) return dateStr;
    const day = parseInt(parts[1]);
    const month = parts[2];
    let yearStr = '';
    if (parts[3]) {
        let yr = parseInt(parts[3]);
        if (yr < 100) yr += 2000;
        yearStr = " '" + String(yr).slice(-2);
    }
    const suffix = (day === 1 || day === 21 || day === 31) ? 'st'
        : (day === 2 || day === 22) ? 'nd'
        : (day === 3 || day === 23) ? 'rd' : 'th';
    return `${day}${suffix} ${month}${yearStr}`;
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

    // Fallback to plain text parsing (reply emails often have coupon in body text)
    // This runs even if couponPending is true — because reply emails contain the actual code
    // in the body while the quoted original email says "will be sent in 24-48 hours"
    if (!coupon && body) {
        // FIRST: Try specific pin pattern (most reliable — e.g., "1007620045528921/pin:2794")
        const pinMatch = body.match(/(\d{8,}\/pin:\d+)/i);
        if (pinMatch) {
            coupon = pinMatch[1].trim();
            couponPending = false;
        }
        // SECOND: Try alphanumeric codes (at least 6 chars, no common words)
        if (!coupon) {
            // Find ALL "Coupon Code:" occurrences and pick the one with an actual code
            const allMatches = [...body.matchAll(/Coupon\s*Code\s*[:\-]\s*([^\n\r]{1,60})/gi)];
            for (const m of allMatches) {
                const val = m[1].trim().split(/\s+/)[0]; // take first word/token
                if (val && val.length >= 5 && /[0-9]/.test(val) && !/will|sent|pending|hours|processing/i.test(val)) {
                    coupon = val;
                    couponPending = false;
                    break;
                }
            }
        }
    }

    // Fallback: extract category from body text if not found in HTML table
    if ((!category || category === '—') && body) {
        const spMatch = body.match(/Service\s*Provider\s*[:\-]\s*(.+)/i);
        if (spMatch) {
            const sp = spMatch[1].trim().replace(/\s+/g, ' ');
            if (sp && sp.length > 1) category = sp;
        }
    }

    // Fallback: extract date from body text
    if ((!dateStr || dateStr === '—') && body) {
        const dateMatch = body.match(/Date\s*(?:of\s*Issue)?\s*[:\-]\s*(\d{1,2}[\-\s]\w{3}[\-\s]\d{2,4})/i);
        if (dateMatch) dateStr = dateMatch[1].trim();
    }

    // Clean up coupon
    if (coupon) coupon = coupon.replace(/^[:\-\s]+|[:\-\s]+$/g, '');
    if (coupon && coupon.length < 3) coupon = null;

    return { booking, coupon, category, dateStr, couponPending };
}

// ============================
// 🎨 UI
// ============================

const gmailLoginBtn = document.getElementById('gmailLoginBtn');
const fetchCouponsBtn = document.getElementById('fetchCouponsBtn');
const gmailLogoutBtn = document.getElementById('gmailLogoutBtn');

function initCouponsTab() {
    updateCouponUI();
    // Show cached coupons from localStorage
    const cached = loadCachedCoupons();
    if (cached.length > 0) {
        lastFetchedCoupons = cached;
        renderCouponTable(cached);
    }
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
        const ago = formatTimestampDate(lastFetch, true);
        progressDetail.textContent = `Incremental since ${ago}`;
    } else {
        const fetchMonths = getFetchRangeMonths();
        if (fetchMonths === 0) {
            progressDetail.textContent = 'Full scan — all time';
        } else {
            const rangeDate = new Date();
            rangeDate.setMonth(rangeDate.getMonth() - fetchMonths);
            const rangeStr = rangeDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            progressDetail.textContent = `Full scan — since ${rangeStr} (${fetchMonths}M)`;
        }
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
        const BATCH_SIZE = 5; // Fetch 5 emails in parallel (~5x faster)
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const batch = messages.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(async (msg) => {
                    const { subject, body, rawHtml } = await getEmailBody(msg.id, token);
                    return parseCoupon(subject, body, rawHtml);
                })
            );
            for (const r of results) {
                if (r.status === 'fulfilled') allParsed.push(r.value);
            }
            // Update progress after each batch
            const done = Math.min(i + BATCH_SIZE, messages.length);
            const pct = 5 + Math.round((done / messages.length) * 90);
            const last = results.findLast(r => r.status === 'fulfilled');
            const lastParsed = last?.value;
            const dateInfo = lastParsed?.dateStr && lastParsed.dateStr !== '—' ? formatCouponDate(lastParsed.dateStr) : '';
            const catInfo = lastParsed?.category && lastParsed.category !== '—' ? lastParsed.category : '';
            updateProgress(progressBar, progressText, progressDetail, pct,
                `📨 ${done} / ${messages.length} ${label}`,
                [catInfo, dateInfo].filter(Boolean).join(' · '));
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

        // Sort by date descending (latest on top)
        coupons.sort((a, b) => {
            const da = parseDateStr(a.dateStr);
            const db = parseDateStr(b.dateStr);
            return db - da; // descending
        });

        // Small delay to let user see 100%
        await new Promise(r => setTimeout(r, 300));
        loading.style.display = 'none';

        if (coupons.length === 0) {
            empty.style.display = 'block';
            return;
        }

        // Auto-mark coupons older than 2 months as used
        const twoMonthsAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
        const usedCoupons = getUsedCoupons();
        let autoMarkedCount = 0;
        for (const c of coupons) {
            if (c.coupon && !usedCoupons[c.booking]) {
                const couponDate = parseDateStr(c.dateStr);
                if (couponDate > 0 && couponDate < twoMonthsAgo) {
                    markCouponUsed(c.booking, c);
                    autoMarkedCount++;
                }
            }
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

    // Sort all coupons by date descending (latest on top)
    const sorted = [...coupons].sort((a, b) => parseDateStr(b.dateStr) - parseDateStr(a.dateStr));

    // Split into active and used (attach usedOn date)
    const active = sorted.filter(c => !usedCoupons[c.booking]);
    const used = sorted.filter(c => usedCoupons[c.booking]).map(c => ({
        ...c,
        _usedAt: usedCoupons[c.booking].usedAt,
        usedOn: formatTimestampDate(usedCoupons[c.booking].usedAt)
    }));

    function buildRow(c, isUsed) {
        const isPending = !c.coupon;
        const couponColor = isPending ? '#c89a20' : isUsed ? '#e05070' : '#00d26a';
        const couponCell = isPending
            ? `<span style="color:#c89a20;font-style:italic;font-weight:600;font-size:0.85rem;">⏳ Pending</span>`
            : `<code style="color:${couponColor};font-weight:700;font-size:0.95rem;letter-spacing:1px;background:${isUsed ? 'rgba(224,80,112,0.1)' : 'rgba(0,210,106,0.1)'};padding:3px 8px;border-radius:4px;">${escapeHtmlCoupon(c.coupon)}</code>`;
        const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const couponAge = parseDateStr(c.dateStr);
        const isOlderThan1Month = couponAge > 0 && couponAge < oneMonthAgo;
        const pendingAction = (isPending && !isUsed && isOlderThan1Month)
            ? `<button class="coupon-action-btn mark-used-btn" data-booking="${escapeHtmlCoupon(c.booking)}" title="Mark as not available" style="font-size:0.7rem;">❌ N/A</button>`
            : '';
        const actionBtn = isPending ? pendingAction : isUsed
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
        // Filter used coupons by coupon date (date of issue), not when marked
        const selectedMonths = getSelectedMonths();
        let filteredUsed;
        if (selectedMonths === 0) {
            filteredUsed = used; // Show all
        } else {
            const rangeMs = selectedMonths * 30 * 24 * 60 * 60 * 1000;
            const cutoff = Date.now() - rangeMs;
            filteredUsed = used.filter(c => {
                const couponDate = parseDateStr(c.dateStr);
                return couponDate >= cutoff;
            });
        }

        const rangeOptions = [1,3,6,12,0];
        const rangeBtns = rangeOptions.map(m =>
            `<button class="range-btn ${m === selectedMonths ? 'active' : ''}" data-months="${m}">${m === 0 ? 'All' : m + 'M'}</button>`
        ).join('');

        html += `<tr><td colspan="5" style="padding:12px 0 6px;border:none;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">
                    ✅ Used (${filteredUsed.length})
                </span>
                <div style="display:flex;gap:4px;">${rangeBtns}</div>
            </div>
        </td></tr>`;
        html += filteredUsed.map(c => buildRow(c, true)).join('');
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
    // Range button clicks (inside Used heading)
    const rangeBtn = e.target.closest('.range-btn');
    if (rangeBtn) {
        const months = parseInt(rangeBtn.dataset.months);
        setSelectedMonths(months);
        renderCouponTable(lastFetchedCoupons);
        return;
    }
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


// Fetch range ⚙️ dropdown toggle
const fetchRangeDropdown = document.getElementById('fetchRangeDropdown');
document.getElementById('fetchRangeToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    fetchRangeDropdown.style.display = fetchRangeDropdown.style.display === 'none' ? 'block' : 'none';
});
// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('#fetchRangeDropdown') && !e.target.closest('#fetchRangeToggle')) {
        fetchRangeDropdown.style.display = 'none';
    }
});
// Fetch range button clicks inside dropdown
fetchRangeDropdown.addEventListener('click', (e) => {
    const btn = e.target.closest('.fetch-range-btn');
    if (!btn) return;
    const months = parseInt(btn.dataset.months);
    setFetchRangeMonths(months);
    fetchRangeDropdown.querySelectorAll('.fetch-range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.removeItem(LAST_FETCH_TIME_KEY);
    fetchRangeDropdown.style.display = 'none';
});

// ============================
// 📊 ANALYTICS
// ============================

// Category → worth mapping (case-insensitive matching)
const COUPON_WORTH = {
    'lakme': 1500,
    'uber': 100,
    'hotstar': 1500,
    'disney': 1500,
    'prime': 1500,
    'amazon prime': 1500,
    'zee5': 1500,
    'sonyliv': 1500,
    'sony liv': 1500,
    'thyrocare': 1500,
    'srl': 1500,
    'srl diagnostic': 1500,
    'apollo pharmacy': 250,
    'apollo': 250,
    'kalyan': 2000,
    'kalyan jewellers': 2000,
    'decathlon': 500,
    'cult.fit': 1200,
    'cultfit': 1200,
    'cult': 1200,
    'myntra': 500,
    'nykaa': 500,
    'bigbasket': 250,
    'big basket': 250,
    'jockey': 250,
    'swiggy': 250,
    'tata cliq': 500,
    'tatacliq': 500,
    'reliance digital': 500,
    'blinkit': 250,
};

function getCouponWorth(category) {
    if (!category || category === '—') return 0;
    const cat = category.toLowerCase().trim();
    // Exact match first
    if (COUPON_WORTH[cat] !== undefined) return COUPON_WORTH[cat];
    // Partial match
    for (const [key, val] of Object.entries(COUPON_WORTH)) {
        if (cat.includes(key) || key.includes(cat)) return val;
    }
    return 0;
}

function formatIndian(num) {
    const n = String(num).replace(/\D/g, '');
    if (!n) return '0';
    const last3 = n.slice(-3);
    const rest = n.slice(0, -3);
    if (!rest) return last3;
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

function showAnalyticsModal() {
    const modal = document.getElementById('analyticsModal');
    modal.style.display = 'flex';
    // Default range: earliest coupon → today
    const allCoupons = lastFetchedCoupons || [];
    if (allCoupons.length > 0) {
        const dates = allCoupons.map(c => parseDateStr(c.dateStr)).filter(d => d > 0);
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date();
        document.getElementById('analyticsFrom').value = minDate.toISOString().split('T')[0];
        document.getElementById('analyticsTo').value = maxDate.toISOString().split('T')[0];
        runAnalytics();
    }
}

function runAnalytics() {
    const fromDate = new Date(document.getElementById('analyticsFrom').value);
    const toDate = new Date(document.getElementById('analyticsTo').value);
    toDate.setHours(23, 59, 59, 999);
    const allCoupons = lastFetchedCoupons || [];
    const content = document.getElementById('analyticsContent');

    if (isNaN(fromDate) || isNaN(toDate)) {
        content.innerHTML = '<p style="color:var(--accent);text-align:center;">❌ Invalid date range</p>';
        return;
    }

    // Filter coupons in date range (only those with actual coupon codes)
    const filtered = allCoupons.filter(c => {
        const d = parseDateStr(c.dateStr);
        return d >= fromDate.getTime() && d <= toDate.getTime() && c.coupon;
    });

    if (filtered.length === 0) {
        content.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem 0;">No coupons found in this date range.</p>';
        return;
    }

    // Group by category
    const catMap = {};
    let totalWorth = 0;
    for (const c of filtered) {
        const cat = c.category && c.category !== '—' ? c.category : 'Unknown';
        if (!catMap[cat]) catMap[cat] = { count: 0, worth: 0 };
        catMap[cat].count++;
        const worth = getCouponWorth(cat);
        catMap[cat].worth += worth;
        totalWorth += worth;
    }

    // Sort by worth desc, then count desc
    const categories = Object.entries(catMap).sort((a, b) => b[1].worth - a[1].worth || b[1].count - a[1].count);

    // Build summary cards
    let html = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.8rem;margin-bottom:1.2rem;">
            <div class="analytics-card">
                <div class="analytics-label">Total Coupons</div>
                <div class="analytics-value" style="color:var(--accent);">${filtered.length}</div>
            </div>
            <div class="analytics-card">
                <div class="analytics-label">Categories</div>
                <div class="analytics-value" style="color:var(--gold);">${categories.length}</div>
            </div>
            <div class="analytics-card">
                <div class="analytics-label">Total Worth</div>
                <div class="analytics-value" style="color:var(--success);">₹${formatIndian(totalWorth)}</div>
            </div>
        </div>
    `;

    // Category breakdown table
    html += `<table class="coupon-table" style="font-size:0.85rem;">
        <thead><tr>
            <th>Category</th>
            <th style="text-align:center;">Count</th>
            <th style="text-align:right;">Unit</th>
            <th style="text-align:right;">Total</th>
        </tr></thead><tbody>`;

    for (const [cat, data] of categories) {
        const unitWorth = getCouponWorth(cat);
        const unitStr = unitWorth > 0 ? `₹${formatIndian(unitWorth)}` : '<span style="color:var(--text-muted);">—</span>';
        const totalStr = data.worth > 0 ? `₹${formatIndian(data.worth)}` : '<span style="color:var(--text-muted);">—</span>';
        html += `<tr>
            <td style="font-weight:600;color:var(--text-primary);">${escapeHtmlCoupon(cat)}</td>
            <td style="text-align:center;">${data.count}</td>
            <td style="text-align:right;font-size:0.8rem;">${unitStr}</td>
            <td style="text-align:right;font-weight:700;color:var(--success);">${totalStr}</td>
        </tr>`;
    }

    html += `<tr style="border-top:2px solid var(--border);">
        <td style="font-weight:800;color:var(--text-primary);">Total</td>
        <td style="text-align:center;font-weight:700;">${filtered.length}</td>
        <td></td>
        <td style="text-align:right;font-weight:800;color:var(--gold);font-size:1rem;">₹${formatIndian(totalWorth)}</td>
    </tr>`;
    html += '</tbody></table>';

    // Unknown worth notice
    const unknownCats = categories.filter(([cat]) => getCouponWorth(cat) === 0);
    if (unknownCats.length > 0) {
        html += `<p style="font-size:0.7rem;color:var(--text-muted);margin-top:0.8rem;">⚠️ Worth not mapped for: ${unknownCats.map(([c]) => c).join(', ')}</p>`;
    }

    content.innerHTML = html;
}

// Analytics modal events
document.getElementById('analyticsBtn').addEventListener('click', showAnalyticsModal);
document.getElementById('analyticsClose').addEventListener('click', () => {
    document.getElementById('analyticsModal').style.display = 'none';
});
document.getElementById('analyticsModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('analyticsModal')) document.getElementById('analyticsModal').style.display = 'none';
});
document.getElementById('analyticsApply').addEventListener('click', runAnalytics);

// ============================
// 🚀 INIT
// ============================
handleOAuthCallback();
initCouponsTab();
// Restore fetch range button from localStorage
(function restoreFetchRange() {
    const saved = getFetchRangeMonths();
    const btn = document.querySelector(`.fetch-range-btn[data-months="${saved}"]`);
    if (btn) {
        document.querySelectorAll('.fetch-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
})();
