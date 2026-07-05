import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnDecode, spawnEncodeStripe, spawnVstack } from './ffmpeg.js';
import { renderStripe, calcStripes } from './render.js';

function makeTempdir() {
    const dir = path.join(os.tmpdir(), `chess-stripes-${Date.now()}-${process.pid}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function cleanupTempDir(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function encodeStripePromise(proc, label) {
    return new Promise((resolve, reject) => {
        let stderr = '';
        proc.stderr.on('data', (d) => (stderr += d));
        proc.on('error', (e) => reject(new Error(`${label} spawn failed: ${e.message}`)));
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`${label} exited ${code}: ${stderr.trim()}`));
            } else {
                resolve();
            }
        });
    });
}


export function runStripePipeline(opts) {
    const {
        input,
        output,
        cell,
        gridW,
        gridH,
        fps,
        totalFrames,
        tiles,
        lut,
        withAudio,
        onProgress,
    } = opts;

    const outW = gridW * cell;
    const frameBytes = gridW * gridH;

    const stripes = calcStripes(outW, cell, gridH);
    const numStripes = stripes.length;

    return new Promise((resolve, reject) => {
        const tmpDir = makeTempdir();

        const stripeBufs = stripes.map((s) => Buffer.allocUnsafe(s.bufBytes));
        const stripeFiles = stripes.map((_, i) => path.join(tmpDir, `stripe_${i}.mov`));
        const encoders = stripes.map((s, i) =>
            spawnEncodeStripe({
                output: stripeFiles[i],
                width: outW,
                height: s.numRows * cell,
                fps,
            }),
        );

        const encodeErrors = encoders.map((enc, i) => {
            let buf = '';
            enc.stderr.on('data', (d) => (buf += d));
            return { buf: () => buf };
        });

        const encodeFinished = encoders.map((enc, i) =>
            encodeStripePromise(enc, `stripe-encoder-${i}`),
        );

        const decode = spawnDecode(input, gridW, gridH);

        let leftover = Buffer.alloc(0);
        let frameCount = 0;
        let inputEnded = false;
        let decodeExited = null;
        let settled = false;

        const fail = (err) => {
            if (settled) return;
            settled = true;
            try { decode.kill('SIGKILL'); } catch { }
            for (const enc of encoders) {
                try { enc.kill('SIGKILL'); } catch { }
            }
            cleanupTempDir(tmpDir);
            reject(err);
        };

        let decodeErr = '';
        decode.stderr.on('data', (d) => (decodeErr += d));
        decode.on('error', (e) => fail(new Error(`decode spawn failed; ${e.message}`)));

        function processFrame(frame) {
            for (let i = 0; i < numStripes; i++) {
                const s = stripes[i];
                renderStripe(frame, tiles, lut, cell, gridW, gridH, s.startRow, s.numRows, stripeBufs[i]);
                const ok = encoders[i].stdin.write(Buffer.from(stripeBufs[i]));
                if (!ok) {
                    return false;
                }
            }
            return true;
        }

        function drainFrames(chunk) {
            let buf = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
            let offset = 0;

            while (buf.length - offset >= frameBytes) {
                const frame = buf.subarray(offset, offset + frameBytes);
                offset += frameBytes;

                const ok = processFrame(frame);
                frameCount++;

                if (frameCount % 100 === 0) onProgress(frameCount, totalFrames);

                if (!ok) {
                    leftover = Buffer.from(buf.subarray(offset));
                    decode.stdout.pause();

                    const drainPromises = encoders.map((enc) =>
                        new Promise((res) => enc.stdin.once('drain', res)),
                    );
                    Promise.all(drainPromises).then(() => {
                        if (settled) return;
                        decode.stdout.resume();
                        try { drainFrames(Buffer.alloc(0)); }
                        catch (e) { fail(e); }
                    });
                    return;
                }
            }
            leftover = Buffer.from(buf.subarray(offset));
            maybeFinish();
        }

        function maybeFinish() {
            if (settled) return;
            if (inputEnded && leftover.length < frameBytes) {
                if (decodeExited !== null && decodeExited !== 0) {
                    fail(new Error(`decode ffmpeg exited ${decodeExited}: ${decodeErr.trim()}`));
                    return;
                }
                for (const enc of encoders) {
                    enc.stdin.end();
                }
            }
        }

        decode.stdout.on('data', (chunk) => {
            if (settled) return;
            try {
                drainFrames(chunk);
            } catch (e) {
                fail(e);
            }
        });

        decode.stdout.on('end', () => {
            inputEnded = true;
            maybeFinish();
        });

        decode.on('close', (code) => {
            decodeExited = code;
            if (code !== 0 && !settled) {
                if (!inputEnded || leftover.length >= frameBytes) {
                    fail(new Error(`decode ffmpeg exited ${code}: ${decodeErr.trim()}`));
                }
            }
        });
        Promise.all(encodeFinished)
            .then(() => {
                console.log(`\nAll ${numStripes} stripe(s) encoded. Stacking into final output...`);
                const vstackProc = spawnVstack({
                    stripeFiles,
                    output,
                    fps,
                    input,
                    withAudio,
                });
                let vstackErr = '';
                vstackProc.stderr.on('data', (d) => (vstackErr += d));
                vstackProc.on('error', (e) =>
                    fail(new Error(`vstack spawn failed: ${e.message}`)),
                );
                vstackProc.on('close', (code) => {
                    cleanupTempDir(tmpDir);
                    if (settled) return;
                    if (code !== 0) {
                        fail(new Error(`vstack ffmpeg exited ${code}: ${vstackErr.trim()}`));
                        return;
                    }
                    settled = true;
                    resolve(frameCount);
                });
            })
            .catch((err) => fail(err));

        for (let i = 0; i < encoders.length; i++) {
            encoders[i].stdin.on('error', (e) =>
                fail(new Error(`stripe-encoder-${i} stdin error: ${e.message}`)),
            );
        }
    });
}