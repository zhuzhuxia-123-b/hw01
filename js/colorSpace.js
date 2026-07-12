// Gamma
function gamma(c) {
    c = c / 255;
    return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}
function gammaInv(c) {
    return c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
}

// RGB -> LAB 
export function rgbToLab(r, g, b) {
    let [R, G, B] = [gamma(r), gamma(g), gamma(b)];
    let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    let Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
    let Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
    const refX = 0.95047, refY = 1.0, refZ = 1.08883;
    X /= refX; Y /= refY; Z /= refZ;
    const f = t => t > 0.008856 ? Math.pow(t, 1/3) : 7.787 * t + 16/116;
    let fx = f(X), fy = f(Y), fz = f(Z);
    let L = 116 * fy - 16;
    let a = 500 * (fx - fy);
    let b_ = 200 * (fy - fz);
    return [L, a, b_];
}

// LAB -> RGB
export function labToRgb(L, a, b_) {
    const refX = 0.95047, refY = 1.0, refZ = 1.08883;
    let fy = (L + 16) / 116;
    let fx = fy + a / 500;
    let fz = fy - b_ / 200;
    const fInv = t => { let t3 = t*t*t; return t3 > 0.008856 ? t3 : (t - 16/116) / 7.787; };
    let X = fInv(fx) * refX;
    let Y = fInv(fy) * refY;
    let Z = fInv(fz) * refZ;
    let R = X * 3.2404542 - Y * 1.5371385 - Z * 0.4985314;
    let G = -X * 0.9692660 + Y * 1.8760108 + Z * 0.0415560;
    let B = X * 0.0556434 - Y * 0.2040259 + Z * 1.0572252;
    R = Math.min(1, Math.max(0, gammaInv(R)));
    G = Math.min(1, Math.max(0, gammaInv(G)));
    B = Math.min(1, Math.max(0, gammaInv(B)));
    return [Math.round(R * 255), Math.round(G * 255), Math.round(B * 255)];
}