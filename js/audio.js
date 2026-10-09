/* =========================================================
 *  배경음악
 *  - 1번: 첫 화면 · 탐험 소개 · 닉네임 · 만족도 조사
 *  - 2번: 게임 화면 (챕터 · 미션 · 정원 완성)
 *  - 3번: 상품 수령 화면
 *  휴대폰 브라우저는 화면을 한 번 눌러야 소리를 낼 수 있어서, 첫 터치 때 재생을 시작해요.
 *  아이폰에서도 음량이 조절되도록 Web Audio(GainNode)로 재생하고,
 *  곡 끝의 페이드 구간 앞에서 처음과 겹쳐 넘어가며 끊김 없이 반복해요.
 * ========================================================= */
(function () {
  const TRACKS = {
    intro:  { src: "assets/audio/bgm-1.mp3", loopEnd: 67.4 },
    game:   { src: "assets/audio/bgm-2.mp3", loopEnd: 46.8 },
    reward: { src: "assets/audio/bgm-3.mp3", loopEnd: 103.0 }
  };
  const VOLUME = 0.45;      // 배경음악 크기 (0~1)
  const LOOP_XFADE = 1.8;   // 반복할 때 겹치는 시간(초)
  const SWITCH_FADE = 1.2;  // 화면이 바뀌어 곡이 바뀔 때 페이드(초)
  const PREF_KEY = "gg-garden-tour-sound";

  let enabled = true;
  try { enabled = localStorage.getItem(PREF_KEY) !== "off"; } catch (e) { /* ignore */ }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, unlocked = false;
  let wanted = null;   // 지금 화면이 원하는 곡
  let current = null;  // 실제로 재생 중인 곡
  let voices = [];
  let loops = 0;
  const buffers = {};
  const listeners = [];

  function ensureCtx() {
    if (ctx || !Ctx) return !!ctx;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    return true;
  }

  function getBuffer(key) {
    if (!buffers[key]) {
      buffers[key] = fetch(TRACKS[key].src)
        .then(r => { if (!r.ok) throw new Error("audio " + r.status); return r.arrayBuffer(); })
        .then(ab => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
        .catch(e => { console.warn("[tour] 배경음악을 불러오지 못했어요", e); delete buffers[key]; return null; });
    }
    return buffers[key];
  }

  function fadeStop(v, sec) {
    const now = ctx.currentTime;
    try {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setValueAtTime(v.g.gain.value, now);
      v.g.gain.linearRampToValueAtTime(0, now + sec);
      v.s.stop(now + sec + 0.05);
    } catch (e) { /* already stopped */ }
  }

  function startVoice(key, buf, fadeIn) {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(1, now + fadeIn);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(g); g.connect(master);
    s.start(now);
    const loopAt = Math.min(TRACKS[key].loopEnd, buf.duration) - LOOP_XFADE;
    voices.push({ key, buf, s, g, handAt: now + loopAt, handed: false });
  }

  // 반복 지점 감시 (오디오 시계 기준이라 화면이 꺼졌다 켜져도 어긋나지 않아요)
  setInterval(() => {
    if (!ctx || ctx.state !== "running") return;
    voices.slice().forEach(v => {
      if (!v.handed && v.key === current && ctx.currentTime >= v.handAt) {
        v.handed = true;
        fadeStop(v, LOOP_XFADE);
        voices = voices.filter(x => x !== v);
        startVoice(v.key, v.buf, LOOP_XFADE);
        loops++;
      }
    });
  }, 200);

  async function sync() {
    if (!unlocked || !ctx) return;
    const target = enabled ? wanted : null;
    if (target === current) return;
    current = target;
    voices.forEach(v => fadeStop(v, SWITCH_FADE));
    voices = [];
    if (!target) return;
    const buf = await getBuffer(target);
    if (!buf || current !== target) return;
    startVoice(target, buf, SWITCH_FADE);
    // 다음에 쓸 곡을 미리 받아 둬요
    setTimeout(() => Object.keys(TRACKS).forEach(k => getBuffer(k)), 2500);
  }

  function unlock() {
    if (unlocked || !ensureCtx()) return;
    try {
      // iOS: 사용자 터치 안에서 무음 버퍼를 한 번 재생해야 소리가 열려요
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) { /* ignore */ }
    const p = ctx.resume ? ctx.resume() : null;
    unlocked = true;
    Promise.resolve(p).then(sync);
  }
  ["touchend", "click", "keydown"].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

  // 화면을 끄거나 다른 앱으로 가면 멈추고, 돌아오면 이어서
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend && ctx.suspend(); }
    else if (enabled && unlocked) { ctx.resume && ctx.resume(); }
  });

  function notify() { listeners.forEach(fn => { try { fn(enabled); } catch (e) { /* ignore */ } }); }

  window.TourAudio = {
    play(key) { wanted = TRACKS[key] ? key : null; sync(); },
    setEnabled(on) {
      enabled = !!on;
      try { localStorage.setItem(PREF_KEY, enabled ? "on" : "off"); } catch (e) { /* ignore */ }
      if (enabled) { unlock(); if (ctx && ctx.state === "suspended") ctx.resume(); }
      sync(); notify();
    },
    toggle() { this.setEnabled(!enabled); },
    isEnabled() { return enabled; },
    onChange(fn) { listeners.push(fn); },
    supported: !!Ctx,
    _state() { return { wanted, current, enabled, unlocked, ctx: ctx && ctx.state, voices: voices.length, loops, t: ctx && +ctx.currentTime.toFixed(1) }; }
  };
})();
