#!/usr/bin/env node
/**
 * 수상작 전시 빌드 스크립트
 * ------------------------------------------------------------------
 * `수상작/` 폴더의 이미지와 `수상작목록.csv`(캡션), `전시정보.json`(전시 제목 등)을
 * 읽어서 다음 두 가지를 만든다.
 *
 *   1) public/artworks/award-001.png …   — 웹에서 쓰는 이미지 사본 (영문 파일명)
 *   2) public/exhibition.json             — 전시관이 읽는 작품 목록 + 캡션 + 전시 정보
 *
 * `npm run dev` / `npm run build` 전에 자동으로 실행된다 (predev / prebuild).
 * 직접 실행: `npm run exhibition`
 *
 * 의존성 없음(순수 Node). 엑셀에서 저장한 CSV(UTF-8 또는 CP949) 모두 읽는다.
 * ------------------------------------------------------------------
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC_DIR = join(ROOT, "수상작");
const CSV_FILE = join(SRC_DIR, "수상작목록.csv");
const INFO_FILE = join(SRC_DIR, "전시정보.json");
const OUT_IMG_DIR = join(ROOT, "public", "artworks");
const OUT_JSON = join(ROOT, "public", "exhibition.json");

const SILENT = process.argv.includes("--silent");
const log = (...a) => !SILENT && console.log(...a);
const warn = (...a) => console.warn("  ⚠", ...a);

const VALID_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const BIG_FILE = 4 * 1024 * 1024; // 4MB 넘으면 경고 (모바일 로딩이 느려짐)

const DEFAULT_INFO = {
  상단문구: "",
  제목: "한글 이름 꾸미기 대회",
  부제: "수상작 전시관",
  소개문구: "",
  안내제목: "전시관에 오신 것을 환영합니다",
  안내문: "작품 가까이 다가가면 수상자와 작품 설명을 볼 수 있습니다.",
  수상부문순서: ["대상", "최우수상", "우수상", "장려상", "입선"],
};

/** 배경 사진 파일 이름 (확장자 제외). 수상작 목록에서는 빠진다. */
const BG_BASENAME = "배경";

/** 이미지 가로·세로 픽셀을 파일 머리에서 읽는다 (PNG / JPEG / WebP). 실패하면 null. */
function imageSize(file) {
  try {
    const b = readFileSync(file);
    // PNG
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    }
    // JPEG: SOFn 마커를 찾는다
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) {
          i++;
          continue;
        }
        const m = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
    }
    // WebP
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") {
        const v = b.readUInt32LE(21);
        return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
      }
      if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** macOS 파일명은 자모가 분리된(NFD) 형태라서 NFC로 맞춘 뒤 비교한다. */
const norm = (s) => String(s ?? "").normalize("NFC").trim();
const key = (s) => norm(s).toLowerCase();

/** UTF-8로 읽고, 깨지면 엑셀 기본 저장 형식인 CP949(EUC-KR)로 다시 읽는다. */
function readText(file) {
  const buf = readFileSync(file);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}

/** 따옴표·쉼표·줄바꿈이 들어간 셀까지 처리하는 작은 CSV 파서. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** 머리글 이름으로 열을 찾는다 (영문 머리글도 허용). */
function findCol(header, names) {
  const h = header.map((x) => key(x).replace(/\s+/g, ""));
  for (const n of names) {
    const i = h.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function readInfo() {
  if (!existsSync(INFO_FILE)) return { ...DEFAULT_INFO };
  try {
    return { ...DEFAULT_INFO, ...JSON.parse(readText(INFO_FILE)) };
  } catch (e) {
    warn(`전시정보.json을 읽지 못했습니다 (${e.message}). 기본값을 사용합니다.`);
    return { ...DEFAULT_INFO };
  }
}

function readCaptions() {
  if (!existsSync(CSV_FILE)) {
    warn("수상작목록.csv가 없습니다. 파일명만으로 전시합니다.");
    return [];
  }
  const rows = parseCsv(readText(CSV_FILE));
  if (rows.length < 2) return [];
  const [header, ...body] = rows;
  const col = {
    file: findCol(header, ["파일명", "파일", "file", "filename"]),
    name: findCol(header, ["이름", "성명", "수상자", "name"]),
    nation: findCol(header, ["국적", "나라", "국가", "nationality", "country"]),
    award: findCol(header, ["수상부문", "수상", "부문", "상", "award"]),
    desc: findCol(header, ["작품설명", "설명", "소감", "description"]),
  };
  if (col.file < 0) {
    warn("CSV 첫 줄에 '파일명' 열이 없습니다.");
    return [];
  }
  const get = (r, i) => (i >= 0 ? norm(r[i]) : "");
  return body.map((r, line) => ({
    line: line + 2,
    file: get(r, col.file),
    name: get(r, col.name),
    nation: get(r, col.nation),
    award: get(r, col.award),
    desc: get(r, col.desc),
  }));
}

function listImages() {
  if (!existsSync(SRC_DIR)) return [];
  return readdirSync(SRC_DIR)
    .filter((f) => !f.startsWith("."))
    .filter((f) => VALID_EXT.has(extname(f).toLowerCase()))
    .filter((f) => statSync(join(SRC_DIR, f)).isFile())
    .filter((f) => norm(f).replace(/\.[^.]+$/, "") !== BG_BASENAME)
    .sort((a, b) => norm(a).localeCompare(norm(b), "ko"));
}

function main() {
  const info = readInfo();
  const order = (info.수상부문순서 ?? []).map(norm);
  const images = listImages();
  const captions = readCaptions();

  const imageByKey = new Map(images.map((f) => [key(f), f]));
  // 확장자 없이 적어도 찾을 수 있게
  for (const f of images) {
    const base = key(f).replace(/\.[^.]+$/, "");
    if (!imageByKey.has(base)) imageByKey.set(base, f);
  }

  const entries = [];
  const used = new Set();
  for (const c of captions) {
    if (!c.file) continue;
    const f = imageByKey.get(key(c.file));
    if (!f) {
      warn(`CSV ${c.line}번째 줄: '${c.file}' 이미지가 수상작 폴더에 없습니다.`);
      continue;
    }
    if (used.has(f)) {
      warn(`CSV ${c.line}번째 줄: '${c.file}'이(가) 두 번 적혀 있습니다. 첫 줄만 사용합니다.`);
      continue;
    }
    used.add(f);
    entries.push({ file: f, ...c });
  }
  for (const f of images) {
    if (used.has(f)) continue;
    warn(`'${norm(f)}'은(는) CSV에 없어 캡션 없이 전시합니다.`);
    entries.push({ file: f, name: norm(f).replace(/\.[^.]+$/, ""), nation: "", award: "", desc: "", line: Infinity });
  }

  // 수상 부문 순서 → CSV 순서로 정렬. 순서표에 없는 부문은 그 뒤에.
  const rank = (a) => {
    const i = order.indexOf(a);
    return i >= 0 ? i : a ? order.length : order.length + 1;
  };
  entries.forEach((e, i) => (e.seq = i));
  entries.sort((a, b) => rank(a.award) - rank(b.award) || a.seq - b.seq);

  // 출력 폴더 비우고 다시 복사 (영문 파일명으로 — URL 인코딩 문제 방지)
  if (existsSync(OUT_IMG_DIR)) rmSync(OUT_IMG_DIR, { recursive: true, force: true });
  mkdirSync(OUT_IMG_DIR, { recursive: true });
  writeFileSync(join(OUT_IMG_DIR, ".gitkeep"), "");

  const artworks = entries.map((e, i) => {
    const ext = extname(e.file).toLowerCase();
    const out = `award-${String(i + 1).padStart(3, "0")}${ext}`;
    const from = join(SRC_DIR, e.file);
    copyFileSync(from, join(OUT_IMG_DIR, out));
    if (statSync(from).size > BIG_FILE) {
      warn(`'${norm(e.file)}' 용량이 큽니다 (${(statSync(from).size / 1048576).toFixed(1)}MB). 2000px 이하로 줄이면 모바일에서 빨리 뜹니다.`);
    }
    const size = imageSize(from);
    return {
      id: `awards/${out}`,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      src: `/artworks/${out}`,
      collection: "awards",
      fileName: norm(e.file),
      title: e.name,
      name: e.name,
      nationality: e.nation,
      award: e.award,
      awardRank: rank(e.award),
      description: e.desc,
      hero: false,
    };
  });

  // 가장 높은 부문의 첫 작품을 입구 정면(대표 작품)으로
  if (artworks.length > 0) artworks[0].hero = true;

  // 배경 사진 (선택): 수상작/배경.jpg — 360° 파노라마(가로:세로 = 2:1)면 하늘 전체, 아니면 먼 배경막으로 쓴다.
  let background = null;
  const bgFile = readdirSync(SRC_DIR).find(
    (f) => norm(f).replace(/\.[^.]+$/, "") === BG_BASENAME && VALID_EXT.has(extname(f).toLowerCase())
  );
  if (bgFile) {
    const ext = extname(bgFile).toLowerCase();
    copyFileSync(join(SRC_DIR, bgFile), join(OUT_IMG_DIR, `background${ext}`));
    const size = imageSize(join(SRC_DIR, bgFile));
    const aspect = size ? size.width / size.height : 0;
    background = {
      src: `/artworks/background${ext}`,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      panorama: aspect > 1.8 && aspect < 2.2,
    };
    log(`✓ 배경 사진: ${norm(bgFile)} (${background.panorama ? "360° 파노라마" : "일반 사진 — 먼 배경막으로 사용"})`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    info,
    background,
    count: artworks.length,
    artworks,
  };
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));

  const byAward = {};
  for (const a of artworks) byAward[a.award || "(부문 없음)"] = (byAward[a.award || "(부문 없음)"] ?? 0) + 1;
  log(`✓ 수상작 ${artworks.length}점 준비 완료 → public/exhibition.json`);
  log("  " + Object.entries(byAward).map(([k, v]) => `${k} ${v}`).join(" · "));
}

main();
