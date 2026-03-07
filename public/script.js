// ════════════════════════════════════════════════
// PDP CHAT MEETING ROOM – CLIENT SCRIPT
// ════════════════════════════════════════════════

// ── Config ──────────────────────────────────────
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

// ── State ────────────────────────────────────────
const socket = io('/');
const myPeer = new Peer(undefined, { path: '/peerjs', host: '/', port: window.location.port || (location.protocol === 'https:' ? 443 : 80), config: ICE_SERVERS });
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
    startTimer();
    await loadDevices();

    try {
        myStream = await navigator.mediaDevices.getUserMedia({ video: camOn, audio: true });
        if (!micOn) myStream.getAudioTracks().forEach(t => t.enabled = false);
        if (!camOn) myStream.getVideoTracks().forEach(t => t.enabled = false);
    } catch (e) {
        // Try audio only
        try { myStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); camOn = false; }
        catch (e2) { myStream = null; showToast('Qurilmaga kirish imkoni yo\'lq'); }
    }

    if (myStream) addTile(myStream, 'me', myName, true);
})();

myPeer.on('open', id => {
    myPeerId = id;
    socket.emit('join-room', ROOM_ID, id, myName);
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
    showToast('Siz bu majlisning mezboningizsiz 👑');
});
socket.on('new-host', peerId => {
    if (peerId === myPeerId) {
        isHost = true;
        document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
        showToast('Siz yangi mezbon bo\'ldingiz 👑');
    }
});
socket.on('room-state', state => {
    isHost = state.isHost;
    if (isHost) {
        document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
    }
    chatEnabled = state.chatEnabled;
    participants = state.participants || {};
    Object.assign(permissions, state.permissions || {});
    updateParticipantsUI();
    if (state.startTime) startTimer(state.startTime);
    if (state.theaterMode) { theaterActive = true; enterTheaterUI(); }
});
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
socket.on('force-kick', uid => { if (uid === myPeerId) { showToast('Mezbon sizi chiqardi.'); setTimeout(leaveMeeting, 1500); } });
socket.on('set-mic-state', ({ uid, on }) => { if (uid === myPeerId) { if (micOn !== on) toggleMic(); } });
socket.on('set-cam-state', ({ uid, on }) => { if (uid === myPeerId) { if (camOn !== on) toggleCam(); } });
socket.on('user-raised-hand', (uid, name) => { showToast(`✋ ${name} qo'l ko'tardi`); markHandRaised(uid); });
socket.on('show-reaction', ({ uid, name, emoji }) => showFloatingReaction(emoji, name));

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
    info.innerHTML = `<div class="tile-name">${name}${isMe ? ' (Siz)' : ''}</div>`;
    if (isMe && isHost) info.querySelector('.tile-name').innerHTML += ' 👑';

    tile.appendChild(vid);
    tile.appendChild(info);

    // Apply existing effect if any
    const effect = isMe ? currentEffect : (participants[peerId]?.effect || 'none');
    vid.style.filter = effectFilters[effect] || '';

    videoGrid.appendChild(tile);
    tiles[peerId] = tile;
    streams[peerId] = stream;
    updateGridCount();
    if (theaterActive) updateTheaterAvatars();
}

function removeTile(peerId) {
    if (tiles[peerId]) { tiles[peerId].remove(); delete tiles[peerId]; }
    if (streams[peerId]) delete streams[peerId];
    updateGridCount();
    if (theaterActive) updateTheaterAvatars();
}

function updateGridCount() {
    const n = videoGrid.children.length;
    videoGrid.className = 'video-grid ' + (n === 1 ? 'count-1' : n === 2 ? 'count-2' : n <= 4 ? 'count-3' : n <= 6 ? 'count-many' : 'count-many');
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
const panels = { chat: 'chatPanel', participants: 'participantsPanel', host: 'hostPanel', settings: 'settingsPanel', effects: 'effectsPanel' };

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
    Object.entries(participants).forEach(([uid, info]) => {
        if (uid === myPeerId) return; // Don't override local preview if me
        const tile = tiles[uid];
        if (tile) {
            const vid = tile.querySelector('video');
            if (vid && info.effect) {
                vid.style.filter = effectFilters[info.effect] || '';
            }
        }
    });
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

// ── PARTICIPANTS UI ───────────────────────────────
function updateParticipantsUI() {
    const colors = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#9c27b0', '#00bcd4'];
    const list = document.getElementById('participantsList');
    const hList = document.getElementById('hostParticipantsList');
    const badge = document.getElementById('participantCount');

    const entries = Object.entries(participants);
    if (badge) badge.textContent = entries.length;
    if (list) list.innerHTML = '';
    if (hList) hList.innerHTML = '';

    entries.forEach(([uid, info], i) => {
        const color = colors[i % colors.length];
        const initial = (info.name || 'M').charAt(0).toUpperCase();
        const isMe_ = uid === myPeerId;

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

function enterFocusMode() {
    if (focusActive) return;
    focusActive = true;
    const overlay = document.getElementById('focusOverlay');
    const src = document.querySelector('#theaterMainVideo video');
    const cont = document.getElementById('focusVideoContainer');
    cont.innerHTML = '';
    if (src) {
        const v = document.createElement('video');
        v.srcObject = src.srcObject; v.playsInline = true; v.autoplay = true; v.muted = src.muted;
        v.play().catch(() => { });
        cont.appendChild(v);
    }
    overlay.classList.add('active');
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
}

async function switchCamera(deviceId) {
    if (!deviceId) return;
    const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false }).catch(() => null);
    if (!s) return;
    const track = s.getVideoTracks()[0];
    myStream.getVideoTracks().forEach(t => { t.stop(); myStream.removeTrack(t); });
    myStream.addTrack(track);
    Object.values(peers).forEach(call => {
        const sender = call.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(track);
    });
    if (tiles['me']) tiles['me'].querySelector('video').srcObject = myStream;
}

async function switchMic(deviceId) {
    if (!deviceId) return;
    const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } }).catch(() => null);
    if (!s) return;
    const track = s.getAudioTracks()[0];
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
