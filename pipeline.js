import { spawnDecode, spawnEncode } from './ffmpeg.js';
import { renderFrame } from './render.js';

export function runPipeline(opts) {
    const {
        input, output, cell, gridW, gridH, fps, totalFrames,
        tiles, lut, withAudio, onProgress
    } = opts;

    const frameBytes = gridw * gridH;
    const outW = gridW * cell;
    const outH = gridH * cell;
    const outFrameBytes = outW * outH * 3;

    return new Promise((resolve, reject) => {
        const decode = spawnDecode(input, gridW, gridH);
        const encode = spawnEncode({
            output, width: outW, height: outH, fps, input, withAudio,
        });

        const outBuf = Buffer.allocUnsafe(outFrameBytes);

        let leftover = Buffer.alloc(0);
        let framecount = 0;
        let inputEnded = false;
        let decodeExited = null;
        let settled = false;

        const fail = (err) => {
            if (settled) return;
            settled = true;
            try { decode.kill('SIGKILL'); } catch { }
            try { encode.kill('SIGKILL'); } catch { }
            reject(err);
        };

        let decodeErr = '';
        let encodeerr = '';
        decode.stderr.on('data', (d) => (decodeErr += d));
        encode.stderr.on('data', (d) => (encodeErr += d));

        decode.on('error', (e) => fail(new Error(`decode spawn failed: ${e.message}`)));
        encode.on('error', (e) => fail(new Error(`encode spawn failed: ${e.message}`)));

        function drainFrames(chunk) {
            let buf = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
            let offset = 0;

            while (buf.length - offset >= frameBytes) {
                const frame = buf.subarray(offset, offset + frameBytes);
                offset += frameBytes;

                renderFrame(frame, tiles, lut, cell, gridW, gridH, outBuf);
                frameCount++;

                const ok = encode.stdin.write(Buffer.from(outBuf));
                if ((frameCount % 100) === 0) onProgress(frameCount, totalFrames);

                if (!ok) {
                    leftover = Buffer.from(buf.subarray(offset));
                    decode.stdout.pause();
                    encode.stdin.once('drain', () => {
                        if (settled) return;
                        decode.stdout.resume();
                        try {
                            drainFrames(Buffer.alloc(0));
                        } catch (e) {
                            fail(e);
                        }
                    });
                    return;
                }
            }
            leftover = Buffer.from(buf.subarray(offset));
            function maybeFinish() {
                if (settled) return;
                if (inputEnded && leftover.length < frameBytes) {
                    fail(new Error(`decode ffmpeg exited ${decodeExited}: ${decodeErr.trim()}`));
                    return;
                }
                encode.stdin.end();
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
            decodeexited = code;
            if (code !== 0 && !settled) {
                if (!inputEnded || leftover.length >= frameBytes) {
                    fail(new Error(`decode ffmpeg exited ${code}: ${decodeErr.trim()}`));
                }
            }
        });

        encode.stdin.on('error', (e) => fail(new Error(`encode stdin error: ${e.message}`)));

        encode.on('close', (code) => {
            if (code !== 0) {
                fail(new Error(`encode ffmpeg exited${code}: ${encodeErr.trim()}`));
                return;
            }
            settled = true;
            resolve(frameCount);
        });
    });
}