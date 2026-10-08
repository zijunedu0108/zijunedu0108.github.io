import {
  WORLD_W, WORLD_H, ZOMBIE_SIZE, ZOMBIE_MAX_COUNT,
  ZOMBIE_TOUCH_COOLDOWN, BOSS_SIZE, BOSS_BASE_HP,
  BOSS_CONTACT_DAMAGE, PICKUP_SIZE, PICKUP_LIFETIME,
  PLAYER_SIZE, BULLET_SIZE, ZOMBIE_TYPES,
} from './config.js';
import { SFX, spawnParticles } from './utils.js';

let zombieIdCounter = 0;
let bossIdCounter = 0;

// ============ 生成普通僵尸（按类型 + 波次） ============
export function spawnZombie(zombies, wave, forceType = null, x = null, y = null) {
  if (zombies.length >= ZOMBIE_MAX_COUNT) return null;

  // 加权随机
  let typeKey = forceType;
  if (!typeKey) {
    const available = Object.entries(ZOMBIE_TYPES)
      .filter(([k, t]) => (t.minWave || 1) <= wave);
    const totalWeight = available.reduce((s, [k, t]) => s + t.weight, 0);
    let r = Math.random() * totalWeight;
    for (const [k, t] of available) {
      r -= t.weight;
      if (r <= 0) { typeKey = k; break; }
    }
    if (!typeKey) typeKey = 'normal';
  }

  const t = ZOMBIE_TYPES[typeKey];
  let px = x, py = y;
  if (px === null) {
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: px = -40; py = Math.random() * WORLD_H; break;
      case 1: px = WORLD_W + 40; py = Math.random() * WORLD_H; break;
      case 2: px = Math.random() * WORLD_W; py = -40; break;
      default: px = Math.random() * WORLD_W; py = WORLD_H + 40; break;
    }
  }

  const speedBonus = Math.min(1.8, wave * 0.08);
  const hp = t.hp + Math.floor(wave / 3);

  const z = {
    id: 'z-' + (zombieIdCounter++),
    type: typeKey,
    x: px, y: py, hp, maxHp: hp,
    speed: (t.speed + speedBonus) * (0.8 + Math.random() * 0.4),
    size: t.size || ZOMBIE_SIZE,
    damage: t.damage,
    xp: t.xp,
    lastTouch: { red: 0, blue: 0 },
    angle: 0,
    wobble: Math.random() * Math.PI * 2,
    fuse: t.explode ? 60 : undefined,   // 自爆兵引信
    shootTimer: t.ranged ? 120 : undefined,   // 投掷者射击计时
  };
  zombies.push(z);
  return z;
}

// ============ 生成 Boss ============
export function spawnBoss(bosses, wave) {
  const side = Math.floor(Math.random() * 4);
  const margin = 200;
  let x, y;
  switch (side) {
    case 0: x = margin; y = WORLD_H / 2; break;
    case 1: x = WORLD_W - margin; y = WORLD_H / 2; break;
    case 2: x = WORLD_W / 2; y = margin; break;
    default: x = WORLD_W / 2; y = WORLD_H - margin; break;
  }
  const bossNum = bosses.length + 1 + Math.floor((wave - 1) / 10);
  const hp = BOSS_BASE_HP + (bossNum - 1) * 80;
  const speed = 0.6 + (bossNum - 1) * 0.15;
  const shootCD = Math.max(40, 90 - (bossNum - 1) * 8);

  const b = {
    id: 'boss-' + (bossIdCounter++),
    x, y, hp, maxHp: hp,
    size: BOSS_SIZE,
    speed, shootCD, shootTimer: 60,
    angle: 0, wobble: 0, phase: 0, isBoss: true,
  };
  bosses.push(b);
  SFX.bossSpawn();
  return b;
}

// ============ 更新僵尸和 Boss ============
export function updateZombiesAndBosses(ctx) {
  const {
    zombies, bosses, obstacles, redPlayer, bluePlayer,
    frameCount, isSoloMode, myRole, safeSend, spawnDamageText,
    onZombieKilled, onBossKilled, spawnPickup, onPlayerDamaged,
    zombieWave, gameOver, settings, onAcidBullet, screenShakeRef,
  } = ctx;
  const wave = zombieWave;
  const zSpeedMult = settings && settings.zombieSpeedMult ? settings.zombieSpeedMult : 1;

  const players = [redPlayer, bluePlayer].filter(p => p && p.hp > 0);

  // ===== 更新普通僵尸 =====
  for (const z of zombies) {
    let target = null, minD = Infinity;
    for (const p of players) {
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < minD) { minD = d; target = p; }
    }
    if (!target) continue;

    const dx = target.x - z.x, dy = target.y - z.y;
    const dist = Math.hypot(dx, dy) || 1;
    z.angle = Math.atan2(dy, dx);
    z.wobble += 0.15;

    // 特殊行为
    if (z.type === 'bomber') {
      if (dist < 70) {
        z.fuse = (z.fuse !== undefined ? z.fuse : 60) - 1;
        // 不移动，原地倒数
      } else {
        z.x += (dx / dist) * z.speed * zSpeedMult;
        z.y += (dy / dist) * z.speed * zSpeedMult;
      }
      if (z.fuse <= 0) {
        // 爆炸
        for (const p of players) {
          if (Math.hypot(p.x - z.x, p.y - z.y) < 100) {
            const dmg = 25;
            p.hp = Math.max(0, p.hp - dmg);
            if (p === redPlayer && !isSoloMode) safeSend({ type: 'hpUpdate', role: 'red', hp: p.hp, seq: ++p.hpSeq });
            if (p === bluePlayer && !isSoloMode) safeSend({ type: 'hpUpdate', role: 'blue', hp: p.hp, seq: ++p.hpSeq });
            onPlayerDamaged(p, dmg, z.x, z.y);
          }
        }
        spawnParticles(z.x, z.y, { count: 30, color: '#ff5020', speed: 8, life: 40, size: 4 });
        SFX.bossDie();
        if (screenShakeRef) screenShakeRef.value = 20;
        zombies.splice(zombies.indexOf(z), 1);
        continue;
      }
    } else if (z.type === 'thrower') {
      // 保持距离，远程射击
      const desiredDist = 280;
      if (dist > desiredDist + 40) {
        z.x += (dx / dist) * z.speed * zSpeedMult;
        z.y += (dy / dist) * z.speed * zSpeedMult;
      } else if (dist < desiredDist - 40) {
        z.x -= (dx / dist) * z.speed * zSpeedMult * 0.5;
        z.y -= (dy / dist) * z.speed * zSpeedMult * 0.5;
      }
      z.shootTimer--;
      if (z.shootTimer <= 0 && dist < 500) {
        z.shootTimer = 120;
        onAcidBullet(z.x, z.y, z.angle);
      }
    } else if (z.type === 'ghost') {
      z.x += (dx / dist) * z.speed * zSpeedMult;
      z.y += (dy / dist) * z.speed * zSpeedMult;
    } else {
      z.x += (dx / dist) * z.speed * zSpeedMult;
      z.y += (dy / dist) * z.speed * zSpeedMult;
    }

    // 障碍物推开
    const zHalf = z.size / 2;
    const zRect = { x: z.x - zHalf, y: z.y - zHalf, w: z.size, h: z.size };
    for (const o of obstacles) {
      if (rectsOverlap(zRect, o)) {
        const oL = (zRect.x + zRect.w) - o.x, oR = (o.x + o.w) - zRect.x;
        const oT = (zRect.y + zRect.h) - o.y, oB = (o.y + o.h) - zRect.y;
        const min = Math.min(oL, oR, oT, oB);
        if (min === oL) z.x -= oL; else if (min === oR) z.x += oR;
        else if (min === oT) z.y -= oT; else z.y += oB;
      }
    }

    // 攻击玩家（非自爆兵/投掷者）
    if (z.type !== 'bomber' && z.type !== 'thrower') {
      for (const p of players) {
        const zr = z.size / 2 + PLAYER_SIZE / 2;
        if (Math.hypot(p.x - z.x, p.y - z.y) < zr) {
          const key = p === redPlayer ? 'red' : 'blue';
          if (frameCount - z.lastTouch[key] > ZOMBIE_TOUCH_COOLDOWN) {
            z.lastTouch[key] = frameCount;
            if (p.shieldActive > 0) {
              if ((isSoloMode ? 'red' : myRole) === key) spawnDamageText(p.x, p.y, 0, '#4dd4ff', '🛡');
            } else {
              p.hp = Math.max(0, p.hp - z.damage);
              if (!isSoloMode) safeSend({ type: 'hpUpdate', role: key, hp: p.hp, seq: ++p.hpSeq });
              onPlayerDamaged(p, z.damage, p.x, p.y);
            }
          }
        }
      }
    }
  }

  // ===== 更新 Boss =====
  for (const b of bosses) {
    let target = null, minD = Infinity;
    for (const p of players) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < minD) { minD = d; target = p; }
    }
    if (!target) continue;
    const dx = target.x - b.x, dy = target.y - b.y;
    const dist = Math.hypot(dx, dy) || 1;
    b.x += (dx / dist) * b.speed * zSpeedMult;
    b.y += (dy / dist) * b.speed * zSpeedMult;
    b.angle = Math.atan2(dy, dx);
    b.wobble += 0.08;

    // 障碍物推开
    const bHalf = b.size / 2;
    const bRect = { x: b.x - bHalf, y: b.y - bHalf, w: b.size, h: b.size };
    for (const o of obstacles) {
      if (rectsOverlap(bRect, o)) {
        const oL = (bRect.x + bRect.w) - o.x, oR = (o.x + o.w) - bRect.x;
        const oT = (bRect.y + bRect.h) - o.y, oB = (o.y + o.h) - bRect.y;
        const min = Math.min(oL, oR, oT, oB);
        if (min === oL) b.x -= oL; else if (min === oR) b.x += oR;
        else if (min === oT) b.y -= oT; else b.y += oB;
      }
    }

    // Boss 射击
    if (b.shootTimer > 0) b.shootTimer--;
    if (b.shootTimer <= 0 && target) {
      b.shootTimer = b.shootCD;
      for (let i = -1; i <= 1; i++) {
        const ang = b.angle + i * 0.25;
        onAcidBullet(b.x, b.y, ang, 'boss');
      }
      SFX.bossShoot();
    }

    // 接触伤害
    for (const p of players) {
      const rr = b.size / 2 + PLAYER_SIZE / 2;
      if (Math.hypot(p.x - b.x, p.y - b.y) < rr) {
        const key = p === redPlayer ? 'red' : 'blue';
        if (p.shieldActive > 0) {
          if ((isSoloMode ? 'red' : myRole) === key) spawnDamageText(p.x, p.y, 0, '#4dd4ff', '🛡');
        } else {
          p.hp = Math.max(0, p.hp - BOSS_CONTACT_DAMAGE);
          if (!isSoloMode) safeSend({ type: 'hpUpdate', role: key, hp: p.hp, seq: ++p.hpSeq });
          onPlayerDamaged(p, BOSS_CONTACT_DAMAGE, p.x, p.y);
          // 击退
          const kdx = p.x - b.x, kdy = p.y - b.y;
          const kd = Math.hypot(kdx, kdy) || 1;
          p.x += (kdx / kd) * 30;
          p.y += (kdy / kd) * 30;
        }
      }
    }
  }

  // 检查死亡
  const anyAlive = players.length > 0;
  if (!anyAlive) {
    gameOver();
  }
}

// ============ 爆炸 ============
export function explodeAt(x, y, radius, damage, ctx) {
  const { players, onPlayerDamaged, safeSend, isSoloMode } = ctx;
  for (const p of players) {
    if (!p || p.hp <= 0) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radius) {
      if (p.shieldActive > 0) continue;
      p.hp = Math.max(0, p.hp - damage);
      if (!isSoloMode) safeSend({ type: 'hpUpdate', role: p.role, hp: p.hp, seq: ++p.hpSeq });
      onPlayerDamaged(p, damage, x, y);
    }
  }
  spawnParticles(x, y, { count: 40, color: '#ff5020', speed: 10, life: 50, size: 5 });
  spawnParticles(x, y, { count: 20, color: '#ffd24d', speed: 6, life: 40, size: 4 });
}

// ============ 分裂 ============
export function spawnSplitterChildren(z, zombies) {
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const child = spawnZombie(zombies, 1, 'runner',
      z.x + Math.cos(a) * 30, z.y + Math.sin(a) * 30);
    if (child) {
      child.hp = 2; child.maxHp = 2;
      child.speed *= 1.3;
      child.isSplitChild = true;
    }
  }
}

// ============ 工具：矩形重叠 ============
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function playerHitsObstacle(px, py, obs) {
  const half = PLAYER_SIZE / 2;
  const pR = { x: px - half, y: py - half, w: PLAYER_SIZE, h: PLAYER_SIZE };
  for (const o of obs) if (rectsOverlap(pR, o)) return true;
  return false;
}
export function bulletHitsObstacle(b, obs) {
  const r = BULLET_SIZE / 2;
  const bR = { x: b.x - r, y: b.y - r, w: BULLET_SIZE, h: BULLET_SIZE };
  for (const o of obs) if (rectsOverlap(bR, o)) return true;
  return false;
}
