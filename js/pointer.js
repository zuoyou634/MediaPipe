/**
 * js/pointer.js
 * 霓虹指针模型：发光的宇宙飞船，带尾迹与碰撞反馈
 */

class Pointer {
  constructor(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.x = canvasWidth / 2;
    this.y = canvasHeight - 80;
    this.targetX = this.x;
    this.radius = 18;
    this.color = '#38bdf8';
    this.trail = [];
    this.maxTrail = 18;
    this.flashTime = 0;
  }

  /** 画布尺寸变化时重新校准位置 */
  resize(width, height) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.y = height - 80;
    this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
    this.targetX = Math.max(this.radius, Math.min(width - this.radius, this.targetX));
    this.trail = [];
  }

  /** 平滑跟随食指坐标 */
  update(handX, handDetected) {
    if (handDetected) {
      this.targetX = handX;
    }
    this.x += (this.targetX - this.x) * 0.14;
    this.x = Math.max(this.radius, Math.min(this.canvasWidth - this.radius, this.x));

    // 记录尾迹
    this.trail.push({ x: this.x, y: this.y, alpha: 1.0 });
    if (this.trail.length > this.maxTrail) {
      this.trail.shift();
    }
    for (let i = 0; i < this.trail.length; i++) {
      this.trail[i].alpha = i / this.trail.length;
    }

    if (this.flashTime > 0) this.flashTime--;
  }

  /** 触发碰撞闪光 */
  triggerFlash() {
    this.flashTime = 10;
  }

  draw(ctx) {
    // 尾迹
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      ctx.save();
      ctx.globalAlpha = t.alpha * 0.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.radius * 0.5 * t.alpha, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    const glowColor = this.flashTime > 0 ? '#f472b6' : this.color;
    ctx.shadowBlur = 22;
    ctx.shadowColor = glowColor;

    // 飞船主体
    ctx.beginPath();
    ctx.moveTo(0, -this.radius);
    ctx.lineTo(this.radius * 0.85, this.radius * 0.7);
    ctx.lineTo(0, this.radius * 0.3);
    ctx.lineTo(-this.radius * 0.85, this.radius * 0.7);
    ctx.closePath();
    ctx.fillStyle = glowColor;
    ctx.fill();

    // 中心核心
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // 引擎火焰
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(-6, this.radius * 0.4);
    ctx.lineTo(0, this.radius + 12 + Math.random() * 8);
    ctx.lineTo(6, this.radius * 0.4);
    ctx.closePath();
    ctx.fillStyle = '#f97316';
    ctx.fill();

    ctx.restore();
  }
}
