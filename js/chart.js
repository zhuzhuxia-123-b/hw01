import { rgbToHex } from './utils.js';

let chartInstance = null;
let lastCentroids = [];
let lastCounts = [];

export function initChart(dom) {
    if (!chartInstance) {
        chartInstance = echarts.init(dom, 'dark');
        window.addEventListener('resize', () => chartInstance && chartInstance.resize());
    }
    return chartInstance;
}

export function renderChart(state) {
    const { centroids, counts, chartType } = state;
    if (!centroids || centroids.length === 0 || counts.length === 0) {
        if (chartInstance) chartInstance.clear();
        lastCentroids = [];
        lastCounts = [];
        return;
    }

    lastCentroids = centroids;
    lastCounts = counts;

    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const data = centroids.map((c, i) => ({
        name: `簇 ${i+1}`,
        value: counts[i] || 0,
        itemStyle: { color: rgbToHex(c[0], c[1], c[2]) }
    }));

    const tooltipFormatter = (params) => {
        if (!params || params.dataIndex === undefined || params.dataIndex >= lastCentroids.length) {
            return '数据加载中...';
        }
        const idx = params.dataIndex;
        const c = lastCentroids[idx];
        if (!c) return '颜色数据不可用';
        const hex = rgbToHex(c[0], c[1], c[2]);
        const rgb = `${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}`;
        const value = params.value || 0;
        const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
        return `
            <div style="font-weight:600;font-size:14px;margin-bottom:6px;">${params.name}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${hex};"></span>
                <span style="font-family:monospace;font-size:13px;">${hex}</span>
            </div>
            <div style="font-size:12px;color:#94a3b8;">RGB: ${rgb}</div>
            <div style="font-size:12px;color:#94a3b8;">像素: ${value.toLocaleString()}</div>
            <div style="font-size:12px;color:#94a3b8;font-weight:600;">占比: ${percent}%</div>
        `;
    };

    let option = {
        tooltip: {
            trigger: 'item',
            formatter: tooltipFormatter,
            backgroundColor: 'rgba(15,23,42,0.9)',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            padding: [12, 16],
            textStyle: { color: '#e2e8f0', fontSize: 13 }
        },
        legend: {
            orient: 'vertical',
            right: 20,
            top: 'center',
            textStyle: { color: '#94a3b8' },
            itemWidth: 14,
            itemHeight: 14,
            formatter: (name) => {
                const idx = data.findIndex(d => d.name === name);
                if (idx === -1) return name;
                const pct = total > 0 ? ((counts[idx] / total) * 100).toFixed(1) : 0;
                return `${name}  ${pct}%`;
            }
        },
        series: []
    };

    if (chartType === 'bar') {
        option.xAxis = [{
            type: 'category',
            data: data.map(d => d.name),
            axisLabel: { color: '#94a3b8' },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
            splitLine: { show: false }
        }];
        option.yAxis = [{
            type: 'value',
            axisLabel: { color: '#94a3b8' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }
        }];
        option.grid = { left: '8%', right: '8%', bottom: '10%', top: '10%' };
        option.series = [{
            type: 'bar',
            data: data,
            barWidth: '45%',
            label: { 
                show: true, 
                position: 'top', 
                color: '#94a3b8', 
                fontSize: 11,
                formatter: (p) => p.value.toLocaleString()
            }
        }];
    } else if (chartType === 'pie') {
        option.series = [{
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['50%', '55%'],
            data: data,
            label: { 
                color: '#94a3b8', 
                formatter: (p) => `${p.name}\n${(p.percent || 0).toFixed(1)}%`
            },
            labelLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } }
        }];
    } else if (chartType === 'rose') {
        option.series = [{
            type: 'pie',
            radius: ['20%', '75%'],
            center: ['50%', '55%'],
            roseType: 'area',
            data: data,
            label: { 
                color: '#94a3b8', 
                formatter: (p) => `${p.name}\n${(p.percent || 0).toFixed(1)}%`
            },
            labelLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } }
        }];
    }

    chartInstance.setOption(option, true);
    chartInstance.resize();
}

export function getChartInstance() {
    return chartInstance;
}