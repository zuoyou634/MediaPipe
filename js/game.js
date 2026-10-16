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
    this.bgOffset = 0;

    this.timeLimit = 60000; // Time Attack 限时 60 秒
    this.timeLeft = this.timeLimit;

    this.loopId = null;

    // 生成计时器：用递减计数，比“frames % interval”更直观可靠
    this.starTimer = 0;
    this.obstacleTimer = 0;

    // 撞到障碍物时的屏幕红色闪烁
    this.screenFlash = 0;
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
    this.state = 'idle';
    this.starTimer = 0;
    this.obstacleTimer = 0;
    this.screenFlash = 0;

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
      this.stars.push(new Star(this.width, speedMultiplier, config.starSpeed));
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
        this.hitObstacle();
      }
    }

    // ---- 粒子更新 ----
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update();
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    if (this.screenFlash > 0) this.screenFlash--;

    this.ui.updateHUD(this.getHUDData());
  }

  collectStar(star) {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const multiplier = 1 + Math.floor(this.combo / 5);
    this.score += 10 * multiplier;

    this.audio.playScore(this.mode);
    this.spawnParticles(star.x, star.y, '#facc15', 12);
    this.pointer.triggerFlash();
  }

  /** 撞到障碍物：扣命、清连击、红色闪烁、爆炸粒子、音效 */
  hitObstacle() {
    this.combo = 0;
    this.lives--;
    this.audio.playHit();
    this.spawnParticles(this.pointer.x, this.pointer.y, '#ef4444', 30);
    this.pointer.triggerFlash();
    this.screenFlash = 24; // 触发约 0.4 秒的屏幕红色闪烁

    if (this.lives <= 0) {
      this.endGame('生命耗尽');
    }
  }

  spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, color));
    }
  }

  getHUDData() {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      lives: this.lives,
      mode: this.mode,
      difficulty: this.difficulty,
      timeLeft: this.mode === 'timeAttack' ? this.timeLeft : null
    };
  }

  /** 游戏结束并请求 AI 反馈 */
  endGame(reason) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    cancelAnimationFrame(this.loopId);
    this.audio.playGameOver();

    const payload = {
      score: this.score,
      maxCombo: this.maxCombo,
      survivalTimeMs: this.survivalTimeMs,
      livesLost: this.mode === 'zen' ? 0 : (this.getInitialLives() - this.lives),
      deathReason: reason,
      mode: this.mode,
      difficulty: this.difficulty
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
    this.drawBackground();
    this.stars.forEach(s => s.draw(ctx));
    this.obstacles.forEach(o => o.draw(ctx));
    this.particles.forEach(p => p.draw(ctx));
    this.pointer.draw(ctx);

    if (!window.handDetected) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.fillText('未检测到手势，请举起手', this.width / 2 - 100, 36);
    }

    // 撞到障碍物时的全屏红色闪烁
    if (this.screenFlash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${(this.screenFlash / 24) * 0.35})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /** 动态背景：深空 + 滚动电子网格 + 星空 */
  drawBackground() {
    const ctx = this.ctx;
    this.bgOffset = (this.bgOffset + 0.5) % 40;

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
}

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
    speedMultiplierBase: 1.5,
    speedScale: 600,
    label: '生存'
  }
};

// ==================== 难度配置 ====================
const DIFFICULTY_CONFIG = {
  easy: {
    starSpeed: 0.8,
    obstacleChance: 0.3, // 简单难度少量障碍物
    hitScale: 1.4,
    label: '简单'
  },
  medium: {
    starSpeed: 1.0,
    obstacleChance: 0.5, // 偶尔出现
    hitScale: 1.0,
    label: '中等'
  },
  hard: {
    starSpeed: 1.3,
    obstacleChance: 0.9, // 频繁出现
    hitScale: 0.75,
    label: '困难'
  }
};

// ==================== 实体类 ====================
class Star {
  constructor(width, speedMultiplier, baseSpeed) {
    this.radius = 12;
    this.x = Math.random() * (width - this.radius * 2) + this.radius;
    this.y = -this.radius;
    this.speed = (baseSpeed || 1) * (0.8 + Math.random() * 0.4) * (speedMultiplier || 1);
    this.color = '#facc15';
  }

  update() {
    this.y += this.speed;
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.closePath();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }
}

/**
 * 障碍物：醒目的红色带电尖刺陨石，与金色星星形成鲜明视觉区分
 */
class Obstacle {
  constructor(width, speedMultiplier, baseSpeed) {
    this.size = 30;
    this.x = Math.random() * (width - this.size * 2) + this.size;
    this.y = -this.size * 2;
    this.speed = (baseSpeed || 1) * (0.9 + Math.random() * 0.3) * (speedMultiplier || 1);
    this.color = '#ef4444';
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
    ctx.rotate(this.rotation);

    const s = this.size / 2;
    const spike = this.size * 0.35;

    // 红色发光
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ef4444';

    // 主体
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-s, -s, this.size, this.size);

    // 四方向尖刺
    ctx.fillStyle = '#991b1b';
    ctx.beginPath(); ctx.moveTo(-s * 0.5, -s); ctx.lineTo(0, -s - spike); ctx.lineTo(s * 0.5, -s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.5, s); ctx.lineTo(0, s + spike); ctx.lineTo(s * 0.5, s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s, -s * 0.5); ctx.lineTo(-s - spike, 0); ctx.lineTo(-s, s * 0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s, -s * 0.5); ctx.lineTo(s + spike, 0); ctx.lineTo(s, s * 0.5); ctx.closePath(); ctx.fill();

    // 中心亮色
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f87171';
    ctx.fillRect(-s * 0.35, -s * 0.35, this.size * 0.35, this.size * 0.35);

    // 带电黄色描边
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s, -s, this.size, this.size);

    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 2;
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
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}
