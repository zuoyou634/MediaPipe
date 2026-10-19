/**
 * js/storage.js
 * 本地存储管理：按模式记录历史最高分
 */

const Storage = {
  keyPrefix: 'mpGestureV2_',

  getHighScore(mode) {
    const val = localStorage.getItem(`${this.keyPrefix}high_${mode}`);
    return val ? parseInt(val, 10) || 0 : 0;
  },

  setHighScore(mode, score) {
    const key = `${this.keyPrefix}high_${mode}`;
    const current = this.getHighScore(mode);
    if (score > current) {
      localStorage.setItem(key, score);
      return true;
    }
    return false;
  },

  getAllHighScores() {
    return {
      classic: this.getHighScore('classic'),
      timeAttack: this.getHighScore('timeAttack'),
      zen: this.getHighScore('zen'),
      survival: this.getHighScore('survival')
    };
  },

  /** 魔法手势师：已解锁的最高关卡序号（1-5 普通关，6=Boss，教学关恒解锁） */
  getWizardUnlockedLevel() {
    const val = localStorage.getItem(`${this.keyPrefix}wizard_unlocked`);
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(6, n));
  },

  /** 记录通关后解锁到 nextLevelIndex 关（仅当比当前进度更靠后时才更新） */
  setWizardUnlockedLevel(nextLevelIndex) {
    const cur = this.getWizardUnlockedLevel();
    const target = Math.max(1, Math.min(6, nextLevelIndex));
    if (target > cur) {
      localStorage.setItem(`${this.keyPrefix}wizard_unlocked`, target);
    }
  }
};
