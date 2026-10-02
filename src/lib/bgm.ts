"use client";

/**
 * 국악풍 배경음 — 음원 파일 없이 브라우저(Web Audio)에서 그때그때 합성한다. 되풀이되지 않고 끝없이 이어진다.
 *
 * - 음계: 평조 다섯 음 (황·태·중·임·남 = E♭·F·A♭·B♭·C)
 * - 가야금: 명주실 뜯는 소리 (Karplus–Strong 줄 모형을 음마다 한 번 구워 둔다) + 농현(떠는 소리·꺾는 소리)
 * - 대금: 사인·삼각파, 첫소리에만 아주 짧은 숨(걸러 낸 잡음 — 이어지는 내내 깔면 '슥슥' 잡음으로 들린다),
 *   음이 길어지면 늦게 걸리는 떨림, 살짝 밀어 올려 내는 첫소리
 * - 바탕: 계속 울리는 지속음은 두지 않는다(웅 하는 소리가 거슬린다). 악구가 바뀔 때 가야금 낮은 줄을 한 번 뜯어
 *   으뜸음(황·임·중)을 잠깐 받치고, 가끔 풍경 소리, 넓은 잔향
 * - 흐름: 가야금 홀로 → 대금과 가야금 → 쉼(풍경·낮은 줄만)을 가중치를 두고 번갈아. 가락은 다섯 음 위를 걸어 다니다
 *   황이나 임으로 맺는다. 가끔 꾸밈음(시김새).
 *
 * 음원 목록(setPlaylist — public/audio/tour/*.mp3)이 있으면 합성 대신 그 곡들을 차례로, 끝과 처음을 겹쳐 이어
 * 끝없이 돈다. 받지 못하면 합성으로 돌아간다.
 *
 * 브라우저는 사람이 한 번 누르기 전에는 소리를 못 내게 하므로, 첫 누름에서 start() 를 부른다.
 * 소리가 필요 없는 동안(꺼짐·영상이 나오는 동안·탭이 가려짐)은 오디오를 멈춰 두므로 곡은 그 자리에서 기다린다.
 */

const HZ = (semitonesFromEb4: number) => 311.127 * Math.pow(2, semitonesFromEb4 / 12);
/** 평조 한 옥타브 (E♭4 기준 반음 수): 황 태 중 임 남 */
const STEPS = [0, 2, 5, 7, 9];
/** 음 번호(0 = 황 E♭4, 5 = 한 옥타브 위 황) → 주파수 */
function degreeHz(d: number) {
  const oct = Math.floor(d / 5);
  const i = ((d % 5) + 5) % 5;
  return HZ(STEPS[i] + oct * 12);
}

const BEAT = 0.46; // 한 박 (초) — 느린 진양조·중모리 사이 느낌
const LOOKAHEAD = 1.6; // 몇 초 앞까지 미리 예약하는지

type Section = "solo" | "duet" | "rest";

/** 곡과 곡을 겹치는 길이 (초) */
const XFADE = 3;

class Bgm {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private duckGain!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private plucks = new Map<number, AudioBuffer>();
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private next = 0; // 다음 악구를 시작할 시각 (ctx 시간)
  private section: Section = "rest";
  private sectionLeft = 0;
  /** 지금 으뜸음 (E♭4 기준 반음: 0 황 · 7 임 · 5 중) — 가락이 이 음 둘레에서 논다 */
  private droneRoot = 0;
  private seed = (Date.now() % 100000) + 7;
  private volume = 0.55;
  private ducked = false;
  private hushed = false;
  private hidden = false;
  private sleepTimer: number | null = null;
  /* 음원 목록 */
  private music!: GainNode;
  private tracks: string[] = [];
  private trackAt = 0; // 다음에 틀 곡 번호
  private trackFails = 0;
  private decoded = new Map<string, Promise<AudioBuffer | null>>();
  private voice: { gain: GainNode; ends: number } | null = null;
  private queuing = false;
  playing = false;

  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  private pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rnd() * xs.length)];
  }

  /** 첫 누름에서 부른다. 이미 켜져 있으면 아무것도 안 한다. */
  start() {
    if (typeof window === "undefined") return;
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    // 누르는 순간에 한 번 깨워야 브라우저가 소리를 허락한다 (영상 중이면 곧 다시 쉰다)
    void ctx.resume();
    if (this.playing) return;
    this.playing = true;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.volume, t + 3);
    this.next = Math.max(this.next, t + 0.3);
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 250);
    this.tick();
    if (!this.wantRun()) this.run(false, 1300);
  }

  /** 들려줄 곡들 (주소 목록). 비우면 합성 국악을 낸다. */
  setPlaylist(urls: string[]) {
    if (urls.join("|") === this.tracks.join("|")) return;
    this.tracks = urls.slice();
    this.trackAt = 0;
    this.trackFails = 0;
    if (this.playing) this.tick();
  }

  private tick() {
    if (this.tracks.length) this.queueTrack();
    else this.schedule();
  }

  /** 서서히 줄이고 멈춘다 */
  stop() {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 1.2);
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.run(false, 1400);
  }

  /** 크게 보기 등에서 소리를 줄인다 */
  duck(on: boolean) {
    if (this.ducked === on) return;
    this.ducked = on;
    this.level(0.8);
  }

  /** 다른 음악(한글날 영상)이 나오는 동안 완전히 쉰다 */
  hush(on: boolean) {
    if (this.hushed === on) return;
    this.hushed = on;
    if (!on && this.wantRun()) this.run(true);
    this.level(on ? 1.2 : 2.5);
    if (on) this.run(false, 1300);
  }

  private level(sec: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const to = this.hushed ? 0 : this.ducked ? 0.35 : 1;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, t);
    this.duckGain.gain.linearRampToValueAtTime(to, t + sec);
  }

  /** 탭이 가려지면 잠시 쉰다 */
  pause(hidden: boolean) {
    this.hidden = hidden;
    if (!this.ctx || !this.playing) return;
    this.run(this.wantRun());
  }

  private wantRun() {
    return this.playing && !this.hidden && !this.hushed;
  }

  /** 오디오를 돌리거나 멈춘다 (멈출 때는 소리가 다 줄어든 뒤에) */
  private run(on: boolean, afterMs = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.sleepTimer !== null) window.clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (on) {
      void ctx.resume();
      return;
    }
    this.sleepTimer = window.setTimeout(() => {
      this.sleepTimer = null;
      if (!this.wantRun()) void ctx.suspend();
    }, afterMs);
  }

  /* ───────────── 음원 목록 ───────────── */

  /** 곡을 받아 풀어 둔다 (지금 곡과 다음 곡만 들고 있는다) */
  private decode(url: string) {
    let p = this.decoded.get(url);
    if (!p) {
      const ctx = this.ctx!;
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.arrayBuffer();
        })
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null);
      this.decoded.set(url, p);
    }
    return p;
  }

  /** 지금 곡이 끝나 가면 다음 곡을 겹쳐 건다 */
  private queueTrack() {
    const ctx = this.ctx;
    if (!ctx || this.queuing || !this.tracks.length) return;
    if (this.voice && ctx.currentTime < this.voice.ends - XFADE - 6) return;
    const n = this.tracks.length;
    const url = this.tracks[this.trackAt % n];
    this.queuing = true;
    void this.decode(url).then((buf) => {
      this.queuing = false;
      if (!this.ctx || this.tracks[this.trackAt % n] !== url) return;
      this.trackAt = (this.trackAt + 1) % n;
      this.decoded.delete(url);
      if (!buf) {
        // 하나도 못 받으면 합성으로
        if (++this.trackFails >= n) this.tracks = [];
        return;
      }
      this.trackFails = 0;
      const now = ctx.currentTime;
      const at = Math.max(now + 0.05, this.voice ? this.voice.ends - XFADE : 0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + (this.voice ? XFADE : 0.5));
      const ends = at + buf.duration;
      g.gain.setValueAtTime(1, ends - XFADE);
      g.gain.linearRampToValueAtTime(0, ends);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(g).connect(this.music);
      src.onended = () => g.disconnect();
      src.start(at);
      this.voice = { gain: g, ends };
      // 다음 곡은 미리 받아 둔다
      void this.decode(this.tracks[this.trackAt % n]);
    });
  }

  /* ───────────── 판 짜기 ───────────── */

  private build() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = this.hushed ? 0 : this.ducked ? 0.35 : 1;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0.8;
    this.wet.gain.value = 0.55;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(3.6);
    this.dry.connect(comp);
    this.wet.connect(verb).connect(comp);
    comp.connect(this.duckGain).connect(this.master).connect(ctx.destination);
    // 음원은 이미 고르게 다듬어 두었으므로 압축기를 거치지 않는다
    this.music = ctx.createGain();
    this.music.gain.value = 1.25;
    this.music.connect(this.duckGain);
    // 숨소리·풍경에 쓰는 흰 잡음 2초
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
  }

  /** 잔향: 지수로 줄어드는 잡음 (좌우 다르게) */
  private impulse(sec: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  /** 가야금 한 음: Karplus–Strong (부드러운 뜯음 + 명주실의 짧은 여음) */
  private pluckBuffer(hz: number) {
    const key = Math.round(hz * 10);
    const hit = this.plucks.get(key);
    if (hit) return hit;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 3.2);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / hz));
    const line = new Float32Array(N);
    // 손가락으로 뜯은 듯 둥근 들뜸: 잡음을 세 번 걸러 '칙' 하는 첫소리를 없앤다
    for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
    for (let pass = 0; pass < 3; pass++) {
      let prev = line[N - 1];
      for (let i = 0; i < N; i++) {
        prev = prev * 0.6 + line[i] * 0.4;
        line[i] = prev;
      }
    }
    // 낮은 음일수록 오래 울린다
    const decay = 0.9962 + Math.min(0.0028, 60 / hz / 1000);
    let idx = 0;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      const nextIdx = idx + 1 === N ? 0 : idx + 1;
      const avg = (cur + line[nextIdx]) * 0.5 * decay;
      line[idx] = avg * 0.7 + last * 0.3; // 조금 더 어둡게 (명주실)
      last = avg;
      out[i] = cur;
      idx = nextIdx;
    }
    // 끝을 부드럽게 닫고 크기를 맞춘다
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    const fade = Math.floor(sr * 0.3);
    for (let i = 0; i < len; i++) {
      out[i] /= peak || 1;
      if (i > len - fade) out[i] *= (len - i) / fade;
    }
    this.plucks.set(key, buf);
    return buf;
  }

  private send(node: AudioNode, wet: number) {
    const g = this.ctx!.createGain();
    g.gain.value = wet;
    node.connect(this.dry);
    node.connect(g).connect(this.wet);
  }

  /* ───────────── 악기 ───────────── */

  /** 가야금: 음 번호 d, 시각 t, 세기 v, 농현(0 없음 · 1 떠는 소리 · 2 꺾는 소리) */
  private gayageum(d: number, t: number, v: number, nong = 0) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(degreeHz(d));
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 900;
    body.Q.value = 0.8;
    body.gain.value = 4;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.value = v * 0.55;
    const pan = ctx.createStereoPanner();
    pan.pan.value = -0.25 + this.rnd() * 0.2;
    src.connect(body).connect(lp).connect(g).connect(pan);
    this.send(pan, 0.5);
    const r = src.playbackRate;
    r.setValueAtTime(1, t);
    if (nong === 1) {
      // 떠는 소리: 조금 있다가 느리게 떨다 잦아든다
      for (let k = 0; k < 6; k++) {
        const tt = t + 0.35 + k * 0.19;
        r.linearRampToValueAtTime(k % 2 ? 0.992 : 1.012 - k * 0.0015, tt);
      }
      r.linearRampToValueAtTime(1, t + 1.6);
    } else if (nong === 2) {
      // 꺾는 소리: 눌러 올렸다가 제자리로
      r.setValueAtTime(1, t + 0.25);
      r.linearRampToValueAtTime(1.06, t + 0.45);
      r.linearRampToValueAtTime(1, t + 0.9);
    }
    src.start(t);
    src.stop(t + 3.2);
  }

  /** 대금: 음 번호 d, 시각 t, 길이 dur */
  private daegeum(d: number, t: number, dur: number, v = 1) {
    const ctx = this.ctx!;
    const hz = degreeHz(d);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.16 * v, t + 0.28);
    env.gain.setValueAtTime(0.16 * v, t + Math.max(0.3, dur - 0.1));
    env.gain.linearRampToValueAtTime(0, t + dur + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = hz * 3.2;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0.2;
    env.connect(lp).connect(pan);
    this.send(pan, 0.8);

    const oscs = [ctx.createOscillator(), ctx.createOscillator()];
    oscs[0].type = "sine";
    oscs[1].type = "triangle";
    const mix = [1, 0.28];
    // 늦게 걸리는 떨림
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.6;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(0, t + Math.min(0.8, dur * 0.4));
    depth.gain.linearRampToValueAtTime(hz * 0.012, t + dur);
    lfo.connect(depth);
    oscs.forEach((o, i) => {
      // 살짝 아래에서 밀어 올려 낸다
      o.frequency.setValueAtTime(hz * 0.982, t);
      o.frequency.linearRampToValueAtTime(hz, t + 0.18);
      depth.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = mix[i];
      o.connect(g).connect(env);
      o.start(t);
      o.stop(t + dur + 0.7);
    });
    lfo.start(t);
    lfo.stop(t + dur + 0.7);

    // 숨소리
    const br = ctx.createBufferSource();
    br.buffer = this.noise;
    br.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = hz * 2;
    bp.Q.value = 4;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.012 * v, t + 0.08);
    bg.gain.linearRampToValueAtTime(0, t + 0.35);
    br.connect(bp).connect(bg).connect(lp);
    br.start(t, this.rnd() * 1.5);
    br.stop(t + 0.4);
  }

  /** 풍경 (FM 종소리) */
  private bell(t: number) {
    const ctx = this.ctx!;
    const hz = degreeHz(this.pick([10, 12, 13, 15]));
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const idx = ctx.createGain();
    car.frequency.value = hz;
    mod.frequency.value = hz * 3.53;
    idx.gain.setValueAtTime(hz * 1.4, t);
    idx.gain.exponentialRampToValueAtTime(hz * 0.05, t + 2.5);
    mod.connect(idx).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.rnd() * 1.2 - 0.6;
    car.connect(g).connect(pan);
    this.send(pan, 1);
    [car, mod].forEach((o) => {
      o.start(t);
      o.stop(t + 4.2);
    });
  }

  /** 으뜸음을 황 ↔ 임(가끔 중)으로 옮기고, 낮은 줄을 한 번 뜯어 알린다 (계속 울리지 않고 사라진다) */
  private moveRoot(t: number) {
    this.droneRoot = this.droneRoot === 0 ? (this.rnd() < 0.6 ? 7 : 5) : 0;
    const d = this.droneRoot === 7 ? -2 : this.droneRoot === 5 ? -3 : -5; // 한 옥타브 아래 황·임·중
    this.gayageum(d, t, 0.5);
  }

  /* ───────────── 가락 ───────────── */

  /** 한 악구: 다섯 음 위를 걸어 다니다 황이나 임으로 맺는다. [음 번호, 박 수] */
  private phrase(lo: number, hi: number, len: number): [number, number][] {
    const notes: [number, number][] = [];
    let d = lo + Math.floor(this.rnd() * (hi - lo + 1));
    const peak = Math.floor(len * (0.3 + this.rnd() * 0.4)); // 올라갔다 내려오는 모양
    for (let i = 0; i < len; i++) {
      const up = i < peak ? 1 : -1;
      const step = this.pick([0, 1, 1, 1, 2, -1]) * up;
      d = Math.min(hi, Math.max(lo, d + step));
      const beats = i === len - 1 ? this.pick([3, 4]) : this.pick([1, 1, 1, 2, 2, 3]);
      notes.push([d, beats]);
    }
    // 맺음: 가까운 황(5의 배수)이나 임(5k+3)
    const last = notes[len - 1][0];
    const ends = [Math.round(last / 5) * 5, Math.round((last - 3) / 5) * 5 + 3].filter((x) => x >= lo && x <= hi);
    notes[len - 1][0] = ends.length ? this.pick(ends) : last;
    return notes;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      if (this.sectionLeft <= 0) {
        const r = this.rnd();
        this.section = this.section === "rest" ? (r < 0.55 ? "solo" : "duet") : r < 0.25 ? "rest" : r < 0.6 ? "solo" : "duet";
        this.sectionLeft = this.section === "rest" ? 1 : 2 + Math.floor(this.rnd() * 3);
        this.moveRoot(this.next);
      }
      this.sectionLeft--;
      this.next += this.playPhrase(this.next);
    }
  }

  /** 악구 하나를 예약하고 그 길이(초)를 돌려준다 */
  private playPhrase(t0: number): number {
    if (this.section === "rest") {
      // 쉼: 풍경 한두 번과 낮은 줄 하나
      const len = BEAT * (10 + Math.floor(this.rnd() * 8));
      this.bell(t0 + BEAT * 2);
      if (this.rnd() < 0.5) this.bell(t0 + len * 0.6);
      if (this.rnd() < 0.6) this.gayageum(this.pick([-5, -2, 0]), t0 + len * 0.4, 0.4, 1);
      return len;
    }
    const root = this.droneRoot === 7 ? 3 : this.droneRoot === 5 ? 2 : 0;
    if (this.section === "solo") {
      // 가야금 홀로: 가운데 음역 가락, 가끔 꾸밈음과 농현, 사이사이 낮은 줄 튕김
      const notes = this.phrase(-2 + root, 7 + root, 6 + Math.floor(this.rnd() * 5));
      let t = t0;
      notes.forEach(([d, beats], i) => {
        if (this.rnd() < 0.2 && beats >= 2) this.gayageum(d - 1, t - 0.09, 0.35); // 꾸밈음
        const long = beats >= 2;
        this.gayageum(d, t, 0.8 + this.rnd() * 0.2, long ? (this.rnd() < 0.6 ? 1 : 2) : 0);
        if (i % 3 === 0) this.gayageum(root - 5 + this.pick([0, 3]), t + BEAT * 0.5, 0.35);
        t += beats * BEAT;
      });
      return t - t0 + BEAT * (1 + Math.floor(this.rnd() * 2));
    }
    // 대금과 가야금: 대금이 긴 가락, 가야금은 성기게 받쳐 준다
    const notes = this.phrase(3 + root, 11 + root, 4 + Math.floor(this.rnd() * 3));
    let t = t0;
    notes.forEach(([d, beats]) => {
      const dur = (beats + 1) * BEAT * 1.4;
      this.daegeum(d, t, dur * 0.95, 0.9 + this.rnd() * 0.2);
      this.gayageum(d - 5, t + BEAT * 0.5, 0.45, this.rnd() < 0.3 ? 1 : 0);
      if (this.rnd() < 0.5) this.gayageum(d - 8, t + dur * 0.55, 0.35);
      t += dur;
    });
    return t - t0 + BEAT * 2;
  }
}

/** 전시관 전체에서 하나만 */
export const bgm = new Bgm();

const KEY = "museum-bgm";
/** 음악을 끈 적이 있는지 (다음에 와도 꺼 둔다) */
export function bgmWanted() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setBgmWanted(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* 저장이 막혀도 이번 방문에는 따른다 */
  }
}
