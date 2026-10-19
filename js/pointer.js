/**
 * js/pointer.js
 * 指针模型：🚀 火箭，平滑跟随食指移动，头部朝向移动方向，尾部喷射火焰粒子尾迹
 */

// 魔法手势师：三种角色形态（学徒 → 法师 → 大魔导师）
const MAGE_STYLES = {
  apprentice: { scale: 0.72, robe: '#60a5fa', robeDark: '#2563eb', hat: '#3b82f6', skin: '#fcd7b6', staff: null, orb: null, aura: false },
  mage:       { scale: 0.9,  robe: '#a78bfa', robeDark: '#6d28d9', hat: '#7c3aed', skin: '#fcd7b6', staff: '#94a3b8', orb: '#38bdf8', aura: false },
  archmage:   { scale: 1.18, robe: '#f59e0b', robeDark: '#92400e', hat: '#dc2626', skin: '#fcd7b6', staff: '#e5e7eb', orb: '#facc15', aura: true }
};

class Pointer {
  constructor(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.x = canvasWidth / 2;
    this.y = canvasHeight - 80;
    this.targetX = this.x;
    this.radius = 20; // 碰撞判定半径
    this.color = '#38bdf8';
    this.tilt = 0;      // 左右倾斜角度（头部朝向移动方向）
    this.prevX = this.x; // 上一帧位置，用于计算移动方向
    this.flame = [];    // 火焰尾迹粒子
    this.maxFlame = 22;
    this.flashTime = 0;
    this.character = 'rocket'; // 'rocket' | 'apprentice' | 'mage' | 'archmage'
  }

  /** 画布尺寸变化时重新校准位置 */
  resize(width, height) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.y = height - 80;
    this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
    this.targetX = Math.max(this.radius, Math.min(width - this.radius, this.targetX));
    this.prevX = this.x;
    this.flame = [];
  }

  /** 平滑跟随食指坐标 */
  update(handX, handDetected) {
    if (handDetected) {
      this.targetX = handX;
    }
    this.prevX = this.x;
    this.x += (this.targetX - this.x) * 0.14;
    this.x = Math.max(this.radius, Math.min(this.canvasWidth - this.radius, this.x));

    // 根据移动速度计算倾斜角度（左右移动时火箭倾斜，头部朝向运动方向）
    const vx = this.x - this.prevX;
    this.tilt = Math.max(-0.55, Math.min(0.55, vx * 0.045));

    // 喷射火焰粒子（从火箭尾部向下飘散）
    this.flame.push({
      x: this.x + (Math.random() - 0.5) * 6,
      y: this.y + this.radius * 0.55,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 3 + Math.random() * 3,
      life: 1.0,
      decay: 0.06 + Math.random() * 0.06,
      size: 4 + Math.random() * 5
    });
    if (this.flame.length > this.maxFlame) this.flame.shift();

    if (this.flashTime > 0) this.flashTime--;
  }

  /** 触发碰撞闪光 */
  triggerFlash() {
    this.flashTime = 10;
  }

  /** 设置角色形态（经典模式火箭 / 魔法模式法师三阶段） */
  setCharacter(character) {
    this.character = character;
  }

  draw(ctx) {
    // 魔法角色：法师三阶段（学徒/法师/大魔导师）
    if (this.character !== 'rocket') {
      this.drawMage(ctx);
      return;
    }

    // 火焰尾迹粒子
    for (const p of this.flame) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, '#fbbf24');
      grad.addColorStop(0.5, '#f97316');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.flame = this.flame.filter(p => p.life > 0);

    // 火箭主体（矢量绘制，头部朝上）
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt);

    const r = this.radius;
    const glowColor = this.flashTime > 0 ? '#f472b6' : this.color;

    // 尾部火焰（动态抖动）
    ctx.shadowBlur = 0;
    const flameLen = r * 1.3 + Math.random() * r * 0.7;
    const flameGrad = ctx.createLinearGradient(0, r * 0.3, 0, r * 0.3 + flameLen);
    flameGrad.addColorStop(0, '#fbbf24');
    flameGrad.addColorStop(0.5, '#f97316');
    flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, r * 0.3);
    ctx.quadraticCurveTo(0, r * 0.3 + flameLen, r * 0.32, r * 0.3);
    ctx.closePath();
    ctx.fill();

    // 机身（子弹形）
    ctx.shadowBlur = 20;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.6, -r * 0.4, r * 0.55, r * 0.3);
    ctx.quadraticCurveTo(0, r * 0.7, -r * 0.55, r * 0.3);
    ctx.quadraticCurveTo(-r * 0.6, -r * 0.4, 0, -r);
    ctx.closePath();
    ctx.fill();

    // 机翼
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.05);
    ctx.lineTo(-r * 1.0, r * 0.45);
    ctx.lineTo(-r * 0.4, r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -r * 0.05);
    ctx.lineTo(r * 1.0, r * 0.45);
    ctx.lineTo(r * 0.4, r * 0.3);
    ctx.closePath();
    ctx.fill();

    // 舷窗
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.arc(0, -r * 0.28, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-r * 0.08, -r * 0.34, r * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** 绘制法师角色（学徒 → 法师 → 大魔导师） */
  drawMage(ctx) {
    const style = MAGE_STYLES[this.character] || MAGE_STYLES.mage;
    const u = this.radius * style.scale; // 基准单位

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt * 0.35);

    // 大魔导师：周身金色光环
    if (style.aura) {
      const aura = ctx.createRadialGradient(0, -u * 0.2, u * 0.3, 0, -u * 0.2, u * 2.2);
      aura.addColorStop(0, 'rgba(250, 204, 21, 0.5)');
      aura.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, -u * 0.2, u * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 法杖（法师/大魔导师持有）
    if (style.staff) {
      ctx.strokeStyle = style.staff;
      ctx.lineWidth = u * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(u * 0.8, u * 1.15);
      ctx.lineTo(u * 1.25, -u * 0.85);
      ctx.stroke();
      ctx.shadowBlur = u * 0.9;
      ctx.shadowColor = style.orb;
      ctx.fillStyle = style.orb;
      ctx.beginPath();
      ctx.arc(u * 1.25, -u * 1.0, u * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 长袍（下摆宽）
    ctx.fillStyle = style.robe;
    ctx.shadowBlur = u * 0.7;
    ctx.shadowColor = style.robe;
    ctx.beginPath();
    ctx.moveTo(-u * 0.55, -u * 0.4);
    ctx.lineTo(-u * 0.95, u * 1.2);
    ctx.quadraticCurveTo(0, u * 1.45, u * 0.95, u * 1.2);
    ctx.lineTo(u * 0.55, -u * 0.4);
    ctx.closePath();
    ctx.fill();

    // 衣襟
    ctx.fillStyle = style.robeDark;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, -u * 0.35);
    ctx.lineTo(-u * 0.26, u * 1.15);
    ctx.lineTo(u * 0.26, u * 1.15);
    ctx.closePath();
    ctx.fill();

    // 头部
    ctx.fillStyle = style.skin;
    ctx.beginPath();
    ctx.arc(0, -u * 0.62, u * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-u * 0.12, -u * 0.66, u * 0.05, 0, Math.PI * 2);
    ctx.arc(u * 0.12, -u * 0.66, u * 0.05, 0, Math.PI * 2);
    ctx.fill();

    // 法师帽（尖顶 + 帽檐）
    ctx.fillStyle = style.hat;
    ctx.beginPath();
    ctx.moveTo(-u * 0.5, -u * 0.72);
    ctx.quadraticCurveTo(0, -u * 1.05, 0, -u * 1.7);
    ctx.quadraticCurveTo(0, -u * 1.05, u * 0.5, -u * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -u * 0.72, u * 0.52, u * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
