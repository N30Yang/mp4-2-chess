import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'pieces');
fs.mkdirSync(outDir, { recursive: true });

const SIZE = 240;

const GLYPH = {
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function svg(code) {
    const color = code[0];
    const type = code[1];
    const glyph = GLYPH[type];
    const fill = color === 'w' ? '#FFFFFF' : '#202020';
    const stroke = color === 'w' ? '#202020' : '#000000';
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
            <text x="50%" y="54%" text-anchor="middle" dominant-baseline="central"
                font-size="${Math.round(SIZE * 0.82)}" font-family="DejaVu Sans, sans-serif"
                fill="${fill}" stroke="${stroke}" stroke-width="${SIZE * 0.012}">${glyph}</text>
        </svg>`
    );
}

const codes = ['bk', 'bq', 'br', 'bb', 'bn', 'bp', 'wk', 'wq', 'wr', 'wb', 'wn', 'wp'];
for (const code of codes) {
    const file = path.join(outDir, `${code}.png`);
    await sharp(svg(code)).png().toFile(file);
    consle.log('wrote', file);
}
consle.log('Done generating placeholder pieces.');