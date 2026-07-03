import path from 'node:path';
import sharp from 'sharp';
import { PIECE_CODES } from './constants.js';

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

async function makeTile(piecePng, cell, bgHex) {
    const bg = hexToRgb(bgHex);
    const piece = await sharp(piecePng)
        .resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    return sharp({
        create: {
            width: cell,
            height: cell,
            channels: 4,
            background: { r: bg.r, g: bg.g, b: bg.b, alpha: 1 },
        },
    })
        .composite([{ input: piece, gravity: 'centre' }])
        .removeAlpha()
        .raw()
        .toBuffer();
}

export async function precomputeTiles(piecesDir, cell, colors) {
    const [lightHex, darkHex] = colors;
    const tiles = {};

    for (const code of PIECE_CODES) {
        const pngPath = path.join(piecesDir, `${code}.png`);
        const [light, dark] = await Promise.all([
            makeTile(pngPath, cell, lightHex),
            makeTile(pngPath, cell, darkHex),
        ]);
        tiles[code] = [light, dark];
    }
    return tiles;
}