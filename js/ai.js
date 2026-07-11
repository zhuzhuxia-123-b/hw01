import { CONFIG } from './config.js';
import { rgbToHex } from './utils.js';

// 清洗 JSON（后备）
function cleanJsonString(str) {
    const first = str.indexOf('{');
    const last = str.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    let json = str.substring(first, last + 1);
    while (json.match(/\}\s*}$/)) {
        json = json.replace(/\}\s*}$/, '}');
    }
    try {
        return JSON.parse(json);
    } catch (e) {
        json = json.replace(/"\s*"([^"]*)"/g, '", "$1"');
        try {
            return JSON.parse(json);
        } catch (e2) {
            return null;
        }
    }
}

// 生成模拟结果（降级用）
function generateMock(centroids, counts) {
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const colorInfo = centroids.map((c, i) => {
        const hex = rgbToHex(c[0], c[1], c[2]);
        const pct = ((counts[i] / total) * 100).toFixed(1);
        return `${hex}（${pct}%）`;
    }).join('、');
    
    const count = centroids.length;
    const map = {
        2: { score: 78, suggestion: '双色搭配简洁有力，建议主次分明。', strengths: '对比明确，视觉冲击力强', weaknesses: '色彩层次较少', improvement: '可加入中间色过渡' },
        3: { score: 82, suggestion: '三色搭配均衡，整体和谐舒适。', strengths: '色彩层次丰富，视觉平衡好', weaknesses: '可能需要调整饱和度', improvement: '适当降低饱和度增加高级感' },
        4: { score: 75, suggestion: '四色组合丰富，注意控制饱和度。', strengths: '色彩变化丰富', weaknesses: '部分颜色可能冲突', improvement: '统一色调倾向' },
        5: { score: 70, suggestion: '多色搭配需注意色彩层次。', strengths: '色彩信息量大', weaknesses: '缺乏重点色', improvement: '减少颜色数量或突出主色' }
    };
    const result = map[count] || { 
        score: 72, 
        suggestion: `色彩搭配中等，可尝试调整明度。主要颜色：${colorInfo}`,
        strengths: '色彩覆盖全面',
        weaknesses: '缺少色彩焦点',
        improvement: '建议缩小色域范围'
    };
    return result;
}

export async function fetchHarmony(centroids, counts, apiKey) {
    if (!apiKey || apiKey.length < 10) {
        console.warn('API Key 无效，使用本地模拟');
        return generateMock(centroids, counts);
    }

    const total = counts.reduce((a, b) => a + b, 0) || 1;
    
    // 构建详细的颜色信息（包含 HEX、RGB、占比）
    const colorDetails = centroids.map((c, i) => {
        const hex = rgbToHex(c[0], c[1], c[2]);
        const pct = ((counts[i] / total) * 100).toFixed(1);
        const rgb = `${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}`;
        return `颜色${i+1}: ${hex} (RGB: ${rgb}) 占比 ${pct}%`;
    }).join('\n');

    const prompt = `请分析以下图片的 K-means 聚类颜色搭配和谐度。

${colorDetails}

请从以下维度评价：
1. 主色比例是否合理
2. 色彩冷暖关系
3. 对比度是否舒适
4. 整体视觉平衡

请严格按照以下 JSON 格式返回，不要输出任何其他内容：
{
    "score": 0-100的整数,
    "suggestion": "一句话总结建议",
    "strengths": "优点（20字以内）",
    "weaknesses": "缺点或风险（20字以内）",
    "improvement": "改进建议（20字以内）"
}`;

    try {
        const res = await fetch(CONFIG.API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: CONFIG.DEFAULT_MODEL,
                messages: [
                    { role: 'system', content: '你是专业的色彩搭配专家和UI设计师。请根据色彩理论给出客观评价，只返回JSON。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 200,
                response_format: { type: "json_object" }
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`API 错误 ${res.status}: ${errText}`);
        }

        const json = await res.json();
        const content = json.choices[0].message.content;
        console.log('AI 返回:', content);

        try {
            const parsed = JSON.parse(content);
            return {
                score: parsed.score || 70,
                suggestion: parsed.suggestion || '色彩搭配整体可接受。',
                strengths: parsed.strengths || '色彩层次丰富。',
                weaknesses: parsed.weaknesses || '需注意色彩平衡。',
                improvement: parsed.improvement || '建议微调饱和度。'
            };
        } catch (e) {
            const cleaned = cleanJsonString(content);
            if (cleaned) {
                console.warn('使用清洗后的 JSON:', cleaned);
                return {
                    score: cleaned.score || 70,
                    suggestion: cleaned.suggestion || '色彩搭配整体可接受。',
                    strengths: cleaned.strengths || '色彩层次丰富。',
                    weaknesses: cleaned.weaknesses || '需注意色彩平衡。',
                    improvement: cleaned.improvement || '建议微调饱和度。'
                };
            }
            throw new Error('JSON 解析失败');
        }
    } catch (err) {
        console.warn('API 调用失败，降级为模拟:', err.message);
        return generateMock(centroids, counts);
    }
}