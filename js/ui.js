/**
 * js/ui.js
 * 界面状态机与 HUD 更新
 */

const UI = {
  screens: ['menu-screen', 'mode-screen', 'difficulty-screen', 'level-select-screen', 'game-screen', 'result-screen'],

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
      { id: 'survival', label: '极限生存', desc: '密集障碍，一碰即死' },
      { id: 'wizard', label: '魔法手势师', desc: '手势施法 · 教学 → 普通 → Boss' }
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

  /** 生成魔法手势师关卡选择按钮（含锁定/解锁状态） */
  renderLevelSelect(onSelect) {
    const container = document.getElementById('level-buttons');
    if (!container) return;
    container.innerHTML = '';
    const unlocked = Storage.getWizardUnlockedLevel(); // 已解锁的最高关卡序号（1-6）

    const levels = [
      { index: 0, label: '教学关', sub: '学习四种手势', special: 'tutorial' },
      { index: 1, label: '第 1 关', sub: '史莱姆 · 怕火球' },
      { index: 2, label: '第 2 关', sub: '史莱姆 + 飞鸟' },
      { index: 3, label: '第 3 关', sub: '三种敌人' },
      { index: 4, label: '第 4 关', sub: '敌人加速' },
      { index: 5, label: '第 5 关', sub: '密集来袭' },
      { index: 6, label: 'Boss 关', sub: '石像王 · 怕抓取', special: 'boss' }
    ];

    levels.forEach(lv => {
      const isLocked = lv.index > 0 && lv.index > unlocked; // 教学关（index 0）恒解锁
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      if (lv.special === 'tutorial') btn.classList.add('level-btn-tutorial');
      if (lv.special === 'boss') btn.classList.add('level-btn-boss');
      if (isLocked) {
        btn.classList.add('locked');
        btn.disabled = true;
        btn.innerHTML = `<strong>🔒 ${lv.label}</strong><span>通关上一关解锁</span>`;
      } else {
        btn.innerHTML = `<strong>${lv.label}</strong><span>${lv.sub}</span>`;
        btn.addEventListener('click', () => onSelect(lv.index));
      }
      container.appendChild(btn);
    });
  },

  /** 更新 HUD */
  updateHUD({ score, combo, maxCombo, lives, mode, difficulty, timeLeft, level, accuracy, avgReaction, gesture, confidence, cooldown, cooldownMax }) {
    document.getElementById('hud-score').textContent = score;
    document.getElementById('hud-combo').textContent = combo;

    const accEl = document.getElementById('hud-accuracy');
    const reactionEl = document.getElementById('hud-reaction');
    if (mode === 'wizard') {
      if (accEl) accEl.textContent = `${accuracy ?? 0}%`;
      if (reactionEl) reactionEl.textContent = `${avgReaction ?? 0}ms`;
    } else {
      if (accEl) accEl.textContent = '—';
      if (reactionEl) reactionEl.textContent = '—';
    }

    document.getElementById('hud-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, 3 - lives));
    document.getElementById('hud-mode').textContent = this.modeLabel(mode);
    if (level) {
      const diffEl = document.getElementById('hud-difficulty');
      if (level.tutorial) diffEl.textContent = '教学关';
      else if (level.boss) diffEl.textContent = 'Boss 关';
      else diffEl.textContent = `${level.label || '第 ' + (level.index + 1) + ' 关'} ${level.kills}/${level.target}`;
    } else {
      document.getElementById('hud-difficulty').textContent = difficulty ? this.diffLabel(difficulty) : '';
    }

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

    // 手势识别状态 HUD（仅魔法手势师显示）
    const gestureHud = document.getElementById('gesture-hud');
    if (mode === 'wizard') {
      if (gestureHud) gestureHud.classList.remove('hidden');
      const nameEl = document.getElementById('gesture-name');
      const confEl = document.getElementById('gesture-conf');
      if (nameEl) nameEl.textContent = gesture || '无';
      if (confEl) confEl.textContent = `${confidence ?? 0}%`;
      const cdFg = document.getElementById('cooldown-fg');
      if (cdFg) {
        const max = cooldownMax || 22;
        const ready = 1 - Math.max(0, Math.min(cooldown ?? 0, max)) / max;
        cdFg.style.strokeDasharray = `${(ready * 100).toFixed(1)} 100`;
      }
    } else if (gestureHud) {
      gestureHud.classList.add('hidden');
    }
  },

  /** 连击里程碑反馈：放大、变色、抖动 */
  triggerComboEffect(combo) {
    const el = document.getElementById('hud-combo');
    const color = combo >= 10 ? '#ff3b3b' : combo >= 5 ? '#ff9500' : '#ffd700';
    el.style.color = color;
    el.classList.remove('combo-pop');
    void el.offsetWidth; // 强制重排以重新触发动画
    el.classList.add('combo-pop');
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(() => { el.style.color = ''; }, 550);
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

  /** 施法成功/失败提示大字（0.5 秒后自动消失） */
  showCastPopup(text, type = 'success') {
    const el = document.getElementById('cast-popup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden', 'success', 'fail');
    void el.offsetWidth; // 强制重排以重新触发动画
    el.classList.add(type === 'fail' ? 'fail' : 'success');
    clearTimeout(this._castPopupTimer);
    this._castPopupTimer = setTimeout(() => el.classList.add('hidden'), 500);
  },

  showPause(show) {
    document.getElementById('pause-overlay').classList.toggle('hidden', !show);
  },

  /** 过关结算面板：暂停游戏后弹出，含「下一关 / 返回关卡选择」 */
  showLevelClear({ title, sub, hasNext }) {
    const overlay = document.getElementById('level-clear-overlay');
    if (!overlay) return;
    const titleEl = document.getElementById('level-clear-title');
    const subEl = document.getElementById('level-clear-sub');
    const nextBtn = document.getElementById('next-level-btn');
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;
    if (nextBtn) nextBtn.classList.toggle('hidden', !hasNext);
    overlay.classList.remove('hidden');
  },

  /** 隐藏过关结算面板 */
  hideLevelClear() {
    const overlay = document.getElementById('level-clear-overlay');
    if (overlay) overlay.classList.add('hidden');
  },

  modeLabel(mode) {
    const map = { classic: '经典', timeAttack: '限时', zen: '禅意', survival: '生存', magic: '魔法', magicEndless: '无尽', wizard: '魔法手势师' };
    return map[mode] || mode;
  },

  diffLabel(diff) {
    const map = { easy: '简单', medium: '中等', hard: '困难' };
    return map[diff] || diff;
  },

  /** 魔法手势师关卡序号 → 显示文案 */
  wizardLevelLabel(index) {
    if (index <= 0) return '教学关';
    if (index >= 6) return 'Boss 关';
    return `第 ${index} 关`;
  },

  /** 填充结算界面 */
  fillResult({ score, maxCombo, survivalTimeMs, mode, difficulty, highScore, feedback, victory, levelReached, castAccuracy, totalCasts, correctCasts, avgReaction, enemiesKilled, perfectRun, gestureFailCounts }) {
    const titleEl = document.getElementById('result-title');
    if (titleEl) titleEl.textContent = victory ? '通关成功 🎉' : '游戏结束';

    document.getElementById('result-mode').textContent = this.modeLabel(mode);

    // 魔法关卡模式：把「难度」一栏改成「关卡」，展示通关或止步第几关
    const diffLabelEl = document.getElementById('result-difficulty-label');
    const diffValEl = document.getElementById('result-difficulty');
    if (mode === 'magic' || mode === 'wizard') {
      if (diffLabelEl) diffLabelEl.textContent = '关卡';
      if (mode === 'wizard') {
        diffValEl.textContent = this.wizardLevelLabel(levelReached);
      } else {
        diffValEl.textContent = victory ? '通关' : `第 ${levelReached} 关`;
      }
    } else {
      if (diffLabelEl) diffLabelEl.textContent = '难度';
      diffValEl.textContent = difficulty ? this.diffLabel(difficulty) : '—';
    }

    document.getElementById('result-score').textContent = score;
    document.getElementById('result-combo').textContent = maxCombo;
    document.getElementById('result-time').textContent = (survivalTimeMs / 1000).toFixed(1);
    document.getElementById('result-high-score').textContent = highScore;

    const accEl = document.getElementById('result-accuracy');
    if (accEl) {
      accEl.textContent = (mode === 'magic' || mode === 'magicEndless' || mode === 'wizard') && castAccuracy != null
        ? `${castAccuracy}%`
        : '—';
    }

    const killsEl = document.getElementById('result-kills');
    if (killsEl) {
      killsEl.textContent = mode === 'wizard' && enemiesKilled != null ? enemiesKilled : '—';
    }

    const reactionLabelEl = document.getElementById('result-reaction-label');
    const reactionEl = document.getElementById('result-reaction');
    if (reactionEl) {
      reactionEl.textContent = mode === 'wizard' && avgReaction != null ? `${avgReaction}ms` : '—';
    }
    if (reactionLabelEl) {
      reactionLabelEl.textContent = mode === 'wizard' && perfectRun ? '平均反应 🌟' : '平均反应';
    }

    // 手势失误柱状图（仅魔法手势师显示）
    const chartEl = document.getElementById('gesture-chart');
    if (chartEl) {
      if (mode === 'wizard' && gestureFailCounts) {
        chartEl.classList.remove('hidden');
        const summary = `共施法 ${totalCasts || 0} 次 · 成功 ${correctCasts || 0} 次 · 识别成功率 ${castAccuracy != null ? castAccuracy : 0}%`;
        this.renderGestureChart(chartEl, gestureFailCounts, summary);
      } else {
        chartEl.classList.add('hidden');
      }
    }

    // 结算页按钮文案：魔法手势师单关制显示「重玩本关 / 返回关卡选择」
    const restartBtn = document.getElementById('result-restart-btn');
    const menuBtn = document.getElementById('result-menu-btn');
    if (mode === 'wizard') {
      if (restartBtn) restartBtn.textContent = '重玩本关';
      if (menuBtn) menuBtn.textContent = '返回关卡选择';
    } else {
      if (restartBtn) restartBtn.textContent = '再来一局';
      if (menuBtn) menuBtn.textContent = '返回菜单';
    }

    document.getElementById('result-feedback').textContent = feedback || '正在请 AI 裁判点评...';
  },

  /** 渲染手势失误柱状图 */
  renderGestureChart(chartEl, gestureFailCounts, summary) {
    const rows = [
      { key: '火球', label: '🔥 火球' },
      { key: '护盾', label: '🛡️ 护盾' },
      { key: '风刃', label: '🌪️ 风刃' },
      { key: '抓取', label: '✊ 抓取' }
    ];
    const max = Math.max(1, ...rows.map(r => gestureFailCounts[r.key] || 0));

    const barsEl = chartEl.querySelector('.chart-bars');
    if (barsEl) {
      barsEl.innerHTML = rows.map(r => {
        const count = gestureFailCounts[r.key] || 0;
        const pct = Math.round((count / max) * 100);
        return `<div class="chart-row">
          <span class="chart-label">${r.label}</span>
          <div class="chart-track"><div class="chart-fill" style="width:${pct}%"></div></div>
          <span class="chart-count">${count}</span>
        </div>`;
      }).join('');
    }

    const summaryEl = chartEl.querySelector('.chart-summary');
    if (summaryEl) summaryEl.textContent = summary || '';
  },

  /** 绑定菜单相关事件 */
  bindMenuEvents({ onStart, onBackToMenu, onPause, onZenEnd, onReplay, onResultBack, onNextLevel, onLevelSelect }) {
    document.getElementById('menu-start-btn').addEventListener('click', onStart);
    document.getElementById('mode-back-btn').addEventListener('click', onBackToMenu);
    document.getElementById('diff-back-btn').addEventListener('click', () => this.showScreen('mode-screen'));
    document.getElementById('level-back-btn').addEventListener('click', () => this.showScreen('mode-screen'));
    document.getElementById('pause-btn').addEventListener('click', onPause);
    document.getElementById('resume-btn').addEventListener('click', onPause);
    document.getElementById('zen-end-btn').addEventListener('click', onZenEnd);
    document.getElementById('result-restart-btn').addEventListener('click', onReplay);
    document.getElementById('result-menu-btn').addEventListener('click', onResultBack);
    document.getElementById('next-level-btn').addEventListener('click', onNextLevel);
    document.getElementById('level-select-btn').addEventListener('click', onLevelSelect);
  }
};
