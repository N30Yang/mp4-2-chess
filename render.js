export function renderFrame(grayFrame, tiles, lut, cell, gridW, gridH, outBuf) {
    const outW = gridW * cell;
    const outRowBytes = outW * 3;
    const tileRowBytes = cell * 3;

    for (let row = 0; row < gridH; row++) {
        for (let col = 0; col < gridW; col++) {
            const brightness = grayFrame[row * gridW + col];
            const parity = (col + row) & 1;
            const tile = tiles[code][parity];

            const baseX = col * cell;
            const baseY = row * cell;
            for (let ty = 0; ty < cell; ty++) {
                const srcStart = ty * tileRowBytes;
                const dstStart = (baseY + ty) * outRowBytes + baseX * 3;
                tile.copy(outBuf, dstStart, srcStart, srcStart + tileRowBytes);
            }
        }
    }
    return outBuf;
}