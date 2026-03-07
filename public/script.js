const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined, {
    path: '/peerjs',
    host: '/',
    port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    }
});

const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {};
let myVideoStream;
let currentEffect = 'none';
let unreadMessages = 0;
let chatOpen = false;

// ══════════════════════════════
// PANEL TOGGLE
// ══════════════════════════════
function togglePanel(panelName) {
    const chatPanel = document.getElementById('chatPanel');
    const effectsPanel = document.getElementById('effectsPanel');
    const chatBtn = document.getElementById('chatToggleBtn');
    const effectsBtn = document.getElementById('effectsToggleBtn');

    if (panelName === 'chat') {
        const isOpen = chatPanel.classList.contains('open');
        // Close effects first
        effectsPanel.classList.remove('open');
        effectsBtn.classList.remove('active-panel');

        if (isOpen) {
            chatPanel.classList.remove('open');
            chatBtn.classList.remove('active-panel');
            chatOpen = false;
        } else {
            chatPanel.classList.add('open');
            chatBtn.classList.add('active-panel');
            chatOpen = true;
            // Clear badge
            unreadMessages = 0;
            const badge = document.getElementById('chatBadge');
            badge.textContent = '';
            badge.classList.remove('show');
            // Focus input
            setTimeout(() => document.getElementById('chat_message').focus(), 350);
        }
    } else if (panelName === 'effects') {
        const isOpen = effectsPanel.classList.contains('open');
        // Close chat first
        chatPanel.classList.remove('open');
        chatBtn.classList.remove('active-panel');
        chatOpen = false;

        if (isOpen) {
            effectsPanel.classList.remove('open');
            effectsBtn.classList.remove('active-panel');
        } else {
            effectsPanel.classList.add('open');
            effectsBtn.classList.add('active-panel');
        }
    }
}

// ══════════════════════════════
// VIDEO EFFECTS
// ══════════════════════════════
const effectFilters = {
    'none': '',
    'blur': 'blur(5px)',
    'grayscale': 'grayscale(100%)',
    'sepia': 'sepia(100%)',
    'invert': 'invert(100%)',
    'warm': 'saturate(150%) sepia(40%) brightness(105%)'
};

function applyEffect(effectName) {
    currentEffect = effectName;
    // Update my own video
    if (myVideo) {
        myVideo.style.filter = effectFilters[effectName];
    }
    // Update active card
    document.querySelectorAll('.effect-card').forEach(card => {
        card.classList.remove('active');
    });
    const activeCard = document.getElementById('effect-' + effectName);
    if (activeCard) activeCard.classList.add('active');
}

// ══════════════════════════════
// MEDIA (Camera + Mic)
// ══════════════════════════════
navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    myVideoStream = stream;
    addVideoStream(myVideo, stream);

    myPeer.on('call', call => {
        call.answer(stream);
        const video = document.createElement('video');
        call.on('stream', userVideoStream => {
            addVideoStream(video, userVideoStream);
        });
    });

    socket.on('user-connected', userId => {
        setTimeout(() => {
            connectToNewUser(userId, stream);
        }, 1000);
    });

    // Chat xabar jo'natish (Enter tugmasi)
    let text = document.getElementById('chat_message');
    text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && text.value.trim().length !== 0) {
            socket.emit('message', text.value.trim());
            text.value = '';
        }
    });

    socket.on('createMessage', message => {
        addMessage(message);
    });
});

socket.on('user-disconnected', userId => {
    if (peers[userId]) {
        peers[userId].close();
    }
});

myPeer.on('open', id => {
    socket.emit('join-room', ROOM_ID, id);
});

// ══════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════
function connectToNewUser(userId, stream) {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream);
    });
    call.on('close', () => {
        video.remove();
    });
    peers[userId] = call;
}

function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.error('Video play error:', e));
    });
    videoGrid.append(video);
}

function addMessage(message) {
    const ul = document.querySelector('.messages');
    const li = document.createElement('li');
    li.innerHTML = `<b>Foydalanuvchi</b><br/>${message}`;
    ul.appendChild(li);
    scrollToBottom();

    // Agar chat yopiq bo'lsa badge ko'rsat
    if (!chatOpen) {
        unreadMessages++;
        const badge = document.getElementById('chatBadge');
        badge.textContent = unreadMessages > 9 ? '9+' : unreadMessages;
        badge.classList.add('show');
    }
}

const scrollToBottom = () => {
    const chatWindow = document.querySelector('.main-chat-window');
    chatWindow.scrollTop = chatWindow.scrollHeight;
};

// ══════════════════════════════
// MUTE / UNMUTE
// ══════════════════════════════
const muteUnmute = () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getAudioTracks()[0].enabled = false;
        setUnmuteButton();
    } else {
        myVideoStream.getAudioTracks()[0].enabled = true;
        setMuteButton();
    }
};

const setMuteButton = () => {
    document.getElementById('muteButton').innerHTML = `
        <i class="fas fa-microphone"></i>
        <span>Ovoz</span>
    `;
    document.getElementById('muteButton').classList.remove('unmute');
};

const setUnmuteButton = () => {
    document.getElementById('muteButton').innerHTML = `
        <i class="fas fa-microphone-slash unmute"></i>
        <span>Yoqish</span>
    `;
    document.getElementById('muteButton').classList.add('unmute');
};

// ══════════════════════════════
// PLAY / STOP VIDEO
// ══════════════════════════════
const playStop = () => {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getVideoTracks()[0].enabled = false;
        setPlayVideo();
    } else {
        myVideoStream.getVideoTracks()[0].enabled = true;
        setStopVideo();
    }
};

const setStopVideo = () => {
    document.getElementById('playPauseVideo').innerHTML = `
        <i class="fas fa-video"></i>
        <span>Kamera</span>
    `;
    document.getElementById('playPauseVideo').classList.remove('stop');
};

const setPlayVideo = () => {
    document.getElementById('playPauseVideo').innerHTML = `
        <i class="fas fa-video-slash stop"></i>
        <span>Yoqish</span>
    `;
    document.getElementById('playPauseVideo').classList.add('stop');
};
