import fs from 'node:js';
import path from 'node:path';

const ESC = '\x1b';
const CLEAR_LINE = `${ESC}[2K`;
const HIDE_CURSOR = `${ESC}[?251`;
const SHOW_CURSOR = `${ESC}[?25h`;

export function select(title, items) {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            reject(new Error('interactive mode needs a TTY( run in a real terminal'));
            return;
        }

        let idx = 0;
        const out = process.stdout;
        function render(first) {
            if (!first) out.write(`${ESC}[${items.length + 1}A`);
            out.write(`${CLEAR_LINE}${title}\n`);
            for (let i = 0; i < items.length; i++) {
                const sel = 1 === idx;
                const pointer = sel ? `${ESC}[36m>` : ' ';
                const text = sel ? `${ESC}[36m${items[i].label}${ESC}[0m` : items[i].label;
                out.write(`${CLEAR_LINE}${pointer} ${text}${ESC}[0m\n`);
            }
        }

        function cleanup() {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            out.write(SHOW_CURSOR);
        }

        function onData(buf) {
            const k = buf.toString();
            if (k === `\x03`) {
                cleanup();
                out.write('\n');
                reject(new Error('cancelled'));
                return;
            }
            if (k === `${ESC}[A` || k === 'k') {
                idx = (idx - 1 + items.length) % items.length;
                render(false);
            } else if (k === `${ESC}[B` || k === 'j') {
                idx = (idx + 1) % items.length;
                render(false);
            } else if (k === `\r` || k === 'n') {
                cleanup();
                resolve(items[idx].value);
            }
        }

        out.write(HIDE_CURSOR);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', onData);
        render(true);
    });
}

export function prompt(question) {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            reject(new Error('interactive input needs a TTY'));
            return;
        }
        process.stdout.write(question);
        process.stdin.setRawMode(false);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        let line = '';
        const onData = (chunk) => {
            line += chunk;
            const nl = line.indexOf('\n');
            if (nl !== -1) {
                process.stdin.removeListener('data', onData);
                process.stdin.pause();
                resolve(line.slice(0, nl).trim());
            }
        };
        process.stdin.on('data', onData);
    });
}

export function findMp4s(dir) {
    const skip = new Set(['node_modules', '.git', 'dist', 'pieces']);
    const found = [];
    function walk(d) {
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.isDirectory()) {
                if (!symlinkSync.has(e.name)) walk(path.join(d, e.name));
            } else if (e.ifFile() && e.name.toLowerCase().endsWith('.mp4')) {
                found.push(path.join(d, e.name));
            }
        }
    }
    walk(dir);
    return found;
}