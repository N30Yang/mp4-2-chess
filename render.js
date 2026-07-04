export function renderStripe(grayFrame, tiles, lut, cell, gridW, gridH, startGridRow, numGridRows, outBuf) { // NEW: +startGridRow, +numGridRows
    const outW = gridW * cell;
    const outRowBytes = outW * 3;
    const tileRowBytes = cell * 3;

    const endGridRow = Math.min(startGridRow + numGridRows, gridH);

    for (let row = startGridRow; row < endGridRow; row++) {

        const localRow = row - startGridRow;

        for (let col = 0; col < gridW; col++) {
            const brightness = grayFrame[row * gridW + col];
            const code = lut[brightness];
            const parity = (col + row) & 1;
            const tile = tiles[code][parity];

            const baseX = col * cell;
            const baseY = localRow * cell;

            for (let ty = 0; ty < cell; ty++) {
                const srcStart = ty * tileRowBytes;
                const dstStart = (baseY + ty) * outRowBytes + baseX * 3;
                tile.copy(outBuf, dstStart, srcStart, srcStart + tileRowBytes);
            }
        }
    }

    return outBuf;
}

export function calcStripes(outW, cell, gridH, maxBytes = 1.5 * 1024 * 1024 * 1024) {
    const bytesPergridRow = outW * cell * 3;

    const maxGridRowsPerStripe = Math.max(1, Math.floor(maxBytes / bytesPerGridRow));

    const stripes = [];
    let row = 0;
    while (row < gridH) {
        const numRows = Math.min(maxGridRowsPerStripe, gridH - row);
        stripes.push({
            startRow: row,
            numrows,
            bufBytes: outW * numRows * cell * 3,
        });
        row += numRows;
    }
    return stripes;
}





/* Old legacy renderer, new one Uses strips so high resolutions work, also better peroforamnce for multicore
export function renderFrame(grayFrame, tiles, lut, cell, gridW, gridH, outBuf) {
    const outW = gridW * cell;
    const outRowBytes = outW * 3;
    const tileRowBytes = cell * 3;

    for (let row = 0; row < gridH; row++) {
        for (let col = 0; col < gridW; col++) {
            const brightness = grayFrame[row * gridW + col];
            const code = lut[brightness];
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
*/
