import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    RESOLUTIONS, DEFAULT_RESOLUTION,
    PRESETS, DEFAULT_PRESET, PIECE_CODES,
    GRID_PRESETS, DEFAULT_GRID, MAX_GRID, buildBrightnessLUT,
} from './constants.js';
import os from 'node:os';
import { probe, resolvePiecesDir } from './ffmpeg.js';
import { precomputeTiles } from './tiles.js';
import { runPipeline } from './pipeline.js';
import { select, prompt, findMp4s } from './tui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
        'Usage: chess-mosiac --input <path> [options]',
        '',
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


async function runInteractive(opts) {
    const root = process.cwd();
    const mp4s = findMp4s(root);
    if (mp4s.length === 0) {
        throw new Error(`no .mp4 files found under ${root}`);
    }

    opts.input = await select('Select input video (↑/↓, Enter):',
        mp4s.map((f) => ({ label: path.relative(root, f) || f, value: f })));

    opts.resolution = await select('Resolution (tile pixel size):',
        Object.keys(RESOLUTIONS).map((r) => ({ label: `${r} (cell ${RESOLUTIONS[r]}px)`, value: r })));

    const gridChoice = await select('Grid size (number of piece columns, more = finer):', [
        ...Object.keys(GRID_PRESETS).map((g) => ({ label: `${g} (${GRID_PRESETS[g]} cols)`, value: g })),
        { label: 'custom…', value: '__custom__' },
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

    opts.preset = await select('Color preset:',
        Object.keys(PRESETS).map((p) => ({ label: `${p}  ${PRESETS[p][0]} / ${PRESETS[p][1]}`, value: p })));

    opts.audio = await select('Audio:', [
        { label: 'Include original audio', value: true },
        { label: 'No Audio', value: false },
    ]);

    const base = path.basename(opts.input, path.extname(opts.input));
    opts.output = opts.output || path.join(outputDir(), `${base}_chess.mp4`);
    return opts;
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
        console.error(`Error: uknown preset "${opts.preset}" (use ${Object.keys(PRESETS).join('|')})`);
        return 2;
    }

    let gridW;
    try {
        gridW = resolveGrid(opts.grid);
    } catch (e) {
        console.error(`Error: ${e.message}`);
        return 2;
    }

    const output = opts.output ||
        path.join(downloadsDir(), `${path.basename(opts.input, path.extname(opts.input))}_chess.mp4`);

    try {
        const meta = await probe(opts.input);
        const gridH = Math.max(1, Math.round(gridW * meta.height / meta.width));

        console.log(`Input ${meta.width}x${meta.height} @ ${meta.fps.toFixed(3)}fps, ${meta.frames || '?'} frames`);
        console.log(`Grid ${gridW}x${gridH}, cell ${cell}px -> output ${gridW * cell}x${gridH * cell}`);
        console.log(`Precomputing tiles...`);

        const piecesDir = resolvePiecesDir(path.join(__dirname, 'pieces'), PIECE_CODES);
        const tiles = await precomputeTiles(piecesDir, cell, colors);
        const lut = buildBrightnessLUT();

        const frames = await runPipeline({
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
            onProgress: (n, total) => console.log(`Frame ${n} / ${total || '?'}`),
        });

        console.log(`Done. Rendered ${frames} frames -> ${output}`);
        return 0;
    } catch (e) {
        console.error(`Error: ${e.message}`);
        return 1;
    }
}

main().then((code) => process.exit(code));
