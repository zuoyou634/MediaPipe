/**
 * js/handGestures.js
 * 基于 MediaPipe Hands 关键点的静态手势识别模块。
 * 通过“指尖到手腕的距离 / 指根(PIP)到手腕的距离”的比值判断手指伸直或弯曲：
 *   - 比值 > 1：手指伸直（指尖远离手腕）
 *   - 比值 < 1：手指弯曲（指尖靠近手腕）
 *
 * 支持手势：火球、护盾、风刃、抓取
 */

const HandGestures = {
  /** 识别阈值（识别不准时可微调） */
  thresholds: {
    extended: 1.08, // 比值大于此值视为“伸直”
    curled: 0.92,   // 比值小于此值视为“弯曲”
    halfMin: 0.55,  // “抓取(半弯曲)”比值下限
    halfMax: 1.0    // “抓取(半弯曲)”比值上限
  },

  /** 两点欧氏距离（归一化坐标） */
  _dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  },

  /** 手指伸直比值：tip→wrist / pip→wrist */
  _ratio(lm, tipIdx, pipIdx) {
    return this._dist(lm[tipIdx], lm[0]) / this._dist(lm[pipIdx], lm[0]);
  },

  /** 数值截断到 [min, max] */
  _clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  /** 拇指是否张开（用拇指尖到食指尖根的距离，相对手掌大小判断） */
  _isThumbExtended(lm) {
    const handSize = this._dist(lm[0], lm[9]); // 手腕到中指根，作为手掌大小的参考
    return this._dist(lm[4], lm[5]) > handSize * 0.7;
  },

  /**
   * 识别手势
   * @param {Array} landmarks MediaPipe 的 21 个关键点数组
   * @returns {'火球'|'护盾'|'风刃'|'抓取'|null}
   */
  detect(landmarks) {
    if (!landmarks || landmarks.length < 21) return null;

    const t = this.thresholds;
    const index = this._ratio(landmarks, 8, 6);
    const middle = this._ratio(landmarks, 12, 10);
    const ring = this._ratio(landmarks, 16, 14);
    const pinky = this._ratio(landmarks, 20, 18);

    const indexExt = index > t.extended;
    const middleExt = middle > t.extended;
    const ringExt = ring > t.extended;
    const pinkyExt = pinky > t.extended;
    const indexCurl = index < t.curled;
    const middleCurl = middle < t.curled;
    const ringCurl = ring < t.curled;
    const pinkyCurl = pinky < t.curled;

    // 护盾：五指全部伸直（含拇指张开）
    if (indexExt && middleExt && ringExt && pinkyExt && this._isThumbExtended(landmarks)) {
      return '护盾';
    }

    // 风刃：食指 + 中指伸直，无名指 + 小指弯曲
    if (indexExt && middleExt && ringCurl && pinkyCurl) {
      return '风刃';
    }

    // 火球：仅食指伸直，其余弯曲
    if (indexExt && middleCurl && ringCurl && pinkyCurl) {
      return '火球';
    }

    // 抓取：五指半弯曲（都不伸直、也未完全握拳）
    const allHalfCurl = [index, middle, ring, pinky].every(r => r > t.halfMin && r < t.halfMax);
    if (allHalfCurl) {
      return '抓取';
    }

    return null;
  },

  /**
   * 计算当前手势的置信度（0-100）。
   * 基于每根手指与目标状态的偏离程度：期望伸直的手指比值越高越自信，期望弯曲的手指比值越低越自信。
   */
  confidence(landmarks) {
    const g = this.detect(landmarks);
    if (!g) return 0;

    const r = {
      index: this._ratio(landmarks, 8, 6),
      middle: this._ratio(landmarks, 12, 10),
      ring: this._ratio(landmarks, 16, 14),
      pinky: this._ratio(landmarks, 20, 18)
    };
    const ext = v => this._clamp((v - 0.9) / 0.4, 0, 1);   // 0.9→0，1.3→1
    const curl = v => this._clamp((0.9 - v) / 0.4, 0, 1);  // 0.9→0，0.5→1
    const half = v => this._clamp(1 - Math.abs(v - 0.78) / 0.25, 0, 1); // 抓取半弯曲中心 0.78

    let scores;
    if (g === '火球') scores = [ext(r.index), curl(r.middle), curl(r.ring), curl(r.pinky)];
    else if (g === '护盾') scores = [ext(r.index), ext(r.middle), ext(r.ring), ext(r.pinky)];
    else if (g === '风刃') scores = [ext(r.index), ext(r.middle), curl(r.ring), curl(r.pinky)];
    else scores = [half(r.index), half(r.middle), half(r.ring), half(r.pinky)];

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(this._clamp(avg, 0, 1) * 100);
  },

  /** 调试：返回每根手指的伸直比值（>1 伸直，<1 弯曲），可在控制台打印 */
  debug(landmarks) {
    if (!landmarks || landmarks.length < 21) return null;
    return {
      index: +this._ratio(landmarks, 8, 6).toFixed(2),
      middle: +this._ratio(landmarks, 12, 10).toFixed(2),
      ring: +this._ratio(landmarks, 16, 14).toFixed(2),
      pinky: +this._ratio(landmarks, 20, 18).toFixed(2)
    };
  }
};
