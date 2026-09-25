/* =========================================================
 *  2026 경기정원문화박람회 모바일 게임 투어 · 참여자 앱
 * ========================================================= */
(function () {
  const C = window.TOUR_CONTENT;
  const CFG = window.TOUR_CONFIG || {};
  const DB = window.TourDB;
  const ART = window.TourArt;
  const KEY = CFG.storageKey || "gg-garden-tour-2026";
  const TOTAL = C.missions.length;
  const app = document.getElementById("app");

  /* ---------- 상태 ---------- */
  const rid = () => "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const fresh = () => ({
    v: 1, pid: rid(), uid: null, screen: "intro", nick: "",
    idx: 0, results: {}, tries: {}, hints: {},
    startedAt: null, completedAt: null,
    sv: {}, svStep: 0, surveyAt: null, code: null, visited: false,
    bornAt: Date.now(), resetSeen: null
  });
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.v === 1) return Object.assign(fresh(), raw);
    } catch (e) { /* storage blocked */ }
    return fresh();
  }
  let S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  let settings = {};
  let uidReady = DB.ensureUser(S.pid).then(uid => { S.uid = uid; save(); return uid; });
  const record = (data) => uidReady.then(uid => DB.saveParticipant(uid, data));

  /* ---------- 유틸 ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const $ = (sel, root = app) => root.querySelector(sel);
  const $$ = (sel, root = app) => Array.from(root.querySelectorAll(sel));
  const chapterOf = i => C.chapters[C.missions[i].chapter];
  const colorVars = key => {
    const c = ART.COLOR[key];
    return `--c:${c.c};--c-mid:${c.mid};--c-soft:${c.soft};--c-ink:${c.ink}`;
  };
  const ORD = ["첫 번째", "두 번째", "세 번째", "네 번째"];
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(seed) { let s = hash(seed) || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; }; }
  function shuffle(arr, seed) { const r = seeded(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function rewardCode(id) {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let h = hash(id + "garden"), out = "";
    for (let i = 0; i < 6; i++) { out += A[h % A.length]; h = (Math.floor(h / A.length) ^ hash(out + id)) >>> 0; }
    return out.slice(0, 3) + "-" + out.slice(3);
  }
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const fmtDate = t => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})`; };
  const pad2 = n => String(n).padStart(2, "0");
  const fmtTime = t => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  function pieceStates() {
    return C.missions.map(m => {
      const r = S.results[m.id];
      return !r ? "off" : (r.ok ? "on" : "miss");
    });
  }
  function stats() {
    const rs = Object.values(S.results);
    return {
      first: rs.filter(r => r.ok).length,
      hints: rs.filter(r => r.hint).length,
      minutes: S.startedAt && S.completedAt ? Math.max(1, Math.round((S.completedAt - S.startedAt) / 60000)) : null
    };
  }

  /* ---------- 화면 전환 ---------- */
  function go(screen) { S.screen = screen; save(); render(); try { window.scrollTo({ top: 0 }); } catch (e) { window.scrollTo(0, 0); } }

  function render() {
    closeSheet();
    const fn = SCREENS[S.screen] || SCREENS.intro;
    fn();
  }

  function topbar(showGarden = true) {
    const states = pieceStates();
    const groups = C.chapters.map((ch, ci) => {
      const cells = C.missions.map((m, i) => ({ m, i })).filter(o => o.m.chapter === ci).map(({ i }) => {
        const st = states[i];
        const cls = st === "on" ? "done" : st === "miss" ? "miss" : (i === S.idx && S.screen === "mission" ? "now" : "");
        return `<span class="pt ${cls}" style="--c:${ART.COLOR[ch.color].c}"></span>`;
      }).join("");
      return `<div class="petal-group" aria-hidden="true">${cells}</div>`;
    }).join("");
    const done = states.filter(s => s !== "off").length;
    return `<header class="topbar">
      <div class="topbar-row">
        <div class="tour-title"><em>${esc(S.nick)}</em>의 모바일 게임 투어</div>
        ${showGarden ? `<button class="garden-btn" id="gardenBtn" aria-label="내 정원 보기, ${done}개 조각 모음">${ART.icon.garden()}<span class="tnum">${done}/${TOTAL}</span></button>` : ""}
      </div>
      <div class="petals">${groups}</div>
    </header>`;
  }
  function bindTopbar() {
    const b = $("#gardenBtn");
    if (b) b.addEventListener("click", showGardenSheet);
  }

  /* ---------- 시트 ---------- */
  let sheetEl = null;
  function openSheet(html, colorKey, bind) {
    closeSheet();
    sheetEl = document.createElement("div");
    sheetEl.className = "sheet-wrap";
    sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-live="polite" style="${colorVars(colorKey)}">${html}</div>`;
    document.body.appendChild(sheetEl);
    if (bind) bind(sheetEl);
    const f = sheetEl.querySelector("button");
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 350);
  }
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }

  function gardenLegend(states) {
    return `<div class="legend">${C.chapters.map((ch, ci) => {
      const n = C.missions.filter((m, i) => m.chapter === ci && states[i] !== "off").length;
      return `<div class="${n === 0 ? "off" : ""}"><i style="--c:${ART.COLOR[ch.color].c}"></i>${esc(ch.colorName)}<span class="tnum">${n}/4</span></div>`;
    }).join("")}</div>`;
  }
  function showGardenSheet() {
    const states = pieceStates();
    openSheet(`
      <h3>${esc(S.nick)}의 정원</h3>
      <p class="count">미션을 풀 때마다 정원에 색이 한 조각씩 채워져요</p>
      <div class="garden-card garden">${ART.garden(states)}${gardenLegend(states)}</div>
      <button class="btn" id="closeSheet">계속 탐험하기</button>`, "green", el => {
      el.querySelector("#closeSheet").addEventListener("click", closeSheet);
      el.addEventListener("click", e => { if (e.target === el) closeSheet(); });
    });
  }

  /* =========================================================
   *  화면들
   * ========================================================= */
  const SCREENS = {};

  /* ---------- 운영 기간 외 ---------- */
  SCREENS.closed = function () {
    const before = Date.now() < new Date(CFG.openAt).getTime();
    app.innerHTML = `<section class="screen center" style="justify-content:center">
      <img src="assets/guide.webp" alt="" style="width:120px;margin:0 auto">
      <h1 class="big-title">${before ? "곧 만나요!" : "올해 투어를 마쳤어요"}</h1>
      <p class="lede">${before
        ? `모바일 게임 투어는 박람회 기간<br><b>10월 16일(금) – 19일(월)</b>에 열려요.`
        : "함께해 주셔서 고마워요. 다음 박람회에서 또 만나요."}</p>
      <div class="logos"><img src="assets/logos.webp" alt="경기도, 경기환경에너지진흥원, 매력양평, 양평정원"></div>
    </section>`;
  };

  /* ---------- 인트로 ---------- */
  SCREENS.intro = function () {
    if (S.surveyAt) return go("reward");
    const inProgress = S.nick && S.startedAt;
    const progressText = inProgress ? `${Object.keys(S.results).length}/${TOTAL}` : "";
    app.innerHTML = `<section class="screen">
      <div class="intro-head">
        <div class="intro-year">2026 경기<sup>14th</sup></div>
        <h1 class="intro-name display" style="margin:0">정원문화박람회</h1>
        <div class="intro-tour">모바일 게임 투어</div>
        <div class="intro-meta">10.16 – 10.19 · <b>양평 세미원·두물머리</b></div>
      </div>

      <div class="hero garden" aria-hidden="true">
        ${ART.garden(Array(TOTAL).fill("on"))}
        <img class="guide" src="assets/guide.webp" alt="">
      </div>

      <div class="program">
        <span class="eyebrow">오늘의 탐험</span>
        <h2>${esc(C.program.title)}</h2>
        <p>박람회 주제 '두물머리 사:색'처럼, 정원 곳곳에 숨은 <b>네 가지 색</b>을 미션으로 모아 나만의 정원을 완성해요.</p>
        <div class="swatches">${C.chapters.map(ch => `<span class="swatch"><i style="--c:${ART.COLOR[ch.color].c}"></i>${esc(ch.colorName)}</span>`).join("")}</div>
        <div class="facts"><span>미션 16개</span><span>약 5–8분</span><span>힌트 제공</span><span>완주 + 만족도 조사 → 참여 상품</span></div>
      </div>

      ${settings.notice ? `<div class="notice">${esc(settings.notice)}</div>` : ""}
      ${settings.rewardSoldOut ? `<div class="notice">오늘 준비한 참여 상품이 모두 소진되었어요. 게임은 계속 즐길 수 있어요.</div>` : ""}

      <div class="resume">
        ${inProgress
          ? `<button class="btn pink" id="resumeBtn">이어서 탐험하기 <span class="tnum">(${progressText})</span></button>
             <button class="link" id="restartBtn" style="justify-self:center">처음부터 다시 하기</button>`
          : `<button class="btn pink" id="startBtn">탐험 시작하기 <span class="arrow">→</span></button>`}
      </div>

      <div class="logos">
        <img src="assets/logos.webp" alt="경기도, 경기환경에너지진흥원, 매력양평, 양평정원">
        <small>로그인 없이 닉네임만으로 참여해요</small>
      </div>
    </section>`;

    const start = $("#startBtn");
    if (start) start.addEventListener("click", () => go("nick"));
    const resume = $("#resumeBtn");
    if (resume) resume.addEventListener("click", () => {
      const target = S.screen === "intro" ? (S.completedAt ? "done" : S.lastScreen || "mission") : S.screen;
      go(target === "intro" ? "mission" : target);
    });
    const restart = $("#restartBtn");
    if (restart) restart.addEventListener("click", () => {
      restart.outerHTML = `<div class="notice" style="display:grid;gap:10px">정말 처음부터 할까요? 지금까지 모은 색이 모두 사라져요.
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn ghost" id="noRestart" style="background:#fff">아니요</button><button class="btn pink" id="yesRestart" style="min-height:44px">네, 다시 할래요</button></div></div>`;
      $("#noRestart").addEventListener("click", render);
      $("#yesRestart").addEventListener("click", () => {
        const keep = { pid: S.pid, uid: S.uid, visited: S.visited };
        S = Object.assign(fresh(), keep);
        record({ restartedAtMs: Date.now(), results: null, completed: false });
        go("nick");
      });
    });
  };

  /* ---------- 닉네임 ---------- */
  const NICK_IDEAS = ["연잎우산", "두물산책자", "황포돛배선장", "연밥다람쥐", "느티나무그늘", "세미원꽃잎", "물빛여행자", "사색하는양"];
  SCREENS.nick = function () {
    const ideas = shuffle(NICK_IDEAS, String(Date.now())).slice(0, 4);
    app.innerHTML = `<section class="screen">
      <div class="meet">
        <img src="assets/guide.webp" alt="연잎 모자를 쓴 양 안내자">
        <div class="bubble">반가워요! 오늘 함께 정원을 걸을<br><b>탐험가 이름</b>을 알려 주세요.</div>
      </div>
      <form class="field" id="nickForm" novalidate>
        <label for="nickInput">닉네임</label>
        <input class="input" id="nickInput" maxlength="10" autocomplete="off" enterkeyhint="done" placeholder="예) ${esc(ideas[0])}" value="${esc(S.nick)}">
        <div class="help" id="nickHelp">2–10자, 화면에 '○○○의 모바일 게임 투어'로 표시돼요</div>
        <div class="err" id="nickErr" hidden></div>
      </form>
      <div class="field">
        <span class="small muted">이름이 떠오르지 않는다면</span>
        <div class="chips">${ideas.map(n => `<button class="chip" type="button" data-n="${esc(n)}">${esc(n)}</button>`).join("")}</div>
      </div>
      <div class="actionbar single">
        <button class="btn" id="nickGo" form="nickForm" type="submit">이 이름으로 시작하기 <span class="arrow">→</span></button>
      </div>
    </section>`;
    const input = $("#nickInput"), err = $("#nickErr");
    $$(".chip").forEach(b => b.addEventListener("click", () => { input.value = b.dataset.n; err.hidden = true; }));
    $("#nickForm").addEventListener("submit", e => {
      e.preventDefault();
      const v = input.value.replace(/\s+/g, " ").trim();
      if (v.length < 2) { err.textContent = "두 글자 이상 적어 주세요."; err.hidden = false; input.focus(); return; }
      if (/[<>{}\\]/.test(v)) { err.textContent = "기호 < > { } \\ 는 쓸 수 없어요."; err.hidden = false; return; }
      S.nick = v;
      if (!S.startedAt) S.startedAt = Date.now();
      record({ nickname: v, started: true, startedAtMs: S.startedAt });
      go("guide");
    });
  };

  /* ---------- 게임 방법 ---------- */
  SCREENS.guide = function () {
    const kinds = ["choice", "ox", "word", "dial", "calendar", "pair", "palette"];
    app.innerHTML = `<section class="screen">
      ${topbar(false)}
      <div style="display:grid;gap:6px">
        <span class="eyebrow">탐험 안내</span>
        <h1 class="big-title" style="color:var(--green-ink)">${esc(S.nick)}님,<br>이렇게 탐험해요</h1>
      </div>
      <ol class="howto">
        <li><div><b>네 가지 색, 16개 미션</b><span>분홍 → 물빛 → 초록 → 노랑 순서로 장마다 4개씩 풀어요.</span></div></li>
        <li><div><b>막히면 봉오리 힌트</b><span>힌트는 몇 번을 봐도 괜찮아요. 점수에는 영향이 없어요.</span></div></li>
        <li><div><b>틀려도 한 번 더</b><span>두 번째 기회가 있고, 정원 조각은 꼭 챙겨 드려요.</span></div></li>
        <li><div><b>만족도 조사 → 투어 안내소</b><span>탐험을 마치고 조사에 답하면 참여 상품을 드려요. (1인 1개)</span></div></li>
      </ol>
      <div class="program" style="border-color:var(--line)">
        <span class="eyebrow">만나게 될 놀이 7가지</span>
        <div class="kinds" style="--c-ink:var(--green-ink)">${kinds.map(k => `<span class="kind">${ART.kindIcon[k]("#45A577")}${ART.kindName[k]}</span>`).join("")}</div>
      </div>
      <div class="actionbar single">
        <button class="btn pink" id="goCh">첫 번째 색 찾으러 가기 <span class="arrow">→</span></button>
      </div>
    </section>`;
    $("#goCh").addEventListener("click", () => go("chapter"));
  };

  /* ---------- 챕터 인트로 ---------- */
  SCREENS.chapter = function () {
    const ci = C.missions[S.idx].chapter, ch = C.chapters[ci];
    const ms = C.missions.filter(m => m.chapter === ci);
    app.innerHTML = `<section class="screen" style="${colorVars(ch.color)}">
      ${topbar()}
      <div class="chapter-card">
        <div class="orb"></div>
        <span class="num">${ci + 1} / 4 · ${ORD[ci]} 색</span>
        <h1>${esc(ch.colorName)}</h1>
        <h2>${esc(ch.title)}</h2>
        <p>${esc(ch.story)}</p>
        <div class="kinds">${ms.map(m => `<span class="kind">${ART.kindIcon[m.type](ART.COLOR[ch.color].c)}${ART.kindName[m.type]}</span>`).join("")}</div>
      </div>
      <div class="actionbar single">
        <button class="btn" id="chGo">${esc(ch.colorName)} 모으러 가기 <span class="arrow">→</span></button>
      </div>
    </section>`;
    bindTopbar();
    $("#chGo").addEventListener("click", () => go("mission"));
  };

  /* ---------- 미션 ---------- */
  let M = null; // 현재 미션 임시 상태

  const HOWTO = {
    choice: "떠 있는 연잎 중 하나를 골라요.",
    dial: "물레를 위아래로 돌리거나 버튼을 눌러 숫자를 맞춰요.",
    calendar: "박람회가 열리는 날을 모두 눌러 꽃을 심어요.",
    pair: "알맞은 카드 두 장을 함께 골라요.",
    palette: "물감을 골라 돛을 칠해 보세요.",
    ox: "배를 왼쪽 O 물길이나 오른쪽 X 물길로 밀어 보내요. 물길 이름을 눌러도 돼요.",
    word: "연밥 씨앗 글자를 순서대로 눌러 칸을 채워요. 채운 칸을 누르면 되돌아가요."
  };

  SCREENS.mission = function () {
    if (S.idx >= TOTAL) return go("done");
    const m = C.missions[S.idx], ch = chapterOf(S.idx);
    const col = ART.COLOR[ch.color];
    M = { m, value: null, ready: false, busy: false };
    const hintOpen = !!S.hints[m.id];
    const isOX = m.type === "ox";

    app.innerHTML = `<section class="screen mission" style="${colorVars(ch.color)}">
      ${topbar()}
      <div class="m-meta">
        <span class="m-no tnum">미션 ${pad2(S.idx + 1)} / ${TOTAL}</span>
        <span class="m-kind">${ART.kindIcon[m.type](col.c)}${ART.kindName[m.type]}</span>
      </div>
      <h1 class="m-q">${esc(m.q)}</h1>
      <p class="m-howto">${HOWTO[m.type]}</p>
      <div id="hintBox" ${hintOpen ? "" : "hidden"}>${hintHTML(m)}</div>
      <div class="play" id="play">${PLAY[m.type].html(m)}</div>
      <div class="actionbar ${isOX ? "" : ""}">
        <button class="hint-btn ${hintOpen ? "open" : ""}" id="hintBtn" aria-expanded="${hintOpen}">${ART.icon.bud()}<span>${hintOpen ? "힌트 열림" : "힌트"}</span></button>
        ${isOX
          ? `<span class="ox-note">배를 보내면 바로 정답을 확인해요.</span>`
          : `<button class="btn" id="submitBtn" disabled>정답 확인</button>`}
      </div>
    </section>`;
    bindTopbar();
    $("#hintBtn").addEventListener("click", openHint);
    const sub = $("#submitBtn");
    if (sub) sub.addEventListener("click", () => submit());
    PLAY[m.type].bind(m);
    S.lastScreen = "mission"; save();
  };

  function hintHTML(m) {
    return `<div class="hint"><img src="assets/guide.webp" alt=""><div><b>양이가 살짝 알려줄게요</b><p>${esc(m.hint)}</p></div></div>`;
  }
  function openHint() {
    const m = M.m;
    const box = $("#hintBox"), btn = $("#hintBtn");
    if (!box.hidden) { box.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    box.hidden = false;
    btn.classList.add("open"); btn.setAttribute("aria-expanded", "true");
    btn.querySelector("span").textContent = "힌트 열림";
    S.hints[m.id] = true; save();
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function setReady(v) {
    M.ready = v;
    const b = $("#submitBtn");
    if (b) b.disabled = !v;
  }

  function isCorrect(m, v) {
    switch (m.type) {
      case "calendar":
      case "pair": return Array.isArray(v) && v.length === m.answer.length && v.slice().sort((a, b) => a - b).every((x, i) => x === m.answer.slice().sort((a, b) => a - b)[i]);
      case "word": return Array.isArray(v) && v.join("") === m.answer;
      default: return v === m.answer;
    }
  }
  function answerText(m) {
    switch (m.type) {
      case "choice": return m.options[m.answer];
      case "dial": return m.answer + m.unit;
      case "calendar": return `10월 ${m.answer[0]}일 – ${m.answer[m.answer.length - 1]}일`;
      case "pair": return m.answer.map(i => m.options[i]).join(" + ");
      case "palette": return m.options[m.answer].name;
      case "ox": return m.answer ? "O · 맞아요" : "X · 아니에요";
      case "word": return m.answer;
    }
  }

  function submit(forced) {
    if (M.busy) return;
    const m = M.m;
    const v = forced !== undefined ? forced : M.value;
    const ch = chapterOf(S.idx);
    const tries = S.tries[m.id] || 0;
    const ok = isCorrect(m, v);
    if (ok || tries >= 1) {
      M.busy = true;
      const first = ok && tries === 0;
      S.results[m.id] = { ok: first, solved: ok, tries: tries + 1, hint: !!S.hints[m.id] };
      S.tries[m.id] = tries + 1;
      save();
      // 무료 요금제 쓰기 한도를 아끼기 위해 미션 기록은 챕터가 끝날 때 한 번에 저장해요
      PLAY[m.type].reveal && PLAY[m.type].reveal(m, v, ok);
      buzz(ok ? 30 : [20, 40, 20]);
      setTimeout(() => showResult(m, ch, ok), m.type === "ox" ? 150 : 350);
    } else {
      S.tries[m.id] = 1; save();
      PLAY[m.type].wrong && PLAY[m.type].wrong(m, v);
      buzz([20, 40, 20]);
      const hintOpen = !!S.hints[m.id];
      openSheet(`
        <h3>앗, 다시 한 번!</h3>
        <p class="again">정답이 아니에요. 기회가 한 번 더 있어요.${hintOpen ? "" : "<br>봉오리 힌트를 펼쳐 보면 금방 찾을 수 있어요."}</p>
        ${hintOpen ? "" : `<button class="btn pink" id="againHint">힌트 펼치고 다시 풀기</button>`}
        <button class="btn ${hintOpen ? "" : "ghost"}" id="againGo">다시 풀기</button>`, ch.color, el => {
        const h = el.querySelector("#againHint");
        if (h) h.addEventListener("click", () => { closeSheet(); openHint(); PLAY[m.type].reset && PLAY[m.type].reset(m); });
        el.querySelector("#againGo").addEventListener("click", () => { closeSheet(); PLAY[m.type].reset && PLAY[m.type].reset(m); });
      });
    }
  }

  function showResult(m, ch, ok) {
    const n = Object.keys(S.results).length;
    const lastInChapter = S.idx === TOTAL - 1 || C.missions[S.idx + 1].chapter !== m.chapter;
    const col = ART.COLOR[ch.color];
    openSheet(`
      <div class="piece">${ART.icon.bloom(col.c, col.mid)}</div>
      <h3>${ok ? `${esc(ch.colorName)} 조각을 찾았어요` : `정답은 이거였어요`}</h3>
      <p class="count"><b class="tnum">${n}</b> / ${TOTAL} 조각</p>
      ${ok ? "" : `<p class="answer-line"><strong>${esc(answerText(m))}</strong><br><span class="muted small">아쉽지만 조각은 챙겨 드릴게요!</span></p>`}
      <div class="learn"><b>알고 가요</b><p>${esc(m.explain)}</p></div>
      <button class="btn" id="nextBtn">${lastInChapter ? `${esc(ch.colorName)} 정원에 칠하기` : "다음 미션"} <span class="arrow">→</span></button>`,
      ch.color, el => el.querySelector("#nextBtn").addEventListener("click", () => {
        S.idx += 1;
        if (lastInChapter) { S.lastChapter = m.chapter; go("chapterDone"); }
        else go("mission");
      }));
  }

  /* ---------- 미션별 놀이 ---------- */
  const PLAY = {};

  /* 연잎 고르기 */
  PLAY.choice = {
    html(m) {
      const long = m.options.some(o => o.length > 9);
      return `<div class="pond ${long ? "one" : ""}" role="radiogroup" aria-label="보기">
        ${m.options.map((o, i) => `<button class="pad" role="radio" aria-checked="false" data-i="${i}" style="--d:${i}">${ART.icon.leaf()}${ART.icon.bloom()}<span>${esc(o)}</span></button>`).join("")}
      </div>`;
    },
    bind() {
      $$(".pad").forEach(b => b.addEventListener("click", () => {
        $$(".pad").forEach(x => { x.classList.remove("sel", "wrong"); x.setAttribute("aria-checked", "false"); });
        b.classList.add("sel"); b.setAttribute("aria-checked", "true");
        M.value = +b.dataset.i; setReady(true);
      }));
    },
    wrong(m, v) { const b = $(`.pad[data-i="${v}"]`); if (b) { b.classList.remove("sel"); b.classList.add("wrong"); } M.value = null; setReady(false); },
    reveal(m) { const b = $(`.pad[data-i="${m.answer}"]`); if (b) b.classList.add("right", "sel"); }
  };

  /* 물레 숫자 */
  PLAY.dial = {
    html(m) {
      const nums = [];
      for (let n = m.min; n <= m.max; n++) nums.push(`<li data-n="${n}">${n}</li>`);
      return `<div class="dial-wrap">
        <button class="dial-btn" id="dialDown" aria-label="숫자 줄이기">−</button>
        <div class="dial"><div class="wheel" id="wheel" tabindex="0" role="spinbutton" aria-valuemin="${m.min}" aria-valuemax="${m.max}" aria-valuenow="${m.min}" aria-label="숫자 물레"><ol>${nums.join("")}</ol></div><span class="dial-unit">${esc(m.unit)}</span></div>
        <button class="dial-btn" id="dialUp" aria-label="숫자 늘리기">+</button>
      </div>`;
    },
    bind(m) {
      const wheel = $("#wheel"), H = 72;
      let raf = null, touched = false;
      const cur = () => Math.min(m.max, Math.max(m.min, m.min + Math.round(wheel.scrollTop / H)));
      const paint = () => {
        const v = cur();
        $$("li", wheel).forEach(li => li.classList.toggle("cur", +li.dataset.n === v));
        wheel.setAttribute("aria-valuenow", v);
        M.value = v;
        if (touched) setReady(true);
      };
      const step = d => { touched = true; wheel.scrollTo({ top: (cur() - m.min + d) * H, behavior: "smooth" }); };
      wheel.addEventListener("scroll", () => { touched = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
      wheel.addEventListener("keydown", e => {
        if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
        if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
      });
      $("#dialUp").addEventListener("click", () => step(1));
      $("#dialDown").addEventListener("click", () => step(-1));
      $$("li", wheel).forEach(li => li.addEventListener("click", () => { touched = true; wheel.scrollTo({ top: (+li.dataset.n - m.min) * H, behavior: "smooth" }); }));
      paint();
    },
    wrong() { const d = $(".dial-wrap"); d.style.animation = "shake .45s"; setTimeout(() => d.style.animation = "", 500); },
    reveal(m) { $("#wheel").scrollTo({ top: (m.answer - m.min) * 72, behavior: "smooth" }); }
  };

  /* 달력 꽃심기 */
  PLAY.calendar = {
    html(m) {
      const first = new Date(m.year, m.month - 1, 1).getDay();
      const days = new Date(m.year, m.month, 0).getDate();
      let cells = DOW.map((d, i) => `<div class="cal-dow ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${d}</div>`).join("");
      for (let i = 0; i < first; i++) cells += `<div></div>`;
      for (let d = 1; d <= days; d++) {
        const dow = (first + d - 1) % 7;
        cells += `<button class="day ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}" data-d="${d}" aria-pressed="false" aria-label="10월 ${d}일">${ART.icon.bloom()}<span>${d}</span></button>`;
      }
      return `<div class="cal"><div class="cal-head"><b>${m.year}. ${m.month}</b><span>날짜를 눌러 꽃 심기</span></div><div class="cal-grid">${cells}</div><div class="cal-count" id="calCount">심은 꽃 0송이</div></div>`;
    },
    bind() {
      M.value = [];
      $$(".day").forEach(b => b.addEventListener("click", () => {
        const d = +b.dataset.d, on = !b.classList.contains("on");
        b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
        M.value = on ? M.value.concat(d) : M.value.filter(x => x !== d);
        $("#calCount").textContent = `심은 꽃 ${M.value.length}송이`;
        setReady(M.value.length > 0);
      }));
    },
    wrong() { const c = $(".cal"); c.style.animation = "shake .45s"; setTimeout(() => c.style.animation = "", 500); },
    reset() { $$(".day.on").forEach(b => { b.classList.remove("on"); b.setAttribute("aria-pressed", "false"); }); M.value = []; $("#calCount").textContent = "심은 꽃 0송이"; setReady(false); },
    reveal(m) { $$(".day").forEach(b => { const on = m.answer.includes(+b.dataset.d); b.classList.toggle("on", on); }); }
  };

  /* 두 빛 고르기 */
  PLAY.pair = {
    html(m) {
      return `<div class="pairs">${m.options.map((o, i) => `<button class="pcard" data-i="${i}" aria-pressed="false"><span class="dots"><i></i><i></i><i></i><i></i></span><span>${esc(o)}</span></button>`).join("")}</div>
      <div class="pair-count" id="pairCount">두 장을 골라 주세요 · 0 / 2</div>`;
    },
    bind() {
      M.value = [];
      $$(".pcard").forEach(b => b.addEventListener("click", () => {
        const i = +b.dataset.i;
        if (M.value.includes(i)) M.value = M.value.filter(x => x !== i);
        else { M.value.push(i); if (M.value.length > 2) M.value.shift(); }
        $$(".pcard").forEach(x => { const on = M.value.includes(+x.dataset.i); x.classList.toggle("sel", on); x.classList.remove("wrong"); x.setAttribute("aria-pressed", on); });
        $("#pairCount").textContent = `두 장을 골라 주세요 · ${M.value.length} / 2`;
        setReady(M.value.length === 2);
      }));
    },
    wrong(m, v) { v.forEach(i => { const b = $(`.pcard[data-i="${i}"]`); if (!m.answer.includes(i)) b.classList.add("wrong"); }); },
    reset() { M.value = []; $$(".pcard").forEach(x => { x.classList.remove("sel"); x.setAttribute("aria-pressed", "false"); }); $("#pairCount").textContent = "두 장을 골라 주세요 · 0 / 2"; setReady(false); },
    reveal(m) { $$(".pcard").forEach(x => x.classList.toggle("sel", m.answer.includes(+x.dataset.i))); }
  };

  /* 돛 물들이기 */
  PLAY.palette = {
    html(m) {
      return `<div class="canvas"><svg viewBox="0 0 320 170" aria-hidden="true">
          <path d="M0 150 C60 138 120 160 180 148 C240 136 290 150 320 144 L320 170 L0 170 Z" fill="#A9DEE3"/>
          <path d="M0 160 C70 152 140 168 210 158 C260 152 300 160 320 156 L320 170 L0 170 Z" fill="#82CBD3"/>
          <g transform="translate(88 12) scale(1.2)">${ART.boat("#FFFFFF", "#E3ECEA").replace('<svg viewBox', '<svg width="120" height="110" viewBox').replace('class="sail"', 'class="sail" id="sail" stroke="#A9C4BE" stroke-width="1.4" stroke-dasharray="4 3"')}</g>
        </svg></div>
        <div class="paints" role="radiogroup" aria-label="물감">${m.options.map((o, i) => `<button class="paint" role="radio" aria-checked="false" data-i="${i}" style="--p:${o.hex}"><i></i>${esc(o.name)}</button>`).join("")}</div>`;
    },
    bind(m) {
      $$(".paint").forEach(b => b.addEventListener("click", () => {
        $$(".paint").forEach(x => { x.classList.remove("sel"); x.setAttribute("aria-checked", "false"); });
        b.classList.add("sel"); b.setAttribute("aria-checked", "true");
        const s = $("#sail"); s.setAttribute("fill", m.options[+b.dataset.i].hex); s.removeAttribute("stroke-dasharray"); s.setAttribute("stroke", "none");
        M.value = +b.dataset.i; setReady(true);
      }));
    },
    wrong() { const c = $(".canvas"); c.style.animation = "shake .45s"; setTimeout(() => c.style.animation = "", 500); },
    reveal(m) { $("#sail").setAttribute("fill", m.options[m.answer].hex); }
  };

  /* 물길 정하기 (OX) */
  PLAY.ox = {
    html() {
      return `<div class="river" id="river">
        <svg class="map" viewBox="0 0 320 300" aria-hidden="true">
          <path d="M-20 40 C40 60 110 120 140 190 L180 190 C150 110 80 40 -20 -10 Z" fill="#BFE6EA"/>
          <path d="M340 40 C280 60 210 120 180 190 L140 190 C170 110 240 40 340 -10 Z" fill="#A9DEE3"/>
          <path d="M134 186 L186 186 C192 230 196 270 200 310 L120 310 C124 270 128 230 134 186 Z" fill="#8FD2D8"/>
          <path d="M60 70 q10 -6 20 0 M240 70 q10 -6 20 0 M150 250 q10 -6 20 0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/>
        </svg>
        <button class="fork o" data-v="true" aria-label="O 맞아요 물길로 보내기"><b>O</b><span>맞아요</span></button>
        <button class="fork x" data-v="false" aria-label="X 아니에요 물길로 보내기"><b>X</b><span>아니에요</span></button>
        <div class="boat" id="boat">${ART.boat()}<span class="nudge">← 밀어서 보내기 →</span></div>
      </div>`;
    },
    bind(m) {
      const river = $("#river"), boat = $("#boat");
      let x0 = null, dx = 0, sent = false;
      const W = () => river.clientWidth;
      const send = v => {
        if (sent) return; sent = true;
        river.classList.add("sent");
        boat.classList.remove("drag");
        const dir = v ? -1 : 1;
        boat.style.transform = `translate(${dir * W() * .27}px, -${river.clientHeight * .5}px) rotate(${dir * 14}deg) scale(.8)`;
        $$(".fork").forEach(f => f.classList.toggle("hot", f.dataset.v === String(v)));
        M.value = v;
        setTimeout(() => submit(v), 720);
      };
      const hot = d => { $$(".fork").forEach(f => f.classList.toggle("hot", (d < -40 && f.classList.contains("o")) || (d > 40 && f.classList.contains("x")))); };
      boat.addEventListener("pointerdown", e => { if (sent) return; x0 = e.clientX; dx = 0; boat.classList.add("drag"); boat.setPointerCapture(e.pointerId); });
      boat.addEventListener("pointermove", e => {
        if (x0 === null) return;
        dx = Math.max(-W() * .32, Math.min(W() * .32, e.clientX - x0));
        boat.style.transform = `translate(${dx}px, ${-Math.abs(dx) * .35}px) rotate(${dx / 10}deg)`;
        hot(dx);
      });
      const end = () => {
        if (x0 === null) return; x0 = null;
        if (dx < -55) send(true); else if (dx > 55) send(false);
        else { boat.classList.remove("drag"); boat.style.transform = ""; hot(0); }
      };
      boat.addEventListener("pointerup", end);
      boat.addEventListener("pointercancel", end);
      $$(".fork").forEach(f => f.addEventListener("click", () => send(f.dataset.v === "true")));
      PLAY.ox._reset = () => { sent = false; river.classList.remove("sent"); boat.style.transform = ""; hot(0); M.busy = false; };
    },
    wrong() { },
    reset() { PLAY.ox._reset && PLAY.ox._reset(); }
  };

  /* 연밥 낱말 */
  PLAY.word = {
    html(m) {
      const letters = Array.from(m.answer);
      let tiles = shuffle(letters.concat(m.decoys), m.id);
      if (tiles.join("").startsWith(m.answer)) tiles = shuffle(tiles, m.id + "x");
      M.tiles = tiles;
      return `<div class="slots" id="slots">${letters.map((_, i) => `<button class="slot" data-s="${i}" aria-label="${i + 1}번째 칸"></button>`).join("")}</div>
        <div class="pod" role="group" aria-label="연밥 씨앗 글자">${tiles.map((t, i) => `<button class="seed" data-t="${i}">${esc(t)}</button>`).join("")}</div>`;
    },
    bind(m) {
      const n = Array.from(m.answer).length;
      M.fill = Array(n).fill(null); // tile index per slot
      const paint = () => {
        $$(".slot").forEach((s, i) => { const t = M.fill[i]; s.textContent = t === null ? "" : M.tiles[t]; s.classList.toggle("full", t !== null); });
        $$(".seed").forEach(s => s.classList.toggle("used", M.fill.includes(+s.dataset.t)));
        M.value = M.fill.map(t => t === null ? "" : M.tiles[t]);
        setReady(M.fill.every(t => t !== null));
        $("#slots").classList.remove("wrong");
      };
      $$(".seed").forEach(s => s.addEventListener("click", () => {
        const at = M.fill.indexOf(null); if (at < 0) return;
        M.fill[at] = +s.dataset.t; paint();
      }));
      $$(".slot").forEach(s => s.addEventListener("click", () => { M.fill[+s.dataset.s] = null; paint(); }));
      M.paintWord = paint;
      paint();
    },
    wrong() { $("#slots").classList.add("wrong"); },
    reset() { M.fill = M.fill.map(() => null); M.paintWord(); },
    reveal(m) { const letters = Array.from(m.answer); $$(".slot").forEach((s, i) => { s.textContent = letters[i]; s.classList.add("full"); }); }
  };

  /* ---------- 챕터 완료 ---------- */
  SCREENS.chapterDone = function () {
    const ci = S.lastChapter != null ? S.lastChapter : C.missions[Math.max(0, S.idx - 1)].chapter;
    const ch = C.chapters[ci];
    const states = pieceStates();
    const last = ci === C.chapters.length - 1;
    if (S.savedChapter !== ci) { S.savedChapter = ci; save(); record({ results: S.results, progress: Object.keys(S.results).length }); }
    app.innerHTML = `<section class="screen center" style="${colorVars(ch.color)}">
      ${topbar(false)}
      <div style="display:grid;gap:8px">
        <span class="eyebrow">${ci + 1} / 4 · ${ORD[ci]} 색 완성</span>
        <h1 class="big-title">${esc(ch.colorName)}을 모았어요</h1>
        <p class="lede">${last ? "네 가지 색이 모두 모였어요. 정원을 확인해 보세요!" : "정원에 새로운 색이 번졌어요."}</p>
      </div>
      <div class="garden-card garden" id="gd">${ART.garden(states.map((s, i) => C.missions[i].chapter === ci ? "off" : s))}${gardenLegend(states)}</div>
      <div class="actionbar single">
        <button class="btn ${last ? "pink" : ""}" id="cdGo">${last ? "완성된 정원 보기" : `${ORD[ci + 1]} 색 찾으러 가기`} <span class="arrow">→</span></button>
      </div>
    </section>`;
    // 이번 챕터 조각을 차례로 칠하기
    const idxs = C.missions.map((m, i) => i).filter(i => C.missions[i].chapter === ci);
    const cur = states.map((s, i) => C.missions[i].chapter === ci ? "off" : s);
    idxs.forEach((i, k) => setTimeout(() => {
      cur[i] = states[i];
      const gd = $("#gd"); if (!gd) return;
      gd.innerHTML = ART.garden(cur, i) + gardenLegend(cur);
    }, 350 + k * 320));
    $("#cdGo").addEventListener("click", () => {
      if (last) {
        if (!S.completedAt) {
          S.completedAt = Date.now();
          const st = stats();
          record({ completed: true, completedAtMs: S.completedAt, firstTryCorrect: st.first, hintsUsed: st.hints, durationSec: Math.round((S.completedAt - (S.startedAt || S.completedAt)) / 1000) });
        }
        go("done");
      } else go("chapter");
    });
  };

  /* ---------- 투어 완료 ---------- */
  SCREENS.done = function () {
    const st = stats();
    const states = pieceStates();
    S.lastScreen = "done";
    app.innerHTML = `<section class="screen center">
      ${topbar(false)}
      <div style="display:grid;gap:8px">
        <span class="eyebrow">TOUR COMPLETE</span>
        <h1 class="big-title" style="color:var(--green-ink)">${esc(S.nick)}의<br>사:색 정원이 완성됐어요</h1>
      </div>
      <div class="garden-card garden">${ART.garden(states)}${gardenLegend(states)}</div>
      <div class="stats">
        <div class="stat"><b>${st.first}<small style="font-size:15px">/${TOTAL}</small></b><span>첫 도전에 정답</span></div>
        <div class="stat"><b>${st.hints}</b><span>펼쳐 본 힌트</span></div>
        <div class="stat"><b>${st.minutes || "-"}<small style="font-size:15px">분</small></b><span>탐험 시간</span></div>
      </div>
      <div class="next-step" style="text-align:left">
        <span class="req">상품 수령 필수</span>
        <h3>마지막 한 걸음, 만족도 조사</h3>
        <p>오늘 박람회는 어떠셨나요? 11문항(약 1분)에 답해 주시면 <b>투어 안내소에서 참여 상품</b>을 받을 수 있어요.</p>
        <button class="btn pink" id="svGo">만족도 조사 참여하기 <span class="arrow">→</span></button>
      </div>
      <div class="foot-space"></div>
    </section>`;
    save();
    $("#svGo").addEventListener("click", () => go("survey"));
  };

  /* ---------- 만족도 조사 ---------- */
  SCREENS.survey = function () {
    const Q = C.survey, i = Math.min(S.svStep, Q.length - 1), q = Q[i];
    const val = S.sv[q.id];
    const pct = Math.round((i / Q.length) * 100);
    S.lastScreen = "survey";
    let body = "";
    if (q.type === "scale") {
      body = `<div class="scale" role="radiogroup" aria-label="만족도">${[1, 2, 3, 4, 5].map(n => `<button role="radio" aria-checked="${val === n}" class="${val === n ? "sel" : ""}" data-v="${n}">${ART.icon.stage(n, val === n || !val)}<b>${n}</b>${C.scaleLabels[n - 1]}</button>`).join("")}</div>`;
    } else if (q.type === "choice") {
      body = `<div class="opts ${q.options.length > 4 ? "two" : ""}" role="radiogroup">${q.options.map(o => `<button class="opt ${val === o ? "sel" : ""}" role="radio" aria-checked="${val === o}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
    } else {
      body = `<textarea class="textarea" id="svText" aria-label="기타 의견" maxlength="500" placeholder="(선택) 자유롭게 적어 주세요">${esc(val || "")}</textarea>
        <div class="counter tnum" id="svCount">${(val || "").length} / 500</div>
        <p class="privacy">응답은 박람회 운영 개선과 결과 보고를 위한 통계로만 쓰여요. 이름·연락처 같은 개인정보는 받지 않아요.</p>`;
    }
    const last = i === Q.length - 1;
    app.innerHTML = `<section class="screen">
      ${topbar(false)}
      <div class="sv-head"><span class="sv-section">${esc(q.section)}</span><span class="tnum">만족도 조사 ${i + 1} / ${Q.length}</span></div>
      <div class="sv-progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <h1 class="sv-q">${esc(q.q)}</h1>
      ${body}
      <div class="actionbar ${i === 0 && !last ? "single" : ""}" style="grid-template-columns:${i > 0 ? "auto 1fr" : "1fr"}">
        ${i > 0 ? `<button class="btn ghost" id="svPrev" style="padding:0 12px">← 이전</button>` : ""}
        ${last
          ? `<button class="btn pink" id="svSubmit">제출하고 상품 받으러 가기</button>`
          : `<button class="btn" id="svNext" ${val ? "" : "disabled"}>다음</button>`}
      </div>
    </section>`;
    const next = () => { S.svStep = i + 1; save(); render(); window.scrollTo(0, 0); };
    $$(".scale button, .opt").forEach(b => b.addEventListener("click", () => {
      S.sv[q.id] = q.type === "scale" ? +b.dataset.v : b.dataset.v; save();
      $$(".scale button, .opt").forEach(x => { const on = x === b; x.classList.toggle("sel", on); x.setAttribute("aria-checked", on); });
      if (q.type === "scale") $$(".scale button").forEach(x => { x.querySelector("svg").outerHTML = ART.icon.stage(+x.dataset.v, x === b); });
      const nb = $("#svNext"); if (nb) nb.disabled = false;
      setTimeout(next, 380);
    }));
    const ta = $("#svText");
    if (ta) ta.addEventListener("input", () => { S.sv[q.id] = ta.value; save(); $("#svCount").textContent = `${ta.value.length} / 500`; });
    const p = $("#svPrev"); if (p) p.addEventListener("click", () => { S.svStep = Math.max(0, i - 1); save(); render(); });
    const n = $("#svNext"); if (n) n.addEventListener("click", next);
    const sb = $("#svSubmit"); if (sb) sb.addEventListener("click", submitSurvey);
  };

  async function submitSurvey() {
    const missing = C.survey.filter(q => !q.optional && !S.sv[q.id]);
    if (missing.length) { S.svStep = C.survey.indexOf(missing[0]); save(); return render(); }
    const btn = $("#svSubmit");
    btn.disabled = true; btn.textContent = "제출하는 중…";
    const uid = await uidReady;
    const code = rewardCode(uid || S.pid);
    const st = stats();
    const answers = {};
    C.survey.forEach(q => { if (q.type !== "text") answers[q.id] = S.sv[q.id]; });
    const payload = {
      nickname: S.nick, answers, comment: (S.sv.s11 || "").trim().slice(0, 500),
      rewardCode: code, firstTryCorrect: st.first, hintsUsed: st.hints,
      durationSec: S.startedAt && S.completedAt ? Math.round((S.completedAt - S.startedAt) / 1000) : null
    };
    await DB.saveSurvey(uid, payload);
    S.surveyAt = Date.now(); S.code = code; save();
    record({ surveyed: true, surveyAtMs: S.surveyAt, rewardCode: code });
    go("reward");
  }

  /* ---------- 상품 수령 ---------- */
  let clockTimer = null, wakeLock = null;
  SCREENS.reward = function () {
    if (!S.surveyAt) return go("intro");
    const desk = settings.deskLocation || CFG.deskLocation || "투어 안내소";
    const hours = settings.deskHours || CFG.deskHours || "";
    const soldOut = !!settings.rewardSoldOut;
    app.innerHTML = `<section class="screen">
      <span class="stamp">모바일 게임 투어 참여 완료</span>
      <div class="ticket">
        <div class="ticket-top">
          <div class="shimmer" aria-hidden="true"></div>
          <span class="ev">2026 경기정원문화박람회<br>모바일 게임 투어 · ${esc(C.program.title)}</span>
          <span class="who">${esc(S.nick)}</span>
          <span class="what">16개 미션 완주 · 만족도 조사 참여</span>
          <div class="four">${C.chapters.map(ch => `<i style="--c:${ART.COLOR[ch.color].c}" title="${esc(ch.colorName)}"></i>`).join("")}</div>
        </div>
        <div class="perf"></div>
        <div class="ticket-bottom">
          <div><div class="lbl">확인 코드</div><div class="code">${esc(S.code || "")}</div></div>
          <div class="live"><div class="lbl"><span class="dot"></span>지금</div><div class="clock" id="clock">${fmtDate(Date.now())} ${fmtTime(Date.now())}</div></div>
        </div>
      </div>

      ${soldOut
        ? `<div class="soldout"><b>오늘 준비한 참여 상품이 모두 소진되었어요.</b><span>함께해 주셔서 고마워요. 남겨 주신 의견은 박람회를 가꾸는 데 소중히 쓸게요.</span></div>`
        : `<ol class="howto">
            <li><div><b>투어 안내소로 가요</b><span>아래 위치를 확인해 주세요.</span></div></li>
            <li><div><b>이 화면을 직원에게 보여 주세요</b><span>시계가 움직이는 화면이어야 확인할 수 있어요.</span></div></li>
            <li><div><b>참여 상품을 받아요</b><span>탐험해 주셔서 고마워요!</span></div></li>
          </ol>
          <div class="desk"><span class="eyebrow">투어 안내소</span><b>${esc(desk)}</b>${hours ? `<span>${esc(hours)}</span>` : ""}</div>`}

      <ul class="rules">
        <li><span>참여 상품은 <strong>1인 1개</strong>만 받을 수 있어요.</span></li>
        <li><span>준비한 수량이 모두 소진되면 조기 마감될 수 있어요.</span></li>
        <li><span>이 창을 닫아도 같은 휴대폰으로 다시 접속하면 이 화면이 열려요.</span></li>
      </ul>
      <div class="logos"><img src="assets/logos.webp" alt="경기도, 경기환경에너지진흥원, 매력양평, 양평정원"></div>
    </section>`;
    clearInterval(clockTimer);
    clockTimer = setInterval(() => { const c = document.getElementById("clock"); if (!c) return clearInterval(clockTimer); c.textContent = `${fmtDate(Date.now())} ${fmtTime(Date.now())}`; }, 1000);
    try { if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request("screen").then(l => { wakeLock = l; }).catch(() => { }); } catch (e) { /* ignore */ }
  };

  /* =========================================================
   *  시작
   * ========================================================= */
  function scheduleClosed() {
    if (!CFG.enforceSchedule) return false;
    if (location.hash === "#preview") return false;
    const now = Date.now();
    return now < new Date(CFG.openAt).getTime() || now > new Date(CFG.closeAt).getTime();
  }

  /* ---------- 초기화 ---------- */
  const logVisit = () => { S.visited = true; save(); record({ visited: true, visitAtMs: Date.now(), ua: (navigator.userAgent || "").slice(0, 160) }); };
  function startOver(opts) {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    S = fresh();
    if (opts && opts.resetSeen) S.resetSeen = opts.resetSeen;
    save();
    uidReady = (opts && opts.newId ? DB.resetDevice() : Promise.resolve())
      .then(() => DB.ensureUser(S.pid))
      .then(uid => { S.uid = uid; save(); return uid; });
    logVisit();
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    go("intro");
  }

  // 테스트용: 주소 끝에 #reset → 이 휴대폰의 기록만 지우기 (config.js allowDeviceReset 이 true 일 때만)
  SCREENS.deviceReset = function () {
    const allowed = !!CFG.allowDeviceReset;
    const has = S.nick ? `<b>${esc(S.nick)}</b> · 모은 조각 ${Object.keys(S.results).length}/${TOTAL}${S.surveyAt ? " · 만족도 조사 완료" : ""}` : "아직 참여 기록이 없어요.";
    app.innerHTML = `<section class="screen" style="justify-content:center">
      <img src="assets/guide.webp" alt="" style="width:110px;margin:0 auto">
      <h1 class="big-title center" style="color:var(--green-ink)">${allowed ? "이 휴대폰의 테스트 기록을<br>지울까요?" : "지금은 초기화할 수 없어요"}</h1>
      <div class="desk"><span class="eyebrow">이 휴대폰의 기록</span><span>${has}</span></div>
      ${allowed
        ? `<p class="lede">닉네임·진행 상황·상품 수령 화면이 지워지고 처음 화면부터 다시 시작해요. 서버에 저장된 기록은 관리자 페이지의 '테스트 기록 초기화'로 지워요.</p>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
             <button class="btn ghost" id="rsNo" style="background:#fff;min-height:58px">취소</button>
             <button class="btn pink" id="rsYes">기록 지우기</button>
           </div>`
        : `<p class="lede">정식 운영 중에는 휴대폰 기록을 지울 수 없어요.</p>
           <button class="btn" id="rsNo">처음 화면으로</button>`}
    </section>`;
    $("#rsNo").addEventListener("click", () => { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ } render(); });
    const yes = $("#rsYes");
    if (yes) yes.addEventListener("click", () => { yes.disabled = true; startOver({ newId: true, resetSeen: settings.resetAt || null }); });
  };

  function checkServerReset() {
    const r = settings.resetAt;
    if (!r || S.resetSeen === r) return false;
    if ((S.bornAt || 0) < r) { startOver({ resetSeen: r }); return true; }
    S.resetSeen = r; save();
    return false;
  }

  function boot() {
    if (location.hash === "#reset") { SCREENS.deviceReset(); DB.getSettings().then(s => { settings = s || {}; }); return; }
    if (!S.visited) logVisit();
    if (scheduleClosed() && !S.surveyAt) { SCREENS.closed(); return; }
    // 진행 중이던 화면으로 복귀 (미션 중 이탈 → 인트로에서 '이어서 하기')
    if (S.screen === "mission" || S.screen === "chapter" || S.screen === "chapterDone") { S.lastScreen = S.screen; S.screen = "intro"; }
    render();
    DB.getSettings().then(s => {
      settings = s || {};
      if (checkServerReset()) return;
      if (settings.rewardSoldOut || settings.notice || settings.deskLocation) {
        if (S.screen === "intro" || S.screen === "reward") render();
      }
    });
  }
  window.addEventListener("hashchange", () => { if (location.hash === "#reset") SCREENS.deviceReset(); });
  boot();
})();
