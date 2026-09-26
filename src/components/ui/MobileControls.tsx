"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMuseum } from "@/lib/store";
import { touchInput } from "@/lib/input";

/**
 * Touch controls: a virtual joystick (bottom-left) for movement, a
 * drag-anywhere-on-the-right look area, and a tap-to-inspect action button.
 */
export function MobileControls() {
  const phase = useMuseum((s) => s.phase);
  const nearId = useMuseum((s) => s.nearId);
  const nearBenchId = useMuseum((s) => s.nearBenchId);
  const seated = useMuseum((s) => s.seated);
  const inspectId = useMuseum((s) => s.inspectId);

  // Trigger the same unified interaction the E key uses (stand / inspect / sit).
  const interact = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
  const leaveInspect = () => useMuseum.getState().inspect(null);

  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lastLook = useRef<{ x: number; y: number } | null>(null);

  const R = 52; // joystick radius (px)

  const onJoyStart = (e: React.PointerEvent) => {
    joyId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    moveKnob(e);
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    moveKnob(e);
  };
  const onJoyEnd = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    joyId.current = null;
    touchInput.moveX = 0;
    touchInput.moveY = 0;
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
  };
  const moveKnob = (e: React.PointerEvent) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    touchInput.moveX = dx / R;
    touchInput.moveY = dy / R;
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onLookStart = (e: React.PointerEvent) => {
    lookId.current = e.pointerId;
    lastLook.current = { x: e.clientX, y: e.clientY };
  };
  const onLookMove = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId || !lastLook.current) return;
    touchInput.lookDX += e.clientX - lastLook.current.x;
    touchInput.lookDY += e.clientY - lastLook.current.y;
    lastLook.current = { x: e.clientX, y: e.clientY };
  };
  const onLookEnd = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId) return;
    lookId.current = null;
    lastLook.current = null;
  };

  if (phase !== "exploring" && phase !== "inspecting") return null;

  return (
    <>
      {/* Look area — right side of the screen. */}
      {phase === "exploring" && (
        <div
          className="absolute inset-y-0 right-0 z-10 w-1/2 touch-none"
          onPointerDown={onLookStart}
          onPointerMove={onLookMove}
          onPointerUp={onLookEnd}
          onPointerCancel={onLookEnd}
        />
      )}

      {/* Virtual joystick — bottom-left (hidden while seated). */}
      {phase === "exploring" && !seated && (
        <div
          ref={baseRef}
          className="absolute bottom-24 left-8 z-20 flex h-28 w-28 touch-none items-center justify-center rounded-full border border-bone/20 bg-black/25 backdrop-blur-sm"
          onPointerDown={onJoyStart}
          onPointerMove={onJoyMove}
          onPointerUp={onJoyEnd}
          onPointerCancel={onJoyEnd}
        >
          <div
            ref={knobRef}
            className="h-12 w-12 rounded-full bg-bone/70"
            style={{ transform: "translate(0px, 0px)" }}
          />
        </div>
      )}

      {/* Contextual action button: Inspect / Sit / Stand / Return. */}
      <AnimatePresence>
        {(() => {
          // 감상 모드에서는 화면 위쪽 '돌아가기' 버튼을 쓰므로 여기선 숨긴다.
          const label = inspectId
            ? null
            : seated
              ? "일어서기"
              : nearId
                ? "작품 보기"
                : nearBenchId
                  ? "앉기"
                  : null;
          if (!label) return null;
          return (
            <motion.button
              key={label}
              className="absolute bottom-28 right-8 z-30 rounded-full border border-bone/30 bg-black/45 px-6 py-3 text-sm tracking-[0.15em] text-bone backdrop-blur-md"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => (inspectId ? leaveInspect() : interact())}
            >
              {label}
            </motion.button>
          );
        })()}
      </AnimatePresence>
    </>
  );
}
