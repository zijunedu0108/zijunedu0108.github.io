// ============ 全局常量配置 ============

export const W = 1200, H = 700;
export const WORLD_W = W * 2;
export const WORLD_H = H * 2;

export const PLAYER_SIZE = 28;
export const BULLET_SIZE = 8;
export const PLAYER_SPEED = 4.8;
export const BULLET_SPEED = 9;
export const SHOOT_COOLDOWN = 12;
export const DAMAGE_AMOUNT = 14;

export const ZOMBIE_SIZE = 26;
export const ZOMBIE_SPEED_BASE = 1.0;
export const ZOMBIE_HP = 3;
export const ZOMBIE_DAMAGE = 8;
export const ZOMBIE_TOUCH_COOLDOWN = 60;
export const ZOMBIE_MAX_COUNT = 40;

export const BOSS_SIZE = 80;
export const BOSS_BASE_HP = 100;
export const BOSS_CONTACT_DAMAGE = 25;
export const BOSS_SHOOT_COOLDOWN = 90;

export const SKILL_COOLDOWN = { dash: 240, shield: 480, ultimate: 900 };
export const DASH_DURATION = 18, DASH_SPEED = 14, SHIELD_DURATION = 180;

export const PICKUP_SIZE = 20, PICKUP_LIFETIME = 900, BUFF_DURATION = 480;
export const BUFF_SPEED_MULT = 1.6, BUFF_DOUBLE_MULT = 2;

export const COMBO_WINDOW = 120;
export const COMBO_MILESTONES = [3, 5, 10, 15, 20, 30];

export const SLOWMO_DURATION = 30;
export const XP_PER_LEVEL = 3;

// ============ 武器 ============
export const WEAPONS = {
  pistol:   { name: '手枪', icon: '🔫', cooldown: 14, damage: 14, bulletSpeed: 9,  bulletsPerShot: 1, spread: 0,    ammo: Infinity, color: '#ffffff' },
  shotgun:  { name: '散弹', icon: '💥', cooldown: 36, damage: 8,  bulletSpeed: 8,  bulletsPerShot: 5, spread: 0.35, ammo: 8,        color: '#ffaa4d' },
  sniper:   { name: '狙击', icon: '🎯', cooldown: 60, damage: 40, bulletSpeed: 16, bulletsPerShot: 1, spread: 0,    ammo: 5,        color: '#4dffd2' },
  machine:  { name: '机枪', icon: '⚙️', cooldown: 5,  damage: 6,  bulletSpeed: 10, bulletsPerShot: 1, spread: 0.12, ammo: 60,       color: '#ff6bd2' }
};
export const WEAPON_ORDER = ['pistol', 'shotgun', 'sniper', 'machine'];

// ============ 主题 ============
export const THEMES = {
  space:  { name: '深空', icon: '🌌', bg: ['#0e1424', '#080b16'], grid: '#141a2a',
            obstacleFill: '#1e2a44', obstacleStroke: '#3a4d75', obstacleHighlight: 'rgba(120,160,255,0.08)' },
  snow:   { name: '雪地', icon: '❄️', bg: ['#1a2438', '#0d1522'], grid: '#1f2c44',
            obstacleFill: '#c8d8ec', obstacleStroke: '#e8f0ff', obstacleHighlight: 'rgba(255,255,255,0.3)' },
  desert: { name: '沙漠', icon: '🏜️', bg: ['#2a2015', '#150e05'], grid: '#2e2418',
            obstacleFill: '#a8845a', obstacleStroke: '#d4a878', obstacleHighlight: 'rgba(255,220,150,0.15)' },
  zombie: { name: '末日', icon: '🧟', bg: ['#1a1420', '#0a0710'], grid: '#1e1428',
            obstacleFill: '#2a1e3a', obstacleStroke: '#4d3670', obstacleHighlight: 'rgba(120,80,180,0.15)' }
};

// ============ 僵尸类型 ============
export const ZOMBIE_TYPES = {
  normal:   { hp: 3,  speed: 1.0,  damage: 8,  size: 26, color: '#5a8a3a', xp: 1, weight: 60, minWave: 1 },
  runner:   { hp: 2,  speed: 2.4,  damage: 6,  size: 22, color: '#ff8030', xp: 1, weight: 25, minWave: 1 },
  tank:     { hp: 12, speed: 0.55, damage: 18, size: 40, color: '#4a3a2a', xp: 3, weight: 10, minWave: 3 },
  bomber:   { hp: 3,  speed: 1.4,  damage: 0,  size: 24, color: '#c03a1a', xp: 2, weight: 8,  minWave: 4, explode: true },
  thrower:  { hp: 5,  speed: 0.8,  damage: 6,  size: 28, color: '#5a3a8a', xp: 2, weight: 6,  minWave: 5, ranged: true },
  ghost:    { hp: 3,  speed: 1.2,  damage: 10, size: 26, color: '#a8c4ff', xp: 2, weight: 5,  minWave: 6, invisible: true },
  splitter: { hp: 6,  speed: 0.9,  damage: 10, size: 30, color: '#7a3a5a', xp: 2, weight: 5,  minWave: 7, split: 3 },
};

// ============ 升级池 ============
export const UPGRADES = [
  { id: 'dmg',      icon: '💥', name: '伤害强化',  desc: '所有武器伤害 +20%',        apply: p => p.dmgMult *= 1.2 },
  { id: 'speed',    icon: '💨', name: '疾风步',    desc: '移动速度 +15%',            apply: p => p.speedMult *= 1.15 },
  { id: 'hp',       icon: '❤️', name: '强健体魄',  desc: '最大生命 +20 并回满',      apply: p => { p.maxHp += 20; p.hp = p.maxHp; } },
  { id: 'dashcd',   icon: '⚡', name: '迅捷冲刺',  desc: '冲刺冷却 -25%',            apply: p => p.cdMult.dash *= 0.75 },
  { id: 'shield',   icon: '🛡', name: '护盾强化',  desc: '护盾冷却 -25%，持续 +50%', apply: p => { p.cdMult.shield *= 0.75; p.shieldDurMult *= 1.5; } },
  { id: 'reload',   icon: '🔄', name: '快速换弹',  desc: '换弹时间 -40%',            apply: p => p.reloadMult *= 0.6 },
  { id: 'pierce',   icon: '🎯', name: '穿甲弹',    desc: '子弹可穿透 1 个敌人',      apply: p => p.pierce += 1 },
  { id: 'crit',     icon: '✨', name: '致命一击',  desc: '20% 概率造成双倍伤害',     apply: p => p.critChance += 0.2 },
  { id: 'lifesteal',icon: '🩸', name: '吸血',      desc: '击杀回复 5 点生命',        apply: p => p.lifesteal += 5 },
  { id: 'magnet',   icon: '🧲', name: '磁力场',    desc: '掉落物拾取范围 +80%',      apply: p => p.pickupRange *= 1.8 },
];

// ============ 皮肤 ============
export const SKINS = {
  default:  { name: '默认',   price: 0,    color: null,       trail: null,     glow: 28, desc: '经典红蓝配色' },
  neon:     { name: '霓虹',   price: 500,  color: '#ff00ff',  trail: '#ff00ff', glow: 40, desc: '赛博朋克风' },
  gold:     { name: '黄金',   price: 2000, color: '#ffd24d',  trail: '#ffd24d', glow: 36, desc: '土豪专属' },
  shadow:   { name: '暗影',   price: 1500, color: '#1a1a2a',  trail: '#4d4dff', glow: 20, desc: '暗夜潜行' },
  fire:     { name: '烈焰',   price: 3000, color: '#ff4d1a',  trail: '#ffd24d', glow: 44, desc: '燃烧的心' },
  ice:      { name: '冰霜',   price: 2500, color: '#4dd4ff',  trail: '#a8e8ff', glow: 32, desc: '寒冰之力' },
};
