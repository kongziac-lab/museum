import { useMemo, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { MONO, SANS, SERIF, ensureFonts } from "./fonts";

/*
 * 한글날 도입 모션 그래픽 (1분, 30fps) — 전시관 첫 화면·행사장 대기 화면·SNS 영상으로 함께 쓴다.
 * 가로(1920×1080)와 세로(1080×1920) 모두 같은 장면을 화면 비율에 맞춰 배치한다.
 *
 *  1. 0–10초   훈민정음: 한지에 먹으로 서문이 세로로 한 자씩 번져 써지고, 붉은 낙관 — 1446
 *  2. 10–22초  천지인(· ㅡ ㅣ)이 그어지고, 기본 자음 ㄱ ㄴ ㅁ ㅅ ㅇ이 소리 나는 자리와 함께 그려진 뒤 스물여덟 글자로 퍼진다
 *  3. 22–34초  1926 가갸날: 옛 신문 위에 활자로 찍히고, 1446 · 1926 · 2026 을 잇는 시간선
 *  4. 34–50초  2026: 자모가 모여 '한글'이 되고, 전시에 참여한 학생들의 이름이 한글로 피어난다 (전시 작품 목록에서 읽는다)
 *  5. 50–60초  기념: 파랑·빨강 두 판에 580돌 · 100돌이 세어 올라가고 전시 제목 (로딩 화면과 같은 모양)
 */

export const FPS = 30;
export const DURATION = 60 * FPS;

export type NameEntry = { name: string; nationality?: string };
export type Commemoration = { 햇수: number | string; 단위?: string; 이름: string; 영문?: string; 기간?: string };
export type HangulDayProps = {
  names: NameEntry[];
  top: string;
  title: string;
  subtitle: string;
  date: string;
  commemorations: Commemoration[];
  /** 영상 음악 (60초에 맞춘 곡의 주소). 없으면 소리 없이 */
  music?: string | null;
};

export const defaultProps: HangulDayProps = {
  names: [
    { name: "응우옌 티 란", nationality: "베트남" },
    { name: "왕샤오위", nationality: "중국" },
    { name: "사이드 알리", nationality: "우즈베키스탄" },
    { name: "아나 마리아", nationality: "멕시코" },
    { name: "바트바야르", nationality: "몽골" },
    { name: "타나카 유키", nationality: "일본" },
  ],
  top: "계명대학교 한국어학당",
  title: "한글 이름 꾸미기 대회",
  subtitle: "작품 전시관",
  date: "2026. 10. 9.",
  commemorations: [
    { 햇수: 580, 단위: "돌", 이름: "훈민정음 반포", 영문: "HUNMINJEONGEUM · 1446", 기간: "1446 — 2026" },
    { 햇수: 100, 단위: "돌", 이름: "한글날 기념식", 영문: "HANGUL DAY · 1926", 기간: "1926 — 2026" },
  ],
};

/** 전시관의 exhibition.json → 영상 props */
export function propsFromExhibition(j: {
  music?: { film?: string } | null;
  artworks?: { name?: string; title?: string; nationality?: string }[];
  info?: { 상단문구?: string; 제목?: string; 부제?: string; 기념일?: string; 기념?: Commemoration[] };
}): HangulDayProps {
  const info = j.info ?? {};
  return {
    names: (j.artworks ?? []).map((a) => ({ name: a.name || a.title || "", nationality: a.nationality })).filter((a) => a.name),
    top: info.상단문구 ?? defaultProps.top,
    title: info.제목 ?? defaultProps.title,
    subtitle: info.부제 ?? defaultProps.subtitle,
    date: info.기념일 ?? defaultProps.date,
    commemorations: info.기념?.length ? info.기념.slice(0, 2) : defaultProps.commemorations,
    music: j.music?.film ?? null,
  };
}

/* ───────────────────────── 색 · 도우미 ───────────────────────── */

const NAVY = "#06122b";
const BLUE = "#0d2c6e";
const RED = "#7c1d27";
const GOLD = "#d6be80";
const PAPER = "#f2ead9";
const INK = "#1b1815";
const SEAL = "#b3261e";
const PETALS = ["#e8a0a8", "#f2c46d", "#9cc7e8", "#b7d99a", "#d9b3e6", "#f7a072", "#8fd3c8"];

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const OUT = Easing.bezier(0.22, 1, 0.36, 1);
const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** start 부터 dur 프레임 동안 0 → 1 (부드럽게) */
function rise(frame: number, start: number, dur = 20, easing = OUT) {
  return interpolate(frame, [start, start + dur], [0, 1], { ...CLAMP, easing });
}

/** 장면 앞뒤를 겹쳐 넘기는 투명도 */
function sceneOpacity(frame: number, dur: number, fadeIn = 18, fadeOut = 18) {
  return Math.min(rise(frame, 0, fadeIn, IN_OUT), 1 - rise(frame, dur - fadeOut, fadeOut, IN_OUT));
}

function useLayout() {
  const { width: W, height: H } = useVideoConfig();
  const portrait = H > W;
  const u = Math.min(W, H) / 1080; // 짧은 변 1080 = 1
  return { W, H, portrait, u };
}

/** 시드가 있는 난수 (매 프레임 같은 배치) */
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const center: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center" };

function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontFamily: MONO, letterSpacing: "0.32em", textTransform: "uppercase", ...style }}>{children}</div>;
}

/* ───────────────────────── 1. 훈민정음 (0–10초) ───────────────────────── */

const PREFACE = ["나랏말싸미", "듕귁에 달아", "문짜와로", "서르 사맛디", "아니할쎄"];

function Hunmin({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const { u, portrait } = useLayout();
  let k = 0;
  const size = (portrait ? 118 : 104) * u;
  // 먹이 번지는 둥근 자국 (종이 가운데)
  const blot = rise(f, 0, 50);
  return (
    <AbsoluteFill style={{ background: PAPER, opacity: sceneOpacity(f, dur, 14, 26) }}>
      <HanjiGrain />
      <AbsoluteFill style={center}>
        <div
          style={{
            width: 900 * u,
            height: 900 * u,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(27,24,21,0.10), rgba(27,24,21,0.03) 55%, transparent 70%)",
            transform: `scale(${0.2 + blot * 0.9})`,
            opacity: blot,
          }}
        />
      </AbsoluteFill>
      {/* 서문: 세로쓰기, 오른쪽 줄부터 (해례본처럼) */}
      <AbsoluteFill style={{ ...center, flexDirection: "row-reverse", gap: size * 0.55 }}>
        {PREFACE.map((line, li) => (
          <div key={li} style={{ writingMode: "vertical-rl", fontFamily: SERIF, fontWeight: 900, fontSize: size, color: INK, lineHeight: 1 }}>
            {[...line].map((ch, ci) => {
              const start = 28 + (k++) * 5;
              const p = rise(f, start, 16);
              return (
                <span
                  key={ci}
                  style={{
                    display: "inline-block",
                    opacity: p,
                    filter: `blur(${(1 - p) * 6 * u}px)`,
                    transform: `translateY(${(1 - p) * -10 * u}px) scale(${1.08 - p * 0.08})`,
                    clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`,
                  }}
                >
                  {ch === " " ? " " : ch}
                </span>
              );
            })}
          </div>
        ))}
      </AbsoluteFill>
      {/* 낙관 */}
      <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "flex-end", padding: portrait ? `0 ${80 * u}px ${260 * u}px` : `0 ${150 * u}px ${110 * u}px` }}>
        <Seal frame={f} start={185} size={118 * u} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: (portrait ? 140 : 60) * u }}>
        <Label style={{ fontSize: 22 * u, color: "rgba(27,24,21,0.7)", opacity: rise(f, 200, 24) }}>Hunminjeongeum · 1446</Label>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Seal({ frame, start, size }: { frame: number; start: number; size: number }) {
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - start, fps, config: { damping: 11, stiffness: 180 } });
  return (
    <div
      style={{
        width: size,
        height: size,
        background: SEAL,
        borderRadius: size * 0.08,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        placeItems: "center",
        padding: size * 0.08,
        color: "#fbeee6",
        fontFamily: SERIF,
        fontWeight: 900,
        fontSize: size * 0.34,
        lineHeight: 1,
        opacity: Math.min(1, s * 1.4),
        transform: `scale(${1.6 - 0.6 * s}) rotate(${(1 - s) * -8}deg)`,
        boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.18)",
      }}
    >
      {["正", "訓", "音", "民"].map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  );
}

/** 한지 결 (고정 잡음) */
function HanjiGrain() {
  return (
    <AbsoluteFill style={{ opacity: 0.35, mixBlendMode: "multiply" }}>
      <svg width="100%" height="100%">
        <filter id="hanji">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.45" numOctaves={3} seed={4} />
          <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.48  0 0 0 0 0.38  0 0 0 0.55 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hanji)" />
      </svg>
    </AbsoluteFill>
  );
}

/* ───────────────────────── 2. 천지인 · 기본자 · 스물여덟 글자 (10–22초) ───────────────────────── */

/** 기본 자음 (100 × 100 칸, 획 순서대로) 과 소리 나는 자리 */
const BASICS: { ch: string; d: string; name: string; hanja: string }[] = [
  { ch: "ㄱ", d: "M18 24 H80 V84", name: "어금닛소리", hanja: "牙音" },
  { ch: "ㄴ", d: "M24 16 V78 H84", name: "혓소리", hanja: "舌音" },
  { ch: "ㅁ", d: "M22 22 V80 M22 22 H78 V80 M22 80 H78", name: "입술소리", hanja: "脣音" },
  { ch: "ㅅ", d: "M52 16 Q46 58 16 84 M50 44 Q64 70 86 84", name: "잇소리", hanja: "齒音" },
  { ch: "ㅇ", d: "M50 20 A31 31 0 1 1 49.9 20", name: "목구멍소리", hanja: "喉音" },
];

const TWENTY_EIGHT = "ㄱㅋㆁㄷㅌㄴㅂㅍㅁㅈㅊㅅㆆㅎㅇㄹㅿㆍㅡㅣㅗㅏㅜㅓㅛㅑㅠㅕ";

function Letters({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, portrait } = useLayout();
  const stroke = 7 * u;
  // 가) 천지인 (0–80)
  const tjiOut = rise(f, 78, 18, IN_OUT);
  const tji = [
    { label: "하늘", hanja: "天", draw: (p: number) => <circle cx="50" cy="50" r={11 * p} fill={GOLD} /> },
    { label: "땅", hanja: "地", draw: (p: number) => <line x1="12" y1="50" x2={12 + 76 * p} y2="50" stroke={GOLD} strokeWidth={9} strokeLinecap="round" /> },
    { label: "사람", hanja: "人", draw: (p: number) => <line x1="50" y1="12" x2="50" y2={12 + 76 * p} stroke={GOLD} strokeWidth={9} strokeLinecap="round" /> },
  ];
  // 나) 기본자 (90–220), 다) 스물여덟 글자 (230–330), 라) 제목 (300–)
  const basicsOut = rise(f, 222, 16, IN_OUT);
  const gridIn = f >= 226;
  const gridOut = rise(f, 300, 20, IN_OUT);
  const cols = portrait ? 4 : 7;
  const cell = (portrait ? 190 : 170) * u;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, #0d2150, ${NAVY} 70%)`, opacity: sceneOpacity(f, dur) }}>
      {f < 100 && (
        <AbsoluteFill style={{ ...center, flexDirection: portrait ? "column" : "row", gap: 90 * u, opacity: 1 - tjiOut }}>
          {tji.map((t, i) => {
            const p = rise(f, 6 + i * 20, 22);
            return (
              <div key={t.label} style={{ ...center, flexDirection: "column", gap: 18 * u }}>
                <svg viewBox="0 0 100 100" width={200 * u} height={200 * u}>
                  {t.draw(p)}
                </svg>
                <div style={{ fontFamily: SANS, fontSize: 40 * u, color: PAPER, opacity: rise(f, 16 + i * 20, 16) }}>
                  {t.label} <span style={{ fontFamily: SERIF, color: GOLD }}>{t.hanja}</span>
                </div>
              </div>
            );
          })}
        </AbsoluteFill>
      )}
      {f >= 86 && f < 240 && (
        <AbsoluteFill style={{ ...center, opacity: 1 - basicsOut }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: portrait ? "repeat(2, auto)" : "repeat(5, auto)",
              gap: `${54 * u}px ${70 * u}px`,
              justifyItems: "center",
            }}
          >
            {BASICS.map((b, i) => {
              const s = 92 + i * 20;
              const p = rise(f, s, 26, Easing.bezier(0.45, 0, 0.25, 1));
              return (
                <div key={b.ch} style={{ ...center, flexDirection: "column", gap: 14 * u, gridColumn: portrait && i === 4 ? "1 / span 2" : undefined }}>
                  <svg viewBox="0 0 100 100" width={200 * u} height={200 * u} style={{ overflow: "visible" }}>
                    <path d={b.d} fill="none" stroke={PAPER} strokeWidth={stroke / u} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
                  </svg>
                  <div style={{ fontFamily: SANS, fontSize: 32 * u, color: PAPER, opacity: rise(f, s + 16, 14) }}>{b.name}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 26 * u, color: GOLD, opacity: rise(f, s + 20, 14) }}>{b.hanja}</div>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}
      {gridIn && (
        <AbsoluteFill style={{ ...center, flexDirection: "column", gap: 40 * u, opacity: 1 - gridOut, transform: `scale(${1 - gridOut * 0.08})` }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: cell * 0.82 }}>
            {[...TWENTY_EIGHT].map((ch, i) => {
              const s = spring({ frame: f - 228 - i * 1.6, fps, config: { damping: 13, stiffness: 160 } });
              const vowel = i >= 17;
              return (
                <div key={ch} style={{ ...center, fontFamily: SERIF, fontWeight: 700, fontSize: cell * 0.56, color: vowel ? GOLD : PAPER, opacity: Math.min(1, s * 1.3), transform: `translateY(${(1 - s) * 30 * u}px) scale(${0.6 + 0.4 * s})` }}>
                  {ch}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}
      {f >= 296 && (
        <AbsoluteFill style={{ ...center, flexDirection: "column", gap: 20 * u }}>
          <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 124 * u, color: PAPER, opacity: rise(f, 304, 22), transform: `translateY(${(1 - rise(f, 304, 22)) * 24 * u}px)` }}>스물여덟 글자</div>
          <Label style={{ fontSize: 30 * u, color: GOLD, opacity: rise(f, 316, 20) }}>1446 · 訓民正音</Label>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

/* ───────────────────────── 3. 1926 가갸날 (22–34초) ───────────────────────── */

function Gagya({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { W, H, u, portrait } = useLayout();
  // 옛 신문: 세로 단에 잔글씨처럼 짧은 먹 줄 (고정 배치)
  const columns = useMemo(() => {
    const r = rng(1926);
    const cols = Math.round(W / (26 * u));
    return Array.from({ length: cols }, (_, c) => {
      const dashes: [number, number][] = [];
      let y = 30 * u + r() * 40 * u;
      while (y < H - 30 * u) {
        const len = (8 + r() * 26) * u;
        dashes.push([y, len]);
        y += len + (4 + r() * 10) * u;
      }
      return { x: c * 26 * u + 13 * u, dashes };
    });
  }, [W, H, u]);
  const stamp = (i: number) => spring({ frame: f - 34 - i * 12, fps, config: { damping: 9, stiffness: 220, mass: 0.7 } });
  const lineP = rise(f, 190, 60, IN_OUT);
  const nodes = [
    { year: "1446", label: "훈민정음 반포" },
    { year: "1926", label: "가갸날" },
    { year: "2026", label: "오늘" },
  ];
  const span = portrait ? 0.8 : 0.72;
  return (
    <AbsoluteFill style={{ background: "#e8dcc2", opacity: sceneOpacity(f, dur) }}>
      <svg width={W} height={H} style={{ position: "absolute", opacity: 0.16 + 0.04 * Math.sin(f / 20) }}>
        {columns.map((c, i) => (
          <g key={i}>
            {c.dashes.map(([y, len], j) => (
              <rect key={j} x={c.x - 5 * u} y={y} width={10 * u} height={len} fill="#3a2f22" />
            ))}
          </g>
        ))}
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 42%, rgba(232,220,194,0.96) 30%, rgba(232,220,194,0.55) 75%)" }} />
      <AbsoluteFill style={{ ...center, flexDirection: "column", gap: 10 * u, paddingBottom: (portrait ? 360 : 220) * u }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 70 * u, color: "#5b4632", letterSpacing: "0.3em", opacity: rise(f, 8, 18) }}>1926</div>
        <div style={{ display: "flex", gap: 24 * u }}>
          {[..."가갸날"].map((ch, i) => {
            const s = stamp(i);
            return (
              <div
                key={ch}
                style={{
                  fontFamily: SERIF,
                  fontWeight: 900,
                  fontSize: (portrait ? 230 : 250) * u,
                  lineHeight: 1,
                  color: INK,
                  textShadow: `${4 * u}px ${3 * u}px 0 rgba(179,38,30,0.55)`,
                  opacity: Math.min(1, s * 1.5),
                  transform: `scale(${1.5 - 0.5 * s})`,
                }}
              >
                {ch}
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 34 * u, color: "#4a3a2a", textAlign: "center", opacity: rise(f, 90, 24), maxWidth: 1500 * u }}>
          훈민정음 반포 여덟 번째 회갑, 조선어연구회가 처음 연 한글 기념식
        </div>
      </AbsoluteFill>
      {/* 시간선 1446 · 1926 · 2026 */}
      <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: (portrait ? 330 : 150) * u }}>
        <div style={{ position: "relative", margin: "0 auto", width: W * span, height: 170 * u, opacity: rise(f, 180, 16) }}>
          <div style={{ position: "absolute", left: 0, top: 40 * u, height: 4 * u, width: `${lineP * 100}%`, background: "#5b4632" }} />
          {nodes.map((nd, i) => {
            const x = i === 0 ? 0 : i === 1 ? (1926 - 1446) / 580 : 1;
            const p = rise(f, 190 + x * 60, 16);
            const drop = portrait && i === 1 ? 70 * u : 0;
            return (
              <div key={nd.year} style={{ position: "absolute", left: `${x * 100}%`, top: 0, transform: "translateX(-50%)", textAlign: "center", opacity: p }}>
                {drop > 0 && <div style={{ position: "absolute", left: "50%", top: 55 * u, width: 2 * u, height: drop, background: "#5b4632", opacity: 0.5 }} />}
                <div style={{ width: 26 * u, height: 26 * u, borderRadius: "50%", background: i === 2 ? SEAL : "#5b4632", margin: `${29 * u}px auto ${14 * u + drop}px`, transform: `scale(${p})` }} />
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 42 * u, color: INK }}>{nd.year}</div>
                <div style={{ fontFamily: SANS, fontSize: 26 * u, color: "#5b4632", whiteSpace: "nowrap" }}>{nd.label}</div>
              </div>
            );
          })}
          {/* 구간 길이 */}
          {[
            { a: 0, b: 1, text: "580년", at: 262 },
            { a: (1926 - 1446) / 580, b: 1, text: "100년", at: 280 },
          ].map((s) => (
            <div key={s.text} style={{ position: "absolute", left: `${((s.a + s.b) / 2) * 100}%`, top: s.text === "580년" ? -64 * u : -14 * u, transform: "translateX(-50%)", whiteSpace: "nowrap", fontFamily: SERIF, fontWeight: 900, fontSize: 40 * u, color: SEAL, opacity: rise(f, s.at, 16) }}>
              {s.text}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ───────────────────────── 4. 2026 이름이 피어나다 (34–50초) ───────────────────────── */

/** '한글' 여섯 자모가 흩어진 자리에서 모여 두 글자가 된다 */
const HANGUL_JAMO: { ch: string; to: 0 | 1; dx: number; dy: number }[] = [
  { ch: "ㅎ", to: 0, dx: -0.18, dy: -0.25 },
  { ch: "ㅏ", to: 0, dx: 0.25, dy: -0.05 },
  { ch: "ㄴ", to: 0, dx: -0.05, dy: 0.28 },
  { ch: "ㄱ", to: 1, dx: 0, dy: -0.28 },
  { ch: "ㅡ", to: 1, dx: 0, dy: 0.02 },
  { ch: "ㄹ", to: 1, dx: 0, dy: 0.28 },
];

function Names({ dur, names }: { dur: number; names: NameEntry[] }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { W, H, u, portrait } = useLayout();
  // 가) '한글' 모으기 (0–120)
  const gatherOut = rise(f, 110, 18, IN_OUT);
  const g = rng(2026);
  // 나) 이름 꽃 (110–)
  const shown = names.slice(0, portrait ? 44 : 60);
  const layout = useMemo(() => {
    const r = rng(1009);
    // 칸이 가로로 넓적하게 (이름이 옆으로 길다) — 작품 수에 맞춰 열을 늘린다
    const cols = portrait ? (shown.length > 30 ? 4 : 3) : shown.length > 36 ? 8 : 6;
    const rows = Math.max(1, Math.ceil(shown.length / cols));
    const top = H * (portrait ? 0.17 : 0.17);
    const bottom = H * (portrait ? 0.86 : 0.9);
    const cw = W / cols;
    const ch = (bottom - top) / rows;
    // 칸 차례를 섞어 여기저기서 피게
    const order = shown.map((_, i) => i).sort(() => r() - 0.5);
    return shown.map((n, i) => {
      const slot = order[i];
      const c = slot % cols;
      const row = Math.floor(slot / cols);
      return {
        ...n,
        x: (c + 0.5 + (r() - 0.5) * 0.22) * cw,
        y: top + (row + 0.5) * ch + (r() - 0.5) * ch * 0.18,
        // 칸 폭(이름 길이)과 칸 높이(국적 줄 포함) 안에 들게
        size: Math.min((cw * 0.9) / Math.max(3, [...n.name].length), ch * 0.46, (portrait ? 54 : 46) * u),
        color: PETALS[i % PETALS.length],
      };
    });
  }, [shown, W, H, u, portrait]);
  const step = Math.max(2, Math.min(6, 300 / Math.max(1, shown.length)));
  const nations = new Set(names.map((n) => n.nationality).filter(Boolean)).size;
  const msgIn = rise(f, 150, 26);
  return (
    <AbsoluteFill style={{ background: NAVY, opacity: sceneOpacity(f, dur) }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 18% 25%, rgba(13,44,110,0.9), transparent 45%), radial-gradient(circle at 82% 75%, rgba(124,29,39,0.8), transparent 45%)` }} />
      {f < 132 && (
        <AbsoluteFill style={{ ...center, opacity: 1 - gatherOut }}>
          {HANGUL_JAMO.map((j, i) => {
            const sx = (g() - 0.5) * W * 0.9;
            const sy = (g() - 0.5) * H * 0.8;
            const p = rise(f, 6 + i * 5, 50, Easing.bezier(0.3, 0, 0.1, 1));
            const cx = (j.to === 0 ? -1 : 1) * 190 * u;
            const size = 150 * u;
            const x = interpolate(p, [0, 1], [sx, cx + j.dx * size * 1.6]);
            const y = interpolate(p, [0, 1], [sy, j.dy * size * 1.6]);
            const merge = rise(f, 64, 20);
            return (
              <div key={j.ch} style={{ position: "absolute", fontFamily: SERIF, fontWeight: 700, fontSize: size * (1 - merge * 0.5), color: PETALS[i], opacity: rise(f, 4 + i * 5, 10) * (1 - merge), transform: `translate(${x * (1 - merge) + cx * merge}px, ${y * (1 - merge)}px)` }}>
                {j.ch}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 40 * u, fontFamily: SERIF, fontWeight: 900, fontSize: 330 * u, color: PAPER, opacity: rise(f, 70, 18), transform: `scale(${0.8 + 0.2 * rise(f, 70, 24)})` }}>
            <span>한</span>
            <span>글</span>
          </div>
        </AbsoluteFill>
      )}
      {f >= 110 &&
        layout.map((n, i) => {
          const start = 118 + i * step;
          const p = rise(f, start, 24);
          const burst = rise(f, start, 34);
          return (
            <div key={i} style={{ position: "absolute", left: n.x, top: n.y, transform: "translate(-50%, -50%)" }}>
              {/* 꽃잎 여섯 장이 퍼졌다 사라진다 */}
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2 + i;
                const r = burst * 70 * u;
                return (
                  <div
                    key={k}
                    style={{
                      position: "absolute",
                      left: Math.cos(a) * r - 9 * u,
                      top: Math.sin(a) * r - 9 * u,
                      width: 18 * u,
                      height: 18 * u,
                      borderRadius: "50% 50% 50% 0",
                      background: n.color,
                      opacity: (1 - burst) * 0.9,
                      transform: `rotate(${a}rad)`,
                    }}
                  />
                );
              })}
              <div style={{ textAlign: "center", opacity: p, transform: `scale(${0.6 + 0.4 * p})`, whiteSpace: "nowrap" }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: n.size, color: PAPER, textShadow: `0 0 ${18 * u}px ${n.color}66` }}>{n.name}</div>
                {n.nationality && <div style={{ fontFamily: SANS, fontSize: Math.max(14 * u, n.size * 0.42), color: n.color, marginTop: 4 * u }}>{n.nationality}</div>}
              </div>
            </div>
          );
        })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: (portrait ? 150 : 70) * u }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: (portrait ? 58 : 60) * u, color: PAPER, textAlign: "center", opacity: msgIn, transform: `translateY(${(1 - msgIn) * 20 * u}px)`, padding: `0 ${40 * u}px` }}>
          {portrait ? (
            <>
              세계 여러 나라에서 온 이름,
              <br />
              한글로 피어나다
            </>
          ) : (
            "세계 여러 나라에서 온 이름, 한글로 피어나다"
          )}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: (portrait ? 150 : 60) * u }}>
        <Label style={{ fontSize: 26 * u, color: GOLD, opacity: rise(f, 380, 24) }}>
          2026 · {nations > 0 ? `${nations}개 나라 · ` : ""}
          {names.length}명
        </Label>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ───────────────────────── 5. 580돌 · 100돌 (50–60초) ───────────────────────── */

function Finale({ p }: { p: HangulDayProps }) {
  const f = useCurrentFrame();
  const { u, portrait } = useLayout();
  const items = p.commemorations.slice(0, 2);
  const slide = rise(f, 0, 28, IN_OUT);
  return (
    <AbsoluteFill style={{ background: NAVY, opacity: Math.min(1, rise(f, 0, 12)) }}>
      <AbsoluteFill style={{ flexDirection: portrait ? "column" : "row" }}>
        {items.map((c, i) => {
          const n = typeof c.햇수 === "number" ? c.햇수 : parseInt(String(c.햇수), 10);
          const count = Number.isFinite(n) ? Math.round(n * rise(f, 22 + i * 8, 70, Easing.bezier(0.16, 1, 0.3, 1))) : c.햇수;
          const from = i === 0 ? -1 : 1;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                ...center,
                flexDirection: "column",
                background: i === 0 ? BLUE : RED,
                transform: portrait ? `translateY(${(1 - slide) * from * 100}%)` : `translateX(${(1 - slide) * from * 100}%)`,
                gap: 10 * u,
                // 세로: 빨간 판은 가운데 표지(위)와 아래 제목 띠를 비켜서
                paddingTop: portrait && i === 1 ? 130 * u : 0,
                paddingBottom: portrait && i === 1 ? 210 * u : 0,
              }}
            >
              <Label style={{ fontSize: 22 * u, color: "rgba(242,234,217,0.7)" }}>{c.영문 ?? ""}</Label>
              <div style={{ display: "flex", alignItems: "baseline", color: PAPER, fontFamily: SERIF, fontWeight: 900 }}>
                <span style={{ fontSize: (portrait ? 300 : 260) * u, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{count}</span>
                <span style={{ fontSize: 90 * u, marginLeft: 10 * u }}>{c.단위 ?? "돌"}</span>
              </div>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 52 * u, color: PAPER }}>{c.이름}</div>
              <div style={{ fontFamily: MONO, fontSize: 24 * u, letterSpacing: "0.2em", color: GOLD, opacity: rise(f, 90, 20) }}>{c.기간 ?? ""}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      {/* 가운데 둥근 표지 */}
      <AbsoluteFill style={center}>
        <div
          style={{
            width: 190 * u,
            height: 190 * u,
            borderRadius: "50%",
            background: NAVY,
            border: `${3 * u}px solid ${GOLD}`,
            ...center,
            fontFamily: SERIF,
            fontWeight: 900,
            fontSize: 58 * u,
            color: GOLD,
            opacity: rise(f, 40, 20),
            transform: `scale(${0.6 + 0.4 * rise(f, 40, 26)}) rotate(${(1 - rise(f, 40, 40)) * -40}deg)`,
          }}
        >
          한글
        </div>
      </AbsoluteFill>
      {/* 아래 띠: 전시 제목 */}
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <div
          style={{
            background: "rgba(6,18,43,0.92)",
            padding: `${34 * u}px ${60 * u}px`,
            display: "flex",
            flexDirection: portrait ? "column" : "row",
            alignItems: portrait ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: 10 * u,
            transform: `translateY(${(1 - rise(f, 130, 26)) * 100}%)`,
          }}
        >
          <div>
            <div style={{ fontFamily: SANS, fontSize: 26 * u, color: "rgba(242,234,217,0.7)" }}>{p.top}</div>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 56 * u, color: PAPER }}>
              {p.title} <span style={{ fontWeight: 400, color: GOLD }}>{p.subtitle}</span>
            </div>
          </div>
          <Label style={{ fontSize: 26 * u, color: PAPER }}>Hangul Day · {p.date}</Label>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ───────────────────────── 전체 ───────────────────────── */

const SCENES = {
  hunmin: { from: 0, dur: 312 },
  letters: { from: 294, dur: 372 },
  gagya: { from: 648, dur: 378 },
  names: { from: 1008, dur: 500 },
  finale: { from: 1488, dur: 312 },
};

export function HangulDay(p: HangulDayProps) {
  ensureFonts();
  const names = p.names.length ? p.names : defaultProps.names;
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {/* 음악: 곡 끝은 이미 페이드되어 있다 — 첫 3프레임만 부드럽게 열어 딸깍 소리를 막는다 */}
      {p.music && <Audio src={p.music} volume={(fr) => interpolate(fr, [0, 3], [0, 1], CLAMP)} />}
      <Sequence from={SCENES.hunmin.from} durationInFrames={SCENES.hunmin.dur} name="1 훈민정음">
        <Hunmin dur={SCENES.hunmin.dur} />
      </Sequence>
      <Sequence from={SCENES.letters.from} durationInFrames={SCENES.letters.dur} name="2 천지인 · 스물여덟 글자">
        <Letters dur={SCENES.letters.dur} />
      </Sequence>
      <Sequence from={SCENES.gagya.from} durationInFrames={SCENES.gagya.dur} name="3 1926 가갸날">
        <Gagya dur={SCENES.gagya.dur} />
      </Sequence>
      <Sequence from={SCENES.names.from} durationInFrames={SCENES.names.dur} name="4 이름이 피어나다">
        <Names dur={SCENES.names.dur} names={names} />
      </Sequence>
      <Sequence from={SCENES.finale.from} durationInFrames={SCENES.finale.dur} name="5 580돌 · 100돌">
        <Finale p={p} />
      </Sequence>
    </AbsoluteFill>
  );
}
