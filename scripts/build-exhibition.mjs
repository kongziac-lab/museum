#!/usr/bin/env node
/**
 * 수상작 전시 빌드 스크립트
 * ------------------------------------------------------------------
 * `수상작/` 폴더의 이미지와 `수상작목록.csv`(캡션), `전시정보.json`(전시 제목 등)을
 * 읽어서 다음 두 가지를 만든다.
 *
 *   1) public/artworks/award-001.png …   — 웹에서 쓰는 이미지 사본 (영문 파일명, 크게 보기용 원본)
 *      public/artworks/award-001.tex.webp — 3D 액자에 거는 텍스처 (긴 변 1024 px)
 *      public/artworks/award-001.thumb.webp — 작품 띠·목록·멀리 있는 액자용 썸네일 (긴 변 320 px)
 *   2) public/exhibition.json             — 전시관이 읽는 작품 목록 + 캡션 + 전시 정보
 *
 * 수상부문이 하나도 적혀 있지 않으면 '전시 모드'다: 대표 작품 없이, 전시정보.json 의 전시순서에 따라
 *   "가나다순"(기본) — 한글 이름 가나다 순, 구역 표지 없음
 *   "영문순"        — 영문 이름 알파벳 순, 구역 표지 없음
 *   "국적별"        — 같은 나라끼리 (3점 이상인 나라만 따로, 나머지는 '여러 나라'), 나라마다 표지
 *   "목록순"        — CSV 순서 그대로, 구역 표지 없음
 * 영문이름 열이 비어 있으면 영문 이름을 표시하지 않는다 ("영문순"일 때만 한글 이름을 로마자(국어의 로마자 표기법)로 바꿔 순서를 정한다).
 * 수상부문을 채우면 '시상 모드'로 바뀌어 부문 순서대로 다시 걸리고(부문 안에서는 전시순서를 따른다), 가장 높은 부문의 첫 작품이 대표 작품이 된다.
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

/** 썸네일·텍스처를 만드는 데 쓴다 (없으면 원본을 그대로 쓴다) */
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  sharp = null;
}

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
  부제: "작품 전시관",
  소개문구: "",
  안내제목: "전시관에 오신 것을 환영합니다",
  안내문: "작품 가까이 다가가면 수상자와 작품 설명을 볼 수 있습니다.",
  수상부문순서: ["대상", "최우수상", "우수상", "장려상", "입선"],
  전시순서: "가나다순",
};

/** 전시 모드에서 나라별 묶음을 따로 세우는 최소 점수 (이보다 적은 나라는 '여러 나라'로 모은다) */
const MIN_GROUP = 3;
const MIXED_GROUP = "여러 나라";
/** 3D 텍스처·썸네일 긴 변 (px) */
const TEX_PX = 1024;
const THUMB_PX = 320;

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
    en: findCol(header, ["영문이름", "영문", "영문성명", "english", "name_en", "englishname"]),
    nation: findCol(header, ["국적", "나라", "국가", "nationality", "country"]),
    award: findCol(header, ["수상부문", "수상", "부문", "상", "award"]),
    desc: findCol(header, ["작품설명", "설명", "소감", "description"]),
    ban: findCol(header, ["분반", "반", "class"]),
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
    en: get(r, col.en),
    nation: get(r, col.nation),
    award: get(r, col.award),
    desc: get(r, col.desc),
    // 숫자만 적어도 "3반"처럼 보이게
    ban: get(r, col.ban).replace(/^(\d+)$/, "$1반"),
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

/** 이미지 한 장을 긴 변 px 이하 webp 로 줄인다. 실패하면 null (원본을 쓴다). */
async function shrink(from, to, px, quality) {
  if (!sharp) return null;
  try {
    await sharp(from).rotate().resize(px, px, { fit: "inside", withoutEnlargement: true }).webp({ quality }).toFile(to);
    return to;
  } catch (e) {
    warn(`'${norm(from)}'을(를) 줄이지 못했습니다 (${e.message}). 원본을 그대로 씁니다.`);
    return null;
  }
}

/* 한글 → 로마자 (국어의 로마자 표기법, 음절 단위 — 영문이름을 비워 둔 작품의 "영문순" 정렬에만 쓰고, 화면에는 내보내지 않는다) */
const RR_INIT = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const RR_MED = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const RR_FIN = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
function romanize(ko) {
  const word = (w) => {
    let out = "";
    for (const ch of w) {
      const c = ch.codePointAt(0) - 0xac00;
      if (c < 0 || c > 11171) {
        out += ch;
        continue;
      }
      const i = Math.floor(c / 588);
      const m = Math.floor((c % 588) / 28);
      const f = c % 28;
      out += (out === "" && i === 5 ? "l" : RR_INIT[i]) + RR_MED[m] + RR_FIN[f];
    }
    return out.charAt(0).toUpperCase() + out.slice(1);
  };
  const words = norm(ko).split(/\s+/).filter(Boolean);
  // 띄어 쓰지 않은 세 글자 한글 이름은 성과 이름을 나눈다 (김민준 → Gim Minjun)
  if (words.length === 1 && /^[가-힣]{3}$/.test(words[0])) return `${word(words[0][0])} ${word(words[0].slice(1))}`;
  return words.map(word).join(" ");
}

/** 가나다 순 비교 (한글 이름, 같으면 CSV 순서) · 알파벳 순 비교 (영문 이름, 대소문자·악센트 무시) */
const byKorean = (a, b) => a.name.localeCompare(b.name, "ko") || a.seq - b.seq;
const byEnglish = (a, b) => a.sortEn.localeCompare(b.sortEn, "en", { sensitivity: "base" }) || a.seq - b.seq;
/** 전시순서 → 비교 함수 (목록순·국적별은 CSV 순서) */
function orderOf(info) {
  const o = norm(info.전시순서);
  if (o === "영문순") return byEnglish;
  if (o === "목록순" || o === "국적별") return (a, b) => a.seq - b.seq;
  return byKorean;
}

/**
 * 전시 모드 국적별 순서: 3점 이상인 나라는 점수가 많은 나라부터(같으면 목록에 먼저 나온 나라부터) 한데 모으고,
 * 나머지 나라는 '여러 나라'로 맨 뒤에. 같은 묶음 안에서는 CSV 순서.
 */
function groupByNation(entries) {
  const count = new Map();
  const first = new Map();
  entries.forEach((e, i) => {
    const k = e.nation || MIXED_GROUP;
    count.set(k, (count.get(k) ?? 0) + 1);
    if (!first.has(k)) first.set(k, i);
  });
  const label = (e) => {
    const k = e.nation || MIXED_GROUP;
    return count.get(k) >= MIN_GROUP && k !== MIXED_GROUP ? k : MIXED_GROUP;
  };
  const rank = (g) => (g === MIXED_GROUP ? [1, 0, 0] : [0, -count.get(g), first.get(g)]);
  const cmp = (a, b) => {
    const ra = rank(a.group);
    const rb = rank(b.group);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || a.seq - b.seq;
  };
  entries.forEach((e) => (e.group = label(e)));
  return entries.sort(cmp);
}

async function main() {
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
    entries.push({ file: f, name: norm(f).replace(/\.[^.]+$/, ""), en: "", nation: "", award: "", desc: "", line: Infinity });
  }

  // 수상 부문 순서 → CSV 순서로 정렬. 순서표에 없는 부문은 그 뒤에.
  const rank = (a) => {
    const i = order.indexOf(a);
    return i >= 0 ? i : a ? order.length : order.length + 1;
  };
  entries.forEach((e, i) => {
    e.seq = i;
    e.sortEn = e.en || romanize(e.name);
  });
  // 수상부문이 하나라도 적혀 있으면 시상 모드, 아니면 전시 모드
  const mode = entries.some((e) => e.award) ? "awards" : "exhibition";
  if (mode === "awards") {
    // 같은 부문 안에서는 전시순서(기본 가나다순)
    const within = orderOf(info);
    entries.sort((a, b) => rank(a.award) - rank(b.award) || within(a, b));
    entries.forEach((e) => (e.group = e.award || ""));
  } else if (norm(info.전시순서) === "국적별") {
    groupByNation(entries);
  } else {
    // 가나다순(기본)·영문순·목록순: 한 줄로 이어 걸고 구역 표지는 세우지 않는다
    entries.sort(orderOf(info));
    entries.forEach((e) => (e.group = ""));
  }

  // 출력 폴더 비우고 다시 복사 (영문 파일명으로 — URL 인코딩 문제 방지)
  if (existsSync(OUT_IMG_DIR)) rmSync(OUT_IMG_DIR, { recursive: true, force: true });
  mkdirSync(OUT_IMG_DIR, { recursive: true });
  writeFileSync(join(OUT_IMG_DIR, ".gitkeep"), "");

  const artworks = [];
  for (const [i, e] of entries.entries()) {
    const ext = extname(e.file).toLowerCase();
    const base = `award-${String(i + 1).padStart(3, "0")}`;
    const out = `${base}${ext}`;
    const from = join(SRC_DIR, e.file);
    copyFileSync(from, join(OUT_IMG_DIR, out));
    const tex = await shrink(from, join(OUT_IMG_DIR, `${base}.tex.webp`), TEX_PX, 86);
    const thumb = await shrink(from, join(OUT_IMG_DIR, `${base}.thumb.webp`), THUMB_PX, 80);
    if (statSync(from).size > BIG_FILE) {
      warn(`'${norm(e.file)}' 용량이 큽니다 (${(statSync(from).size / 1048576).toFixed(1)}MB). 2000px 이하로 줄이면 모바일에서 빨리 뜹니다.`);
    }
    // 크기는 회전(EXIF)을 반영한 텍스처에서 읽는다 (휴대폰 사진이 옆으로 눕지 않게)
    const size = imageSize(tex ?? from);
    artworks.push({
      id: `awards/${out}`,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      src: `/artworks/${out}`,
      tex: tex ? `/artworks/${base}.tex.webp` : `/artworks/${out}`,
      thumb: thumb ? `/artworks/${base}.thumb.webp` : `/artworks/${out}`,
      collection: "awards",
      fileName: norm(e.file),
      title: e.name,
      name: e.name,
      nameEn: e.en || undefined,
      nationality: e.nation,
      classroom: e.ban || undefined,
      award: e.award,
      awardRank: rank(e.award),
      description: e.desc,
      group: e.group || undefined,
      hero: false,
    });
  }
  if (!sharp) warn("sharp 를 불러오지 못해 썸네일 없이 원본 이미지를 씁니다 (npm install 을 다시 해 보세요).");

  // 시상 모드: 가장 높은 부문의 첫 작품을 입구 정면(대표 작품)으로. 전시 모드에는 대표 작품이 없다.
  if (mode === "awards" && artworks.length > 0) artworks[0].hero = true;

  // 배경 사진 (선택): 수상작/배경.jpg — 360° 파노라마(가로:세로 = 2:1)면 기본 공원 하늘 대신 그 사진을 사방 배경으로 쓴다.
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
    if (background.panorama) log(`✓ 배경 사진: ${norm(bgFile)} (360° 파노라마)`);
    else warn(`${norm(bgFile)}은 360° 파노라마(가로:세로 = 2:1)가 아니라서 쓰지 않습니다. 기본 공원 배경을 씁니다.`);
  }

  // 한글날 도입 영상 음악 (선택): public/audio/film.mp3 — 영상 길이(60초)에 맞춘 곡
  const music = existsSync(join(ROOT, "public", "audio", "film.mp3")) ? { film: "/audio/film.mp3" } : null;

  const payload = {
    generatedAt: new Date().toISOString(),
    info,
    background,
    music,
    mode,
    count: artworks.length,
    artworks,
  };
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));

  const byGroup = {};
  for (const a of artworks) byGroup[a.group || "(묶음 없음)"] = (byGroup[a.group || "(묶음 없음)"] ?? 0) + 1;
  log(`✓ ${mode === "awards" ? "시상" : "전시"} 모드 · 작품 ${artworks.length}점 준비 완료 → public/exhibition.json`);
  log("  " + Object.entries(byGroup).map(([k, v]) => `${k} ${v}`).join(" · "));
}

await main();
