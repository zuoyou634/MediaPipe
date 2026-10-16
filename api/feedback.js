/**
 * api/feedback.js
 * Vercel Serverless Function
 * 游戏结束时由前端调用，后端使用环境变量中的 DEEPSEEK_API_KEY 请求 DeepSeek API，
 * 根据模式、难度和游戏数据生成夸张幽默的中文评价，避免前端暴露密钥。
 */

module.exports = async (req, res) => {
  // 仅允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ feedback: '仅支持 POST 请求' });
  }

  const { score, maxCombo, survivalTimeMs, livesLost, deathReason, mode, difficulty } = req.body || {};
  if (typeof score !== 'number') {
    return res.status(400).json({ feedback: '请求体中缺少有效的 score 字段' });
  }

  // 从环境变量读取 DeepSeek API Key
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ feedback: '服务器未配置 DEEPSEEK_API_KEY 环境变量' });
  }

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
    survival: '极限生存'
  };
  const diffLabelMap = {
    easy: '简单',
    medium: '中等',
    hard: '困难'
  };
  const modeLabel = modeLabelMap[modeName] || modeName;
  const diffLabel = diffLabelMap[diffName] || diffName;

  // 步骤 1：发起网络请求
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
              '称号例如："手速大神"、"迟钝星人"、"连击终结者"、"星际捡漏王"、"莽夫"、"佛系玩家"、"时间管理大师"。' +
              '请根据模式和难度调整语气：简单模式可以调侃"小儿科"；极限生存/困难模式要惊叹或致敬；限时挑战强调效率；禅意模式轻松佛系。' +
              '评价控制在 80 字以内，只输出一段中文。'
          },
          {
            role: 'user',
            content: `玩家数据：模式 ${modeLabel}，难度 ${diffLabel}，得分 ${score}，最高连击 ${combo}，存活 ${survivalSeconds} 秒，失去生命 ${lost} 次，死因：${reason}。请生成一段带称号的幽默点评。`
          }
        ]
      })
    });
  } catch (error) {
    console.error('调用 DeepSeek API 网络错误:', error);
    return res.status(502).json({ feedback: 'AI裁判掉线了' });
  }

  // 步骤 2：处理 HTTP 错误状态码
  if (!response.ok) {
    let errText = '';
    try {
      errText = await response.text();
    } catch (e) {
      errText = '无法读取错误响应体';
    }
    console.error(`DeepSeek API 返回错误: ${response.status}`, errText);

    if (response.status === 401) {
      return res.status(502).json({
        feedback: 'DeepSeek API Key 无效、过期或未开通权限，请检查 .env 中的 DEEPSEEK_API_KEY 是否正确'
      });
    }

    return res.status(502).json({ feedback: 'AI裁判掉线了' });
  }

  // 步骤 3：解析响应 JSON
  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error('解析 DeepSeek API 响应失败:', error);
    return res.status(502).json({ feedback: 'AI裁判掉线了' });
  }

  const feedback = data.choices?.[0]?.message?.content || 'AI裁判掉线了';
  return res.status(200).json({ feedback });
};
