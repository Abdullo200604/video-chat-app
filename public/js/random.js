/**
 * ════════════════════════════════════════════════════════
 *  PDP Chat — Random Page Frontend Logic
 *  File: public/js/random.js
 * ════════════════════════════════════════════════════════
 */

// ── Socket ─────────────────────────────────────────────
const socket = io('/');

// ── State ──────────────────────────────────────────────
let activeMode = null;   // 'private' | 'public'
let isSearching = false;
let myName = sessionStorage.getItem('pdp_name') || '';
let selectedTags = new Set();
let pendingJoinId = null;   // for password-protected rooms
let onlineCount = 1;

// ── DOM helpers ────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = el => el && (el.style.display = '');
const hide = el => el && (el.style.display = 'none');

// ── Boot ───────────────────────────────────────────────
(async () => {
    // Try to auto-fill name from Google session
    try {
        const res = await fetch('/api/user');
        const user = await res.json();
        if (user && user.name) myName = user.name;
    } catch (_) { }

    // Kick off room list polling for public section
    socket.emit('random:list_rooms');

    // Simulate a basic online counter (real value comes from admin API)
    fetchOnlineCount();
    setInterval(fetchOnlineCount, 12000);
})();

async function fetchOnlineCount() {
    try {
        const res = await fetch('/api/admin/dashboard', {
            headers: { 'x-admin-token': localStorage.getItem('pdp_admin_token') || '' }
        }).catch(() => null);
        if (res && res.ok) {
            const data = await res.json();
            onlineCount = data.onlineUsers || onlineCount;
        }
    } catch (_) { }
    const el = $('onlineCount');
    if (el) el.textContent = onlineCount;
}

// ── Mode switching ─────────────────────────────────────
function switchMode(mode) {
    activeMode = mode;

    // Update cards
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
    const activeCard = mode === 'private' ? $('privateCard') : $('publicCard');
    (activeCard || document.querySelector('.mode-card')).classList.add('active');

    // Show/hide sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    if (mode === 'private') $('privateSection').classList.add('active');
    if (mode === 'public') $('publicSection').classList.add('active');

    if (mode === 'public') socket.emit('random:list_rooms');
}

// ── Tags ───────────────────────────────────────────────
function toggleTag(el, tag) {
    if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
        el.classList.remove('selected');
    } else {
        selectedTags.add(tag);
        el.classList.add('selected');
    }
}

// ── Matchmaking ────────────────────────────────────────
function startSearch() {
    if (!myName) {
        myName = prompt('Ismingizni kiriting:') || 'Mehmon';
        sessionStorage.setItem('pdp_name', myName);
    }
    isSearching = true;
    $('idleState').style.display = 'none';
    $('searchingState').style.display = 'flex';
    $('matchFoundState').style.display = 'none';

    const dots = $('searchDots');
    if (dots) startDotAnimation(dots);

    socket.emit('random:join_queue', {
        name: myName,
        interests: Array.from(selectedTags)
    });
}

function cancelSearch() {
    isSearching = false;
    socket.emit('random:leave_queue');
    $('searchingState').style.display = 'none';
    $('idleState').style.display = 'block';
    showToast('Qidiruv bekor qilindi.', 'warning');
}

function nextPartner() {
    $('matchFoundState').style.display = 'none';
    $('searchingState').style.display = 'flex';
    $('idleState').style.display = 'none';

    socket.emit('random:next_partner', {
        name: myName,
        interests: Array.from(selectedTags)
    });
}

// ── Dot animating for "Searching..." ──────────────────
function startDotAnimation(el) {
    let count = 0;
    const timer = setInterval(() => {
        if (!isSearching) { clearInterval(timer); el.textContent = '...'; return; }
        el.textContent = '.'.repeat((count++ % 3) + 1);
    }, 500);
}

// ── Socket — matchmaking events ────────────────────────
socket.on('random:match_found', ({ roomId, partnerName, link }) => {
    isSearching = false;
    $('searchingState').style.display = 'none';
    $('idleState').style.display = 'none';
    $('matchFoundState').style.display = 'flex';

    const nameEl = $('partnerNameDisplay');
    if (nameEl) nameEl.textContent = partnerName;

    showToast(`🎉 Hamkor topildi: ${partnerName}!`, 'success');

    // Auto-redirect after 2s
    setTimeout(() => { window.location.href = link; }, 2000);
});

socket.on('random:waiting', ({ queueSize }) => {
    const sub = $('searchSub');
    if (sub) sub.textContent = `${queueSize} kishi kutmoqda...`;
});

socket.on('random:rate_limited', ({ message, waitSeconds }) => {
    showToast(`⚠️ ${message}`, 'warning');
    isSearching = false;
    $('searchingState').style.display = 'none';
    $('idleState').style.display = 'block';
});

socket.on('random:queue_left', () => { });
socket.on('random:already_in_queue', () => {
    showToast('Siz allaqachon qidiruv navbatidasiz.', 'warning');
});

// ── PUBLIC ROOMS ───────────────────────────────────────
socket.on('random:room_list_update', rooms => {
    renderRoomList(rooms);
});

socket.on('random:room_created', ({ roomId, link }) => {
    closeModal();
    showToast('✅ Xona yaratildi! Yo\'naltirilmoqda...', 'success');
    setTimeout(() => { window.location.href = link; }, 1200);
});

socket.on('random:join_approved', ({ link }) => {
    closePwModal();
    showToast('✅ Ulashtirilmoqda...', 'success');
    setTimeout(() => { window.location.href = link; }, 1000);
});

socket.on('random:join_error', ({ message }) => {
    showToast(`❌ ${message}`, 'error');
});

socket.on('random:report_received', () => {
    showToast('Xabaringiz qabul qilindi. Rahmat!', 'success');
});

// ── RENDER ROOM LIST ───────────────────────────────────
function renderRoomList(rooms) {
    const container = $('roomsList');
    if (!container) return;

    if (!rooms || rooms.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🏠</div>
            <p>Hali hech qanday umumiy xona yor'q.<br>
               Birinchi bo'lib yarating!</p>
          </div>`;
        return;
    }

    container.innerHTML = rooms.map(r => {
        const pct = Math.round((r.participantCount / r.maxParticipants) * 100);
        const barCls = pct >= 100 ? 'full' : pct >= 70 ? 'warn' : '';
        const emoji = ['🌐', '💬', '🎮', '🎨', '🧠', '🚀'][Math.abs(hashCode(r.roomId)) % 6];

        return `
        <div class="room-card" id="rc-${r.roomId}">
            <div class="room-icon">${emoji}</div>
            <div class="room-info">
                <div class="room-name">${escHtml(r.name)}</div>
                <div class="room-meta">
                    <span>👥 ${r.participantCount}/${r.maxParticipants}</span>
                    ${r.hasPassword ? '<span class="room-locked">🔒 Maxfiy</span>' : ''}
                    <span>by ${escHtml(r.createdBy)}</span>
                </div>
                <div class="capacity-bar">
                    <div class="capacity-fill ${barCls}" style="width:${Math.min(pct, 100)}%"></div>
                </div>
            </div>
            <div class="room-actions">
                <button class="btn-primary" style="padding:10px 18px; font-size:13px;"
                    onclick="joinPublicRoom('${r.roomId}', ${r.hasPassword})">
                    ➜ Kirish
                </button>
            </div>
        </div>`;
    }).join('');
}

// ── JOIN PUBLIC ROOM ───────────────────────────────────
function joinPublicRoom(roomId, needsPassword) {
    if (needsPassword) {
        pendingJoinId = roomId;
        openPwModal();
    } else {
        socket.emit('random:join_public_room', { roomId, password: '' });
    }
}

function confirmPwJoin() {
    const pw = $('pwInput').value.trim();
    socket.emit('random:join_public_room', { roomId: pendingJoinId, password: pw });
}

// ── CREATE ROOM MODAL ──────────────────────────────────
function openModal() {
    $('createModal').classList.add('open');
}
function closeModal() {
    $('createModal').classList.remove('open');
}
function openPwModal() {
    $('pwModal').classList.add('open');
    setTimeout(() => $('pwInput').focus(), 200);
}
function closePwModal() {
    $('pwModal').classList.remove('open');
    $('pwInput').value = '';
    pendingJoinId = null;
}

function createRoom() {
    const name = $('newRoomName').value.trim() || 'Mening Xonam';
    const maxP = $('newRoomMax').value || 10;
    const pw = $('newRoomPw').value.trim();
    const creator = myName || 'Mehmon';

    socket.emit('random:create_room', {
        name, maxParticipants: parseInt(maxP), password: pw, createdBy: creator
    });
}

// ── REPORT ─────────────────────────────────────────────
function reportUser(partnerId, reason) {
    socket.emit('random:report_user', { reportedId: partnerId, reason });
}

// ── UTILITIES ──────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hashCode(str) {
    let h = 0;
    for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return h;
}

// ── TOAST ──────────────────────────────────────────────
function showToast(msg, type = '') {
    const c = $('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ── Keyboard shortcuts ─────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeModal();
        closePwModal();
    }
});
