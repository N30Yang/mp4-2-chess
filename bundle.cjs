var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// cli.js
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");

// constants.js
var GRID_PRESETS = {
  normal: 32,
  detailed: 48,
  fine: 64,
  ultra: 96
};
var DEFAULT_GRID = "normal";
var MAX_GRID = 512;
var RESOLUTIONS = {
  low: 30,
  medium: 40,
  high: 60,
  "4k": 120
};
var DEFAULT_RESOLUTION = "high";
var PRESETS = {
  brown: ["#F0D9B5", "#B58863"],
  green: ["#EEEED2", "#769656"],
  blue: ["#3DE3E5", "#8CA2AD"],
  gray: ["#DCDCDC", "#808080"]
};
var DEFAULT_PRESET = "brown";
var PIECE_CODES = [
  "bk",
  "bq",
  "br",
  "bb",
  "bn",
  "bp",
  "wk",
  "wq",
  "wr",
  "wb",
  "wn",
  "wp"
];
var BRIGHTNESS_RANGES = [
  [0, 20, "bk"],
  [21, 60, "bq"],
  [61, 100, "br"],
  [101, 127, "bp"],
  [128, 154, "wp"],
  [155, 194, "wr"],
  [195, 234, "wq"],
  [235, 255, "wk"]
];
function buildBrightnessLUT() {
  const lut = new Array(256);
  for (const [lo, hi, code] of BRIGHTNESS_RANGES) {
    for (let v = lo; v <= hi; v++) lut[v] = code;
  }
  return lut;
}

// ffmpeg.js
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_child_process = require("node:child_process");
var import_ffmpeg_static = __toESM(require("ffmpeg-static"), 1);
var import_ffprobe_static = __toESM(require("ffprobe-static"), 1);
var H264_MAX_DIMENSION = 8192;
var PRORES_CONFORMANT_MAX = 8192;
var REALISTIC_MAX_DIMENSION = 16384;
var TMP_DIR = import_node_path.default.join(import_node_os.default.tmpdir(), "chess-mosiac");
function extractFile(srcPath, subdir) {
  const destdir = import_node_path.default.join(TMP_DIR, subdir);
  import_node_fs.default.mkdirSync(destdir, { recursive: true });
  const dest = import_node_path.default.join(destdir, import_node_path.default.basename(srcPath));
  let need = true;
  try {
    const s = import_node_fs.default.statSync(dest);
    const src = import_node_fs.default.statSync(srcPath);
    need = s.size !== src.size;
  } catch {
    need = true;
  }
  if (need) {
    import_node_fs.default.writeFileSync(dest, import_node_fs.default.readFileSync(srcPath));
  }
  return dest;
}
function resolveBinary(srcPath, subdir) {
  if (!srcPath) throw new Error("static binary path missing?? (how) did you even install it?");
  if (!process.pkg) return srcPath;
  const dest = extractFile(srcPath, subdir);
  import_node_fs.default.chmodSync(dest, 493);
  return dest;
}
var FFMPEG = resolveBinary(import_ffmpeg_static.default, "bin");
var FFPROBE = resolveBinary(import_ffprobe_static.default.path, "bin");
function resolvePiecesDir(bundledDir, pieceCodes) {
  if (!process.pkg) return bundledDir;
  const destDir = import_node_path.default.join(TMP_DIR, "pieces");
  import_node_fs.default.mkdirSync(destDir, { recursive: true });
  for (const code of pieceCodes) {
    const src = import_node_path.default.join(bundledDir, `${code}.png`);
    const dest = import_node_path.default.join(destDir, `${code}.png`);
    try {
      if (!import_node_fs.default.existsSync(dest) || import_node_fs.default.statSync(dest).size !== import_node_fs.default.statSync(src).size) {
        import_node_fs.default.writeFileSync(dest, import_node_fs.default.readFileSync(src));
      }
    } catch (e) {
      throw new Error(`failed to extract piece ${code}.png: ${e.message}`);
    }
  }
  return destDir;
}
function probe(input) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,r_frame_rate,nb_frames,avg_frame_rate,duration",
      "-of",
      "json",
      input
    ];
    const proc = (0, import_node_child_process.spawn)(FFPROBE, args);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => out += d);
    proc.stderr.on("data", (d) => err += d);
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${err.trim()}`));
        return;
      }
      let json;
      try {
        json = JSON.parse(out);
      } catch (e) {
        reject(new Error(`ffprobe JSON parse failed: ${e.message}`));
        return;
      }
      const s = json.streams && json.streams[0] || {};
      const width = Number(s.width);
      const height = Number(s.height);
      const fps = parseRate(s.r_frame_rate) || parseRate(s.avg_frame_rate) || 30;
      let frames = Number(s.nb_frames);
      if (!Number.isFinite(frames) || frames <= 0) {
        const dur = Number(s.duration);
        frames = Number.isFinite(dur) ? Math.round(dur * fps) : 0;
      }
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        reject(new Error("ffprobe could not determine input dimensions"));
        return;
      }
      resolve({ width, height, fps, frames });
    });
  });
}
function parseRate(r) {
  if (!r || typeof r !== "string") return 0;
  const [num, den] = r.split("/").map(Number);
  if (!den) return num || 0;
  return num / den;
}
function spawnDecode(input, gridW, gridH) {
  const args = [
    "-i",
    input,
    "-vf",
    `scale=${gridW}:${gridH}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "pipe:1"
  ];
  return (0, import_node_child_process.spawn)(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
}
function chooseCodec(width, height) {
  if (width > H264_MAX_DIMENSION || height > H264_MAX_DIMENSION) {
    return { codec: "prores", ext: ".mov", label: "ProRes 422 (HQ)" };
  }
  return { codec: "h264", ext: ".mp4", label: "H.264 (mp4)" };
}
function spawnEncode({ output, width, height, fps, input, withAudio }) {
  const { codec } = chooseCodec(width, height);
  const args = [
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "pipe:0"
  ];
  if (withAudio) {
    args.push(
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0?"
    );
  }
  if (codec === "h264") {
    args.push(
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p"
    );
  } else {
    args.push(
      "-c:v",
      "prores_ks",
      "-profile:v",
      "3",
      "-vendor",
      "apl0",
      "-pix_fmt",
      "yuv422p10le"
    );
  }
  if (withAudio) {
    args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  }
  args.push("-y", output);
  return (0, import_node_child_process.spawn)(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
}
function spawnEncodeStripe({ output, width, height, fps }) {
  const args = [
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "pipe:0",
    "-c:v",
    "prores_ks",
    "-profile:v",
    "3",
    "-vendor",
    "ap10",
    "-pix_fmt",
    "yuv422p10le",
    "-an",
    "-y",
    output
  ];
  return (0, import_node_child_process.spawn)(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
}
function spawnVstack({ stripeFiles, output, fps, input, withAudio }) {
  const n = stripeFiles.length;
  const args = [];
  for (const f of stripeFiles) {
    args.push("-i", f);
  }
  if (withAudio) {
    args.push("-i", input);
  }
  const vstackInputs = Array.from({ length: n }, (_, i) => `[${i}:v]`).join("");
  let filterComplex = `${vstackInputs}vstack=inputs=${n}[vout]`;
  args.push("-filter_complex", filterComplex);
  args.push("-map", "[vout]");
  if (withAudio) {
    args.push("-map", `${n}:a:0?`);
    args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  }
  args.push(
    "-c:v",
    "prores_ks",
    "-profile:v",
    "3",
    "-vendor",
    "apl0",
    "-pix_fmt",
    "yuv422p10le",
    "-r",
    String(fps)
  );
  args.push("-y", output);
  return (0, import_node_child_process.spawn)(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
}

// tiles.js
var import_node_path2 = __toESM(require("node:path"), 1);
var import_sharp = __toESM(require("sharp"), 1);
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}
async function makeTile(piecePng, cell, bgHex) {
  const bg = hexToRgb(bgHex);
  const piece = await (0, import_sharp.default)(piecePng).resize(cell, cell, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return (0, import_sharp.default)({
    create: {
      width: cell,
      height: cell,
      channels: 4,
      background: { r: bg.r, g: bg.g, b: bg.b, alpha: 1 }
    }
  }).composite([{ input: piece, gravity: "centre" }]).removeAlpha().raw().toBuffer();
}
async function precomputeTiles(piecesDir, cell, colors) {
  const [lightHex, darkHex] = colors;
  const tiles = {};
  for (const code of PIECE_CODES) {
    const pngPath = import_node_path2.default.join(piecesDir, `${code}.png`);
    const [light, dark] = await Promise.all([
      makeTile(pngPath, cell, lightHex),
      makeTile(pngPath, cell, darkHex)
    ]);
    tiles[code] = [light, dark];
  }
  return tiles;
}

// pipeline.js
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);

// render.js
function renderStripe(grayFrame, tiles, lut, cell, gridW, gridH, startGridRow, numGridRows, outBuf) {
  const outW = gridW * cell;
  const outRowBytes = outW * 3;
  const tileRowBytes = cell * 3;
  const endGridRow = Math.min(startGridRow + numGridRows, gridH);
  for (let row = startGridRow; row < endGridRow; row++) {
    const localRow = row - startGridRow;
    for (let col = 0; col < gridW; col++) {
      const brightness = grayFrame[row * gridW + col];
      const code = lut[brightness];
      const parity = col + row & 1;
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
function calcStripes(outW, cell, gridH, maxBytes = 1.5 * 1024 * 1024 * 1024) {
  const bytesPerGridRow = outW * cell * 3;
  const maxGridRowsPerStripe = Math.max(1, Math.floor(maxBytes / bytesPerGridRow));
  const stripes = [];
  let row = 0;
  while (row < gridH) {
    const numRows = Math.min(maxGridRowsPerStripe, gridH - row);
    stripes.push({
      startRow: row,
      numRows,
      bufBytes: outW * numRows * cell * 3
    });
    row += numRows;
  }
  return stripes;
}

// pipeline.js
function makeTempdir() {
  const dir = import_node_path3.default.join(import_node_os2.default.tmpdir(), `chess-stripes-${Date.now()}-${process.pid}`);
  import_node_fs2.default.mkdirSync(dir, { recursive: true });
  return dir;
}
function cleanupTempDir(dir) {
  try {
    import_node_fs2.default.rmSync(dir, { recursive: true, force: true });
  } catch {
  }
}
function encodeStripePromise(proc, label) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    proc.stderr.on("data", (d) => stderr += d);
    proc.on("error", (e) => reject(new Error(`${label} spawn failed: ${e.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} exited ${code}: ${stderr.trim()}`));
      } else {
        resolve();
      }
    });
  });
}
function runStripePipeline(opts) {
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
    onProgress
  } = opts;
  const outW = gridW * cell;
  const frameBytes = gridW * gridH;
  const stripes = calcStripes(outW, cell, gridH);
  const numStripes = stripes.length;
  return new Promise((resolve, reject) => {
    const tmpDir = makeTempdir();
    const stripeBufs = stripes.map((s) => Buffer.allocUnsafe(s.bufBytes));
    const stripeFiles = stripes.map((_, i) => import_node_path3.default.join(tmpDir, `stripe_${i}.mov`));
    const encoders = stripes.map(
      (s, i) => spawnEncodeStripe({
        output: stripeFiles[i],
        width: outW,
        height: s.numRows * cell,
        fps
      })
    );
    const encodeErrors = encoders.map((enc, i) => {
      let buf = "";
      enc.stderr.on("data", (d) => buf += d);
      return { buf: () => buf };
    });
    const encodeFinished = encoders.map(
      (enc, i) => encodeStripePromise(enc, `stripe-encoder-${i}`)
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
      try {
        decode.kill("SIGKILL");
      } catch {
      }
      for (const enc of encoders) {
        try {
          enc.kill("SIGKILL");
        } catch {
        }
      }
      cleanupTempDir(tmpDir);
      reject(err);
    };
    let decodeErr = "";
    decode.stderr.on("data", (d) => decodeErr += d);
    decode.on("error", (e) => fail(new Error(`decode spawn failed; ${e.message}`)));
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
          const drainPromises = encoders.map(
            (enc) => new Promise((res) => enc.stdin.once("drain", res))
          );
          Promise.all(drainPromises).then(() => {
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
    decode.stdout.on("data", (chunk) => {
      if (settled) return;
      try {
        drainFrames(chunk);
      } catch (e) {
        fail(e);
      }
    });
    decode.stdout.on("end", () => {
      inputEnded = true;
      maybeFinish();
    });
    decode.on("close", (code) => {
      decodeExited = code;
      if (code !== 0 && !settled) {
        if (!inputEnded || leftover.length >= frameBytes) {
          fail(new Error(`decode ffmpeg exited ${code}: ${decodeErr.trim()}`));
        }
      }
    });
    Promise.all(encodeFinished).then(() => {
      console.log(`
All ${numStripes} stripe(s) encoded. Stacking into final output...`);
      const vstackProc = spawnVstack({
        stripeFiles,
        output,
        fps,
        input,
        withAudio
      });
      let vstackErr = "";
      vstackProc.stderr.on("data", (d) => vstackErr += d);
      vstackProc.on(
        "error",
        (e) => fail(new Error(`vstack spawn failed: ${e.message}`))
      );
      vstackProc.on("close", (code) => {
        cleanupTempDir(tmpDir);
        if (settled) return;
        if (code !== 0) {
          fail(new Error(`vstack ffmpeg exited ${code}: ${vstackErr.trim()}`));
          return;
        }
        settled = true;
        resolve(frameCount);
      });
    }).catch((err) => fail(err));
    for (let i = 0; i < encoders.length; i++) {
      encoders[i].stdin.on(
        "error",
        (e) => fail(new Error(`stripe-encoder-${i} stdin error: ${e.message}`))
      );
    }
  });
}
function runPipeline(opts) {
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
    onProgress
  } = opts;
  const frameBytes = gridW * gridH;
  const outW = gridW * cell;
  const outH = gridH * cell;
  const outFrameBytes = outW * outH * 3;
  return new Promise((resolve, reject) => {
    const outBuf = Buffer.allocUnsafe(outFrameBytes);
    const encode = spawnEncode({
      output,
      width: outW,
      height: outH,
      fps,
      input,
      withAudio
    });
    const decode = spawnDecode(input, gridW, gridH);
    let leftover = Buffer.alloc(0);
    let frameCount = 0;
    let inputEnded = false;
    let decodeExited = null;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        decode.kill("SIGKILL");
      } catch {
      }
      try {
        encode.kill("SIGKILL");
      } catch {
      }
      reject(err);
    };
    let decodeErr = "";
    decode.stderr.on("data", (d) => decodeErr += d);
    decode.on("error", (e) => fail(new Error(`decode spawn failed: ${e.message}`)));
    let encodeErr = "";
    encode.stderr.on("data", (d) => encodeErr += d);
    encode.on("error", (e) => fail(new Error(`encode spawn failed: ${e.message}`)));
    encode.stdin.on("error", (e) => fail(new Error(`encoder stdin error: ${e.message}`)));
    function drainFrames(chunk) {
      let buf = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      let offset = 0;
      while (buf.length - offset >= frameBytes) {
        const frame = buf.subarray(offset, offset + frameBytes);
        offset += frameBytes;
        renderStripe(frame, tiles, lut, cell, gridW, gridH, 0, gridH, outBuf);
        const ok = encode.stdin.write(Buffer.from(outBuf));
        frameCount++;
        if (frameCount % 100 === 0) onProgress(frameCount, totalFrames);
        if (!ok) {
          leftover = Buffer.from(buf.subarray(offset));
          decode.stdout.pause();
          encode.stdin.once("drain", () => {
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
      maybeFinish();
    }
    function maybeFinish() {
      if (settled) return;
      if (inputEnded && leftover.length < frameBytes) {
        if (decodeExited !== null && decodeExited !== 0) {
          fail(new Error(`decode ffmpeg exited ${decodeExited}: ${decodeErr.trim()}`));
          return;
        }
        encode.stdin.end();
      }
    }
    decode.stdout.on("data", (chunk) => {
      if (settled) return;
      try {
        drainFrames(chunk);
      } catch (e) {
        fail(e);
      }
    });
    decode.stdout.on("end", () => {
      inputEnded = true;
      maybeFinish();
    });
    decode.on("close", (code) => {
      decodeExited = code;
      if (code !== 0 && !settled) {
        if (!inputEnded || leftover.length >= frameBytes) {
          fail(new Error(`decode ffmpeg exited ${code}: ${decodeErr.trim()}`));
        }
      }
    });
    encode.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error(`encode ffmpeg exited ${code}: ${encodeErr.trim()}`));
        return;
      }
      settled = true;
      resolve(frameCount);
    });
  });
}

// tui.js
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
var ESC = "\x1B";
var CLEAR_LINE = `${ESC}[2K`;
var HIDE_CURSOR = `${ESC}[?25l`;
var SHOW_CURSOR = `${ESC}[?25h`;
function select(title, items) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("interactive mode needs a TTY( run in a real terminal"));
      return;
    }
    let idx = 0;
    const out = process.stdout;
    function render(first) {
      if (!first) out.write(`${ESC}[${items.length + 1}A`);
      out.write(`${CLEAR_LINE}${title}
`);
      for (let i = 0; i < items.length; i++) {
        const sel = i === idx;
        const pointer = sel ? `${ESC}[36m>` : " ";
        const text = sel ? `${ESC}[36m${items[i].label}${ESC}[0m` : items[i].label;
        out.write(`${CLEAR_LINE}${pointer} ${text}${ESC}[0m
`);
      }
    }
    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      out.write(SHOW_CURSOR);
    }
    function onData(buf) {
      const k = buf.toString();
      if (k === ``) {
        cleanup();
        out.write("\n");
        reject(new Error("cancelled"));
        return;
      }
      if (k === `${ESC}[A` || k === "k") {
        idx = (idx - 1 + items.length) % items.length;
        render(false);
      } else if (k === `${ESC}[B` || k === "j") {
        idx = (idx + 1) % items.length;
        render(false);
      } else if (k === `\r` || k === "n") {
        cleanup();
        resolve(items[idx].value);
      }
    }
    out.write(HIDE_CURSOR);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    render(true);
  });
}
function prompt(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("interactive input needs a TTY"));
      return;
    }
    process.stdout.write(question);
    process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let line = "";
    const onData = (chunk) => {
      line += chunk;
      const nl = line.indexOf("\n");
      if (nl !== -1) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(line.slice(0, nl).trim());
      }
    };
    process.stdin.on("data", onData);
  });
}
function findMp4s(dir) {
  const skip = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "pieces"]);
  const found = [];
  function walk(d) {
    let entries;
    try {
      entries = import_node_fs3.default.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(import_node_path4.default.join(d, e.name));
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".mp4")) {
        found.push(import_node_path4.default.join(d, e.name));
      }
    }
  }
  walk(dir);
  return found;
}

// cli.js
var import_meta = {};
var scriptDir = typeof __dirname !== "undefined" ? __dirname : import_node_path5.default.dirname((0, import_node_url.fileURLToPath)(import_meta.url));
var YELLOW = (s) => `\x1B[33m${s}\x1B[0m`;
var RED = (s) => `\x1B[31m${s}\x1B[0m`;
var BOLD = (s) => `\x1B[1m${s}\x1B[0m`;
var DIM = (s) => `\x1B[2m${s}\x1B[0m`;
function parseArgs(argv) {
  const opts = {
    input: null,
    output: null,
    resolution: DEFAULT_RESOLUTION,
    preset: DEFAULT_PRESET,
    grid: DEFAULT_GRID,
    audio: true,
    interactive: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--input":
        opts.input = argv[++i];
        break;
      case "--output":
        opts.output = argv[++i];
        break;
      case "--resolution":
        opts.resolution = argv[++i];
        break;
      case "--preset":
        opts.preset = argv[++i];
        break;
      case "--grid":
        opts.grid = argv[++i];
        break;
      case "--no_audio":
        opts.audio = false;
        break;
      case "-i":
      case "--interactive":
        opts.interactive = true;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}
function usage() {
  return [
    "chess-mosiac - convert an MP4 into a chess-piece mosiac video",
    "",
    "Usage: node cli.js --input <path> [options]",
    "",
    "auto codec selection",
    "--input <path>       Input Video (required obviously)",
    "--output <path>      Output of the chess mosiac defaults to downloads/<input>_chess.mp4",
    "--resolution <r>     low|medium|high|4k cell size (default high)",
    "--preset <name>      brown|green|blue|gray colors (default chess.com brown)",
    "--grid <g>           normal|detailed|fine|ultra OR a number (cols, default normal)",
    "--no_audio           Muting the original audio track",
    "-i, --interactive    Arrow-key menu mode (auto when --input omitted)",
    "-h, --help           Show this help",
    "",
    "Interactive mode scans this folder for mp4 files and writes to ~/downloads"
  ].join("\n");
}
function resolveGrid(value) {
  if (value in GRID_PRESETS) return GRID_PRESETS[value];
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2 || n > MAX_GRID) {
    throw new Error(
      `bad --grid "${value}" (use ${Object.keys(GRID_PRESETS).join("|")} or an integer 2-${MAX_GRID})`
    );
  }
  return n;
}
function outputDir() {
  const dir = import_node_path5.default.join(process.cwd(), "output");
  if (!import_node_fs4.default.existsSync(dir)) {
    import_node_fs4.default.mkdirSync(dir, { recursive: true });
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
  const mbPerSec = bitsPerSec / 8 / 1e6;
  const ramPerFrameBytes = outW * outH * 3;
  const ramPerFrameMB = ramPerFrameBytes / 1e6;
  const rawGiB = ramPerFrameBytes / 1073741824;
  let recommendedRamGB;
  if (rawGiB < 0.5) recommendedRamGB = 8;
  else if (rawGiB < 1) recommendedRamGB = 16;
  else if (rawGiB < 2) recommendedRamGB = 32;
  else if (rawGiB < 4) recommendedRamGB = 64;
  else recommendedRamGB = 128;
  const vramBytes = outW * outH * 8;
  const vramGiB = vramBytes / 1073741824;
  let recommendedVramGB;
  if (vramGiB < 0.25) recommendedVramGB = 4;
  else if (vramGiB < 0.5) recommendedVramGB = 8;
  else if (vramGiB < 1) recommendedVramGB = 12;
  else if (vramGiB < 2) recommendedVramGB = 16;
  else if (vramGiB < 4) recommendedVramGB = 24;
  else if (vramGiB < 8) recommendedVramGB = 40;
  else recommendedVramGB = 80;
  const mpx = outW * outH / 1e6;
  let recommendedCpu;
  if (mpx < 10) recommendedCpu = { cores: 8, example: "e.g. Ryzen 5 5600X / i7-12700" };
  else if (mpx < 25) recommendedCpu = { cores: 12, example: "e.g. Ryzen 9 5900X / i7-13700K" };
  else if (mpx < 50) recommendedCpu = { cores: 16, example: "e.g. Ryzen 9 7950X / i9-13900K" };
  else if (mpx < 100) recommendedCpu = { cores: 24, example: "e.g. Threadripper 3960X / EPYC 7302" };
  else if (mpx < 250) recommendedCpu = { cores: 32, example: "e.g. Threadripper PRO 5955WX / EPYC 7453" };
  else recommendedCpu = { cores: 64, example: "e.g. Threadripper PRO 7985WX / EPYC 9554" };
  return { mbPerSec, ramPerFrameMB, recommendedRamGB, recommendedVramGB, recommendedCpu };
}
async function showProResWarning(outW, outH, fps = 30, isEstimate = false) {
  const { mbPerSec, ramPerFrameMB, recommendedRamGB, recommendedVramGB, recommendedCpu } = calcProResStats(outW, outH, fps);
  const dimLabel = isEstimate ? `~${outW}\xD7${outH} (estimated)` : `${outW}\xD7${outH}`;
  const line = "\u2500".repeat(62);
  process.stderr.write("\n");
  process.stderr.write(YELLOW(BOLD(`  \u26A0  ProRes 422 HQ \u2014 High Resource Warning
`)));
  process.stderr.write(YELLOW(`  ${line}
`));
  process.stderr.write(YELLOW(`  Output resolution : ${BOLD(dimLabel)}
`));
  process.stderr.write(YELLOW(`  Codec             : ProRes 422 HQ (.mov)
`));
  process.stderr.write(YELLOW(`    (H.264 limit of ${H264_MAX_DIMENSION}px exceeded on at least one axis)
`));
  const unusable = outW > REALISTIC_MAX_DIMENSION || outH > REALISTIC_MAX_DIMENSION;
  const overConformant = outW > PRORES_CONFORMANT_MAX || outH > PRORES_CONFORMANT_MAX;
  const megapixels = outW * outH / 1e6;
  if (unusable) {
    const bothAxes = outW > REALISTIC_MAX_DIMENSION && outH > REALISTIC_MAX_DIMENSION;
    process.stderr.write(RED(`  ${line}
`));
    process.stderr.write(RED(BOLD(`  \u26D4  THEORETICALLY POSSIBLE , REALISTICALLY UNUSABLE
`)));
    process.stderr.write(RED(`    \u2022 ${dimLabel} exceeds ~${REALISTIC_MAX_DIMENSION}px on ${bothAxes ? "both axes" : "one axis"}.
`));
    process.stderr.write(RED(`    \u2022 ffmpeg will write the file, but the ProRes bitstream is
`));
    process.stderr.write(RED(`      non-conformant \u2014 QuickTime, hardware decoders, and every
`));
    process.stderr.write(RED(`      mainstream player will refuse to open it.
`));
    process.stderr.write(RED(`    \u2022 No AV1/HEVC/H.264 encoder can hold this frame either: AV1's
`));
    process.stderr.write(RED(`      top level caps ~35.7 MP; this frame is ~${megapixels.toFixed(0)} MP.
`));
    process.stderr.write(RED(BOLD(`    \u2022 To get a playable file: lower --grid or --resolution until
`)));
    process.stderr.write(RED(BOLD(`      both axes are \u2264 ${PRORES_CONFORMANT_MAX}px, or render tiled.
`)));
  } else if (overConformant) {
    process.stderr.write(YELLOW(`  ${line}
`));
    process.stderr.write(YELLOW(BOLD(`  \u26A0  Beyond Apple's validated 8K (${PRORES_CONFORMANT_MAX}px)
`)));
    process.stderr.write(YELLOW(`    \u2022 Plays in ffmpeg-based players (VLC, mpv), but QuickTime and
`));
    process.stderr.write(YELLOW(`      hardware decoders may refuse it.
`));
  }
  process.stderr.write(YELLOW(`  ${line}
`));
  process.stderr.write(YELLOW(`  ${BOLD("Estimated file size")}
`));
  process.stderr.write(YELLOW(`    \u2022 ~${mbPerSec.toFixed(0)} MB per second of video
`));
  process.stderr.write(YELLOW(`    \u2022 A 1-minute clip will be ~${fmtBytes(mbPerSec * 60 * 1e6)}
`));
  process.stderr.write(YELLOW(`    \u2022 A 10-minute clip will be ~${fmtBytes(mbPerSec * 600 * 1e6)}
`));
  process.stderr.write(YELLOW(`  ${line}
`));
  process.stderr.write(YELLOW(`  ${BOLD("System requirements")}
`));
  process.stderr.write(YELLOW(`    \u2022 RAM  : At least ${BOLD(recommendedRamGB + " GB")} free RAM recommended
`));
  process.stderr.write(YELLOW(`             (single raw frame \u2248 ${fmtBytes(ramPerFrameMB * 1e6)})
`));
  process.stderr.write(YELLOW(`    \u2022 CPU  : ${BOLD(recommendedCpu.cores + "+ cores")} minimum recommended
`));
  process.stderr.write(YELLOW(`             ${DIM(recommendedCpu.example)}
`));
  process.stderr.write(YELLOW(`             (ProRes is entirely CPU-encoded, no GPU acceleration)
`));
  process.stderr.write(YELLOW(`    \u2022 GPU  : A dedicated GPU (${BOLD(recommendedVramGB + " GB+ VRAM")}) is strongly advised
`));
  process.stderr.write(YELLOW(`             for tile rendering at this resolution
`));
  if (mbPerSec > 13e3) {
    process.stderr.write(RED(BOLD(`    \u2022 Disk : \u26D4 ${mbPerSec.toFixed(0)} MB/s \u2014 EXCEEDS ALL SINGLE-DRIVE LIMITS
`)));
    process.stderr.write(RED(`             PCIe 5.0 NVMe tops out at ~13,000 MB/s. This resolution
`));
    process.stderr.write(RED(`             requires an NVMe RAID array or a RAM disk (tmpfs).
`));
    process.stderr.write(RED(`             Rendering at this scale is not practical on consumer hardware.
`));
  } else if (mbPerSec > 7e3) {
    process.stderr.write(YELLOW(`    \u2022 Disk : ${BOLD(mbPerSec.toFixed(0) + " MB/s")} \u2014 requires PCIe 5.0 NVMe
`));
    process.stderr.write(YELLOW(`             ${DIM("e.g. Samsung 990 Pro, WD Black SN850X (gen5)")}
`));
  } else if (mbPerSec > 3500) {
    process.stderr.write(YELLOW(`    \u2022 Disk : ${BOLD(mbPerSec.toFixed(0) + " MB/s")} \u2014 requires PCIe 4.0 NVMe
`));
    process.stderr.write(YELLOW(`             ${DIM("e.g. Samsung 980 Pro, WD Black SN850X")}
`));
  } else if (mbPerSec > 550) {
    process.stderr.write(YELLOW(`    \u2022 Disk : ${BOLD(mbPerSec.toFixed(0) + " MB/s")} \u2014 requires PCIe 3.0 NVMe
`));
    process.stderr.write(YELLOW(`             ${DIM("e.g. Samsung 970 EVO Plus, WD Blue SN570")}
`));
  } else {
    process.stderr.write(YELLOW(`    \u2022 Disk : ${BOLD(mbPerSec.toFixed(0) + " MB/s")} \u2014 any modern SATA SSD or NVMe
`));
  }
  process.stderr.write(YELLOW(`  ${line}
`));
  process.stderr.write("\n");
  if (process.stdin.isTTY) {
    const confirmed = await select(
      YELLOW(BOLD("Do you understand these requirements and wish to continue?")),
      [
        { label: "\u2705  I understand \u2014 continue with ProRes render", value: true },
        { label: "\u274C  Cancel", value: false }
      ]
    );
    if (!confirmed) throw new Error("cancelled");
  } else {
    process.stderr.write(
      YELLOW("  (Running non-interactively , proceeding automatically. Ctrl+C to abort.)\n\n")
    );
  }
}
async function runInteractive(opts) {
  const root = process.cwd();
  const mp4s = findMp4s(root);
  if (mp4s.length === 0) {
    throw new Error(`no .mp4 files found under ${root}`);
  }
  opts.input = await select(
    "Select input video (\u2191/\u2193, Enter):",
    mp4s.map((f) => ({ label: import_node_path5.default.relative(root, f) || f, value: f }))
  );
  opts.resolution = await select("Resolution (tile pixel size):", [
    ...Object.keys(RESOLUTIONS).map((r) => ({
      label: `${r} (cell ${RESOLUTIONS[r]}px)${r === "4k" ? " may trigger ProRes and problems" : ""}`,
      value: r
    }))
  ]);
  const gridChoice = await select("Grid size (number of piece columns, more = finer):", [
    ...Object.keys(GRID_PRESETS).map((g) => ({
      label: `${g} (${GRID_PRESETS[g]} cols)${g === "ultra" ? "BEEFY COMPUTER RECOMENDED!" : ""}`,
      value: g
    })),
    { label: "custom...", value: "__custom__" }
  ]);
  if (gridChoice === "__custom__") {
    while (true) {
      const raw = await prompt(`  Enter columns (2-${MAX_GRID}): `);
      try {
        resolveGrid(raw);
        opts.grid = raw;
        break;
      } catch (e) {
        console.log(`   ${e.message}`);
      }
    }
  } else {
    opts.grid = gridChoice;
  }
  const cell = RESOLUTIONS[opts.resolution];
  const gridW = resolveGrid(opts.grid);
  const estOutW = gridW * cell;
  const estOutH = Math.round(estOutW * 9 / 16);
  const codecInfo = chooseCodec(estOutW, estOutH);
  if (codecInfo.codec === "prores") {
    await showProResWarning(estOutW, estOutH, 30, true);
  } else if (estOutW > H264_MAX_DIMENSION * 0.75) {
    process.stderr.write(YELLOW(
      `
 NOTE: esitmated output width ~${estOutW}px is approaching the H.264 limit (${H264_MAX_DIMENSION}px). 

`
    ));
  }
  opts.preset = await select(
    "Color preset:",
    Object.keys(PRESETS).map((p) => ({ label: `${p}  ${PRESETS[p][0]} / ${PRESETS[p][1]}`, value: p }))
  );
  opts.audio = await select("Audio:", [
    { label: "Include original audio", value: true },
    { label: "No Audio", value: false }
  ]);
  const base = import_node_path5.default.basename(opts.input, import_node_path5.default.extname(opts.input));
  opts.output = opts.output || import_node_path5.default.join(outputDir(), `${base}_chess${codecInfo.ext}`);
  return opts;
}
async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error("\n" + usage());
    return 2;
  }
  if (opts.help) {
    console.log(usage());
    return 0;
  }
  if (opts.interactive || !opts.input) {
    if (!process.stdin.isTTY) {
      console.error("Error: --input is required (no tty for interactive mode) \n");
      console.error(usage());
      return 2;
    }
    try {
      await runInteractive(opts);
    } catch (e) {
      console.error(`
${e.message === "cancelled" ? "Cancelled." : "Error:" + e.message}`);
      return e.message === "cancelled" ? 130 : 1;
    }
  }
  const cell = RESOLUTIONS[opts.resolution];
  if (!cell) {
    console.error(`Error: unknown resolution "${opts.resolution}" (use ${Object.keys(RESOLUTIONS).join("|")})`);
    return 2;
  }
  const colors = PRESETS[opts.preset];
  if (!colors) {
    console.error(`Error: unknown preset "${opts.preset}" (use ${Object.keys(PRESETS).join("|")})`);
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
    if (codecInfo.codec === "prores") {
      try {
        await showProResWarning(outW, outH, meta.fps, false);
      } catch (e) {
        if (e.message === "cancelled") {
          console.log("Cancelled.");
          return 130;
        }
        throw e;
      }
    }
    const base = import_node_path5.default.basename(opts.input, import_node_path5.default.extname(opts.input));
    const output = opts.output || import_node_path5.default.join(outputDir(), `${base}_chess${codecInfo.ext}`);
    console.log(`Input   ${meta.width}x${meta.height} @ ${meta.fps.toFixed(3)}fps, ${meta.frames || "?"} frames`);
    console.log(`Grid ${gridW}x${gridH}, cell ${cell}px -> output ${outW}x${outH}`);
    console.log(`Codec ${codecInfo.label}`);
    console.log(`Output ${output}`);
    console.log(`Precomputing tiles...`);
    const piecesDir = resolvePiecesDir(import_node_path5.default.join(scriptDir, "pieces"), PIECE_CODES);
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
      onProgress: (n, total) => process.stdout.write(`\rFrame ${n} / ${total || "?"}   `)
    };
    const frames = codecInfo.codec === "prores" ? await runStripePipeline(pipelineOpts) : await runPipeline(pipelineOpts);
    console.log(`Done. Rendered ${frames} frames -> ${output}`);
    return 0;
  } catch (e) {
    console.error(RED(`Error: ${e.message}`));
    return 1;
  }
}
main().then((code) => process.exit(code));
