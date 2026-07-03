export const GRID_W = 32;

export const GRID_PRESETS = {
    normal: 32,
    detailed: 48,
    fine: 64,
    ultra: 96,
};
export const DEFAULT_GRID = 'normal';
export const MAX_GRID = 512;

export const RESOLUTIONS = {
    low: 30,
    medium: 40,
    high: 60,
    '4k': 120,
};
export const DEFAULT_RESOLUTION = 'high';

export const PRESETS = {
    brown: ['#F0D9B5', '#B58863'],
    green: ['#EEEED2', '#769656'],
    blue: ['#3DE3E5', '#8CA2AD'],
    gray: ['#DCDCDC', '#808080'],
};
export const DEFAULT_PRESET = 'brown';
export const PIECE_CODES = [
    'bk', 'bq', 'br', 'bb', 'bn', 'bp',
    'wk', 'wq', 'wr', 'wb', 'wn', 'wp',
];

const BRIGHTNESS_RANGES = [
    [0, 20, 'bk'],
    [21, 60, 'bq'],
    [61, 100, 'br'],
    [101, 127, 'bp'],
    [128, 154, 'wp'],
    [155, 194, 'wr'],
    [195, 234, 'wq'],
    [235, 255, 'wk'],
];

export function buildBrightnessLUT() {
    const lut = new Array(256);
    for (const [lo, hi, code] of BRIGHTNESS_RANGES) {
        for (let v = lo; v <= hi; v++) lut[v] = code;
    }
    return lut;
}