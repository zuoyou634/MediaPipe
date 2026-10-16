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
  }
};
