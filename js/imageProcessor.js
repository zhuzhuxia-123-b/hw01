import { CONFIG } from './config.js';
import { rgbToLab, labToRgb } from './colorSpace.js';

// ===============================
// 图片尺寸限制（新增）
// ===============================
export function getResizedDimensions(img, maxSize = 1600) {
    let width = img.width;
    let height = img.height;

    if (width <= maxSize && height <= maxSize) {
        return { width, height, scaled: false };
    }

    const scale = Math.min(maxSize / width, maxSize / height);
    return {
        width: Math.floor(width * scale),
        height: Math.floor(height * scale),
        scaled: true
    };
}

// ===============================
// Canvas提取RGB像素（保留原逻辑，增加透明过滤）
// ===============================
export function extractPixelsFromCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const pixels = [];

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        // 过滤透明像素
        if (a < 128) continue;
        pixels.push([r, g, b]);
    }

    return pixels;
}

// ===============================
// 从图片元素提取像素（主入口，含缩放）
// ===============================
export function extractPixels(img) {
    const { width, height } = getResizedDimensions(img, CONFIG.MAX_IMAGE_DIMENSION || 1600);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const pixels = extractPixelsFromCanvas(canvas);

    return {
        pixels,
        width,
        height,
        originalWidth: img.width,
        originalHeight: img.height
    };
}

// ===============================
// 像素采样（新增）
// ===============================
export function samplePixels(pixels, maxSamples = 8000) {
    if (pixels.length <= maxSamples) {
        return pixels.slice();
    }

    const result = [];
    const step = pixels.length / maxSamples;

    for (let i = 0; i < maxSamples; i++) {
        const idx = Math.floor(i * step);
        result.push(pixels[idx]);
    }

    return result;
}

// 颜色空间转换
export function convertColorSpace(pixels, target) {
    if (target === 'rgb') return pixels.map(p => [...p]);
    if (target === 'lab') return pixels.map(([r, g, b]) => rgbToLab(r, g, b));
    return pixels;
}


// 中心点转回RGB
export function centersToRGB(centers, space) {
    if (space === 'rgb') return centers.map(c => c.map(v => Math.round(v)));
    if (space === 'lab') return centers.map(([l, a, b]) => labToRgb(l, a, b));
    return centers;
}