let canvas = null;
let ctx = null;
let canvasData = null;

export function initVisualizer(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
}

export function drawOriginal(image, state) {
    if (!ctx) return;
    // 使用缩放后的尺寸（与 state.pixels 一致）
    const w = state.width || image.width;
    const h = state.height || image.height;
    canvas.width = w;
    canvas.height = h;
    // 缩放绘制图片到 canvas
    ctx.drawImage(image, 0, 0, w, h);
    canvasData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    state.canvasData = canvasData;
}

export function highlightCluster(label, state) {
    if (!ctx || !canvasData || !state.labels || state.labels.length === 0) return;
    const totalPixels = state.labels.length;
    const imgData = new ImageData(
        new Uint8ClampedArray(canvasData.data),
        canvasData.width,
        canvasData.height
    );
    const d = imgData.data;
    const canvasPixels = canvasData.width * canvasData.height;
    // 取 labels 和 canvas 像素数的较小值
    const limit = Math.min(totalPixels, canvasPixels);
    for (let i = 0; i < limit; i++) {
        const idx = i * 4;
        if (state.labels[i] !== label) {
            const gray = 0.299 * d[idx] + 0.587 * d[idx+1] + 0.114 * d[idx+2];
            d[idx] = gray;
            d[idx+1] = gray;
            d[idx+2] = gray;
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

export function resetHighlight(state) {
    if (ctx && state.canvasData) {
        ctx.putImageData(state.canvasData, 0, 0);
    }
}