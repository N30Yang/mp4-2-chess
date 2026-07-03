import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const TMP_DIR = path.join(os.tmpdir(), 'chess-mosiac');
function extractFile(srcPath, subdir) {
    const destdir = path.join(TMP_DIR, subdir);
    fs.mkdirSync(destdir, { recursive: true });
    const dest = path.join(destdir, path.basename(srcPath));
    let need = true;
    try {
        const s = fs.statSync(dest);
        const src = fs.statSync(srcPath);
        need = s.size !== src.size;
    } catch { need = true; }
    if (need) {
        fs.writeFileSync(dest, fs.readFileSync(srcPath));
    }
    return dest;
}

function resolveBinary(srcPath, subdir) {
    if (!srcPath) throw new Error('static binary path missing?? (how) did you even install it?');
    if (!process.pkg) return srcPath;
    const dest = extractFile(srcPath, subdir);
    fs.chmodSync(dest, 0o755);
    return dest;
}

const FFMPEG = resolveBinary(ffmpegStatic, 'bin');
const FFPROBE = resolveBinary(ffprobeStatic.path, 'bin');

export function resolvePiecesDir(bundledDir, pieceCodes) {
    if (!process.pkg) return bundledDir;
    const destDir = path.join(TMP_DIR, 'pieces');
    fs.mkdirSync(destDir, { recursive: true });
    for (const code of pieceCodes) {
        const src = path.join(bundledDir, `${code}.png`)
        const dest = path.join(destDir, `${code}.png`);
        try {
            if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
                fs.writeFileSync(dest, fs.readFileSync(src));
            }
        } catch (e) {
            throw new Error(`failed to extract piece ${code}.png: ${e.message}`);
        }
    }
    return destDir;
}

export function probe(input) {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,r_frame_rate, nb_frames,avg_frame_rate,duration',
            '-of', 'json',
            input,
        ];
        const proc = spawn(FFPROBE, args);
        let out = '';
        let err = '';
        proc.stdout.on('data', (d) => (out += d));
        proc.stderr.on('data', (d) => (err += d));
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffprobe exited ${code}: ${err.trim()}`));
                return;
            }
            let json;
            try {
                json = JSON.parse(out);
            } catch (e) {
                reject(new Error(`ffprobe JSON parse fails: ${e.message}`));
                return;
            }
            const s = (json.streams && json.streams[0]) || {};
            const width = Number(s.width);
            const height = Number(s.height);

            const fps = parseRate(s.r_frame_rate) || parseRate(s.avg_frame_rate) || 30;

            let frames = Number(s.nb_frames);
            if (!Number.isFinite(frames) || frames <= 0) {
                const dur = Number(s.duration);
                frames = Number.isFinite(dur) ? Math.round(dur * fps) : 0;
            }

            if (!Number.isFinite(width) || !Number.isFinite(height)) {
                reject(new Error('ffprobe could not determine input dimensions'));
                return;
            }
            resolve({ width, height, fps, frames });
        });
    });
}

function parseRate(r) {
    if (!r || typeof r !== 'string') return 0;
    const [num, den] = r.split('/').map(Number);
    if (!den) return num || 0;
    return num / den;
}

export function spawnDecode(input, gridW, gridH) {
    const args = [
        '-i', input,
        '-vf', `scale=${gridW}:${gridH}`,
        '-f', 'rawvideo',
        '-pix_fmt', 'gray',
        'pipe:1',
    ];
    return spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

export function spawnEncode({ output, width, height, fps, input, withAudio }) {
    const args = [
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24',
        '-s', `${width}x${height}`,
        '-r', String(fps),
        '-i', 'pipe:0',
    ];

    if (withAudio) {
        args.push(
            '-i', input,
            '-map', '0:v:0',
            '-map', '1:a:0?'
        );
    }

    args.push(
        '-c:v', 'libx264',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
    );

    if (withAudio) {
        args.push('-c:a', 'aac', '-b:a', '192k', '-shortest')
    }

    args.push('-y', output);

    return spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
}