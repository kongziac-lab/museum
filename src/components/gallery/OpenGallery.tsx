"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";
import { bgm, bgmWanted, setBgmWanted } from "@/lib/bgm";
import { awardColor } from "@/lib/config";
import { AUTO, autoAdvance, buildLayout, canLoop, closeViewer, colorOf, dwellFor, goTo, jumpTo, moveDetail, offStop, openViewer, pauseAuto, playAuto, setOverview, step, stopIndex, useGallery, viewerPopped, type GalleryLayout } from "@/lib/gallery";
import type { ArtworkSource, ExhibitionBackground, ExhibitionInfo } from "@/lib/types";
import { ArtViewer } from "./ArtViewer";
import { Splash } from "./Splash";

/** 한글날 도입 영상 — 틀 때만 불러온다 (Remotion Player) */
const IntroFilm = dynamic(() => import("./IntroFilm"), { ssr: false });
import { GalleryScene } from "./GalleryScene";
import { detectQuality, type Quality } from "./scene/common";

/* ───────────────────────── 데이터 ───────────────────────── */

function useExhibition() {
  const setData = useGallery((s) => s.setData);
  useEffect(() => {
    fetch("/exhibition.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { artworks: ArtworkSource[]; info?: ExhibitionInfo; background?: ExhibitionBackground | null }) =>
        setData(j.artworks ?? [], j.info ?? {}, j.background ?? null)
      )
      .catch(() => setData([], {}, null));
  }, [setData]);
}

/* ───────────────────────── 입력 (스크롤·스와이프·키보드) ───────────────────────── */

function snap(direction: number) {
  const s = useGallery.getState();
  const t = s.target;
  const base = Math.round(t);
  let next = base;
  // 조금이라도 그 방향으로 움직였다면 다음 작품까지 간다
  if (direction > 0 && t - Math.floor(t) > 0.12) next = Math.ceil(t);
  if (direction < 0 && Math.ceil(t) - t > 0.12) next = Math.floor(t);
  s.setTarget(next);
}

function useWalkInput(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let lastDir = 0;

    const blocked = () => {
      const s = useGallery.getState();
      return !s.started || s.detail !== null || s.listOpen || s.overview || s.film;
    };

    const onUi = (e: Event) => Boolean((e.target as HTMLElement | null)?.closest?.("button, [data-noswipe]"));

    const onWheel = (e: WheelEvent) => {
      if (blocked() || onUi(e)) return;
      pauseAuto();
      const s = useGallery.getState();
      const dy = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const step = THREE.MathUtils.clamp(dy * 0.0035, -0.5, 0.5);
      lastDir = Math.sign(step);
      s.setTarget(s.target + step);
      clearTimeout(idle);
      idle = setTimeout(() => snap(lastDir), 260);
    };

    // 끄는 만큼 목표를 더해 간다 (한 바퀴 돌아 번호를 되돌려 세도 어긋나지 않게 절대값 대신 변화량으로)
    let drag: { x: number; y: number; last: number; id: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (blocked() || e.button > 0 || onUi(e)) return;
      pauseAuto(); // 화면을 만지면 자동 관람을 멈춘다
      drag = { x: e.clientX, y: e.clientY, last: 0, id: e.pointerId, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const forward = Math.abs(dy) > Math.abs(dx) ? -dy : -dx; // 위로·왼쪽으로 밀면 앞으로
      if (Math.abs(forward) > 6) drag.moved = true;
      const span = Math.min(window.innerWidth, window.innerHeight) * 0.45;
      const s = useGallery.getState();
      s.setTarget(s.target + forward / span - drag.last);
      drag.last = forward / span;
      lastDir = Math.sign(forward);
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) snap(lastDir);
      drag = null;
    };

    const onKey = (e: KeyboardEvent) => {
      const s = useGallery.getState();
      if (s.film) {
        if (e.key === "Escape") useGallery.setState({ film: false });
        return;
      }
      if (e.key === "Escape") {
        if (s.detail !== null) closeViewer();
        else if (s.listOpen) s.toggleList(false);
        else if (s.overview) setOverview(false);
        return;
      }
      if (s.listOpen) return;
      const idx = Math.round(s.target);
      const forward = ["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key);
      const back = ["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key);
      if (s.detail !== null) {
        if (forward) moveDetail(1);
        if (back) moveDetail(-1);
        if (forward || back) e.preventDefault();
        return;
      }
      if (!s.started) {
        // 불러오는 화면이 떠 있는 동안에는 들어가지 않는다 (정문 화면의 '관람 시작'과 같게)
        if ((e.key === "Enter" || forward) && s.loaded && s.sceneryReady && s.arts.length > 0) {
          e.preventDefault();
          s.start();
        }
        return;
      }
      if (forward) step(1);
      else if (back) step(-1);
      else if (e.key === "Enter" && idx >= 0) openViewer(stopIndex(idx, s.arts.length));
      else if (e.key === "Home") goTo(0);
      else if (e.key === "End") goTo(s.arts.length - 1);
      else return;
      e.preventDefault();
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(idle);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref]);
}

/* ───────────────────────── 자동 관람 ───────────────────────── */

/**
 * 자동 관람: 작품 앞에 도착하면 dwellFor 만큼 머문 뒤 다음 작품으로 걷는다. 머무는 동안 캡션을 잠깐 보여 주고
 * 작품 정면으로 다가가 작품이 화면을 채웠다가(closeUp, 화면 위 버튼·캡션은 사라진다) 떠나기 전에 물러난다.
 * 마지막 작품까지 보면 완전히 처음으로 — 한글날 도입 영상(1분, 끝이 580돌·100돌 화면)이 위에서 내려와 덮고,
 * 그사이 카메라는 정문으로 옮기고, 영상이 끝나면 정문 화면을 AUTO.introHold 동안 보여 준 뒤 다시 걸어 들어간다.
 * 이렇게 끝없이 되풀이한다. 행사장 화면(?auto)은 처음 불러온 뒤에도 영상부터 튼다.
 * 기다리는 동안 누가 화면을 만지면 되풀이를 멈추고 그 사람에게 맡긴다.
 * 크게 보기·작품 목록이 열려 있는 동안에는 쉬고, 닫히면 그 작품에서 다시 머문다.
 * 주소에 ?auto 를 붙이면(행사장 화면) 불러오자마자 시작하고, 아무도 만지지 않은 채 AUTO.kioskIdle 이 지나면 다시 시작한다.
 */
function useAutoTour() {
  useEffect(() => {
    const kiosk = new URLSearchParams(window.location.search).has("auto");
    let lastInput = performance.now();
    let readyAt = 0;
    let firstDone = false;
    let cutAt = 0; // 기념 화면이 다 내려와 덮으면 카메라를 정문으로
    let replay = false; // 기념 화면 → 정문 화면을 거쳐 다시 자동 관람하려고 기다리는 중
    let introSince = 0; // 기념 화면이 다 걷힌 때 (정문 화면을 보여 주기 시작한 때)
    const touched = () => {
      lastInput = performance.now();
      if (replay) {
        replay = false;
        useGallery.setState({ autoReplay: false });
      }
    };
    let at = Number.NaN; // 머물고 있는 작품 번호
    /** 영상 → 정문 화면 → 자동 관람. 관람 중이었으면 영상이 덮은 뒤 카메라를 정문으로 옮긴다 */
    const beginReplay = (now: number, fromTour: boolean) => {
      useGallery.setState({ autoplay: false, autoReplay: true, autoDwell: null, closeUp: false, overview: false, started: false, film: true });
      cutAt = fromTour ? now + 1000 : 0;
      replay = true;
      introSince = 0;
    };
    const tick = () => {
      const s = useGallery.getState();
      const now = performance.now();
      if (cutAt && now >= cutAt) {
        cutAt = 0;
        jumpTo(-1);
      }
      if (replay && !cutAt && !s.splashUp && !s.film) {
        if (!introSince) introSince = now;
        if (now - introSince >= AUTO.introHold) {
          replay = false;
          useGallery.setState({ autoReplay: false });
          if (s.detail === null && !s.listOpen) {
            playAuto();
            return;
          }
        }
      }
      if (kiosk && s.loaded && s.sceneryReady && s.arts.length > 0) {
        // 첫 시작: 기념 화면이 걷히고 정문 제목을 잠깐 보여 준 뒤
        if (!readyAt) readyAt = now;
        const firstRun = !firstDone && !s.started && !s.autoplay && now - readyAt > 6000 && lastInput < readyAt;
        const idle = !s.autoplay && !replay && now - Math.max(lastInput, readyAt) > AUTO.kioskIdle;
        if (firstRun || idle) {
          firstDone = true;
          // 행사장 화면: 누르기 전에는 브라우저가 소리를 막지만, 소리를 허락한 키오스크 설정이면 바로 난다
          if (bgmWanted()) bgm.start();
          if (s.detail !== null) closeViewer();
          if (s.listOpen) s.toggleList(false);
          // 처음에는 영상부터, 누가 만지다 떠난 뒤에는 바로 관람
          if (firstRun) beginReplay(now, false);
          else playAuto();
          return;
        }
      }
      if (!s.autoplay) return;
      if (!s.started) {
        pauseAuto();
        return;
      }
      const n = s.arts.length;
      // 느리게 다가서는 마지막 몇 cm 는 머무는 시간에 넣는다
      const arrived = s.target >= 0 && Math.abs(s.current - s.target) < 0.04;
      if (s.detail !== null || s.listOpen || !arrived) {
        at = Number.NaN;
        if (s.autoDwell || s.closeUp) useGallery.setState({ autoDwell: null, closeUp: false });
        return;
      }
      // 카메라가 바퀴 번호를 옮겨 세도(t ↔ t ± n) 같은 작품이면 이어서 머문다
      const here = stopIndex(Math.round(s.target), n);
      if (here !== at || !s.autoDwell) {
        at = here;
        useGallery.setState({ autoDwell: { at: now, ms: dwellFor(s.arts[here]) } });
        return;
      }
      const spent = now - s.autoDwell.at;
      const close = spent > AUTO.closeUpAfter && spent < s.autoDwell.ms - AUTO.closeUpBefore;
      if (close !== s.closeUp) useGallery.setState({ closeUp: close });
      if (spent >= s.autoDwell.ms) {
        at = Number.NaN;
        if (here === n - 1 && n > 1) {
          // 한 바퀴 끝 → 완전히 처음(한글날 영상)부터
          beginReplay(now, true);
          return;
        }
        useGallery.setState({ autoDwell: null });
        autoAdvance();
      }
    };
    const id = window.setInterval(tick, 100);
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", touched, opts);
    window.addEventListener("keydown", touched, opts);
    window.addEventListener("wheel", touched, opts);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", touched, opts);
      window.removeEventListener("keydown", touched, opts);
      window.removeEventListener("wheel", touched, opts);
    };
  }, []);

  // 자동 관람 중에는(다시 시작하려고 기다리는 동안도) 화면이 꺼지지 않게 (지원하는 브라우저만)
  const autoplay = useGallery((s) => s.autoplay || s.autoReplay);
  useEffect(() => {
    if (!autoplay) return;
    type Lock = { release: () => Promise<void> };
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } }).wakeLock;
    if (!wl) return;
    let lock: Lock | null = null;
    let alive = true;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      wl.request("screen")
        .then((l) => {
          if (alive) lock = l;
          else l.release().catch(() => {});
        })
        .catch(() => {});
    };
    acquire();
    // 탭을 다녀오면 풀리므로 다시 건다
    document.addEventListener("visibilitychange", acquire);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, [autoplay]);
}

/** ▶ 자동 관람 / ❚❚ 멈춤 — 머무는 동안 아래에 남은 시간이 차오른다 */
function AutoButton() {
  const autoplay = useGallery((s) => s.autoplay);
  const dwell = useGallery((s) => s.autoDwell);
  return (
    <button
      onClick={() => (autoplay ? pauseAuto() : playAuto())}
      aria-pressed={autoplay}
      className={`${btn} relative overflow-hidden whitespace-nowrap px-4 py-2 text-sm font-bold`}
    >
      {autoplay ? "❚❚ 멈춤" : "▶ 자동 관람"}
      {autoplay && dwell && (
        <motion.span
          key={dwell.at}
          className="absolute bottom-0 left-0 h-[3px] bg-stone-800/70"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: dwell.ms / 1000, ease: "linear" }}
        />
      )}
    </button>
  );
}

/* ───────────────────────── 배경음 ───────────────────────── */

/**
 * 국악풍 배경음(src/lib/bgm.ts): 브라우저가 첫 누름 전에는 소리를 막으므로, 화면을 처음 누르거나 키를 누를 때 켠다
 * (끈 적이 있으면 켜지 않는다). 크게 보기를 여는 동안은 소리를 줄이고, 탭이 가려지면 쉰다.
 */
function useBgm() {
  useEffect(() => {
    const kick = () => {
      if (bgmWanted()) bgm.start();
    };
    const opts = { capture: true, passive: true } as const;
    const evs = ["pointerup", "touchend", "keydown", "click"] as const;
    evs.forEach((e) => window.addEventListener(e, kick, opts));
    const vis = () => bgm.pause(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", vis);
    // 크게 보기를 여는 동안 줄인다
    const unsub = useGallery.subscribe((s, p) => {
      if ((s.detail !== null) !== (p.detail !== null)) bgm.duck(s.detail !== null);
    });
    if (process.env.NODE_ENV !== "production") (window as unknown as { __bgm: typeof bgm }).__bgm = bgm;
    return () => {
      evs.forEach((e) => window.removeEventListener(e, kick, opts));
      document.removeEventListener("visibilitychange", vis);
      unsub();
    };
  }, []);
}

/** 배경음 켜기·끄기 (고른 것은 이 브라우저에 기억한다) */
function SoundButton() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(bgmWanted()), []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    setBgmWanted(next);
    if (next) bgm.start();
    else bgm.stop();
  };
  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "배경음 끄기" : "배경음 켜기"}
      title={on ? "배경음 끄기" : "배경음 켜기"}
      className={`${btn} grid h-9 w-9 shrink-0 place-items-center`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
        {on ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <path d="m16 9 6 6m0-6-6 6" />
        )}
      </svg>
    </button>
  );
}

/** 하늘에서 보기 / 걸어서 보기 */
function SkyButton() {
  const overview = useGallery((s) => s.overview);
  return (
    <button
      onClick={() => setOverview(!overview)}
      aria-pressed={overview}
      className={`${btn} h-12 shrink-0 whitespace-nowrap px-4 text-sm font-bold md:h-14 md:px-5`}
      title={overview ? "작품 앞으로 내려가기" : "광장 위에서 작품 원 전체 보기"}
    >
      {overview ? "걸어서 보기" : "하늘에서 보기"}
    </button>
  );
}

/* ───────────────────────── 작은 UI 조각 ───────────────────────── */

function AwardChip({ award, small }: { award?: string; small?: boolean }) {
  if (!award) return null;
  const c = awardColor(award);
  return (
    <span
      className={`inline-block rounded-full font-bold text-white ${small ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"}`}
      style={{ background: c }}
    >
      {award}
    </span>
  );
}

const btn =
  "pointer-events-auto rounded-full bg-white/90 text-stone-800 shadow-lg ring-1 ring-black/5 backdrop-blur transition hover:bg-white active:scale-95 disabled:opacity-35";

/* ───────────────────────── 오버레이 ───────────────────────── */

function Intro() {
  const started = useGallery((s) => s.started);
  const loaded = useGallery((s) => s.loaded);
  const sceneryReady = useGallery((s) => s.sceneryReady);
  const info = useGallery((s) => s.info);
  const count = useGallery((s) => s.arts.length);
  const start = useGallery((s) => s.start);
  const toggleList = useGallery((s) => s.toggleList);
  const { progress } = useProgress();
  const ready = loaded && sceneryReady;
  return (
    <AnimatePresence>
      {!started && (
        <motion.div
          key="intro"
          className="absolute inset-0 z-30 flex items-center justify-center bg-gradient-to-b from-sky-950/55 via-sky-900/25 to-transparent px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.8 } }}
        >
          <div className="max-w-xl text-center text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
            {info.상단문구 && <p className="mb-4 text-sm tracking-[0.3em] text-white/85">{info.상단문구}</p>}
            <h1 className="font-display text-4xl font-bold leading-tight md:text-6xl">{info.제목 ?? "한글 이름 꾸미기 대회"}</h1>
            <p className="mt-3 font-display text-xl text-white/90 md:text-3xl">{info.부제 ?? "작품 전시관"}</p>
            {info.소개문구 && <p className="mt-6 text-base text-white/85 md:text-lg">{info.소개문구}</p>}
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={start}
                disabled={!ready || count === 0}
                className="min-w-[9.5rem] rounded-full bg-white px-8 py-3.5 text-lg font-bold text-sky-900 shadow-xl transition hover:bg-sky-50 active:scale-95 disabled:opacity-50"
              >
                {ready ? "관람 시작" : `준비 중 ${Math.round(progress)}%`}
              </button>
              <button
                onClick={playAuto}
                disabled={!ready || count === 0}
                className="rounded-full border border-white/70 px-6 py-3.5 text-base font-bold text-white backdrop-blur-sm transition hover:bg-white/15 disabled:opacity-50"
              >
                ▶ 자동 관람
              </button>
              <button
                onClick={() => toggleList(true)}
                disabled={!loaded}
                className="rounded-full border border-white/70 px-6 py-3.5 text-base font-medium text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                작품 목록 {count > 0 && `(${count})`}
              </button>
              <button
                onClick={() => useGallery.setState({ film: true })}
                disabled={!loaded}
                className="rounded-full border border-white/70 px-6 py-3.5 text-base font-medium text-white backdrop-blur-sm transition hover:bg-white/15 disabled:opacity-50"
              >
                ▶ 한글날 영상
              </button>
            </div>
            <p className="mt-6 text-sm text-white/80">스크롤하거나 화면을 밀어서 한 작품씩 걸어가며 볼 수 있어요</p>
          </div>
          {info.배경출처 && (
            <p className="absolute bottom-3 left-1/2 w-max max-w-[92vw] -translate-x-1/2 rounded-xl bg-black/35 px-3 py-1 text-center text-[11px] text-white/90 backdrop-blur-sm">
              {info.배경출처링크 ? (
                <a href={info.배경출처링크} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                  {info.배경출처}
                </a>
              ) : (
                info.배경출처
              )}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Caption({ layout }: { layout: GalleryLayout | null }) {
  const arts = useGallery((s) => s.arts);
  const current = useGallery((s) => s.current);
  const started = useGallery((s) => s.started);
  const overview = useGallery((s) => s.overview);
  const closeUp = useGallery((s) => s.closeUp);
  const idx = stopIndex(current, arts.length);
  const art = arts[idx];
  const show = started && !overview && !closeUp && art && offStop(current, layout) < 0.22;
  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          key={art.id}
          data-noswipe
          className="pointer-events-auto w-full max-w-md rounded-2xl bg-white/90 p-4 md:max-w-sm text-stone-800 shadow-xl ring-1 ring-black/5 backdrop-blur md:p-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <AwardChip award={art.award} />
              <h2 className="mt-2 truncate font-display text-2xl font-bold md:text-3xl">{art.name || art.title}</h2>
              {(art.nameEn || art.nationality) && (
                <p className="mt-0.5 truncate text-sm text-stone-500 md:text-base">{[art.nameEn, art.nationality].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <span className="shrink-0 pt-1 text-xs tabular-nums text-stone-400">
              {idx + 1} / {arts.length}
            </span>
          </div>
          {art.description && (
            <p className="mt-2 line-clamp-1 text-sm leading-relaxed text-stone-600 md:mt-3 md:line-clamp-2">{art.description}</p>
          )}
          {idx === arts.length - 1 && (
            <p className="mt-3 text-center text-xs text-stone-500">
              마지막 작품입니다 ·{" "}
              {/* 되감지 않고 분수를 돌아 첫 작품까지 이어 걷는다 */}
              <button onClick={() => goTo(0)} className="font-bold text-stone-800 underline">
                처음으로
              </button>
            </p>
          )}
          <button
            onClick={() => openViewer(idx)}
            className="mt-3 w-full rounded-xl bg-stone-900 py-2 text-sm font-bold text-white transition hover:bg-stone-700 active:scale-[0.98]"
          >
            크게 보기
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Filmstrip() {
  const arts = useGallery((s) => s.arts);
  const current = useGallery((s) => s.current);
  const idx = stopIndex(current, arts.length);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    refs.current[idx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [idx]);
  return (
    <div data-noswipe className="pointer-events-auto hidden max-w-[min(60vw,720px)] gap-2 overflow-x-auto rounded-2xl bg-white/80 p-2 shadow-lg ring-1 ring-black/5 backdrop-blur [scrollbar-width:none] md:flex">
      {arts.map((a, i) => (
        <button
          key={a.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          onClick={() => goTo(i)}
          title={[a.award || a.group, a.name].filter(Boolean).join(" · ")}
          className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
            i === idx ? "ring-stone-900" : "ring-transparent opacity-70 hover:opacity-100"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.thumb ?? a.src} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: colorOf(a) }} />
        </button>
      ))}
    </div>
  );
}

function Hud({ layout, inert }: { layout: GalleryLayout | null; inert: boolean }) {
  const started = useGallery((s) => s.started);
  const info = useGallery((s) => s.info);
  const arts = useGallery((s) => s.arts);
  const target = useGallery((s) => s.target);
  const current = useGallery((s) => s.current);
  const toggleList = useGallery((s) => s.toggleList);
  const autoplay = useGallery((s) => s.autoplay);
  const overview = useGallery((s) => s.overview);
  const closeUp = useGallery((s) => s.closeUp);
  const idx = Math.round(target);
  const n = arts.length;
  const stop = stopIndex(idx, n);
  // ‹ 는 진입로를 걸어 들어오는 동안(목표가 아직 첫 바퀴 첫 작품)만 쓸 수 없다 — 원 위에서는 첫 작품 이전이 마지막 작품
  const prevOff = idx <= 0;
  const atFirst = stop === 0;
  const atLast = stop === n - 1;
  // 안내 문구: 첫 작품 앞에 처음 섰을 때만. 다른 작품으로 한 번 옮기면 다시 띄우지 않는다 (한 바퀴 돌아 와도)
  const [movedOnce, setMovedOnce] = useState(false);
  const leftFirst = started && idx >= 0 && stop !== 0;
  useEffect(() => {
    if (leftFirst) setMovedOnce(true);
  }, [leftFirst]);
  const moved = movedOnce || leftFirst || autoplay || !(stopIndex(current, n) === 0 && current > -0.5);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (!started) return null;
  return (
    <div
      inert={inert}
      className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 transition-opacity duration-700 md:p-5 ${closeUp ? "opacity-0 [&_*]:!pointer-events-none" : "opacity-100"}`}
    >
      {/* 위 */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => {
            pauseAuto();
            useGallery.setState({ started: false });
            useGallery.getState().setTarget(-1);
          }}
          className="pointer-events-auto min-w-0 truncate whitespace-nowrap rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-stone-800 shadow ring-1 ring-black/5 backdrop-blur"
        >
          {info.제목 ?? "작품 전시관"}
        </button>
        <div className="flex shrink-0 gap-2">
          <SoundButton />
          <AutoButton />
          <button onClick={() => toggleList(true)} className={`${btn} whitespace-nowrap px-4 py-2 text-sm font-bold`}>
            작품 목록
          </button>
        </div>
      </div>

      <AnimatePresence>
        {overview && (
          <motion.p
            key="sky"
            className="absolute left-1/2 top-16 w-max max-w-[90vw] -translate-x-1/2 rounded-full bg-black/45 px-4 py-2 text-center text-xs text-white backdrop-blur md:top-5 md:text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {n}점이 분수를 둘러싸고 있어요 · 작품을 누르면 그 앞으로 내려갑니다
          </motion.p>
        )}
        {!moved && !overview && (
          <motion.p
            className="absolute left-1/2 top-16 w-max max-w-[90vw] -translate-x-1/2 rounded-full bg-black/45 px-4 py-2 text-center text-xs text-white backdrop-blur md:top-5 md:text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {touch ? "화면을 밀거나 ‹ › 버튼으로 이동 · 작품을 누르면 크게 보기" : "스크롤 · ← → 키 · ‹ › 버튼으로 이동 · 작품을 누르면 크게 보기"}
          </motion.p>
        )}
      </AnimatePresence>

      {/* 아래 */}
      <div className="flex flex-col items-center gap-3 md:items-stretch">
        <div className="flex w-full justify-center md:justify-start">
          <Caption layout={layout} />
        </div>
        <div className="flex w-full items-center justify-center gap-3">
          <SkyButton />
          <button
            onClick={() => step(-1)}
            disabled={prevOff}
            className={`${btn} h-12 w-12 text-2xl md:h-14 md:w-14`}
            aria-label={atFirst && canLoop(n) ? "마지막 작품으로" : "이전 작품"}
            title={atFirst && canLoop(n) ? "마지막 작품으로" : undefined}
          >
            ‹
          </button>
          <Filmstrip />
          <button
            onClick={() => step(1)}
            disabled={!canLoop(n) && idx >= n - 1}
            className={`${btn} h-12 w-12 text-2xl md:h-14 md:w-14`}
            aria-label={atLast ? "처음 작품으로" : "다음 작품"}
            title={atLast ? "처음 작품으로" : undefined}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

function ListOverlay() {
  const open = useGallery((s) => s.listOpen);
  const arts = useGallery((s) => s.arts);
  const toggleList = useGallery((s) => s.toggleList);
  const groups = useMemo(() => {
    const m: { award: string; items: { a: ArtworkSource; i: number }[] }[] = [];
    arts.forEach((a, i) => {
      const key = a.award || a.group || "전시 작품";
      const g = m.find((x) => x.award === key);
      if (g) g.items.push({ a, i });
      else m.push({ award: key, items: [{ a, i }] });
    });
    return m;
  }, [arts]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="list"
          className="absolute inset-0 z-40 overflow-y-auto bg-stone-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="mx-auto max-w-5xl px-4 pb-16 pt-5 md:px-8">
            <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between bg-stone-50/95 px-4 py-3 md:-mx-8 md:px-8">
              <h2 className="text-xl font-bold text-stone-800">작품 목록</h2>
              <button onClick={() => toggleList(false)} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white">
                닫기
              </button>
            </div>
            {groups.map((g) => (
              <section key={g.award} className="mb-8">
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-stone-700">
                  <span className="h-4 w-1.5 rounded-full" style={{ background: colorOf(g.items[0].a) }} />
                  {g.award} <span className="text-sm font-normal text-stone-400">{g.items.length}점</span>
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {g.items.map(({ a, i }) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        toggleList(false);
                        goTo(i);
                      }}
                      className="group overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-stone-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.thumb ?? a.src} alt={a.name} loading="lazy" className="h-full w-full object-contain transition group-hover:scale-[1.03]" />
                      </div>
                      <div className="p-3">
                        <p className="truncate font-bold text-stone-800">{a.name || a.title}</p>
                        <p className="truncate text-sm text-stone-500">{[a.nameEn, a.nationality].filter(Boolean).join(" · ")}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────── 전체 ───────────────────────── */

function usePortrait() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerWidth < window.innerHeight);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return portrait;
}

/** 불러오는 동안·크게 보기가 열려 있는 동안 3D 는 초당 10번만 그린다 (카메라는 계속 옮긴 작품 쪽으로 걸어간다) */
function SlowWhileViewing({ open }: { open: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => invalidate(), 100);
    return () => window.clearInterval(id);
  }, [open, invalidate]);
  return null;
}

/** 휴대폰 '뒤로'가 사이트를 떠나지 않고 크게 보기만 닫게 */
function useViewerHistory() {
  useEffect(() => {
    // 새로고침 전에 쌓였던 크게 보기 기록은 지운다
    if (window.history.state?.museumViewer) {
      const rest = { ...window.history.state };
      delete rest.museumViewer;
      window.history.replaceState(rest, "");
    }
    const onPop = () => viewerPopped();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

export function OpenGallery() {
  useExhibition();
  useViewerHistory();
  useAutoTour();
  useBgm();
  const arts = useGallery((s) => s.arts);
  const splashRun = useGallery((s) => s.splashRun);
  const open = useGallery((s) => s.detail !== null);
  const film = useGallery((s) => s.film);
  // 불러오는 동안(기념 화면이 3D 를 가림)과 크게 보기 중에는 천천히 그린다
  const loading = useGallery((s) => !(s.loaded && s.sceneryReady));
  const livePortrait = usePortrait();
  // 크게 보기 중에 휴대폰을 돌려도 뒤의 3D 배치는 다시 만들지 않는다 (닫을 때 반영)
  const frozen = useRef(livePortrait);
  if (!open) frozen.current = livePortrait;
  const portrait = frozen.current;
  const layout = useMemo(() => (arts.length ? buildLayout(arts, { portrait }) : null), [arts, portrait]);
  useEffect(() => {
    useGallery.setState({ layout });
  }, [layout]);
  const rootRef = useRef<HTMLDivElement>(null);
  useWalkInput(rootRef);
  // 처음 한 번만 정한다 (휴대폰·저사양은 가볍게)
  const [quality] = useState<Quality>(detectQuality);
  const high = quality === "high";

  return (
    <div ref={rootRef} id="museum-root" className="bg-[#c9d3d6]">
      <Canvas
        frameloop={open || loading || film ? "demand" : "always"}
        inert={open}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 1.5]}
        // PC는 후처리(Effects)에서 톤 매핑을 하므로 렌더러는 그대로 둔다
        gl={{ antialias: !high, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = high ? THREE.NoToneMapping : THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
        camera={{ fov: portrait ? 64 : 55, near: 0.1, far: 1500, position: [0, 1.62, 40] }}
      >
        {layout && <GalleryScene layout={layout} quality={quality} />}
        <SlowWhileViewing open={open || loading || film} />
      </Canvas>
      <Intro />
      <Hud layout={layout} inert={open} />
      <ListOverlay />
      <ArtViewer />
      <AnimatePresence>{film && <IntroFilm key="film" />}</AnimatePresence>
      <Splash key={splashRun} replay={splashRun > 0} />
    </div>
  );
}
