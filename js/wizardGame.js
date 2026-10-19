/**
 * js/wizardGame.js
 * 魔法手势师模式（独立模块）
 * 单一入口、内部闭环：教学关（引导四手势）→ 5 个普通关 → Boss 关。
 * 背景随关卡切换（Canvas 绘制，无外部图片），状态机由 levelIndex 驱动。
 */

class WizardGame {
  constructor(canvas, pointer, ui, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pointer = pointer;
    this.ui = ui;
    this.audio = audio;

    this.width = canvas.width;
    this.height = canvas.height;

    this.mode = 'wizard';
    this.state = 'idle'; // idle / countdown / playing / paused / ended

    this.score = 0;
    this.lives = 5;
    this.combo = 0;
    this.maxCombo = 0;
    // 施法统计
    this.totalCasts = 0;
    this.correctCasts = 0;
    this.kills = 0;

    // 每种手势的失误次数（施法落空）
    this.gestureFailCounts = { '火球': 0, '护盾': 0, '风刃': 0, '抓取': 0 };

    // 反应时间统计（从敌人出现到被正确击中的毫秒）
    this.reactionTimes = [];

    // 敌人与特效
    this.enemies = [];
    this.particles = [];
    this.ambient = [];      // 环境粒子（萤火虫/流火/魔法光点）
    this.ambientTimer = 0;

    // 食指轨迹：带时间戳的点数组 {x, y, time}
    this.trail = [];
    this.trailMaxAge = 500; // 0.5 秒

    // 生成与冷却
    this.enemyTimer = 60;
    this.attackCooldown = 0;
    this.attackCooldownMax = 22; // 施法冷却帧数（约 0.37 秒）
    this.lastGesture = null;

    // 关卡状态机：levelIndex 0=教学关, 1-5=普通关, 6=Boss关
    this.levelIndex = 0;
    this.levelKills = 0;      // 当前普通关已击杀数
    this.bossSpawned = false; // Boss 是否已生成
    this.levelFlash = 0;      // 过关/教学提示闪烁帧数

    // 教学关：引导四种手势
    this.tutorialGestures = ['火球', '护盾', '风刃', '抓取'];
    this.tutorialStep = 0;
    this.tutorialCooldown = 0;

    this.frames = 0;
    this.startTime = 0;
    this.survivalTimeMs = 0;
    this.loopId = null;

    // 屏幕反馈
    this.screenFlash = 0;
    this.shake = 0;
    this.comboFlash = 0;

    // 无失误奖励标记
    this.mistakes = 0;      // 错误施法次数
    this.enemiesMissed = 0; // 敌人落底次数

    // 连续识别错误容错：成功施法后清零，连续 3 次才弹提示
    this.errorCount = 0;          // 连续错误次数
    this.errorPopupCooldown = 0;  // 失败弹窗冷却截止时间戳（毫秒）

    this.bgOffset = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  start(levelIndex = 0) {
    this.audio.init();
    this.reset(levelIndex);
    this.ui.showScreen('game-screen');
    this.startCountdown();
  }

  reset(levelIndex = 0) {
    this.score = 0;
    this.lives = 5;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalCasts = 0;
    this.correctCasts = 0;
    this.kills = 0;
    this.gestureFailCounts = { '火球': 0, '护盾': 0, '风刃': 0, '抓取': 0 };
    this.reactionTimes = [];
    this.enemies = [];
    this.particles = [];
    this.ambient = [];
    this.ambientTimer = 0;
    this.trail = [];
    this.enemyTimer = 60;
    this.attackCooldown = 0;
    this.lastGesture = null;
    this.levelIndex = levelIndex;
    this.levelKills = 0;
    this.bossSpawned = false;
    this.levelFlash = 0;
    this.tutorialStep = 0;
    this.tutorialCooldown = 0;
    this.frames = 0;
    this.startTime = 0;
    this.survivalTimeMs = 0;
    this.state = 'idle';
    this.screenFlash = 0;
    this.shake = 0;
    this.comboFlash = 0;
    this.mistakes = 0;
    this.enemiesMissed = 0;
    this.errorCount = 0;
    this.errorPopupCooldown = 0;

    this.ui.showPause(false);
    this.ui.hideLevelClear();
    this.ui.hideCountdown();
    this.ui.updateHUD(this.getHUDData());

    // 魔法模式不显示禅意结束按钮
    const zenEndBtn = document.getElementById('zen-end-btn');
    if (zenEndBtn) zenEndBtn.classList.add('hidden');
  }

  startCountdown() {
    this.state = 'countdown';
    let count = 3;
    this.ui.showCountdown(count);

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        this.ui.showCountdown(count);
      } else if (count === 0) {
        this.ui.showCountdown('GO!');
      } else {
        clearInterval(interval);
        this.ui.hideCountdown();
        this.beginPlay();
      }
    }, 800);
  }

  beginPlay() {
    this.state = 'playing';
    this.startTime = Date.now();
    this.audio.init();
    this.loop();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.ui.showPause(true);
      this.ui.updateHUD(this.getHUDData());
      cancelAnimationFrame(this.loopId);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.showPause(false);
      // 补偿暂停期间的时间
      this.startTime = Date.now() - this.survivalTimeMs;
      this.loop();
    }
  }

  loop() {
    if (this.state !== 'playing') return;
    this.frames++;
    this.update();
    this.draw();
    this.loopId = requestAnimationFrame(() => this.loop());
  }

  /** 当前关卡阶段：tutorial / normal / boss */
  getPhase() {
    const level = WIZARD_LEVEL_CONFIG[this.levelIndex];
    if (!level) return 'boss';
    if (level.tutorial) return 'tutorial';
    if (level.boss) return 'boss';
    return 'normal';
  }

  /** 当前关卡配置 */
  getLevel() {
    return WIZARD_LEVEL_CONFIG[this.levelIndex] || WIZARD_LEVEL_CONFIG[WIZARD_LEVEL_CONFIG.length - 1];
  }

  update() {
    const now = Date.now();
    this.survivalTimeMs = now - this.startTime;

    // 更新食指轨迹
    if (window.handDetected && typeof window.handX === 'number' && typeof window.handY === 'number') {
      this.trail.push({ x: window.handX, y: window.handY, time: now });
    }
    // 移除超过 0.5 秒的旧轨迹点
    while (this.trail.length > 0 && now - this.trail[0].time > this.trailMaxAge) {
      this.trail.shift();
    }

    // pointer 仅用于跟随位置（不绘制），保持与窗口适配一致
    this.pointer.update(window.handX, window.handDetected);

    // 教学关与战斗关走不同逻辑
    if (this.getPhase() === 'tutorial') {
      this.updateTutorial();
    } else {
      this.updateCombat();
    }

    // 粒子更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update();
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    if (this.screenFlash > 0) this.screenFlash--;
    if (this.comboFlash > 0) this.comboFlash--;
    if (this.levelFlash > 0) this.levelFlash--;

    this.ui.updateHUD(this.getHUDData());
  }

  /** 教学关：无时间限制，依次引导火球 → 护盾 → 风刃 → 抓取 */
  updateTutorial() {
    this.tutorialCooldown--;
    const target = this.tutorialGestures[this.tutorialStep];
    if (target && this.tutorialCooldown <= 0 && window.currentGesture === target) {
      this.tutorialStep++;
      this.tutorialCooldown = 30; // 短暂防抖，避免重复触发
      this.levelFlash = 40;
      this.audio.playScore('magic');

      const fx = typeof window.handX === 'number' ? window.handX : this.width / 2;
      const fy = typeof window.handY === 'number' ? window.handY : this.height / 2;
      this.spawnParticles(fx, fy, GESTURE_COLORS[target] || ['#ffffff'], 18);
      this.ui.showCastPopup(`${GESTURE_SPELL[target] || target}！`, 'success');

      // 四种手势全部识别 → 教学完成
      if (this.tutorialStep >= this.tutorialGestures.length) {
        this.completeLevel();
      }
    }
  }

  /** 普通关 / Boss 关：敌人生成 + 施法战斗 */
  updateCombat() {
    const level = this.getLevel();
    const isBoss = this.getPhase() === 'boss';

    // ---- 敌人生成 ----
    this.enemyTimer--;
    if (!isBoss) {
      // 普通关：按配置间隔持续刷敌人，击杀目标达成后过关
      if (this.enemyTimer <= 0) {
        this.enemies.push(new WizardEnemy(this.width, this.pickEnemyType(level.types)));
        this.enemyTimer = level.spawnInterval;
      }
    } else {
      // Boss 关：生成一次 Boss，并周期性召唤小兵
      if (!this.bossSpawned) {
        this.enemies.push(new WizardEnemy(this.width, 'boss'));
        this.bossSpawned = true;
      }
      if (this.enemyTimer <= 0) {
        this.enemies.push(new WizardEnemy(this.width, this.pickEnemyType(level.types)));
        this.enemyTimer = level.minionInterval;
      }
    }

    // ---- 手势施法 ----
    const gesture = window.currentGesture || null;
    this.attackCooldown--;
    if (gesture && this.attackCooldown <= 0) {
      this.castSpell(gesture);
      this.attackCooldown = this.attackCooldownMax;
    }

    // ---- 敌人下落 / Boss 悬停 / 到底部扣血 / 移除死亡 ----
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.isBoss) {
        // Boss 下降到 30% 高度后悬停，不再下坠
        if (e.y < this.height * 0.3) {
          e.update();
        } else {
          e.y = this.height * 0.3;
          e.rotation += e.spin;
        }
      } else {
        e.update();
        if (e.y > this.height + e.size) {
          this.enemies.splice(i, 1);
          this.enemyReachedBottom();
          continue;
        }
      }
      if (e.hp <= 0) {
        this.enemies.splice(i, 1);
        if (e.isBoss) {
          this.completeLevel();
          return;
        }
      }
    }
  }

  /** 从给定类型中随机选择一种敌人 */
  pickEnemyType(types) {
    const list = types && types.length ? types : ['slime', 'bird', 'golem'];
    return list[Math.floor(Math.random() * list.length)];
  }

  castSpell(gesture) {
    this.totalCasts++;
    let hit = false;
    let firstHitTime = null;
    let hitType = null;

    for (const e of this.enemies) {
      if (e.weakness === gesture && e.hp > 0) {
        e.hp--;
        hit = true;
        if (hitType === null) hitType = e.type;
        if (firstHitTime === null) {
          firstHitTime = Date.now() - e.spawnTime;
        }
        this.spawnParticles(e.x, e.y, ['#facc15', '#f97316', '#a78bfa'], 8);
        if (e.hp <= 0) {
          this.kills++;
          this.levelKills++;
          this.score += 20;
          this.combo++;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          this.spawnParticles(e.x, e.y, ['#facc15', '#ffffff'], 14);
        }
      }
    }

    if (hit) {
      this.errorCount = 0; // 成功施法：清零连续错误计数
      this.correctCasts++;
      if (firstHitTime !== null) {
        this.reactionTimes.push(firstHitTime);
      }

      // 从手指轨迹末端迸发对应属性粒子
      const colors = GESTURE_COLORS[gesture] || ['#ffffff'];
      const fx = typeof window.handX === 'number' ? window.handX : this.width / 2;
      const fy = typeof window.handY === 'number' ? window.handY : this.height / 2;
      this.spawnParticles(fx, fy, colors, 16);

      this.audio.playHitEnemy(hitType);
      this.pointer.triggerFlash();
      this.shake = Math.max(this.shake, 5); // 命中轻微震动

      this.ui.showCastPopup(`${GESTURE_SPELL[gesture] || gesture}！`, 'success');

      // Combo 达到 10 时屏幕震动
      if (this.combo === 10) {
        this.shake = 12;
        this.comboFlash = 16;
        this.audio.playCombo(10);
        this.ui.triggerComboEffect(10);
      } else if (this.combo === 5) {
        this.audio.playCombo(5);
        this.ui.triggerComboEffect(5);
      }
    } else {
      // 错误施法：清空 Combo，累计连续错误
      if (this.combo > 0) {
        this.combo = 0;
      }
      this.mistakes++;
      this.errorCount++;
      this.gestureFailCounts[gesture] = (this.gestureFailCounts[gesture] || 0) + 1;

      // 容错：连续错误 3 次才弹一次提示，且弹窗后有 2 秒冷却，避免刷屏
      const now = Date.now();
      if (this.errorCount >= 3 && now >= this.errorPopupCooldown) {
        this.ui.showCastPopup('手势错误，请调整手势后重试', 'fail');
        this.errorPopupCooldown = now + 2000;
      }
    }

    // 普通关击杀达标 → 进入下一关
    this.checkLevelComplete();
  }

  /** 普通关击杀达标 → 本关通过 */
  checkLevelComplete() {
    const level = this.getLevel();
    if (this.getPhase() !== 'normal') return;
    if (this.levelKills >= level.kills) {
      this.completeLevel();
    }
  }

  /** 本关通过（单关制）：暂停游戏，弹出过关结算面板，等待玩家手动跳转 */
  completeLevel() {
    const phase = this.getPhase();
    let title = '过关成功！';
    let sub = '准备进入下一关';
    if (phase === 'tutorial') { title = '教学完成！'; sub = '四种手势已掌握'; }
    else if (phase === 'boss') { title = '击败石像王，通关！'; sub = '魔法学院恢复了和平'; }

    // 冻结游戏循环，等待玩家点击「下一关 / 返回关卡选择」
    this.state = 'cleared';
    cancelAnimationFrame(this.loopId);

    // 通关解锁下一关（localStorage 持久化）
    if (typeof this.onLevelCleared === 'function') {
      this.onLevelCleared(this.levelIndex);
    }

    // 是否有下一关（Boss 关之后没有）
    const hasNext = this.levelIndex < WIZARD_LEVEL_CONFIG.length - 1;
    this.ui.showLevelClear({ title, sub, hasNext });
  }

  enemyReachedBottom() {
    this.lives--;
    this.combo = 0;
    this.enemiesMissed++;
    this.audio.playHit();
    this.screenFlash = 18;
    this.shake = 10;
    if (this.lives <= 0) {
      this.endGame('敌人突破了防线');
    }
  }

  spawnParticles(x, y, colors, count) {
    for (let i = 0; i < count; i++) {
      const color = Array.isArray(colors) ? colors[i % colors.length] : colors;
      this.particles.push(new WizardParticle(x, y, color));
    }
  }

  getAccuracy() {
    if (this.totalCasts === 0) return 0;
    return Math.round((this.correctCasts / this.totalCasts) * 100);
  }

  getAvgReaction() {
    if (this.reactionTimes.length === 0) return 0;
    const sum = this.reactionTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.reactionTimes.length);
  }

  getHUDData() {
    const level = this.getLevel();
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      lives: this.lives,
      mode: this.mode,
      difficulty: null,
      timeLeft: null,
      accuracy: this.getAccuracy(),
      avgReaction: this.getAvgReaction(),
      gesture: window.currentGesture || null,
      confidence: window.currentGestureConfidence || 0,
      cooldown: Math.max(0, this.attackCooldown),
      cooldownMax: this.attackCooldownMax,
      level: {
        label: level.label,
        kills: this.levelKills,
        target: level.kills || 0,
        boss: !!level.boss,
        tutorial: !!level.tutorial
      }
    };
  }

  endGame(reason, victory = false) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    cancelAnimationFrame(this.loopId);
    this.audio.playGameOver();

    const accuracy = this.getAccuracy();
    const avgReaction = this.getAvgReaction();
    const perfect = this.totalCasts > 0 && this.mistakes === 0 && this.enemiesMissed === 0;
    const bonus = perfect ? 500 : 0;
    const finalScore = this.score + bonus;

    const payload = {
      score: finalScore,
      maxCombo: this.maxCombo,
      survivalTimeMs: this.survivalTimeMs,
      livesLost: 5 - this.lives,
      deathReason: reason,
      mode: this.mode,
      difficulty: null,
      victory,
      castAccuracy: accuracy,
      totalCasts: this.totalCasts,
      correctCasts: this.correctCasts,
      avgReaction: avgReaction,
      enemiesKilled: this.kills,
      levelReached: this.levelIndex,
      perfectRun: perfect,
      gestureFailCounts: this.gestureFailCounts
    };

    const modeHigh = Storage.getHighScore(this.mode);
    Storage.setHighScore(this.mode, finalScore);

    this.ui.fillResult({
      ...payload,
      highScore: Math.max(modeHigh, finalScore),
      feedback: '正在请 AI 裁判点评...'
    });
    this.ui.showScreen('result-screen');

    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(data => {
        document.getElementById('result-feedback').textContent = data.feedback || 'AI裁判掉线了';
      })
      .catch(err => {
        console.error('获取反馈失败:', err);
        document.getElementById('result-feedback').textContent = 'AI裁判掉线了';
      });
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    if (this.shake > 0) {
      const sx = (Math.random() - 0.5) * this.shake * 2;
      const sy = (Math.random() - 0.5) * this.shake * 2;
      ctx.translate(sx, sy);
      this.shake--;
    }

    this.drawBackground();
    this.drawTrail(ctx);
    this.enemies.forEach(e => e.draw(ctx));
    this.drawLevelInfo(ctx);
    this.particles.forEach(p => p.draw(ctx));
    ctx.restore();

    // 连击里程碑金色光晕
    if (this.comboFlash > 0) {
      const alpha = (this.comboFlash / 16) * 0.35;
      const grad = ctx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, this.width / 2
      );
      grad.addColorStop(0, `rgba(255, 215, 0, ${alpha})`);
      grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 受伤红色闪烁
    if (this.screenFlash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${(this.screenFlash / 18) * 0.35})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (!window.handDetected) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.fillText('未检测到手势，请举起手', this.width / 2 - 100, 36);
    }
  }

  /** 关卡提示：教学引导 / 普通关进度 / Boss 血条 */
  drawLevelInfo(ctx) {
    const level = this.getLevel();
    ctx.save();
    ctx.textAlign = 'center';
    const flash = this.levelFlash > 0;

    if (level.tutorial) {
      // 教学关引导
      ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#facc15';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#facc15';
      ctx.fillText('教学关 · 学习手势', this.width / 2, 60);
      ctx.shadowBlur = 0;

      const target = this.tutorialGestures[this.tutorialStep];
      if (target) {
        ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#38bdf8';
        ctx.fillText(`请比出：${GESTURE_SPELL[target] || target}`, this.width / 2, this.height * 0.4);
        ctx.shadowBlur = 0;
        ctx.font = '18px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`进度 ${this.tutorialStep}/4 · 全部识别后完成教学`, this.width / 2, this.height * 0.4 + 44);
      }
    } else if (level.boss) {
      ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = flash ? '#ffffff' : '#facc15';
      ctx.shadowBlur = 14;
      ctx.shadowColor = flash ? '#ffffff' : '#facc15';
      ctx.fillText(level.label, this.width / 2, 50);
      ctx.shadowBlur = 0;

      const boss = this.enemies.find(e => e.isBoss);
      if (boss) {
        const barW = Math.min(this.width * 0.6, 520);
        const barH = 16;
        const x = (this.width - barW) / 2;
        const y = 66;
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x, y, barW, barH);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x, y, barW * Math.max(0, boss.hp / boss.maxHp), barH);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barW, barH);
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`石像王 HP ${Math.max(0, boss.hp)}/${boss.maxHp}　连续「抓取」击败它！`, this.width / 2, y + barH + 18);
      }
    } else {
      ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = flash ? '#ffffff' : '#facc15';
      ctx.shadowBlur = 14;
      ctx.shadowColor = flash ? '#ffffff' : '#facc15';
      ctx.fillText(level.label, this.width / 2, 50);
      ctx.shadowBlur = 0;
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#a78bfa';
      ctx.fillText(`击杀进度 ${this.levelKills}/${level.kills}`, this.width / 2, 78);
    }
    ctx.restore();
  }

  drawTrail(ctx) {
    if (this.trail.length < 2) return;
    const now = Date.now();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter'; // 叠加发光更亮

    // 外层柔光拖尾
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#38bdf8';
    for (let i = 1; i < this.trail.length; i++) {
      const p0 = this.trail[i - 1];
      const p1 = this.trail[i];
      const age = now - p1.time;
      const alpha = Math.max(0, 1 - age / this.trailMaxAge);
      ctx.strokeStyle = `rgba(56, 189, 248, ${(alpha * 0.4).toFixed(3)})`;
      ctx.lineWidth = 14 * alpha + 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // 内层亮白核心
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffffff';
    for (let i = 1; i < this.trail.length; i++) {
      const p0 = this.trail[i - 1];
      const p1 = this.trail[i];
      const age = now - p1.time;
      const alpha = Math.max(0, 1 - age / this.trailMaxAge);
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 3 * alpha + 0.5;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 背景主题：教学关学院 / 普通关森林 / Boss 关熔岩 */
  getLevelTheme() {
    const phase = this.getPhase();
    if (phase === 'tutorial') return 'academy';
    if (phase === 'boss') return 'lava';
    return 'forest';
  }

  /** 生成并更新环境粒子（萤火虫/流火/魔法光点） */
  updateAmbient(theme) {
    const typeMap = { academy: 'mote', forest: 'firefly', lava: 'ember' };
    const type = typeMap[theme];
    if (!type) {
      if (this.ambient.length) this.ambient = [];
      return;
    }
    this.ambientTimer--;
    if (this.ambientTimer <= 0 && this.ambient.length < 70) {
      this.ambient.push(new WizardAmbientParticle(this.width, this.height, type));
      this.ambientTimer = type === 'firefly' ? 6 : 4;
    }
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const p = this.ambient[i];
      p.update();
      if (p.dead) this.ambient.splice(i, 1);
    }
  }

  /** 动态背景：按关卡主题切换底色与动态粒子 */
  drawBackground() {
    const ctx = this.ctx;
    this.bgOffset = (this.bgOffset + 0.5) % 40;
    const theme = this.getLevelTheme();
    this.updateAmbient(theme);

    switch (theme) {
      case 'academy': this.paintAcademyBase(ctx); break;
      case 'forest':  this.paintForestBase(ctx); break;
      case 'lava':    this.paintLavaBase(ctx); break;
      default:
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, this.width, this.height);
    }

    // 动态环境粒子
    for (const p of this.ambient) p.draw(ctx);
  }

  /** 教学关：静谧魔法学院（浅色星空 + 学院塔楼剪影） */
  paintAcademyBase(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, '#1e1b4b');
    g.addColorStop(0.6, '#312e81');
    g.addColorStop(1, '#4c1d95');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    // 浅色星空（暖白星点）
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 80; i++) {
      const x = (i * 97 + this.bgOffset * 0.5) % this.width;
      const y = (i * 61) % (this.height * 0.8);
      const s = (i % 3 === 0) ? 2 : 1;
      ctx.fillRect(x, y, s, s);
    }

    // 魔法学院剪影（塔楼与尖顶）
    ctx.fillStyle = 'rgba(30, 27, 75, 0.85)';
    const base = this.height;
    const w = this.width;
    ctx.beginPath();
    ctx.rect(0, base - 60, w * 0.16, 60);
    ctx.rect(w * 0.22, base - 90, w * 0.18, 90);
    ctx.moveTo(w * 0.22, base - 90); ctx.lineTo(w * 0.31, base - 150); ctx.lineTo(w * 0.4, base - 90);
    ctx.rect(w * 0.46, base - 70, w * 0.14, 70);
    ctx.rect(w * 0.64, base - 100, w * 0.2, 100);
    ctx.moveTo(w * 0.64, base - 100); ctx.lineTo(w * 0.74, base - 170); ctx.lineTo(w * 0.84, base - 100);
    ctx.rect(w * 0.88, base - 55, w * 0.12, 55);
    ctx.fill();
  }

  /** 普通关：幽暗森林（深绿渐变 + 树木剪影） */
  paintForestBase(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, '#0f172a');
    g.addColorStop(0.6, '#052e16');
    g.addColorStop(1, '#022c22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    // 树木剪影
    ctx.fillStyle = 'rgba(6, 78, 59, 0.55)';
    const base = this.height;
    const w = this.width;
    for (let i = 0; i < 7; i++) {
      const tx = (i * 0.16 + 0.03) * w;
      const th = 90 + (i % 3) * 40;
      const tw = 26 + (i % 2) * 14;
      ctx.beginPath();
      ctx.moveTo(tx - tw, base);
      ctx.lineTo(tx, base - th);
      ctx.lineTo(tx + tw, base);
      ctx.closePath();
      ctx.fill();
    }
    // 底部地面
    ctx.fillStyle = 'rgba(2, 44, 34, 0.7)';
    ctx.fillRect(0, base - 16, w, 16);
  }

  /** Boss 关：暗红熔岩虚空（暗红渐变 + 底部熔岩发光） */
  paintLavaBase(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, '#0c0a09');
    g.addColorStop(0.5, '#3f0d0d');
    g.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    // 底部熔岩发光
    const lava = ctx.createLinearGradient(0, this.height - 100, 0, this.height);
    lava.addColorStop(0, 'rgba(249, 115, 22, 0)');
    lava.addColorStop(1, 'rgba(249, 115, 22, 0.55)');
    ctx.fillStyle = lava;
    ctx.fillRect(0, this.height - 100, this.width, 100);

    // 熔岩裂缝光纹
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const x = ((i * 0.13 + 0.05) * this.width + this.frames * 0.3) % this.width;
      const y = this.height - 8 - (i % 3) * 6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 26 + (i % 2) * 20, y);
      ctx.stroke();
    }
  }
}

// ==================== 敌人配置 ====================
const WIZARD_ENEMY_CONFIG = {
  slime: { hp: 1, weakness: '火球', emoji: '🟢', size: 28, speed: 1.4, label: '史莱姆', color: '#4ade80' },
  bird:  { hp: 1, weakness: '风刃', emoji: '🦅', size: 26, speed: 2.2, label: '飞鸟', color: '#38bdf8' },
  golem: { hp: 2, weakness: '抓取', emoji: '🗿', size: 34, speed: 1.0, label: '石像', color: '#9ca3af' },
  boss:  { hp: 20, weakness: '抓取', emoji: '👹', size: 66, speed: 0.5, isBoss: true, label: '石像王', color: '#dc2626' }
};

// 手势 → 法术名（施法成功提示文字）
const GESTURE_SPELL = {
  '火球': '🔥 火球术',
  '护盾': '🛡️ 护盾',
  '风刃': '🌪️ 风刃',
  '抓取': '✊ 抓取'
};

// 手势 → 粒子颜色（指尖施法特效）
const GESTURE_COLORS = {
  '火球': ['#ef4444', '#f97316', '#facc15', '#ffffff'],
  '风刃': ['#22d3ee', '#38bdf8', '#a5f3fc', '#ffffff'],
  '抓取': ['#a78bfa', '#9ca3af', '#e9d5ff', '#ffffff'],
  '护盾': ['#4ade80', '#a7f3d0', '#fef08a', '#ffffff']
};

// ==================== 关卡配置 ====================
// 教学关 + 5 个普通关（击杀目标递增、刷新越来越快、敌人种类越来越多）+ 1 个 Boss 关
const WIZARD_LEVEL_CONFIG = [
  { tutorial: true, label: '教学关' },
  { kills: 5,  spawnInterval: 130, types: ['slime'],                 label: '第 1 关' },
  { kills: 8,  spawnInterval: 110, types: ['slime', 'bird'],         label: '第 2 关' },
  { kills: 12, spawnInterval: 95,  types: ['slime', 'bird', 'golem'], label: '第 3 关' },
  { kills: 16, spawnInterval: 80,  types: ['slime', 'bird', 'golem'], label: '第 4 关' },
  { kills: 20, spawnInterval: 65,  types: ['slime', 'bird', 'golem'], label: '第 5 关' },
  { boss: true, bossHp: 20, minionInterval: 85, types: ['slime', 'bird'], label: 'Boss 关' }
];

class WizardEnemy {
  constructor(width, type) {
    const cfg = WIZARD_ENEMY_CONFIG[type];
    this.type = type;
    this.weakness = cfg.weakness;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.emoji = cfg.emoji;
    this.size = cfg.size;
    this.color = cfg.color;
    this.x = Math.random() * (width - this.size * 2) + this.size;
    this.y = -this.size * 2;
    this.speed = cfg.speed;
    this.isBoss = !!cfg.isBoss;
    this.spawnTime = Date.now();
    this.rotation = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.05;
  }

  update() {
    this.y += this.speed;
    this.rotation += this.spin;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation * 0.3);

    ctx.shadowBlur = this.isBoss ? 24 : 14;
    ctx.shadowColor = this.isBoss ? 'rgba(250, 204, 21, 0.8)' : this.color;
    ctx.font = `${this.size * 1.8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);
    ctx.rotate(-this.rotation * 0.3);

    ctx.shadowBlur = 0;
    // 多血敌人显示小血条（Boss 由顶部大血条展示，这里不重复画）
    if (this.maxHp > 1 && !this.isBoss) {
      const barW = this.size * 1.6;
      const barH = 5;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-barW / 2, -this.size * 1.25, barW, barH);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-barW / 2, -this.size * 1.25, barW * (this.hp / this.maxHp), barH);
    }

    // 弱点提示
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`怕${this.weakness}`, 0, this.size * 1.35);

    ctx.restore();
  }
}

class WizardParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 3;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = Math.random() * 3 + 2;
    this.color = color;
    this.life = 1.0;
    this.decay = Math.random() * 0.03 + 0.02;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.15;
    this.life -= this.decay;
  }

  draw(ctx) {
    const tailX = this.x - this.vx * 3;
    const tailY = this.y - this.vy * 3;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.radius;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.restore();
  }
}

/** 环境粒子：萤火虫（森林）/ 流火（熔岩）/ 魔法光点（学院） */
class WizardAmbientParticle {
  constructor(width, height, type) {
    this.width = width;
    this.height = height;
    this.type = type;
    this.dead = false;

    if (type === 'firefly') {
      this.x = Math.random() * width;
      this.y = height * 0.2 + Math.random() * height * 0.7;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.size = 1.5 + Math.random() * 2;
      this.color = Math.random() < 0.5 ? '#a3e635' : '#fef08a';
      this.twinkle = 0.02 + Math.random() * 0.03;
    } else if (type === 'ember') {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.6;
      this.vy = -(0.5 + Math.random() * 1.2);
      this.size = 1.5 + Math.random() * 2.5;
      this.color = Math.random() < 0.5 ? '#f97316' : '#ef4444';
      this.twinkle = 0.05 + Math.random() * 0.05;
    } else { // mote：魔法光点
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = -(0.15 + Math.random() * 0.3);
      this.size = 1 + Math.random() * 2;
      this.color = Math.random() < 0.5 ? '#e0e7ff' : '#bae6fd';
      this.twinkle = 0.03 + Math.random() * 0.04;
    }
    this.phase = Math.random() * Math.PI * 2;
    this.alpha = 0.4 + Math.random() * 0.6;
  }

  update() {
    this.phase += this.twinkle;
    this.x += this.vx + Math.sin(this.phase) * 0.2;
    this.y += this.vy;
    if (this.y < -12 || this.y > this.height + 12 || this.x < -12 || this.x > this.width + 12) {
      this.dead = true;
    }
  }

  draw(ctx) {
    const a = this.alpha * (0.6 + 0.4 * Math.sin(this.phase * 3));
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.shadowBlur = this.size * 3;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
