# Chess To MP4

Hi! This project takes any MP4 and rebuilds every frame out of the chess.com chess pieces, then spits out the new video, It's inspired by this video by slommy on youtube [![Here!]](https://www.youtube.com/watch?v=7_0IQfzoEPo) but that one wasn't:
A - Open Source
B - Have any program for that matter
C - He only did it for bad apple.

How it works is basically, turns the input Black and white and chops it up into a grid of tiles. Then it takes the average darkness of each tile and replaces it with a chess pieces with the most similar brightness.

The Brightness Ramp is:

Black king -> Black queen -> Black Rook -> Black Bishop (optional)-> Black Knight (optional)-> Black pawn -> White pawn -> White Bishop (optional) -> White Knight (optional) -> White Rook -> White Queen -> White King

You choose the resolution of the Chess pieces, then the number of tiles wide you want it to be then it generates!

Due to High resolution if you want to use ultra width and 4k pieces, the output will be

# 12K!

The H.264 (mp4) codec only really supports up to 8k, i used Apples ProRes which *technically* supports 32k but realstically up to 16k,

Codec is picked automatically:

* output ≤ 8192px on both sides → H.264 / `.mp4`
* output > 8192px on either side → ProRes 422 HQ / `.mov` (for the giant grids)

It'll warn you before doing a ProRes render because those files get HUGE and eat your RAM/disk.

[![Watch the video!](https://img.youtube.com/vi/xTDInCkbT_0/hqdefault.jpg)](https://www.youtube.com/embed/xTDInCkbT_0)

# VIDEO ^^^

## how to run

Run the Precompiled executable

OR

```bash
node cli.js --input testt.mp4
```

Or run with no input and it goes interactive, scans the folder for mp4s and gives you an arrow-key menu:

```bash
node cli.js
```

## options

* `--input <path>` — the video (required unless you're in interactive mode)
* `--output <path>` — where it goes, defaults to `output/<name>_chess.<ext>`
* `--resolution <r>` — cell size: `low` (30px) `medium` (40px) `high` (60px) `4k` (120px). default `high`
* `--preset <name>` — piece colors: `brown` (chess.com), `green`, `blue`, `gray`. default `brown`
* `--grid <g>` — how many columns: `normal` (32) `detailed` (48) `fine` (64) `ultra` (96), OR just type a number. default `normal`
* `--no_audio` — strip the audio
* `-i, --interactive` — force the menu
* `-h, --help` — help

# the stack

Plain Node, no framework:

* `cli.js` — the actual command line tool you run
* `constants.js` — resolutions, grid presets, colors, the brightness → piece ramp
* `ffmpeg.js` — probing videos + picking the codec
* `tiles.js` — precomputes the piece images
* `pipeline.js` — the render loop (`runPipeline` for H.264, `runStripePipeline` for ProRes)
* `render.js` — building each frame
* `tui.js` — the arrow-key interactive menu
* `pieces/` — the chess piece PNGs

## AI disclosure

AI helped with debugging and figuring out the ffmpeg/codec stuff, guidance not generated code.
EXCEPT for recomended specs part, the Base code was all me but the actual text was ai as:
A. I don't really know too much about Video rendering
B. WAY TOO LONG, and i don't think anyone would actually read it much.
