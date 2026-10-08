import {
  W, H, WORLD_W, WORLD_H,
  PLAYER_SIZE, PLAYER_SPEED, BULLET_SPEED, BULLET_SIZE, DAMAGE_AMOUNT,
  ZOMBIE_MAX_COUNT, ZOMBIE_SIZE,
  SKILL_COOLDOWN, DASH_DURATION, DASH_SPEED, SHIELD_DURATION,
  PICKUP_SIZE, PICKUP_LIFETIME, BUFF_DURATION, BUFF_SPEED_MULT, BUFF_DOUBLE_MULT,
  WEAPONS, WEAPON_ORDER, THEMES, COMBO_WINDOW, COMBO_MILESTONES,
  SLOWMO_DURATION, XP_PER_LEVEL, BOSS_BASE_HP,
} from './config.js';
import {
  $, txt, cls, on, createPlayer, SFX, spawnParticles,
  updateParticles, startMusic, stopMusic, soundEnabled, musicEnabled,
  setSoundEnabled, setMusicEnabled, initAudio, getAudioCtx,
} from './utils.js';
import { draw, drawMinimap, initCtx, getGridCanvas } from './render.js';
import {
  spawnZombie, spawnBoss, updateZombiesAndBosses, explodeAt,
  spawnSplitterChildren, rectsOverlap, playerHitsObstacle, bulletHitsObstacle,
} from './entities.js';
import { checkLevelUp, setGameRef } from './upgrades.js';
import { getCurrentSkin } from './firebase.js';

// ============ 状态 ============
export const G = {
  peer: null, conn: null, isHost: false, roomCode: '', myRole: 'red',
  gameRunning: false, isSoloMode: false,
  myNickname: '玩家', opponentNickname: '对手',
  gameMode: 'pvp', frameCount: 0,
  autoAim: true,
  processedHits: new Set(),
  remoteHpSeq: 0,
  comboCount: 0, comboTimer: 0,
  screenShake: 0, screenShakeRef: { value: 0 },
  slowmoTimer: 0,
  mouseX: 600, mouseY: 350, mouseDown: false,
  redPlayer: null, bluePlayer: null,
  scoreRed: 0, scoreBlue: 0,
  zombies: [], bosses: [], obstacles: [], bullets: [], damageTexts: [], pickups: [],
  zombieKills: 0, zombieWave: 1, waveTimer: 0, spawnTimer: 0,
  pickupIdCounter: 0,
  currentTheme: 'space',
  camera: { x: 0, y: 0 },
  currentSkin: null,
  roundNumber: 1,
  spectating: false, spectatorTarget: null,
  settings: {
    friendlyFire: false, infiniteAmmo: false, zombieSpeedMult: 1, bossEvery: 10,
  },
  inputLocked: false,
};

// ============ 键盘 ============
const keysDown = new Set();
const keyTimers = new Map();
const GAME_KEYS = ['KeyW','KeyA','KeyS','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','KeyR','KeyT','Digit1','Digit2','Digit3','Digit4','Digit5'];
export function isKeyDown(c) { return keysDown.has(c); }
export function clearAllKeys() {
  keysDown.clear();
  for (const t of keyTimers.values()) clearTimeout(t);
  keyTimers.clear();
}
function clearKey(c) {
  keysDown.delete(c);
  if (keyTimers.has(c)) { clearTimeout(keyTimers.get(c)); keyTimers.delete(c); }
}
function keyDown(logical) {
  switch (logical) {
    case 'w': return isKeyDown('KeyW') || isKeyDown('ArrowUp');
    case 'a': return isKeyDown('KeyA') || isKeyDown('ArrowLeft');
    case 's': return isKeyDown('KeyS') || isKeyDown('ArrowDown');
    case 'd': return isKeyDown('KeyD') || isKeyDown('ArrowRight');
    case 'space': return isKeyDown('Space');
    default: return false;
  }
}
const justPressed = new Set();
function consumePress(c) {
  if (justPressed.has(c)) { justPressed.delete(c); return true; }
  return false;
}
export let chatPanelOpen = false;
export function setChatPanelOpen(v) { chatPanelOpen = v; }

let chatPanelEl, chatMessagesEl;

export function initInput() {
  chatPanelEl = $('chatPanel');
  chatMessagesEl = $('chatMessages');

  window.addEventListener('keydown', (e) => {
    if (!G.gameRunning && !chatPanelOpen) return;
    if (!GAME_KEYS.includes(e.code) && e.code !== 'Escape') return;
    e.preventDefault();
    if (e.repeat) return;
    if (chatPanelOpen) {
      const idx = ['Digit1','Digit2','Digit3','Digit4','Digit5'].indexOf(e.code);
      if (idx !== -1) {
        const opt = chatPanelEl ? chatPanelEl.querySelectorAll('.chat-option')[idx] : null;
        if (opt) sendChatMessage(opt.dataset.msg);
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyT') { closeChatPanel(); return; }
      return;
    }
    keysDown.add(e.code);
    justPressed.add(e.code);
    if (keyTimers.has(e.code)) clearTimeout(keyTimers.get(e.code));
    keyTimers.set(e.code, setTimeout(() => clearKey(e.code), 3000));
  });
  window.addEventListener('keyup', (e) => {
    if (!GAME_KEYS.includes(e.code)) return;
    e.preventDefault();
    clearKey(e.code);
  });
  window.addEventListener('blur', clearAllKeys);
  window.addEventListener('visibilitychange', () => { if (document.hidden) clearAllKeys(); });
  document.addEventListener('mouseleave', clearAllKeys);
}

export function initMouse(canvas) {
  on(canvas, 'mousemove', (e) => {
    if (!G.gameRunning || G.autoAim) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    G.mouseX = (e.clientX - rect.left) * sx + G.camera.x;
    G.mouseY = (e.clientY - rect.top) * sy + G.camera.y;
  });
  on(canvas, 'mousedown', (e) => {
    if (!G.gameRunning || G.autoAim) return;
    if (e.button !== 0) return;
    G.mouseDown = true; e.preventDefault();
  });
  on(canvas, 'mouseup', (e) => { if (e.button === 0) G.mouseDown = false; });
  on(canvas, 'mouseleave', () => { G.mouseDown = false; });
  on(canvas, 'contextmenu', (e) => e.preventDefault());
}

// ============ 聊天 ============
export function openChatPanel() { chatPanelOpen = true; cls(chatPanelEl, 'visible', true); }
export function closeChatPanel() { chatPanelOpen = false; cls(chatPanelEl, 'visible', false); }
export function sendChatMessage(msg) {
  if (!msg) return;
  closeChatPanel();
  showChatBubble(G.myNickname, msg, true);
  SFX.chat();
  if (!G.isSoloMode) safeSend({ type: 'chat', msg });
}
export function showChatBubble(sender, msg, isMine) {
  if (!chatMessagesEl) return;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble' + (isMine ? ' mine' : '');
  bubble.innerHTML = `<span class="sender">${escape(sender)}:</span>${escape(msg)}`;
  chatMessagesEl.appendChild(bubble);
  setTimeout(() => {
    bubble.style.transition = 'opacity 0.4s, transform 0.4s';
    bubble.style.opacity = '0';
    bubble.style.transform = 'translateY(-10px)';
    setTimeout(() => bubble.remove(), 400);
  }, 2500);
}
function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

// ============ 击杀播报 ============
export function addKillFeed(killer, victim, weaponIcon) {
  const feed = $('killFeed');
  if (!feed) return;
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  entry.innerHTML = `<span class="killer">${escape(killer)}</span><span class="weapon-icon">${weaponIcon || '⚔️'}</span><span class="victim">${escape(victim)}</span>`;
  feed.appendChild(entry);
  setTimeout(() => {
    entry.style.transition = 'opacity 0.4s, transform 0.4s';
    entry.style.opacity = '0';
    entry.style.transform = 'translateX(40px)';
    setTimeout(() => entry.remove(), 400);
  }, 3500);
  // 最多 5 条
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
}

// ============ 伤害飘字 ============
export function spawnDamageText(x, y, amount, color, text = null, big = false) {
  G.damageTexts.push({
    x: x + (Math.random() * 20 - 10),
    y: y - 10,
    text: text || ('-' + amount),
    color, life: big ? 100 : 60, maxLife: big ? 100 : 60,
    vy: big ? -2.2 : -1.6, vx: (Math.random() * 0.8 - 0.4),
    size: big ? 32 : 18,
  });
}
function updateDamageTexts() {
  for (let i = G.damageTexts.length - 1; i >= 0; i--) {
    const dt = G.damageTexts[i];
    dt.x += dt.vx; dt.y += dt.vy;
    dt.vy *= 0.96; dt.life--;
    if (dt.life <= 0) G.damageTexts.splice(i, 1);
  }
}

// ============ 连击 ============
function addCombo() {
  G.comboCount++;
  G.comboTimer = COMBO_WINDOW;
  txt($('comboDisplay'), G.comboCount);
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (me && G.comboCount > (me.stats.maxCombo || 0)) me.stats.maxCombo = G.comboCount;
  if (COMBO_MILESTONES.includes(G.comboCount)) {
    SFX.combo(G.comboCount);
    const colors = ['#4dd4ff', '#4dff8b', '#ffd24d', '#ff6bd2', '#ff4d6d'];
    const c = colors[Math.min(Math.floor(G.comboCount / 5), colors.length - 1)];
    spawnDamageText(me.x, me.y - 100, 0, c, G.comboCount + ' 连击!', true);
    G.screenShake = 12;
  } else SFX.combo(G.comboCount);
}
function resetCombo() {
  G.comboCount = 0; G.comboTimer = 0;
  txt($('comboDisplay'), 0);
}

// ============ 慢动作 ============
function triggerSlowmo() {
  G.slowmoTimer = SLOWMO_DURATION;
  SFX.slowmo();
  cls($('slowmoOverlay'), 'active', true);
  cls($('slowmoText'), 'active', true);
  cls($('gameCanvas'), 'slowmo', true);
}
function endSlowmo() {
  G.slowmoTimer = 0;
  cls($('slowmoOverlay'), 'active', false);
  cls($('slowmoText'), 'active', false);
  cls($('gameCanvas'), 'slowmo', false);
}
function updateSlowmo() {
  if (G.slowmoTimer > 0) {
    G.slowmoTimer--;
    if (G.slowmoTimer === 0) endSlowmo();
  }
}

// ============ 网络 ============
export function safeSend(data) {
  if (G.isSoloMode) return false;
  if (G.conn && G.conn.open) {
    try { G.conn.send(data); return true; } catch(e) { return false; }
  }
  return false;
}
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
export function initPeer(peerId) {
  return new Promise((resolve, reject) => {
    if (G.peer && !G.peer.destroyed) { try { G.peer.destroy(); } catch(e) {} }
    G.peer = new Peer(peerId, { debug: 1 });
    const timeout = setTimeout(() => reject(new Error('连接超时')), 12000);
    G.peer.on('open', () => { clearTimeout(timeout); resolve(G.peer); });
    G.peer.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

// ============ 消息处理 ============
export function handleMessage(data) {
  if (!data || !data.type) return;
  switch (data.type) {
    case 'assignRole':
      G.myRole = data.role;
      G.gameMode = data.mode || 'pvp';
      G.opponentNickname = data.hostName || '房主';
      if (data.autoAim !== undefined) { G.autoAim = data.autoAim; }
      if (data.settings) G.settings = { ...G.settings, ...data.settings };
      safeSend({ type: 'playerReady', nickname: G.myNickname });
      break;
    case 'playerReady':
      G.opponentNickname = data.nickname || '对手';
      if (G.isHost) startGame();
      break;
    case 'startGame':
      startGame();
      break;
    case 'autoAimUpdate':
      G.autoAim = data.autoAim;
      break;
    case 'roomSettings':
      G.settings = { ...G.settings, ...data.settings };
      break;
    case 'playerUpdate': {
      const target = data.role === 'red' ? G.redPlayer : G.bluePlayer;
      if (target && data.role !== G.myRole) {
        target.x = data.x; target.y = data.y;
        if (data.hp !== undefined) target.hp = data.hp;
        if (data.facing !== undefined) target.facing = data.facing;
        if (data.shieldActive !== undefined) target.shieldActive = data.shieldActive;
        if (data.invisible !== undefined) target.invisibleTimer = data.invisible ? 30 : 0;
        if (data.name) target.name = data.name;
      }
      break;
    }
    case 'bulletSpawn':
      if (data.bullet && data.bullet.owner !== G.myRole) G.bullets.push(data.bullet);
      break;
    case 'hit': {
      if (data.targetRole === G.myRole && G.gameMode === 'pvp') {
        if (G.processedHits.has(data.bulletId)) break;
        G.processedHits.add(data.bulletId);
        const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
        if (!me) break;
        if (me.shieldActive > 0) {
          spawnDamageText(data.hitX, data.hitY, 0, '#4dd4ff', '🛡');
          const idx = G.bullets.findIndex(b => b.id === data.bulletId);
          if (idx !== -1) G.bullets.splice(idx, 1);
          safeSend({ type: 'hpUpdate', role: G.myRole, hp: me.hp, seq: ++me.hpSeq });
          break;
        }
        me.hp = Math.max(0, me.hp - data.damage);
        SFX.hurt();
        spawnDamageText(data.hitX, data.hitY, data.damage, '#ff4d4d');
        safeSend({ type: 'hpUpdate', role: G.myRole, hp: me.hp, seq: ++me.hpSeq });
        if (me.hp <= 0) me.dead = true;
      }
      break;
    }
    case 'hpUpdate': {
      const target = data.role === 'red' ? G.redPlayer : G.bluePlayer;
      if (target && data.role !== G.myRole) {
        if (data.seq !== undefined && data.seq > G.remoteHpSeq) {
          target.hp = data.hp;
          G.remoteHpSeq = data.seq;
        } else if (data.seq === undefined) {
          target.hp = data.hp;
        }
      }
      break;
    }
    case 'pickupSpawn': G.pickups.push(data.pickup); break;
    case 'pickupCollected': G.pickups = G.pickups.filter(p => p.id !== data.pickupId); break;
    case 'chat': showChatBubble(G.opponentNickname, data.msg, false); SFX.chat(); break;
    case 'roundEnd': handleRoundEnd(data.winner, data.scoreRed, data.scoreBlue); break;
    case 'nextRound':
      G.obstacles = data.obstacles || [];
      if (data.theme) { G.currentTheme = data.theme; }
      if (data.round) G.roundNumber = data.round;
      if (G.gameMode === 'zombie') startZombieModeLocally(data.role);
      else startRoundLocally(data.role, false);
      break;
    case 'zombieState':
      if (G.myRole === 'blue') {
        G.zombies = data.zombies || [];
        G.bosses = data.bosses || [];
        G.zombieKills = data.kills || 0;
        G.zombieWave = data.wave || 1;
      }
      break;
    case 'zombieHit':
      if (G.isHost) {
        const z = G.zombies.find(zz => zz.id === data.zombieId);
        const b = G.bosses.find(bb => bb.id === data.zombieId);
        const target = z || b;
        if (target && target.hp > 0) {
          target.hp -= data.damage;
          if (target.hp <= 0) {
            if (z) {
              G.zombies = G.zombies.filter(zz => zz.id !== z.id);
              G.zombieKills += z.xp || 1;
              SFX.zombieDie();
              spawnParticles(z.x, z.y, { count: 18, color: '#8ac05a', speed: 6, life: 45, gravity: 0.1 });
              spawnDamageText(z.x, z.y, 0, '#ffaa4d', '💀');
              safeSend({ type: 'zombieDied', zombieId: z.id, x: z.x, y: z.y });
              if (Math.random() < 0.25) spawnPickup(z.x, z.y, 'health');
              if (Math.random() < 0.08) spawnPickup(z.x, z.y, 'speed');
              if (Math.random() < 0.08) spawnPickup(z.x, z.y, 'invisible');
              if (Math.random() < 0.08) spawnPickup(z.x, z.y, 'double');
              // 分裂
              if (z.type === 'splitter') spawnSplitterChildren(z, G.zombies);
            } else if (b) {
              G.bosses = G.bosses.filter(bb => bb.id !== b.id);
              G.zombieKills += 10;
              SFX.bossDie();
              G.screenShake = 25;
              spawnParticles(b.x, b.y, { count: 60, color: '#ff4d6d', speed: 12, life: 80, size: 5 });
              spawnDamageText(b.x, b.y, 0, '#ff4d6d', 'BOSS 击杀!', true);
              safeSend({ type: 'zombieDied', zombieId: b.id, x: b.x, y: b.y, isBoss: true });
              spawnPickup(b.x, b.y, 'health');
              spawnPickup(b.x + 40, b.y, 'double');
            }
          } else {
            if (z) { SFX.zombieHit(); safeSend({ type: 'zombieDamaged', zombieId: z.id, x: z.x, y: z.y, damage: data.damage }); }
            else { SFX.hit(); safeSend({ type: 'zombieDamaged', zombieId: b.id, x: b.x, y: b.y, damage: data.damage }); }
          }
        }
      }
      break;
    case 'zombieDamaged':
      if (G.myRole !== 'red' || G.isSoloMode) {
        spawnDamageText(data.x, data.y, data.damage, '#ffaa4d');
        SFX.zombieHit(); addCombo();
      }
      break;
    case 'zombieDied':
      if (G.myRole !== 'red' || G.isSoloMode) {
        const deadZ = G.zombies.find(zz => zz.id === data.zombieId);
        G.zombies = G.zombies.filter(zz => zz.id !== data.zombieId);
        G.bosses = G.bosses.filter(bb => bb.id !== data.zombieId);
        if (data.isBoss) {
          SFX.bossDie(); G.screenShake = 25;
          spawnParticles(data.x, data.y, { count: 60, color: '#ff4d6d', speed: 12, life: 80, size: 5 });
          spawnDamageText(data.x, data.y, 0, '#ff4d6d', 'BOSS 击杀!', true);
        } else {
          spawnParticles(data.x, data.y, { count: 18, color: '#8ac05a', speed: 6, life: 45, gravity: 0.1 });
          spawnDamageText(data.x, data.y, 0, '#ffaa4d', '💀');
          SFX.zombieDie();
          if (deadZ && deadZ.type === 'splitter') spawnSplitterChildren(deadZ, G.zombies);
        }
      }
      break;
    case 'zombieAttack':
      if (G.myRole === data.role) { SFX.hurt(); spawnDamageText(data.x, data.y, data.damage, '#ff4d4d'); }
      break;
    case 'gameOver':
      G.gameRunning = false;
      stopMusic();
      SFX.lose();
      setTimeout(() => {
        alert('💀 被僵尸击败！\n击杀数：' + data.kills + '  波次：' + data.wave);
        cleanupAndReturnToLobby();
      }, 200);
      break;
    case 'leave':
      if (G.gameRunning) { alert('对手离开了房间'); cleanupAndReturnToLobby(); }
      break;
  }
}

// ============ 掉落物 ============
export function spawnPickup(x, y, type) {
  const p = { id: 'p-' + (G.pickupIdCounter++), x, y, type, life: PICKUP_LIFETIME, bob: Math.random() * Math.PI * 2 };
  G.pickups.push(p);
  safeSend({ type: 'pickupSpawn', pickup: p });
}
function updatePickups() {
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.life--; p.bob += 0.1;
    if (p.life <= 0) { G.pickups.splice(i, 1); continue; }
    const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
    if (!me || me.dead) continue;
    const range = (PLAYER_SIZE + PICKUP_SIZE) / 2 * (me.pickupRange || 1);
    if (Math.hypot(me.x - p.x, me.y - p.y) < range) {
      applyPickup(me, p.type);
      G.pickups.splice(i, 1);
      safeSend({ type: 'pickupCollected', pickupId: p.id });
      SFX.pickup();
    }
  }
}
function applyPickup(player, type) {
  switch (type) {
    case 'health':
      player.hp = Math.min(player.maxHp, player.hp + 30);
      spawnDamageText(player.x, player.y, 0, '#4dff8b', '+30', true);
      break;
    case 'speed': player.speedTimer = BUFF_DURATION; break;
    case 'invisible': player.invisibleTimer = BUFF_DURATION; break;
    case 'double': player.doubleTimer = BUFF_DURATION; break;
  }
}

// ============ 武器 ============
function switchWeapon(idx) {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (!me) return;
  const key = WEAPON_ORDER[idx - 1];
  if (!key || me.weapon === key) return;
  me.weapon = key;
  me.ammo = WEAPONS[key].ammo;
  me.reloadTimer = 0;
  SFX.reload();
}
function reloadWeapon() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  const w = WEAPONS[me.weapon];
  if (w.ammo === Infinity) return;
  me.ammo = w.ammo;
  SFX.reload();
}

// ============ 技能 ============
function useDash() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (!me || me.skillCD.dash > 0 || me.dashFrames > 0) return;
  const opponent = G.myRole === 'red' ? G.bluePlayer : G.redPlayer;
  let targetX, targetY;
  if (G.gameMode === 'pvp' && opponent) { targetX = opponent.x; targetY = opponent.y; }
  else {
    let nearest = null, minD = Infinity;
    const allZ = [...G.zombies, ...G.bosses];
    for (const z of allZ) {
      const d = Math.hypot(z.x - me.x, z.y - me.y);
      if (d < minD) { minD = d; nearest = z; }
    }
    if (nearest) { targetX = nearest.x; targetY = nearest.y; }
    else { targetX = me.x + Math.cos(me.facing) * 100; targetY = me.y + Math.sin(me.facing) * 100; }
  }
  const dx = targetX - me.x, dy = targetY - me.y;
  const d = Math.hypot(dx, dy) || 1;
  me.dashVx = (dx / d) * DASH_SPEED;
  me.dashVy = (dy / d) * DASH_SPEED;
  me.dashFrames = DASH_DURATION;
  me.skillCD.dash = SKILL_COOLDOWN.dash * (me.cdMult ? me.cdMult.dash : 1);
  SFX.dash();
  spawnParticles(me.x, me.y, { count: 12, color: '#4dd4ff', speed: 3, life: 25, size: 3 });
}
function useShield() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (!me || me.skillCD.shield > 0) return;
  const dur = SHIELD_DURATION * (me.shieldDurMult || 1);
  me.shieldActive = dur;
  me.skillCD.shield = SKILL_COOLDOWN.shield * (me.cdMult ? me.cdMult.shield : 1);
  SFX.shield();
  spawnParticles(me.x, me.y, { count: 24, color: '#4dd4ff', speed: 5, life: 30, size: 3 });
  spawnDamageText(me.x, me.y - 20, 0, '#4dd4ff', '🛡', true);
}
function useUltimate() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (!me || me.skillCD.ultimate > 0) return;
  me.skillCD.ultimate = SKILL_COOLDOWN.ultimate * (me.cdMult ? me.cdMult.ultimate : 1);
  SFX.ultimate();
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const bullet = {
      id: Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 4),
      x: me.x, y: me.y,
      vx: Math.cos(angle) * BULLET_SPEED * 1.2,
      vy: Math.sin(angle) * BULLET_SPEED * 1.2,
      owner: G.myRole, size: BULLET_SIZE, life: 180, damage: 20, color: '#ff4dff',
    };
    G.bullets.push(bullet);
    safeSend({ type: 'bulletSpawn', bullet });
  }
  spawnParticles(me.x, me.y, { count: 40, color: '#ff4dff', speed: 10, life: 40, size: 4, spread: Math.PI * 2 });
}

// ============ 广播 ============
function broadcastPlayerState() {
  if (G.isSoloMode) return;
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (!me) return;
  safeSend({
    type: 'playerUpdate', role: G.myRole,
    x: me.x, y: me.y, hp: me.hp, facing: me.facing,
    shieldActive: me.shieldActive, invisible: me.invisibleTimer > 0,
    name: G.myNickname,
  });
}
function broadcastBullet(bullet) { safeSend({ type: 'bulletSpawn', bullet }); }

// ============ 开始游戏 ============
export function startSoloGame(myNickname) {
  G.isSoloMode = true;
  G.gameMode = 'zombie';
  G.currentTheme = 'zombie';
  G.gameRunning = true;
  G.redPlayer = createPlayer('red', myNickname, '对手', getCurrentSkin());
  G.bluePlayer = null;
  G.bullets = []; G.damageTexts = []; G.zombies = []; G.bosses = []; G.pickups = [];
  G.processedHits.clear();
  resetCombo(); endSlowmo();
  G.zombieKills = 0; G.zombieWave = 1; G.waveTimer = 0; G.spawnTimer = 0;
  G.obstacles = generateObstacles(WORLD_W, WORLD_H, 15);
  txt($('gameRoomCode'), '单机');
  txt($('myRoleLabel'), '单人');
  if ($('myRoleLabel')) $('myRoleLabel').className = 'role-red';
  updateScoreboardVisibility();
  updateThemeBadge();
  updateAimUI();
  switchView('game');
  updateScoreboard();
  updateWeaponHUD();
  clearAllKeys();
  SFX.start();
  if (musicEnabled) { initAudio(); startMusic(); }
  showRoundBanner(1);
  if (!window._gameLoopRunning) { window._gameLoopRunning = true; gameLoop(); }
}

export function startGame() {
  if (G.gameRunning) return;
  const themeKeys = Object.keys(THEMES).filter(k => k !== 'zombie');
  if (G.gameMode === 'zombie') {
    G.currentTheme = 'zombie';
    G.obstacles = generateObstacles(WORLD_W, WORLD_H, 15);
    safeSend({ type: 'nextRound', obstacles: G.obstacles, role: 'blue', theme: G.currentTheme, round: 1 });
  } else {
    G.currentTheme = themeKeys[Math.floor(Math.random() * themeKeys.length)];
    G.obstacles = generateObstacles(WORLD_W, WORLD_H, 15);
    safeSend({ type: 'nextRound', obstacles: G.obstacles, role: 'blue', theme: G.currentTheme, round: 1 });
  }
  updateThemeBadge();
  if (G.gameMode === 'pvp') startRoundLocally('red', true);
  else startZombieModeLocally('red');
}

function startRoundLocally(role, isFirst = true) {
  G.isSoloMode = false;
  G.myRole = role;
  G.gameRunning = true;
  G.redPlayer = createPlayer('red', G.myNickname, G.opponentNickname, getCurrentSkin());
  G.bluePlayer = createPlayer('blue', G.myNickname, G.opponentNickname, getCurrentSkin());
  G.redPlayer.name = G.isHost ? G.myNickname : G.opponentNickname;
  G.bluePlayer.name = G.isHost ? G.opponentNickname : G.myNickname;
  G.bullets = []; G.damageTexts = []; G.pickups = [];
  G.processedHits.clear();
  resetCombo(); endSlowmo();
  txt($('gameRoomCode'), G.roomCode);
  txt($('myRoleLabel'), G.myRole === 'red' ? '红方' : '蓝方');
  if ($('myRoleLabel')) $('myRoleLabel').className = G.myRole === 'red' ? 'role-red' : 'role-blue';
  updateScoreboardVisibility();
  updateThemeBadge();
  updateAimUI();
  switchView('game');
  updateScoreboard();
  updateWeaponHUD();
  clearAllKeys();
  SFX.start();
  if (musicEnabled) { initAudio(); startMusic(); }
  broadcastPlayerState();
  if (!window._gameLoopRunning) { window._gameLoopRunning = true; gameLoop(); }
}

function startZombieModeLocally(role) {
  G.isSoloMode = false;
  G.myRole = role;
  G.gameRunning = true;
  G.redPlayer = createPlayer('red', G.myNickname, G.opponentNickname, getCurrentSkin());
  G.bluePlayer = createPlayer('blue', G.myNickname, G.opponentNickname, getCurrentSkin());
  G.redPlayer.name = G.isHost ? G.myNickname : G.opponentNickname;
  G.bluePlayer.name = G.isHost ? G.opponentNickname : G.myNickname;
  G.bullets = []; G.damageTexts = []; G.zombies = []; G.bosses = []; G.pickups = [];
  G.processedHits.clear();
  resetCombo(); endSlowmo();
  G.zombieKills = 0; G.zombieWave = 1; G.waveTimer = 0; G.spawnTimer = 0;
  txt($('gameRoomCode'), G.roomCode);
  txt($('myRoleLabel'), G.myRole === 'red' ? '红方' : '蓝方');
  if ($('myRoleLabel')) $('myRoleLabel').className = G.myRole === 'red' ? 'role-red' : 'role-blue';
  updateScoreboardVisibility();
  updateThemeBadge();
  updateAimUI();
  switchView('game');
  updateScoreboard();
  updateWeaponHUD();
  clearAllKeys();
  SFX.start();
  if (musicEnabled) { initAudio(); startMusic(); }
  broadcastPlayerState();
  if (!window._gameLoopRunning) { window._gameLoopRunning = true; gameLoop(); }
}

// ============ 回合 ============
function handleRoundEnd(winner, sRed, sBlue) {
  G.gameRunning = false;
  stopMusic();
  G.scoreRed = sRed; G.scoreBlue = sBlue;
  updateScoreboard();
  if (winner === G.myRole) SFX.win(); else SFX.lose();
  if (G.isHost && G.gameMode === 'pvp') setTimeout(() => startNextRound(), 3000);
}
function startNextRound() {
  if (!G.isHost || G.gameMode !== 'pvp') return;
  G.roundNumber++;
  const themeKeys = Object.keys(THEMES).filter(k => k !== 'zombie');
  G.currentTheme = themeKeys[Math.floor(Math.random() * themeKeys.length)];
  G.obstacles = generateObstacles(WORLD_W, WORLD_H, 15);
  safeSend({ type: 'nextRound', obstacles: G.obstacles, role: 'blue', theme: G.currentTheme, round: G.roundNumber });
  updateThemeBadge();
  showRoundBanner(G.roundNumber);
  setTimeout(() => startRoundLocally('red', false), 3000);
}
function handleLocalWin(deadRole) {
  triggerSlowmo();
  G.gameRunning = false;
  if (deadRole === 'red') G.scoreBlue++;
  else G.scoreRed++;
  updateScoreboard();
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  const opponent = G.myRole === 'red' ? G.bluePlayer : G.redPlayer;
  if (me) me.kills++;
  safeSend({ type: 'roundEnd', winner: G.myRole, scoreRed: G.scoreRed, scoreBlue: G.scoreBlue });
  addKillFeed(me ? me.name : '你', opponent ? opponent.name : '对手', WEAPONS[me ? me.weapon : 'pistol'].icon);
  SFX.win();
  setTimeout(() => {
    stopMusic();
    if (G.isHost) startNextRound();
  }, 3000);
}

// ============ 游戏结束（PvE） ============
function gameOverPvE() {
  G.gameRunning = false;
  stopMusic();
  SFX.lose();
  if (G.isSoloMode) {
    setTimeout(() => {
      alert('💀 被僵尸击败！\n击杀数：' + G.zombieKills + '  波次：' + G.zombieWave);
      cleanupAndReturnToLobby();
    }, 200);
  } else {
    safeSend({ type: 'gameOver', kills: G.zombieKills, wave: G.zombieWave });
    setTimeout(() => {
      alert('💀 被僵尸击败！\n击杀数：' + G.zombieKills + '  波次：' + G.zombieWave);
      cleanupAndReturnToLobby();
    }, 200);
  }
}

// ============ 主更新 ============
export function update() {
  if (!G.gameRunning) return;
  if (G.slowmoTimer > 0) {
    updateSlowmo();
    updateDamageTexts();
    if (G.screenShake > 0) G.screenShake *= 0.85;
    return;
  }
  G.frameCount++;

  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  const opponent = G.myRole === 'red' ? G.bluePlayer : G.redPlayer;
  if (!me) return;

  updateCamera();

  if (G.comboTimer > 0) { G.comboTimer--; if (G.comboTimer === 0) resetCombo(); }
  if (G.screenShake > 0) G.screenShake *= 0.85;

  // 冷却
  for (const k of ['dash', 'shield', 'ultimate']) {
    if (me.skillCD[k] > 0) me.skillCD[k]--;
  }
  if (me.shieldActive > 0) me.shieldActive--;
  if (me.speedTimer > 0) me.speedTimer--;
  if (me.invisibleTimer > 0) me.invisibleTimer--;
  if (me.doubleTimer > 0) me.doubleTimer--;

  // 键盘
  if (consumePress('KeyT')) {
    if (chatPanelOpen) closeChatPanel();
    else openChatPanel();
  }
  if (!chatPanelOpen) {
    if (consumePress('KeyQ')) useDash();
    if (consumePress('KeyE')) useShield();
    if (consumePress('KeyR')) useUltimate();
    if (consumePress('Digit1')) switchWeapon(1);
    if (consumePress('Digit2')) switchWeapon(2);
    if (consumePress('Digit3')) switchWeapon(3);
    if (consumePress('Digit4')) switchWeapon(4);
  }

  // 移动
  const worldW = (G.gameMode === 'zombie' || G.isSoloMode) ? WORLD_W : W;
  const worldH = (G.gameMode === 'zombie' || G.isSoloMode) ? WORLD_H : H;

  if (me.dashFrames > 0) {
    const cx = Math.min(Math.max(me.x + me.dashVx, PLAYER_SIZE/2 + 4), worldW - PLAYER_SIZE/2 - 4);
    if (!playerHitsObstacle(cx, me.y, G.obstacles)) me.x = cx;
    const cy = Math.min(Math.max(me.y + me.dashVy, PLAYER_SIZE/2 + 4), worldH - PLAYER_SIZE/2 - 4);
    if (!playerHitsObstacle(me.x, cy, G.obstacles)) me.y = cy;
    me.dashFrames--;
    broadcastPlayerState();
    spawnParticles(me.x, me.y, { count: 2, color: '#4dd4ff', speed: 1, life: 20, size: 3 });
  } else {
    let dx = 0, dy = 0;
    if (keyDown('w')) dy -= 1;
    if (keyDown('s')) dy += 1;
    if (keyDown('a')) dx -= 1;
    if (keyDown('d')) dx += 1;
    if (dx !== 0 || dy !== 0) {
      const speed = PLAYER_SPEED * (me.speedTimer > 0 ? BUFF_SPEED_MULT : 1) * (me.speedMult || 1);
      const len = Math.hypot(dx, dy);
      dx = dx / len * speed;
      dy = dy / len * speed;
      const cx = Math.min(Math.max(me.x + dx, PLAYER_SIZE/2 + 4), worldW - PLAYER_SIZE/2 - 4);
      if (!playerHitsObstacle(cx, me.y, G.obstacles)) me.x = cx;
      const cy = Math.min(Math.max(me.y + dy, PLAYER_SIZE/2 + 4), worldH - PLAYER_SIZE/2 - 4);
      if (!playerHitsObstacle(me.x, cy, G.obstacles)) me.y = cy;
      broadcastPlayerState();
      // 皮肤拖尾
      const skin = getCurrentSkin();
      if (skin && skin.trail && G.frameCount % 3 === 0) {
        spawnParticles(me.x, me.y, { count: 1, color: skin.trail, speed: 0.5, life: 20, size: 3 });
      }
    }
  }

  // 朝向
  if (G.autoAim) {
    if (G.gameMode === 'pvp' && opponent) {
      me.facing = Math.atan2(opponent.y - me.y, opponent.x - me.x);
    } else {
      let nearest = null, minD = Infinity;
      const allE = [...G.zombies, ...G.bosses];
      for (const e of allE) {
        const d = Math.hypot(e.x - me.x, e.y - me.y);
        if (d < minD) { minD = d; nearest = e; }
      }
      if (nearest) me.facing = Math.atan2(nearest.y - me.y, nearest.x - me.x);
      else me.facing = 0;
    }
  } else {
    me.facing = Math.atan2(G.mouseY - me.y, G.mouseX - me.x);
  }

  // 射击
  const w = WEAPONS[me.weapon];
  if (me.cooldown > 0) me.cooldown--;
  const wantShoot = G.autoAim ? keyDown('space') : G.mouseDown;
  if (wantShoot && me.cooldown <= 0 && me.hp > 0 && !chatPanelOpen) {
    const infinite = G.settings.infiniteAmmo;
    if (me.ammo !== Infinity && me.ammo <= 0 && !infinite) {
      if (me.reloadTimer <= 0) me.reloadTimer = 60 * (me.reloadMult || 1);
    } else {
      for (let i = 0; i < w.bulletsPerShot; i++) {
        const spread = (Math.random() - 0.5) * w.spread * 2;
        const angle = me.facing + spread;
        let dmg = w.damage * (me.dmgMult || 1) * (me.doubleTimer > 0 ? BUFF_DOUBLE_MULT : 1);
        const isCrit = Math.random() < (me.critChance || 0);
        if (isCrit) dmg *= 2;
        const bullet = {
          id: Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 4),
          x: me.x, y: me.y,
          vx: Math.cos(angle) * w.bulletSpeed,
          vy: Math.sin(angle) * w.bulletSpeed,
          owner: G.myRole, size: BULLET_SIZE, life: 150, damage: dmg,
          color: w.color, pierce: me.pierce || 0, isCrit,
        };
        G.bullets.push(bullet);
        broadcastBullet(bullet);
      }
      me.stats.shotsFired += w.bulletsPerShot;
      if (me.ammo !== Infinity && !infinite) me.ammo--;
      me.cooldown = w.cooldown;
      if (me.weapon === 'shotgun') SFX.shotgun();
      else if (me.weapon === 'sniper') SFX.sniper();
      else if (me.weapon === 'machine') SFX.machine();
      else SFX.shoot();
    }
  }
  if (me.reloadTimer > 0) {
    me.reloadTimer--;
    if (me.reloadTimer === 0) reloadWeapon();
  }

  // 僵尸 AI（Host 或单机）
  if ((G.gameMode === 'zombie' || G.isSoloMode) && (G.isHost || G.isSoloMode)) {
    updateZombiesAndBosses({
      zombies: G.zombies, bosses: G.bosses, obstacles: G.obstacles,
      redPlayer: G.redPlayer, bluePlayer: G.bluePlayer,
      frameCount: G.frameCount, isSoloMode: G.isSoloMode, myRole: G.myRole,
      safeSend, spawnDamageText, spawnPickup, zombieWave: G.zombieWave,
      settings: G.settings,
      onPlayerDamaged: (p, dmg, hx, hy) => {
        const key = p === G.redPlayer ? 'red' : 'blue';
        const mine = (G.isSoloMode ? 'red' : G.myRole) === key;
        if (mine) { SFX.hurt(); spawnDamageText(hx, hy, dmg, '#ff4d4d'); }
      },
      onAcidBullet: (x, y, ang, owner) => {
        const bullet = {
          id: 'acid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          x, y,
          vx: Math.cos(ang) * 6,
          vy: Math.sin(ang) * 6,
          owner: owner || 'boss',
          size: 10, life: 200, damage: 12, color: '#ff0044',
        };
        G.bullets.push(bullet);
        if (!G.isSoloMode) safeSend({ type: 'bulletSpawn', bullet });
      },
      gameOver: gameOverPvE,
      screenShakeRef: G.screenShakeRef,
    });

    // 波次提升
    G.waveTimer++;
    if (G.waveTimer >= 1200) {
      G.waveTimer = 0;
      G.zombieWave++;
      updateScoreboard();
      spawnDamageText(G.redPlayer.x, G.redPlayer.y - 100, 0, '#ffaa4d', '🌊 第 ' + G.zombieWave + ' 波', true);
      const bossEvery = G.settings.bossEvery || 10;
      if (G.zombieWave % bossEvery === 0) spawnBoss(G.bosses, G.zombieWave);
    }
    // 刷僵尸
    G.spawnTimer++;
    const spawnInterval = Math.max(18, 80 - G.zombieWave * 5);
    if (G.spawnTimer >= spawnInterval) {
      G.spawnTimer = 0;
      spawnZombie(G.zombies, G.zombieWave);
    }

    // 同步
    if (!G.isSoloMode && G.frameCount % 3 === 0) {
      safeSend({
        type: 'zombieState',
        zombies: G.zombies.map(z => ({ id: z.id, type: z.type, x: z.x, y: z.y, hp: z.hp, maxHp: z.maxHp, angle: z.angle, wobble: z.wobble, size: z.size })),
        bosses: G.bosses.map(b => ({ id: b.id, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, angle: b.angle, wobble: b.wobble, size: b.size, isBoss: true })),
        kills: G.zombieKills, wave: G.zombieWave,
      });
    }
  }

  // 子弹
  updateBullets(worldW, worldH, me);

  updateDamageTexts();
  updatePickups();
  if (me.hp <= 0) me.dead = true;

  // 低血警告
  const lowHpEl = $('lowHpVignette');
  if (lowHpEl) {
    const isLow = me.hp / me.maxHp < 0.25 && me.hp > 0;
    cls(lowHpEl, 'active', isLow);
  }
}

// ============ 子弹 ============
function updateBullets(worldW, worldH, me) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    if (b.hitmark !== undefined) {
      b.hitmark--;
      if (b.hitmark <= 0) { G.bullets.splice(i, 1); continue; }
      continue;
    }
    const prevX = b.x, prevY = b.y;
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.x < -50 || b.x > worldW + 50 || b.y < -50 || b.y > worldH + 50 || b.life <= 0) {
      G.bullets.splice(i, 1); continue;
    }
    if (bulletHitsObstacle(b, G.obstacles)) {
      spawnParticles(b.x, b.y, { count: 6, color: '#8899bb', speed: 3, life: 20, size: 2 });
      SFX.obstacle();
      G.bullets.splice(i, 1); continue;
    }

    if (b.owner === G.myRole) {
      if (G.gameMode === 'pvp') {
        const targetRole = G.myRole === 'red' ? 'blue' : 'red';
        const target = targetRole === 'red' ? G.redPlayer : G.bluePlayer;
        if (!target) continue;
        if (segmentHitsPlayer(prevX, prevY, b.x, b.y, target)) {
          if (target.shieldActive > 0) {
            spawnDamageText(b.x, b.y, 0, '#4dd4ff', '🛡');
            G.bullets.splice(i, 1);
            safeSend({ type: 'hit', bulletId: b.id, targetRole, damage: 0, hitX: b.x, hitY: b.y });
            continue;
          }
          const dmg = b.damage || DAMAGE_AMOUNT;
          target.hp = Math.max(0, target.hp - dmg);
          safeSend({ type: 'hit', bulletId: b.id, targetRole, damage: dmg, hitX: b.x, hitY: b.y });
          SFX.hit();
          spawnParticles(b.x, b.y, { count: 8, color: '#ffffff', speed: 3, life: 20, size: 2 });
          spawnDamageText(b.x, b.y, Math.round(dmg), targetRole === 'red' ? '#ff6b8a' : '#6bb8ff', b.isCrit ? null : null, dmg > 20);
          addCombo();
          me.stats.shotsHit++;
          if (target.hp <= 0) handleLocalWin(targetRole);
          if (b.pierce > 0) { b.pierce--; b.hitmark = 3; }
          else { G.bullets.splice(i, 1); }
        }
      } else {
        // PvE
        let hitZ = null, hitB = null;
        for (const z of G.zombies) {
          if (segmentHitsZombie(prevX, prevY, b.x, b.y, z)) { hitZ = z; break; }
        }
        if (!hitZ) {
          for (const boss of G.bosses) {
            if (segmentHitsBoss(prevX, prevY, b.x, b.y, boss)) { hitB = boss; break; }
          }
        }
        if (hitZ || hitB) {
          const target = hitZ || hitB;
          const dmg = b.damage || 1;
          if (G.isHost || G.isSoloMode) {
            target.hp -= dmg;
            if (target.hp <= 0) {
              if (hitZ) {
                const xp = hitZ.xp || 1;
                G.zombies = G.zombies.filter(zz => zz.id !== hitZ.id);
                G.zombieKills += xp;
                updateScoreboard();
                addCombo();
                me.xp += xp;
                if (me.lifesteal > 0) me.hp = Math.min(me.maxHp, me.hp + me.lifesteal);
                SFX.zombieDie();
                spawnParticles(hitZ.x, hitZ.y, { count: 18, color: '#8ac05a', speed: 6, life: 45, gravity: 0.1 });
                spawnDamageText(hitZ.x, hitZ.y, 0, '#ffaa4d', '💀');
                if (!G.isSoloMode) safeSend({ type: 'zombieDied', zombieId: hitZ.id, x: hitZ.x, y: hitZ.y });
                if (Math.random() < 0.25) spawnPickup(hitZ.x, hitZ.y, 'health');
                if (Math.random() < 0.08) spawnPickup(hitZ.x, hitZ.y, 'speed');
                if (Math.random() < 0.08) spawnPickup(hitZ.x, hitZ.y, 'invisible');
                if (Math.random() < 0.08) spawnPickup(hitZ.x, hitZ.y, 'double');
                if (hitZ.type === 'splitter') spawnSplitterChildren(hitZ, G.zombies);
                // 检查升级
                checkLevelUp(me,
                  () => { G.gameRunning = false; },
                  () => { G.gameRunning = true; }
                );
              } else {
                G.bosses = G.bosses.filter(bb => bb.id !== hitB.id);
                G.zombieKills += 10;
                me.xp += 10;
                updateScoreboard();
                SFX.bossDie();
                G.screenShake = 25;
                spawnParticles(hitB.x, hitB.y, { count: 60, color: '#ff4d6d', speed: 12, life: 80, size: 5 });
                spawnDamageText(hitB.x, hitB.y, 0, '#ff4d6d', 'BOSS 击杀!', true);
                if (!G.isSoloMode) safeSend({ type: 'zombieDied', zombieId: hitB.id, x: hitB.x, y: hitB.y, isBoss: true });
                spawnPickup(hitB.x, hitB.y, 'health');
                spawnPickup(hitB.x + 40, hitB.y, 'double');
                checkLevelUp(me,
                  () => { G.gameRunning = false; },
                  () => { G.gameRunning = true; }
                );
              }
            } else {
              spawnDamageText(target.x, target.y, Math.round(dmg), b.isCrit ? '#ffd24d' : '#ffaa4d');
              if (hitZ) SFX.zombieHit(); else SFX.hit();
              spawnParticles(b.x, b.y, { count: 6, color: b.isCrit ? '#ffd24d' : '#ffaa4d', speed: 3, life: 18, size: 2 });
              if (!G.isSoloMode) safeSend({ type: 'zombieDamaged', zombieId: target.id, x: target.x, y: target.y, damage: dmg });
            }
          } else {
            // 客户端预测
            if (!G.isSoloMode) safeSend({ type: 'zombieHit', zombieId: target.id, damage: dmg });
            SFX.zombieHit();
            spawnDamageText(target.x, target.y, Math.round(dmg), b.isCrit ? '#ffd24d' : '#ffaa4d');
          }
          me.stats.shotsHit++;
          if (b.pierce > 0) { b.pierce--; b.hitmark = 3; }
          else { G.bullets.splice(i, 1); }
        }
      }
    } else if (b.owner === 'boss' || b.owner === 'acid') {
      for (const p of [G.redPlayer, G.bluePlayer].filter(pp => pp && pp.hp > 0)) {
        if (segmentHitsPlayer(prevX, prevY, b.x, b.y, p)) {
          const key = p === G.redPlayer ? 'red' : 'blue';
          if (p.shieldActive > 0) {
            if ((G.isSoloMode ? 'red' : G.myRole) === key) spawnDamageText(b.x, b.y, 0, '#4dd4ff', '🛡');
            G.bullets.splice(i, 1);
            break;
          }
          p.hp = Math.max(0, p.hp - b.damage);
          if (!G.isSoloMode) safeSend({ type: 'hpUpdate', role: key, hp: p.hp, seq: ++p.hpSeq });
          if ((G.isSoloMode ? 'red' : G.myRole) === key) {
            SFX.hurt();
            spawnDamageText(b.x, b.y, b.damage, '#ff4d4d');
          }
          G.bullets.splice(i, 1);
          break;
        }
      }
    }
  }
}

// ============ 碰撞 ============
function segmentHitsPlayer(x1, y1, x2, y2, player) {
  const half = PLAYER_SIZE / 2, r = BULLET_SIZE / 2;
  const rect = { x1: player.x - half - r, x2: player.x + half + r, y1: player.y - half - r, y2: player.y + half + r };
  return segmentHitsRect(x1, y1, x2, y2, rect);
}
function segmentHitsZombie(x1, y1, x2, y2, z) {
  const half = (z.size || ZOMBIE_SIZE) / 2, r = BULLET_SIZE / 2;
  const rect = { x1: z.x - half - r, x2: z.x + half + r, y1: z.y - half - r, y2: z.y + half + r };
  return segmentHitsRect(x1, y1, x2, y2, rect);
}
function segmentHitsBoss(x1, y1, x2, y2, b) {
  const half = b.size / 2, r = BULLET_SIZE / 2;
  const rect = { x1: b.x - half - r, x2: b.x + half + r, y1: b.y - half - r, y2: b.y + half + r };
  return segmentHitsRect(x1, y1, x2, y2, rect);
}
function segmentHitsRect(x1, y1, x2, y2, r) {
  // Liang-Barsky
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x1, r.x2 - x1, y1 - r.y1, r.y2 - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

// ============ 相机 ============
function updateCamera() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (G.spectating) {
    const target = G.spectatorTarget;
    if (target) {
      const targetX = target.x - W / 2;
      const targetY = target.y - H / 2;
      G.camera.x += (targetX - G.camera.x) * 0.15;
      G.camera.y += (targetY - G.camera.y) * 0.15;
    } else {
      if (keyDown('w')) G.camera.y -= 8;
      if (keyDown('s')) G.camera.y += 8;
      if (keyDown('a')) G.camera.x -= 8;
      if (keyDown('d')) G.camera.x += 8;
    }
    G.camera.x = Math.max(0, Math.min(WORLD_W - W, G.camera.x));
    G.camera.y = Math.max(0, Math.min(WORLD_H - H, G.camera.y));
    return;
  }
  if (!me) return;
  if (G.gameMode === 'zombie' || G.isSoloMode) {
    const targetX = me.x - W / 2;
    const targetY = me.y - H / 2;
    G.camera.x += (targetX - G.camera.x) * 0.15;
    G.camera.y += (targetY - G.camera.y) * 0.15;
    G.camera.x = Math.max(0, Math.min(WORLD_W - W, G.camera.x));
    G.camera.y = Math.max(0, Math.min(WORLD_H - H, G.camera.y));
  } else {
    G.camera.x = 0;
    G.camera.y = 0;
  }
}

// ============ 主循环 ============
let lastMinimapDraw = 0;
export function gameLoop() {
  if (G.gameRunning) {
    update();
    draw(G);
    updateSkillHUD();
    updateWeaponHUD();
    updateBuffTimer();
    updateLevelHUD();
    const now = performance.now();
    if (now - lastMinimapDraw > 100) {
      lastMinimapDraw = now;
      drawMinimap(G);
    }
  } else {
    draw(G);
  }
  requestAnimationFrame(gameLoop);
}

// ============ HUD ============
function updateSkillHUD() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (!me) return;
  updateSlot('skillDash', me.skillCD.dash, SKILL_COOLDOWN.dash * (me.cdMult ? me.cdMult.dash : 1));
  updateSlot('skillShield', me.skillCD.shield, SKILL_COOLDOWN.shield * (me.cdMult ? me.cdMult.shield : 1));
  updateSlot('skillUltimate', me.skillCD.ultimate, SKILL_COOLDOWN.ultimate * (me.cdMult ? me.cdMult.ultimate : 1));
}
function updateSlot(id, cd, max) {
  const el = $(id);
  if (!el) return;
  const overlay = el.querySelector('.cd-overlay');
  const cdText = el.querySelector('.cd-text');
  if (cd <= 0) {
    el.classList.add('ready'); el.classList.remove('cooling');
    if (overlay) overlay.style.height = '0%';
    if (cdText) cdText.textContent = '';
  } else {
    el.classList.remove('ready'); el.classList.add('cooling');
    if (overlay) overlay.style.height = (cd / max * 100) + '%';
    if (cdText) cdText.textContent = Math.ceil(cd / 60);
  }
}
function updateWeaponHUD() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (!me) return;
  const w = WEAPONS[me.weapon];
  txt($('weaponIcon'), w.icon);
  txt($('weaponName'), w.name);
  const ammoEl = $('weaponAmmo');
  if (ammoEl) {
    ammoEl.textContent = me.ammo === Infinity ? '∞' : me.ammo;
    ammoEl.style.color = (me.ammo !== Infinity && me.ammo <= 2) ? '#ff6b8a' : '#ffd24d';
  }
}
function updateBuffTimer() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  const el = $('buffTimer');
  if (!me || !el) return;
  const buffs = [];
  if (me.speedTimer > 0) buffs.push(`<span class="buff-pill speed">💨 ${Math.ceil(me.speedTimer/60)}s</span>`);
  if (me.invisibleTimer > 0) buffs.push(`<span class="buff-pill invisible">👻 ${Math.ceil(me.invisibleTimer/60)}s</span>`);
  if (me.doubleTimer > 0) buffs.push(`<span class="buff-pill double">⚡ ${Math.ceil(me.doubleTimer/60)}s</span>`);
  el.innerHTML = buffs.join('');
}
function updateLevelHUD() {
  const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
  if (!me) return;
  txt($('levelNum'), me.level);
  const pct = (me.xp / XP_PER_LEVEL) * 100;
  const fill = $('xpFill');
  if (fill) fill.style.width = pct + '%';
}

// ============ 分数板 ============
export function updateScoreboard() {
  if (G.gameMode === 'pvp') {
    txt($('scoreRed'), G.scoreRed);
    txt($('scoreBlue'), G.scoreBlue);
    cls($('scoreRedItem'), 'winner', G.scoreRed > G.scoreBlue);
    cls($('scoreBlueItem'), 'winner', G.scoreBlue > G.scoreRed);
    txt($('redNameLabel'), G.redPlayer ? G.redPlayer.name : '红');
    txt($('blueNameLabel'), G.bluePlayer ? G.bluePlayer.name : '蓝');
  } else {
    txt($('zombieKills'), G.zombieKills);
    txt($('zombieWave'), G.zombieWave);
    txt($('comboDisplay'), G.comboCount);
  }
}
export function updateScoreboardVisibility() {
  cls($('pvpScoreboard'), 'hidden', G.gameMode !== 'pvp');
  cls($('zombieScoreboard'), 'hidden', G.gameMode !== 'zombie' && !G.isSoloMode);
  const mm = $('minimap');
  if (mm) cls(mm, 'visible', G.gameMode === 'zombie' || G.isSoloMode);
}
export function updateThemeBadge() {
  const theme = THEMES[G.currentTheme] || THEMES.space;
  txt($('themeIcon'), theme.icon);
  txt($('themeName'), theme.name);
}
export function updateAimUI() {
  cls($('aimToggle'), 'checked', G.autoAim);
  txt($('aimTitle'), G.autoAim ? '🎯 自动瞄准' : '🖱️ 手动瞄准');
  txt($('aimDesc'), G.autoAim ? '按空格朝向敌人自动射击' : '鼠标瞄准，左键射击');
  cls($('aimIndicator'), 'auto', G.autoAim);
  cls($('aimIndicator'), 'manual', !G.autoAim);
  txt($('aimModeIcon'), G.autoAim ? '🎯' : '🖱️');
  txt($('aimModeText'), G.autoAim ? '自动瞄准' : '手动瞄准');
  if ($('shootHint')) $('shootHint').innerHTML = G.autoAim ? '<kbd>空格</kbd> 射击' : '<kbd>左键</kbd> 射击';
  cls($('gameCanvas'), 'aim-mode', !G.autoAim);
}

// ============ 视图 ============
export function switchView(view) {
  cls($('lobby'), 'hidden', true);
  cls($('waiting'), 'hidden', true);
  const gameEl = $('game');
  if (gameEl) gameEl.style.display = 'none';
  if (view === 'lobby') cls($('lobby'), 'hidden', false);
  else if (view === 'waiting') cls($('waiting'), 'hidden', false);
  else if (view === 'game' && gameEl) gameEl.style.display = 'flex';
}

// ============ 圆形横幅 ============
export function showRoundBanner(n) {
  const el = $('roundBanner');
  if (!el) return;
  el.textContent = `ROUND ${n}`;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
  }, 2200);
}

// ============ 障碍物 ============
export function generateObstacles(worldW, worldH, count = 12) {
  const newObs = [];
  let att = 0;
  while (newObs.length < count && att < count * 30) {
    att++;
    const w = 60 + Math.random() * 120;
    const h = 60 + Math.random() * 120;
    const x = 100 + Math.random() * (worldW - 200 - w);
    const y = 100 + Math.random() * (worldH - 200 - h);
    const rect = { x, y, w, h };
    let ov = false;
    for (const o of newObs) {
      if (rect.x < o.x + o.w + 40 && rect.x + rect.w + 40 > o.x &&
          rect.y < o.y + o.h + 40 && rect.y + rect.h + 40 > o.y) { ov = true; break; }
    }
    if (ov) continue;
    newObs.push(rect);
  }
  return newObs;
}

// ============ 清理 ============
export function cleanupAndReturnToLobby() {
  G.gameRunning = false;
  clearAllKeys();
  closeChatPanel();
  endSlowmo();
  stopMusic();
  if (!G.isSoloMode && G.conn && G.conn.open) {
    safeSend({ type: 'leave' });
    try { G.conn.close(); } catch(e) {}
  }
  G.conn = null;
  if (G.peer && !G.peer.destroyed) { try { G.peer.destroy(); } catch(e) {} }
  G.peer = null;
  G.bullets = []; G.damageTexts = []; G.obstacles = [];
  G.zombies = []; G.bosses = []; G.pickups = [];
  G.redPlayer = null; G.bluePlayer = null;
  G.processedHits.clear();
  G.remoteHpSeq = 0;
  resetCombo();
  G.isHost = false;
  G.isSoloMode = false;
  G.roomCode = '';
  G.camera.x = 0; G.camera.y = 0;
  G.spectating = false; G.spectatorTarget = null;
  switchView('lobby');
  const lowHpEl = $('lowHpVignette');
  if (lowHpEl) cls(lowHpEl, 'active', false);
}
