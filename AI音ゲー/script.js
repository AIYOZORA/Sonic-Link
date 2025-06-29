
const gameContainer = document.getElementById('game-container');
const lanes = document.querySelectorAll('.lane');
const scoreDisplay = document.getElementById('score-display');
const comboDisplay = document.getElementById('combo-display');
const judgmentDisplay = document.getElementById('judgment-display');
const countdownDisplay = document.getElementById('countdown-display');
const startScreen = document.getElementById('start-screen');
const difficultyScreen = document.getElementById('difficulty-screen');
const startButton = document.getElementById('start-button');
const music = document.getElementById('music');
const bgmVolumeSlider = document.getElementById('bgm-volume');
const sfxVolumeSlider = document.getElementById('sfx-volume');
const mode4kButton = document.getElementById('mode-4k');
const mode6kButton = document.getElementById('mode-6k');
const songSelect = document.getElementById('song-select');
const songDisplay = document.getElementById('song-display');
const backToStartButton = document.getElementById('back-to-start');
const difficultyButtons = document.querySelectorAll('.difficulty-button');

const NOTE_HEIGHT = 20;
const GAME_HEIGHT = 600;
const JUDGMENT_LINE_Y = GAME_HEIGHT - 50;
const NOTE_TRAVEL_DURATION_S = 1.5;

let score = 0, combo = 0, nextNoteIndex = 0;
let notes = [];
let gameStartTime = 0;
let isGameRunning = false;
let noteData = [];
let currentGameMode = 4;
let currentDifficulty = 'normal';

const songList = { "Nightmare Drop": { file: "Nightmare Drop.mp3", bpm: 200 } };

const keyMap4K = { 'd': 1, 'f': 2, 'j': 3, 'k': 4 };
const keyMap6K = { 's': 0, 'd': 1, 'f': 2, 'j': 3, 'k': 4, 'l': 5 };
let currentKeyMap = keyMap4K;

let audioContext, sfxGainNode;

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
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.8, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, audioContext.currentTime);
    osc.connect(gain).connect(sfxGainNode);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.2);
}

function generateNoteData(songDuration, bpm) {
    noteData = [];
    const numLanes = currentGameMode;
    const difficultyParams = {
        easy:   { baseInterval: 2, complexity: 0.1, chordChance: 0.05 },
        normal: { baseInterval: 1, complexity: 0.25, chordChance: 0.1 },
        hard:   { baseInterval: 0.5, complexity: 0.5, chordChance: 0.2 },
        master: { baseInterval: 0.25, complexity: 0.75, chordChance: 0.3 }
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
        if (timeUntilHit < -200) { // Increased miss window
            showJudgment('Miss');
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

function updateScore(points) { score += points; scoreDisplay.textContent = `Score: ${score}`; }
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
            if (timeDiff < 100) { // Increased perfect window
                showJudgment('Perfect'); updateScore(100); combo++; showCombo(); playHitSound();
                note.element.remove(); notes.splice(i, 1); return;
            } else if (timeDiff < 180) { // Increased great window
                showJudgment('Great'); updateScore(50); combo++; showCombo(); playHitSound();
                note.element.remove(); notes.splice(i, 1); return;
            }
        }
    }
}

function showCountdown(seconds) {
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
    generateNoteData(music.duration, songInfo.bpm);
    difficultyScreen.style.display = 'none';
    showCountdown(3);
}

function populateSongList() {
    for (const songTitle in songList) {
        const option = document.createElement('option');
        option.value = songList[songTitle].file;
        option.textContent = songTitle;
        songSelect.appendChild(option);
    }
}

function loadSong(songFile) { music.src = songFile; music.load(); }

// --- Event Listeners ---
songSelect.addEventListener('change', (e) => {
    loadSong(e.target.value);
    songDisplay.textContent = `曲: ${e.target.options[e.target.selectedIndex].text}`;
});

startButton.addEventListener('click', () => {
    startScreen.style.display = 'none';
    difficultyScreen.style.display = 'flex';
});

backToStartButton.addEventListener('click', () => {
    difficultyScreen.style.display = 'none';
    startScreen.style.display = 'flex';
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

// --- INITIALIZATION ---
populateSongList();
loadSong(songSelect.value);
setGameMode(4);
