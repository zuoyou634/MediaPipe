/**
 * main.js
 * 前端入口：初始化 MediaPipe、管理界面状态流转、启动游戏
 */

// ==================== 全局暴露给各模块的手势坐标 ====================
window.handX = window.innerWidth / 2;  // 食指指尖 x 坐标（逻辑像素）
window.handDetected = false;           // 是否检测到手

// ==================== DOM 元素 ====================
const videoElement = document.getElementById('input-video');
const canvas = document.getElementById('game-canvas');

// ==================== Canvas 全屏适配 ====================
// 关键：让 canvas 的逻辑像素尺寸 = 窗口尺寸，保证 MediaPipe 归一化坐标
// 映射后与屏幕位置 1:1 对应，避免“指东打西”和碰撞错位。
function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // 若游戏模块已创建，同步更新它们的尺寸
  if (window.pointer) window.pointer.resize(canvas.width, canvas.height);
  if (window.game) window.game.resize(canvas.width, canvas.height);

  // 同步当前手势坐标到新宽度，避免 resize 后指针跳变
  window.handX = window.handX >= 0 ? window.handX : canvas.width / 2;
}

// 先设置一次尺寸，再创建游戏模块
fitCanvas();

// ==================== 初始化游戏模块 ====================
const pointer = new Pointer(canvas.width, canvas.height);
const game = new Game(canvas, pointer, UI, audioManager);
window.pointer = pointer;
window.game = game; // 方便 UI 模块调用暂停

// 窗口尺寸变化时重新适配
window.addEventListener('resize', fitCanvas);

// 当前选择的模式与难度
let selectedMode = 'classic';
let selectedDifficulty = 'medium';

// ==================== MediaPipe Hands 初始化 ====================

function onResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    window.handDetected = true;
    const landmarks = results.multiHandLandmarks[0];
    const indexTip = landmarks[8];
    // 归一化坐标 (0-1) 乘上 canvas 实际宽度，镜像翻转 x
    window.handX = (1 - indexTip.x) * canvas.width;
  } else {
    window.handDetected = false;
  }
}

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 320,
  height: 240
});

// ==================== 界面状态机 ====================

function goToMenu() {
  UI.showScreen('menu-screen');
}

function goToModeSelect() {
  UI.showScreen('mode-screen');
}

function goToDifficultySelect() {
  // 禅意和极限生存不需要选择难度
  if (selectedMode === 'zen' || selectedMode === 'survival') {
    startGameplay(null);
    return;
  }
  UI.showScreen('difficulty-screen');
}

function startGameplay(difficulty) {
  selectedDifficulty = difficulty;
  game.start(selectedMode, selectedDifficulty);
}

// ==================== 事件绑定 ====================

UI.bindMenuEvents({
  onStart: () => goToModeSelect(),
  onBackToMenu: () => goToMenu()
});

UI.setModeButtons((modeId) => {
  selectedMode = modeId;
  goToDifficultySelect();
});

UI.setDifficultyButtons((diffId) => {
  startGameplay(diffId);
});

// 全局键盘事件
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    game.togglePause();
  }
  if (e.code === 'Escape') {
    // 游戏中按 ESC 返回菜单
    if (game.state === 'playing' || game.state === 'paused' || game.state === 'countdown') {
      game.state = 'ended';
      cancelAnimationFrame(game.loopId);
      goToMenu();
    }
  }
});

// ==================== 启动摄像头并显示主菜单 ====================
camera.start();
goToMenu();
