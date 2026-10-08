import { $, on, txt, cls, initAudio, setSoundEnabled, setMusicEnabled, startMusic, stopMusic, soundEnabled, musicEnabled, SFX } from './utils.js';
import {
  G, initInput, initMouse, handleMessage, generateRoomCode, initPeer,
  safeSend, startGame, startSoloGame, cleanupAndReturnToLobby,
  switchView, updateScoreboard, updateScoreboardVisibility, updateThemeBadge,
  updateAimUI, showChatBubble, closeChatPanel, setChatPanelOpen,
  updateGameSettings,
} from './game.js';
import { initCtx } from './render.js';
import { setGameRef, showUpgradeChoice } from './upgrades.js';
import { initFirebase, getCurrentUser, getProfile, renderSkinShop, updateCoinUI, applySkin, getCurrentSkin, recordGameResult } from './firebase.js';
import { WEAPONS, WEAPON_ORDER } from './config.js';

// ============ 初始化 ============
let canvas = null;

async function bootstrap() {
  canvas = $('gameCanvas');
  if (canvas) initCtx(canvas);
  initInput();
  initMouse(canvas);
  setGameRef(G);

  // 添加低血覆盖层
  const lowHp = document.createElement('div');
  lowHp.className = 'low-hp-vignette';
  lowHp.id = 'lowHpVignette';
  document.body.appendChild(lowHp);

  // 皮肤事件
  window.addEventListener('skinChanged', (e) => {
    G.currentSkin = e.detail;
  });

  await initFirebase();

  bindUI();
  updateScoreboard();
  updateScoreboardVisibility();
  updateThemeBadge();
  updateAimUI();

  txt($('statusText'), '准备就绪，创建或加入房间');
}

// ============ UI 绑定 ============
function bindUI() {
  // Tab
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = document.querySelector(`[data-pane="${tab.dataset.tab}"]`);
      if (pane) pane.classList.add('active');
    });
  });

  // 模式
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      G.gameMode = card.dataset.mode;
    });
  });

  // 瞄准
  on($('aimToggle'), 'click', () => {
    if (G.gameRunning && !G.isHost && !G.isSoloMode) {
      // 只有房主能改
      return;
    }
    G.autoAim = !G.autoAim;
    updateAimUI();
    if (G.gameRunning && !G.isSoloMode) safeSend({ type: 'autoAimUpdate', autoAim: G.autoAim });
  });

  // 设置开关
  on($('soundToggleSwitch'), 'click', () => {
    setSoundEnabled(!soundEnabled);
    cls($('soundToggleSwitch'), 'on', soundEnabled);
    if (soundEnabled) initAudio();
  });
  on($('musicToggleSwitch'), 'click', () => {
    setMusicEnabled(!musicEnabled);
    cls($('musicToggleSwitch'), 'on', musicEnabled);
    if (musicEnabled) { initAudio(); if (G.gameRunning) startMusic(); }
    else stopMusic();
  });

  // 单人
  on($('soloBtn'), 'click', () => {
    initAudio();
    const nick = ($('nickname') ? $('nickname').value.trim() : '') || '玩家';
    G.myNickname = nick;
    startSoloGame(nick);
  });

  // 创建房间
  on($('createRoomBtn'), 'click', async () => {
    initAudio();
    txt($('lobbyError'), '');
    const nick = ($('nickname') ? $('nickname').value.trim() : '') || '玩家';
    G.myNickname = nick;
    $('createRoomBtn').disabled = true;
    txt($('statusText'), '正在创建房间…');
    G.roomCode = generateRoomCode();
    G.isHost = true;
    G.isSoloMode = false;
    G.myRole = 'red';
    const peerId = 'arena-' + G.roomCode;
    try {
      await initPeer(peerId);
      G.peer.on('connection', (incomingConn) => {
        if (G.conn && G.conn.open) { try { incomingConn.close(); } catch(e) {} return; }
        G.conn = incomingConn;
        G.conn.on('open', () => {
          safeSend({ type: 'assignRole', role: 'blue', mode: G.gameMode, hostName: G.myNickname, autoAim: G.autoAim, settings: G.settings });
          txt($('statusText'), '对手已连接');
        });
        G.conn.on('data', handleMessage);
        G.conn.on('close', () => {
          if (G.gameRunning) { alert('对手已断开连接'); cleanupAndReturnToLobby(); }
        });
      });
      txt($('displayRoomCode'), G.roomCode);
      txt($('waitingModeHint'), '模式：' + (G.gameMode === 'pvp' ? '1v1 竞技' : '合作打僵尸'));
      switchView('waiting');
    } catch (err) {
      txt($('lobbyError'), '创建失败：' + (err.message || '未知错误'));
    }
    $('createRoomBtn').disabled = false;
  });

  // 加入房间
  on($('joinRoomBtn'), 'click', async () => {
    initAudio();
    txt($('lobbyError'), '');
    const nick = ($('nickname') ? $('nickname').value.trim() : '') || '玩家';
    G.myNickname = nick;
    const code = ($('joinCode') ? $('joinCode').value.trim().toUpperCase() : '');
    if (code.length !== 6) { txt($('lobbyError'), '请输入 6 位房间号'); return; }
    $('joinRoomBtn').disabled = true;
    txt($('statusText'), '正在加入房间…');
    G.roomCode = code;
    G.isHost = false;
    G.isSoloMode = false;
    G.myRole = 'blue';
    const peerId = 'arena-' + code;
    try {
      const myId = 'join-' + Math.random().toString(36).substr(2, 9);
      await initPeer(myId);
      const targetConn = G.peer.connect(peerId, { reliable: true });
      const to = setTimeout(() => {
        txt($('lobbyError'), '连接超时');
        $('joinRoomBtn').disabled = false;
        try { G.peer.destroy(); } catch(e) {}
      }, 12000);
      targetConn.on('open', () => {
        clearTimeout(to);
        G.conn = targetConn;
        G.conn.on('data', handleMessage);
        G.conn.on('close', () => {
          if (G.gameRunning) { alert('对手已断开连接'); cleanupAndReturnToLobby(); }
        });
        txt($('statusText'), '已连接，等待开始…');
      });
      targetConn.on('error', () => {
        clearTimeout(to);
        txt($('lobbyError'), '无法连接到房间');
        $('joinRoomBtn').disabled = false;
      });
    } catch (err) {
      txt($('lobbyError'), '加入失败：' + (err.message || '未知错误'));
    }
    $('joinRoomBtn').disabled = false;
  });

  // 复制房间号
  on($('copyCodeBtn'), 'click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(G.roomCode).then(() => {
        txt($('copyCodeBtn'), '✅ 已复制');
        setTimeout(() => txt($('copyCodeBtn'), '📋 复制房间号'), 1500);
      });
    }
  });

  // 取消/离开
  on($('cancelWaitBtn'), 'click', cleanupAndReturnToLobby);
  on($('leaveBtn'), 'click', cleanupAndReturnToLobby);

  // 全屏
  on($('fullscreenBtn'), 'click', () => {
    const docEl = document.documentElement;
    if (!document.fullscreenElement) {
      if (docEl.requestFullscreen) docEl.requestFullscreen();
      if ($('fullscreenBtn')) $('fullscreenBtn').textContent = '⛶ 退出全屏';
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      if ($('fullscreenBtn')) $('fullscreenBtn').textContent = '⛶ 全屏';
    }
  });

  // 聊天
  document.querySelectorAll('.chat-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const msg = opt.dataset.msg;
      closeChatPanel();
      showChatBubble(G.myNickname, msg, true);
      SFX.chat();
      if (!G.isSoloMode) safeSend({ type: 'chat', msg });
    });
  });

  // 观战
  on($('spectateBtn'), 'click', () => {
    G.spectating = !G.spectating;
    if (G.spectating) {
      const me = G.myRole === 'red' ? G.redPlayer : G.bluePlayer;
      const alive = [G.redPlayer, G.bluePlayer].filter(p => p && p.hp > 0 && p !== me);
      G.spectatorTarget = alive[0] || null;
      txt($('spectateBtn'), '👁 退出观战');
    } else {
      txt($('spectateBtn'), '👁 观战');
    }
  });

  // 房间设置
  bindRoomSettings();
}

function bindRoomSettings() {
  const set = (id, key, invert = false) => {
    on($(id), 'click', () => {
      if (!G.isHost) return;
      const v = !G.settings[key];
      G.settings[key] = invert ? !v : v;
      cls($(id), 'on', invert ? !v : v);
      if (!G.isSoloMode) safeSend({ type: 'roomSettings', settings: G.settings });
    });
  };
  set('setFF', 'friendlyFire');
  set('setAmmo', 'infiniteAmmo');
  // zombieSpeedMult: 切换 1 / 1.5
  on($('setZSpeed'), 'click', () => {
    if (!G.isHost) return;
    G.settings.zombieSpeedMult = G.settings.zombieSpeedMult === 1 ? 1.5 : 1;
    cls($('setZSpeed'), 'on', G.settings.zombieSpeedMult === 1.5);
    if (!G.isSoloMode) safeSend({ type: 'roomSettings', settings: G.settings });
  });
  // bossEvery: 10 / 5
  on($('setBossFreq'), 'click', () => {
    if (!G.isHost) return;
    G.settings.bossEvery = G.settings.bossEvery === 10 ? 5 : 10;
    cls($('setBossFreq'), 'on', G.settings.bossEvery === 5);
    if (!G.isSoloMode) safeSend({ type: 'roomSettings', settings: G.settings });
  });
}

// ============ 启动 ============
bootstrap().catch(e => {
  console.error('启动失败:', e);
  txt($('statusText'), '启动失败：' + e.message);
});
