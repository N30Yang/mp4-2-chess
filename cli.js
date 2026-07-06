import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    RESOLUTIONS, DEFAULT_RESOLUTION,
    PRESETS, DEFAULT_PRESET, PIECE_CODES,
    GRID_PRESETS, DEFAULT_GRID, MAX_GRID, buildBrightnessLUT,
} from './constants.js';
import { probe, resolvePiecesDir, chooseCodec, H264_MAX_DIMENSION, PRORES_CONFORMANT_MAX, REALISTIC_MAX_DIMENSION } from './ffmpeg.js'; // NEW: +chooseCodec +dimension consts
import { precomputeTiles } from './tiles.js';
import { runPipeline } from './pipeline.js';
import { runStripePipeline } from './pipeline.js';
import { select, prompt, findMp4s } from './tui.js';

const scriptDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

function parseArgs(argv) {
    const opts = {
        input: null,
        output: null,
        resolution: DEFAULT_RESOLUTION,
        preset: DEFAULT_PRESET,
        grid: DEFAULT_GRID,
        audio: true,
        interactive: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case '--input': opts.input = argv[++i]; break;
            case '--output': opts.output = argv[++i]; break;
            case '--resolution': opts.resolution = argv[++i]; break;
            case '--preset': opts.preset = argv[++i]; break;
            case '--grid': opts.grid = argv[++i]; break;
            case '--no_audio': opts.audio = false; break;
            case '-i':
            case '--interactive': opts.interactive = true; break;
            case '-h':
            case '--help': opts.help = true; break;
            default:
                throw new Error(`Unknown argument: ${a}`);
        }
    }
    return opts;
}

function usage() {
    return [
        'chess-mosiac - convert an MP4 into a chess-piece mosiac video',
        '',
        'Usage: node cli.js --input <path> [options]',
        '',
        'auto codec selection',
        '--input <path>       Input Video (required obviously)',
        '--output <path>      Output of the chess mosiac defaults to downloads/<input>_chess.mp4',
        '--resolution <r>     low|medium|high|4k cell size (default high)',
        '--preset <name>      brown|green|blue|gray colors (default chess.com brown)',
        '--grid <g>           normal|detailed|fine|ultra OR a number (cols, default normal)',
        '--no_audio           Muting the original audio track',
        '-i, --interactive    Arrow-key menu mode (auto when --input omitted)',
        '-h, --help           Show this help',
        '',
        'Interactive mode scans this folder for mp4 files and writes to ~/downloads'
    ].join('\n');
}

function resolveGrid(value) {
    if (value in GRID_PRESETS) return GRID_PRESETS[value];
    const n = Number(value);
    if (!Number.isInteger(n) || n < 2 || n > MAX_GRID) {
        throw new Error(
            `bad --grid "${value}" (use ${Object.keys(GRID_PRESETS).join('|')} or an integer 2-${MAX_GRID})`,
        );
    }
    return n;
}

function outputDir() {
    const dir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function fmtBytes(bytes) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    return `${(bytes / 1e6).toFixed(0)} MB`;
}

function calcProResStats(outW, outH, fps = 30) {
    const PRORES_BITS_PER_PIXEL = 3.6;
    const bitsPerSec = outW * outH * fps * PRORES_BITS_PER_PIXEL;
    const mbPerSec = bitsPerSec / 8 / 1_000_000;

    const ramPerFrameBytes = outW * outH * 3;
    const ramPerFrameMB = ramPerFrameBytes / 1_000_000;

    const rawGiB = ramPerFrameBytes / 1_073_741_824;
    let recommendedRamGB;
    if (rawGiB < 0.5) recommendedRamGB = 8;
    else if (rawGiB < 1) recommendedRamGB = 16;
    else if (rawGiB < 2) recommendedRamGB = 32;
    else if (rawGiB < 4) recommendedRamGB = 64;
    else recommendedRamGB = 128;

    const vramBytes = outW * outH * 8;
    const vramGiB = vramBytes / 1_073_741_824;
    let recommendedVramGB;
    if (vramGiB < 0.25) recommendedVramGB = 4;
    else if (vramGiB < 0.5) recommendedVramGB = 8;
    else if (vramGiB < 1) recommendedVramGB = 12;
    else if (vramGiB < 2) recommendedVramGB = 16;
    else if (vramGiB < 4) recommendedVramGB = 24;
    else if (vramGiB < 8) recommendedVramGB = 40;
    else recommendedVramGB = 80;

    const mpx = (outW * outH) / 1_000_000;
    let recommendedCpu;
    if (mpx < 10) recommendedCpu = { cores: 8, example: 'e.g. Ryzen 5 5600X / i7-12700' };
    else if (mpx < 25) recommendedCpu = { cores: 12, example: 'e.g. Ryzen 9 5900X / i7-13700K' };
    else if (mpx < 50) recommendedCpu = { cores: 16, example: 'e.g. Ryzen 9 7950X / i9-13900K' };
    else if (mpx < 100) recommendedCpu = { cores: 24, example: 'e.g. Threadripper 3960X / EPYC 7302' };
    else if (mpx < 250) recommendedCpu = { cores: 32, example: 'e.g. Threadripper PRO 5955WX / EPYC 7453' };
    else recommendedCpu = { cores: 64, example: 'e.g. Threadripper PRO 7985WX / EPYC 9554' };

    return { mbPerSec, ramPerFrameMB, recommendedRamGB, recommendedVramGB, recommendedCpu };
}

async function showProResWarning(outW, outH, fps = 30, isEstimate = false) {
    const { mbPerSec, ramPerFrameMB, recommendedRamGB, recommendedVramGB, recommendedCpu } = calcProResStats(outW, outH, fps);
    const dimLabel = isEstimate ? `~${outW}×${outH} (estimated)` : `${outW}×${outH}`;
    const line = '─'.repeat(62);

    process.stderr.write('\n');
    process.stderr.write(YELLOW(BOLD(`  ⚠  ProRes 422 HQ — High Resource Warning\n`)));
    process.stderr.write(YELLOW(`  ${line}\n`));
    process.stderr.write(YELLOW(`  Output resolution : ${BOLD(dimLabel)}\n`));
    process.stderr.write(YELLOW(`  Codec             : ProRes 422 HQ (.mov)\n`));
    process.stderr.write(YELLOW(`    (H.264 limit of ${H264_MAX_DIMENSION}px exceeded on at least one axis)\n`));

    // Conformance / usability tier (added this session)
    const unusable = outW > REALISTIC_MAX_DIMENSION || outH > REALISTIC_MAX_DIMENSION;
    const overConformant = outW > PRORES_CONFORMANT_MAX || outH > PRORES_CONFORMANT_MAX;
    const megapixels = (outW * outH) / 1_000_000;

    if (unusable) {
        const bothAxes = outW > REALISTIC_MAX_DIMENSION && outH > REALISTIC_MAX_DIMENSION;
        process.stderr.write(RED(`  ${line}\n`));
        process.stderr.write(RED(BOLD(`  ⛔  THEORETICALLY POSSIBLE , REALISTICALLY UNUSABLE\n`)));
        process.stderr.write(RED(`    • ${dimLabel} exceeds ~${REALISTIC_MAX_DIMENSION}px on ${bothAxes ? 'both axes' : 'one axis'}.\n`));
        process.stderr.write(RED(`    • ffmpeg will write the file, but the ProRes bitstream is\n`));
        process.stderr.write(RED(`      non-conformant — QuickTime, hardware decoders, and every\n`));
        process.stderr.write(RED(`      mainstream player will refuse to open it.\n`));
        process.stderr.write(RED(`    • No AV1/HEVC/H.264 encoder can hold this frame either: AV1's\n`));
        process.stderr.write(RED(`      top level caps ~35.7 MP; this frame is ~${megapixels.toFixed(0)} MP.\n`));
        process.stderr.write(RED(BOLD(`    • To get a playable file: lower --grid or --resolution until\n`)));
        process.stderr.write(RED(BOLD(`      both axes are ≤ ${PRORES_CONFORMANT_MAX}px, or render tiled.\n`)));
    } else if (overConformant) {
        process.stderr.write(YELLOW(`  ${line}\n`));
        process.stderr.write(YELLOW(BOLD(`  ⚠  Beyond Apple's validated 8K (${PRORES_CONFORMANT_MAX}px)\n`)));
        process.stderr.write(YELLOW(`    • Plays in ffmpeg-based players (VLC, mpv), but QuickTime and\n`));
        process.stderr.write(YELLOW(`      hardware decoders may refuse it.\n`));
    }

    process.stderr.write(YELLOW(`  ${line}\n`));
    process.stderr.write(YELLOW(`  ${BOLD('Estimated file size')}\n`));
    process.stderr.write(YELLOW(`    • ~${mbPerSec.toFixed(0)} MB per second of video\n`));
    process.stderr.write(YELLOW(`    • A 1-minute clip will be ~${fmtBytes(mbPerSec * 60 * 1_000_000)}\n`));
    process.stderr.write(YELLOW(`    • A 10-minute clip will be ~${fmtBytes(mbPerSec * 600 * 1_000_000)}\n`));
    process.stderr.write(YELLOW(`  ${line}\n`));
    process.stderr.write(YELLOW(`  ${BOLD('System requirements')}\n`));
    process.stderr.write(YELLOW(`    • RAM  : At least ${BOLD(recommendedRamGB + ' GB')} free RAM recommended\n`));
    process.stderr.write(YELLOW(`             (single raw frame ≈ ${fmtBytes(ramPerFrameMB * 1_000_000)})\n`));
    process.stderr.write(YELLOW(`    • CPU  : ${BOLD(recommendedCpu.cores + '+ cores')} minimum recommended\n`));
    process.stderr.write(YELLOW(`             ${DIM(recommendedCpu.example)}\n`));
    process.stderr.write(YELLOW(`             (ProRes is entirely CPU-encoded, no GPU acceleration)\n`));
    process.stderr.write(YELLOW(`    • GPU  : A dedicated GPU (${BOLD(recommendedVramGB + ' GB+ VRAM')}) is strongly advised\n`));
    process.stderr.write(YELLOW(`             for tile rendering at this resolution\n`));
    if (mbPerSec > 13_000) {
        process.stderr.write(RED(BOLD(`    • Disk : ⛔ ${mbPerSec.toFixed(0)} MB/s — EXCEEDS ALL SINGLE-DRIVE LIMITS\n`)));
        process.stderr.write(RED(`             PCIe 5.0 NVMe tops out at ~13,000 MB/s. This resolution\n`));
        process.stderr.write(RED(`             requires an NVMe RAID array or a RAM disk (tmpfs).\n`));
        process.stderr.write(RED(`             Rendering at this scale is not practical on consumer hardware.\n`));
    } else if (mbPerSec > 7_000) {
        process.stderr.write(YELLOW(`    • Disk : ${BOLD(mbPerSec.toFixed(0) + ' MB/s')} — requires PCIe 5.0 NVMe\n`));
        process.stderr.write(YELLOW(`             ${DIM('e.g. Samsung 990 Pro, WD Black SN850X (gen5)')}\n`));
    } else if (mbPerSec > 3_500) {
        process.stderr.write(YELLOW(`    • Disk : ${BOLD(mbPerSec.toFixed(0) + ' MB/s')} — requires PCIe 4.0 NVMe\n`));
        process.stderr.write(YELLOW(`             ${DIM('e.g. Samsung 980 Pro, WD Black SN850X')}\n`));
    } else if (mbPerSec > 550) {
        process.stderr.write(YELLOW(`    • Disk : ${BOLD(mbPerSec.toFixed(0) + ' MB/s')} — requires PCIe 3.0 NVMe\n`));
        process.stderr.write(YELLOW(`             ${DIM('e.g. Samsung 970 EVO Plus, WD Blue SN570')}\n`));
    } else {
        process.stderr.write(YELLOW(`    • Disk : ${BOLD(mbPerSec.toFixed(0) + ' MB/s')} — any modern SATA SSD or NVMe\n`));
    }
    process.stderr.write(YELLOW(`  ${line}\n`));
    process.stderr.write('\n');

    if (process.stdin.isTTY) {
        const confirmed = await select(
            YELLOW(BOLD('Do you understand these requirements and wish to continue?')),
            [
                { label: '✅  I understand — continue with ProRes render', value: true },
                { label: '❌  Cancel', value: false },
            ],
        );
        if (!confirmed) throw new Error('cancelled');
    } else {
        process.stderr.write(
            YELLOW('  (Running non-interactively , proceeding automatically. Ctrl+C to abort.)\n\n'),
        );
    }
}

async function runInteractive(opts) {
    const root = process.cwd();
    const mp4s = findMp4s(root);
    if (mp4s.length === 0) {
        throw new Error(`no .mp4 files found under ${root}`);
    }

    opts.input = await select('Select input video (↑/↓, Enter):',
        mp4s.map((f) => ({ label: path.relative(root, f) || f, value: f })));

    opts.resolution = await select('Resolution (tile pixel size):', [
        ...Object.keys(RESOLUTIONS).map((r) => ({
            label: `${r} (cell ${RESOLUTIONS[r]}px)${r === '4k' ? ' may trigger ProRes and problems' : ''}`,
            value: r,
        })),
    ]);

    const gridChoice = await select('Grid size (number of piece columns, more = finer):', [
        ...Object.keys(GRID_PRESETS).map((g) => ({
            label: `${g} (${GRID_PRESETS[g]} cols)${g === 'ultra' ? 'BEEFY COMPUTER RECOMENDED!' : ''}`,
            value: g,
        })),
        { label: 'custom...', value: '__custom__' },
    ]);

    if (gridChoice === '__custom__') {
        while (true) {
            const raw = await prompt(`  Enter columns (2-${MAX_GRID}): `);
            try { resolveGrid(raw); opts.grid = raw; break; }
            catch (e) { console.log(`   ${e.message}`); }
        }
    } else {
        opts.grid = gridChoice;
    }

    const cell = RESOLUTIONS[opts.resolution];
    const gridW = resolveGrid(opts.grid);
    const estOutW = gridW * cell;
    const estOutH = Math.round(estOutW * 9 / 16);
    const codecInfo = chooseCodec(estOutW, estOutH);

    if (codecInfo.codec === 'prores') {
        await showProResWarning(estOutW, estOutH, 30, true);
    } else if (estOutW > H264_MAX_DIMENSION * 0.75) {
        process.stderr.write(YELLOW(
            `\n NOTE: esitmated output width ~${estOutW}px is approaching the H.264 limit (${H264_MAX_DIMENSION}px). \n\n`,
        ));
    }

    opts.preset = await select('Color preset:',
        Object.keys(PRESETS).map((p) => ({ label: `${p}  ${PRESETS[p][0]} / ${PRESETS[p][1]}`, value: p })));

    opts.audio = await select('Audio:', [
        { label: 'Include original audio', value: true },
        { label: 'No Audio', value: false },
    ]);

    const base = path.basename(opts.input, path.extname(opts.input));
    opts.output = opts.output || path.join(outputDir(), `${base}_chess${codecInfo.ext}`);
    return opts;
}

async function waitForExitOnWindows() {
    if (process.platform === 'win32') {
        console.log('\nPress Enter to exit...');
        process.stdin.resume();
        await new Promise(resolve => process.stdin.once('data', () => resolve()));
    }
}

async function main() {
    let opts;
    try {
        opts = parseArgs(process.argv.slice(2));
    } catch (e) {
        console.error(e.message);
        console.error('\n' + usage());
        return 2;
    }

    if (opts.help) {
        console.log(usage());
        return 0;
    }

    if (opts.interactive || !opts.input) {
        if (!process.stdin.isTTY) {
            console.error('Error: --input is required (no tty for interactive mode) \n');
            console.error(usage());
            return 2;
        }
        try {
            await runInteractive(opts);
        } catch (e) {
            console.error(`\n${e.message === 'cancelled' ? 'Cancelled.' : 'Error:' + e.message}`);
            return e.message === 'cancelled' ? 130 : 1;
        }
    }

    const cell = RESOLUTIONS[opts.resolution];
    if (!cell) {
        console.error(`Error: unknown resolution "${opts.resolution}" (use ${Object.keys(RESOLUTIONS).join('|')})`);
        return 2;
    }

    const colors = PRESETS[opts.preset];
    if (!colors) {
        console.error(`Error: unknown preset "${opts.preset}" (use ${Object.keys(PRESETS).join('|')})`);
        return 2;
    }

    let gridW;
    try {
        gridW = resolveGrid(opts.grid);
    } catch (e) {
        console.error(`Error: ${e.message}`);
        return 2;
    }


    try {
        const meta = await probe(opts.input);
        const gridH = Math.max(1, Math.round(gridW * meta.height / meta.width));
        const outW = gridW * cell;
        const outH = gridH * cell;

        const codecInfo = chooseCodec(outW, outH);

        if (codecInfo.codec === 'prores') {
            try {
                await showProResWarning(outW, outH, meta.fps, false);
            } catch (e) {
                if (e.message === 'cancelled') {
                    console.log('Cancelled.');
                    return 130;
                }
                throw e;
            }
        }

        const base = path.basename(opts.input, path.extname(opts.input));
        const output = opts.output || path.join(outputDir(), `${base}_chess${codecInfo.ext}`);

        console.log(`Input   ${meta.width}x${meta.height} @ ${meta.fps.toFixed(3)}fps, ${meta.frames || '?'} frames`);
        console.log(`Grid ${gridW}x${gridH}, cell ${cell}px -> output ${outW}x${outH}`);
        console.log(`Codec ${codecInfo.label}`);
        console.log(`Output ${output}`);
        console.log(`Precomputing tiles...`);

        const piecesDir = resolvePiecesDir(path.join(scriptDir, 'pieces'), PIECE_CODES);
        const tiles = await precomputeTiles(piecesDir, cell, colors);
        const lut = buildBrightnessLUT();

        const pipelineOpts = {
            input: opts.input,
            output,
            cell,
            gridW,
            gridH,
            fps: meta.fps,
            totalFrames: meta.frames,
            tiles,
            lut,
            withAudio: opts.audio,
            onProgress: (n, total) => process.stdout.write(`\rFrame ${n} / ${total || '?'}   `),
        };

        const frames = codecInfo.codec === 'prores'
            ? await runStripePipeline(pipelineOpts)
            : await runPipeline(pipelineOpts);
        console.log(`Done. Rendered ${frames} frames -> ${output}`);
        return 0;
    } catch (e) {
        console.error(RED(`Error: ${e.message}`));
        return 1;
    }
}

main()
    .then(async (code) => {
        await waitForExitOnWindows();
        process.exit(code);
    })
    .catch(async (e) => {
        console.error(RED(`Fatal: ${e.message}`));
        await waitForExitOnWindows();
        process.exit(1);
    });
