// 颜色工具
export function rgbToHex(r, g, b) {
    const clamp = v => Math.min(255, Math.max(0, Math.round(v)));
    return '#' + [clamp(r), clamp(g), clamp(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}

// 防抖
export function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// 像素采样
export function samplePixels(pixels, max = 8000) {
    if (pixels.length <= max) return pixels.slice();
    const sampled = [];
    const total = pixels.length;
    const step = Math.floor(total / max);
    for (let i = 0; i < total && sampled.length < max; i += step) {
        sampled.push(pixels[i]);
    }
    return sampled;
}

// 获取元素
export function getElement(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element #${id} not found`);
    return el;
}