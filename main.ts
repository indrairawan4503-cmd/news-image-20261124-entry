// news-image-20261124-entry — variant B (magazine style)
// "The World in One Day — Tuesday 24 November 2026"
// A dense drawn newspaper front page: masthead, one huge central drawn
// illustration panel for the COP31 collapse (a cracked Earth above an empty
// summit table with national flags and a NO DEAL banner), three drawn
// headline panels (Nvidia, the $1tn sell-off, the Indonesia factory fire),
// and a numbered story index listing 32 more stories across 7 regions.
// Everything is drawn in code with a 5x7 bitmap font; no network, no assets.
// Node 22+ stdlib only. Writes /output/entry.png (MAKEFUN_OUTPUT_DIR).

import * as fs from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];

// One constructor for every colour, so the palette below reads as plain
// data (name -> rgb triplet) instead of repeating the tuple type each line.
const rgb = (r: number, g: number, b: number): RGB => [r, g, b];

// Paper and ink.
const PAPER: RGB = rgb(248, 243, 232);
const INK: RGB = rgb(22, 22, 22);
const WHITE: RGB = rgb(255, 255, 255);
const GREY: RGB = rgb(118, 118, 116);
const SMOKE: RGB = rgb(152, 152, 150);
const DARKGREY: RGB = rgb(58, 58, 62);

// Accent reds and blues.
const RED: RGB = rgb(178, 28, 34);
const DARKRED: RGB = rgb(140, 18, 24);
const BLUE: RGB = rgb(28, 76, 134);
const NAVY: RGB = rgb(16, 38, 68);
const TEAL: RGB = rgb(44, 108, 140);

// Summit-hall wall gradient (top -> bottom) and wood.
const HALLTOP: RGB = rgb(24, 42, 72);
const HALLBOT: RGB = rgb(52, 78, 116);
const WOOD: RGB = rgb(118, 84, 50);
const WOODDARK: RGB = rgb(88, 60, 34);
const CREAM: RGB = rgb(198, 186, 158);
const SAND: RGB = rgb(228, 210, 172);

// Globe and landscape.
const SKY: RGB = rgb(206, 228, 240);
const OCEAN: RGB = rgb(52, 110, 168);
const LAND: RGB = rgb(88, 152, 94);
const LAND2: RGB = rgb(172, 142, 92);
const ORANGE: RGB = rgb(234, 122, 38);
const GOLD: RGB = rgb(246, 202, 82);
const GREEN: RGB = rgb(52, 168, 92);
const DARKGREEN: RGB = rgb(16, 44, 30);

// ---------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 3);

function put(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function box(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      i += 3;
    }
  }
}

function frame(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  box(x, y, w, t, c);
  box(x, y + h - t, w, t, c);
  box(x, y, t, h, c);
  box(x + w - t, y, t, h, c);
}

function hrule(x: number, y: number, w: number, c: RGB, t = 1): void {
  box(x, y, w, t, c);
}

function seg(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    put(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) put(x, y, c);
    }
  }
}

function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180;
    put(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}

function tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const minX = Math.max(0, Math.min(ax, bx, cx));
  const maxX = Math.min(W - 1, Math.max(ax, bx, cx));
  const minY = Math.max(0, Math.min(ay, by, cy));
  const maxY = Math.min(H - 1, Math.max(ay, by, cy));
  const d = (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const s = ((x - cx) * (by - cy) - (bx - cx) * (y - cy)) / d;
      const t = ((ax - cx) * (y - cy) - (x - cx) * (ay - cy)) / d;
      if (s >= 0 && t >= 0 && s + t <= 1) put(x, y, c);
    }
  }
}

// Flame burst: a filled core plus radiating spikes.
function flare(cx: number, cy: number, r: number, c: RGB, spikes = 10): void {
  disc(cx, cy, Math.max(2, Math.floor(r * 0.5)), c);
  for (let k = 0; k < spikes; k++) {
    const a = (k * 2 * Math.PI) / spikes + 0.3;
    const len = r * (0.65 + ((k * 53) % 10) / 28);
    seg(cx, cy, Math.round(cx + len * Math.cos(a)), Math.round(cy + len * Math.sin(a)), c);
  }
}

// ---------------------------------------------------------------- PNG out
// Build the CRC-32 lookup table once at load time (polynomial 0xEDB88320,
// the reversed form of the standard CRC-32 polynomial).
function buildCrcTable(): number[] {
  const tab: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tab.push(c >>> 0);
  }
  return tab;
}

const CRC: number[] = buildCrcTable();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 5x7 font
// Seven rows of five bits per glyph; uppercase newspaper capitals.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "\u2022": ["00000", "00000", "01100", "01100", "01100", "00000", "00000"],
};

function textW(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - scale;
}

function drawText(x: number, y: number, text: string, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of text) {
    const g = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") box(cx + col * scale, y + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}

function drawTextC(cx: number, y: number, text: string, scale: number, c: RGB): void {
  drawText(cx - Math.floor(textW(text, scale) / 2), y, text, scale, c);
}

function wrap(text: string, maxW: number, scale: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textW(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawLines(x: number, y: number, lines: string[], scale: number, c: RGB, lh: number): number {
  let yy = y;
  for (const ln of lines) {
    drawText(x, yy, ln, scale, c);
    yy += lh;
  }
  return yy;
}

// ---------------------------------------------------------------- the news
// Tuesday 24 November 2026, as first reported that day. Wording stays close
// to the reports; nothing is invented beyond the refpack's sourced list.
const LEAD_HEADLINE = "COP31 COLLAPSES";
const LEAD_SUB = "NO DEAL ON FOSSIL-FUEL PHASE-OUT AS TALKS END IN FAILURE";
const LEAD_CAPTION =
  "COP31 CLIMATE TALKS END WITHOUT A DEAL ON FOSSIL-FUEL PHASE-OUT - TALKS MAY BE SUSPENDED UNTIL NEXT YEAR";

interface Panel {
  kicker: string;
  headline: string;
  sub: string;
  art: "chip" | "selloff" | "fire";
}

const PANELS: Panel[] = [
  {
    kicker: "TECH - NVIDIA",
    headline: "HUANG RETURNS AS NVIDIA CEO",
    sub: "SHARES SURGE OVER 31% IN A DAY",
    art: "chip",
  },
  {
    kicker: "BUSINESS - WALL STREET",
    headline: "TRUMP BLAMES DEMOCRATS FOR $1TN SELL-OFF",
    sub: "MARKETS TUMBLE AFTER MIDTERM RESULTS",
    art: "selloff",
  },
  {
    kicker: "ASIA - INDONESIA",
    headline: "FACTORY FIRE TOLL RISES TO 24",
    sub: "AROUND 30 WORKERS STILL MISSING",
    art: "fire",
  },
];

interface Region {
  name: string;
  items: string[];
}

// 32 index items; every item fits one line at scale 1 in its column.
const REGIONS: Region[] = [
  {
    name: "CLIMATE",
    items: [
      "TALKS MAY BE SUSPENDED UNTIL NEXT YEAR",
      "SEVERAL COUNTRIES CRITICISE THE FAILURE",
    ],
  },
  {
    name: "TECH / BUSINESS",
    items: [
      "WAYMO PULLS DRIVERLESS TAXIS OFF US FREEWAYS",
      "SENSEX FALLS 1,484 POINTS TO 82,435",
      "NIFTY DROPS 451 POINTS TO 25,350",
      "INDIA PRIVATE-SECTOR ACTIVITY IMPROVES",
      "MODI OPENS AI CENTRE AT IIT PATNA",
    ],
  },
  {
    name: "ASIA",
    items: [
      "INDIA AND NEPAL SIGN 8 MOUS",
      "MODI ANNOUNCES RS 15,000 CRORE PACKAGE",
      "MODI HOLDS TALKS WITH NEPAL PM SHAH",
      "INDIA-CHINA MILITARY TALKS IN ARUNACHAL",
      "BANGLADESH VOWS TO ARREST SHEIKH HASINA",
      "SOUTH KOREA NAMES NEW FOREIGN MINISTER",
      "CHINA SETS 2030 ELDERLY CARE TARGETS",
      "ARMENIA PROPOSES NEW CONSTITUTION",
      "LAHORE TOPS POLLUTION LIST AS AQI PASSES 500",
      "CHINESE OFFICIAL GIVEN DEATH SENTENCE",
      "4.0 QUAKE STRIKES PAKISTAN NEAR AFGHAN BORDER",
      "TRUMP, XI AND PUTIN SET FOR APEC MEETING",
    ],
  },
  {
    name: "MIDDLE EAST",
    items: [
      "ISRAELI GROUND OPERATION IN CENTRAL GAZA",
      "EISENKOT CALLS SETTLER ARSON \"JEWISH TERRORISM\"",
    ],
  },
  {
    name: "AMERICAS",
    items: [
      "O'HARE BRIEF GROUND STOP IN HOLIDAY RUSH",
      "TRUMP TARGETS NEWSOM OVER 548 COMMUTATIONS",
      "EX-MAYOR OF JACKSON JAILED 37 MONTHS",
      "$41M FRAUD PROBE: CHILD CENTRES RAIDED",
      "SWIFT VIENNA SHOWS SAVED FROM ISIS PLOT",
    ],
  },
  {
    name: "EUROPE",
    items: [
      "KING CHARLES REACHES OUT TO MEGHAN MARKLE",
      "RUSSIA PLANS RAILWAY FERRIES FOR KALININGRAD",
      "450 GERMAN SCHOOLS GET BOMB THREATS BY EMAIL",
      "DUTCH ACTIVIST BHUGWANDASS DIES AT 28",
    ],
  },
  {
    name: "SPORT & CULTURE",
    items: [
      "INDIA-NZ 1ST TEST ENDS IN DRAW AT WELLINGTON",
      "GUKESH DEFENDS CHESS TITLE VS SINDAROV IN GENEVA",
    ],
  },
];

const INDEX_TOTAL = REGIONS.reduce((n, r) => n + r.items.length, 0);
const STORY_TOTAL = 1 + PANELS.length + INDEX_TOTAL; // lead + panels + index

// ---------------------------------------------------------------- artwork
// Central panel: the COP31 summit hall. A cracked Earth hangs above an
// empty summit table — rows of empty chairs, small national flags standing
// on the table — while a red NO DEAL banner cuts across the hall.
function drawLeadScene(x: number, y: number, w: number, h: number): void {
  // Hall wall in vertical bands, darker at the top.
  const bands = 6;
  for (let b = 0; b < bands; b++) {
    const t = b / (bands - 1);
    const c: RGB = [
      Math.round(HALLTOP[0] + (HALLBOT[0] - HALLTOP[0]) * t),
      Math.round(HALLTOP[1] + (HALLBOT[1] - HALLTOP[1]) * t),
      Math.round(HALLTOP[2] + (HALLBOT[2] - HALLTOP[2]) * t),
    ];
    box(x, y + Math.floor((h * b) / bands), w, Math.ceil(h / bands) + 1, c);
  }
  // Wooden floor along the bottom.
  const floorY = y + h - 58;
  box(x, floorY, w, 58, WOOD);
  hrule(x, floorY, w, WOODDARK, 3);
  hrule(x, floorY + 28, w, WOODDARK, 2);

  // Cracked Earth, left of centre.
  const gx = x + 235;
  const gy = y + 118;
  const gr = 96;
  disc(gx, gy, gr, OCEAN);
  // Land masses, kept inside the disc.
  disc(gx - 42, gy - 34, 30, LAND);
  disc(gx - 12, gy - 44, 22, LAND);
  disc(gx + 38, gy + 6, 34, LAND);
  disc(gx + 58, gy - 30, 18, LAND2);
  disc(gx - 48, gy + 42, 24, LAND2);
  disc(gx + 8, gy + 52, 26, LAND);
  disc(gx - 6, gy + 2, 16, LAND2);
  // Highlight arc, top-left.
  for (let a = 190; a <= 290; a += 3) {
    const t = (a * Math.PI) / 180;
    put(Math.round(gx + (gr - 6) * Math.cos(t)), Math.round(gy + (gr - 6) * Math.sin(t)), SKY);
    put(Math.round(gx + (gr - 9) * Math.cos(t)), Math.round(gy + (gr - 9) * Math.sin(t)), SKY);
  }
  // Jagged cracks splitting the planet.
  const crack = (pts: Array<[number, number]>, c: RGB): void => {
    for (let i = 0; i + 1 < pts.length; i++) {
      seg(gx + pts[i][0], gy + pts[i][1], gx + pts[i + 1][0], gy + pts[i + 1][1], c);
      seg(gx + pts[i][0] + 1, gy + pts[i][1], gx + pts[i + 1][0] + 1, gy + pts[i + 1][1], c);
    }
  };
  crack([[-80, -70], [-46, -38], [-58, -6], [-24, 22], [-38, 58], [-10, 88]], INK);
  crack([[-46, -38], [-8, -52], [30, -30], [52, -52], [84, -28]], INK);
  crack([[-24, 22], [12, 40], [34, 22], [66, 44], [88, 30]], INK);
  crack([[-58, -6], [-84, 18], [-70, 52]], INK);
  ring(gx, gy, gr, INK);
  ring(gx, gy, gr - 2, [20, 60, 100]);
  // Smoke wisps drifting off the cracked globe.
  disc(gx + 108, gy - 78, 14, SMOKE);
  disc(gx + 126, gy - 88, 18, SMOKE);
  disc(gx + 146, gy - 76, 12, [170, 170, 168]);

  // Empty chairs in a row behind the table.
  const chairY = y + h - 118;
  for (let k = 0; k < 6; k++) {
    const cx0 = x + 470 + k * 82;
    box(cx0, chairY, 52, 44, DARKGREY);
    box(cx0 + 4, chairY + 4, 44, 36, [78, 78, 82]);
    box(cx0 + 22, chairY + 44, 8, 16, DARKGREY);
  }
  // The long summit table.
  const tableY = y + h - 58;
  box(x + 448, tableY - 14, 512, 14, WOOD);
  box(x + 448, tableY, 512, 44, WOODDARK);
  box(x + 460, tableY - 26, 8, 26, WOODDARK);
  box(x + 940, tableY - 26, 8, 26, WOODDARK);
  // Small national flags standing on the table.
  const flags: Array<[RGB, RGB]> = [
    [RED, WHITE],
    [BLUE, WHITE],
    [GREEN, GOLD],
    [WHITE, RED],
    [GOLD, RED],
    [TEAL, WHITE],
    [RED, BLUE],
    [GREEN, WHITE],
  ];
  for (let k = 0; k < 8; k++) {
    const fx = x + 486 + k * 58;
    const fy = tableY - 14;
    box(fx, fy - 30, 2, 30, INK); // pole
    box(fx + 2, fy - 30, 26, 8, flags[k][0]); // top stripe
    box(fx + 2, fy - 22, 26, 7, flags[k][1]); // bottom stripe
    frame(fx + 2, fy - 30, 26, 15, INK, 1);
  }

  // The NO DEAL banner, upper right.
  const bx = x + 520;
  const by = y + 18;
  const bw = 420;
  const bh = 66;
  box(bx, by, bw, bh, RED);
  frame(bx, by, bw, bh, DARKRED, 3);
  frame(bx + 6, by + 6, bw - 12, bh - 12, WHITE, 1);
  drawTextC(bx + bw / 2, by + 12, "NO DEAL", 6, WHITE);
  // Caption label under the globe.
  const lx = x + 30;
  const ly = y + h - 84;
  box(lx, ly, textW("A PLANET WAITS - AND THE TALKS FAIL", 1) + 12, 13, INK);
  drawText(lx + 6, ly + 3, "A PLANET WAITS - AND THE TALKS FAIL", 1, WHITE);
}

// Small drawn panels for the three named headlines (100 x 130 each).
function drawMiniArt(kind: Panel["art"], x: number, y: number, w: number, h: number): void {
  if (kind === "chip") {
    // A chip on a rising green chart.
    box(x, y, w, h, DARKGREEN);
    for (let gy = 20; gy < h; gy += 20) hrule(x, y + gy, w, [24, 66, 44], 1);
    for (let gx = 20; gx < w; gx += 20) {
      for (let yy = y; yy < y + h; yy++) put(x + gx, yy, [24, 66, 44]);
    }
    // Rising line with an arrowhead.
    const pts: Array<[number, number]> = [
      [x + 6, y + h - 24],
      [x + 28, y + h - 34],
      [x + 46, y + h - 28],
      [x + 66, y + h - 52],
      [x + 84, y + h - 66],
    ];
    for (let i = 0; i + 1 < pts.length; i++) {
      seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], GREEN);
      seg(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, GREEN);
    }
    tri(pts[4][0] - 2, pts[4][1] + 6, pts[4][0] + 10, pts[4][1] + 2, pts[4][0] + 2, pts[4][1] - 6, GREEN);
    // The chip itself, bottom-left.
    box(x + 10, y + h - 52, 34, 34, GOLD);
    frame(x + 10, y + h - 52, 34, 34, INK, 2);
    box(x + 20, y + h - 42, 14, 14, DARKGREEN);
    for (let k = 0; k < 3; k++) {
      box(x + 14 + k * 10, y + h - 58, 4, 6, GOLD);
      box(x + 14 + k * 10, y + h - 18, 4, 6, GOLD);
    }
    box(x + 56, y + h - 18, textW("+31%", 2) + 8, 18, INK);
    drawText(x + 60, y + h - 15, "+31%", 2, GREEN);
  } else if (kind === "selloff") {
    // A market chart falling off a cliff, in red on dark red.
    box(x, y, w, h, [52, 18, 20]);
    for (let gy = 20; gy < h; gy += 20) hrule(x, y + gy, w, [74, 28, 30], 1);
    // Descending bars.
    const heights = [26, 34, 30, 48, 44, 62, 58, 82];
    for (let k = 0; k < heights.length; k++) {
      box(x + 6 + k * 12, y + h - 20 - heights[k], 8, heights[k], RED);
    }
    // Falling line with a down arrow.
    const pts: Array<[number, number]> = [
      [x + 6, y + 26],
      [x + 30, y + 34],
      [x + 52, y + 30],
      [x + 72, y + 58],
      [x + 92, y + 84],
    ];
    for (let i = 0; i + 1 < pts.length; i++) {
      seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], WHITE);
      seg(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, WHITE);
    }
    tri(pts[4][0] - 6, pts[4][1] - 2, pts[4][0] + 6, pts[4][1] - 2, pts[4][0], pts[4][1] + 10, WHITE);
    box(x + 6, y + h - 18, textW("$1TN", 2) + 8, 18, INK);
    drawText(x + 10, y + h - 15, "$1TN", 2, RED);
  } else {
    // A factory in flames: sawtooth roof, smoke, fire bursts.
    box(x, y, w, h, [32, 30, 34]);
    disc(x + 74, y + 22, 16, SMOKE);
    disc(x + 86, y + 12, 12, SMOKE);
    disc(x + 60, y + 14, 10, [170, 170, 168]);
    // Factory block with a sawtooth roof.
    box(x + 10, y + 62, 80, 56, DARKGREY);
    tri(x + 10, y + 62, x + 30, y + 62, x + 10, y + 44, DARKGREY);
    tri(x + 30, y + 62, x + 50, y + 62, x + 50, y + 44, DARKGREY);
    tri(x + 50, y + 62, x + 70, y + 62, x + 50, y + 44, DARKGREY);
    tri(x + 70, y + 62, x + 90, y + 62, x + 90, y + 44, DARKGREY);
    box(x + 74, y + 30, 10, 34, DARKGREY); // chimney
    for (let wy = 72; wy <= 104; wy += 14) {
      for (let wx = 18; wx <= 74; wx += 14) box(x + wx, y + wy, 7, 8, GOLD);
    }
    // Flames licking the roof.
    flare(x + 28, y + 52, 16, ORANGE, 8);
    flare(x + 28, y + 52, 8, GOLD, 6);
    flare(x + 62, y + 48, 18, ORANGE, 9);
    flare(x + 62, y + 48, 9, GOLD, 6);
    flare(x + 84, y + 58, 12, ORANGE, 7);
    box(x + 6, y + h - 18, textW("24 DEAD", 2) + 8, 18, INK);
    drawText(x + 10, y + h - 15, "24 DEAD", 2, ORANGE);
  }
}

// ---------------------------------------------------------------- layout
function drawMasthead(): void {
  drawTextC(512, 20, "THE WORLD IN ONE DAY", 7, INK);
  hrule(24, 78, 976, INK, 2);
  hrule(24, 82, 976, INK, 1);
  drawTextC(512, 90, "TUESDAY 24 NOVEMBER 2026", 3, RED);
  drawTextC(512, 118, `${STORY_TOTAL} STORIES - 7 REGIONS - ONE FRONT PAGE`, 2, INK);
  drawTextC(512, 142, LEAD_HEADLINE, 5, INK);
  drawTextC(512, 182, LEAD_SUB, 2, RED);
  hrule(24, 202, 976, INK, 2);
  hrule(24, 206, 976, INK, 1);
}

function drawLeadPanel(): void {
  const x = 24;
  const y = 212;
  const w = 976;
  const h = 290;
  frame(x, y, w, h, INK, 2);
  drawLeadScene(x + 2, y + 2, w - 4, h - 4 - 32);
  // "LEAD STORY" tag, top-left over the hall wall.
  box(x + 10, y + 10, textW("LEAD STORY", 1) + 12, 13, RED);
  drawText(x + 16, y + 13, "LEAD STORY", 1, WHITE);
  // Caption strip at the foot of the panel.
  box(x + 2, y + h - 34, w - 4, 32, NAVY);
  const cap = wrap(LEAD_CAPTION, w - 24, 1);
  drawLines(x + 12, y + h - 28, cap, 1, WHITE, 11);
}

function drawSidePanels(): void {
  const xs = [24, 353, 682];
  const w = 318;
  const y = 510;
  const h = 142;
  for (let i = 0; i < PANELS.length; i++) {
    const p = PANELS[i];
    const x = xs[i];
    frame(x, y, w, h, INK, 2);
    drawMiniArt(p.art, x + 6, y + 6, 100, 130);
    frame(x + 6, y + 6, 100, 130, INK, 1);
    const tx = x + 114;
    const tw = w - 124;
    drawText(tx, y + 8, p.kicker, 1, RED);
    const head = wrap(p.headline, tw, 2);
    let yy = drawLines(tx, y + 22, head, 2, INK, 16);
    const sub = wrap(p.sub, tw, 1);
    drawLines(tx, yy + 5, sub, 1, INK, 11);
  }
}

function drawIndex(): void {
  drawText(24, 664, `THE DAY IN BRIEF - ${INDEX_TOTAL} MORE STORIES, REGION BY REGION`, 2, RED);
  hrule(24, 686, 976, INK, 2);
  const cols: Array<{ x: number; w: number; regions: number[] }> = [
    { x: 24, w: 312, regions: [0, 1, 2] },
    { x: 352, w: 312, regions: [2, 3] },
    { x: 680, w: 320, regions: [4, 5, 6] },
  ];
  // Asia is split: first 3 items in column 1, the rest in column 2.
  let n = 0;
  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    let y = 698;
    for (const ri of col.regions) {
      const region = REGIONS[ri];
      const items =
        ri === 2 ? (ci === 0 ? region.items.slice(0, 3) : region.items.slice(3)) : region.items;
      drawText(col.x, y, region.name, 2, RED);
      hrule(col.x, y + 16, col.w, CREAM, 1);
      y += 22;
      for (const item of items) {
        n++;
        const num = String(n).padStart(2, "0") + ".";
        const lines = wrap(item, col.w - 22, 1);
        drawText(col.x, y, num, 1, RED);
        drawLines(col.x + 22, y, lines, 1, INK, 11);
        y += lines.length * 11 + 4;
      }
      y += 6;
    }
  }
}

function drawFooter(): void {
  hrule(24, 978, 976, INK, 1);
  drawTextC(
    512,
    988,
    "ALL STORIES AS FIRST REPORTED ON TUESDAY 24 NOVEMBER 2026 - THE WORLD IN ONE DAY",
    1,
    INK,
  );
}

function main(): void {
  box(0, 0, W, H, PAPER);
  frame(4, 4, W - 8, H - 8, INK, 3);
  drawMasthead();
  drawLeadPanel();
  drawSidePanels();
  drawIndex();
  drawFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), encodePNG());
}

main();
