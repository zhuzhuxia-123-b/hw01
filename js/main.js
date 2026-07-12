import { CONFIG } from './config.js';
import { debounce, getElement, rgbToHex } from './utils.js';
import { extractPixels, convertColorSpace, centersToRGB } from './imageProcessor.js';
import { kmeans } from './kmeans.js';
import { fetchHarmony } from './ai.js';
import { initChart, renderChart, getChartInstance } from './chart.js';
import { initVisualizer, drawOriginal, highlightCluster, resetHighlight } from './visualizer.js';

//DOM 引用
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
const paletteCount = document.getElementById('paletteCount');

// 状态
const state = {
    pixels: [],
    width: 0,
    height: 0,
    originalWidth: 0,
    originalHeight: 0,
    k: CONFIG.DEFAULT_K,
    space: 'rgb',
    chartType: CONFIG.DEFAULT_CHART_TYPE,
    centroids: [],
    counts: [],
    labels: [],
    imageElement: null,
    canvasData: null
};

// 更新统计卡片
function updateStats() {
    statK.textContent = state.k;
    statSpace.textContent = state.space.toUpperCase();
    if (state.originalWidth && state.originalHeight) {
        statSize.textContent = `${state.originalWidth} × ${state.originalHeight}`;
    }
    if (state.pixels.length > 0) {
        statPixels.textContent = state.pixels.length.toLocaleString();
    }
}

//更新分析摘要
function updateSummary() {
    if (!state.centroids || state.centroids.length === 0) {
        summaryCard.style.display = 'none';
        return;
    }
    summaryCard.style.display = 'block';
    summaryStatus.textContent = ' 分析完成';
    summarySize.textContent = state.originalWidth && state.originalHeight 
        ? `${state.originalWidth} × ${state.originalHeight}` 
        : `${state.width} × ${state.height}`;
    summaryPixels.textContent = state.pixels.length.toLocaleString();
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

//渲染调色板
function renderPalette() {
    const { centroids, counts } = state;
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    paletteEl.innerHTML = '';
    if (!centroids || centroids.length === 0) {
        paletteEl.innerHTML = '<span class="empty">上传图片后，色板将在此显示</span>';
        paletteCount.textContent = '0 种';
        return;
    }
    paletteCount.textContent = `${centroids.length} 种`;
    centroids.forEach((c, i) => {
        const hex = rgbToHex(c[0], c[1], c[2]);
        const pct = ((counts[i] / total) * 100).toFixed(1);
        const rgb = `${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}`;
        const count = counts[i] || 0;

        const div = document.createElement('div');
        div.className = 'palette-item';
        div.innerHTML = `
            <div class="swatch" style="background:${hex};"></div>
            <div class="palette-info">
                <div class="palette-hex">${hex}</div>
                <div class="palette-rgb">RGB(${rgb})</div>
                <div class="palette-meta">${count.toLocaleString()} px · ${pct}%</div>
            </div>
        `;
        div.title = `${hex}  RGB(${rgb})  ${count.toLocaleString()} 像素  ${pct}%`;

        //  绑定悬停高亮事件 
        div.addEventListener('mouseenter', () => {
            console.log(`悬停到色块 ${i+1}，执行高亮`);
            highlightCluster(i, state);
        });
        div.addEventListener('mouseleave', () => {
            console.log(`移出色块 ${i+1}，重置图片`);
            resetHighlight(state);
        });

        paletteEl.appendChild(div);
    });

    // 调试：输出第一个色块的事件绑定状态
    const firstItem = document.querySelector('.palette-item');
    if (firstItem) {
        console.log('✅ 色板渲染完成，第一个色块 mouseenter 事件已绑定');
        console.log('   → 使用控制台运行 document.querySelector(".palette-item").onmouseenter 可验证');
    }
}

// 聚类执行 
async function runClustering() {
    const { pixels, k, space } = state;
    if (!pixels || pixels.length === 0) {
        console.warn('没有像素数据');
        return;
    }
    try {
        const converted = convertColorSpace(pixels, space);
        const result = kmeans(converted, k);
        
        const rawCounts = new Array(k).fill(0);
        for (let i = 0; i < result.assignments.length; i++) {
            rawCounts[result.assignments[i]]++;
        }
        
        const nonEmpty = rawCounts
            .map((count, idx) => ({ count, centroid: result.centroids[idx], label: idx }))
            .filter(item => item.count > 0);
        
        if (nonEmpty.length === 0) {
            state.centroids = centersToRGB(result.centroids, space);
            state.counts = rawCounts;
            state.labels = result.assignments;
        } else {
            const rgbCentroids = centersToRGB(
                nonEmpty.map(item => item.centroid),
                space
            );
            state.centroids = rgbCentroids;
            state.counts = nonEmpty.map(item => item.count);
            const labelMap = new Map();
            nonEmpty.forEach((item, newIdx) => {
                labelMap.set(item.label, newIdx);
            });
            state.labels = result.assignments.map(oldLabel => {
                const mapped = labelMap.get(oldLabel);
                return mapped !== undefined ? mapped : 0;
            });
        }
        
        renderPalette();
        renderChart(state);
        resetHighlight(state);
        updateStats();
        updateSummary();
        console.log(`聚类完成 | K=${k} 颜色空间=${space} 有效簇=${state.centroids.length} 总像素=${state.pixels.length.toLocaleString()}`);
    } catch (e) {
        console.error('聚类出错:', e);
        alert('聚类计算失败，请重试。');
    }
}

const debouncedRun = debounce(runClustering, 300);

//图片处理
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
        state.imageElement = img;

        preview.src = url;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        canvasVis.style.display = 'block';

        initVisualizer(canvasVis);
        drawOriginal(img, state);
        updateStats();
        await runClustering();
        aiResult.textContent = ' 点击按钮获取 AI 色彩评价';
    } catch (e) {
        console.error('图片处理失败:', e);
        alert('图片加载失败，请检查文件。');
    }
}

// 事件绑定 
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

// AI 按钮
aiBtn.addEventListener('click', async () => {
    const { centroids, counts } = state;
    if (!centroids || centroids.length === 0) {
        aiResult.textContent = ' 请先上传图片并完成聚类';
        return;
    }
    const key = apiKeyInput.value.trim();
    if (!key) {
        aiResult.textContent = ' 请输入 API Key';
        return;
    }
    aiBtn.disabled = true;
    aiBtn.textContent = ' 分析中...';
    aiResult.innerHTML = ' 正在调用大模型...';
    try {
        const res = await fetchHarmony(centroids, counts, key);
        const emoji = res.score >= 70 ? '✅' : '❌';
        aiResult.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:20px;">${emoji}</span>
                <span style="font-weight:700;font-size:16px;">评分: ${res.score}/100</span>
            </div>
            <div style="margin-bottom:4px;"> ${res.suggestion}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                <span style="color:#4ade80;">✓ ${res.strengths}</span>
                <span style="color:#f87171;margin-left:12px;">✗ ${res.weaknesses}</span>
                <span style="color:#60a5fa;margin-left:12px;">→ ${res.improvement}</span>
            </div>
        `;
    } catch (err) {
        aiResult.textContent = ` 错误: ${err.message}`;
    } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = '分析和谐度';
    }
});

// 图表悬停高亮
setTimeout(() => {
    const chart = getChartInstance();
    if (chart) {
        chart.on('mouseover', p => {
            if (p.dataIndex !== undefined) highlightCluster(p.dataIndex, state);
        });
        chart.on('mouseout', () => resetHighlight(state));
    }
}, 500);

//初始化
initChart(chartDom);
updateStats();
summaryCard.style.display = 'none';
console.log(' ColorAI 已就绪！');