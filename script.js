// --- DOM Elements ---
const gameContainer = document.getElementById('game-container');
const lanes = document.querySelectorAll('.lane');
const scoreDisplay = document.getElementById('score-display');
const comboDisplay = document.getElementById('combo-display');
const judgmentDisplay = document.getElementById('judgment-display');
const countdownDisplay = document.getElementById('countdown-display');
const startScreen = document.getElementById('start-screen');
const difficultyScreen = document.getElementById('difficulty-screen');
const passwordPrompt = document.getElementById('password-prompt');
const editorContainer = document.getElementById('editor-container');
const startButton = document.getElementById('start-button');
const editorButton = document.getElementById('editor-button');
const music = document.getElementById('music');
const bgmVolumeSlider = document.getElementById('bgm-volume');
const sfxVolumeSlider = document.getElementById('sfx-volume');
const mode4kButton = document.getElementById('mode-4k');
const mode6kButton = document.getElementById('mode-6k');
const songSelect = document.getElementById('song-select');
const songDisplay = document.getElementById('song-display');
const backToStartButton = document.getElementById('back-to-start');
const difficultyButtons = document.querySelectorAll('.difficulty-button');
const passwordInput = document.getElementById('password-input');
const passwordSubmit = document.getElementById('password-submit');
const passwordBack = document.getElementById('password-back');
const passwordError = document.getElementById('password-error');
const editorLanes = document.getElementById('editor-lanes');
const timelineCanvas = document.getElementById('editor-timeline-canvas');
const timelineScrubber = document.getElementById('timeline-scrubber');
const editorPlay = document.getElementById('editor-play');
const editorPause = document.getElementById('editor-pause');
const editorBpm = document.getElementById('editor-bpm');
const editorSave = document.getElementById('editor-save');
const editorExit = document.getElementById('editor-exit');

// --- Game Constants & State ---
const NOTE_HEIGHT = 20;
const GAME_HEIGHT = 600;
const JUDGMENT_LINE_Y = GAME_HEIGHT - 50;
const NOTE_TRAVEL_DURATION_S = 1.5;
const EDITOR_PASSWORD = '511119';

let score = 0, combo = 0, nextNoteIndex = 0;
let notes = [];
let gameStartTime = 0;
let isGameRunning = false;
let noteData = [];
let currentGameMode = 4;
let currentDifficulty = 'normal';
let audioContext, sfxGainNode;
let editorBeatmap = [];
let isEditorPlaying = false;

const songList = { "Nightmare Drop": { file: "Nightmare Drop.mp3", bpm: 200 } };
const keyMap4K = { 'd': 1, 'f': 2, 'j': 3, 'k': 4 };
const keyMap6K = { 's': 0, 'd': 1, 'f': 2, 'j': 3, 'k': 4, 'l': 5 };
let currentKeyMap = keyMap4K;

// --- Audio Setup ---
function setupAudio() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            sfxGainNode = audioContext.createGain();
            sfxGainNode.gain.value = sfxVolumeSlider.value;
            sfxGainNode.connect(audioContext.destination);
        } catch (e) { console.error('Web Audio API is not supported'); }
    }
}

function playHitSound() {
    if (!audioContext) return;
    const kickOsc = audioContext.createOscillator();
    const kickGain = audioContext.createGain();
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(150, audioContext.currentTime);
    kickOsc.frequency.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    kickGain.gain.setValueAtTime(1, audioContext.currentTime);
    kickGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    kickOsc.connect(kickGain).connect(sfxGainNode);
    kickOsc.start(audioContext.currentTime);
    kickOsc.stop(audioContext.currentTime + 0.5);

    const noise = audioContext.createBufferSource();
    const bufferSize = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) { output[i] = Math.random() * 2 - 1; }
    noise.buffer = buffer;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.5, audioContext.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    noise.connect(noiseGain).connect(sfxGainNode);
    noise.start(audioContext.currentTime);
    noise.stop(audioContext.currentTime + 0.2);
}

// --- Game Logic ---
function generateNoteData(songDuration, bpm) {
    noteData = [];
    const numLanes = currentGameMode;
    const difficultyParams = {
        easy:   { baseInterval: 2, complexity: 0.1, chordChance: 0.05 },
        normal: { baseInterval: 1, complexity: 0.25, chordChance: 0.1 },
        hard:   { baseInterval: 0.5, complexity: 0.5, chordChance: 0.2 },
        master: { baseInterval: 0.35, complexity: 0.75, chordChance: 0.3 }
    };
    const params = difficultyParams[currentDifficulty];
    const beatInterval = (60 / bpm) * 1000 * params.baseInterval;
    const totalBeats = Math.floor(songDuration * 1000 / beatInterval);
    let lastLane = -1;

    for (let i = 0; i < totalBeats; i++) {
        const time = i * beatInterval;
        if (Math.random() > params.complexity) continue;

        let lane;
        do { lane = Math.floor(Math.random() * numLanes); } while (lane === lastLane);
        noteData.push({ time, lane });
        lastLane = lane;

        if (Math.random() < params.chordChance) {
            let lane2;
            do { lane2 = Math.floor(Math.random() * numLanes); } while (lane2 === lane);
            noteData.push({ time, lane: lane2 });
        }
    }
    noteData.sort((a, b) => a.time - b.time);
}

function createNote(laneIndex, hitTime) {
    const note = document.createElement('div');
    note.className = 'note';
    note.style.top = `-${NOTE_HEIGHT}px`;
    lanes[laneIndex].appendChild(note);
    return { element: note, lane: laneIndex, hitTime };
}

function updateGame() {
    if (!isGameRunning) return;
    const elapsedTime = Date.now() - gameStartTime;

    while (nextNoteIndex < noteData.length && noteData[nextNoteIndex].time - (NOTE_TRAVEL_DURATION_S * 1000) <= elapsedTime) {
        const noteInfo = noteData[nextNoteIndex];
        notes.push(createNote(noteInfo.lane, noteInfo.time));
        nextNoteIndex++;
    }

    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const timeUntilHit = note.hitTime - elapsedTime;
        if (timeUntilHit < -200) {
            showJudgment('Miss');
            updateScore(0);
            resetCombo();
            note.element.remove();
            notes.splice(i, 1);
            continue;
        }
        const newPosition = (1 - (timeUntilHit / (NOTE_TRAVEL_DURATION_S * 1000))) * (JUDGMENT_LINE_Y - (NOTE_HEIGHT / 2));
        note.element.style.top = `${newPosition}px`;
    }
    requestAnimationFrame(updateGame);
}

function showJudgment(text) {
    judgmentDisplay.textContent = text;
    judgmentDisplay.style.opacity = 1;
    setTimeout(() => { judgmentDisplay.style.opacity = 0; }, 200);
}

function showCombo() {
    if (combo > 2) {
        comboDisplay.textContent = `${combo} Combo`;
        comboDisplay.style.opacity = 1;
        setTimeout(() => { comboDisplay.style.opacity = 0; }, 400);
    }
}

function updateScore(points) { if(points !== 0) score += points; scoreDisplay.textContent = `Score: ${score}`; }
function resetCombo() { combo = 0; }

function handleKeyPress(e) {
    if (!isGameRunning) return;
    const laneIndex = currentKeyMap[e.key.toLowerCase()];
    if (laneIndex === undefined) return;

    const currentTime = Date.now() - gameStartTime;
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.lane === laneIndex) {
            const timeDiff = Math.abs(currentTime - note.hitTime);
            if (timeDiff < 50) { showJudgment('Perfect'); updateScore(100); combo++; showCombo(); playHitSound(); note.element.remove(); notes.splice(i, 1); return; }
            else if (timeDiff < 100) { showJudgment('Great'); updateScore(50); combo++; showCombo(); playHitSound(); note.element.remove(); notes.splice(i, 1); return; }
            else if (timeDiff < 180) { showJudgment('Nice'); updateScore(30); combo++; showCombo(); playHitSound(); note.element.remove(); notes.splice(i, 1); return; }
        }
    }
}

function showCountdown(seconds) {
    gameContainer.style.display = 'block';
    if (seconds > 0) {
        countdownDisplay.textContent = seconds;
        countdownDisplay.style.opacity = 1;
        countdownDisplay.style.transform = 'scale(1)';
        setTimeout(() => {
            countdownDisplay.style.opacity = 0;
            countdownDisplay.style.transform = 'scale(1.5)';
            showCountdown(seconds - 1);
        }, 1000);
    } else {
        countdownDisplay.textContent = '';
        isGameRunning = true;
        gameStartTime = Date.now();
        music.play();
        requestAnimationFrame(updateGame);
    }
}

function setGameMode(mode) {
    currentGameMode = mode;
    gameContainer.classList.toggle('mode-6k', mode === 6);
    mode4kButton.classList.toggle('active', mode === 4);
    mode6kButton.classList.toggle('active', mode === 6);
    currentKeyMap = (mode === 6) ? keyMap6K : keyMap4K;
    lanes[0].style.display = (mode === 6) ? 'block' : 'none';
    lanes[5].style.display = (mode === 6) ? 'block' : 'none';
}

function initGame() {
    setupAudio();
    const selectedSongKey = songSelect.options[songSelect.selectedIndex].text;
    const songInfo = songList[selectedSongKey];
    // Check if there's a custom beatmap
    const customBeatmap = localStorage.getItem(`${selectedSongKey}_custom`);
    if (customBeatmap) {
        noteData = JSON.parse(customBeatmap);
    } else {
        generateNoteData(music.duration, songInfo.bpm);
    }
    difficultyScreen.style.display = 'none';
    showCountdown(3);
}

// --- UI & Navigation ---
function populateSongList() {
    for (const songTitle in songList) {
        const option = document.createElement('option');
        option.value = songList[songTitle].file;
        option.textContent = songTitle;
        songSelect.appendChild(option);
    }
}

function loadSong(songFile) { music.src = songFile; music.load(); }

function showScreen(screen) {
    [startScreen, difficultyScreen, passwordPrompt, editorContainer, gameContainer].forEach(s => s.style.display = 'none');
    screen.style.display = 'flex';
}

// --- Beatmap Editor Logic ---
const editorCtx = timelineCanvas.getContext('2d');
let pixelsPerSecond = 50;

function drawEditorTimeline() {
    const duration = music.duration;
    const bpm = parseInt(editorBpm.value, 10);
    const beatInterval = 60 / bpm;
    timelineCanvas.width = duration * pixelsPerSecond;
    timelineCanvas.height = editorLanes.clientHeight;

    editorCtx.fillStyle = '#222';
    editorCtx.fillRect(0, 0, timelineCanvas.width, timelineCanvas.height);

    // Draw beat lines
    for (let i = 0; i < duration / beatInterval; i++) {
        const x = i * beatInterval * pixelsPerSecond;
        editorCtx.strokeStyle = (i % 4 === 0) ? '#888' : '#555'; // Emphasize main beats
        editorCtx.beginPath();
        editorCtx.moveTo(x, 0);
        editorCtx.lineTo(x, timelineCanvas.height);
        editorCtx.stroke();
    }

    // Draw notes
    editorCtx.fillStyle = '#00ffff';
    editorBeatmap.forEach(note => {
        const x = note.time / 1000 * pixelsPerSecond;
        const y = (note.lane / currentGameMode) * timelineCanvas.height;
        const noteWidth = 10; // Note width in pixels
        const noteHeight = timelineCanvas.height / currentGameMode;
        editorCtx.fillRect(x - noteWidth / 2, y, noteWidth, noteHeight);
    });
}

function updateScrubber() {
    if (!music.paused) {
        const x = music.currentTime * pixelsPerSecond;
        timelineScrubber.style.left = `${x}px`;
        requestAnimationFrame(updateScrubber);
    }
}

function initEditor() {
    showScreen(editorContainer);
    setupAudio();
    const selectedSongKey = songSelect.options[songSelect.selectedIndex].text;
    const customBeatmap = localStorage.getItem(`${selectedSongKey}_custom`);
    editorBeatmap = customBeatmap ? JSON.parse(customBeatmap) : [];
    
    // Create lanes in editor
    editorLanes.innerHTML = '';
    for(let i = 0; i < currentGameMode; i++){
        const laneDiv = document.createElement('div');
        laneDiv.classList.add('editor-lane');
        laneDiv.dataset.lane = i;
        editorLanes.appendChild(laneDiv);
    }

    music.onloadedmetadata = drawEditorTimeline;
    if (music.readyState >= 1) drawEditorTimeline();
}

// --- Event Listeners ---
songSelect.addEventListener('change', (e) => {
    loadSong(e.target.value);
    songDisplay.textContent = `曲: ${e.target.options[e.target.selectedIndex].text}`;
});

startButton.addEventListener('click', () => {
    startScreen.style.display = 'none';
    difficultyScreen.style.display = 'flex';
});

editorButton.addEventListener('click', () => {
    showScreen(passwordPrompt);
});

passwordSubmit.addEventListener('click', () => {
    if (passwordInput.value === EDITOR_PASSWORD) {
        passwordInput.value = '';
        passwordError.textContent = '';
        initEditor();
    } else {
        passwordError.textContent = 'Incorrect Password.';
    }
});

passwordBack.addEventListener('click', () => showScreen(startScreen));

backToStartButton.addEventListener('click', () => {
    showScreen(startScreen);
});

difficultyButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        currentDifficulty = e.target.dataset.difficulty;
        initGame();
    });
});

music.addEventListener('loadedmetadata', () => { music.volume = 0.3; bgmVolumeSlider.value = 0.3; });
bgmVolumeSlider.addEventListener('input', (e) => { music.volume = e.target.value; });
sfxVolumeSlider.addEventListener('input', (e) => { if (sfxGainNode) sfxGainNode.gain.value = e.target.value; });
mode4kButton.addEventListener('click', () => setGameMode(4));
mode6kButton.addEventListener('click', () => setGameMode(6));
document.addEventListener('keydown', handleKeyPress);

// Editor Event Listeners
editorPlay.addEventListener('click', () => { music.play(); isEditorPlaying = true; updateScrubber(); });
editorPause.addEventListener('click', () => { music.pause(); isEditorPlaying = false; });
editorBpm.addEventListener('input', drawEditorTimeline);

timelineCanvas.addEventListener('click', (e) => {
    const rect = timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = (x / pixelsPerSecond) * 1000;
    const lane = Math.floor(y / (timelineCanvas.height / currentGameMode));

    // Add or remove note
    const existingNoteIndex = editorBeatmap.findIndex(note => Math.abs(note.time - time) < 20 && note.lane === lane);
    if (existingNoteIndex > -1) {
        editorBeatmap.splice(existingNoteIndex, 1);
    } else {
        editorBeatmap.push({ time, lane });
    }
    drawEditorTimeline();
});

editorSave.addEventListener('click', () => {
    const selectedSongKey = songSelect.options[songSelect.selectedIndex].text;
    localStorage.setItem(`${selectedSongKey}_custom`, JSON.stringify(editorBeatmap));
    alert('Beatmap saved!');
});

editorExit.addEventListener('click', () => {
    music.pause();
    showScreen(startScreen);
});


// --- INITIALIZATION ---
populateSongList();
loadSong(songSelect.value);
setGameMode(4);
showScreen(startScreen);