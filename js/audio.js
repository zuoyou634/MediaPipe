/**
 * js/audio.js
 * Web Audio API 音效管理器
 * 根据模式使用不同音色
 */

class AudioManager {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      // @ts-ignore 兼容 Safari
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _playTone({ type = 'sine', startFreq, endFreq, duration, startGain = 0.15 }) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }

    gain.gain.setValueAtTime(startGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  /** 得分音效：清脆科幻音或禅意柔和音 */
  playScore(mode = 'classic') {
    if (mode === 'zen') {
      this._playTone({ type: 'sine', startFreq: 523, endFreq: 659, duration: 0.25, startGain: 0.1 });
    } else {
      this._playTone({ type: 'sine', startFreq: 880, endFreq: 1760, duration: 0.12, startGain: 0.12 });
    }
  }

  /** 受伤音效：低沉哇/咚 */
  playHit() {
    this._playTone({ type: 'sawtooth', startFreq: 220, endFreq: 80, duration: 0.3, startGain: 0.18 });
  }

  /** 游戏结束音效：下降音 */
  playGameOver() {
    this._playTone({ type: 'square', startFreq: 300, endFreq: 50, duration: 0.6, startGain: 0.18 });
  }

  /** 禅意模式氛围音 */
  playZenAmbience() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(329, now);
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 1.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.5);
  }
}

const audioManager = new AudioManager();
