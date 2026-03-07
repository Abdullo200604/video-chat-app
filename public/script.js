// ══════════════════════════════════════════════
// SOCKET & PEER SETUP
// ══════════════════════════════════════════════
const socket = io('/');
const videoGrid = document.getElementById('video-grid');

const myPeer = new Peer(undefined, {
    path: '/peerjs',
    host: '/',
    port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    }
});

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
const myVideo = document.createElement('video');
myVideo.muted = true;

const peers = {};           // { peerId: call }
const videoStreams = {};    // { peerId: videoElement }

let myVideoStream;
let myPeerId;
let isAdmin = false;
let theaterModeActive = false;
let focusModeActive = false;
let currentEffect = 'none';
let unreadMessages = 0;
let chatOpen = false;

const effectFilters = {
    none: '',
    blur: 'blur(5px)',
    grayscale: 'grayscale(100%)',
    sepia: 'sepia(100%)',
    invert: 'invert(100%)',
    warm: 'saturate(150%) sepia(40%) brightness(105%)'
};

// ══════════════════════════════════════════════
// MEDIA INIT
// ══════════════════════════════════════════════
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
    myVideoStream = stream;

    addVideoStream(myVideo, stream, 'me');

    // Answer incoming calls
    myPeer.on('call', call => {
        call.answer(stream);
        const video = document.createElement('video');
        call.on('stream', remoteStream => {
            addVideoStream(video, remoteStream, call.peer);
        });
        call.on('close', () => video.remove());
    });

    // New user joined
    socket.on('user-connected', userId => {
        setTimeout(() => connectToNewUser(userId, stream), 1000);
    });

    // Chat: send on Enter
    document.getElementById('chat_message').addEventListener('keydown', e => {
        const text = e.target;
        if (e.key === 'Enter' && text.value.trim()) {
            socket.emit('message', text.value.trim());
            text.value = '';
        }
    });

    // Chat: receive
    socket.on('createMessage', message => addMessage(message));
});

// ══════════════════════════════════════════════
// PEER OPEN
// ══════════════════════════════════════════════
myPeer.on('open', id => {
    myPeerId = id;
    socket.emit('join-room', ROOM_ID, id);
});

// ══════════════════════════════════════════════
// SOCKET EVENTS
// ══════════════════════════════════════════════
socket.on('you-are-admin', () => {
    isAdmin = true;
    document.getElementById('theaterModeBtn').classList.remove('hidden');
});

socket.on('new-admin', peerId => {
    if (peerId === myPeerId) {
        isAdmin = true;
        document.getElementById('theaterModeBtn').classList.remove('hidden');
    }
});

socket.on('theater-mode-changed', enabled => {
    theaterModeActive = enabled;
    if (enabled) enterTheaterMode();
    else exitTheaterMode();
});

socket.on('user-disconnected', userId => {
    if (peers[userId]) peers[userId].close();
    if (videoStreams[userId]) {
        videoStreams[userId].remove();
        delete videoStreams[userId];
    }
    updateTheaterAvatars();
});

// ══════════════════════════════════════════════
// CONNECT TO NEW USER
// ══════════════════════════════════════════════
function connectToNewUser(userId, stream) {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');

    call.on('stream', remoteStream => {
        addVideoStream(video, remoteStream, userId);
    });
    call.on('close', () => {
        video.remove();
        delete videoStreams[userId];
        updateTheaterAvatars();
    });

    peers[userId] = call;
}

// ══════════════════════════════════════════════
// VIDEO STREAM MANAGEMENT
// ══════════════════════════════════════════════
function addVideoStream(video, stream, peerId) {
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.dataset.peerId = peerId;
    video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.error('Play error:', e));
    });
    videoGrid.append(video);
    videoStreams[peerId] = video;

    if (theaterModeActive) updateTheaterAvatars();
}

// ══════════════════════════════════════════════
// THEATER MODE
// ══════════════════════════════════════════════
function toggleTheaterMode() {
    if (!isAdmin) return;
    const newState = !theaterModeActive;
    socket.emit('toggle-theater-mode', newState);
}

function enterTheaterMode() {
    const overlay = document.getElementById('theaterOverlay');
    overlay.classList.add('active');

    updateTheaterAvatars();

    // Theater button highlight
    document.getElementById('theaterModeBtn').style.background = 'linear-gradient(135deg,#7b2f8f,#4a1942)';
}

function exitTheaterMode() {
    if (focusModeActive) exitFocusMode();

    const overlay = document.getElementById('theaterOverlay');
    overlay.classList.remove('active');

    document.getElementById('theaterModeBtn').style.background = '';

    // Move any videos back to grid (they may have been moved)
    Object.values(videoStreams).forEach(v => {
        if (!videoGrid.contains(v)) videoGrid.append(v);
    });
}

// ─── Build theater screen + avatars ───
function updateTheaterAvatars() {
    if (!theaterModeActive) return;

    const screenContainer = document.getElementById('theaterMainVideo');
    const avatarsContainer = document.getElementById('theaterAvatars');
    screenContainer.innerHTML = '';
    avatarsContainer.innerHTML = '';

    const allVideos = Object.entries(videoStreams);
    if (allVideos.length === 0) return;

    // First remote video → main screen; or own video if alone
    const mainEntry = allVideos.find(([id]) => id !== 'me') || allVideos[0];
    const [mainId, mainVideo] = mainEntry;

    // Clone for screen display
    const screenVid = document.createElement('video');
    screenVid.srcObject = mainVideo.srcObject;
    screenVid.setAttribute('playsinline', 'true');
    screenVid.muted = (mainId === 'me');
    screenVid.autoplay = true;
    screenVid.play().catch(() => { });
    screenContainer.appendChild(screenVid);

    // All other videos → avatars
    allVideos.forEach(([id, vid]) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('theater-avatar');
        wrapper.dataset.peerId = id;

        const avVid = document.createElement('video');
        avVid.srcObject = vid.srcObject;
        avVid.setAttribute('playsinline', 'true');
        avVid.muted = true;
        avVid.autoplay = true;
        avVid.play().catch(() => { });

        const label = document.createElement('div');
        label.classList.add('avatar-label');
        label.textContent = id === 'me' ? 'Siz' : 'Mehmon';

        wrapper.appendChild(avVid);
        wrapper.appendChild(label);
        avatarsContainer.appendChild(wrapper);
    });
}

// ══════════════════════════════════════════════
// FOCUS MODE
// ══════════════════════════════════════════════
function enterFocusMode() {
    if (focusModeActive) return;
    focusModeActive = true;

    const overlay = document.getElementById('focusOverlay');
    const container = document.getElementById('focusVideoContainer');
    const screenVid = document.querySelector('#theaterMainVideo video');

    container.innerHTML = '';
    if (screenVid) {
        const clone = document.createElement('video');
        clone.srcObject = screenVid.srcObject;
        clone.setAttribute('playsinline', 'true');
        clone.muted = screenVid.muted;
        clone.autoplay = true;
        clone.play().catch(() => { });
        container.appendChild(clone);
    }

    overlay.classList.add('active');
}

function exitFocusMode() {
    focusModeActive = false;
    const overlay = document.getElementById('focusOverlay');
    overlay.classList.remove('active');
    setTimeout(() => {
        document.getElementById('focusVideoContainer').innerHTML = '';
    }, 400);
}

// ══════════════════════════════════════════════
// PANEL TOGGLE (Chat & Effects)
// ══════════════════════════════════════════════
function togglePanel(panelName) {
    const chatPanel = document.getElementById('chatPanel');
    const effectsPanel = document.getElementById('effectsPanel');
    const chatBtn = document.getElementById('chatToggleBtn');
    const effectsBtn = document.getElementById('effectsToggleBtn');

    if (panelName === 'chat') {
        const isOpen = chatPanel.classList.contains('open');
        effectsPanel.classList.remove('open'); effectsBtn.classList.remove('active-panel');
        if (isOpen) {
            chatPanel.classList.remove('open'); chatBtn.classList.remove('active-panel');
            chatOpen = false;
        } else {
            chatPanel.classList.add('open'); chatBtn.classList.add('active-panel');
            chatOpen = true;
            unreadMessages = 0;
            ['chatBadge', 'theaterChatBadge'].forEach(id => {
                const b = document.getElementById(id);
                if (b) { b.textContent = ''; b.classList.remove('show'); }
            });
            setTimeout(() => document.getElementById('chat_message').focus(), 350);
        }
    } else {
        const isOpen = effectsPanel.classList.contains('open');
        chatPanel.classList.remove('open'); chatBtn.classList.remove('active-panel'); chatOpen = false;
        if (isOpen) { effectsPanel.classList.remove('open'); effectsBtn.classList.remove('active-panel'); }
        else { effectsPanel.classList.add('open'); effectsBtn.classList.add('active-panel'); }
    }
}

// ══════════════════════════════════════════════
// EFFECTS
// ══════════════════════════════════════════════
function applyEffect(name) {
    currentEffect = name;
    if (myVideo) myVideo.style.filter = effectFilters[name];
    document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
    const card = document.getElementById('effect-' + name);
    if (card) card.classList.add('active');
}

// ══════════════════════════════════════════════
// CHAT
// ══════════════════════════════════════════════
function addMessage(message) {
    const ul = document.querySelector('.messages');
    const li = document.createElement('li');
    li.innerHTML = `<b>Foydalanuvchi</b><br>${message}`;
    ul.appendChild(li);
    scrollToBottom();

    if (!chatOpen) {
        unreadMessages++;
        const n = unreadMessages > 9 ? '9+' : unreadMessages;
        ['chatBadge', 'theaterChatBadge'].forEach(id => {
            const b = document.getElementById(id);
            if (b) { b.textContent = n; b.classList.add('show'); }
        });
    }
}

const scrollToBottom = () => {
    const w = document.querySelector('.main-chat-window');
    if (w) w.scrollTop = w.scrollHeight;
};

// ══════════════════════════════════════════════
// MIC / CAMERA CONTROLS
// ══════════════════════════════════════════════
function muteUnmute() {
    if (!myVideoStream) return;
    const track = myVideoStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    const on = track.enabled;

    ['muteButton', 't-muteButton'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = on
            ? `<i class="fas fa-microphone"></i><span>Ovoz</span>`
            : `<i class="fas fa-microphone-slash unmute"></i><span>Yoqish</span>`;
        on ? el.classList.remove('unmute') : el.classList.add('unmute');
    });
}

function playStop() {
    if (!myVideoStream) return;
    const track = myVideoStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
    const on = track.enabled;

    ['playPauseVideo', 't-videoButton'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = on
            ? `<i class="fas fa-video"></i><span>Kamera</span>`
            : `<i class="fas fa-video-slash stop"></i><span>Yoqish</span>`;
        on ? el.classList.remove('stop') : el.classList.add('stop');
    });
}
