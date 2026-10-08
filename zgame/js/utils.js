import { SKILL_COOLDOWN } from './config.js';

// ============ DOM 工具 ============
export function $(id) { return document.getElementById(id); }
export function on(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn); }
export function txt(el, s) { if (el) el.textContent = s; }
export function cls(el, name, add) { if (el) el.classList[add ? 'add' : 'remove'](name); }
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

// ============ 音效 ============
let audioCtx = null;
export let soundEnabled = true;
export let musicEnabled = true;
export function setSoundEnabled(v) { soundEnabled = v; }
export function setMusicEnabled(v) { musicEnabled = v; }
export function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
export function getAudioCtx() { return audioCtx; }

function playTone(type, freq, freqEnd, duration, vol = 0.15, delay = 0) {
  if (!soundEnabled || !audioCtx) return;
  const t = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd && freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + duration);
}
function playNoise(duration, vol = 0.1, delay = 0) {
  if (!soundEnabled || !audioCtx) return;
  const t = audioCtx.currentTime + delay;
  const size = audioCtx.sampleRate * duration;
  const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 1200;
  src.connect(f); f.connect(gain); gain.connect(audioCtx.destination);
  src.start(t); src.stop(t + duration);
}

export const SFX = {
  shoot() { playTone('square', 880, 220, 0.08, 0.07); },
  shotgun() { playNoise(0.12, 0.12); playTone('sawtooth', 200, 60, 0.15, 0.1); },
  sniper() { playTone('sawtooth', 1500, 300, 0.15, 0.12); playNoise(0.1, 0.08); },
  machine() { playTone('square', 700, 400, 0.05, 0.05); },
  hit() { playTone('square', 200, 60, 0.12, 0.11); playNoise(0.08, 0.07); },
  hurt() { playTone('sawtooth', 400, 100, 0.18, 0.11); },
  win() { [523, 659, 784, 1047].forEach((f, i) => playTone('triangle', f, f, 0.15, 0.11, i * 0.12)); },
  lose() { [400, 300, 200].forEach((f, i) => playTone('triangle', f, f, i === 2 ? 0.4 : 0.2, 0.11, i * 0.2)); },
  start() { playTone('sine', 440, 880, 0.2, 0.11, 0); },
  obstacle() { playTone('triangle', 300, 150, 0.1, 0.06); },
  zombieDie() { playTone('sawtooth', 300, 60, 0.25, 0.1); playNoise(0.15, 0.08, 0.05); },
  zombieSpawn() { playTone('sawtooth', 120, 80, 0.3, 0.08); },
  zombieHit() { playTone('square', 400, 100, 0.08, 0.07); },
  bossSpawn() { playTone('sawtooth', 80, 40, 0.8, 0.2); playTone('square', 200, 100, 0.6, 0.15, 0.2); playNoise(0.5, 0.15); },
  bossShoot() { playTone('square', 300, 100, 0.15, 0.12); playNoise(0.1, 0.1); },
  bossDie() { playTone('sawtooth', 200, 30, 1.0, 0.25); playNoise(0.8, 0.2); playTone('triangle', 500, 100, 0.6, 0.15, 0.3); },
  dash() { playTone('sine', 600, 1400, 0.2, 0.12); },
  shield() { playTone('triangle', 300, 900, 0.3, 0.12); },
  ultimate() { playTone('sawtooth', 100, 800, 0.4, 0.15); playNoise(0.3, 0.12); },
  pickup() { playTone('sine', 660, 990, 0.12, 0.12); playTone('sine', 990, 1320, 0.1, 0.1, 0.08); },
  reload() { playTone('square', 400, 200, 0.1, 0.08); },
  combo(n) { const base = 600 + n * 80; playTone('triangle', base, base * 1.5, 0.15, 0.13); },
  chat() { playTone('sine', 800, 1200, 0.08, 0.08); },
  slowmo() { playTone('sine', 200, 100, 0.5, 0.1); playNoise(0.3, 0.05); },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => playTone('sine', f, f * 1.5, 0.2, 0.13, i * 0.08)); },
  heartbeat() { playTone('sine', 60, 40, 0.3, 0.15); },
};

// ============ 背景音乐 ============
let musicNodes = [];
let musicTimer = null;
let musicStep = 0;
let musicGain = null;
const MUSIC_PATTERN = [
  { f: 261.63, d: 1 }, { f: 329.63, d: 1 }, { f: 392.00, d: 1 }, { f: 329.63, d: 1 },
  { f: 293.66, d: 1 }, { f: 349.23, d: 1 }, { f: 440.00, d: 1 }, { f: 349.23, d: 1 },
  { f: 261.63, d: 1 }, { f: 329.63, d: 1 }, { f: 392.00, d: 1 }, { f: 523.25, d: 1 },
  { f: 440.00, d: 2 }, { f: 392.00, d: 1 }, { f: 329.63, d: 1 }, { f: 293.66, d: 2 },
];
export function startMusic(shouldPlay = true) {
  if (!musicEnabled || !audioCtx || !shouldPlay) return;
  stopMusic();
  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.04;
  musicGain.connect(audioCtx.destination);
  musicStep = 0;
  scheduleNextNote();
}
function scheduleNextNote() {
  if (!musicEnabled || !audioCtx || !musicGain) return;
  const note = MUSIC_PATTERN[musicStep % MUSIC_PATTERN.length];
  const dur = note.d * 0.5;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = note.f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.8, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
  osc.connect(g); g.connect(musicGain);
  osc.start(t); osc.stop(t + dur);
  musicNodes.push(osc);
  if (musicStep % 4 === 0) {
    const b = audioCtx.createOscillator();
    const bg = audioCtx.createGain();
    b.type = 'sine'; b.frequency.value = note.f / 4;
    bg.gain.setValueAtTime(0.6, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.8);
    b.connect(bg); bg.connect(musicGain);
    b.start(t); b.stop(t + dur * 2);
    musicNodes.push(b);
  }
  musicStep++;
  musicTimer = setTimeout(scheduleNextNote, dur * 1000);
}
export function stopMusic() {
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  for (const n of musicNodes) { try { n.stop(); } catch(e) {} }
  musicNodes = [];
  if (musicGain) { try { musicGain.disconnect(); } catch(e) {} musicGain = null; }
}

// ============ 粒子系统 ============
export const particles = [];
const MAX_PARTICLES = 400;

export function spawnParticles(x, y, options = {}) {
  const {
    count = 12, color = '#ffaa4d', speed = 4, size = 3,
    life = 40, gravity = 0.05, spread = Math.PI * 2, angle = 0,
    fade = true, shape = 'circle',
  } = options;
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const s = speed * (0.5 + Math.random() * 0.8);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life, maxLife: life, color, size: size * (0.6 + Math.random() * 0.8),
      gravity, fade, shape,
    });
  }
  if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
}
export function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.96; p.vy *= 0.96;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ============ 玩家工厂 ============
export function createPlayer(role, myNickname, opponentNickname, skin) {
  const isRed = role === 'red';
  return {
    role,
    name: isRed ? myNickname : opponentNickname,
    x: isRed ? 200 : WORLD_W - 200,
    y: WORLD_H / 2,
    hp: 100, maxHp: 100, hpSeq: 0,
    cooldown: 0,
    facing: isRed ? 0 : Math.PI,
    skillCD: { dash: 0, shield: 0, ultimate: 0 },
    shieldActive: 0,
    dashFrames: 0, dashVx: 0, dashVy: 0,
    weapon: 'pistol',
    ammo: Infinity,
    reloadTimer: 0,
    speedTimer: 0, invisibleTimer: 0, doubleTimer: 0,
    kills: 0, deaths: 0, assists: 0, dead: false,
    // 升级相关
    level: 1, xp: 0,
    dmgMult: 1, speedMult: 1, reloadMult: 1, shieldDurMult: 1,
    cdMult: { dash: 1, shield: 1, ultimate: 1 },
    pierce: 0, critChance: 0, lifesteal: 0, pickupRange: 1,
    // 统计
    stats: { shotsFired: 0, shotsHit: 0, maxCombo: 0, startTime: Date.now() },
    // 皮肤
    skin: skin || null,
  };
}

// 引入常量
import { WORLD_W, WORLD_H } from './config.js';
