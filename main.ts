/**
 * main.ts — the make.fun entrypoint for Tukang Jahit Langit.
 *
 * Copies game/ and screenshots/ into MAKEFUN_OUTPUT_DIR (default /output) and
 * writes dossier.json there with buildDossier() from the official vendor runtime.
 *
 *   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
 *
 * A game is handed in with three or four rendered screenshots. This repository
 * keeps screenshots/ empty on purpose (the capture pass fills it), so when the
 * folder holds no image the packaging step writes one clearly named placeholder
 * cover — a real raster of the first evening's board, drawn here, not a photo of
 * the game. Delete it and drop real PNGs in screenshots/ to replace it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { buildDossier } from './vendor/makefun-game.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000
} as const;

const HERE = import.meta.dirname ?? process.cwd();
const OUT = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
const GAME_SRC = join(HERE, 'game');
const SHOTS_SRC = join(HERE, 'screenshots');
const PLACEHOLDER = 'placeholder-cover.png';
const IMAGE = /\.(png|jpg|jpeg)$/i;

// ---------------------------------------------------------------- copying

function copyTree(from: string, to: string, count = { files: 0, bytes: 0 }): { files: number; bytes: number } {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target, count);
    } else if (entry.isFile()) {
      const bytes = statSync(source).size;
      writeFileSync(target, readFileSync(source));
      count.files += 1;
      count.bytes += bytes;
    }
  }
  return count;
}

// ---------------------------------------------------------------- png writer

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0);
  return Buffer.concat([head, body, crc]);
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0))
  ]);
}

// ---------------------------------------------------------------- the cover raster

type Island = { x: number; y: number };

function readLevelOne(): { islands: Island[]; links: [number, number][]; house: number } {
  const source = readFileSync(join(GAME_SRC, 'levels.js'), 'utf8');
  const box: { window?: Record<string, unknown> } = {};
  const run = new Function('window', `${source}\nreturn window;`);
  const globals = run(box) as { SkyLevels?: { levels: Array<{ islands: Island[]; links: [number, number][]; house: number }> } };
  const level = globals.SkyLevels?.levels?.[0];
  if (!level) throw new Error('main: game/levels.js holds no first evening');
  return { islands: level.islands, links: level.links, house: level.house };
}

function paintPlaceholder(): Buffer {
  const width = 1280;
  const height = 720;
  const pixels = new Uint8Array(width * height * 3);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = (Math.round(y) * width + Math.round(x)) * 3;
    pixels[at] = r;
    pixels[at + 1] = g;
    pixels[at + 2] = b;
  };

  // Torn-paper night: five bands with a wave along every seam.
  const bands = [
    [16, 26, 46],
    [21, 35, 61],
    [26, 45, 76],
    [32, 55, 90],
    [39, 66, 102]
  ];
  for (let y = 0; y < height; y++) {
    const band = Math.min(bands.length - 1, Math.floor((y / height) * bands.length));
    const [r, g, b] = bands[band]!;
    for (let x = 0; x < width; x++) {
      const wave = Math.round(Math.sin((x + band * 33) * 0.013) * 5 + Math.cos(x * 0.031 + band) * 3);
      const wobble = wave > 0 && Math.abs(y - (band * height) / bands.length) < wave ? 8 : 0;
      put(x, y, Math.min(255, r + wobble), Math.min(255, g + wobble), Math.min(255, b + wobble));
    }
  }
  // Stars.
  for (let i = 0; i < 150; i++) {
    const x = (i * 4099) % width;
    const y = (i * 2333) % Math.round(height * 0.8);
    const tone = 150 + (i % 5) * 20;
    put(x, y, tone + 40, tone + 30, tone);
  }

  const level = readLevelOne();

  const disc = (cx: number, cy: number, radius: number, rgb: [number, number, number]) => {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) put(cx + x, cy + y, rgb[0], rgb[1], rgb[2]);
      }
    }
  };
  const ring = (cx: number, cy: number, radius: number, rgb: [number, number, number]) => {
    for (let a = 0; a < 3600; a++) {
      const t = (a / 3600) * Math.PI * 2;
      put(cx + Math.cos(t) * radius, cy + Math.sin(t) * radius, rgb[0], rgb[1], rgb[2]);
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number], dash = 0) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let i = 0; i <= steps; i++) {
      if (dash > 0 && Math.floor((i / steps) * 12) % 2 === 1) continue;
      put(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, rgb[0], rgb[1], rgb[2]);
    }
  };

  for (const [a, b] of level.links) {
    const from = level.islands[a]!;
    const to = level.islands[b]!;
    line(from.x, from.y, to.x, to.y, [198, 214, 240], 8);
  }

  const house = level.islands[level.house]!;
  for (let y = -6; y <= 16; y++) for (let x = -14; x <= 14; x++) put(house.x + x, house.y + y, 243, 217, 164);
  for (let y = -26; y <= -6; y++) {
    const half = Math.round(((y + 26) / 20) * 20);
    for (let x = -half; x <= half; x++) put(house.x + x, house.y + y, 164, 85, 47);
  }
  disc(house.x, house.y + 2, 12, [255, 214, 120]);

  for (const island of level.islands) {
    disc(island.x, island.y, 20, [239, 227, 198]);
    ring(island.x, island.y, 20, [138, 115, 72]);
    disc(island.x, island.y - 22, 4, [255, 240, 160]);
  }

  // The toolbar strip along the bottom, ten slots.
  const pad = 16;
  const slot = Math.floor((width - pad * 2 - 9 * 6) / 10);
  for (let i = 0; i < 10; i++) {
    const x = pad + i * (slot + 6);
    const y = height - 58;
    for (let yy = y; yy < y + 40; yy++) {
      for (let xx = x; xx < x + slot; xx++) {
        const edge = yy === y || yy === y + 39 || xx === x || xx === x + slot - 1;
        if (edge) put(xx, yy, 198, 214, 240);
        else put(xx, yy, 18, 28, 46);
      }
    }
  }

  return encodePng(width, height, pixels);
}

// ---------------------------------------------------------------- packaging

function shots(): string[] {
  if (!existsSync(SHOTS_SRC)) return [];
  return readdirSync(SHOTS_SRC).filter((name) => !name.startsWith('.') && IMAGE.test(name));
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const game = copyTree(GAME_SRC, join(OUT, 'game'));
  const shotDir = join(OUT, 'screenshots');
  mkdirSync(shotDir, { recursive: true });

  const real = shots();
  if (real.length > 0) {
    copyTree(SHOTS_SRC, shotDir);
    console.log(`packaging: ${real.length} screenshot(s) from screenshots/`);
  } else {
    writeFileSync(join(shotDir, PLACEHOLDER), paintPlaceholder());
    console.log(`packaging: screenshots/ is empty, wrote screenshots/${PLACEHOLDER} (a raster of the first board)`);
  }

  const dossier = buildDossier(OUT, CAPS);
  const target = join(OUT, 'dossier.json');
  writeFileSync(target, dossier);
  console.log(`packaging: game/ ${game.files} files, ${game.bytes} bytes -> ${join(OUT, 'game')}`);
  console.log(`packaging: dossier ${dossier.length} bytes -> ${target}`);
}

main();
