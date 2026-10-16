/**
 * js/ui.js
 * 界面状态机与 HUD 更新
 */

const UI = {
  screens: ['menu-screen', 'mode-screen', 'difficulty-screen', 'game-screen', 'result-screen'],

  /** 显示指定界面，隐藏其他 */
  showScreen(id) {
    this.screens.forEach(s => document.getElementById(s).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  },

  /** 生成模式选择按钮 */
  setModeButtons(onSelect) {
    const container = document.getElementById('mode-buttons');
    container.innerHTML = '';
    const modes = [
      { id: 'classic', label: '经典模式', desc: '3 条命，逐步加速' },
      { id: 'timeAttack', label: '限时挑战', desc: '60 秒狂刷分数' },
      { id: 'zen', label: '无尽禅意', desc: '无限生命，放松心情' },
      { id: 'survival', label: '极限生存', desc: '密集障碍，一碰即死' }
    ];
    modes.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'mode-btn';
      btn.innerHTML = `<strong>${m.label}</strong><span>${m.desc}</span>`;
      btn.addEventListener('click', () => onSelect(m.id));
      container.appendChild(btn);
    });
  },

  /** 生成难度选择按钮 */
  setDifficultyButtons(onSelect) {
    const container = document.getElementById('difficulty-buttons');
    container.innerHTML = '';
    const diffs = [
      { id: 'easy', label: '简单', desc: '慢速 · 大判定 · 无障碍' },
      { id: 'medium', label: '中等', desc: '标准速度 · 少量障碍' },
      { id: 'hard', label: '困难', desc: '快速 · 小判定 · 密集障碍' }
    ];
    diffs.forEach(d => {
      const btn = document.createElement('button');
      btn.className = 'difficulty-btn';
      btn.innerHTML = `<strong>${d.label}</strong><span>${d.desc}</span>`;
      btn.addEventListener('click', () => onSelect(d.id));
      container.appendChild(btn);
    });
  },

  /** 更新 HUD */
  updateHUD({ score, combo, maxCombo, lives, mode, difficulty, timeLeft }) {
    document.getElementById('hud-score').textContent = score;
    document.getElementById('hud-combo').textContent = combo;
    document.getElementById('hud-max-combo').textContent = maxCombo;
    document.getElementById('hud-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, 3 - lives));
    document.getElementById('hud-mode').textContent = this.modeLabel(mode);
    document.getElementById('hud-difficulty').textContent = difficulty ? this.diffLabel(difficulty) : '';

    const comboBar = document.getElementById('combo-bar');
    const progress = Math.min(100, (combo % 5) * 20);
    comboBar.style.width = `${progress}%`;

    const timeEl = document.getElementById('hud-time');
    if (timeLeft !== null && timeLeft !== undefined) {
      timeEl.classList.remove('hidden');
      timeEl.textContent = `⏱ ${timeLeft.toFixed(1)}s`;
    } else {
      timeEl.classList.add('hidden');
    }
  },

  /** 显示倒计时 */
  showCountdown(value) {
    const el = document.getElementById('countdown-overlay');
    el.textContent = value;
    el.classList.remove('hidden');
  },

  hideCountdown() {
    document.getElementById('countdown-overlay').classList.add('hidden');
  },

  showPause(show) {
    document.getElementById('pause-overlay').classList.toggle('hidden', !show);
  },

  modeLabel(mode) {
    const map = { classic: '经典', timeAttack: '限时', zen: '禅意', survival: '生存' };
    return map[mode] || mode;
  },

  diffLabel(diff) {
    const map = { easy: '简单', medium: '中等', hard: '困难' };
    return map[diff] || diff;
  },

  /** 填充结算界面 */
  fillResult({ score, maxCombo, survivalTimeMs, mode, difficulty, highScore, feedback }) {
    document.getElementById('result-mode').textContent = this.modeLabel(mode);
    document.getElementById('result-difficulty').textContent = difficulty ? this.diffLabel(difficulty) : '—';
    document.getElementById('result-score').textContent = score;
    document.getElementById('result-combo').textContent = maxCombo;
    document.getElementById('result-time').textContent = (survivalTimeMs / 1000).toFixed(1);
    document.getElementById('result-high-score').textContent = highScore;
    document.getElementById('result-feedback').textContent = feedback || '正在请 AI 裁判点评...';
  },

  /** 绑定菜单相关事件 */
  bindMenuEvents({ onStart, onBackToMenu }) {
    document.getElementById('menu-start-btn').addEventListener('click', onStart);
    document.getElementById('mode-back-btn').addEventListener('click', onBackToMenu);
    document.getElementById('diff-back-btn').addEventListener('click', () => this.showScreen('mode-screen'));
    document.getElementById('pause-btn').addEventListener('click', () => window.game && window.game.togglePause());
    document.getElementById('resume-btn').addEventListener('click', () => window.game && window.game.togglePause());
    document.getElementById('zen-end-btn').addEventListener('click', () => window.game && window.game.endGame('主动结束'));
    document.getElementById('result-restart-btn').addEventListener('click', onStart);
    document.getElementById('result-menu-btn').addEventListener('click', onBackToMenu);
  }
};
