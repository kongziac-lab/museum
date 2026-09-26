"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMuseum, usePlayerPos } from "@/lib/store";
import { PLAYER, ARCH, ENTRANCE, SEATED_EYE, wallNormal, getSpaceIdForPoint } from "@/lib/config";
import type { MuseumBuild } from "@/lib/config";
import { museumAudio } from "@/lib/audio";
import { consumeLookDelta, touchInput } from "@/lib/input";

const INTERACT_RADIUS = 3.8;
const VISIT_RADIUS = 3.2;
const BENCH_RADIUS = 2.8;
/** Within this range, sit wins over artwork inspect when closer to the bench. */
const BENCH_SIT_RADIUS = 2.0;
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpDesired = new THREE.Vector3();

interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * First-person navigation tuned for a calm museum: slow pace with smooth
 * acceleration/deceleration and camera inertia, optional mouse-look smoothing,
 * adjustable sensitivity + invert, a subtle slow-down near artworks, stable
 * collision against wall segments, the cinematic entry walk, inspect moves,
 * and bench Sit/Stand.
 */
export function FirstPersonController({ build }: { build: MuseumBuild }) {
  const { camera, gl } = useThree();

  const phase = useMuseum((s) => s.phase);
  const settings = useMuseum((s) => s.settings);
  const inspectId = useMuseum((s) => s.inspectId);
  const artworks = useMuseum((s) => s.artworks);

  const phaseRef = useRef(phase);
  const inspectRef = useRef(inspectId);
  const artworksRef = useRef(artworks);
  const settingsRef = useRef(settings);
  useEffect(() => void (phaseRef.current = phase), [phase]);
  useEffect(() => void (inspectRef.current = inspectId), [inspectId]);
  useEffect(() => void (artworksRef.current = artworks), [artworks]);
  useEffect(() => void (settingsRef.current = settings), [settings]);

  const walls = useMemo<AABB[]>(() => {
    const t = ARCH.wallThickness / 2;
    return build.wallSegments
      .filter((s) => s.collide)
      .map((s) =>
        s.orient === "x"
          ? { minX: s.pos - t, maxX: s.pos + t, minZ: s.min, maxZ: s.max }
          : { minX: s.min, maxX: s.max, minZ: s.pos - t, maxZ: s.pos + t }
      );
  }, [build.wallSegments]);

  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const targetYaw = useRef(0);
  const targetPitch = useRef(0);
  const pos = useRef(new THREE.Vector3(0, PLAYER.eyeHeight, ENTRANCE.startZ));
  const eye = useRef<number>(PLAYER.eyeHeight);
  const vel = useRef(new THREE.Vector3());
  const fov = useRef<number>(PLAYER.defaultFov);
  const bobPhase = useRef(0);

  const seatedRef = useRef(false);
  const benchTarget = useRef(new THREE.Vector3());

  const anim = useRef({
    active: false,
    t: 0,
    fromPos: new THREE.Vector3(),
    fromQuat: new THREE.Quaternion(),
    toPos: new THREE.Vector3(),
    toQuat: new THREE.Quaternion(),
    returning: false,
  });
  const walkPose = useRef({ pos: new THREE.Vector3(), yaw: 0, pitch: 0 });
  const throttle = useRef(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore game keys while typing in the share form or any input.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const st = useMuseum.getState();
      if (st.shareOpen) return; // the form owns the keyboard while open

      keys.current[e.code] = true;
      if (e.code === "Space" && phaseRef.current === "reading") {
        e.preventDefault();
        useMuseum.getState().setPhase("exploring");
        return;
      }
      if (e.code === "KeyE") {
        e.preventDefault();
        // E toggles: leave inspection/enlarged note if open, otherwise interact.
        if (inspectRef.current) useMuseum.getState().inspect(null);
        else handleInteract();
      }
      if (e.code === "Escape") {
        if (seatedRef.current) stand();
        else if (inspectRef.current) useMuseum.getState().inspect(null);
        else if (st.enlargedNoteId) st.setEnlargedNote(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false);

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      if (inspectRef.current) return;
      const s = settingsRef.current;
      const sens = s.mouseSensitivity * (seatedRef.current ? 0.6 : 1);
      const inv = s.invertY ? -1 : 1;
      targetYaw.current -= e.movementX * PLAYER.lookSpeed * sens;
      targetPitch.current = THREE.MathUtils.clamp(
        targetPitch.current - inv * e.movementY * PLAYER.lookSpeed * sens,
        -1.15,
        1.15
      );
    };

    const onWheel = (e: WheelEvent) => {
      fov.current = THREE.MathUtils.clamp(fov.current + e.deltaY * 0.03, PLAYER.minZoom, PLAYER.maxZoom);
    };
    const onLockChange = () => {
      useMuseum.getState().setPointerLocked(document.pointerLockElement === gl.domElement);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  const handleInteract = () => {
    if (phaseRef.current !== "exploring") return;
    const store = useMuseum.getState();
    if (seatedRef.current) {
      stand();
      return;
    }
    if (store.enlargedNoteId) {
      store.setEnlargedNote(null);
      return;
    }
    if (shouldSitOnBench(store)) {
      sit(store.nearBenchId!);
      return;
    }
    if (store.nearId) {
      store.inspect(store.nearId);
      return;
    }
    if (store.nearPedestal) {
      store.setShareOpen(true);
      return;
    }
    if (store.nearNoteId) {
      store.setEnlargedNote(store.nearNoteId);
      return;
    }
  };

  const shouldSitOnBench = (store: ReturnType<typeof useMuseum.getState>) => {
    if (!store.nearBenchId) return false;
    const bench = build.benches.find((b) => b.id === store.nearBenchId);
    if (!bench) return false;
    const dBench = Math.hypot(bench.x - pos.current.x, bench.z - pos.current.z);
    if (dBench > BENCH_SIT_RADIUS) return false;
    if (!store.nearId) return true;
    const art = artworksRef.current.find((a) => a.id === store.nearId);
    if (!art) return true;
    const dArt = Math.hypot(art.position[0] - pos.current.x, art.position[2] - pos.current.z);
    return dBench < dArt - 0.4;
  };

  const sit = (benchId: string) => {
    const bench = build.benches.find((b) => b.id === benchId);
    if (!bench) return;
    seatedRef.current = true;
    benchTarget.current.set(bench.x, 0, bench.z);
    vel.current.set(0, 0, 0);
    useMuseum.getState().setSeated(true);
  };

  const stand = () => {
    seatedRef.current = false;
    useMuseum.getState().setSeated(false);
  };

  // Inspect camera targets.
  useEffect(() => {
    const a = anim.current;
    if (inspectId) {
      const art = artworks.find((x) => x.id === inspectId);
      if (!art) return;
      const n = wallNormal(art.rotation[1]);
      const dist = Math.max(1.3, art.scale * 0.95);
      a.fromPos.copy(camera.position);
      a.fromQuat.copy(camera.quaternion);
      a.toPos.set(art.position[0] + n[0] * dist, art.position[1], art.position[2] + n[2] * dist);
      const m = new THREE.Matrix4();
      m.lookAt(a.toPos, new THREE.Vector3(...art.position), new THREE.Vector3(0, 1, 0));
      a.toQuat.setFromRotationMatrix(m);
      a.t = 0;
      a.active = true;
      a.returning = false;
      walkPose.current.pos.copy(pos.current);
      walkPose.current.yaw = yaw.current;
      walkPose.current.pitch = pitch.current;
    } else if (a.active || camera.position.distanceTo(walkPose.current.pos) > 0.01) {
      a.fromPos.copy(camera.position);
      a.fromQuat.copy(camera.quaternion);
      a.toPos.copy(walkPose.current.pos);
      const e = new THREE.Euler(walkPose.current.pitch, walkPose.current.yaw, 0, "YXZ");
      a.toQuat.setFromEuler(e);
      a.t = 0;
      a.active = true;
      a.returning = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectId]);

  function resolveCollisions() {
    const r = PLAYER.radius;
    for (let pass = 0; pass < 2; pass++) {
      for (const w of walls) {
        const minX = w.minX - r;
        const maxX = w.maxX + r;
        const minZ = w.minZ - r;
        const maxZ = w.maxZ + r;
        const px = pos.current.x;
        const pz = pos.current.z;
        if (px <= minX || px >= maxX || pz <= minZ || pz >= maxZ) continue;
        const dLeft = px - minX;
        const dRight = maxX - px;
        const dNear = pz - minZ;
        const dFar = maxZ - pz;
        const m = Math.min(dLeft, dRight, dNear, dFar);
        if (m === dLeft) {
          pos.current.x = minX;
          if (vel.current.x > 0) vel.current.x = 0;
        } else if (m === dRight) {
          pos.current.x = maxX;
          if (vel.current.x < 0) vel.current.x = 0;
        } else if (m === dNear) {
          pos.current.z = minZ;
          if (vel.current.z > 0) vel.current.z = 0;
        } else {
          pos.current.z = maxZ;
          if (vel.current.z < 0) vel.current.z = 0;
        }
      }
    }
  }

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const ph = phaseRef.current;
    const s = settingsRef.current;
    const reduced = s.reducedMotion;
    const smooth = s.motionSmoothing && !reduced;

    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = THREE.MathUtils.damp(cam.fov, fov.current, 8, delta);
    cam.updateProjectionMatrix();

    // Inspect / return animation owns the camera entirely.
    if (anim.current.active) {
      const a = anim.current;
      a.t = Math.min(1, a.t + delta * (reduced ? 4 : 1.4));
      const e = a.t * a.t * (3 - 2 * a.t);
      camera.position.lerpVectors(a.fromPos, a.toPos, e);
      camera.quaternion.slerpQuaternions(a.fromQuat, a.toQuat, e);
      if (a.t >= 1) {
        a.active = false;
        if (a.returning) {
          pos.current.copy(walkPose.current.pos);
          yaw.current = targetYaw.current = walkPose.current.yaw;
          pitch.current = targetPitch.current = walkPose.current.pitch;
        }
      }
      return;
    }

    if (ph === "inspecting") return;

    // Smooth look toward the input target.
    if (smooth) {
      yaw.current = THREE.MathUtils.damp(yaw.current, targetYaw.current, 16, delta);
      pitch.current = THREE.MathUtils.damp(pitch.current, targetPitch.current, 16, delta);
    } else {
      yaw.current = targetYaw.current;
      pitch.current = targetPitch.current;
    }

    // Eye height eases between standing and seated.
    const targetEye = seatedRef.current ? SEATED_EYE : PLAYER.eyeHeight;
    eye.current = THREE.MathUtils.damp(eye.current, targetEye, 4.5, delta);

    if (ph === "entering") {
      targetYaw.current = yaw.current = 0;
      targetPitch.current = pitch.current = 0;
      pos.current.z = THREE.MathUtils.damp(pos.current.z, ENTRANCE.walkToZ, 1.0, delta);
      pos.current.x = THREE.MathUtils.damp(pos.current.x, 0, 1.0, delta);
      applyCamera(0, 0);
      if (pos.current.z <= ENTRANCE.walkToZ + 0.4) useMuseum.getState().setPhase("reading");
      return;
    }

    if (ph === "reading") {
      const [ldx, ldy] = consumeLookDelta();
      if (ldx || ldy) {
        const inv = s.invertY ? -1 : 1;
        targetYaw.current -= ldx * PLAYER.lookSpeed * 1.2 * s.mouseSensitivity;
        targetPitch.current = THREE.MathUtils.clamp(
          targetPitch.current - inv * ldy * PLAYER.lookSpeed * 1.2 * s.mouseSensitivity,
          -0.85,
          0.85
        );
      }
      if (smooth) {
        yaw.current = THREE.MathUtils.damp(yaw.current, targetYaw.current, 12, delta);
        pitch.current = THREE.MathUtils.damp(pitch.current, targetPitch.current, 12, delta);
      } else {
        yaw.current = targetYaw.current;
        pitch.current = targetPitch.current;
      }
      applyCamera(0, 0);
      return;
    }

    if (ph !== "exploring") {
      applyCamera(0, 0);
      return;
    }

    // Freeze while the share form or an enlarged note is open (the room is
    // blurred / a dialog owns focus).
    const ui = useMuseum.getState();
    if (ui.shareOpen || ui.enlargedNoteId) {
      vel.current.set(0, 0, 0);
      applyCamera(0, 0);
      return;
    }

    // Seated: no walking, gentle settle onto the bench, free (slower) look.
    if (seatedRef.current) {
      pos.current.x = THREE.MathUtils.damp(pos.current.x, benchTarget.current.x, 3, delta);
      pos.current.z = THREE.MathUtils.damp(pos.current.z, benchTarget.current.z, 3, delta);
      applyCamera(0, 0);
      throttle.current += delta;
      if (throttle.current >= 0.1) {
        throttle.current = 0;
        usePlayerPos.getState().set(pos.current.x, pos.current.z, yaw.current);
      }
      return;
    }

    // Touch look.
    const [ldx, ldy] = consumeLookDelta();
    if (ldx || ldy) {
      const inv = s.invertY ? -1 : 1;
      targetYaw.current -= ldx * PLAYER.lookSpeed * 1.4 * s.mouseSensitivity;
      targetPitch.current = THREE.MathUtils.clamp(
        targetPitch.current - inv * ldy * PLAYER.lookSpeed * 1.4 * s.mouseSensitivity,
        -1.15,
        1.15
      );
    }

    tmpForward.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    tmpRight.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    let fwd = 0;
    let strafe = 0;
    if (keys.current["KeyW"] || keys.current["ArrowUp"]) fwd += 1;
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) fwd -= 1;
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) strafe += 1;
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) strafe -= 1;
    fwd += -touchInput.moveY;
    strafe += touchInput.moveX;

    tmpDesired.set(0, 0, 0);
    tmpDesired.addScaledVector(tmpForward, fwd);
    tmpDesired.addScaledVector(tmpRight, strafe);
    if (tmpDesired.lengthSq() > 1) tmpDesired.normalize();

    // Subtly slow the pace when close to an artwork — encourages lingering.
    const nearArt = useMuseum.getState().nearId != null;
    const speed = PLAYER.speed * s.speedScale * (nearArt ? 0.62 : 1);
    tmpDesired.multiplyScalar(speed);

    const hasInput = fwd !== 0 || strafe !== 0;
    const rate = hasInput ? PLAYER.accel : PLAYER.damping;
    vel.current.x = THREE.MathUtils.damp(vel.current.x, tmpDesired.x, rate, delta);
    vel.current.z = THREE.MathUtils.damp(vel.current.z, tmpDesired.z, rate, delta);

    pos.current.x += vel.current.x * delta;
    pos.current.z += vel.current.z * delta;
    resolveCollisions();

    const speed01 = Math.min(1, vel.current.length() / Math.max(0.001, speed));
    let bobY = 0;
    let swayX = 0;
    if (smooth && speed01 > 0.08) {
      bobPhase.current += delta * PLAYER.bobSpeed * speed01;
      bobY = Math.sin(bobPhase.current) * PLAYER.bobAmount * speed01;
      swayX = Math.sin(bobPhase.current * 0.5) * PLAYER.swayAmount * speed01;
    } else {
      bobPhase.current = 0;
    }
    applyCamera(bobY, swayX);

    museumAudio.footstep(performance.now(), speed01);

    throttle.current += delta;
    if (throttle.current >= 0.08) {
      throttle.current = 0;
      updateProximity();
    }
  });

  function applyCamera(bobY: number, swayX: number) {
    camera.position.set(pos.current.x, eye.current + bobY, pos.current.z);
    const e = new THREE.Euler(pitch.current, yaw.current, swayX, "YXZ");
    camera.quaternion.setFromEuler(e);
  }

  function updateProximity() {
    const store = useMuseum.getState();
    const list = artworksRef.current;
    const cx = pos.current.x;
    const cz = pos.current.z;

    const roomId = getSpaceIdForPoint(cx, cz, build.spaces);
    if (roomId && roomId !== store.currentRoomId) store.setCurrentRoom(roomId);

    const viewX = -Math.sin(yaw.current);
    const viewZ = -Math.cos(yaw.current);

    let best: string | null = null;
    let bestDist = Infinity;
    let bestScore = Infinity;
    for (const art of list) {
      const dx = art.position[0] - cx;
      const dz = art.position[2] - cz;
      const dist = Math.hypot(dx, dz);
      if (dist > INTERACT_RADIUS) continue;
      const dot = (dx * viewX + dz * viewZ) / (dist || 1);
      if (dot < 0.4) continue;
      const score = dist - dot;
      if (score < bestScore) {
        bestScore = score;
        best = art.id;
        bestDist = dist;
      }
      if (dist < VISIT_RADIUS) store.markVisited(art.id);
    }

    let bench: string | null = null;
    let benchDist = Infinity;
    for (const b of build.benches) {
      const d = Math.hypot(b.x - cx, b.z - cz);
      if (d < BENCH_RADIUS && d < benchDist) {
        benchDist = d;
        bench = b.id;
      }
    }

    const preferBench =
      bench !== null && benchDist < BENCH_SIT_RADIUS && (best === null || benchDist < bestDist - 0.4);

    if (preferBench) store.setNear(null);
    else if (best !== store.nearId) store.setNear(best);

    if (bench !== store.nearBenchId) store.setNearBench(bench);

    usePlayerPos.getState().set(cx, cz, yaw.current);
  }

  return null;
}
