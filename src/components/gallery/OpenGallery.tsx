"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";
import { awardColor } from "@/lib/config";
import { buildLayout, canLoop, goTo, offStop, step, stopIndex, useGallery, type GalleryLayout } from "@/lib/gallery";
import type { ArtworkSource, ExhibitionBackground, ExhibitionInfo } from "@/lib/types";
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

/**
 * 크게 보기에서 이전·다음 작품. 카메라 목표도 한 칸 옮겨 닫으면 그 작품 앞에 서 있게 한다
 * (원을 따라 끝없이: 마지막 다음은 첫 작품, 첫 작품 이전은 마지막 작품).
 */
function moveDetail(d: 1 | -1) {
  const s = useGallery.getState();
  if (s.detail === null) return;
  const n = s.arts.length;
  if (!canLoop(n)) {
    const next = s.detail + d;
    if (next < 0 || next >= n) return;
    s.openDetail(next);
    goTo(next);
    return;
  }
  // 보고 있는 작품의, 지금 목표에서 가장 가까운 바퀴 자리에서 한 칸 (빠르게 눌러도 목표 기준이라 어긋나지 않는다)
  const base = Math.round(s.target);
  let here = s.detail + Math.round((base - s.detail) / n) * n;
  if (here < 0) here = s.detail;
  let next = here + d;
  if (next < 0) next = n - 1; // 진입로에서 첫 작품 이전 → 마지막 작품
  s.setTarget(next);
  s.openDetail(stopIndex(next, n));
}

function useWalkInput(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let lastDir = 0;

    const blocked = () => {
      const s = useGallery.getState();
      return !s.started || s.detail !== null || s.listOpen;
    };

    const onUi = (e: Event) => Boolean((e.target as HTMLElement | null)?.closest?.("button, [data-noswipe]"));

    const onWheel = (e: WheelEvent) => {
      if (blocked() || onUi(e)) return;
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
      if (e.key === "Escape") {
        if (s.detail !== null) s.openDetail(null);
        else if (s.listOpen) s.toggleList(false);
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
        if (e.key === "Enter" || forward) {
          e.preventDefault();
          s.start();
        }
        return;
      }
      if (forward) step(1);
      else if (back) step(-1);
      else if (e.key === "Enter" && idx >= 0) s.openDetail(stopIndex(idx, s.arts.length));
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
            <p className="mt-3 font-display text-xl text-white/90 md:text-3xl">{info.부제 ?? "수상작 전시"}</p>
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
                onClick={() => toggleList(true)}
                disabled={!loaded}
                className="rounded-full border border-white/70 px-6 py-3.5 text-base font-medium text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                작품 목록 {count > 0 && `(${count})`}
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
  const openDetail = useGallery((s) => s.openDetail);
  const idx = stopIndex(current, arts.length);
  const art = arts[idx];
  const show = started && art && offStop(current, layout) < 0.22;
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
              {art.nationality && <p className="mt-0.5 text-sm text-stone-500 md:text-base">{art.nationality}</p>}
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
            onClick={() => openDetail(idx)}
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
          title={`${a.award} · ${a.name}`}
          className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
            i === idx ? "ring-stone-900" : "ring-transparent opacity-70 hover:opacity-100"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.src} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: awardColor(a.award) }} />
        </button>
      ))}
    </div>
  );
}

function Hud({ layout }: { layout: GalleryLayout | null }) {
  const started = useGallery((s) => s.started);
  const info = useGallery((s) => s.info);
  const arts = useGallery((s) => s.arts);
  const target = useGallery((s) => s.target);
  const current = useGallery((s) => s.current);
  const toggleList = useGallery((s) => s.toggleList);
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
  const moved = movedOnce || leftFirst || !(stopIndex(current, n) === 0 && current > -0.5);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (!started) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 md:p-5">
      {/* 위 */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => {
            useGallery.setState({ started: false });
            useGallery.getState().setTarget(-1);
          }}
          className="pointer-events-auto rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-stone-800 shadow ring-1 ring-black/5 backdrop-blur"
        >
          {info.제목 ?? "수상작 전시"}
        </button>
        <button onClick={() => toggleList(true)} className={`${btn} px-4 py-2 text-sm font-bold`}>
          작품 목록
        </button>
      </div>

      <AnimatePresence>
        {!moved && (
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
      const key = a.award || "기타";
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
                  <span className="h-4 w-1.5 rounded-full" style={{ background: awardColor(g.award) }} />
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
                        <img src={a.src} alt={a.name} loading="lazy" className="h-full w-full object-contain transition group-hover:scale-[1.03]" />
                      </div>
                      <div className="p-3">
                        <p className="truncate font-bold text-stone-800">{a.name || a.title}</p>
                        <p className="truncate text-sm text-stone-500">{a.nationality}</p>
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

function Detail() {
  const detail = useGallery((s) => s.detail);
  const arts = useGallery((s) => s.arts);
  const openDetail = useGallery((s) => s.openDetail);
  const art = detail !== null ? arts[detail] : null;

  const lastArt = detail !== null && detail === arts.length - 1;

  return (
    <AnimatePresence>
      {art && detail !== null && (
        <motion.div
          key="detail"
          className="absolute inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm md:flex-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => openDetail(null)}
        >
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 md:p-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img
              key={art.src}
              src={art.src}
              alt={art.name}
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div
            className="w-full shrink-0 bg-white p-5 text-stone-800 md:flex md:h-full md:w-80 md:flex-col md:justify-center md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <AwardChip award={art.award} />
            <h2 className="mt-3 font-display text-3xl font-bold">{art.name || art.title}</h2>
            {art.nationality && <p className="mt-1 text-stone-500">{art.nationality}</p>}
            {art.description && <p className="mt-4 whitespace-pre-line leading-relaxed text-stone-700">{art.description}</p>}
            <div className="mt-6 flex items-center gap-2">
              <button
                onClick={() => moveDetail(-1)}
                disabled={!canLoop(arts.length) && detail <= 0}
                className="flex-1 rounded-xl bg-stone-100 py-2.5 font-bold disabled:opacity-40"
              >
                {detail === 0 && canLoop(arts.length) ? "‹ 마지막으로" : "‹ 이전"}
              </button>
              <button
                onClick={() => moveDetail(1)}
                disabled={!canLoop(arts.length) && detail >= arts.length - 1}
                className="flex-1 rounded-xl bg-stone-100 py-2.5 font-bold disabled:opacity-40"
              >
                {lastArt ? "처음으로 ›" : "다음 ›"}
              </button>
            </div>
            <button onClick={() => openDetail(null)} className="mt-2 w-full rounded-xl bg-stone-900 py-2.5 font-bold text-white">
              닫기
            </button>
            <p className="mt-3 text-center text-xs tabular-nums text-stone-400">
              {detail + 1} / {arts.length}
            </p>
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

export function OpenGallery() {
  useExhibition();
  const arts = useGallery((s) => s.arts);
  const portrait = usePortrait();
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
      </Canvas>
      <Intro />
      <Hud layout={layout} />
      <ListOverlay />
      <Detail />
    </div>
  );
}
