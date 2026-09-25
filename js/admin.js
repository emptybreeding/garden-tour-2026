/* =========================================================
 *  관리자 페이지 · 참여 현황 / 만족도 문항별 결과 / 운영 설정
 * ========================================================= */
(function () {
  const C = window.TOUR_CONTENT, CFG = window.TOUR_CONFIG || {}, DB = window.TourDB;
  const root = document.getElementById("admin");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const $ = s => root.querySelector(s);
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  const fmtN = n => n.toLocaleString("ko-KR");
  const dayKey = ms => ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : null;
  const dayLabel = k => { const d = new Date(k + "T00:00:00+09:00"); return `${d.getMonth() + 1}.${d.getDate()} (${"일월화수목금토"[d.getDay()]})`; };
  const timeLabel = ms => { if (!ms) return ""; const d = new Date(ms + 9 * 3600e3); return `${d.getUTCMonth() + 1}.${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
  // 1~5점 순차 색 (연꽃 분홍 한 가지 색의 명도 단계)
  const SCALE_COL = ["#FBE0EC", "#F6B5D2", "#EF86B6", "#E0509A", "#B8276F"];
  const SCALE_TXT = ["#6B2146", "#6B2146", "#4A0F2C", "#FFFFFF", "#FFFFFF"];

  let data = null, lastLoaded = null, commentQuery = "";

  /* ---------- 진입 ---------- */
  async function start() {
    try {
      const st = await DB.adminState();
      if (!st.signedIn) return renderLogin();
      if (!st.isAdmin) return renderLogin("이 계정에는 관리자 권한이 없어요. README의 '관리자 계정 등록' 단계를 확인해 주세요.", st.email);
      await load();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="panel login"><h2>연결하지 못했어요</h2><p class="msg err">${esc(e.message || e)}</p><button class="tbtn" onclick="location.reload()">다시 시도</button></div>`;
    }
  }

  function renderLogin(err, email) {
    root.innerHTML = `<form class="panel login form" id="loginForm">
      <div class="a-title"><small>2026 경기정원문화박람회</small><h1>게임 투어 운영실</h1></div>
      <label>관리자 이메일<input type="email" id="lgEmail" autocomplete="username" required value="${esc(email || "")}"></label>
      <label>비밀번호<input type="password" id="lgPw" autocomplete="current-password" required></label>
      ${err ? `<p class="msg err">${esc(err)}</p>` : ""}
      <button class="btn" type="submit">로그인</button>
    </form>`;
    $("#loginForm").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = e.target.querySelector("button"); btn.disabled = true; btn.textContent = "확인하는 중…";
      try {
        const st = await DB.adminSignIn($("#lgEmail").value.trim(), $("#lgPw").value);
        if (!st.isAdmin) return renderLogin("이 계정에는 관리자 권한이 없어요. README의 '관리자 계정 등록' 단계를 확인해 주세요.", st.email);
        await load();
      } catch (er) {
        renderLogin("이메일 또는 비밀번호가 맞지 않아요.", $("#lgEmail") && $("#lgEmail").value);
      }
    });
  }

  async function load() {
    root.innerHTML = `<p class="empty">데이터를 불러오는 중…</p>`;
    data = await DB.fetchAll();
    lastLoaded = Date.now();
    render();
  }

  /* ---------- 집계 ---------- */
  function aggregate() {
    const P = data.participants, S = data.surveys;
    const visited = P.length;
    const started = P.filter(p => p.started).length;
    const completed = P.filter(p => p.completed).length;
    const surveyed = S.length;

    // 일자별
    const days = {};
    const bump = (k, f) => { if (!k) return; days[k] = days[k] || { v: 0, s: 0, c: 0, r: 0 }; days[k][f]++; };
    P.forEach(p => { bump(dayKey(p.visitAtMs || p.startedAtMs), "v"); if (p.started) bump(dayKey(p.startedAtMs), "s"); if (p.completed) bump(dayKey(p.completedAtMs), "c"); });
    S.forEach(s => bump(dayKey(s.createdAtMs), "r"));

    // 만족도
    const q = {};
    C.survey.forEach(item => {
      if (item.type === "scale") {
        const dist = [0, 0, 0, 0, 0]; let sum = 0, n = 0;
        S.forEach(s => { const v = +(s.answers || {})[item.id]; if (v >= 1 && v <= 5) { dist[v - 1]++; sum += v; n++; } });
        q[item.id] = { dist, n, avg: n ? sum / n : 0, top2: n ? (dist[3] + dist[4]) / n : 0 };
      } else if (item.type === "choice") {
        const cnt = {}; item.options.forEach(o => cnt[o] = 0); let n = 0;
        S.forEach(s => { const v = (s.answers || {})[item.id]; if (v != null && v !== "") { cnt[v] = (cnt[v] || 0) + 1; n++; } });
        q[item.id] = { cnt, n };
      }
    });
    const sections = {};
    C.survey.filter(i => i.type === "scale").forEach(i => {
      sections[i.section] = sections[i.section] || { sum: 0, n: 0 };
      sections[i.section].sum += q[i.id].avg * q[i.id].n; sections[i.section].n += q[i.id].n;
    });

    // 미션
    const missions = C.missions.map(m => {
      let n = 0, first = 0, hint = 0, revealed = 0;
      P.forEach(p => { const r = (p.results || {})[m.id]; if (!r) return; n++; if (r.ok) first++; if (r.hint) hint++; if (r.solved === false) revealed++; });
      return { m, n, first, hint, revealed };
    });

    const comments = S.filter(s => (s.comment || "").trim()).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    return { visited, started, completed, surveyed, days, q, sections, missions, comments };
  }

  /* ---------- 렌더 ---------- */
  function render() {
    const A = aggregate();
    const demo = DB.mode === "demo";
    const set = Object.assign({ deskLocation: CFG.deskLocation, deskHours: CFG.deskHours, notice: "", rewardSoldOut: false }, data.settings || {});
    const maxF = Math.max(1, A.visited);
    const funnel = [
      ["QR 접속", A.visited, ""], ["게임 시작", A.started, ""], ["16개 미션 완주", A.completed, ""], ["만족도 조사 완료", A.surveyed, "goal"]
    ];
    const dayKeys = Object.keys(A.days).sort();
    const tot = dayKeys.reduce((t, k) => { ["v", "s", "c", "r"].forEach(f => t[f] += A.days[k][f]); return t; }, { v: 0, s: 0, c: 0, r: 0 });

    root.innerHTML = `
      <header class="a-head">
        <div class="a-title"><small>2026 경기정원문화박람회 · 모바일 게임 투어</small><h1>게임 투어 운영실</h1></div>
        <div class="a-tools">
          <span class="badge ${demo ? "demo" : ""}">${demo ? "데모 모드 · 이 브라우저 데이터" : "Firebase 연결됨"}</span>
          <span class="updated">${lastLoaded ? "갱신 " + timeLabel(lastLoaded) : ""}</span>
          <button class="tbtn primary" id="refresh">새로고침</button>
          ${demo ? "" : `<button class="tbtn" id="logout">로그아웃</button>`}
        </div>
      </header>
      ${demo ? `<div class="note">Firebase 설정 전이라 <b>데모 모드</b>예요. 이 브라우저에서 플레이한 기록만 보여요. 화면 확인용으로 <button class="tbtn" id="seed">샘플 참여 300건 넣기</button> <button class="tbtn warn" id="clear">데모 데이터 지우기</button></div>` : ""}

      <section class="panel">
        <h2>참여 현황 <span>상품 지급 대상 = 만족도 조사 완료자</span></h2>
        <div class="kpis">
          ${funnel.map(([l, v, g], i) => `<div class="kpi ${g}"><span class="lbl">${l}</span><span class="num">${fmtN(v)}</span><span class="sub">${i === 0 ? "고유 기기 기준" : `이전 단계의 ${pct(v, funnel[i - 1][1])}%`}</span></div>`).join("")}
        </div>
        <div class="funnel" role="img" aria-label="참여 단계별 인원">
          ${funnel.map(([l, v, g]) => `<div class="frow ${g}"><span>${l}</span><div class="track"><div class="bar" style="width:${v / maxF * 100}%" title="${l} ${fmtN(v)}명"></div></div><span class="v">${fmtN(v)}</span></div>`).join("")}
        </div>
      </section>

      <div class="grid2">
        <section class="panel">
          <h2>일자별 참여</h2>
          ${dayKeys.length ? `<div class="scroll-x"><table>
            <thead><tr><th>날짜</th><th>접속</th><th>시작</th><th>완주</th><th>설문 완료</th></tr></thead>
            <tbody>${dayKeys.map(k => `<tr><td>${dayLabel(k)}</td><td>${fmtN(A.days[k].v)}</td><td>${fmtN(A.days[k].s)}</td><td>${fmtN(A.days[k].c)}</td><td><b>${fmtN(A.days[k].r)}</b></td></tr>`).join("")}</tbody>
            <tfoot><tr><td>합계</td><td>${fmtN(tot.v)}</td><td>${fmtN(tot.s)}</td><td>${fmtN(tot.c)}</td><td>${fmtN(tot.r)}</td></tr></tfoot>
          </table></div>` : `<p class="empty">아직 기록이 없어요.</p>`}
        </section>
        <section class="panel">
          <h2>운영 설정 <span>참여자 화면에 바로 반영돼요</span></h2>
          <form class="form" id="setForm">
            <label class="toggle"><input type="checkbox" id="stSold" ${set.rewardSoldOut ? "checked" : ""}> 참여 상품 소진 (수령 화면에 소진 안내 표시)</label>
            <label>투어 안내소 위치<input type="text" id="stDesk" value="${esc(set.deskLocation)}"></label>
            <label>안내소 운영 시간<input type="text" id="stHours" value="${esc(set.deskHours)}"></label>
            <label>첫 화면 공지 (비우면 숨김)<input type="text" id="stNotice" value="${esc(set.notice)}" placeholder="예) 우천 시 안내소가 세미원 입구로 옮겨져요"></label>
            <button class="tbtn primary" type="submit">설정 저장</button>
            <span class="msg" id="setMsg"></span>
          </form>
        </section>
      </div>

      <section class="panel">
        <h2>만족도 문항별 결과 <span>응답 ${fmtN(A.surveyed)}건 · 5점 척도</span></h2>
        <div class="sec-avg">${Object.entries(A.sections).map(([k, v]) => `<div>${esc(k)} 평균<b>${v.n ? (v.sum / v.n).toFixed(2) : "–"}</b></div>`).join("")}</div>
        <div class="scale-legend">${C.scaleLabels.map((l, i) => `<span><i style="background:${SCALE_COL[i]}"></i>${i + 1} ${l}</span>`).join("")}</div>
        <div>
          ${C.survey.filter(i => i.type === "scale").map((item, idx) => {
            const r = A.q[item.id];
            return `<div class="qcard">
              <div class="qtop"><p><small>${esc(item.section)} · Q${idx + 1}</small>${esc(item.q)}</p>
                <div class="avg"><b>${r.n ? r.avg.toFixed(2) : "–"}</b><span>긍정(4·5점) ${r.n ? Math.round(r.top2 * 100) : 0}% · n=${fmtN(r.n)}</span></div></div>
              <div class="stack" role="img" aria-label="${esc(item.q)} 응답 분포">${r.dist.map((v, i) => v ? `<i style="flex:${v};background:${SCALE_COL[i]};color:${SCALE_TXT[i]}" title="${i + 1}점 ${C.scaleLabels[i]}: ${fmtN(v)}명 (${pct(v, r.n)}%)">${pct(v, r.n) >= 7 ? pct(v, r.n) + "%" : ""}</i>` : "").join("")}</div>
              <div class="dist">${r.dist.map((v, i) => `<span>${i + 1}점 ${fmtN(v)}명</span>`).join("")}</div>
            </div>`;
          }).join("")}
        </div>
      </section>

      <div class="grid2">
        ${C.survey.filter(i => i.type === "choice").map(item => {
          const r = A.q[item.id]; const mx = Math.max(1, ...Object.values(r.cnt));
          return `<section class="panel"><h2>${esc(item.q)} <span>n=${fmtN(r.n)}</span></h2>
            <div class="bars">${Object.entries(r.cnt).map(([o, v]) => `<div class="brow"><span>${esc(o)}</span><div class="track"><div class="bar" style="width:${v / mx * 100}%" title="${esc(o)} ${fmtN(v)}명"></div></div><span class="v"><b>${fmtN(v)}</b> · ${pct(v, r.n)}%</span></div>`).join("")}</div>
          </section>`;
        }).join("")}
      </div>

      <section class="panel">
        <h2>미션별 결과 <span>현장 콘텐츠로 문제를 바꿀 때 난이도 참고용</span></h2>
        <div class="scroll-x"><table>
          <thead><tr><th>미션</th><th>놀이</th><th>푼 사람</th><th style="min-width:150px">첫 도전 정답률</th><th style="min-width:150px">힌트 사용률</th><th>정답 공개</th></tr></thead>
          <tbody>${A.missions.map(x => {
            const f = pct(x.first, x.n), h = pct(x.hint, x.n);
            return `<tr><td>${x.m.id.replace("m", "")} ${esc(x.m.q.slice(0, 22))}${x.m.q.length > 22 ? "…" : ""}</td><td>${kindName(x.m.type)}</td><td>${fmtN(x.n)}</td>
              <td><div class="mcell"><span>${f}%</span><div class="mini" style="width:${f}%"></div></div></td>
              <td><div class="mcell"><span>${h}%</span><div class="mini pinkbar" style="width:${h}%"></div></div></td>
              <td>${fmtN(x.revealed)}</td></tr>`;
          }).join("")}</tbody>
        </table></div>
      </section>

      <section class="panel">
        <h2>기타 의견 <span>${fmtN(A.comments.length)}건</span></h2>
        <input class="search" id="cmtSearch" placeholder="의견 검색 (예: 화장실, 주차, 게임)" value="${esc(commentQuery)}">
        <div class="comments" id="cmtList">${commentsHTML(A.comments)}</div>
      </section>

      <section class="panel">
        <h2>내려받기 <span>엑셀에서 바로 열리는 CSV (UTF-8)</span></h2>
        <div class="a-tools">
          <button class="tbtn primary" id="csvSurvey">만족도 조사 응답 CSV</button>
          <button class="tbtn" id="csvPart">참여자·미션 기록 CSV</button>
        </div>
      </section>

      <section class="panel danger" id="resetPanel">
        <h2>테스트 기록 초기화 <span>정식 운영 전 테스트를 마친 뒤 사용</span></h2>
        ${inEvent() ? `<p class="msg err">지금은 박람회 운영 기간이에요. 실제 참여자 기록이 모두 지워지니 꼭 필요한 경우에만 사용하세요.</p>` : ""}
        <ul class="rules">
          <li><span>참여 기록 <b>${fmtN(A.visited)}건</b>과 만족도 응답 <b>${fmtN(A.surveyed)}건</b>을 모두 지워요.</span></li>
          <li><span>테스트했던 휴대폰도 다음에 열면 저장된 진행 상황이 지워지고 처음 화면부터 시작해요.</span></li>
          <li><span>안내소 위치·운영 시간·공지는 그대로 두고, '상품 소진' 표시만 해제해요.</span></li>
          <li><span><strong>지운 기록은 되돌릴 수 없어요.</strong> 필요하면 위에서 CSV를 먼저 내려받으세요.</span></li>
        </ul>
        ${set.resetAt ? `<p class="small muted" style="margin:0">마지막 초기화: ${timeLabel(set.resetAt)}</p>` : ""}
        <form class="form" id="rsForm">
          <label><span>확인을 위해 아래 칸에 <b>초기화</b>라고 입력하세요</span><input type="text" id="rsText" autocomplete="off" placeholder="초기화"></label>
          <button class="tbtn danger" id="rsGo" type="submit" disabled>모든 참여 기록 삭제</button>
          <span class="msg" id="rsMsg"></span>
        </form>
      </section>`;

    bind(A);
  }

  function inEvent() {
    const now = Date.now();
    return CFG.openAt && CFG.closeAt && now >= new Date(CFG.openAt).getTime() && now <= new Date(CFG.closeAt).getTime();
  }

  function kindName(t) { return { choice: "연잎 고르기", ox: "물길 정하기", word: "연밥 낱말", dial: "물레 숫자", calendar: "달력 꽃심기", pair: "두 빛 고르기", palette: "돛 물들이기" }[t]; }

  function commentsHTML(list) {
    const q = commentQuery.trim();
    const f = q ? list.filter(s => (s.comment || "").includes(q)) : list;
    if (!f.length) return `<p class="empty">${q ? "검색 결과가 없어요." : "아직 남겨진 의견이 없어요."}</p>`;
    return f.map(s => `<div class="cmt"><p>${esc(s.comment)}</p><small>${esc(s.nickname || "")} · ${timeLabel(s.createdAtMs)} · 전반 만족 ${esc((s.answers || {}).s01 || "-")}점</small></div>`).join("");
  }

  function bind(A) {
    $("#refresh").addEventListener("click", load);
    const lo = $("#logout"); if (lo) lo.addEventListener("click", async () => { await DB.adminSignOut(); renderLogin(); });
    const seed = $("#seed"); if (seed) seed.addEventListener("click", () => { DB.demoSeed(sample(300)); load(); });
    const clr = $("#clear"); if (clr) clr.addEventListener("click", () => { DB.demoClear(); load(); });
    $("#cmtSearch").addEventListener("input", e => { commentQuery = e.target.value; $("#cmtList").innerHTML = commentsHTML(A.comments); });
    $("#setForm").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $("#setMsg");
      try {
        await DB.saveSettings({ rewardSoldOut: $("#stSold").checked, deskLocation: $("#stDesk").value.trim(), deskHours: $("#stHours").value.trim(), notice: $("#stNotice").value.trim() });
        msg.className = "msg ok"; msg.textContent = "저장했어요. 참여자 화면은 새로 열 때 반영돼요.";
      } catch (er) { msg.className = "msg err"; msg.textContent = "저장하지 못했어요: " + (er.message || er); }
    });
    const rsText = $("#rsText"), rsGo = $("#rsGo"), rsMsg = $("#rsMsg");
    rsText.addEventListener("input", () => { rsGo.disabled = rsText.value.trim() !== "초기화"; });
    $("#rsForm").addEventListener("submit", async e => {
      e.preventDefault();
      if (rsText.value.trim() !== "초기화") return;
      rsGo.disabled = true; rsText.disabled = true;
      rsMsg.className = "msg"; rsMsg.textContent = "지우는 중…";
      try {
        const n = await DB.resetAll((name, done, total) => {
          rsMsg.textContent = `${name === "surveys" ? "만족도 응답" : "참여 기록"} 지우는 중… ${fmtN(done)} / ${fmtN(total)}`;
        });
        await load();
        const m = $("#rsMsg");
        if (m) { m.className = "msg ok"; m.textContent = `초기화했어요. 참여 기록 ${fmtN(n.participants)}건, 만족도 응답 ${fmtN(n.surveys)}건을 지웠어요.`; }
        const panel = $("#resetPanel"); if (panel) panel.scrollIntoView({ block: "center" });
      } catch (er) {
        rsMsg.className = "msg err"; rsMsg.textContent = "초기화하지 못했어요: " + (er.message || er) + " (관리자 권한과 보안 규칙을 확인해 주세요)";
        rsGo.disabled = false; rsText.disabled = false;
      }
    });
    $("#csvSurvey").addEventListener("click", () => downloadCSV("만족도조사_응답.csv", surveyRows()));
    $("#csvPart").addEventListener("click", () => downloadCSV("참여자_기록.csv", participantRows()));
  }

  /* ---------- CSV ---------- */
  function surveyRows() {
    const head = ["응답시각", "닉네임", "확인코드"].concat(C.survey.map((q, i) => `Q${i + 1} ${q.q}`)).concat(["첫도전정답", "힌트사용", "탐험시간(초)"]);
    const rows = data.surveys.slice().sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)).map(s => [timeLabel(s.createdAtMs), s.nickname, s.rewardCode]
      .concat(C.survey.map(q => q.type === "text" ? (s.comment || "") : ((s.answers || {})[q.id] ?? "")))
      .concat([s.firstTryCorrect ?? "", s.hintsUsed ?? "", s.durationSec ?? ""]));
    return [head].concat(rows);
  }
  function participantRows() {
    const head = ["기기ID", "닉네임", "접속", "시작", "완주", "설문", "진행", "첫도전정답", "힌트", "탐험시간(초)"].concat(C.missions.map(m => m.id));
    const rows = data.participants.map(p => [p.id, p.nickname || "", timeLabel(p.visitAtMs), timeLabel(p.startedAtMs), timeLabel(p.completedAtMs), timeLabel(p.surveyAtMs), p.progress || 0, p.firstTryCorrect ?? "", p.hintsUsed ?? "", p.durationSec ?? ""]
      .concat(C.missions.map(m => { const r = (p.results || {})[m.id]; return !r ? "" : r.ok ? "O" : r.solved ? "재도전 정답" : "공개"; })));
    return [head].concat(rows);
  }
  function downloadCSV(name, rows) {
    const csv = "﻿" + rows.map(r => r.map(v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- 데모용 샘플 데이터 ---------- */
  function sample(n) {
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = (arr, w) => { const t = w.reduce((a, b) => a + b, 0); let x = r() * t; for (let i = 0; i < arr.length; i++) { x -= w[i]; if (x <= 0) return arr[i]; } return arr[arr.length - 1]; };
    const names = ["연잎우산", "두물산책자", "황포돛배선장", "연밥다람쥐", "느티나무그늘", "세미원꽃잎", "물빛여행자", "사색하는양", "양평토박이", "초록발자국"];
    const cmts = ["연꽃 정원이 정말 예뻤어요. 아이랑 게임하면서 돌아보니 더 재밌었어요.", "안내소 위치 표지판이 조금 더 많으면 좋겠어요.", "낱말 맞추기가 제일 재밌었어요!", "주차장이 멀어서 조금 힘들었어요.", "그늘에서 쉴 수 있는 자리가 더 있으면 좋겠어요.", "현장 정원을 보고 풀어야 하는 문제가 더 있으면 좋겠어요.", "화장실 안내가 잘 되어 있었어요.", "게임 덕분에 두물머리 뜻을 처음 알았어요."];
    const days = [16, 17, 18, 19], dayW = [.18, .34, .32, .16];
    const diff = { m01: .8, m02: .72, m03: .95, m04: .92, m05: .86, m06: .83, m07: .88, m08: .7, m09: .8, m10: .9, m11: .62, m12: .94, m13: .78, m14: .66, m15: .74, m16: .9 };
    const P = [], S = [];
    for (let i = 0; i < n; i++) {
      const id = "demo_" + i;
      const day = pick(days, dayW);
      const t0 = Date.UTC(2026, 9, day, 1 + Math.floor(r() * 7), Math.floor(r() * 60)); // 10:00~17:00 KST
      const p = { id, visited: true, visitAtMs: t0 };
      if (r() < .9) {
        p.nickname = names[i % names.length] + (i > 9 ? i : ""); p.started = true; p.startedAtMs = t0 + 60e3;
        const done = r() < .86; const upto = done ? 16 : 3 + Math.floor(r() * 11);
        p.results = {}; let first = 0, hints = 0;
        C.missions.slice(0, upto).forEach(m => { const ok = r() < diff[m.id]; const hint = r() < (ok ? .2 : .6); p.results[m.id] = { ok, solved: ok || r() < .7, tries: ok ? 1 : 2, hint }; if (ok) first++; if (hint) hints++; });
        p.progress = upto;
        if (done) {
          p.completed = true; p.completedAtMs = p.startedAtMs + (240 + Math.floor(r() * 360)) * 1e3; p.firstTryCorrect = first; p.hintsUsed = hints; p.durationSec = Math.round((p.completedAtMs - p.startedAtMs) / 1000);
          if (r() < .95) {
            p.surveyed = true; p.surveyAtMs = p.completedAtMs + 90e3;
            const base = r();
            const sc = bias => Math.max(1, Math.min(5, Math.round(3.9 + bias + (base - .5) * 1.6 + (r() - .5) * 1.4)));
            const answers = { s01: sc(.25), s02: sc(-.35), s03: sc(.05), s04: sc(.2), s05: sc(.35), s06: sc(0), s07: sc(.3),
              s08: pick(C.survey[7].options, [8, 10, 7, 16, 22, 17, 20]), s09: pick(C.survey[8].options, [22, 40, 30, 8]), s10: pick(C.survey[9].options, [26, 18, 24, 8, 20, 4]) };
            S.push({ id, nickname: p.nickname, answers, comment: r() < .3 ? cmts[Math.floor(r() * cmts.length)] : "", rewardCode: "DEM-" + String(i).padStart(3, "0"), firstTryCorrect: first, hintsUsed: hints, durationSec: p.durationSec, createdAtMs: p.surveyAtMs });
          }
        }
      }
      P.push(p);
    }
    return { participants: P, surveys: S };
  }

  start();
})();
