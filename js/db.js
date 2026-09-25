/* =========================================================
 *  데이터 저장 계층
 *  - FIREBASE_CONFIG.apiKey 가 있으면 Firebase(Firestore + 익명 인증)에 저장
 *  - 없으면 데모 모드: 이 브라우저(localStorage)에만 저장
 * ========================================================= */
(function () {
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const DEMO_KEY = "gg-garden-tour-demo-db";
  const cfg = window.FIREBASE_CONFIG || {};
  const useFirebase = !!(cfg.apiKey && cfg.projectId);

  let fb = null;          // loaded SDK modules + instances
  let initPromise = null;

  /* ---------- demo storage ---------- */
  function demoRead() {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || { participants: {}, surveys: {}, settings: {} }; }
    catch (e) { return { participants: {}, surveys: {}, settings: {} }; }
  }
  function demoWrite(db) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) { /* storage blocked */ }
  }
  function deepMerge(a, b) {
    const out = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(k => {
      const v = b[k];
      out[k] = (v && typeof v === "object" && !Array.isArray(v)) ? deepMerge(out[k], v) : v;
    });
    return out;
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(res => setTimeout(() => res("timeout"), ms))]);
  }

  /* ---------- firebase ---------- */
  async function init() {
    if (!useFirebase) return { mode: "demo" };
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const [appM, authM, fsM] = await Promise.all([
        import(SDK + "firebase-app.js"),
        import(SDK + "firebase-auth.js"),
        import(SDK + "firebase-firestore.js")
      ]);
      const app = appM.initializeApp(cfg);
      let db;
      try {
        db = fsM.initializeFirestore(app, {
          localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() })
        });
      } catch (e) {
        db = fsM.getFirestore(app);
      }
      const auth = authM.getAuth(app);
      fb = { app, db, auth, authM, fsM };
      return { mode: "firebase" };
    })();
    return initPromise;
  }

  function currentUser() {
    return new Promise(resolve => {
      const unsub = fb.authM.onAuthStateChanged(fb.auth, u => { unsub(); resolve(u); });
    });
  }

  const TourDB = {
    mode: useFirebase ? "firebase" : "demo",
    init,

    /* 참여자 식별자: 익명 인증 uid (로그인 화면 없음) */
    async ensureUser(fallbackId) {
      if (!useFirebase) return fallbackId;
      try {
        await init();
        let u = await currentUser();
        if (!u || !u.isAnonymous) {
          const cred = await withTimeout(fb.authM.signInAnonymously(fb.auth), 8000);
          u = cred && cred.user ? cred.user : null;
        }
        return u ? u.uid : fallbackId;
      } catch (e) {
        console.warn("[tour] anonymous sign-in failed", e);
        return fallbackId;
      }
    },

    async saveParticipant(uid, data) {
      const payload = Object.assign({}, data, { updatedAtMs: Date.now() });
      if (!useFirebase) {
        const db = demoRead();
        db.participants[uid] = deepMerge(db.participants[uid], payload);
        demoWrite(db);
        return "ok";
      }
      try {
        await init();
        payload.updatedAt = fb.fsM.serverTimestamp();
        const ref = fb.fsM.doc(fb.db, "participants", uid);
        return await withTimeout(fb.fsM.setDoc(ref, payload, { merge: true }), 5000);
      } catch (e) { console.warn("[tour] saveParticipant", e); return "error"; }
    },

    async saveSurvey(uid, data) {
      const payload = Object.assign({}, data, { createdAtMs: Date.now() });
      if (!useFirebase) {
        const db = demoRead();
        db.surveys[uid] = payload;
        demoWrite(db);
        return "ok";
      }
      try {
        await init();
        payload.createdAt = fb.fsM.serverTimestamp();
        const ref = fb.fsM.doc(fb.db, "surveys", uid);
        return await withTimeout(fb.fsM.setDoc(ref, payload), 6000);
      } catch (e) { console.warn("[tour] saveSurvey", e); return "error"; }
    },

    async getSettings() {
      if (!useFirebase) return demoRead().settings || {};
      try {
        await init();
        const snap = await withTimeout(fb.fsM.getDoc(fb.fsM.doc(fb.db, "settings", "app")), 5000);
        return snap && snap.exists && snap.exists() ? snap.data() : {};
      } catch (e) { return {}; }
    },

    /* ---------- 관리자 ---------- */
    async adminState() {
      if (!useFirebase) return { signedIn: true, isAdmin: true, email: "데모 모드" };
      await init();
      const u = await currentUser();
      if (!u || u.isAnonymous) return { signedIn: false };
      const snap = await fb.fsM.getDoc(fb.fsM.doc(fb.db, "admins", u.uid)).catch(() => null);
      return { signedIn: true, isAdmin: !!(snap && snap.exists()), email: u.email, uid: u.uid };
    },
    async adminSignIn(email, password) {
      await init();
      await fb.authM.signInWithEmailAndPassword(fb.auth, email, password);
      return this.adminState();
    },
    async adminSignOut() {
      if (!useFirebase) return;
      await init();
      await fb.authM.signOut(fb.auth);
    },
    async fetchAll() {
      if (!useFirebase) {
        const db = demoRead();
        return {
          participants: Object.entries(db.participants).map(([id, v]) => Object.assign({ id }, v)),
          surveys: Object.entries(db.surveys).map(([id, v]) => Object.assign({ id }, v)),
          settings: db.settings || {}
        };
      }
      await init();
      const { collection, getDocs, getDoc, doc } = fb.fsM;
      const [p, s, st] = await Promise.all([
        getDocs(collection(fb.db, "participants")),
        getDocs(collection(fb.db, "surveys")),
        getDoc(doc(fb.db, "settings", "app"))
      ]);
      return {
        participants: p.docs.map(d => Object.assign({ id: d.id }, d.data())),
        surveys: s.docs.map(d => Object.assign({ id: d.id }, d.data())),
        settings: st.exists() ? st.data() : {}
      };
    },
    async saveSettings(data) {
      if (!useFirebase) {
        const db = demoRead();
        db.settings = Object.assign({}, db.settings, data);
        demoWrite(db);
        return;
      }
      await init();
      await fb.fsM.setDoc(fb.fsM.doc(fb.db, "settings", "app"), data, { merge: true });
    },

    /* 테스트 기록 초기화: 참여 기록·만족도 응답 전체 삭제 + 초기화 시각 기록
       (참여자 휴대폰은 다음 접속 때 이 시각을 보고 스스로 처음 화면으로 돌아가요) */
    async resetAll(onProgress) {
      const stamp = Date.now();
      if (!useFirebase) {
        const db = demoRead();
        const n = { participants: Object.keys(db.participants).length, surveys: Object.keys(db.surveys).length };
        db.participants = {}; db.surveys = {};
        db.settings = Object.assign({}, db.settings, { resetAt: stamp, rewardSoldOut: false });
        demoWrite(db);
        return n;
      }
      await init();
      const { collection, getDocs, writeBatch, doc, setDoc, serverTimestamp } = fb.fsM;
      const n = {};
      for (const name of ["surveys", "participants"]) {
        const snap = await getDocs(collection(fb.db, name));
        n[name] = snap.size;
        let done = 0;
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(fb.db);
          const chunk = snap.docs.slice(i, i + 400);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
          done += chunk.length;
          if (onProgress) onProgress(name, done, snap.size);
        }
      }
      await setDoc(doc(fb.db, "settings", "app"), { resetAt: stamp, resetAtServer: serverTimestamp(), rewardSoldOut: false }, { merge: true });
      return n;
    },

    /* 이 기기만 초기화: 익명 참여자 ID를 새로 받아 새 참여자로 시작 */
    async resetDevice() {
      if (!useFirebase) return;
      try { await init(); await fb.authM.signOut(fb.auth); } catch (e) { /* ignore */ }
    },

    /* 데모 모드 전용 */
    demoSeed(rows) {
      const db = demoRead();
      rows.participants.forEach(p => { db.participants[p.id] = p; });
      rows.surveys.forEach(s => { db.surveys[s.id] = s; });
      demoWrite(db);
    },
    demoClear() { demoWrite({ participants: {}, surveys: {}, settings: {} }); }
  };

  window.TourDB = TourDB;
})();
