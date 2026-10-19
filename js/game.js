/**
 * js/game.js
 * 游戏核心逻辑：循环、实体、碰撞、模式/难度配置
 */

class Game {
  constructor(canvas, pointer, ui, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pointer = pointer;
    this.ui = ui;
    this.audio = audio;

    this.width = canvas.width;
    this.height = canvas.height;
    this.baseHeight = 480; // 基准设计高度，用于缩放掉落速度

    this.mode = 'classic';
    this.difficulty = 'medium';
    this.state = 'idle'; // idle / countdown / playing / paused / ended

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lives = 3;
    this.frames = 0;
    this.startTime = 0;
    this.survivalTimeMs = 0;

    this.stars = [];
    this.obstacles = [];
    this.particles = [];
    this.ambient = [];       // 环境粒子（萤火虫/流火/魔法光点）
    this.ambientTimer = 0;
    this.bgOffset = 0;

    this.timeLimit = 60000; // Time Attack 限时 60 秒
    this.timeLeft = this.timeLimit;

    this.loopId = null;

    // 生成计时器：用递减计数，比“frames % interval”更直观可靠
    this.starTimer = 0;
    this.obstacleTimer = 0;

    // 撞到障碍物时的屏幕红色闪烁
    this.screenFlash = 0;
    // 撞到障碍物时的屏幕震动
    this.shake = 0;
    // 连击里程碑（3/5/10）的全屏光晕
    this.comboFlash = 0;

    // 魔法手势师模式
    this.enemies = [];
    this.enemyTimer = 0;
    this.attackCooldown = 0;
    this.lastGesture = null;

    // 魔法关卡系统
    this.levelIndex = 0;      // 当前关卡（0 起）
    this.kills = 0;           // 当前关已击杀数
    this.totalCasts = 0;      // 总施法次数
    this.correctCasts = 0;    // 有效命中次数（用于计算施法准确率）
    this.bossSpawned = false; // Boss 是否已生成
    this.levelFlash = 0;      // 过关提示闪烁帧数
  }

  /** 画布尺寸变化时同步更新 */
  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** 启动一局游戏 */
  start(mode, difficulty) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.audio.init(); // 在用户点击手势中初始化音频，避免浏览器自动播放限制
    this.reset();
    this.ui.showScreen('game-screen');
    this.startCountdown();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lives = this.getInitialLives();
    this.frames = 0;
    this.startTime = 0;
    this.survivalTimeMs = 0;
    this.timeLeft = this.timeLimit;
    this.stars = [];
    this.obstacles = [];
    this.particles = [];
    this.ambient = [];
    this.ambientTimer = 0;
    this.state = 'idle';
    this.starTimer = 0;
    this.obstacleTimer = 0;
    this.screenFlash = 0;
    this.shake = 0;
    this.comboFlash = 0;
    this.enemies = [];
    this.enemyTimer = 0;
    this.attackCooldown = 0;
    this.lastGesture = null;
    this.levelIndex = 0;
    this.kills = 0;
    this.totalCasts = 0;
    this.correctCasts = 0;
    this.bossSpawned = false;
    this.levelFlash = 0;

    this.pointer.x = this.width / 2;
    this.pointer.targetX = this.width / 2;

    this.ui.showPause(false);
    this.ui.hideCountdown();
    this.ui.updateHUD(this.getHUDData());

    // 禅意模式显示结束按钮
    document.getElementById('zen-end-btn').classList.toggle('hidden', this.mode !== 'zen');
  }

  getInitialLives() {
    if (this.mode === 'classic') return 3;
    if (this.mode === 'survival') return 1;
    if (this.mode === 'timeAttack') return 0;
    if (this.mode === 'zen') return 99;
    if (this.mode === 'magic') return 5;
    if (this.mode === 'magicEndless') return 5;
    return 3;
  }

  /** 合并模式与难度配置 */
  getConfig() {
    const base = MODE_CONFIG[this.mode] || MODE_CONFIG.classic;
    const diff = this.difficulty ? (DIFFICULTY_CONFIG[this.difficulty] || DIFFICULTY_CONFIG.medium) : {};
    const config = { ...base, ...diff };
    // 兜底：Zen/Survival 无难度配置，必须补默认值，否则 hitScale 等字段为 undefined，
    // 会让碰撞判定半径变成 NaN，导致碰撞永远不成立（碰星不记分、碰障碍不扣血）。
    if (config.hitScale == null) config.hitScale = 1;
    if (config.obstacleChance == null) config.obstacleChance = 0;
    if (config.starSpeed == null) config.starSpeed = 1;
    if (config.obstacleSpeed == null) config.obstacleSpeed = 1;
    if (config.starRadius == null) config.starRadius = 16;
    // 应用全局速度倍率：统一提升收集物与障碍物的下落速度
    config.starSpeed = config.starSpeed * GLOBAL_SPEED;
    config.obstacleSpeed = config.obstacleSpeed * GLOBAL_SPEED;
    return config;
  }

  /** 3 秒倒计时 */
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

  /** 暂停 / 继续 */
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.ui.showPause(true);
      this.ui.updateHUD(this.getHUDData());
      cancelAnimationFrame(this.loopId);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.showPause(false);
      // 补偿倒计时类模式的时间
      if (this.mode === 'timeAttack') {
        this.startTime = Date.now() - (this.timeLimit - this.timeLeft);
      }
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

  update() {
    // 魔法手势师（关卡制）与无尽挑战走独立更新逻辑
    if (this.mode === 'magic') {
      this.updateMagic();
      this.ui.updateHUD(this.getHUDData());
      return;
    }
    if (this.mode === 'magicEndless') {
      this.updateEndless();
      this.ui.updateHUD(this.getHUDData());
      return;
    }

    const now = Date.now();
    this.survivalTimeMs = now - this.startTime;

    // 限时模式检查时间
    if (this.mode === 'timeAttack') {
      this.timeLeft = Math.max(0, this.timeLimit - this.survivalTimeMs);
      if (this.timeLeft <= 0) {
        this.endGame('时间到');
        return;
      }
    }

    const config = this.getConfig();
    this.pointer.update(window.handX, window.handDetected);

    // 动态难度系数（乘以高度缩放，保证不同画布高度下掉落耗时一致，并设上限避免过快）
    const heightScale = Math.min(this.height / this.baseHeight, 2.2);
    const speedMultiplier = (config.speedMultiplierBase + this.score / config.speedScale) * heightScale;

    // 计算生成间隔
    const starInterval = Math.max(config.starIntervalMin, Math.floor(config.starInterval / speedMultiplier));
    const obstacleInterval = Math.max(config.obstacleIntervalMin, Math.floor(config.obstacleInterval / speedMultiplier));

    // ---- 星星生成（递减计时器） ----
    this.starTimer--;
    if (this.starTimer <= 0) {
      this.stars.push(new Star(this.width, speedMultiplier, config.starSpeed, config.starRadius));
      this.starTimer = starInterval;
    }

    // ---- 障碍物生成（递减计时器，easy 的 obstacleChance 为 0 时不生成） ----
    this.obstacleTimer--;
    if (config.obstacleChance > 0 && this.obstacleTimer <= 0) {
      // 生存模式每次生成多个，制造密集弹幕
      const spawnCount = this.mode === 'survival' ? 2 : 1;
      for (let n = 0; n < spawnCount; n++) {
        if (Math.random() < config.obstacleChance) {
          this.obstacles.push(new Obstacle(this.width, speedMultiplier, config.obstacleSpeed));
        }
      }
      this.obstacleTimer = obstacleInterval;
    }

    // ---- 星星碰撞与漏掉处理 ----
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.update();
      if (s.y > this.height + s.radius) {
        if (this.combo > 0) {
          this.combo = 0;
        }
        this.stars.splice(i, 1);
        continue;
      }
      const dist = Math.hypot(s.x - this.pointer.x, s.y - this.pointer.y);
      if (dist < s.radius + this.pointer.radius * config.hitScale) {
        this.collectStar(s);
        this.stars.splice(i, 1);
      }
    }

    // ---- 障碍物碰撞 ----
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.update();
      if (o.y > this.height + o.size) {
        this.obstacles.splice(i, 1);
        continue;
      }
      const dist = Math.hypot(o.x - this.pointer.x, o.y - this.pointer.y);
      if (dist < o.size / 2 + this.pointer.radius * config.hitScale) {
        this.obstacles.splice(i, 1);
        this.hitObstacle(o.x, o.y);
      }
    }

    // ---- 粒子更新 ----
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update();
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    if (this.screenFlash > 0) this.screenFlash--;
    if (this.comboFlash > 0) this.comboFlash--;

    this.ui.updateHUD(this.getHUDData());
  }

  /** 魔法手势师模式（关卡制）：5 普通关 + 1 Boss 关 */
  updateMagic() {
    const now = Date.now();
    this.survivalTimeMs = now - this.startTime;
    this.pointer.update(window.handX, window.handDetected);

    const level = LEVEL_CONFIG[this.levelIndex];
    const isBoss = !!(level && level.boss);

    // ---- 敌人生成 ----
    this.enemyTimer--;
    if (!isBoss) {
      // 普通关：按配置间隔持续刷敌人，击杀目标达成后过关
      if (this.enemyTimer <= 0) {
        this.enemies.push(new Enemy(this.width, this.pickEnemyType(level.types)));
        this.enemyTimer = level.spawnInterval;
      }
    } else {
      // Boss 关：生成一次 Boss，并周期性召唤小兵
      if (!this.bossSpawned) {
        this.enemies.push(new Enemy(this.width, 'boss'));
        this.bossSpawned = true;
      }
      if (this.enemyTimer <= 0) {
        this.enemies.push(new Enemy(this.width, this.pickEnemyType(level.types)));
        this.enemyTimer = level.minionInterval;
      }
    }

    // ---- 手势施法：冷却期内，比出正确手势即可持续攻击 ----
    const gesture = window.currentGesture || null;
    this.attackCooldown--;
    if (gesture && this.attackCooldown <= 0) {
      this.attackWithGesture(gesture);
      this.attackCooldown = 25; // 约 0.4 秒施法一次
    }

    // ---- 敌人下落 / Boss 悬停 / 到底部扣血 / 移除死亡 ----
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.isBoss) {
        // Boss 下降到 30% 高度后悬停，不再下坠（避免 Boss 落地直接扣血）
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
          this.winGame();
          return;
        }
      }
    }

    // ---- 粒子与特效 ----
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update();
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.screenFlash > 0) this.screenFlash--;
    if (this.comboFlash > 0) this.comboFlash--;
    if (this.levelFlash > 0) this.levelFlash--;
  }

  /** 无尽挑战模式：敌人源源不断、越来越密集，撑到生命耗尽 */
  updateEndless() {
    const now = Date.now();
    this.survivalTimeMs = now - this.startTime;
    this.pointer.update(window.handX, window.handDetected);

    // 敌人生成：随得分越来越密集
    this.enemyTimer--;
    if (this.enemyTimer <= 0) {
      this.enemies.push(new Enemy(this.width, this.pickEnemyType(['slime', 'bird', 'golem'])));
      this.enemyTimer = Math.max(30, Math.floor(140 / (1 + this.score / 250)));
    }

    const gesture = window.currentGesture || null;
    this.attackCooldown--;
    if (gesture && this.attackCooldown <= 0) {
      this.attackWithGesture(gesture);
      this.attackCooldown = 25;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update();
      if (e.y > this.height + e.size) {
        this.enemies.splice(i, 1);
        this.enemyReachedBottom();
        continue;
      }
      if (e.hp <= 0) this.enemies.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update();
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.screenFlash > 0) this.screenFlash--;
    if (this.comboFlash > 0) this.comboFlash--;
  }

  /** 普通关击杀达标 → 进入下一关 */
  checkLevelComplete() {
    const level = LEVEL_CONFIG[this.levelIndex];
    if (!level || level.boss) return;
    if (this.kills >= level.kills) {
      this.nextLevel();
    }
  }

  /** 进入下一关 */
  nextLevel() {
    this.levelIndex++;
    this.kills = 0;
    this.enemies = [];
    this.bossSpawned = false;
    this.enemyTimer = 60; // 短暂喘息后刷新敌人
    this.levelFlash = 70; // 过关提示闪烁
    this.audio.playCombo(10);
    if (this.levelIndex >= LEVEL_CONFIG.length) {
      this.winGame();
    }
  }

  /** 击败 Boss → 通关胜利 */
  winGame() {
    this.endGame('击败石像王，通关成功', true);
  }

  /** 用手势施法：攻击所有弱点匹配的敌人，并统计施法准确率 */
  attackWithGesture(gesture) {
    this.totalCasts++;
    let hit = false;
    for (const e of this.enemies) {
      if (e.weakness === gesture && e.hp > 0) {
        e.hp--;
        hit = true;
        this.spawnParticles(e.x, e.y, ['#facc15', '#f97316', '#a78bfa'], 10);
        if (e.hp <= 0) {
          this.score += 20;
          this.combo++;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          this.spawnParticles(e.x, e.y, ['#facc15', '#ffffff'], 18);
          // 关卡制模式下，击杀普通敌人推进关卡进度
          if (!e.isBoss && this.mode === 'magic') this.kills++;
        }
      }
    }
    if (hit) {
      this.correctCasts++;
      this.audio.playScore('magic');
      this.pointer.triggerFlash();
    }
    // 施法结束后统一检查关卡进度，避免在遍历中清空敌人数组
    if (this.mode === 'magic') this.checkLevelComplete();
  }

  /** 敌人落到屏幕底部：扣 1 条命 */
  enemyReachedBottom() {
    this.lives--;
    this.audio.playHit();
    this.screenFlash = 18;
    this.shake = 10;
    if (this.lives <= 0) {
      this.endGame('敌人突破了防线');
    }
  }

  /** 从给定类型中随机选择一种敌人 */
  pickEnemyType(types) {
    const list = types && types.length ? types : ['slime', 'bird', 'golem'];
    return list[Math.floor(Math.random() * list.length)];
  }

  collectStar(star) {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const multiplier = 1 + Math.floor(this.combo / 5);
    this.score += 10 * multiplier;

    this.audio.playScore(this.mode);

    // 彩虹色爆炸粒子
    const rainbow = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];
    this.spawnParticles(star.x, star.y, rainbow, 18);

    this.pointer.triggerFlash();

    // 连击里程碑（3/5/10）：全屏光晕 + 音调升高 + UI 文字抖动
    if (this.combo === 3 || this.combo === 5 || this.combo === 10) {
      this.comboFlash = 14;
      this.audio.playCombo(this.combo);
      this.ui.triggerComboEffect(this.combo);
    }
  }

  /** 撞到障碍物：扣命、清连击、红色闪烁、屏幕震动、爆炸粒子、音效 */
  hitObstacle(ox, oy) {
    this.combo = 0;
    this.lives--;
    this.audio.playHit();

    // 红/黑爆炸粒子
    this.spawnParticles(ox, oy, ['#ef4444', '#1f2937'], 30);

    this.pointer.triggerFlash();
    this.screenFlash = 24; // 屏幕红色闪烁
    this.shake = 14;       // 屏幕震动

    if (this.lives <= 0) {
      this.endGame('生命耗尽');
    }
  }

  /** 生成粒子（colors 传数组会循环取色，传字符串则单色） */
  spawnParticles(x, y, colors, count) {
    for (let i = 0; i < count; i++) {
      const color = Array.isArray(colors) ? colors[i % colors.length] : colors;
      this.particles.push(new Particle(x, y, color));
    }
  }

  getHUDData() {
    const level = this.mode === 'magic' ? LEVEL_CONFIG[this.levelIndex] : null;
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      lives: this.lives,
      mode: this.mode,
      difficulty: this.difficulty,
      timeLeft: this.mode === 'timeAttack' ? this.timeLeft : null,
      level: level ? {
        index: this.levelIndex,
        kills: this.kills,
        target: level.kills,
        boss: !!level.boss,
        label: level.label
      } : null
    };
  }

  /** 游戏结束并请求 AI 反馈（victory=true 表示通关胜利） */
  endGame(reason, victory = false) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    cancelAnimationFrame(this.loopId);
    this.audio.playGameOver();

    const isMagic = this.mode === 'magic' || this.mode === 'magicEndless';
    const castAccuracy = this.totalCasts > 0 ? Math.round((this.correctCasts / this.totalCasts) * 100) : 0;

    const payload = {
      score: this.score,
      maxCombo: this.maxCombo,
      survivalTimeMs: this.survivalTimeMs,
      livesLost: this.mode === 'zen' ? 0 : (this.getInitialLives() - this.lives),
      deathReason: reason,
      mode: this.mode,
      difficulty: this.difficulty,
      victory,
      castAccuracy: isMagic ? castAccuracy : null,
      totalCasts: isMagic ? this.totalCasts : null,
      correctCasts: isMagic ? this.correctCasts : null,
      levelReached: this.mode === 'magic' ? Math.min(this.levelIndex + 1, LEVEL_CONFIG.length) : null
    };

    const modeHigh = Storage.getHighScore(this.mode);
    Storage.setHighScore(this.mode, this.score);

    this.ui.fillResult({
      ...payload,
      highScore: Math.max(modeHigh, this.score),
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

    // 屏幕震动：整体平移，随帧数衰减
    ctx.save();
    if (this.shake > 0) {
      const sx = (Math.random() - 0.5) * this.shake * 2;
      const sy = (Math.random() - 0.5) * this.shake * 2;
      ctx.translate(sx, sy);
      this.shake--;
    }

    this.drawBackground();
    if (this.mode === 'magic' || this.mode === 'magicEndless') {
      this.enemies.forEach(e => e.draw(ctx));
      if (this.mode === 'magic') this.drawLevelInfo(ctx);
    } else {
      this.stars.forEach(s => s.draw(ctx));
      this.obstacles.forEach(o => o.draw(ctx));
    }
    this.particles.forEach(p => p.draw(ctx));
    this.pointer.setCharacter(this.getCharacterType());
    this.pointer.draw(ctx);
    ctx.restore();

    if (!window.handDetected) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.fillText('未检测到手势，请举起手', this.width / 2 - 100, 36);
    }

    // 连击里程碑全屏金色光晕
    if (this.comboFlash > 0) {
      const alpha = (this.comboFlash / 14) * 0.35;
      const grad = ctx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, this.width / 2
      );
      grad.addColorStop(0, `rgba(255, 215, 0, ${alpha})`);
      grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 撞到障碍物时的全屏红色闪烁
    if (this.screenFlash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${(this.screenFlash / 24) * 0.35})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /** 魔法关卡：绘制关卡标题、击杀进度或 Boss 血条 */
  drawLevelInfo(ctx) {
    const level = LEVEL_CONFIG[this.levelIndex];
    if (!level) return;

    ctx.save();
    ctx.textAlign = 'center';
    const flash = this.levelFlash > 0; // 过关时的金色高亮

    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = flash ? '#ffffff' : '#facc15';
    ctx.shadowBlur = 14;
    ctx.shadowColor = flash ? '#ffffff' : '#facc15';
    ctx.fillText(level.label, this.width / 2, 50);

    ctx.shadowBlur = 0;
    if (level.boss) {
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
        ctx.fillStyle = '#fff';
        ctx.fillText(`石像王 HP ${Math.max(0, boss.hp)}/${boss.maxHp}　连续施放「抓取」击败它！`, this.width / 2, y + barH + 18);
      }
    } else {
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = flash ? '#ffffff' : '#a78bfa';
      ctx.fillText(`击杀进度 ${this.kills}/${level.kills}`, this.width / 2, 78);
    }
    ctx.restore();
  }

  /** 根据当前模式/关卡返回背景主题 */
  getLevelTheme() {
    if (this.mode === 'magic') {
      const level = LEVEL_CONFIG[this.levelIndex];
      if (!level) return 'space';
      if (level.tutorial) return 'academy'; // 教学关：魔法学院
      if (level.boss) return 'lava';        // Boss 关：熔岩虚空
      return 'forest';                      // 普通关：幽暗森林
    }
    return 'space'; // 经典/限时/禅意/生存沿用深空
  }

  /** 根据当前模式/关卡返回角色形态 */
  getCharacterType() {
    if (this.mode !== 'magic') return 'rocket';
    const level = LEVEL_CONFIG[this.levelIndex];
    if (!level) return 'rocket';
    if (level.tutorial) return 'apprentice'; // 教学关：学徒
    if (level.boss) return 'archmage';       // Boss 关：大魔导师
    return 'mage';                           // 普通关：法师
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
      this.ambient.push(new AmbientParticle(this.width, this.height, type));
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
      default:        this.paintSpaceBase(ctx);
    }

    // 动态环境粒子
    for (const p of this.ambient) p.draw(ctx);
  }

  /** 深空 + 滚动电子网格 + 星空（经典模式默认背景） */
  paintSpaceBase(ctx) {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);

    // 电子网格
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = this.bgOffset; y <= this.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // 星空
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 40; i++) {
      const x = ((this.frames * 0.5) + i * 73) % this.width;
      const y = (i * 47 + this.bgOffset) % this.height;
      ctx.fillRect(x, y, 2, 2);
    }
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

// ==================== 全局节奏倍率 ====================
// 整体提速系数：1.0 为原始速度，调大则所有掉落物（收集物 + 障碍物）更快、节奏更紧凑。
// 想再快改这里即可，难度之间的速度递进关系保持不变。
const GLOBAL_SPEED = 1.3;

// ==================== 模式配置 ====================
const MODE_CONFIG = {
  classic: {
    starSpeed: 1.5,
    starInterval: 80,
    starIntervalMin: 30,
    obstacleSpeed: 2.0,
    obstacleInterval: 130,
    obstacleIntervalMin: 45,
    obstacleChance: 1, // 实际由难度覆盖
    speedMultiplierBase: 1,
    speedScale: 400,
    label: '经典'
  },
  timeAttack: {
    starSpeed: 2.0,
    starInterval: 60,
    starIntervalMin: 25,
    obstacleSpeed: 2.5,
    obstacleInterval: 100,
    obstacleIntervalMin: 35,
    obstacleChance: 1,
    speedMultiplierBase: 1.2,
    speedScale: 500,
    label: '限时'
  },
  zen: {
    starSpeed: 1.0,
    starInterval: 120,
    starIntervalMin: 60,
    obstacleSpeed: 0,
    obstacleInterval: 9999,
    obstacleIntervalMin: 9999,
    obstacleChance: 0,
    hitScale: 1.2,
    starRadius: 18,
    speedMultiplierBase: 0.8,
    speedScale: 1000,
    label: '禅意'
  },
  survival: {
    starSpeed: 2.5,
    starInterval: 30,
    starIntervalMin: 12,
    obstacleSpeed: 3.5,
    obstacleInterval: 35,
    obstacleIntervalMin: 10,
    obstacleChance: 1, // 恒生成，配合密集间隔
    hitScale: 0.9,
    starRadius: 14,
    speedMultiplierBase: 1.5,
    speedScale: 600,
    label: '生存'
  },
  magic: {
    starSpeed: 1.0,
    starInterval: 9999,
    starIntervalMin: 9999,
    obstacleSpeed: 0,
    obstacleInterval: 9999,
    obstacleIntervalMin: 9999,
    obstacleChance: 0,
    hitScale: 1,
    starRadius: 16,
    speedMultiplierBase: 1,
    speedScale: 400,
    label: '魔法'
  },
  magicEndless: {
    starSpeed: 1.0,
    starInterval: 9999,
    starIntervalMin: 9999,
    obstacleSpeed: 0,
    obstacleInterval: 9999,
    obstacleIntervalMin: 9999,
    obstacleChance: 0,
    hitScale: 1,
    starRadius: 16,
    speedMultiplierBase: 1,
    speedScale: 400,
    label: '无尽'
  }
};

// ==================== 难度配置 ====================
const DIFFICULTY_CONFIG = {
  easy: {
    starSpeed: 0.8,
    starRadius: 26, // 小球最大，容易收集（原 20，+30%）
    obstacleChance: 0.3, // 简单难度少量障碍物
    hitScale: 1.4,
    label: '简单'
  },
  medium: {
    starSpeed: 1.25,
    starRadius: 18, // 小球适中（原 16，+约 15%）
    obstacleChance: 0.5, // 偶尔出现
    hitScale: 1.0,
    label: '中等'
  },
  hard: {
    starSpeed: 1.65,
    starRadius: 13, // 小球较小，略微增大（原 12）
    obstacleChance: 0.9, // 频繁出现
    hitScale: 0.75,
    label: '困难'
  }
};

// ==================== 收集物 / 障碍物图标 ====================
const STAR_EMOJIS = ['🌟', '🪐', '👾', '💎', '⚡', '🍬'];
const OBSTACLE_EMOJIS = ['☄️', '💣', '🔥', '☠️'];

// ==================== 实体类 ====================
class Star {
  constructor(width, speedMultiplier, baseSpeed, radius) {
    this.radius = radius || 16;
    this.x = Math.random() * (width - this.radius * 2) + this.radius;
    this.y = -this.radius;
    this.speed = (baseSpeed || 1) * (0.8 + Math.random() * 0.4) * (speedMultiplier || 1);
    this.emoji = STAR_EMOJIS[Math.floor(Math.random() * STAR_EMOJIS.length)];
    this.rotation = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.04;
  }

  update() {
    this.y += this.speed;
    this.rotation += this.spin;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation * 0.5); // 轻微摆动
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(250, 204, 21, 0.6)';
    ctx.font = `${this.radius * 2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);
    ctx.restore();
  }
}

/**
 * 障碍物：危险 Emoji + 红色警示光晕
 */
class Obstacle {
  constructor(width, speedMultiplier, baseSpeed) {
    this.size = 30;
    this.x = Math.random() * (width - this.size * 2) + this.size;
    this.y = -this.size * 2;
    this.speed = (baseSpeed || 1) * (0.9 + Math.random() * 0.3) * (speedMultiplier || 1);
    this.emoji = OBSTACLE_EMOJIS[Math.floor(Math.random() * OBSTACLE_EMOJIS.length)];
    this.rotation = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.08;
  }

  update() {
    this.y += this.speed;
    this.rotation += this.spin;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // 红色警示光晕（外圈）
    const glow = ctx.createRadialGradient(0, 0, this.size * 0.3, 0, 0, this.size * 1.4);
    glow.addColorStop(0, 'rgba(239, 68, 68, 0.55)');
    glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, this.size * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // 危险 Emoji
    ctx.rotate(this.rotation);
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ef4444';
    ctx.font = `${this.size * 1.6}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);
    ctx.restore();
  }
}

// ==================== 魔法手势师：敌人配置 ====================
const ENEMY_CONFIG = {
  slime: { hp: 1, weakness: '火球', emoji: '🟢', size: 26, speed: 1.2, label: '史莱姆' },
  bird:  { hp: 1, weakness: '风刃', emoji: '🐦', size: 24, speed: 2.0, label: '飞鸟' },
  golem: { hp: 2, weakness: '抓取', emoji: '🗿', size: 32, speed: 0.9, label: '石像' },
  boss:  { hp: 20, weakness: '抓取', emoji: '👹', size: 66, speed: 0.5, isBoss: true, label: '石像王' }
};

// ==================== 魔法手势师：关卡配置 ====================
// 教学关 + 5 个普通关（击杀目标递增、刷新越来越快、敌人种类越来越多）+ 1 个 Boss 关
const LEVEL_CONFIG = [
  { kills: 3,  spawnInterval: 170, types: ['slime'], tutorial: true, label: '教学关' },
  { kills: 5,  spawnInterval: 130, types: ['slime'],                 label: '第 1 关' },
  { kills: 8,  spawnInterval: 110, types: ['slime', 'bird'],         label: '第 2 关' },
  { kills: 12, spawnInterval: 95,  types: ['slime', 'bird', 'golem'], label: '第 3 关' },
  { kills: 16, spawnInterval: 80,  types: ['slime', 'bird', 'golem'], label: '第 4 关' },
  { kills: 20, spawnInterval: 65,  types: ['slime', 'bird', 'golem'], label: '第 5 关' },
  { boss: true, bossHp: 20, minionInterval: 85, types: ['slime', 'bird'], label: 'Boss 关' }
];

class Enemy {
  constructor(width, type) {
    const cfg = ENEMY_CONFIG[type];
    this.type = type;
    this.weakness = cfg.weakness;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.emoji = cfg.emoji;
    this.size = cfg.size;
    this.x = Math.random() * (width - this.size * 2) + this.size;
    this.y = -this.size * 2;
    this.speed = cfg.speed;
    this.isBoss = !!cfg.isBoss;
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

    // 敌人图标
    ctx.rotate(this.rotation * 0.3);
    ctx.shadowBlur = this.isBoss ? 24 : 12;
    ctx.shadowColor = this.isBoss ? 'rgba(250, 204, 21, 0.8)' : 'rgba(168, 85, 247, 0.5)';
    ctx.font = `${this.size * 1.8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);
    ctx.rotate(-this.rotation * 0.3);

    ctx.shadowBlur = 0;
    // 血条（多血敌人显示；Boss 由顶部大血条展示，这里不重复画）
    if (this.maxHp > 1 && !this.isBoss) {
      const barW = this.size * 1.5;
      const barH = 4;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(-barW / 2, -this.size * 1.2, barW, barH);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-barW / 2, -this.size * 1.2, barW * (this.hp / this.maxHp), barH);
    }

    // 弱点提示文字
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`怕${this.weakness}`, 0, this.size * 1.3);

    ctx.restore();
  }
}

class Particle {
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
    // 拖尾：从当前位置沿速度反方向画一条渐隐线段
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
class AmbientParticle {
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
