import { samplePixels } from './utils.js';
import { CONFIG } from './config.js';

// 欧氏距离
function euclidean(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return Math.sqrt(s);
}

// K-Means++ 初始化
function initCenters(data, k) {
    const centers = [];
    const dim = data[0].length;
    centers.push([...data[Math.floor(Math.random() * data.length)]]);
    for (let c = 1; c < k; c++) {
        const distSq = new Float64Array(data.length);
        let total = 0;
        for (let i = 0; i < data.length; i++) {
            let minD = Infinity;
            for (let j = 0; j < centers.length; j++) {
                let d = 0;
                for (let d_ = 0; d_ < dim; d_++) {
                    const diff = data[i][d_] - centers[j][d_];
                    d += diff * diff;
                }
                if (d < minD) minD = d;
            }
            distSq[i] = minD;
            total += minD;
        }
        if (total === 0) break;
        let r = Math.random() * total;
        let idx = 0;
        for (; idx < data.length; idx++) {
            r -= distSq[idx];
            if (r <= 0) break;
        }
        idx = Math.min(idx, data.length - 1);
        centers.push([...data[idx]]);
    }
    while (centers.length < k) {
        centers.push([...data[Math.floor(Math.random() * data.length)]]);
    }
    return centers;
}

// 对全量数据分配标签（用于聚类后重新映射）
export function assignFull(data, centers) {
    const assignments = new Int32Array(data.length);
    for (let i = 0; i < data.length; i++) {
        let best = 0, bestD = Infinity;
        for (let j = 0; j < centers.length; j++) {
            let d = 0;
            for (let d_ = 0; d_ < data[i].length; d_++) {
                const diff = data[i][d_] - centers[j][d_];
                d += diff * diff;
            }
            if (d < bestD) { bestD = d; best = j; }
        }
        assignments[i] = best;
    }
    return assignments;
}

// 主函数
export function kmeans(data, k, maxIter = 50) {
    if (data.length === 0 || k < 1) return { centroids: [], assignments: [] };
    const dim = data[0].length;
    const useSampled = data.length > CONFIG.MAX_PIXELS_SAMPLE;
    const working = useSampled ? samplePixels(data, CONFIG.MAX_PIXELS_SAMPLE) : data;

    let centers = initCenters(working, k);
    const assignments = new Int32Array(working.length);
    let changed = true, iter = 0;
    while (changed && iter < maxIter) {
        changed = false;
        for (let i = 0; i < working.length; i++) {
            let best = 0, bestD = Infinity;
            for (let j = 0; j < centers.length; j++) {
                let d = 0;
                for (let d_ = 0; d_ < dim; d_++) {
                    const diff = working[i][d_] - centers[j][d_];
                    d += diff * diff;
                }
                if (d < bestD) { bestD = d; best = j; }
            }
            if (assignments[i] !== best) { assignments[i] = best; changed = true; }
        }
        const sums = centers.map(() => new Float64Array(dim));
        const counts = new Int32Array(k);
        for (let i = 0; i < working.length; i++) {
            const c = assignments[i];
            for (let d_ = 0; d_ < dim; d_++) sums[c][d_] += working[i][d_];
            counts[c]++;
        }
        for (let j = 0; j < k; j++) {
            if (counts[j] > 0) {
                for (let d_ = 0; d_ < dim; d_++) centers[j][d_] = sums[j][d_] / counts[j];
            }
        }
        iter++;
    }

    // 对全量数据分配
    const finalAssignments = assignFull(data, centers);
    return { centroids: centers, assignments: finalAssignments };
}