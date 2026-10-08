import {
  W, H, WORLD_W, WORLD_H,
  PLAYER_SIZE, BULLET_SIZE, ZOMBIE_SIZE, THEMES,
} from './config.js';
import { particles } from './utils.js';

let ctx = null;
export function initCtx(canvas) { ctx = canvas.getContext('2d'); }
export function getCtx() { return ctx; }

// ============ 网格缓存 ============
const gridCache = {};
export function getGridCanvas(key, worldW, worldH) {
  const ck = key + '_' + worldW + '_' + worldH;
  if (gridCache[ck]) return gridCache[ck];
  const theme = THEMES[key] || THEMES.space;
  const c = document.createElement('canvas');
  c.width = worldW; c.height = worldH;
  const g = c.getContext('2d');
  g.strokeStyle = theme.grid;
  g.lineWidth = 1;
  for (let i = 0; i < worldW; i += 100) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, worldH); g.stroke(); }
  for (let i = 0; i < worldH; i += 100) { g.beginPath(); g.moveTo(0, i); g.lineTo(worldW, i); g.stroke(); }
  gridCache[ck] = c;
  return c;
}

// ============ 主绘制 ============
export function draw(game) {
  if (!ctx) return;
  const {
    currentTheme, camera, obstacles, pickups, zombies, bosses, bullets,
    redPlayer, bluePlayer, myRole, gameMode, isSoloMode,
    damageTexts, screenShake, frameCount, comboCount,
    zombieKills, zombieWave, scoreRed, scoreBlue,
    renderTrail, currentSkin,
  } = game;
  const theme = THEMES[currentTheme] || THEMES.space;

  ctx.save();
  if (screenShake > 0.5) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
  }
  ctx.clearRect(0, 0, W, H);

  // 背景（连击越高越暖）
  const warm = Math.min(1, comboCount / 30);
  const bgTop = warm > 0 ? mixColor(theme.bg[0], '#3a1a0a', warm * 0.6) : theme.bg[0];
  const bgBot = warm > 0 ? mixColor(theme.bg[1], '#1a0805', warm * 0.6) : theme.bg[1];
  const grad = ctx.createRadialGradient(W/2, H/2, 100, W/2, H/2, 900);
  grad.addColorStop(0, bgTop);
  grad.addColorStop(1, bgBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 相机
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  const worldW = (gameMode === 'zombie' || isSoloMode) ? WORLD_W : W;
  const worldH = (gameMode === 'zombie' || isSoloMode) ? WORLD_H : H;

  // 网格
  const grid = getGridCanvas(currentTheme, worldW, worldH);
  if (grid) ctx.drawImage(grid, camera.x, camera.y, W, H, camera.x, camera.y, W, H);

  // 障碍物
  for (const o of obstacles) {
    if (o.x + o.w < camera.x - 50 || o.x > camera.x + W + 50 ||
        o.y + o.h < camera.y - 50 || o.y > camera.y + H + 50) continue;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
    ctx.fillStyle = theme.obstacleFill;
    ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, o.h, 8); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = theme.obstacleStroke;
    ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = theme.obstacleHighlight;
    ctx.beginPath(); ctx.roundRect(o.x + 3, o.y + 3, o.w - 6, 6, 4); ctx.fill();
  }

  // 掉落物
  for (const p of pickups) {
    if (p.x < camera.x - 50 || p.x > camera.x + W + 50 ||
        p.y < camera.y - 50 || p.y > camera.y + H + 50) continue;
    drawPickup(p);
  }

  // 僵尸
  if (gameMode === 'zombie' || isSoloMode) {
    for (const z of zombies) {
      if (z.x < camera.x - 80 || z.x > camera.x + W + 80 ||
          z.y < camera.y - 80 || z.y > camera.y + H + 80) continue;
      drawZombie(z, redPlayer, bluePlayer, myRole, frameCount);
    }
    for (const b of bosses) {
      if (b.x < camera.x - 120 || b.x > camera.x + W + 120 ||
          b.y < camera.y - 120 || b.y > camera.y + H + 120) continue;
      drawBoss(b);
    }
  }

  // 子弹
  for (const b of bullets) {
    if (b.x < camera.x - 30 || b.x > camera.x + W + 30 ||
        b.y < camera.y - 30 || b.y > camera.y + H + 30) continue;
    const c = b.color || (b.owner === 'red' ? '#ff4d6d' : b.owner === 'blue' ? '#4da6ff' : '#ff0044');
    ctx.beginPath();
    ctx.arc(b.x, b.y, (b.size || BULLET_SIZE) * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.shadowColor = c; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
  }

  // 粒子
  drawParticles();

  // 玩家
  if (redPlayer) drawPlayer(redPlayer, myRole, isSoloMode, currentSkin);
  if (bluePlayer) drawPlayer(bluePlayer, myRole, isSoloMode, currentSkin);

  // 伤害飘字
  drawDamageTexts(damageTexts);

  ctx.restore(); // 相机

  // HUD
  drawHUD(game);

  ctx.restore();
}

// ============ 颜色混合 ============
function mixColor(c1, c2, t) {
  const p = h => {
    if (h.startsWith('#')) {
      const n = parseInt(h.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return [0, 0, 0];
  };
  const a = p(c1), b = p(c2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// ============ 绘制玩家 ============
function drawPlayer(p, myRole, isSoloMode, currentSkin) {
  if (!p) return;
  const isRed = p.role === 'red';
  let color = isRed ? '#ff4d6d' : '#4da6ff';
  const bgColor = isRed ? '#2e1a1f' : '#1a2a3a';
  // 应用皮肤
  if (p.skin && p.skin.color) color = p.skin.color;
  const glow = p.skin ? p.skin.glow : 28;

  let alpha = 1;
  if (p.invisibleTimer > 0 && p.role !== myRole) alpha = 0.35;
  if (p.invisibleTimer > 0 && p.role === myRole) alpha = 0.6;
  if (p.hp <= 0) alpha = 0.4;
  ctx.globalAlpha = alpha;

  // 冲刺拖尾
  if (p.dashFrames > 0) {
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = alpha * (0.3 / i);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(p.x - PLAYER_SIZE/2 - p.dashVx * i * 1.5, p.y - PLAYER_SIZE/2 - p.dashVy * i * 1.5, PLAYER_SIZE, PLAYER_SIZE, 8);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
  }

  // 皮肤拖尾粒子（每帧）
  if (p.skin && p.skin.trail && Math.random() < 0.3) {
    // 由 update 里生成，这里只画
  }

  // 身体
  ctx.shadowColor = color; ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(p.x - PLAYER_SIZE/2, p.y - PLAYER_SIZE/2, PLAYER_SIZE, PLAYER_SIZE, 8);
  ctx.fill();
  ctx.shadowBlur = 0;

  // 护盾
  if (p.shieldActive > 0) {
    ctx.strokeStyle = '#4dd4ff'; ctx.lineWidth = 3;
    ctx.shadowColor = '#4dd4ff'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_SIZE * 0.85, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 朝向三角
  if ((p.role === myRole || isSoloMode) && p.hp > 0) {
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.facing);
    ctx.fillStyle = color; ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath();
    ctx.moveTo(PLAYER_SIZE/2 + 4, 0);
    ctx.lineTo(PLAYER_SIZE/2 - 2, -4);
    ctx.lineTo(PLAYER_SIZE/2 - 2, 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 队友标识
  if (p.role !== myRole && !isSoloMode && p.hp > 0 && p.role === 'blue') {
    ctx.font = 'bold 12px "Segoe UI"'; ctx.fillStyle = '#4dd4ff';
    ctx.textAlign = 'center';
    ctx.fillText('🛡 队友', p.x, p.y - PLAYER_SIZE/2 - 42);
  }

  // 血条
  ctx.fillStyle = bgColor;
  ctx.fillRect(p.x - 28, p.y - PLAYER_SIZE/2 - 20, 56, 8);
  ctx.fillStyle = color;
  ctx.fillRect(p.x - 28, p.y - PLAYER_SIZE/2 - 20, 56 * (p.hp / p.maxHp), 8);

  // 名字
  ctx.font = 'bold 12px "Segoe UI"'; ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(p.name, p.x, p.y - PLAYER_SIZE/2 - 26);

  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

// ============ 绘制僵尸（6 种） ============
export function drawZombie(z, redPlayer, bluePlayer, myRole, frameCount) {
  const half = (z.size || ZOMBIE_SIZE) / 2;
  const wob = Math.sin(z.wobble) * 2;
  switch (z.type) {
    case 'runner':   drawRunner(z, half, wob); break;
    case 'tank':     drawTank(z, half, wob); break;
    case 'bomber':   drawBomber(z, half, wob, frameCount); break;
    case 'thrower':  drawThrower(z, half); break;
    case 'ghost':    drawGhost(z, half, frameCount, redPlayer, bluePlayer, myRole); break;
    case 'splitter': drawSplitter(z, half, wob); break;
    default:         drawNormalZombie(z, half, wob); break;
  }
  // 血条
  if (z.hp < z.maxHp) {
    const bw = (z.size || ZOMBIE_SIZE);
    ctx.fillStyle = '#2e1a1f';
    ctx.fillRect(z.x - bw/2, z.y - half - 10, bw, 4);
    ctx.fillStyle = '#8ac05a';
    ctx.fillRect(z.x - bw/2, z.y - half - 10, bw * (z.hp / z.maxHp), 4);
  }
}

function drawNormalZombie(z, half, wob) {
  ctx.shadowColor = 'rgba(140, 60, 60, 0.6)'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#5a8a3a';
  ctx.beginPath();
  ctx.roundRect(z.x - half + wob, z.y - half, half*2, half*2, 6);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#8ac05a'; ctx.lineWidth = 2; ctx.stroke();
  const eoX = Math.cos(z.angle) * 5, eoY = Math.sin(z.angle) * 5;
  ctx.fillStyle = '#ff2020';
  ctx.beginPath(); ctx.arc(z.x - 5 + wob + eoX, z.y - 4 + eoY, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(z.x + 5 + wob + eoX, z.y - 4 + eoY, 2.5, 0, Math.PI*2); ctx.fill();
}

function drawRunner(z, half, wob) {
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.rotate(z.angle);
  // 拖尾
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ff8030';
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(-i * 8, 0, half * 0.7, half * 0.4, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 菱形身体
  ctx.fillStyle = '#ff8030';
  ctx.shadowColor = '#ff8030'; ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(0, -half * 0.6);
  ctx.lineTo(-half, 0);
  ctx.lineTo(0, half * 0.6);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  // 眼
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(half * 0.4, -3, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(half * 0.4, 3, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawTank(z, half, wob) {
  const s = half;
  ctx.fillStyle = '#4a3a2a';
  ctx.shadowColor = '#8a6a3a'; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.roundRect(z.x - s + wob, z.y - s, s*2, s*2, 10); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 3;
  ctx.strokeRect(z.x - s + 6 + wob, z.y - s + 6, s*2 - 12, s*2 - 12);
  ctx.beginPath();
  ctx.moveTo(z.x - s + wob, z.y); ctx.lineTo(z.x + s + wob, z.y);
  ctx.moveTo(z.x + wob, z.y - s); ctx.lineTo(z.x + wob, z.y + s);
  ctx.stroke();
  ctx.fillStyle = '#ff2020'; ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(z.x - 8 + wob, z.y, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(z.x + 8 + wob, z.y, 4, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBomber(z, half, wob, frameCount) {
  const fuse = z.fuse !== undefined && z.fuse < 60 ? (1 + (60 - z.fuse) * 0.02) : 1;
  const pulse = fuse * (1 + Math.sin(frameCount * 0.3) * 0.15);
  ctx.fillStyle = 'rgba(255, 80, 0, 0.25)';
  ctx.beginPath(); ctx.arc(z.x, z.y, half * 2 * pulse, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#c03a1a';
  ctx.shadowColor = '#ff5020'; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(z.x, z.y, half * pulse, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(z.x, z.y - half * pulse);
  ctx.lineTo(z.x + Math.sin(frameCount*0.2)*4, z.y - half * pulse - 8);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(z.x - 4, z.y, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(z.x + 4, z.y, 2, 0, Math.PI*2); ctx.fill();
}

function drawThrower(z, half) {
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.rotate(z.angle);
  ctx.fillStyle = '#5a3a8a';
  ctx.shadowColor = '#9a5aff'; ctx.shadowBlur = 18;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * half, Math.sin(a) * half);
  }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  // 酸液囊
  ctx.fillStyle = '#aaff00';
  ctx.shadowColor = '#aaff00'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(half * 0.6, 0, half * 0.45, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawGhost(z, half, frameCount, redPlayer, bluePlayer, myRole) {
  const me = myRole === 'red' ? redPlayer : bluePlayer;
  if (!me) return;
  const dist = Math.hypot(me.x - z.x, me.y - z.y);
  const alpha = Math.max(0.1, 1 - dist / 300);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#a8c4ff';
  ctx.shadowColor = '#a8c4ff'; ctx.shadowBlur = 24;
  ctx.beginPath();
  const segs = 16;
  for (let i = 0; i <= segs; i++) {
    const a = i / segs * Math.PI * 2;
    const r = half * (1 + Math.sin(a * 4 + frameCount * 0.1) * 0.15);
    ctx[i === 0 ? 'moveTo' : 'lineTo'](z.x + Math.cos(a) * r, z.y + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = '#0a0f1c';
  ctx.beginPath(); ctx.arc(z.x - 5, z.y - 2, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(z.x + 5, z.y - 2, 3, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSplitter(z, half, wob) {
  ctx.fillStyle = '#7a3a5a';
  ctx.shadowColor = '#ff4d9a'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(z.x, z.y, half, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  // 内部小圆
  ctx.fillStyle = '#ff6bd2';
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + z.wobble * 0.3;
    ctx.beginPath();
    ctx.arc(z.x + Math.cos(a) * half * 0.4, z.y + Math.sin(a) * half * 0.4, half * 0.25, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(z.x - 5, z.y - 3, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(z.x + 5, z.y - 3, 2, 0, Math.PI*2); ctx.fill();
}

// ============ Boss ============
function drawBoss(b) {
  const half = b.size / 2;
  const wob = Math.sin(b.wobble) * 4;
  ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 40;
  ctx.fillStyle = '#8a1a3a';
  ctx.beginPath();
  ctx.roundRect(b.x - half + wob, b.y - half, b.size, b.size, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#a82a4a';
  ctx.beginPath();
  ctx.roundRect(b.x - half + 8 + wob, b.y - half + 8, b.size - 16, b.size - 16, 8);
  ctx.fill();
  const eoX = Math.cos(b.angle) * 8, eoY = Math.sin(b.angle) * 8;
  ctx.fillStyle = '#ff0000';
  ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.arc(b.x - 12 + wob + eoX, b.y - 6 + eoY, 6, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(b.x + 12 + wob + eoX, b.y - 6 + eoY, 6, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  const bw = b.size + 20;
  ctx.fillStyle = '#2e1a1f';
  ctx.fillRect(b.x - bw/2, b.y - half - 20, bw, 10);
  ctx.fillStyle = '#ff4d6d';
  ctx.fillRect(b.x - bw/2, b.y - half - 20, bw * (b.hp / b.maxHp), 10);
  ctx.font = 'bold 14px "Segoe UI"'; ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4d6d';
  ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 12;
  ctx.fillText('⚡ BOSS ⚡', b.x, b.y - half - 28);
  ctx.shadowBlur = 0; ctx.textAlign = 'left';
}

// ============ 掉落物 ============
function drawPickup(p) {
  const bob = Math.sin(p.bob) * 3;
  const alpha = p.life < 120 ? (0.4 + 0.6 * Math.abs(Math.sin(p.life * 0.3))) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (p.type === 'health') {
    ctx.fillStyle = '#4dff8b';
    ctx.shadowColor = '#4dff8b'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 10, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a1a10';
    ctx.fillRect(p.x - 2, p.y + bob - 7, 4, 14);
    ctx.fillRect(p.x - 7, p.y + bob - 2, 14, 4);
  } else {
    const colors = { speed: ['#4dd4ff', '💨', '#0a1a24'], invisible: ['#d44dff', '👻', '#1a0a24'], double: ['#ffd24d', '⚡', '#241a0a'] };
    const c = colors[p.type] || colors.speed;
    ctx.fillStyle = c[0];
    ctx.shadowColor = c[0]; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 10, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 14px "Segoe UI"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = c[2];
    ctx.fillText(c[1], p.x, p.y + bob);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

// ============ 粒子 ============
function drawParticles() {
  for (const p of particles) {
    const alpha = p.fade ? p.life / p.maxLife : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    if (p.shape === 'circle') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// ============ 伤害飘字 ============
function drawDamageTexts(damageTexts) {
  for (const dt of damageTexts) {
    const alpha = Math.min(1, dt.life / (dt.maxLife * 0.5));
    const scale = 0.9 + 0.3 * (1 - dt.life / dt.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round(dt.size * scale)}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = dt.color;
    ctx.shadowColor = dt.color; ctx.shadowBlur = 12;
    ctx.fillText(dt.text, dt.x, dt.y);
    ctx.restore();
  }
}

// ============ HUD ============
function drawHUD(game) {
  const { redPlayer, bluePlayer, myRole, gameMode, isSoloMode,
    zombieKills, zombieWave, bosses, comboCount, scoreRed, scoreBlue,
    camera, worldW, worldH } = game;
  ctx.font = '14px "Segoe UI"';
  ctx.fillStyle = '#6b7fa0';
  const me = myRole === 'red' ? redPlayer : bluePlayer;
  if (me) {
    const roleLabel = isSoloMode ? '单人' : (myRole === 'red' ? '红' : '蓝');
    ctx.fillText(`你是: ${me.name} (${roleLabel})`, 30, 40);
    if (gameMode === 'pvp' && redPlayer && bluePlayer) {
      ctx.fillText(`比分 ${redPlayer.name} ${scoreRed} : ${scoreBlue} ${bluePlayer.name}`, 30, 62);
    } else {
      ctx.fillText(`🧟 击杀 ${zombieKills}   波次 ${zombieWave}   BOSS ${bosses.length}`, 30, 62);
    }
    if (comboCount >= 2) {
      ctx.font = 'bold 20px "Segoe UI"';
      ctx.fillStyle = '#ffd24d';
      ctx.shadowColor = '#ffd24d'; ctx.shadowBlur = 12;
      ctx.fillText(`🔥 ${comboCount} 连击`, 30, 90);
      ctx.shadowBlur = 0;
    }
    if (gameMode === 'zombie' || isSoloMode) {
      ctx.font = '12px "Consolas", monospace';
      ctx.fillStyle = '#3d4d6e';
      ctx.fillText(`地图: ${WORLD_W}×${WORLD_H}  位置: ${Math.round(me.x)},${Math.round(me.y)}`, 30, H - 20);
    }
  }

  if (gameMode === 'pvp' && redPlayer && bluePlayer) {
    if (redPlayer.hp <= 0) {
      ctx.font = 'bold 42px "Segoe UI"'; ctx.fillStyle = '#ff4d6daa';
      ctx.fillText(redPlayer.name + ' DOWN', W/2-180, H/2);
    }
    if (bluePlayer.hp <= 0) {
      ctx.font = 'bold 42px "Segoe UI"'; ctx.fillStyle = '#4da6ffaa';
      ctx.fillText(bluePlayer.name + ' DOWN', W/2-180, H/2 + 50);
    }
  }
}

// ============ 小地图 ============
export function drawMinimap(game) {
  const { worldW, worldH, redPlayer, bluePlayer, zombies, bosses, pickups, obstacles, myRole, camera } = game;
  const mm = document.getElementById('minimap');
  if (!mm || mm.style.display === 'none') return;
  const mctx = mm.getContext('2d');
  const mw = mm.width, mh = mm.height;
  const sx = mw / worldW, sy = mh / worldH;

  mctx.clearRect(0, 0, mw, mh);

  // 背景
  mctx.fillStyle = 'rgba(10, 15, 28, 0.9)';
  mctx.fillRect(0, 0, mw, mh);

  // 障碍物
  mctx.fillStyle = '#2a3650';
  for (const o of obstacles) {
    mctx.fillRect(o.x * sx, o.y * sy, o.w * sx, o.h * sy);
  }

  // 掉落物
  for (const p of pickups) {
    mctx.fillStyle = '#ffd24d';
    mctx.fillRect(p.x * sx - 1, p.y * sy - 1, 2, 2);
  }

  // 僵尸
  mctx.fillStyle = '#ff6b4d';
  for (const z of zombies) {
    mctx.fillRect(z.x * sx - 1, z.y * sy - 1, 2, 2);
  }
  // Boss
  mctx.fillStyle = '#ff0044';
  for (const b of bosses) {
    mctx.beginPath();
    mctx.arc(b.x * sx, b.y * sy, 4, 0, Math.PI * 2);
    mctx.fill();
  }

  // 玩家
  const drawDot = (p, color) => {
    if (!p) return;
    mctx.fillStyle = color;
    mctx.beginPath();
    mctx.arc(p.x * sx, p.y * sy, 3, 0, Math.PI * 2);
    mctx.fill();
  };
  drawDot(redPlayer, '#ff4d6d');
  drawDot(bluePlayer, '#4da6ff');

  // 视野矩形
  mctx.strokeStyle = 'rgba(255,255,255,0.4)';
  mctx.lineWidth = 1;
  mctx.strokeRect(camera.x * sx, camera.y * sy, (game.W || 1200) * sx, (game.H || 700) * sy);
}
