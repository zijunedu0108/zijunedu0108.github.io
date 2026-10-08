import { UPGRADES, XP_PER_LEVEL, SKILL_COOLDOWN } from './config.js';
import { $, SFX } from './utils.js';

let gameRef = null;
export function setGameRef(g) { gameRef = g; }

// ============ 检查升级 ============
export function checkLevelUp(player, onPause, onResume) {
  if (!player) return;
  while (player.xp >= XP_PER_LEVEL) {
    player.xp -= XP_PER_LEVEL;
    player.level++;
    onPause();
    showUpgradeChoice(player, onResume);
    // 一次只显示一个选择面板
    break;
  }
}

// ============ 显示三选一 ============
export function showUpgradeChoice(player, onResume) {
  const pool = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  const panel = $('upgradePanel');
  const box = $('upgradeOptions');
  if (!panel || !box) return;
  box.innerHTML = pool.map(u => `
    <div class="upgrade-card" data-id="${u.id}">
      <div class="u-icon">${u.icon}</div>
      <div class="u-name">${u.name}</div>
      <div class="u-desc">${u.desc}</div>
    </div>
  `).join('');

  const handler = (card) => {
    const u = UPGRADES.find(x => x.id === card.dataset.id);
    if (u) u.apply(player);
    panel.classList.remove('visible');
    SFX.levelUp();
    if (onResume) onResume();
    // 如果还有剩余经验，继续升级
    if (player.xp >= XP_PER_LEVEL) {
      setTimeout(() => {
        player.xp -= XP_PER_LEVEL;
        player.level++;
        showUpgradeChoice(player, onResume);
      }, 300);
    }
  };
  box.querySelectorAll('.upgrade-card').forEach(card => {
    card.addEventListener('click', () => handler(card), { once: true });
  });
  panel.classList.add('visible');
}

// ============ 应用升级到技能冷却（重算） ============
export function applyCooldownMult(player) {
  // 在 useDash/useShield/useUltimate 里使用 player.cdMult
  // 这里只是个占位，实际逻辑在 game.js 使用
}
