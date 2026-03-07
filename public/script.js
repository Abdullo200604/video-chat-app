const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined, {
    path: '/peerjs',
    host: '/',
    port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    }
});

const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {};

let myVideoStream;

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
        // connectToNewUser called directly sometimes misses the stream, add short delay
        setTimeout(() => {
            connectToNewUser(userId, stream);
        }, 1000);
    });

    // Matnli xabar jo'natish
    let text = document.getElementById("chat_message");
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && text.value.length !== 0) {
            socket.emit('message', text.value);
            text.value = '';
        }
    });

    socket.on("createMessage", message => {
        const ul = document.querySelector(".messages");
        const li = document.createElement("li");
        li.innerHTML = `<b>Foydalanuvchi</b><br/>${message}`;
        ul.appendChild(li);
        scrollToBottom();
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
        video.play().catch(e => console.error("Video play error:", e));
    });
    videoGrid.append(video);
}

const scrollToBottom = () => {
    const chatWindow = document.querySelector('.main-chat-window');
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Ovozni yoqish/o'chirish
const muteUnmute = () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getAudioTracks()[0].enabled = false;
        setUnmuteButton();
    } else {
        myVideoStream.getAudioTracks()[0].enabled = true;
        setMuteButton();
    }
}

const setMuteButton = () => {
    const html = `
        <i class="fas fa-microphone"></i>
        <span>Ovoz</span>
    `
    document.getElementById('muteButton').innerHTML = html;
    document.getElementById('muteButton').classList.remove('unmute');
}

const setUnmuteButton = () => {
    const html = `
        <i class="fas fa-microphone-slash unmute"></i>
        <span>Ovoz yoqish</span>
    `
    document.getElementById('muteButton').innerHTML = html;
    document.getElementById('muteButton').classList.add('unmute');
}

// Videoni yoqish/o'chirish
const playStop = () => {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getVideoTracks()[0].enabled = false;
        setPlayVideo();
    } else {
        myVideoStream.getVideoTracks()[0].enabled = true;
        setStopVideo();
    }
}

const setStopVideo = () => {
    const html = `
        <i class="fas fa-video"></i>
        <span>Kamera</span>
    `
    document.getElementById('playPauseVideo').innerHTML = html;
    document.getElementById('playPauseVideo').classList.remove('stop');
}

const setPlayVideo = () => {
    const html = `
        <i class="fas fa-video-slash stop"></i>
        <span>Kamera yoqish</span>
    `
    document.getElementById('playPauseVideo').innerHTML = html;
    document.getElementById('playPauseVideo').classList.add('stop');
}
