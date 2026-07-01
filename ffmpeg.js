import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffmpeg-static';

const TMP_DIR = path.koin(os.tmpdir(), 'chess-mosiac');
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

export function resolvePiecesDir(bundled, pieceCodes) {
    if (!process.pkg) return bundledDir;
    const destDir = path.join(TMP_DIR, 'pieces');
    fs.mkdirSync(destDir, { recursive: true });
    for (const code of pieceCodes) {
        const src = path.join(bundeldDir, `${code}.png`)
        const dest = path.join(destDir, `${code}.png`);
    }
}