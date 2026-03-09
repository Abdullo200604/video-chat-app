// ════════════════════════════════════════════════
// PDP CHAT MEETING ROOM – CLIENT SCRIPT
// ════════════════════════════════════════════════

// ── Config ──────────────────────────────────────
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

// ── State ────────────────────────────────────────
const socket = io('/');
const isProd = location.protocol === 'https:';
const myPeer = new Peer(undefined, {
    path: '/peerjs',
    host: '/',
    port: isProd ? 443 : (window.location.port || 80),
    secure: isProd,
    config: ICE_SERVERS
});
const peers = {};           // { peerId: call }
const tiles = {};           // { peerId: tileEl }
const streams = {};           // { peerId: stream }
let myStream;
let screenStream = null;
let myPeerId = null;
let myName = sessionStorage.getItem('pdp_name') || 'Mehmon';
let isHost = false;
let isHandRaised = false;
let theaterActive = false;
let focusActive = false;
let chatOpen = false;
let unread = 0;
let micOn = sessionStorage.getItem('pdp_mic') !== 'false';
let camOn = sessionStorage.getItem('pdp_cam') !== 'false';
let currentEffect = 'none';
let permissions = { screenShare: true, reactions: true, participantMic: true, participantCamera: true };
let chatEnabled = true;
let participants = {};
let persistentId = localStorage.getItem('pdp_user_id');
if (!persistentId) {
    persistentId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('pdp_user_id', persistentId);
}
let myRole = 'player'; // player | spectator
let activeGame = null;

const effectFilters = {
    none: '',
    blur: 'blur(5px)',
    grayscale: 'grayscale(100%)',
    sepia: 'sepia(100%)',
    invert: 'invert(100%)',
    warm: 'saturate(150%) sepia(40%) brightness(105%)'
};

// ── DOM refs ─────────────────────────────────────
const videoGrid = document.getElementById('videoGrid');

// ── INIT ────────────────────────────────────────
(async () => {
    document.getElementById('meetingCodeText').textContent = ROOM_ID;
    // Initial timer will be updated by room-state

    try {
        const savedCam = sessionStorage.getItem('pdp_cam_id');
        const savedMic = sessionStorage.getItem('pdp_mic_id');
        const constraints = {
            video: camOn ? (savedCam ? { deviceId: { exact: savedCam } } : true) : false,
            audio: savedMic ? { deviceId: { exact: savedMic } } : true
        };
        myStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!micOn) myStream.getAudioTracks().forEach(t => t.enabled = false);
        if (!camOn) myStream.getVideoTracks().forEach(t => t.enabled = false);
    } catch (e) {
        // Fallback to default devices if specific IDs fail or unplugged
        try {
            myStream = await navigator.mediaDevices.getUserMedia({ video: camOn, audio: true });
            if (!micOn) myStream.getAudioTracks().forEach(t => t.enabled = false);
            if (!camOn) myStream.getVideoTracks().forEach(t => t.enabled = false);
        }
        catch (e2) { myStream = null; showToast('Qurilmaga kirish imkoni yo\'q'); }
    }

    // Load devices AFTER permission is granted (to see real device names)
    await loadDevices();

    if (myStream) addTile(myStream, 'me', myName, true);
})();

myPeer.on('open', id => {
    myPeerId = id;
    const status = { muted: !micOn, videoOff: !camOn, effect: currentEffect, persistentId };
    socket.emit('join-room', ROOM_ID, id, myName, status);
});

myPeer.on('call', call => {
    if (!myStream) return;
    call.answer(myStream);
    const vid = document.createElement('video');
    call.on('stream', s => {
        streams[call.peer] = s;
        addTile(s, call.peer, participants[call.peer]?.name || 'Mehmon', false);
    });
    call.on('close', () => removeTile(call.peer));
});

// ── Socket events ────────────────────────────────
socket.on('you-are-host', () => {
    isHost = true;
    document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
    updateParticipantsUI();
    // Update local tile for crown
    if (tiles['me']) {
        const nameEl = tiles['me'].querySelector('.tile-name');
        if (nameEl && !nameEl.innerHTML.includes('👑')) nameEl.innerHTML += ' 👑';
    }
    showToast('Siz bu majlisning mezboningizsiz 👑');
});
socket.on('new-host', peerId => {
    const wasHost = isHost;
    isHost = peerId === myPeerId;
    if (isHost) {
        document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
        if (!wasHost) showToast('Siz yangi mezbon bo\'ldingiz 👑');
    }
    updateParticipantsUI();
    // Sync crowns on tiles
    Object.entries(tiles).forEach(([uid, el]) => {
        const nameEl = el.querySelector('.tile-name');
        if (!nameEl) return;
        const name = uid === 'me' ? myName : (participants[uid]?.name || 'Mehmon');
        const roleStr = (uid === 'me' ? (isHost ? ' 👑' : '') : (uid === peerId ? ' 👑' : ''));
        nameEl.innerHTML = `${name}${uid === 'me' ? ' (Siz)' : ''}${roleStr}`;
    });
});
socket.on('room-state', state => {
    isHost = state.isHost;
    if (isHost) {
        document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
    }
    chatEnabled = state.chatEnabled;
    updateParticipantsUI();
    if (state.startTime) startTimer(state.startTime);
    syncEffects();

    // Spectator check
    const count = Object.keys(participants).length;
    // If more than 4 players, or if room is already full for specific games
    if (activeGame && count > 4) myRole = 'spectator';
    updateRoleUI();

    if (state.isPrivate) {
        initPrivateSession();
    }

    if (state.theaterMode) { theaterActive = true; enterTheaterUI(); }

    // Auto-launch game if suggested in URL (Host only)
    const urlParams = new URLSearchParams(window.location.search);
    const autoGame = urlParams.get('game');
    if (autoGame && isHost) {
        setTimeout(() => {
            if (activeGame !== autoGame) launchGame(autoGame);
        }, 1500);
    }
});

function initPrivateSession() {
    const badge = document.getElementById('privateBadge');
    if (badge) badge.classList.remove('hidden');

    initPrivacyWatermark();
    initPrivacyBlur();
    initPrivacyGuard();

    showToast('🛡️ Maxfiy suhbat rejasi faollashtirildi');
}

function initPrivacyWatermark() {
    const cont = document.getElementById('privacyWatermark');
    if (!cont) return;
    cont.classList.remove('hidden');

    // Create several moving layers
    for (let i = 0; i < 3; i++) {
        const span = document.createElement('span');
        span.className = 'watermark-text';
        span.textContent = `${myName} [${myPeerId.substring(0, 6)}]`;
        span.style.animationDelay = (i * 8) + 's';
        cont.appendChild(span);
    }
}

function initPrivacyBlur() {
    const overlay = document.getElementById('awayOverlay');
    if (!overlay) return;

    window.addEventListener('blur', () => {
        overlay.classList.remove('hidden');
    });

    overlay.onclick = () => overlay.classList.add('hidden');
}

function initPrivacyGuard() {
    // Block common screenshot/inspect keys
    window.addEventListener('keydown', e => {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && e.key === 'U') ||
            e.key === 'PrintScreen'
        ) {
            e.preventDefault();
            showToast('⚠️ Maxfiylik tizimi: Ushbu amal taqiqlangan', 4000);
            return false;
        }
    });

    window.addEventListener('contextmenu', e => {
        e.preventDefault();
    });
}
socket.on('user-connected', (uid, name) => {
    participants[uid] = { name: name || 'Mehmon' };
    setTimeout(() => callUser(uid), 1000);
    updateParticipantsUI();
    showToast(`${name || 'Mehmon'} qo'shildi`);
});
socket.on('user-disconnected', uid => {
    if (peers[uid]) { peers[uid].close(); delete peers[uid]; }
    removeTile(uid);
    delete participants[uid];
    updateParticipantsUI();
});
socket.on('participants-update', data => {
    participants = data;
    updateParticipantsUI();
    syncEffects();
});
socket.on('createMessage', msg => addChatMessage(msg));
socket.on('theater-mode-changed', on => {
    theaterActive = on;
    on ? enterTheaterUI() : exitTheaterUI();
});
socket.on('permissions-updated', perms => {
    Object.assign(permissions, perms);
    if (!permissions.participantMic && !isHost) forceMute();
    if (!permissions.participantCamera && !isHost) forceCamOff();
});
socket.on('force-kick', (msg) => {
    if (typeof msg === 'string') {
        showToast(`❌ ${msg}`, 5000);
        setTimeout(leaveMeeting, 2000);
    } else if (msg === myPeerId) {
        showToast('Mezbon sizi chiqardi.');
        setTimeout(leaveMeeting, 1500);
    }
});
socket.on('set-mic-state', ({ uid, on }) => {
    if (uid === myPeerId || uid === 'all') {
        if (micOn !== on) toggleMic();
        if (uid === 'all' && !on) showToast('Mezbon barchani ovozini o\'chirdi');
    }
});
socket.on('set-cam-state', ({ uid, on }) => { if (uid === myPeerId) { if (camOn !== on) toggleCam(); } });
socket.on('status-update', (data) => {
    // If someone else updated their status (like videoOff), refresh their tile
    updateParticipantsUI();
});
socket.on('user-raised-hand', (uid, name) => { showToast(`✋ ${name} qo'l ko'tardi`); markHandRaised(uid); });
socket.on('show-reaction', ({ uid, name, emoji }) => showFloatingReaction(emoji, name));
socket.on('host-pin-target', ({ targetId }) => {
    if (targetId) togglePin(targetId);
});
socket.on('join-request', ({ userId, name, socketId }) => {
    if (!isHost) return;
    const modal = document.getElementById('knockModal');
    const msg = document.getElementById('knockMsg');
    msg.textContent = `${name} majlisga kirishni so'ramoqda.`;
    modal.classList.remove('hidden');

    document.getElementById('admitBtn').onclick = () => {
        socket.emit('join-response', { targetSocketId: socketId, approved: true });
        modal.classList.add('hidden');
    };
    document.getElementById('denyBtn').onclick = () => {
        socket.emit('join-response', { targetSocketId: socketId, approved: false });
        modal.classList.add('hidden');
    };
});
socket.on('room-lock-status', (locked) => {
    showToast(locked ? '🔒 Majlis qulflandi' : '🔓 Majlis ochildi');
    const check = document.getElementById('lockRoomCheck');
    if (check) check.checked = locked;
});

// ── VIDEO TILES ──────────────────────────────────
function addTile(stream, peerId, name, isMe) {
    if (tiles[peerId]) return;

    const tile = document.createElement('div');
    tile.className = 'video-tile' + (isMe ? ' is-me' : '');
    tile.dataset.peer = peerId;

    const vid = document.createElement('video');
    vid.className = 'tile-video';
    vid.srcObject = stream;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.muted = isMe;
    vid.play().catch(() => { });

    const info = document.createElement('div');
    info.className = 'tile-info';
    const isRoomHost = isMe ? isHost : (participants[peerId]?.isHost || false); // Note: server should ideally pass this in participants
    // Simpler check for host crown on tile
    const crown = (isMe && isHost) ? ' 👑' : '';
    info.innerHTML = `<div class="tile-name">${name}${isMe ? ' (Siz)' : ''}${crown}</div>`;

    const avatar = document.createElement('div');
    avatar.className = 'tile-avatar';
    avatar.style.background = `linear-gradient(135deg, #1a73e8, #0d47a1)`;
    avatar.textContent = (name || 'M').charAt(0).toUpperCase();

    // ── Tile Controls (Pin, Fullscreen) ──
    const ctrls = document.createElement('div');
    ctrls.className = 'tile-controls';
    ctrls.innerHTML = `
        <button class="tile-ctrl-btn" onclick="togglePin('${peerId}')" title="Qadash">
            <i class="fas fa-thumbtack"></i>
        </button>
        <button class="tile-ctrl-btn" onclick="enterFocusMode('${peerId}')" title="Kattalashtirish">
            <i class="fas fa-expand"></i>
        </button>
    `;
    tile.appendChild(vid);
    tile.appendChild(avatar);
    tile.appendChild(info);
    tile.appendChild(ctrls);

    tile.addEventListener('dblclick', () => enterFocusMode(peerId));

    videoGrid.appendChild(tile);
    tiles[peerId] = tile;
    streams[peerId] = stream;

    // Initial visibility check
    const isVideoOff = isMe ? !camOn : !!participants[peerId]?.videoOff;
    vid.classList.toggle('hidden', isVideoOff);
    avatar.classList.toggle('hidden', !isVideoOff);

    updateGridCount();
    if (theaterActive) updateTheaterAvatars();
}

function togglePin(peerId) {
    const tile = tiles[peerId];
    if (!tile) return;

    const isPinned = tile.classList.contains('pinned');

    // Unpin all first
    Object.values(tiles).forEach(t => t.classList.remove('pinned'));

    if (!isPinned) {
        tile.classList.add('pinned');
        videoGrid.classList.add('has-pinned');
        showToast(`${participants[peerId]?.name || 'Ishtirokchi'} qadab qo'yildi`);
    } else {
        videoGrid.classList.remove('has-pinned');
        showToast('Qadash bekor qilindi');
    }

    // Update active speaker logic in theater if needed? Not for now.
}

function removeTile(peerId) {
    if (tiles[peerId]) {
        if (tiles[peerId].classList.contains('pinned')) {
            videoGrid.classList.remove('has-pinned');
        }
        tiles[peerId].remove();
        delete tiles[peerId];
    }
    if (streams[peerId]) delete streams[peerId];
    updateGridCount();
    if (theaterActive) updateTheaterAvatars();
}

function updateGridCount() {
    const n = videoGrid.children.length;
    const hasPinned = videoGrid.classList.contains('has-pinned');

    // Clean class list and set state
    videoGrid.classList.remove('count-1', 'count-2', 'count-3', 'count-many');

    if (hasPinned) {
        videoGrid.classList.add('has-pinned');
    } else {
        // Fallback for very small counts if needed, but CSS handles it
        if (n === 1) videoGrid.classList.add('count-1');
    }
}

// ── PEER CONNECTION ──────────────────────────────
function callUser(uid) {
    if (!myStream) return;
    const call = myPeer.call(uid, myStream);
    call.on('stream', s => {
        streams[uid] = s;
        addTile(s, uid, participants[uid]?.name || 'Mehmon', false);
    });
    call.on('close', () => removeTile(uid));
    peers[uid] = call;
}

// ── MIC / CAM ────────────────────────────────────
function toggleMic() {
    if (!myStream) return;
    if (!micOn && !isHost && !permissions.participantMic) { showToast('Mezbon mikrofonni bloklagan'); return; }
    micOn = !micOn;
    myStream.getAudioTracks().forEach(t => t.enabled = micOn);
    socket.emit('status-update', { muted: !micOn });
    updateCtrlState('micBtn', micOn, 'fa-microphone', 'fa-microphone-slash');
    updateCtrlState('t-micBtn', micOn, 'fa-microphone', 'fa-microphone-slash');
}

function toggleCam() {
    if (!myStream) return;
    if (!camOn && !isHost && !permissions.participantCamera) { showToast('Mezbon kamerani bloklagan'); return; }
    camOn = !camOn;
    myStream.getVideoTracks().forEach(t => t.enabled = camOn);
    socket.emit('status-update', { videoOff: !camOn });
    updateCtrlState('camBtn', camOn, 'fa-video', 'fa-video-slash');
    updateCtrlState('t-camBtn', camOn, 'fa-video', 'fa-video-slash');
}

function forceMute() { if (micOn) toggleMic(); }
function forceCamOff() { if (camOn) toggleCam(); }

function updateCtrlState(btnId, on, iconOn, iconOff) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.innerHTML = `<i class="fas ${on ? iconOn : iconOff}"></i><span>${btn.querySelector('span')?.textContent || ''}</span>`;
    btn.classList.toggle('off-state', !on);
}

// ── SCREEN SHARE ─────────────────────────────────
async function toggleScreenShare() {
    if (!isHost && !permissions.screenShare) { showToast('Mezbon ekran ulashishni bloklagan'); return; }
    const btn = document.getElementById('screenBtn');

    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
        // Restore camera
        const vid = myStream.getVideoTracks()[0];
        Object.values(peers).forEach(call => {
            const sender = call.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
            if (sender && vid) sender.replaceTrack(vid);
        });
        btn.classList.remove('active-panel');
        showToast('Ekran ulashish to\'xtatildi');
        return;
    }

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const track = screenStream.getVideoTracks()[0];
        Object.values(peers).forEach(call => {
            const sender = call.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(track);
        });
        // Update own tile
        if (tiles['me']) {
            const vid = tiles['me'].querySelector('video');
            if (vid) { vid.srcObject = screenStream; }
        }
        track.onended = () => toggleScreenShare();
        btn.classList.add('active-panel');
        showToast('Ekran ulashish boshlandi');
    } catch (e) { showToast('Ekran ulashish bekor qilindi'); }
}

// ── CHAT ─────────────────────────────────────────
function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !chatEnabled) return;
    socket.emit('message', text);
    input.value = '';
}
document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
});

function addChatMessage({ text, name, uid }) {
    const isMe = uid === myPeerId;
    const div = document.createElement('div');
    div.className = 'msg-item' + (isMe ? ' mine' : '');
    div.innerHTML = `<div class="msg-name">${name}</div><div>${text}</div>`;
    document.getElementById('chatMessages').appendChild(div);
    document.getElementById('chatMessages').scrollTop = 9999;

    if (!chatOpen) {
        unread++;
        const n = unread > 9 ? '9+' : unread;
        ['chatBadge', 't-chatBadge'].forEach(id => {
            const b = document.getElementById(id);
            if (b) { b.textContent = n; b.classList.add('show'); }
        });
    }
}

// ── PANELS ───────────────────────────────────────
const panels = { chat: 'chatPanel', participants: 'participantsPanel', host: 'hostPanel', settings: 'settingsPanel', effects: 'effectsPanel', games: 'gamesPanel' };

function togglePanel(name) {
    const el = document.getElementById(panels[name]);
    if (!el) return;
    const isOpen = el.classList.contains('open');

    // Close all
    Object.values(panels).forEach(id => document.getElementById(id)?.classList.remove('open'));
    Object.keys(panels).forEach(k => document.getElementById(k + 'Btn')?.classList.remove('active-panel'));

    if (!isOpen) {
        el.classList.add('open');
        const btn = document.getElementById(name + 'Btn') || document.getElementById('host' + (name === 'host' ? 'PanelBtn' : ''));
        btn?.classList.add('active-panel');
        if (name === 'settings') loadDevices();
    }

    if (name === 'chat') {
        chatOpen = !isOpen;
        if (chatOpen) {
            unread = 0;
            ['chatBadge', 't-chatBadge'].forEach(id => { const b = document.getElementById(id); if (b) { b.textContent = ''; b.classList.remove('show'); } });
            setTimeout(() => document.getElementById('chatInput').focus(), 350);
        }
    }
}

// ── EFFECTS ──────────────────────────────────────
function applyEffect(name) {
    currentEffect = name;
    if (tiles['me']) {
        const vid = tiles['me'].querySelector('video');
        if (vid) vid.style.filter = effectFilters[name];
    }
    socket.emit('status-update', { effect: name });
    document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
    const card = document.getElementById('effect-' + name);
    if (card) card.classList.add('active');
    showToast(`Effekt: ${name} qo'llanildi ✨`);
}

function syncEffects() {
    updateParticipantsUI(); // centralize
}

// ── HOSTS CONTROLS ───────────────────────────────
function updateSetting(key, val) { socket.emit('update-permissions', { [key]: val }); }
function updatePerm(key, val) { socket.emit('update-permissions', { [key]: val }); }
function toggleChatForAll(on) { socket.emit('toggle-chat', on); }

function hostMute(uid) {
    const isMuted = participants[uid]?.muted;
    socket.emit('host-set-mic', { targetId: uid, on: !!isMuted }); // Switch to opposite
}
function hostDisableCam(uid) {
    const isOff = participants[uid]?.videoOff;
    socket.emit('host-set-cam', { targetId: uid, on: !!isOff }); // Switch to opposite
}
function hostKick(uid) { socket.emit('host-kick-user', uid); }
function hostPinUser(uid) { socket.emit('host-set-pin', { targetId: uid }); }
function muteAllParticipants() { socket.emit('host-mute-all'); }
function toggleRoomLock(locked) { socket.emit('host-toggle-lock', locked); }

// ── PARTICIPANTS UI ───────────────────────────────
function updateParticipantsUI() {
    const list = document.getElementById('participantsList');
    const hList = document.getElementById('hostParticipantsList');
    const badge = document.getElementById('participantCount');
    const colors = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#15c1d7', '#8d16f8'];

    const entries = Object.entries(participants);
    if (badge) badge.textContent = entries.length;
    if (list) list.innerHTML = '';
    if (hList) hList.innerHTML = '';

    entries.forEach(([uid, info], i) => {
        const color = colors[i % colors.length];
        const initial = (info.name || 'M').charAt(0).toUpperCase();
        const isMe_ = uid === myPeerId;

        // --- Participant List Item ---
        const item = document.createElement('div');
        item.className = 'participant-item';
        item.innerHTML = `
            <div class="part-avatar" style="background:${color}">${initial}</div>
            <div class="part-name">${info.name}${isMe_ ? ' (Siz)' : ''}</div>
            <div class="part-status">
                <i class="fas ${info.muted ? 'fa-microphone-slash red' : 'fa-microphone'}"></i>
                <i class="fas ${info.videoOff ? 'fa-video-slash red' : 'fa-video'}"></i>
            </div>
        `;
        list?.appendChild(item);

        // --- Host Panel Item ---
        if (hList && !isMe_) {
            const hItem = document.createElement('div');
            hItem.className = 'host-part-item';
            hItem.innerHTML = `
                <div class="part-name">${info.name}</div>
                <div class="host-part-ctrls">
                    <button onclick="hostPinUser('${uid}')" title="Global qadash"><i class="fas fa-thumbtack"></i></button>
                    <button onclick="hostMute('${uid}')" class="${info.muted ? 'off' : ''}"><i class="fas ${info.muted ? 'fa-microphone-slash' : 'fa-microphone'}"></i></button>
                    <button onclick="hostDisableCam('${uid}')" class="${info.videoOff ? 'off' : ''}"><i class="fas ${info.videoOff ? 'fa-video-slash' : 'fa-video'}"></i></button>
                    <button onclick="hostKick('${uid}')" class="kick"><i class="fas fa-user-minus"></i></button>
                </div>
            `;
            hList.appendChild(hItem);
        }

        // Sync tile visibility & effect if state changed
        const tile = tiles[isMe_ ? 'me' : uid];
        if (tile) {
            const v = tile.querySelector('video');
            const a = tile.querySelector('.tile-avatar');
            if (v && a) {
                const off = isMe_ ? !camOn : !!info.videoOff;
                v.classList.toggle('hidden', off);
                a.classList.toggle('hidden', !off);

                // Sync effect
                const effect = isMe_ ? currentEffect : (info.effect || 'none');
                v.style.filter = effectFilters[effect] || '';
            }
        }

        if (list) {
            const item = document.createElement('div');
            item.className = 'participant-item';
            item.innerHTML = `
                <div class="p-avatar" style="background:${color}">${initial}</div>
                <div class="p-name">${info.name}${isMe_ ? ' (Siz)' : ''}</div>
                <div class="p-badges">
                    ${info.muted ? '<i class="fas fa-microphone-slash" title="Jim"></i>' : ''}
                    ${info.videoOff ? '<i class="fas fa-video-slash" title="Kamera o\'ch"></i>' : ''}
                </div>`;
            list.appendChild(item);
        }

        if (hList && isHost && !isMe_) {
            const item = document.createElement('div');
            item.className = 'host-participant-item';
            item.innerHTML = `
                <div class="p-avatar" style="background:${color};width:28px;height:28px;font-size:12px;">${initial}</div>
                <div class="p-name" style="font-size:13px;">${info.name}</div>
                <div class="host-p-actions">
                    <button class="host-action-btn ${info.muted ? 'off' : ''}" onclick="hostMute('${uid}')" title="${info.muted ? 'Ovozini yoqish' : 'Ovozini o\'chirish'}">
                        <i class="fas ${info.muted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>
                    </button>
                    <button class="host-action-btn ${info.videoOff ? 'off' : ''}" onclick="hostDisableCam('${uid}')" title="${info.videoOff ? 'Kamerasini yoqish' : 'Kamerasini o\'chirish'}">
                        <i class="fas ${info.videoOff ? 'fa-video-slash' : 'fa-video'}"></i>
                    </button>
                    <button class="host-action-btn danger" onclick="hostKick('${uid}')" title="Chiqarish">
                        <i class="fas fa-user-times"></i>
                    </button>
                </div>`;
            hList.appendChild(item);
        }
    });
}

function markHandRaised(uid) {
    const tile = tiles[uid];
    if (!tile) return;
    const badge = document.createElement('div');
    badge.className = 'hand-raised-badge';
    badge.textContent = '✋';
    tile.appendChild(badge);
    setTimeout(() => badge.remove(), 5000);
}

// ── RAISE HAND ───────────────────────────────────
function raiseHand() {
    isHandRaised = !isHandRaised;
    const btn = document.getElementById('handBtn');
    if (isHandRaised) {
        socket.emit('raise-hand');
        btn.classList.add('active-panel');
        showToast('Qo\'l ko\'tardingiz ✋');
    } else {
        btn.classList.remove('active-panel');
    }
}

// ── REACTIONS ────────────────────────────────────
function toggleReactionMenu() {
    if (!isHost && !permissions.reactions) { showToast('Mezbon reaksiyalarni bloklagan'); return; }
    document.getElementById('reactionMenu').classList.toggle('hidden');
}

function sendReaction(emoji) {
    socket.emit('send-reaction', emoji);
    document.getElementById('reactionMenu').classList.add('hidden');
}

function showFloatingReaction(emoji, name) {
    const container = document.getElementById('reactionsOverlay');
    const el = document.createElement('div');
    el.className = 'reaction-bubble';
    el.textContent = emoji;
    el.style.left = (20 + Math.random() * 60) + '%';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2600);
}

// ── THEATER MODE ─────────────────────────────────
function toggleTheaterMode() {
    if (!isHost) return;
    socket.emit('toggle-theater-mode', !theaterActive);
}

function enterTheaterUI() {
    document.getElementById('theaterOverlay').classList.add('active');
    updateTheaterAvatars();
    showToast('🎭 Theater Mode faollashtirildi');
}

function exitTheaterUI() {
    if (focusActive) exitFocusMode();
    document.getElementById('theaterOverlay').classList.remove('active');
}

function updateTheaterAvatars() {
    const screenCont = document.getElementById('theaterMainVideo');
    const avatarsCont = document.getElementById('theaterAvatars');
    screenCont.innerHTML = '';
    avatarsCont.innerHTML = '';

    const entries = Object.entries(streams);
    if (!entries.length) return;

    const mainEntry = entries.find(([id]) => id !== 'me') || entries[0];
    const [, mainStream] = mainEntry;

    const sv = document.createElement('video');
    sv.srcObject = mainStream;
    sv.playsInline = true;
    sv.autoplay = true;
    sv.muted = true;
    sv.play().catch(() => { });
    screenCont.appendChild(sv);

    entries.forEach(([id, s]) => {
        const wrap = document.createElement('div');
        wrap.className = 'theater-avatar';
        const av = document.createElement('video');
        av.srcObject = s; av.playsInline = true; av.autoplay = true; av.muted = true;
        av.play().catch(() => { });
        const lbl = document.createElement('div');
        lbl.className = 'av-label';
        lbl.textContent = id === 'me' ? 'Siz' : (participants[id]?.name || 'Mehmon').substring(0, 8);
        wrap.appendChild(av); wrap.appendChild(lbl);
        avatarsCont.appendChild(wrap);
    });
}

let focusZoom = 1;
let focusPan = { x: 0, y: 0 };
let isDragging = false;
let startPos = { x: 0, y: 0 };

function enterFocusMode(peerId) {
    focusActive = true;
    const overlay = document.getElementById('focusOverlay');
    const cont = document.getElementById('focusVideoContainer');
    cont.innerHTML = '';

    // Get stream from our store
    const s = (peerId === 'me' ? myStream : streams[peerId]);
    if (!s) return;

    const v = document.createElement('video');
    v.srcObject = s; v.playsInline = true; v.autoplay = true; v.muted = (peerId === 'me');
    v.style.transition = 'transform 0.1s ease-out';
    v.play().catch(() => { });

    // Zoom/Pan logic
    v.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        focusZoom = Math.min(Math.max(1, focusZoom + delta), 5);
        updateFocusTransform(v);
    });

    v.addEventListener('mousedown', e => {
        if (focusZoom > 1) {
            isDragging = true;
            startPos = { x: e.clientX - focusPan.x, y: e.clientY - focusPan.y };
            v.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        focusPan.x = e.clientX - startPos.x;
        focusPan.y = e.clientY - startPos.y;
        updateFocusTransform(v);
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        if (v) v.style.cursor = focusZoom > 1 ? 'grab' : 'default';
    });

    cont.appendChild(v);
    overlay.classList.add('active');
    focusZoom = 1;
    focusPan = { x: 0, y: 0 };
    updateFocusTransform(v);
}

function updateFocusTransform(video) {
    if (!video) return;
    video.style.transform = `scale(${focusZoom}) translate(${focusPan.x / focusZoom}px, ${focusPan.y / focusZoom}px)`;
    video.style.cursor = focusZoom > 1 ? 'grab' : 'default';
}

function exitFocusMode() {
    focusActive = false;
    document.getElementById('focusOverlay').classList.remove('active');
    setTimeout(() => { document.getElementById('focusVideoContainer').innerHTML = ''; }, 400);
}

// ── DEVICE SETTINGS ──────────────────────────────
async function loadDevices() {
    const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const camSel = document.getElementById('cameraSelect');
    const micSel = document.getElementById('micSelect');
    const spkSel = document.getElementById('speakerSelect');
    camSel.innerHTML = '';
    micSel.innerHTML = '';
    spkSel.innerHTML = '';
    devs.filter(d => d.kind === 'videoinput').forEach(d => {
        const o = document.createElement('option');
        o.value = d.deviceId; o.textContent = d.label || 'Kamera';
        camSel.appendChild(o);
    });
    devs.filter(d => d.kind === 'audioinput').forEach(d => {
        const o = document.createElement('option');
        o.value = d.deviceId; o.textContent = d.label || 'Mikrofon';
        micSel.appendChild(o);
    });
    devs.filter(d => d.kind === 'audiooutput').forEach(d => {
        const o = document.createElement('option');
        o.value = d.deviceId; o.textContent = d.label || 'Speaker';
        spkSel.appendChild(o);
    });
    const savedCam = sessionStorage.getItem('pdp_cam_id');
    const savedMic = sessionStorage.getItem('pdp_mic_id');
    const savedSpk = sessionStorage.getItem('pdp_spk_id');
    if (savedCam) camSel.value = savedCam;
    if (savedMic) micSel.value = savedMic;
    if (savedSpk) spkSel.value = savedSpk;
}

async function switchSpeaker(deviceId) {
    if (!deviceId) return;
    sessionStorage.setItem('pdp_spk_id', deviceId);

    const videos = document.querySelectorAll('video');
    for (const vid of videos) {
        if (typeof vid.setSinkId === 'function') {
            await vid.setSinkId(deviceId).catch(e => console.error('SinkId error:', e));
        }
    }
    showToast('Dinamik o\'zgartirildi');
}

async function switchCamera(deviceId) {
    if (!deviceId) return;
    sessionStorage.setItem('pdp_cam_id', deviceId);
    const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false }).catch(() => null);
    if (!s) return;
    const track = s.getVideoTracks()[0];
    track.enabled = camOn; // Inherit current state
    myStream.getVideoTracks().forEach(t => { t.stop(); myStream.removeTrack(t); });
    myStream.addTrack(track);
    Object.values(peers).forEach(call => {
        const sender = call.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(track);
    });
    // If virtual blur is on, it might need to re-attach (though CSS-based blur is fine)
    if (tiles['me']) {
        const v = tiles['me'].querySelector('video');
        if (v) v.srcObject = myStream;
    }
}

async function switchMic(deviceId) {
    if (!deviceId) return;
    sessionStorage.setItem('pdp_mic_id', deviceId);
    const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } }).catch(() => null);
    if (!s) return;
    const track = s.getAudioTracks()[0];
    track.enabled = micOn; // Inherit current state
    myStream.getAudioTracks().forEach(t => { t.stop(); myStream.removeTrack(t); });
    myStream.addTrack(track);
    Object.values(peers).forEach(call => {
        const sender = call.peerConnection?.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) sender.replaceTrack(track);
    });
}

// ── TIMER ────────────────────────────────────────
let timerInterval;
function startTimer(startTime) {
    if (timerInterval) clearInterval(timerInterval);
    const el = document.getElementById('meetingTimer');

    timerInterval = setInterval(() => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        el.textContent = (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
    }, 1000);
}
function pad(n) { return String(n).padStart(2, '0'); }

// ── LEAVE ────────────────────────────────────────
function confirmLeave() { document.getElementById('leaveModal').classList.remove('hidden'); }

function leaveMeeting() {
    Object.values(peers).forEach(c => c.close());
    myStream?.getTracks().forEach(t => t.stop());
    screenStream?.getTracks().forEach(t => t.stop());
    window.location.href = '/';
}

// ── TOAST ────────────────────────────────────────
function showToast(msg, duration = 3000) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), duration);
}

// ── COPY MEETING LINK ────────────────────────────
function copyMeetingLink() {
    const url = window.location.origin + '/lobby/' + ROOM_ID;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => showToast('Havola nusxalandi! ✅'));
    } else {
        // Fallback for older browsers or insecure contexts
        const textArea = document.createElement("textarea");
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand('copy'); showToast('Havola nusxalandi! ✅'); } catch (err) { }
        document.body.removeChild(textArea);
    }
}

// ── CLOSE REACTION MENU ON OUTSIDE CLICK ─────────
document.addEventListener('click', e => {
    const menu = document.getElementById('reactionMenu');
    const btn = document.getElementById('reactionsBtn');
    if (!menu.contains(e.target) && !btn?.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

// ══════════════════════════════════════════════════
// ── MEETING RECORDING (MediaRecorder API) ─────────
// ══════════════════════════════════════════════════
let mediaRecorder = null;
let recordedChunks = [];
let recordingOn = false;

function toggleRecording() {
    if (recordingOn) stopRecording();
    else startRecording();
}

async function startRecording() {
    try {
        // High quality whole room recording using GetDisplayMedia
        // This captures all UI, all participant videos, and system audio.
        const combinedStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                displaySurface: 'browser',
                cursor: 'always'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });

        const options = { mimeType: 'video/webm;codecs=vp9,opus' };
        try {
            mediaRecorder = new MediaRecorder(combinedStream, options);
        } catch {
            mediaRecorder = new MediaRecorder(combinedStream);
        }

        recordedChunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            combinedStream.getTracks().forEach(t => t.stop());
            downloadRecording();
        };
        mediaRecorder.start(1000);

        recordingOn = true;
        document.getElementById('recIndicator').classList.remove('hidden');
        document.getElementById('recordBtn').classList.add('off-state');
        document.getElementById('recordBtn').querySelector('span').textContent = 'To\'xtat';
        showToast('🔴 Majlis to\'liq yozib olinmoqda...');
    } catch (err) {
        console.error("Recording error:", err);
        showToast('Yozib olish bekor qilindi yoki xatolik yuz berdi.');
        recordingOn = false;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    recordingOn = false;
    document.getElementById('recIndicator').classList.add('hidden');
    document.getElementById('recordBtn').classList.remove('off-state');
    document.getElementById('recordBtn').querySelector('span').textContent = 'Yozish';
    showToast('⏹ Yozib olish tugadi. Fayl yuklanmoqda...');
}

function downloadRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdpchat-recording-${ROOM_ID}-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════
// ── VIRTUAL BLUR (Canvas-based) ───────────────────
// ══════════════════════════════════════════════════
let blurOn = false;

function toggleVirtualBlur() {
    blurOn = !blurOn;
    const myTile = tiles['me'];
    if (myTile) {
        myTile.classList.toggle('virtual-blur-active', blurOn);
    }
    document.getElementById('blurBtn').classList.toggle('active-panel', blurOn);
    showToast(blurOn ? '🌫️ Fon blur yoqildi' : 'Fon blur o\'chirildi');
}

// ══════════════════════════════════════════════════
// ── ACTIVE SPEAKER DETECTION (Web Audio API) ──────
// ══════════════════════════════════════════════════
let audioCtx = null;
let speakerDetectorInterval = null;
const analyserMap = {}; // peerId -> { analyser, buffer }

function initSpeakerDetection(stream, peerId) {
    if (!stream || !stream.getAudioTracks().length) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserMap[peerId] = { analyser, buffer: new Uint8Array(analyser.frequencyBinCount) };
    } catch (e) { /* AudioContext might be blocked */ }
}

function getVolume(peerId) {
    const item = analyserMap[peerId];
    if (!item) return 0;
    item.analyser.getByteFrequencyData(item.buffer);
    const avg = item.buffer.reduce((a, b) => a + b, 0) / item.buffer.length;
    return avg;
}

// Start detection loop
speakerDetectorInterval = setInterval(() => {
    let maxVol = 8; // threshold
    let activeSpeaker = null;
    Object.keys(analyserMap).forEach(pid => {
        const vol = getVolume(pid);
        if (vol > maxVol) { maxVol = vol; activeSpeaker = pid; }
    });
    Object.keys(tiles).forEach(pid => {
        tiles[pid]?.classList.toggle('speaking', pid === activeSpeaker);
    });
}, 300);

// Hook into stream additions
const _origAddTile = addTile;
// We'll attach audio analysis after addTile is called
socket.on('user-connected', (uid) => {
    // Attach analyser after a short delay (stream may not be ready immediately)
    setTimeout(() => {
        const s = streams[uid];
        if (s) initSpeakerDetection(s, uid);
    }, 2000);
});

// Init for self
setTimeout(() => { if (myStream) initSpeakerDetection(myStream, 'me'); }, 1000);

// ══════════════════════════════════════════════════
// ── CONNECTION QUALITY MONITOR ────────────────────
// ══════════════════════════════════════════════════
setInterval(async () => {
    const el = document.getElementById('connQuality');
    const txt = document.getElementById('connQualityText');
    if (!el || !txt) return;

    // Check RTT from one of the peer connections
    const calls = Object.values(peers);
    if (!calls.length) return;

    try {
        const stats = await calls[0].peerConnection?.getStats();
        let rtt = null;
        stats?.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime) {
                rtt = report.currentRoundTripTime * 1000; // ms
            }
        });

        if (rtt === null) return;

        el.className = 'conn-quality';
        if (rtt < 100) {
            txt.textContent = 'Yaxshi';
            el.classList.add('good');
        } else if (rtt < 300) {
            txt.textContent = 'O\'rtacha';
            el.classList.add('fair');
        } else {
            txt.textContent = 'Sust';
            el.classList.add('poor');
        }
    } catch (e) { /* ignore */ }
}, 5000);

// ══════════════════════════════════════════════════
// ── MULTIPLAYER GAMES ─────────────────────────────
// ══════════════════════════════════════════════════
let gameBoard = Array(9).fill(null);
let mySymbol = null; // 'X' or 'O'
let currentTurn = 'X';

function launchGame(gameType) {
    socket.emit('game-launch', { gameType });
}

socket.on('game-started', ({ gameType, startedBy }) => {
    showToast(`🎮 ${startedBy} ${gameType === 'tictactoe' ? 'Tic-Tac-Toe' : (gameType === 'rps' ? 'Tosh-Qaychi-Qogoz' : (gameType === 'snake' ? 'Iloncha' : 'Shaxmat'))} o'yinini boshladi!`);
    if (gameType === 'tictactoe') initTicTacToeUI();
    if (gameType === 'rps') initRPSUI();
    if (gameType === 'snake') initSnakeUI();
    if (gameType === 'ludo') initLudoUI();
    if (gameType === 'battleship') initBattleshipUI();

    // Auto-open games panel if not already open
    const gp = document.getElementById('gamesPanel');
    if (gp && !gp.classList.contains('open')) {
        togglePanel('games');
    }
});

function initTicTacToeUI() {
    activeGame = 'tictactoe';
    const dashboard = document.getElementById('gamesDashboard');
    const area = document.getElementById('activeGameArea');
    if (dashboard) dashboard.classList.add('hidden');
    if (area) area.classList.remove('hidden');

    area.innerHTML = `
        <div class="game-header">
            <h3>Tic-Tac-Toe</h3>
            <div class="game-status" id="gameStatus">Navbat: X</div>
        </div>
        <div class="ttt-game-board" id="tttBoard">
            ${Array(9).fill(0).map((_, i) => `<div class="ttt-cell" data-index="${i}"></div>`).join('')}
        </div>
        <div class="game-actions">
            <button class="btn-game-action btn-back-lobby" onclick="exitGame()">Chiqish</button>
            <button class="btn-game-action" onclick="resetGame()">Qayta boshlash</button>
        </div>
    `;

    document.querySelectorAll('.ttt-cell').forEach(cell => {
        cell.onclick = () => {
            if (myRole === 'spectator') return showToast('Kuzatish rejimidagi ishtirokchilar o\'ynay olmaydi');
            handleGameMove(cell.dataset.index);
        };
    });

    // Reset state
    gameBoard = Array(9).fill(null);
    currentTurn = 'X';
}

function handleGameMove(index) {
    if (activeGame === 'tictactoe') {
        if (gameBoard[index] || calculateWinner(gameBoard)) return;
        socket.emit('game-move', { index, symbol: currentTurn, gameType: 'tictactoe' });
        applyMove(index, currentTurn);
    }
}

socket.on('game-remote-move', (data) => {
    if (data.gameType === 'tictactoe') applyMove(data.index, data.symbol);
    if (data.gameType === 'rps') handleRemoteRPSMove(data);
    if (data.gameType === 'snake') handleRemoteSnakeMove(data);
    if (data.gameType === 'ludo') handleRemoteLudoMove(data);
    if (data.gameType === 'battleship') handleRemoteBattleshipMove(data);
});

// ── ROCK PAPER SCISSORS ───────────────────────────
let rpsChoices = {}; // { uid: choice }

function initRPSUI() {
    activeGame = 'rps';
    const area = document.getElementById('activeGameArea');
    document.getElementById('gamesDashboard').classList.add('hidden');
    area.classList.remove('hidden');

    area.innerHTML = `
        <div class="game-header">
            <h3>Tosh, Qaychi, Qog'oz</h3>
            <div class="game-status" id="gameStatus">Tanlang...</div>
        </div>
        <div class="rps-board">
            <button class="rps-btn" onclick="myRole === 'spectator' ? showToast('Kuzatuvchi o\\'ynay olmaydi') : sendRPSMove('rock')">🪨 Tosh</button>
            <button class="rps-btn" onclick="myRole === 'spectator' ? showToast('Kuzatuvchi o\\'ynay olmaydi') : sendRPSMove('paper')">📄 Qog'oz</button>
            <button class="rps-btn" onclick="myRole === 'spectator' ? showToast('Kuzatuvchi o\\'ynay olmaydi') : sendRPSMove('scissors')">✂️ Qaychi</button>
        </div>
        <div class="rps-result hidden" id="rpsResult"></div>
        <div class="game-actions">
            <button class="btn-game-action btn-back-lobby" onclick="exitGame()">Chiqish</button>
            <button class="btn-game-action" onclick="resetRPS()">Qayta boshlash</button>
        </div>
    `;
    rpsChoices = {};
}

function sendRPSMove(choice) {
    if (rpsChoices[myPeerId]) return;
    rpsChoices[myPeerId] = choice;
    socket.emit('game-move', { choice, uid: myPeerId, gameType: 'rps' });
    document.getElementById('gameStatus').textContent = 'Raqib kutilmoqda...';
    checkRPSWinner();
}

function handleRemoteRPSMove(data) {
    rpsChoices[data.uid] = data.choice;
    checkRPSWinner();
}

function checkRPSWinner() {
    const uids = Object.keys(rpsChoices);
    const peerUids = Object.keys(participants).filter(id => id !== myPeerId);

    // In RPS we need at least 2 players to have moved
    if (uids.length < 2) return;

    const myChoice = rpsChoices[myPeerId];
    const opponentId = uids.find(id => id !== myPeerId);
    const opponentChoice = rpsChoices[opponentId];
    const opponentName = participants[opponentId]?.name || 'Raqib';

    let result = '';
    if (myChoice === opponentChoice) result = 'Durang! 🤝';
    else if (
        (myChoice === 'rock' && opponentChoice === 'scissors') ||
        (myChoice === 'paper' && opponentChoice === 'rock') ||
        (myChoice === 'scissors' && opponentChoice === 'paper')
    ) result = 'Siz g\'alaba qozondingiz! 🎉';
    else result = `${opponentName} g'alaba qozondi! 😢`;

    const resEl = document.getElementById('rpsResult');
    resEl.innerHTML = `
        <div class="rps-showdown">
            <span>Siz: ${getRPSEmoji(myChoice)}</span>
            <span>vs</span>
            <span>${opponentName}: ${getRPSEmoji(opponentChoice)}</span>
        </div>
        <div class="rps-final-msg">${result}</div>
    `;
    resEl.classList.remove('hidden');
    document.getElementById('gameStatus').textContent = 'O\'yin tugadi';

    if (result.includes('Siz g\'alaba qozondingiz')) {
        socket.emit('save-game-score', { gameType: 'rps', score: 5 });
    }
}

function getRPSEmoji(choice) {
    return choice === 'rock' ? '🪨' : choice === 'paper' ? '📄' : '✂️';
}

function resetRPS() {
    socket.emit('game-reset', { gameType: 'rps' });
}

socket.on('game-reset-all', (data) => {
    if (data && data.gameType === 'rps') initRPSUI();
    else if (data && data.gameType === 'snake') initSnakeUI();
    else if (data && data.gameType === 'ludo') initLudoUI();
    else if (data && data.gameType === 'battleship') initBattleshipUI();
    else {
        // ... tictactoe reset ...
    }
});

// ── LUDO (POCHCHI) ────────────────────────────────
let ludoState = {
    turn: 0, // 0-3 (Red, Green, Yellow, Blue)
    dice: 0,
    positions: [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    colors: ['red', 'green', 'yellow', 'blue']
};

function initLudoUI() {
    activeGame = 'ludo';
    const area = document.getElementById('activeGameArea');
    document.getElementById('gamesDashboard').classList.add('hidden');
    area.classList.remove('hidden');

    area.innerHTML = `
        <div class="game-header">
            <h3>Ludo (Pochchi)</h3>
            <div class="game-status" id="gameStatus">Navbat: Qizil</div>
        </div>
        <div class="ludo-board-wrapper">
            <div class="ludo-board" id="ludoBoard">
                <!-- Board grid will be here -->
                <div class="ludo-center">LUDO</div>
            </div>
            <div class="ludo-controls">
                <div class="dice-box" id="diceResult">?</div>
                <button class="btn-dice" id="rollBtn" onclick="rollLudoDice()">Roll Dice</button>
            </div>
        </div>
        <div class="game-actions">
            <button class="btn-game-action btn-back-lobby" onclick="exitGame()">Chiqish</button>
        </div>
    `;
    setupLudoBoard();
}

function setupLudoBoard() {
    const board = document.getElementById('ludoBoard');
    board.innerHTML = '';
    // Represent 4 zones/colors
    ludoState.colors.forEach((color, i) => {
        const home = document.createElement('div');
        home.className = `ludo-home ${color}`;
        for (let j = 0; j < 4; j++) {
            const token = document.createElement('div');
            token.className = `ludo-token ${color}`;
            token.id = `token-${i}-${j}`;
            token.onclick = () => moveLudoToken(i, j);
            home.appendChild(token);
        }
        board.appendChild(home);
    });
    const center = document.createElement('div');
    center.className = 'ludo-center';
    center.textContent = 'LUDO';
    board.appendChild(center);
}

function rollLudoDice() {
    if (myRole === 'spectator') return showToast('Kuzatuvchi o\'ynay olmaydi');
    if (ludoState.rolling) return;
    const dice = Math.floor(Math.random() * 6) + 1;
    ludoState.dice = dice;
    document.getElementById('diceResult').textContent = dice;
    showToast(`Siz ${dice} tashladingiz! Endi toshni tanlang.`);
    socket.emit('game-move', { gameType: 'ludo', type: 'dice', value: dice, uid: myPeerId });
}

function moveLudoToken(playerIdx, tokenIdx) {
    if (myRole === 'spectator') return showToast('Tomoshabin toshlarni sura olmaydi');
    if (ludoState.dice === 0) return;
    // For simplicity, just simulate a move
    ludoState.positions[playerIdx][tokenIdx] += ludoState.dice;
    const pos = ludoState.positions[playerIdx][tokenIdx];
    showToast(`Tosh ${pos}-katakka ko'chirildi`);

    socket.emit('game-move', {
        gameType: 'ludo',
        type: 'token-move',
        playerIdx,
        tokenIdx,
        newPos: pos,
        uid: myPeerId
    });
    ludoState.dice = 0;
    document.getElementById('diceResult').textContent = '?';
}

function handleRemoteLudoMove(data) {
    if (data.type === 'dice') {
        document.getElementById('diceResult').textContent = data.value;
        showToast(`${participants[data.uid]?.name || 'Raqib'} dice tashladi: ${data.value}`);
    }
    if (data.type === 'token-move') {
        ludoState.positions[data.playerIdx][data.tokenIdx] = data.newPos;
        showToast(`${participants[data.uid]?.name || 'Raqib'} toshini surdi`);
    }
}

// ── BATTLESHIP (DENGIZ JANGI) ──────────────────────
let shipGrids = { me: Array(100).fill(0), opponent: Array(100).fill(0) };

function initBattleshipUI() {
    activeGame = 'battleship';
    const area = document.getElementById('activeGameArea');
    document.getElementById('gamesDashboard').classList.add('hidden');
    area.classList.remove('hidden');

    area.innerHTML = `
        <div class="game-header">
            <h3>Dengiz jangi</h3>
            <div class="game-status" id="gameStatus">Kemalarni joylashtiring</div>
        </div>
        <div class="bs-boards">
            <div class="bs-side">
                <p>Sizniki</p>
                <div class="bs-grid" id="myGrid"></div>
            </div>
            <div class="bs-side">
                <p>Raqibniki</p>
                <div class="bs-grid" id="opponentGrid"></div>
            </div>
        </div>
        <div class="game-actions">
            <button class="btn-game-action btn-back-lobby" onclick="exitGame()">Chiqish</button>
        </div>
    `;
    createBSGrids();
}

function createBSGrids() {
    const myGrid = document.getElementById('myGrid');
    const oppGrid = document.getElementById('opponentGrid');
    for (let i = 0; i < 100; i++) {
        myGrid.innerHTML += `<div class="bs-cell my" data-idx="${i}" onclick="placeShip(${i})"></div>`;
        oppGrid.innerHTML += `<div class="bs-cell opp" data-idx="${i}" onclick="fireBS(${i})"></div>`;
    }
}

function placeShip(idx) {
    if (myRole === 'spectator') return showToast('Tomoshabin kemalarni joylay olmaydi');
    // Basic ship placement logic
    const cell = document.querySelector(`.bs-cell.my[data-idx="${idx}"]`);
    cell.classList.toggle('ship');
    shipGrids.me[idx] = 1;
}

function fireBS(idx) {
    if (myRole === 'spectator') return showToast('Tomoshabin o\'q uza olmaydi');
    socket.emit('game-move', { gameType: 'battleship', type: 'fire', idx, uid: myPeerId });
}

function handleRemoteBattleshipMove(data) {
    if (data.type === 'fire') {
        const hit = shipGrids.me[data.idx] === 1;
        socket.emit('game-move', { gameType: 'battleship', type: 'result', idx: data.idx, hit, uid: myPeerId });
        const cell = document.querySelector(`.bs-cell.my[data-idx="${data.idx}"]`);
        cell.classList.add(hit ? 'hit' : 'miss');
    }
    if (data.type === 'result') {
        const cell = document.querySelector(`.bs-cell.opp[data-idx="${data.idx}"]`);
        cell.classList.add(data.hit ? 'hit' : 'miss');
    }
}

// ── MULTIPLAYER SNAKE ─────────────────────────────
let snakeCanvas, snakeCtx;
let snakeGameState = {
    snakes: {}, // { uid: [{x,y}, ...] }
    food: { x: 5, y: 5 },
    gridSize: 20,
    tileCount: 20,
    gameLoop: null,
    score: 0
};

function initSnakeUI() {
    activeGame = 'snake';
    const area = document.getElementById('activeGameArea');
    document.getElementById('gamesDashboard').classList.add('hidden');
    area.classList.remove('hidden');

    area.innerHTML = `
        <div class="game-header">
            <h3>Iloncha</h3>
            <div class="game-status" id="gameStatus">Ochko: 0</div>
        </div>
        <div class="snake-container">
            <canvas id="snakeCanvas" width="300" height="300"></canvas>
        </div>
        <div class="game-actions">
            <button class="btn-game-action btn-back-lobby" onclick="exitGame()">Chiqish</button>
            <button class="btn-game-action" onclick="resetSnake()">Qayta boshlash</button>
        </div>
    `;

    snakeCanvas = document.getElementById('snakeCanvas');
    snakeCtx = snakeCanvas.getContext('2d');

    // Reset state
    snakeGameState.snakes = {};
    snakeGameState.snakes[myPeerId] = [{ x: 10, y: 10 }];
    snakeGameState.score = 0;
    snakeGameState.direction = { x: 0, y: 0 };
    snakeGameState.nextDir = { x: 0, y: 0 };

    if (snakeGameState.gameLoop) clearInterval(snakeGameState.gameLoop);
    snakeGameState.gameLoop = setInterval(updateSnake, 150);

    window.addEventListener('keydown', handleSnakeKey);
}

function handleSnakeKey(e) {
    if (myRole === 'spectator') return;
    if (activeGame !== 'snake') return;
    const key = e.key;
    const { direction } = snakeGameState;
    if (key === 'ArrowUp' && direction.y === 0) snakeGameState.nextDir = { x: 0, y: -1 };
    if (key === 'ArrowDown' && direction.y === 0) snakeGameState.nextDir = { x: 0, y: 1 };
    if (key === 'ArrowLeft' && direction.x === 0) snakeGameState.nextDir = { x: -1, y: 0 };
    if (key === 'ArrowRight' && direction.x === 0) snakeGameState.nextDir = { x: 1, y: 0 };

    socket.emit('game-move', {
        uid: myPeerId,
        gameType: 'snake',
        type: 'dir',
        dir: snakeGameState.nextDir
    });
}

function handleRemoteSnakeMove(data) {
    if (data.type === 'dir') {
        if (!snakeGameState.snakes[data.uid]) snakeGameState.snakes[data.uid] = [{ x: 5, y: 5 }];
    }
    if (data.type === 'pos') {
        snakeGameState.snakes[data.uid] = data.snake;
    }
    if (data.type === 'food') {
        snakeGameState.food = data.food;
    }
}

function updateSnake() {
    if (!snakeGameState.snakes[myPeerId]) return;
    snakeGameState.direction = snakeGameState.nextDir;
    const head = {
        x: snakeGameState.snakes[myPeerId][0].x + snakeGameState.direction.x,
        y: snakeGameState.snakes[myPeerId][0].y + snakeGameState.direction.y
    };

    // Wall collision
    if (head.x < 0) head.x = 14;
    if (head.x >= 15) head.x = 0;
    if (head.y < 0) head.y = 14;
    if (head.y >= 15) head.y = 0;

    snakeGameState.snakes[myPeerId].unshift(head);

    // Food collision
    if (head.x === snakeGameState.food.x && head.y === snakeGameState.food.y) {
        snakeGameState.score += 10;
        document.getElementById('gameStatus').textContent = `Ochko: ${snakeGameState.score}`;

        if (snakeGameState.score >= 50 && !snakeGameState.gaveScore) {
            snakeGameState.gaveScore = true;
            showToast('Tabriklaymiz! 50 ochko uchun +5 ball!');
            socket.emit('save-game-score', { gameType: 'snake', score: 5 });
        }

        // Only HOST generates new food to keep everyone in sync
        if (isHost) {
            const newFood = {
                x: Math.floor(Math.random() * 15),
                y: Math.floor(Math.random() * 15)
            };
            snakeGameState.food = newFood;
            socket.emit('game-move', {
                gameType: 'snake',
                type: 'food',
                food: newFood
            });
        }
    } else {
        if (snakeGameState.direction.x !== 0 || snakeGameState.direction.y !== 0) {
            snakeGameState.snakes[myPeerId].pop();
        }
    }

    // Broadcast position
    socket.emit('game-move', {
        uid: myPeerId,
        gameType: 'snake',
        type: 'pos',
        snake: snakeGameState.snakes[myPeerId]
    });

    drawSnake();
}

function drawSnake() {
    snakeCtx.fillStyle = '#0f172a';
    snakeCtx.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height);

    // Draw Food
    snakeCtx.fillStyle = '#ef4444';
    snakeCtx.fillRect(snakeGameState.food.x * 20, snakeGameState.food.y * 20, 18, 18);

    // Draw Snakes
    Object.entries(snakeGameState.snakes).forEach(([uid, snake]) => {
        snakeCtx.fillStyle = uid === myPeerId ? '#10b981' : '#6366f1';
        snake.forEach(part => {
            snakeCtx.fillRect(part.x * 20, part.y * 20, 18, 18);
        });
    });
}

function resetSnake() {
    socket.emit('game-reset', { gameType: 'snake' });
}

// ── SIMPLE CHESS ──────────────────────────────────
let selectedPiece = null;
let chessBoard = []; // 8x8

function initChessUI() {
    activeGame = 'chess';
    const area = document.getElementById('activeGameArea');
    document.getElementById('gamesDashboard').classList.add('hidden');
    area.classList.remove('hidden');

    area.innerHTML = `
        <div class="game-header">
            <h3>Sodda Shaxmat <span class="role-badge ${myRole}">${myRole === 'player' ? 'O\'yinchi' : 'Tomoshabin'}</span></h3>
            <div class="game-status" id="gameStatus">Oqlar yuradi</div>
        </div>
        <div class="chess-container" id="chessBoard">
            ${renderChessBoard()}
        </div>
        <div class="game-actions">
            <button class="btn-game-action btn-back-lobby" onclick="exitGame()">Chiqish</button>
            <button class="btn-game-action" onclick="resetChess()">Qayta boshlash</button>
        </div>
    `;

    setupChessState();
    updateRoleUI();
}

function setupChessState() {
    chessBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    // Simple setup: just kings and some pawns for demo
    chessBoard[0][4] = { type: 'k', color: 'b' };
    chessBoard[7][4] = { type: 'k', color: 'w' };
    chessBoard[1][4] = { type: 'p', color: 'b' };
    chessBoard[6][4] = { type: 'p', color: 'w' };
    renderPieces();
}

function renderChessBoard() {
    let html = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            html += `<div class="chess-sq ${isDark ? 'dark' : 'light'}" data-r="${r}" data-c="${c}" onclick="handleChessClick(${r}, ${c})"></div>`;
        }
    }
    return html;
}

function renderPieces() {
    const squares = document.querySelectorAll('.chess-sq');
    squares.forEach(sq => {
        const r = sq.dataset.r;
        const c = sq.dataset.c;
        const p = chessBoard[r][c];
        sq.textContent = p ? getChessPiece(p) : '';
        sq.classList.toggle('has-piece', !!p);
    });
}

let chessTurn = 'w'; // 'w' or 'b'

function setupChessState() {
    chessBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    chessTurn = 'w';
    // Simple setup
    chessBoard[0][4] = { type: 'k', color: 'b' };
    chessBoard[7][4] = { type: 'k', color: 'w' };
    chessBoard[1][4] = { type: 'p', color: 'b' };
    chessBoard[6][4] = { type: 'p', color: 'w' };
    renderPieces();
}

function handleChessClick(r, c) {
    if (myRole === 'spectator') return showToast('Tomoshabin sifatida figuralarni sura olmaysiz');
    const p = chessBoard[r][c];
    if (selectedPiece) {
        // Move piece
        const { r: or, c: oc } = selectedPiece;
        const piece = chessBoard[or][oc];

        // Basic Turn Validation
        if (piece.color !== chessTurn) {
            showToast("Hozir sizning navbatingiz emas!");
            selectedPiece = null;
            document.querySelectorAll('.chess-sq').forEach(s => s.classList.remove('selected'));
            return;
        }

        chessBoard[r][c] = piece;
        chessBoard[or][oc] = null;
        selectedPiece = null;
        chessTurn = chessTurn === 'w' ? 'b' : 'w';
        updateChessStatus();
        renderPieces();
        socket.emit('game-move', { gameType: 'chess', type: 'move', from: { r: or, c: oc }, to: { r, c }, piece, nextTurn: chessTurn });
    } else if (p) {
        if (p.color !== chessTurn) return;
        selectedPiece = { r, c };
        document.querySelectorAll('.chess-sq').forEach(s => s.classList.remove('selected'));
        document.querySelector(`.chess-sq[data-r="${r}"][data-c="${c}"]`).classList.add('selected');
    }
}

function updateChessStatus() {
    const status = document.getElementById('gameStatus');
    if (status) status.textContent = chessTurn === 'w' ? 'Oqlar yuradi' : 'Qoralar yuradi';
}

socket.on('game-remote-move', (data) => {
    if (data.gameType === 'chess') {
        chessBoard[data.to.r][data.to.c] = data.piece;
        chessBoard[data.from.r][data.from.c] = null;
        chessTurn = data.nextTurn;
        updateChessStatus();
        renderPieces();
    }
    if (data.gameType === 'snake') handleRemoteSnakeMove(data);
    if (data.gameType === 'ludo') handleRemoteLudoMove(data);
    if (data.gameType === 'battleship') handleRemoteBattleshipMove(data);
});

function resetChess() {
    socket.emit('game-reset', { gameType: 'chess' });
}

socket.on('game-reset-all', (data) => {
    if (data && data.gameType === 'chess') initChessUI();
    else if (data && data.gameType === 'rps') initRPSUI();
    else if (data && data.gameType === 'snake') initSnakeUI();
    else if (data && data.gameType === 'ludo') initLudoUI();
    else if (data && data.gameType === 'battleship') initBattleshipUI();
    else {
        // Default Tic-Tac-Toe reset
        gameBoard = Array(9).fill(null);
        currentTurn = 'X';
        document.querySelectorAll('.ttt-cell').forEach(c => {
            c.textContent = '';
            c.className = 'ttt-cell';
        });
        const status = document.getElementById('gameStatus');
        if (status) status.textContent = "Navbat: X";
    }
});

function applyMove(index, symbol) {
    gameBoard[index] = symbol;
    const cells = document.querySelectorAll('.ttt-cell');
    const cell = cells[index];
    cell.textContent = symbol;
    cell.classList.add('occupied', symbol.toLowerCase());

    currentTurn = (symbol === 'X') ? 'O' : 'X';
    const status = document.getElementById('gameStatus');

    const winner = calculateWinner(gameBoard);
    if (status) {
        if (winner) {
            status.textContent = `G'alaba: ${winner}!`;
            showToast(`🎉 ${winner} o'yinda g'alaba qozondi!`);
            if ((winner === 'X' && mySymbol === 'X') || (winner === 'O' && mySymbol === 'O')) {
                socket.emit('save-game-score', { gameType: 'tictactoe', score: 10 });
            }
        } else if (!gameBoard.includes(null)) {
            status.textContent = "Durang!";
        } else {
            status.textContent = `Navbat: ${currentTurn}`;
        }
    }
}

function resetGame() {
    socket.emit('game-reset');
}


function exitGame() {
    document.getElementById('gamesDashboard').classList.remove('hidden');
    document.getElementById('activeGameArea').classList.add('hidden');
    activeGame = null;
    myRole = 'player'; // Reset role
}

function updateRoleUI() {
    const badge = document.querySelector('.role-badge');
    if (badge) {
        badge.className = `role-badge ${myRole}`;
        badge.textContent = myRole === 'player' ? 'O\'yinchi' : 'Tomoshabin';
    }
}

function calculateWinner(squares) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
        [0, 4, 8], [2, 4, 6]             // diags
    ];
    for (let i = 0; i < lines.length; i++) {
        const [a, b, c] = lines[i];
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            return squares[a];
        }
    }
    return null;
}
