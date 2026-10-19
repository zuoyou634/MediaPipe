/**
 * server.js
 * 本地开发服务器：同时提供前端静态资源和 /api/feedback 后端接口
 * 用法：node server.js
 *
 * 依赖：express、dotenv
 * 要求：Node.js 18+（内置 fetch）
 */

// 自动加载项目根目录 .env 文件中的环境变量
require('dotenv/config');

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 检查 .env 文件是否存在，帮助用户排查环境变量未加载的问题
if (!fs.existsSync(path.join(__dirname, '.env'))) {
  console.warn('⚠️  未检测到 .env 文件，请手动配置 DEEPSEEK_KEY 环境变量');
}

// 解析 JSON 请求体
app.use(express.json());

// 静态文件服务：提供 index.html、style.css、main.js 等前端资源
app.use(express.static(path.join(__dirname)));

/**
 * /api/feedback 接口
 * 前端游戏结束时调用，后端使用 .env 中的 DEEPSEEK_KEY 请求 DeepSeek API
 * 根据得分、连击、存活时间等数据生成夸张幽默的中文评价
 * 错误时返回兜底文案"AI裁判掉线了"，避免前端暴露密钥
 */
async function handleFeedback(req, res) {
  const { score, maxCombo, survivalTimeMs, livesLost, deathReason, mode, difficulty, victory, castAccuracy, totalCasts, correctCasts, levelReached } = req.body || {};

  if (typeof score !== 'number') {
    return res.status(400).json({ feedback: '请求体中缺少有效的 score 字段' });
  }

  const apiKey = process.env.DEEPSEEK_KEY;
  if (!apiKey) {
    return res.status(500).json({ feedback: '服务器未配置 DEEPSEEK_KEY 环境变量' });
  }

  // 组装给 AI 的数据
  const survivalSeconds = Math.max(0, Math.round((survivalTimeMs || 0) / 1000));
  const combo = typeof maxCombo === 'number' ? maxCombo : 0;
  const lost = typeof livesLost === 'number' ? livesLost : 0;
  const reason = deathReason || '未知';
  const modeName = mode || 'classic';
  const diffName = difficulty || 'medium';

  const modeLabelMap = {
    classic: '经典模式',
    timeAttack: '限时挑战',
    zen: '无尽禅意',
    survival: '极限生存',
    magic: '魔法手势师',
    magicEndless: '魔法无尽挑战'
  };
  const diffLabelMap = {
    easy: '简单',
    medium: '中等',
    hard: '困难'
  };
  const modeLabel = modeLabelMap[modeName] || modeName;
  const diffLabel = diffLabelMap[diffName] || diffName;

  // 组装玩家数据文本；魔法模式额外附带施法准确率和关卡进度
  let userContent = `玩家数据：模式 ${modeLabel}，难度 ${diffLabel}，得分 ${score}，最高连击 ${combo}，存活 ${survivalSeconds} 秒，失去生命 ${lost} 次，死因：${reason}。`;
  if (modeName === 'magic' || modeName === 'magicEndless') {
    const acc = typeof castAccuracy === 'number' ? castAccuracy : 0;
    const casts = typeof totalCasts === 'number' ? totalCasts : 0;
    const hits = typeof correctCasts === 'number' ? correctCasts : 0;
    userContent += `施法准确率 ${acc}%（${hits}/${casts} 次有效命中）`;
    if (modeName === 'magic') {
      userContent += victory ? '，已通关全部关卡。' : `，止步于第 ${levelReached} 关。`;
    }
    userContent += ' 请重点根据施法准确率点评：准确率高就夸"法术精准、指哪打哪"，低就调侃"乱甩技能、全靠缘分"。';
  }
  userContent += '请生成一段带称号的幽默点评。';

  // 步骤 1：发起网络请求（单独 try/catch，防止 DNS、超时等未捕获异常导致崩溃）
  let response;
  try {
    response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              '你是一位毒舌又幽默的电竞解说员。请根据玩家的游戏模式、难度和数据，用夸张、搞笑、带称号的方式点评玩家表现。' +
              '称号例如："手速大神"、"迟钝星人"、"连击终结者"、"星际捡漏王"、"莽夫"、"佛系玩家"、"时间管理大师"、"法术机关枪"、"乱甩技能大师"。' +
              '请根据模式和难度调整语气：简单模式可以调侃"小儿科"；极限生存/困难模式要惊叹或致敬；限时挑战强调效率；禅意模式轻松佛系；魔法手势师/无尽挑战要围绕施法准确率和法术克制来点评，通关要大力赞赏。' +
              '评价控制在 80 字以内，只输出一段中文。'
          },
          {
            role: 'user',
            content: userContent
          }
        ]
      })
    });
  } catch (error) {
    console.error('调用 DeepSeek API 网络错误:', error);
    return res.status(502).json({ feedback: 'AI裁判掉线了' });
  }

  // 步骤 2：处理 HTTP 错误状态码（401 Key 无效、400 模型不存在等）
  if (!response.ok) {
    let errText = '';
    try {
      errText = await response.text();
    } catch (e) {
      errText = '无法读取错误响应体';
    }
    console.error(`DeepSeek API 返回错误: ${response.status}`, errText);

    // 401 表示 API Key 未授权，给出更明确的提示
    if (response.status === 401) {
      return res.status(502).json({
        feedback: 'DeepSeek API Key 无效、过期或未开通权限，请检查 .env 中的 DEEPSEEK_KEY 是否正确'
      });
    }

    // 其他错误统一返回兜底文案，防止暴露过多细节给前端
    return res.status(502).json({ feedback: 'AI裁判掉线了' });
  }

  // 步骤 3：解析响应 JSON（单独 try/catch，防止返回非 JSON 导致崩溃）
  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error('解析 DeepSeek API 响应失败:', error);
    return res.status(502).json({ feedback: 'AI裁判掉线了' });
  }

  // 步骤 4：提取反馈文本
  const feedback = data.choices?.[0]?.message?.content || 'AI裁判掉线了';
  return res.status(200).json({ feedback });
}

// 本地开发用 /api/feedback；Netlify 部署后前端改用 /.netlify/functions/feedback
app.post('/api/feedback', handleFeedback);
app.post('/.netlify/functions/feedback', handleFeedback);

// 兜底路由：未匹配到的路径都返回 index.html（兼容前端路由）
// Express 5+ 中裸通配符 * 不再合法，需要写成 /*splat
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 本地开发服务器已启动: http://localhost:${PORT}`);

  const apiKey = process.env.DEEPSEEK_KEY;
  if (apiKey) {
    // 脱敏显示 Key 的前 4 位和后 4 位，方便用户确认是否加载正确
    const masked = apiKey.length > 8
      ? `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
      : '****';
    console.log(`✅ 已读取 DEEPSEEK_KEY: ${masked}（长度 ${apiKey.length}）`);
  } else {
    console.warn('❌ 未读取到 DEEPSEEK_KEY，请在 .env 文件中配置');
  }
});
