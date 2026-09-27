"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue } from "framer-motion";
import { awardColor } from "@/lib/config";
import { canLoop, closeViewer, moveDetail, useGallery } from "@/lib/gallery";
import type { ArtworkSource } from "@/lib/types";

/*
 * 크게 보기 — 검은 바탕에 작품을 화면 가득 (잘라 내지 않고 object-contain).
 * 설명은 박물관 명판 순서(상 → 이름 → 나라 → 설명)로, 작품 위에 글자를 얹지 않는다:
 *  - 세로 화면: 작품 바로 아래 명판, 맨 아래 ‹ 이전 · n / N · 다음 › (엄지 닿는 곳)
 *  - 가로 화면: 작품이 남기는 옆 검은 여백에 명판 기둥 (여백이 좁으면 작게 · 아이콘만)
 *  - 가로 작품을 세로로 든 휴대폰에서: '가로로 보기'가 보기 화면만 90° 돌린다 (화면 회전 잠금·카카오톡에서도 된다).
 *    휴대폰을 실제로 돌리면 저절로 풀린다.
 * 화면을 한 번 누르면 작품만 보기(설명·버튼 숨김), 다시 누르면 돌아온다. 옆으로 밀면 이전·다음, 아래로 밀면 닫기.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Mode = "stack" | "rail" | "compact" | "slim" | "desk";
interface Plan {
  mode: Mode;
  railW: number;
  art: Rect;
  full: Rect;
  descLines: number;
  capTop: number;
  topOverlap: boolean;
}

const TOP_H = 52;
const GAP = 12;
const LINE = 26; // 16px × 1.6
const MAX_COST = 0.12;

const fit = (a: number, w: number, h: number) => (w / h > a ? { w: h * a, h } : { w, h: w / a });
const center = (s: { w: number; h: number }, x: number, y: number, w: number, h: number): Rect => ({
  x: x + (w - s.w) / 2,
  y: y + (h - s.h) / 2,
  w: s.w,
  h: s.h,
});

/** 보기 화면 크기(W×H, 돌렸으면 돌린 뒤) → 작품 자리와 명판 배치 */
export function planViewer(W: number, H: number, a: number, headH: number, navH: number, hasDesc: boolean, desk: boolean): Plan {
  const full = center(fit(a, W, H), 0, 0, W, H);
  const base = { descLines: 0, capTop: 0, topOverlap: false, full };
  if (desk && W >= 960 && H >= 560) {
    const aw = W - 384;
    const ah = H - 64;
    return { ...base, mode: "desk", railW: 320, art: center(fit(a, aw, ah), 32, 32, aw, ah) };
  }
  const freeH = W - full.w;
  const freeV = H - full.h;
  if (W > H && !(freeV >= 120 && freeH < 112)) {
    let mode: Mode;
    let railW: number;
    if (freeH >= 180) {
      mode = "rail";
      railW = Math.min(freeH, 300);
    } else if (freeH >= 112) {
      mode = "compact";
      railW = freeH;
    } else if (fit(a, W - 112, H).w >= full.w * (1 - MAX_COST)) {
      mode = "compact";
      railW = 112;
    } else {
      mode = "slim";
      railW = 64;
    }
    return { ...base, mode, railW, art: center(fit(a, W - railW, H), 0, 0, W - railW, H) };
  }
  // 세로(쌓기): 작품 → 명판 → 맨 아래 이동 줄
  const room = H - navH - headH - GAP;
  let lines = 0;
  if (hasDesc) {
    const slack = room - W / a;
    lines = slack >= 8 + LINE ? Math.min(4, Math.floor((slack - 8) / LINE)) : 1;
  }
  const descH = lines ? 8 + LINE * lines : 0;
  const s = fit(a, W, Math.max(room - descH, 80));
  const slackY = H - navH - (s.h + GAP + headH + descH);
  const top = slackY >= 2 * TOP_H ? slackY / 2 : Math.max(0, Math.min(TOP_H, slackY));
  return {
    ...base,
    mode: "stack",
    railW: 0,
    descLines: lines,
    art: { x: (W - s.w) / 2, y: top, w: s.w, h: s.h },
    capTop: top + s.h + GAP,
    topOverlap: top < TOP_H,
  };
}

const area = (r: Rect) => r.w * r.h;

function readSession(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return "1";
  }
}
function writeSession(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* 저장 못 해도 괜찮다 */
  }
}

export function ArtViewer() {
  const detail = useGallery((s) => s.detail);
  const arts = useGallery((s) => s.arts);
  const art = detail !== null ? arts[detail] : null;
  // 크게 보기는 body 바로 아래에 둔다: 잘라 내는(overflow hidden) 조상 안에서 90° 돌린 화면은
  // iPhone(사파리·카카오톡)에서 버튼 누르기가 먹지 않는 일이 있어, 널리 쓰는 '가로 고정' 구조(고정 화면 하나만 돌리기)로.
  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{art && detail !== null && <Viewer key="viewer" art={art} index={detail} arts={arts} />}</AnimatePresence>
    </MotionConfig>,
    document.body
  );
}

function Chip({ award, small }: { award?: string; small?: boolean }) {
  if (!award) return null;
  return (
    <span
      className={`inline-block rounded-full font-bold text-[#111] ${small ? "px-2 py-px text-xs" : "px-2.5 py-0.5 text-[13px]"}`}
      style={{ background: awardColor(award) }}
    >
      {award}
    </span>
  );
}

function RotateIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="3" width="10" height="16" rx="2" transform="rotate(-90 12 11)" />
      <path d="M4 17a8 8 0 0 0 7 4" />
      <path d="M4 21v-4h4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const roundBtn = "pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/45 ring-1 ring-white/20 active:scale-95";

function Viewer({ art, index, arts }: { art: ArtworkSource; index: number; arts: ArtworkSource[] }) {
  const n = arts.length;
  const loop = canLoop(n);
  const name = art.name || art.title;
  const nat = art.nationality;
  const desc = art.description?.trim() ?? "";
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);

  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [rotatedPref, setRotatedPref] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState<null | "desc" | "info">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [headH, setHeadH] = useState(64);
  const [navH, setNavH] = useState(68);
  const [descOverflow, setDescOverflow] = useState(false);
  const [natural, setNatural] = useState<number | null>(null);

  const touch = useMemo(() => window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0, []);
  const desk = !touch;

  // 보기 화면 크기 (주소창이 줄었다 늘었다 해도 실제 크기로)
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => setVp((p) => (p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const portraitVp = vp.h >= vp.w;
  const rot = rotatedPref && portraitVp;
  // 휴대폰을 실제로 가로로 돌리면 '가로로 보기'는 저절로 풀린다 (두 번 돌지 않게)
  useEffect(() => {
    if (!portraitVp) setRotatedPref(false);
  }, [portraitVp]);
  useEffect(() => {
    setSheet(null);
  }, [index]);

  const W = rot ? vp.h : vp.w;
  const H = rot ? vp.w : vp.h;
  const aspect = art.width && art.height ? art.width / art.height : natural ?? 1.414;
  const plan = planViewer(W, H, aspect, headH, navH, Boolean(desc), desk);
  const stack = plan.mode === "stack";
  const artRect = chrome ? plan.art : plan.full;

  // 가로 작품을 세로 화면에서 볼 때만: 돌리면 1.2배 넘게 커질 때 '가로로 보기'
  const canRotate =
    touch && !rot && portraitVp && aspect >= 1.15 && area(planViewer(vp.h, vp.w, aspect, headH, navH, Boolean(desc), false).art) >= 1.2 * area(plan.art);

  // 명판·이동 줄 높이를 재서 작품 자리를 맞춘다
  useLayoutEffect(() => {
    const els: [HTMLElement | null, (v: number) => void][] = [
      [headRef.current, setHeadH],
      [navRef.current, setNavH],
    ];
    const ro = new ResizeObserver(() => {
      for (const [el, set] of els) if (el) set(Math.ceil(el.getBoundingClientRect().height));
    });
    for (const [el, set] of els) {
      if (!el) continue;
      set(Math.ceil(el.getBoundingClientRect().height));
      ro.observe(el);
    }
    return () => ro.disconnect();
  }, [stack, rot, index]);
  useLayoutEffect(() => {
    const el = descRef.current;
    setDescOverflow(Boolean(el && el.scrollHeight > el.clientHeight + 2));
  }, [plan.descLines, desc, W, stack]);

  // 열면 닫기 버튼에 초점, 닫으면 원래 자리로
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  // 처음 열 때 한 번 쓰는 법 알려 주기 (휴대폰)
  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 2600);
  };
  useEffect(() => {
    if (!touch || readSession("viewer-hint")) return;
    writeSession("viewer-hint");
    showToast(canRotate ? "‘가로로 보기’를 누르면 작품이 더 커져요" : "화면을 누르면 작품만 · 옆으로 밀면 다음 작품");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 아주 좁은 기둥(아이콘만)일 때는 작품을 넘길 때마다 이름을 잠깐 띄운다
  useEffect(() => {
    if (plan.mode === "slim") showToast(`${art.award ? art.award + " · " : ""}${name}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, plan.mode === "slim"]);

  // Esc: 설명 창이 열려 있으면 그것부터 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sheet) {
        e.stopImmediatePropagation();
        e.preventDefault();
        setSheet(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sheet]);

  // 옆 작품 미리 불러 두기
  useEffect(() => {
    if (!loop) return;
    for (const d of [1, -1]) {
      const a = arts[(index + d + n) % n];
      if (a) new Image().src = a.src;
    }
  }, [index, arts, n, loop]);

  const rotate = (on: boolean) => {
    setRotatedPref(on);
    setSheet(null);
    if (on && !readSession("viewer-rotate")) {
      writeSession("viewer-rotate");
      showToast("휴대폰을 왼쪽으로 눕혀 보세요");
    }
  };

  /* ── 밀기·누르기 ── */
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const dragScale = useMotionValue(1);
  const bgAlpha = useMotionValue(1);
  const busy = useRef(false);
  const g = useRef<null | { id: number; x0: number; y0: number; t0: number; axis: null | "x" | "y"; dx: number; dy: number; mouse: boolean; hist: { x: number; y: number; t: number }[] }>(null);

  const local = (e: React.PointerEvent) => {
    const r = frameRef.current!.getBoundingClientRect();
    return rot ? { x: e.clientY - r.top, y: r.right - e.clientX } : { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, [data-noswipe]")) return;
    if (!e.isPrimary || busy.current) return;
    // 화면 양끝 20px 은 휴대폰의 '뒤로' 밀기 자리
    if (e.pointerType !== "mouse" && (e.clientX < 20 || e.clientX > window.innerWidth - 20)) return;
    const p = local(e);
    g.current = { id: e.pointerId, x0: p.x, y0: p.y, t0: performance.now(), axis: null, dx: 0, dy: 0, mouse: e.pointerType === "mouse", hist: [{ ...p, t: performance.now() }] };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 못 해도 틀 안에서는 따라간다 */
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const p = local(e);
    s.dx = p.x - s.x0;
    s.dy = p.y - s.y0;
    s.hist.push({ ...p, t: performance.now() });
    if (s.hist.length > 4) s.hist.shift();
    if (!s.axis && Math.hypot(s.dx, s.dy) > 8) {
      if (Math.abs(s.dx) > 1.2 * Math.abs(s.dy)) s.axis = "x";
      else if (s.dy > 0 && s.dy > 1.2 * Math.abs(s.dx)) s.axis = "y";
    }
    if (s.axis === "x") dragX.set(loop || n > 1 ? s.dx : s.dx * 0.3);
    if (s.axis === "y") {
      const dy = Math.max(0, s.dy);
      dragY.set(dy);
      dragScale.set(1 - Math.min(dy, 400) / 1600);
      bgAlpha.set(1 - Math.min(dy / 500, 0.6));
    }
  };
  const settle = () => {
    animate(dragX, 0, { type: "spring", stiffness: 500, damping: 40 });
    animate(dragY, 0, { type: "spring", stiffness: 500, damping: 40 });
    animate(dragScale, 1, { type: "spring", stiffness: 500, damping: 40 });
    animate(bgAlpha, 1, { duration: 0.2 });
  };
  // 넘기는 중 잠금은 시간으로 푼다: 애니메이션이 중간에 끊기면 끝났다는 알림(then)이 오지 않아
  // 잠금이 영영 풀리지 않고 ‹ › 가 먹지 않게 된다
  const swap = useRef(0);
  useEffect(() => () => window.clearTimeout(swap.current), []);
  const go = (d: 1 | -1) => {
    if (busy.current) return;
    const s = useGallery.getState();
    const at = s.detail ?? 0;
    if (!loop && (at + d < 0 || at + d >= n)) {
      settle();
      return;
    }
    busy.current = true;
    animate(dragX, -d * W * 0.6, { duration: 0.16 });
    swap.current = window.setTimeout(() => {
      moveDetail(d);
      dragX.set(d * W * 0.25);
      animate(dragX, 0, { duration: 0.22, ease: [0.16, 1, 0.3, 1] });
      busy.current = false;
    }, 160);
  };
  // 버튼은 손을 뗄 때(pointerup) 바로 반응한다: iPhone 은 누른 사이 화면이 바뀌면 click 을 건너뛰는 일이 있어
  // click 만 믿으면 '가로 화면에서 ‹ › 가 안 먹는' 일이 생긴다. 마우스·키보드는 click 으로.
  const lastPress = useRef(0);
  const press = (fn: () => void) => ({
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === "mouse" || e.currentTarget.disabled) return;
      lastPress.current = performance.now();
      fn();
    },
    onClick: () => {
      if (performance.now() - lastPress.current < 700) return;
      fn();
    },
  });
  const onUp = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    g.current = null;
    const dt = performance.now() - s.t0;
    const h = s.hist;
    const span = h.length > 1 ? h[h.length - 1].t - h[0].t : 1;
    const vx = h.length > 1 ? (h[h.length - 1].x - h[0].x) / Math.max(span, 1) : 0;
    const vy = h.length > 1 ? (h[h.length - 1].y - h[0].y) / Math.max(span, 1) : 0;
    if (!s.axis && Math.hypot(s.dx, s.dy) < 10 && dt < 400) {
      // 누르기: 휴대폰은 작품만 보기 ↔ 설명, 마우스는 작품 밖을 누르면 닫기
      if (sheet) setSheet(null);
      else if (s.mouse) {
        const p = { x: s.x0, y: s.y0 };
        const r = artRect;
        const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
        if (!inside) closeViewer();
      } else setChrome((c) => !c);
      return;
    }
    if (s.axis === "x" && (Math.abs(s.dx) > Math.max(56, 0.18 * W) || (Math.abs(vx) > 0.4 && Math.abs(s.dx) > 24))) {
      go(s.dx < 0 ? 1 : -1);
      return;
    }
    if (s.axis === "y" && (s.dy > 96 || vy > 0.5)) {
      closeViewer();
      return;
    }
    settle();
  };
  const onCancel = () => {
    // 밀던 중이었을 때만 되돌린다 (버튼을 누르다 취소된 것까지 넘기는 중인 작품을 끌어오지 않게)
    if (!g.current) return;
    g.current = null;
    settle();
  };

  // 휴대폰을 옆으로 돌린 화면: ‹ › 를 기둥 위쪽과 작품 양옆에 둔다 (아래 가장자리는 iPhone 에서 누르기가 잘 안 먹는다)
  const navTop = touch && !rot && !stack && plan.mode !== "desk";
  const prevLabel = index === 0 && loop ? "마지막 작품으로" : "이전 작품";
  const nextLabel = index === n - 1 && loop ? "처음 작품으로" : "다음 작품";
  const prevOff = !loop && index <= 0;
  const nextOff = !loop && index >= n - 1;
  const counter = `${index + 1} / ${n}`;
  const hideCls = chrome ? "opacity-100" : "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100";

  const railNav = (
    <div className="mt-2 flex gap-2">
      <button {...press(() => go(-1))} disabled={prevOff} aria-label={prevLabel} className="h-11 flex-1 rounded-xl bg-white/10 font-bold hover:bg-white/20 active:bg-white/20 disabled:opacity-35">
        ‹ 이전
      </button>
      <button {...press(() => go(1))} disabled={nextOff} aria-label={nextLabel} className="h-11 flex-1 rounded-xl bg-white/10 font-bold hover:bg-white/20 active:bg-white/20 disabled:opacity-35">
        다음 ›
      </button>
    </div>
  );

  const compactNav = (
    <div className="mt-2 flex justify-between">
      <button {...press(() => go(-1))} disabled={prevOff} aria-label={prevLabel} className="h-11 w-11 rounded-full bg-white/10 text-xl active:bg-white/20 disabled:opacity-35">
        ‹
      </button>
      <button {...press(() => go(1))} disabled={nextOff} aria-label={nextLabel} className="h-11 w-11 rounded-full bg-white/10 text-xl active:bg-white/20 disabled:opacity-35">
        ›
      </button>
    </div>
  );

  const slimNav = (
    <>
      <button {...press(() => go(-1))} disabled={prevOff} aria-label={prevLabel} className="flex h-14 w-14 flex-col items-center justify-center rounded-xl text-[11px] font-bold active:bg-white/10 disabled:opacity-35">
        <span className="text-xl leading-none">‹</span>이전
      </button>
      <button {...press(() => go(1))} disabled={nextOff} aria-label={nextLabel} className="flex h-14 w-14 flex-col items-center justify-center rounded-xl text-[11px] font-bold active:bg-white/10 disabled:opacity-35">
        <span className="text-xl leading-none">›</span>다음
      </button>
    </>
  );

  const frameStyle: React.CSSProperties = rot
    ? { left: vp.w, top: 0, width: vp.h, height: vp.w, transform: "rotate(90deg)", transformOrigin: "0 0" }
    : { left: 0, top: 0, width: vp.w, height: vp.h };

  const nameEl = (size: "lg" | "md" | "sm") => (
    <h2
      className={`font-display font-bold [overflow-wrap:anywhere] [text-wrap:balance] ${
        size === "lg" ? "text-2xl leading-[1.3]" : size === "md" ? "text-[22px] leading-snug" : "text-[17px] leading-snug"
      }`}
    >
      {name}
    </h2>
  );

  const railBody = (
    <>
      <Chip award={art.award} />
      <div className="mt-2">
        {nameEl("md")}
      </div>
      {nat && <p className="mt-1 text-[15px] text-white/70">{nat}</p>}
      {desc && <p className="mt-3 whitespace-pre-line text-base leading-[1.6] text-white/85">{desc}</p>}
    </>
  );

  return (
    <motion.div
      ref={rootRef}
      data-viewer
      role="dialog"
      aria-modal="true"
      aria-label={`${name} 작품 크게 보기`}
      className="fixed inset-0 z-50 select-none text-[#f4f1ea] [overscroll-behavior:contain] [touch-action:none]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div className="absolute inset-0 bg-black" style={{ opacity: bgAlpha }} />
      <AnimatePresence initial={false} mode="wait">
        <motion.div key={rot ? "rot" : "up"} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.09 }}>
          {/* 돌리는 틀은 motion 이 아닌 보통 div (motion 의 transform 이 회전을 덮어쓰지 않게) */}
          <div
            ref={frameRef}
            data-viewer-frame
            className="absolute overflow-hidden"
            style={frameStyle}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
          >
            {/* 작품 */}
            <motion.div
              data-viewer-art
              className="absolute"
              initial={false}
              animate={{ left: artRect.x, top: artRect.y, width: artRect.w, height: artRect.h, opacity: sheet ? 0.4 : 1 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div className="h-full w-full" style={{ x: dragX, y: dragY, scale: dragScale }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <motion.img
                  key={art.src}
                  src={art.src}
                  alt={`${name}${nat ? `(${nat})` : ""}의 한글 이름 작품`}
                  width={art.width}
                  height={art.height}
                  draggable={false}
                  decoding="async"
                  onLoad={(e) => {
                    const im = e.currentTarget;
                    if (!art.width && im.naturalWidth) setNatural(im.naturalWidth / im.naturalHeight);
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18 }}
                  className="pointer-events-none h-full w-full select-none object-contain [-webkit-touch-callout:none]"
                />
              </motion.div>
            </motion.div>

            {/* 옆으로 돌린 휴대폰: 작품 양옆 가운데 ‹ › (가장자리에서 떨어진 자리) */}
            {navTop && (
              <div
                className={`pointer-events-none absolute z-[5] transition-opacity duration-200 ${chrome && !sheet ? "opacity-100" : "opacity-0"}`}
                style={{ left: plan.art.x, top: plan.art.y, width: plan.art.w, height: plan.art.h }}
              >
                {(
                  [
                    [-1, prevOff, prevLabel, "left-4", "‹"],
                    [1, nextOff, nextLabel, "right-4", "›"],
                  ] as const
                ).map(([d, off, label, side, glyph]) => (
                  <button
                    key={d}
                    {...press(() => go(d))}
                    disabled={off}
                    aria-label={label}
                    className={`absolute top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 pb-0.5 text-[28px] leading-none ring-1 ring-white/25 active:scale-95 disabled:hidden ${side} ${chrome && !sheet ? "pointer-events-auto" : ""}`}
                  >
                    {glyph}
                  </button>
                ))}
              </div>
            )}

            {stack ? (
              <div className={`transition-opacity duration-200 ${hideCls}`}>
                {/* 위: 가로로 보기(왼쪽) · 닫기(오른쪽) — 서로 먼 구석이라 잘못 눌러 닫히지 않게 */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[52px] items-start justify-between px-2 pt-1">
                  {plan.topOverlap && <div className="absolute inset-x-0 top-0 h-[72px] bg-gradient-to-b from-black/55 to-transparent" />}
                  {canRotate ? (
                    <button
                      onClick={() => rotate(true)}
                      aria-pressed={false}
                      className="pointer-events-auto relative mt-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-sm font-bold ring-1 ring-white/25 backdrop-blur-sm active:bg-white/25"
                    >
                      <RotateIcon />
                      가로로 보기
                    </button>
                  ) : (
                    <span />
                  )}
                  <button ref={closeRef} onClick={closeViewer} className={`relative ${roundBtn}`} aria-label="닫기">
                    <CloseIcon />
                  </button>
                </div>
                {/* 명판: 작품 바로 아래 */}
                <div className="absolute inset-x-0 px-4" style={{ top: plan.capTop }}>
                  <div ref={headRef}>
                    <Chip award={art.award} />
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                      {nameEl("lg")}
                      {nat && <span className="text-[15px] text-white/70">{nat}</span>}
                    </div>
                  </div>
                  {desc && (
                    <div className="mt-2">
                      <p
                        ref={descRef}
                        className="whitespace-pre-line text-base leading-[1.6] text-white/85"
                        style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: Math.max(plan.descLines, 1), overflow: "hidden" }}
                      >
                        {desc}
                      </p>
                      {descOverflow && (
                        <button data-noswipe onClick={() => setSheet("desc")} className="py-2 text-[15px] font-bold underline underline-offset-4">
                          더보기
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* 맨 아래: 이동 */}
                <div ref={navRef} className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
                  <button {...press(() => go(-1))} disabled={prevOff} aria-label={prevLabel} className="h-12 flex-1 rounded-2xl bg-white/10 text-base font-bold ring-1 ring-white/15 active:bg-white/20 disabled:opacity-35">
                    {index === 0 && loop ? "‹ 마지막으로" : "‹ 이전"}
                  </button>
                  <span className="w-16 shrink-0 text-center text-sm tabular-nums text-white/70" aria-hidden>
                    {counter}
                  </span>
                  <button {...press(() => go(1))} disabled={nextOff} aria-label={nextLabel} className="h-12 flex-1 rounded-2xl bg-white/10 text-base font-bold ring-1 ring-white/15 active:bg-white/20 disabled:opacity-35">
                    {index === n - 1 && loop ? "처음으로 ›" : "다음 ›"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`absolute inset-y-0 right-0 flex flex-col transition-opacity duration-200 ${plan.mode === "desk" ? "border-l border-white/10 bg-[#101012]" : ""} ${hideCls}`}
                style={{ width: plan.railW }}
              >
                {plan.mode === "rail" || plan.mode === "desk" ? (
                  <div className={`flex h-full flex-col ${plan.mode === "desk" ? "px-6 py-6" : "px-4 pb-6 pt-3"} ${rot ? "" : "pr-[max(16px,env(safe-area-inset-right))]"}`}>
                    <div className="flex h-11 items-center justify-between">
                      <span className="text-[13px] tabular-nums text-white/60">{counter}</span>
                      <button ref={closeRef} onClick={closeViewer} className={roundBtn} aria-label="닫기">
                        <CloseIcon />
                      </button>
                    </div>
                    {navTop && railNav}
                    <div
                      data-noswipe
                      className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,#000_88%,transparent)] [touch-action:pan-x_pan-y]"
                    >
                      <div className="my-auto pb-4">{railBody}</div>
                    </div>
                    {rot && (
                      <button onClick={() => rotate(false)} aria-pressed className="mt-2 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white/10 text-[15px] font-bold active:bg-white/20">
                        <RotateIcon /> 세로로 보기
                      </button>
                    )}
                    {!navTop && railNav}
                  </div>
                ) : plan.mode === "compact" ? (
                  <div className="flex h-full flex-col px-2 pb-6 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs tabular-nums text-white/60">{counter}</span>
                      <button ref={closeRef} onClick={closeViewer} className={roundBtn} aria-label="닫기">
                        <CloseIcon />
                      </button>
                    </div>
                    {navTop && compactNav}
                    <div className="mt-2">
                      <Chip award={art.award} small />
                      <div className="mt-1.5">
                        {nameEl("sm")}
                      </div>
                      {nat && <p className="text-[13px] text-white/70">{nat}</p>}
                      {desc && (
                        <button onClick={() => setSheet("info")} className="mt-2 h-11 w-full rounded-xl bg-white/10 text-sm font-bold active:bg-white/20">
                          설명 보기
                        </button>
                      )}
                    </div>
                    <div className="flex-1" />
                    {rot && (
                      <button onClick={() => rotate(false)} aria-pressed className="flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl bg-white/10 text-[13px] font-bold active:bg-white/20">
                        <RotateIcon />
                        세로로 보기
                      </button>
                    )}
                    {!navTop && compactNav}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center gap-1 pb-5 pt-2">
                    <button ref={closeRef} onClick={closeViewer} className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold active:bg-white/10">
                      <CloseIcon />
                      닫기
                    </button>
                    <button onClick={() => setSheet("info")} className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold active:bg-white/10">
                      <span className="text-lg font-bold leading-none">i</span>
                      정보
                    </button>
                    {navTop && slimNav}
                    <div className="flex-1" />
                    {rot && (
                      <button onClick={() => rotate(false)} aria-pressed className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold active:bg-white/10">
                        <RotateIcon className="h-5 w-5" />
                        세로로
                      </button>
                    )}
                    {!navTop && slimNav}
                  </div>
                )}
              </div>
            )}

            {/* 설명 창: 세로 화면은 아래에서, 가로 화면은 옆에서 */}
            <AnimatePresence>
              {sheet && (
                <>
                  <motion.div key="scrim" className="absolute inset-0 z-10 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(null)} />
                  {sheet === "desc" ? (
                    <motion.div
                      key="desc"
                      data-noswipe
                      className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto overscroll-contain rounded-t-2xl bg-[#141416] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 [touch-action:pan-x_pan-y]"
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      exit={{ y: "100%" }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" />
                      <div className="flex justify-end">
                        <button onClick={() => setSheet(null)} className="h-11 px-3 text-[15px] font-bold text-white/80">
                          접기
                        </button>
                      </div>
                      {railBody}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="info"
                      data-noswipe
                      className="absolute inset-y-0 right-0 z-20 w-[min(320px,64%)] overflow-y-auto overscroll-contain bg-[#141416] px-5 py-4 [touch-action:pan-x_pan-y]"
                      initial={{ x: "100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "100%" }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="flex justify-end">
                        <button onClick={() => setSheet(null)} className="h-11 px-3 text-[15px] font-bold text-white/80">
                          접기
                        </button>
                      </div>
                      {railBody}
                      <p className="mt-4 text-sm tabular-nums text-white/50">{counter}</p>
                    </motion.div>
                  )}
                </>
              )}
            </AnimatePresence>

            {/* 짧은 안내 */}
            <AnimatePresence>
              {toast && (
                <motion.div key="toast" className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center ${stack ? "top-[60px]" : "top-3"}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <p className="max-w-[90%] truncate rounded-full bg-black/80 px-4 py-2 text-[15px] font-medium ring-1 ring-white/15">{toast}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>
      <p className="sr-only" aria-live="polite">
        {`${index + 1}번째 작품, 전체 ${n}점. ${art.award ? art.award + ", " : ""}${name}${nat ? ", " + nat : ""}`}
      </p>
    </motion.div>
  );
}
