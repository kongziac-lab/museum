"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useProgress } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { useGallery } from "@/lib/gallery";
import type { Commemoration } from "@/lib/types";

/*
 * 불러오는 화면 — 한글날 기념 플래시.
 * 3D 전시장(정문 첫 화면)을 불러오는 동안 짙은 남색 바탕에 기념 두 가지(예: 훈민정음 반포 580돌 · 한글날 기념식 100돌)를
 * 파랑·빨강 두 판으로 보이고, 판마다 옛 글자·자모가 천천히 흐른다. 가운데 둥근 표지는 '한글'을 여러 나라 글자로 바꿔 보인다.
 * 아래에 실제로 불러온 만큼 000 → 100 을 세고, 다 불러오면 화면 전체가 위로 걷히며 정문 첫 화면이 나온다.
 */

/** 너무 빨리 불러와도 이만큼은 보여 준다 (글자가 다 올라오게) */
const MIN_MS = 2600;
/** 배경을 끝내 못 불러와도 이만큼 지나면 걷는다 (정문 화면의 '준비 중'이 이어받는다) */
const MAX_MS = 30000;

/** 판 색과 흐르는 글자 (첫 판: 훈민정음, 둘째 판: 가갸날) */
const THEMES = [
  {
    bg: "linear-gradient(160deg,#0d3168 0%,#071d44 100%)",
    shade: "rgba(4,15,38,.58)",
    glyph: "rgba(140,180,255,.09)",
    accent: "#9dbcf0",
    soft: "rgba(220,232,255,.78)",
    rows: [
      "ㄱ ㅋ ㆁ ㄷ ㅌ ㄴ ㅂ ㅍ ㅁ ㅈ ㅊ ㅅ ㆆ ㅎ ㅇ ㄹ ㅿ ㆍ ㅡ ㅣ ㅗ ㅏ ㅜ ㅓ ㅛ ㅑ ㅠ ㅕ",
      "나 랏 말 싸 미 듕 귁 에 달 아 문 짜 와 로 서 르 사 맛 디 아 니 할 쎄",
      "훈 민 정 음 · 백 성 을 가 르 치 는 바 른 소 리 · 세 종 어 제",
      "하 늘 ㆍ 땅 ㅡ 사 람 ㅣ 천 지 인 · 스 물 여 덟 글 자",
      "ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ ㅏ ㅑ ㅓ ㅕ ㅗ ㅛ ㅜ ㅠ ㅡ ㅣ",
      "날 로 쓰 메 편 안 킈 하 고 져 할 따 라 미 니 라",
    ],
  },
  {
    bg: "linear-gradient(200deg,#8e1a2c 0%,#530d1c 100%)",
    shade: "rgba(40,5,12,.58)",
    glyph: "rgba(255,170,180,.09)",
    accent: "#f2adb6",
    soft: "rgba(255,228,232,.78)",
    rows: [
      "가 갸 거 겨 고 교 구 규 그 기 나 냐 너 녀 노 뇨 누 뉴 느 니",
      "가 갸 날 · 1926 · 한 글 날 · 조 선 어 연 구 회 · 가 갸 날",
      "다 댜 더 뎌 도 됴 두 듀 드 디 라 랴 러 려 로 료 루 류 르 리",
      "한 글 날 · 10 월 9 일 · 한 글 날 · 우 리 말 우 리 글",
      "마 먀 머 며 모 묘 무 뮤 므 미 바 뱌 버 벼 보 뵤 부 뷰 브 비",
      "사 샤 서 셔 소 쇼 수 슈 스 시 아 야 어 여 오 요 우 유 으 이",
    ],
  },
] as const;

/** 가운데 표지에서 돌아가며 보이는 '한글' */
const WORDS = ["한글", "Hangul", "韩文", "ハングル", "Хангыль", "ฮันกึล", "Hangeul"];

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Drift({ rows, color }: { rows: readonly string[]; color: string }) {
  const sizes = [60, 76, 56, 70, 58, 72];
  const speeds = [70, 92, 80, 100, 86, 96];
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-[60px] flex flex-col justify-around overflow-hidden">
      {rows.map((r, i) => (
        <div
          key={i}
          className="sp-row sp-serif font-black leading-none"
          style={{
            fontSize: `clamp(38px, ${sizes[i % 6] / 10}vmin + 14px, ${sizes[i % 6]}px)`,
            color,
            animation: `${i % 2 ? "sp-drift-r" : "sp-drift"} ${speeds[i % 6]}s linear infinite`,
          }}
        >
          {/* 두 번 이어 붙여 끝없이 흐르게 */}
          <span className="pr-[0.6em]">{r}</span>
          <span className="pr-[0.6em]">{r}</span>
        </div>
      ))}
    </div>
  );
}

/** 글자가 아래에서 한 자씩 올라온다 */
function Rise({ text, delay, step = 0.08 }: { text: string; delay: number; step?: number }) {
  return (
    <>
      {[...text].map((c, i) => (
        <span key={i} className="inline-block overflow-hidden align-top">
          <span className="sp-char" style={{ "--d": `${delay + i * step}s` } as CSSProperties}>
            {c === " " ? " " : c}
          </span>
        </span>
      ))}
    </>
  );
}

function Panel({ item, theme, delay, single, first }: { item: Commemoration; theme: (typeof THEMES)[number]; delay: number; single: boolean; first: boolean }) {
  const unit = item.단위 ?? "돌";
  return (
    <section className="relative min-h-0 flex-1 overflow-hidden" style={{ background: theme.bg }} aria-label={`${item.이름} ${item.햇수}${unit}`}>
      <Drift rows={theme.rows} color={theme.glyph} />
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 0%, ${theme.shade} 100%)` }} />
      {/* 위 머리글·가운데 표지 자리를 비워 두고 가운데 맞춘다 (판 높이는 두 판이 같게, 비움은 안쪽에서) */}
      <div
        className={`absolute inset-0 z-[2] flex items-center justify-center md:pb-0 md:pt-16 ${first || single ? "pt-14" : ""} ${
          single ? "" : first ? "pb-[calc(var(--badge)/2)]" : "pt-[calc(var(--badge)/2)]"
        }`}
      >
        <div className="flex flex-col items-center px-6 text-center">
          {item.영문 && (
            <span className="sp-mono sp-in text-[10px] font-medium tracking-[0.34em] md:text-[11px] md:tracking-[0.38em]" style={{ color: theme.accent, "--d": `${delay + 0.3}s` } as CSSProperties}>
              {item.영문}
            </span>
          )}
          <h2
            className="sp-serif mt-2 flex items-end font-black leading-[0.95] tracking-[0.01em] md:mt-3"
            style={{ fontSize: single ? "clamp(72px, min(26vw, 22vh), 200px)" : "var(--num)" }}
          >
            <Rise text={String(item.햇수)} delay={delay} />
            <span className="ml-[0.06em] pb-[0.08em] text-[0.42em] font-black">
              <Rise text={unit} delay={delay + String(item.햇수).length * 0.08} />
            </span>
          </h2>
          <p className="sp-serif sp-in mt-2 text-[19px] font-semibold tracking-[0.04em] md:mt-3 md:text-[clamp(20px,2vw,28px)]" style={{ "--d": `${delay + 0.45}s` } as CSSProperties}>
            {item.이름}
          </p>
          {(item.기간 || item.설명) && (
            <p className="sp-in mt-1.5 text-[13px] font-light leading-relaxed md:mt-2 md:text-[15px]" style={{ color: theme.soft, "--d": `${delay + 0.6}s` } as CSSProperties}>
              {item.기간 && <span className="sp-mono tracking-[0.18em]">{item.기간}</span>}
              {item.기간 && item.설명 && <br className="md:hidden max-md:[@media(max-height:720px)]:hidden" />}
              {item.기간 && item.설명 && <span className="hidden md:inline [@media(max-height:520px)]:hidden"> · </span>}
              {item.설명 && <span className="max-md:[@media(max-height:720px)]:hidden [@media(max-height:520px)]:hidden">{item.설명}</span>}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Badge({ ring, delay }: { ring: string; delay: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    let id = 0;
    const t = window.setTimeout(() => {
      id = window.setInterval(() => setW((v) => (v + 1) % WORDS.length), 2200);
    }, delay * 1000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [delay]);
  const word = WORDS[w];
  const R = 58;
  return (
    <div aria-hidden className="absolute left-1/2 top-1/2 z-[18] h-[var(--badge)] w-[var(--badge)] -translate-x-1/2 -translate-y-1/2 rounded-full">
      <span className="sp-in absolute inset-0 block" style={{ "--d": `${delay}s` } as CSSProperties}>
        <span className="absolute inset-0 rounded-full border border-white/20 bg-[rgba(6,18,43,.74)] backdrop-blur-md" />
        <svg viewBox="0 0 158 158" className="sp-spin absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <path id="sp-ring" d={`M79,79 m-${R},0 a${R},${R} 0 1,1 ${2 * R},0 a${R},${R} 0 1,1 -${2 * R},0`} />
          </defs>
          <text className="sp-mono" style={{ fontSize: 9.5, fontWeight: 500, fill: "rgba(255,255,255,.8)" }} textLength={2 * Math.PI * R - 4} lengthAdjust="spacing">
            <textPath href="#sp-ring">{ring}</textPath>
          </text>
        </svg>
        <span className="absolute inset-0 grid place-items-center px-8">
          <span
            key={w}
            className="sp-serif sp-in font-black leading-tight text-white"
            style={{ fontSize: word.length > 3 ? "calc(var(--badge) * 0.1)" : "calc(var(--badge) * 0.15)" }}
          >
            {word}
          </span>
        </span>
      </span>
    </div>
  );
}

export function Splash() {
  const loaded = useGallery((s) => s.loaded);
  const sceneryReady = useGallery((s) => s.sceneryReady);
  const info = useGallery((s) => s.info);
  const count = useGallery((s) => s.arts.length);
  const { progress } = useProgress();
  // 작품이 하나도 없으면 배경을 기다리지 않는다 (정문 화면이 알려 준다)
  const ready = loaded && (sceneryReady || count === 0);

  const [t0] = useState(() => performance.now());
  const [done, setDone] = useState(false);
  // 배경을 끝내 못 불러와도 MAX_MS 가 지나면 걷는다
  useEffect(() => {
    const id = window.setTimeout(() => setDone(true), MAX_MS);
    return () => window.clearTimeout(id);
  }, []);

  // 불러온 만큼 부드럽게 센다 (다 불러오기 전에는 99 에서 멈춘다)
  const target = ready ? 100 : Math.min(99, Math.round(progress));
  const [n, setN] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = shown.current;
      if (v >= target) return;
      shown.current = Math.min(target, v + Math.max(1, Math.round((target - v) * 0.12)));
      setN(shown.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  // 100 까지 다 센 뒤에 걷는다 (너무 빨리 불러와도 MIN_MS 는 보여 준다)
  useEffect(() => {
    if (!ready || n < 100) return;
    const id = window.setTimeout(() => setDone(true), Math.max(0, MIN_MS - (performance.now() - t0)) + 300);
    return () => window.clearTimeout(id);
  }, [ready, n, t0]);

  const D = 0.15;
  const items: Commemoration[] = info.기념?.length
    ? info.기념.slice(0, 2)
    : [{ 햇수: info.제목 ?? "한글 이름 꾸미기 대회", 단위: "", 이름: info.부제 ?? "수상작 전시관" }];
  const single = items.length === 1;
  const ring = `${items.map((k) => `${k.이름} ${k.햇수}${k.단위 ?? "돌"}`).join(" · ")} · HANGUL DAY · `;
  const title = info.제목 ?? "한글 이름 꾸미기 대회";
  const sub = info.부제 ?? "수상작 전시관";
  const marquee = [
    ...items.map((k) => `${k.이름} ${k.햇수}${k.단위 ?? "돌"}`),
    "HANGUL DAY",
    info.상단문구,
    `${title} ${sub}`,
    "KEIMYUNG UNIVERSITY",
  ].filter(Boolean) as string[];

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="splash"
          role="status"
          aria-label={`${title} ${sub}을 불러오고 있습니다`}
          className="absolute inset-0 z-[60] flex flex-col overflow-hidden bg-[#06122b] text-white [word-break:keep-all] [--badge:clamp(80px,min(24vw,12vh),158px)] [--num:clamp(60px,min(24vw,10.5vh),176px)] md:[--badge:clamp(96px,min(11vw,18vh),172px)] md:[--num:clamp(64px,min(13.5vw,22vh),220px)]"
          initial={{ y: 0 }}
          exit={{ y: "-101%", transition: { duration: 0.9, ease: [0.7, 0, 0.3, 1] } }}
        >
          {/* 위: 학당 이름 · 한글날 */}
          <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-[max(18px,env(safe-area-inset-top))] mix-blend-screen md:px-9 md:pt-7">
            <div className="flex flex-col gap-1.5">
              <span className="sp-serif sp-in text-[15px] font-black leading-none tracking-[0.06em] md:text-[18px]" style={{ "--d": `${D + 0.05}s` } as CSSProperties}>
                {info.상단문구 ?? "계명대학교 한국어학당"}
              </span>
              <span className="sp-mono sp-in text-[9px] leading-none tracking-[0.28em] opacity-60 md:text-[10px]" style={{ "--d": `${D + 0.2}s` } as CSSProperties}>
                KEIMYUNG UNIVERSITY
              </span>
            </div>
            <span className="sp-mono sp-in text-right text-[9px] leading-[1.6] tracking-[0.26em] opacity-70 md:text-[10px]" style={{ "--d": `${D + 0.25}s` } as CSSProperties}>
              HANGUL DAY
              {info.기념일 && (
                <>
                  <br />
                  {info.기념일}
                </>
              )}
            </span>
          </header>

          {/* 기념 두 판 + 가운데 표지 (숫자 크기 --num: 좁은 화면은 위아래 두 판, 넓은 화면은 좌우 두 판) */}
          <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
            {items.map((k, i) => (
              <Panel key={i} item={k} theme={THEMES[i % 2]} delay={D + i * 0.1} single={single} first={i === 0} />
            ))}
            {!single && <Badge ring={ring} delay={D + 0.55} />}
          </div>

          {/* 아래: 전시 이름 · 불러온 만큼 */}
          <div className="relative z-20 border-t border-white/[0.14] bg-[#06122b] px-5 py-4 md:px-9 md:py-5 [@media(max-height:520px)]:py-2.5">
            {/* 윗줄이 불러온 만큼 차오른다 */}
            <div className="absolute inset-x-0 -top-px h-px origin-left bg-[#f4ead5] transition-transform duration-300 ease-out" style={{ transform: `scaleX(${n / 100})` }} />
            <div className="flex items-end justify-between gap-5">
              <div className="sp-in min-w-0" style={{ "--d": `${D + 0.7}s` } as CSSProperties}>
                <p className="sp-serif text-[18px] font-black leading-tight tracking-[0.02em] md:text-[clamp(20px,2vw,26px)] [@media(max-height:520px)]:text-[16px]">
                  {title} <span className="font-semibold text-white/70">{sub}</span>
                </p>
                <p className="sp-mono sp-blink mt-1.5 text-[10px] tracking-[0.3em] text-white/55 md:text-[11px]">{ready ? "READY — 전시장으로" : "LOADING — 전시장을 준비하고 있어요"}</p>
              </div>
              <span className="sp-mono shrink-0 text-[44px] font-medium leading-none tracking-[0.04em] tabular-nums md:text-[64px] [@media(max-height:520px)]:text-[34px]" aria-hidden>
                {String(n).padStart(3, "0")}
              </span>
            </div>
          </div>

          {/* 맨 아래 흐르는 띠 */}
          <div className="relative z-20 flex h-9 shrink-0 items-center overflow-hidden border-t border-white/[0.14] bg-[#06122b] pb-[env(safe-area-inset-bottom)] max-md:[@media(max-height:700px)]:hidden md:h-[46px] [@media(max-height:520px)]:hidden" aria-hidden>
            <div className="sp-row sp-mono text-[10px] tracking-[0.3em] text-white/55 md:text-[11px]" style={{ animation: "sp-drift 36s linear infinite" }}>
              {[0, 1].map((j) => (
                <span key={j} className="pr-[0.3em]">
                  {marquee.join(" — ")} —&nbsp;
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
