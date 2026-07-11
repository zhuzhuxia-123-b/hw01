import { CONFIG } from './config.js';
import { debounce, getElement, rgbToHex } from './utils.js';
import { extractPixels, samplePixels, convertColorSpace, centersToRGB } from './imageProcessor.js';
import { kmeans } from './kmeans.js';
import { fetchHarmony } from './ai.js';
import { initChart, renderChart, getChartInstance } from './chart.js';
import { initVisualizer, drawOriginal, highlightCluster, resetHighlight } from './visualizer.js';

// ============================================================
// DOM引用
// ============================================================
const uploadArea = getElement('uploadArea');
const fileInput = getElement('fileInput');
const preview = getElement('preview');
const canvasVis = getElement('canvas');
const placeholder = getElement('placeholder');
const paletteEl = getElement('palette');
const chartDom = getElement('chart');
const kSlider = getElement('kSlider');
const kValue = getElement('kValue');
const chartBtns = document.querySelectorAll('.btn-chart');
const spaceBtns = document.querySelectorAll('.btn-space');
const aiBtn = getElement('aiBtn');
const aiResult = getElement('aiResult');
const apiKeyInput = getElement('apiKey');
const statSize = getElement('statSize');
const statPixels = getElement('statPixels');
const statK = getElement('statK');
const statSpace = getElement('statSpace');

const summaryCard = document.getElementById('summaryCard');
const summaryStatus = document.getElementById('summaryStatus');
const summarySize = document.getElementById('summarySize');
const summaryPixels = document.getElementById('summaryPixels');
const summaryK = document.getElementById('summaryK');
const summarySpace = document.getElementById('summarySpace');
const summaryColors = document.getElementById('summaryColors');

// ============================================================
// 状态
// ============================================================
const state = {
    pixels: [],
    width: 0,
    height: 0,
    originalWidth: 0,
    originalHeight: 0,
    totalPixels: 0,
    k: CONFIG.DEFAULT_K,
    space: 'rgb',
    chartType: CONFIG.DEFAULT_CHART_TYPE,
    centroids: [],
    counts: [],
    labels: [],
    imageElement: null,
    canvasData: null
};

// ============================================================
// 更新统计卡片
// ============================================================
function updateStats() {
    statK.textContent = state.k;
    statSpace.textContent = state.space.toUpperCase();
    if (state.originalWidth && state.originalHeight) {
        statSize.textContent = `${state.originalWidth} × ${state.originalHeight}`;
    }
    if (state.totalPixels > 0) {
        statPixels.textContent = state.totalPixels.toLocaleString();
    } else if (state.pixels.length > 0) {
        statPixels.textContent = state.pixels.length.toLocaleString();
    }
}

// ============================================================
// 更新分析摘要
// ============================================================
function updateSummary() {
    if (!state.centroids || state.centroids.length === 0) {
        summaryCard.style.display = 'none';
        return;
    }
    summaryCard.style.display = 'block';
    summaryStatus.textContent = '✅ 分析完成';
    summarySize.textContent = state.originalWidth && state.originalHeight
        ? `${state.originalWidth} × ${state.originalHeight}`
        : `${state.width} × ${state.height}`;
    summaryPixels.textContent = (state.totalPixels || state.pixels.length).toLocaleString();
    summaryK.textContent = state.k;
    summarySpace.textContent = state.space.toUpperCase();

    const total = state.counts.reduce((a, b) => a + b, 0) || 1;
    const sorted = state.centroids.map((c, i) => ({
        hex: rgbToHex(c[0], c[1], c[2]),
        pct: ((state.counts[i] / total) * 100)
    })).sort((a, b) => b.pct - a.pct);

    const topColors = sorted.slice(0, 3);
    summaryColors.innerHTML = topColors.map(item =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">
            <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${item.hex};"></span>
            ${item.hex} ${item.pct.toFixed(1)}%
        </span>`
    ).join('');
}

// ============================================================
// 渲染调色板（显示 HEX + RGB + 像素数量 + 占比）
// ============================================================
function renderPalette() {
    const { centroids, counts, totalPixels, pixels } = state;
    const total = totalPixels || pixels.length || 1;

    paletteEl.innerHTML = '';

    if (!centroids || centroids.length === 0) {
        paletteEl.innerHTML = '<span class="empty">上传图片后，色板将在此显示</span>';
        return;
    }

    centroids.forEach((color, index) => {
        const hex = rgbToHex(color[0], color[1], color[2]);
        const count = counts[index] || 0;
        const percent = ((count / total) * 100).toFixed(2);
        const rgb = `${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}`;

        const card = document.createElement('div');
        card.className = 'palette-item';
        card.innerHTML = `
            <div class="swatch" style="background:${hex};"></div>
            <div class="palette-info">
                <div class="palette-hex">${hex}</div>
                <div class="palette-rgb">RGB(${rgb})</div>
                <div class="palette-meta">${count.toLocaleString()} px · ${percent}%</div>
            </div>
        `;
        card.title = `${hex}  RGB(${rgb})  ${count.toLocaleString()} 像素  ${percent}%`;
        card.addEventListener('mouseenter', () => highlightCluster(index, state));
        card.addEventListener('mouseleave', () => resetHighlight(state));
        paletteEl.appendChild(card);
    });
}

// ============================================================
// 聚类执行（采样训练 + 全量统计 + 过滤空簇）
// ============================================================
async function runClustering() {
    const { pixels, k, space } = state;

    if (!pixels || pixels.length === 0) {
        console.warn('没有像素数据');
        return;
    }

    try {
        // ---- 第1步：采样训练 ----
        const trainingPixels = samplePixels(pixels, CONFIG.MAX_PIXELS_SAMPLE || 8000);
        const trainingData = convertColorSpace(trainingPixels, space);
        const result = kmeans(trainingData, k);

        // ---- 第2步：中心转回RGB ----
        let centers = centersToRGB(result.centroids, space);

        // ---- 第3步：全量像素重新分类，统计真实数量 ----
        const realCounts = new Array(centers.length).fill(0);

        for (let i = 0; i < pixels.length; i++) {
            const pixel = pixels[i];
            let minDist = Infinity;
            let label = 0;

            for (let j = 0; j < centers.length; j++) {
                const c = centers[j];
                const dist =
                    Math.pow(pixel[0] - c[0], 2) +
                    Math.pow(pixel[1] - c[1], 2) +
                    Math.pow(pixel[2] - c[2], 2);

                if (dist < minDist) {
                    minDist = dist;
                    label = j;
                }
            }
            realCounts[label]++;
        }

        // ---- 第4步：过滤空簇 ----
        const filteredCenters = [];
        const filteredCounts = [];

        for (let i = 0; i < centers.length; i++) {
            if (realCounts[i] > 0) {
                filteredCenters.push(centers[i]);
                filteredCounts.push(realCounts[i]);
            }
        }

        // ---- 第5步：更新状态 ----
        state.centroids = filteredCenters;
        state.counts = filteredCounts;
        state.totalPixels = pixels.length;

        // 生成labels（用于高亮）
        const labels = new Int32Array(pixels.length);
        for (let i = 0; i < pixels.length; i++) {
            const pixel = pixels[i];
            let minDist = Infinity;
            let label = 0;
            for (let j = 0; j < filteredCenters.length; j++) {
                const c = filteredCenters[j];
                const dist =
                    Math.pow(pixel[0] - c[0], 2) +
                    Math.pow(pixel[1] - c[1], 2) +
                    Math.pow(pixel[2] - c[2], 2);
                if (dist < minDist) {
                    minDist = dist;
                    label = j;
                }
            }
            labels[i] = label;
        }
        state.labels = labels;

        // ---- 第6步：更新UI ----
        renderPalette();
        renderChart(state);
        resetHighlight(state);
        updateStats();
        updateSummary();

        console.log('✅ 聚类完成 | K=', k, '颜色空间=', space, '有效簇=', filteredCenters.length, '总像素=', pixels.length);

    } catch (e) {
        console.error('聚类出错:', e);
        alert('聚类计算失败，请重试。');
    }
}

const debouncedRun = debounce(runClustering, 300);

// ============================================================
// 图片处理
// ============================================================
async function processImage(file) {
    if (!file) return;

    try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });

        const { pixels, width, height, originalWidth, originalHeight } = extractPixels(img);

        state.pixels = pixels;
        state.width = width;
        state.height = height;
        state.originalWidth = originalWidth || img.width;
        state.originalHeight = originalHeight || img.height;
        state.totalPixels = pixels.length;
        state.imageElement = img;

        preview.src = url;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        canvasVis.style.display = 'block';

        initVisualizer(canvasVis);
        drawOriginal(img, state);
        updateStats();

        await runClustering();
        aiResult.textContent = '💡 点击按钮获取 AI 色彩评价';

    } catch (e) {
        console.error('图片处理失败:', e);
        alert('图片加载失败，请检查文件。');
    }
}

// ============================================================
// 事件绑定
// ============================================================
uploadArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) {
        processImage(e.target.files[0]);
        fileInput.value = '';
    }
});

kSlider.addEventListener('input', () => {
    const val = parseInt(kSlider.value);
    kValue.textContent = val;
    state.k = val;
    debouncedRun();
});

chartBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        chartBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.chartType = btn.dataset.type;
        renderChart(state);
    });
});

spaceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        spaceBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.space = btn.dataset.space;
        debouncedRun();
    });
});

// ---- AI 按钮 ----
aiBtn.addEventListener('click', async () => {
    const { centroids, counts } = state;

    if (!centroids || centroids.length === 0) {
        aiResult.textContent = '⚠️ 请先上传图片并完成聚类';
        return;
    }

    const key = apiKeyInput.value.trim();
    if (!key) {
        aiResult.textContent = '⚠️ 请输入 API Key';
        return;
    }

    aiBtn.disabled = true;
    aiBtn.textContent = '⏳ 分析中...';
    aiResult.innerHTML = '⏳ 正在调用大模型...';

    try {
        const res = await fetchHarmony(centroids, counts, key);
        const emoji = res.score >= 70 ? '✅' : '❌';

        aiResult.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:20px;">${emoji}</span>
                <span style="font-weight:700;font-size:16px;">评分: ${res.score}/100</span>
            </div>
            <div style="margin-bottom:4px;">💡 ${res.suggestion}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                <span style="color:#4ade80;">✓ ${res.strengths}</span>
                <span style="color:#f87171;margin-left:12px;">✗ ${res.weaknesses}</span>
                <span style="color:#60a5fa;margin-left:12px;">→ ${res.improvement}</span>
            </div>
        `;
    } catch (err) {
        aiResult.textContent = `❌ 错误: ${err.message}`;
    } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = '分析颜色和谐度';
    }
});

// ---- 图表悬停高亮 ----
setTimeout(() => {
    const chart = getChartInstance();
    if (chart) {
        chart.on('mouseover', p => {
            if (p.dataIndex !== undefined) highlightCluster(p.dataIndex, state);
        });
        chart.on('mouseout', () => resetHighlight(state));
    }
}, 500);

// ============================================================
// 初始化
// ============================================================
initChart(chartDom);
updateStats();
summaryCard.style.display = 'none';
console.log('🎨 ColorAI 已就绪！');