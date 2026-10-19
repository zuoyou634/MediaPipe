/**
 * functions/api/feedback.js
 * Cloudflare Pages Function
 * 游戏结束时由前端调用，后端使用环境变量 DEEPSEEK_API_KEY 请求 DeepSeek API，
 * 根据模式、难度和游戏数据生成夸张幽默的中文评价，避免前端暴露密钥。
 *
 * 部署：Cloudflare Pages 会自动扫描 functions/ 目录，
 *       functions/api/feedback.js 部署后访问路径为 /api/feedback
 */

export async function onRequestPost(context) {
  // 通过 context.request.json() 获取前端传来的游戏数据
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return jsonResponse(400, { feedback: '请求体不是有效的 JSON' });
  }

  const { score, maxCombo, survivalTimeMs, livesLost, deathReason, mode, difficulty, victory, castAccuracy, totalCasts, correctCasts, levelReached } = body;
  if (typeof score !== 'number') {
    return jsonResponse(400, { feedback: '请求体中缺少有效的 score 字段' });
  }

  // 从 Cloudflare 环境变量读取 DeepSeek API Key
  const apiKey = context.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { feedback: '服务器未配置 DEEPSEEK_API_KEY 环境变量' });
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
    survival: '极限生存',
    magic: '魔法手势师',
    magicEndless: '魔法无尽挑战',
    wizard: '魔法手势师'
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
  if (modeName === 'magic' || modeName === 'magicEndless' || modeName === 'wizard') {
    const acc = typeof castAccuracy === 'number' ? castAccuracy : 0;
    const casts = typeof totalCasts === 'number' ? totalCasts : 0;
    const hits = typeof correctCasts === 'number' ? correctCasts : 0;
    userContent += `施法准确率 ${acc}%（${hits}/${casts} 次有效命中）`;
    if (modeName === 'magic' || modeName === 'wizard') {
      userContent += victory ? '，已通关。' : `，止步于第 ${levelReached} 关。`;
    }
    userContent += ' 请重点根据施法准确率点评：准确率高就夸"法术精准、指哪打哪"，低就调侃"乱甩技能、全靠缘分"。';
  }
  userContent += '请生成一段带称号的幽默点评。';

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
    return jsonResponse(502, { feedback: 'AI裁判掉线了' });
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
      return jsonResponse(502, {
        feedback: 'DeepSeek API Key 无效、过期或未开通权限，请检查环境变量 DEEPSEEK_API_KEY 是否正确'
      });
    }

    return jsonResponse(502, { feedback: 'AI裁判掉线了' });
  }

  // 步骤 3：解析响应 JSON
  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error('解析 DeepSeek API 响应失败:', error);
    return jsonResponse(502, { feedback: 'AI裁判掉线了' });
  }

  // 步骤 4：提取反馈文本
  const feedback = data.choices?.[0]?.message?.content || 'AI裁判掉线了';
  return jsonResponse(200, { feedback });
}

/** 统一构造 Cloudflare Pages Function 的响应格式 */
function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
