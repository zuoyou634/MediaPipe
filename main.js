/**
 * main.js
 * 前端入口：初始化 MediaPipe、管理界面状态流转、启动游戏
 */

// ==================== 全局暴露给各模块的手势坐标 ====================
window.handX = window.innerWidth / 2;  // 食指指尖 x 坐标（逻辑像素）
window.handDetected = false;           // 是否检测到手
window.currentGesture = null;          // 当前识别的手势（'火球'/'护盾'/'风刃'/'抓取'/null）
window.currentGestureConfidence = 0;   // 当前手势置信度（0-100）

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
  if (window.wizardGame) window.wizardGame.resize(canvas.width, canvas.height);

  // 同步当前手势坐标到新宽度，避免 resize 后指针跳变
  window.handX = window.handX >= 0 ? window.handX : canvas.width / 2;
}

// 先设置一次尺寸，再创建游戏模块
fitCanvas();

// ==================== 初始化游戏模块 ====================
const pointer = new Pointer(canvas.width, canvas.height);
const game = new Game(canvas, pointer, UI, audioManager);
const wizardGame = new WizardGame(canvas, pointer, UI, audioManager);
window.pointer = pointer;
window.game = game; // 方便 UI 模块调用暂停
window.wizardGame = wizardGame;

// 通关后解锁下一关（localStorage 持久化）
wizardGame.onLevelCleared = (levelIndex) => {
  Storage.setWizardUnlockedLevel(levelIndex + 1);
};

// 窗口尺寸变化时重新适配
window.addEventListener('resize', fitCanvas);

// 当前选择的模式与难度
let selectedMode = 'classic';
let selectedDifficulty = 'medium';

// 当前活跃的游戏实例（Game 或 WizardGame），用于键盘事件路由
let activeGame = null;

// 魔法手势师当前正在游玩的关卡序号（单关制）
let currentWizardLevel = null;

// ==================== MediaPipe Hands 初始化 ====================

function onResults(results) {
  const debugEl = document.getElementById('gesture-debug');
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    window.handDetected = true;
    const landmarks = results.multiHandLandmarks[0];
    const indexTip = landmarks[8];
    // 归一化坐标 (0-1) 乘上 canvas 实际宽度，镜像翻转 x
    window.handX = (1 - indexTip.x) * canvas.width;
    window.handY = indexTip.y * canvas.height;

    // 手势识别：实时显示并暴露给魔法手势师模式使用
    const gesture = HandGestures.detect(landmarks);
    window.currentGesture = gesture || null;
    window.currentGestureConfidence = gesture ? HandGestures.confidence(landmarks) : 0;
    if (debugEl) debugEl.textContent = gesture ? `手势: ${gesture} ${window.currentGestureConfidence}%` : '手势: 无';
  } else {
    window.handDetected = false;
    window.currentGesture = null;
    window.currentGestureConfidence = 0;
    if (debugEl) debugEl.textContent = '手势: 无手';
  }

  // 初始化全局 handY，避免未检测到手时 undefined
  if (typeof window.handY !== 'number') window.handY = canvas.height / 2;
}

// 检测 MediaPipe CDN 是否加载成功（若被网络拦截，Hands/Camera 会是 undefined）
if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
  const errEl = document.getElementById('camera-error');
  if (errEl) {
    errEl.textContent = '无法加载 MediaPipe 依赖（CDN 可能被拦截）。请检查网络，或按 F12 查看控制台错误。';
    errEl.classList.remove('hidden');
  }
  throw new Error('MediaPipe 库未加载：请检查 jsd.cdn.zzko.cn 是否可访问');
}

const hands = new Hands({
  locateFile: (file) => `https://jsd.cdn.zzko.cn/npm/@mediapipe/hands/${file}`
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
  // 禅意、极限生存不需要选择难度
  if (selectedMode === 'zen' || selectedMode === 'survival') {
    startGameplay(null);
    return;
  }
  // 魔法手势师进入关卡选择界面
  if (selectedMode === 'wizard') {
    goToLevelSelect();
    return;
  }
  UI.showScreen('difficulty-screen');
}

function startGameplay(difficulty) {
  selectedDifficulty = difficulty;
  if (selectedMode === 'wizard') {
    activeGame = wizardGame;
    wizardGame.start(0);
  } else {
    activeGame = game;
    game.start(selectedMode, selectedDifficulty);
  }
}

/** 渲染并显示魔法手势师关卡选择界面 */
function goToLevelSelect() {
  UI.renderLevelSelect((levelIndex) => startWizardLevel(levelIndex));
  UI.showScreen('level-select-screen');
}

/** 单关制：从指定关卡开始一局魔法手势师 */
function startWizardLevel(levelIndex) {
  currentWizardLevel = levelIndex;
  activeGame = wizardGame;
  wizardGame.start(levelIndex);
}

// ==================== 事件绑定 ====================

UI.bindMenuEvents({
  onStart: () => goToModeSelect(),
  onBackToMenu: () => goToMenu(),
  onReplay: () => {
    // 魔法手势师单关制：重玩当前关卡；其余模式回到模式选择
    if (activeGame === wizardGame && currentWizardLevel != null) {
      startWizardLevel(currentWizardLevel);
    } else {
      goToModeSelect();
    }
  },
  onResultBack: () => {
    // 魔法手势师：返回关卡选择；其余模式返回主菜单
    if (activeGame === wizardGame && currentWizardLevel != null) {
      goToLevelSelect();
    } else {
      goToMenu();
    }
  },
  onNextLevel: () => {
    // 过关结算面板：跳到下一关（Boss 之后没有下一关，按钮已隐藏）
    if (currentWizardLevel != null && currentWizardLevel < 6) {
      startWizardLevel(currentWizardLevel + 1);
    }
  },
  onLevelSelect: () => goToLevelSelect(),
  onPause: () => {
    if (activeGame && typeof activeGame.togglePause === 'function') {
      activeGame.togglePause();
    }
  },
  onZenEnd: () => {
    if (activeGame && typeof activeGame.endGame === 'function') {
      activeGame.endGame('主动结束');
    }
  }
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
    if (activeGame && typeof activeGame.togglePause === 'function') {
      activeGame.togglePause();
    }
  }
  if (e.code === 'Escape') {
    // 游戏中按 ESC 返回菜单
    const target = activeGame;
    if (target && (target.state === 'playing' || target.state === 'paused' || target.state === 'countdown')) {
      target.state = 'ended';
      cancelAnimationFrame(target.loopId);
      activeGame = null;
      goToMenu();
    }
  }
});

// ==================== 启动摄像头并显示主菜单 ====================
const cameraErrorEl = document.getElementById('camera-error');

/** 在页面上用居中红字提示摄像头错误 */
function showCameraError(msg) {
  console.error(msg);
  if (cameraErrorEl) {
    cameraErrorEl.textContent = msg;
    cameraErrorEl.classList.remove('hidden');
  }
}

/** 启动摄像头：显式静音播放 + 捕获所有错误，避免黑屏无提示 */
async function startCamera() {
  if (!videoElement) return;

  // 显式设置自动播放属性（静音 + 内联），避免浏览器自动播放策略拦截 video.play()
  videoElement.setAttribute('autoplay', '');
  videoElement.setAttribute('muted', '');
  videoElement.setAttribute('playsinline', '');
  videoElement.muted = true;
  videoElement.playsInline = true;

  // 安全检查：file:// 等非安全上下文会禁用摄像头
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraError('无法访问摄像头：浏览器已禁用（非安全上下文）。请运行 node server.js 后访问 http://localhost:3000，不要直接双击打开 index.html。');
    return;
  }

  try {
    await camera.start();
  } catch (err) {
    console.error('摄像头启动失败:', err);
    let msg = '无法访问摄像头';
    if (err && err.name === 'NotAllowedError') {
      msg += '：浏览器拒绝了摄像头权限，请点击地址栏的摄像头图标并允许访问。';
    } else if (err && err.name === 'NotFoundError') {
      msg += '：未检测到摄像头设备，请确认摄像头已连接。';
    } else if (err && err.name === 'NotReadableError') {
      msg += '：摄像头被其他程序占用，请关闭占用摄像头的软件后刷新。';
    } else {
      msg += '：请确认摄像头已连接，然后按 Ctrl+F5 强制刷新重试。';
    }
    showCameraError(msg);
    return;
  }

  // camera.start() 成功后，再显式确保视频真正在播放
  try {
    if (videoElement.paused) {
      await videoElement.play();
    }
  } catch (playErr) {
    console.warn('video.play() 失败:', playErr);
    showCameraError('无法访问摄像头：视频播放被阻止，请检查浏览器设置后刷新。');
  }
}

startCamera();
goToMenu();
