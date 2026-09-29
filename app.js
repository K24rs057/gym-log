(function(){
  "use strict";
  var KEY = "gym-log-v1";
  var VERSION = "v1";
  var STAGES = [
    { name: "胸", parts: ["胸"] },
    { name: "肩 + 背中", parts: ["肩", "背中"] },
    { name: "腕 + 腹", parts: ["腕", "腹"] }
  ];
  var LIMIT = { "胸": 4, "背中": 3, "肩": 2, "腕": 5, "腹": 1 };
  var PARTS = ["胸", "背中", "肩", "腕", "腹", "脚"];
  var DEFAULT_EX = [
    ["bench-press", "ベンチプレス", "胸", 2.5, 10],
    ["bench-press-smith", "ベンチプレス(スミス)", "胸", 2.5, 10],
    ["chest-press", "チェストプレス", "胸", 2.5, 10],
    ["pec-fly", "ペックフライ", "胸", 2.5, 10],
    ["incline-smith", "インクライン(スミス)", "胸", 2.5, 10],
    ["incline-bench-press", "インクラインベンチプレス", "胸", 2.5, 10],
    ["incline-chest-press", "インクラインチェストプレス", "胸", 2.5, 10],
    ["lat-pulldown", "ラッドプルダウン", "背中", 2.5, 10],
    ["pulldown-machine", "プルダウン(マシン)", "背中", 2.5, 10],
    ["row", "ロー", "背中", 2.5, 10],
    ["pull-up", "懸垂", "背中", 2.5, 10],
    ["shoulder-press", "ショルダープレス", "肩", 2, 10],
    ["shoulder-press-machine", "ショルダープレス(マシン)", "肩", 2.5, 10],
    ["side-raise", "サイドレイズ", "肩", 1, 15],
    ["rear-delt-fly", "リアデルトフライ", "肩", 2.5, 10],
    ["biceps-curl", "バイセップスカール", "腕", 2.5, 10],
    ["incline-curl", "インクラインカール", "腕", 1, 10],
    ["triceps-extension", "トライセップスエクステンション", "腕", 2.5, 10],
    ["triceps-press", "トライセップスプレス", "腕", 2.5, 10],
    ["cable-pressdown", "ケーブルプレスダウン", "腕", 1.25, 10],
    ["wrist-curl", "リストカール", "腕", 1, 20],
    ["reverse-wrist-curl", "リバースリストカール", "腕", 1, 20],
    ["abdominal", "アブドミナル", "腹", 2.5, 10],
    ["leg-extension", "レッグエクステンション", "脚", 2.5, 10],
    ["leg-press", "レッグプレス", "脚", 5, 10]
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function today() { return ymd(new Date()); }
  function dnum(s) { var a = s.split("-"); return Math.round(Date.UTC(+a[0], +a[1] - 1, +a[2]) / 86400000); }
  function dlab(n) { var d = new Date(n * 86400000); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); }
  function slab(s) { var a = s.split("-"); return (+a[1]) + "/" + (+a[2]); }
  function dom(n) { return new Date(n * 86400000).getUTCDate(); }
  function fmt(v) { return (Math.round(v * 100) / 100).toString(); }

  function fresh() {
    return {
      app: "gym-log", version: 1,
      exercises: DEFAULT_EX.map(function (m) { return { id: m[0], name: m[1], part: m[2], unit: m[3], goalReps: m[4] }; }),
      sessions: [],
      settings: { nextStage: 0, gymCount: 0, ntfyTopic: "" }
    };
  }
  function normalize(d) {
    if (!d.settings) { d.settings = {}; }
    var s = d.settings;
    if (typeof s.nextStage !== "number") { s.nextStage = 0; }
    if (typeof s.gymCount !== "number") { s.gymCount = d.sessions.length; }
    if (typeof s.ntfyTopic !== "string") { s.ntfyTopic = ""; }
    d.sessions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return d;
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.exercises && d.sessions) { return normalize(d); }
      }
    } catch (e) { /* 読めなければ新規 */ }
    return fresh();
  }
  var db = load();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
  }
  function exById(id) {
    for (var i = 0; i < db.exercises.length; i++) { if (db.exercises[i].id === id) { return db.exercises[i]; } }
    return null;
  }
  function sessionOn(date) {
    for (var i = 0; i < db.sessions.length; i++) { if (db.sessions[i].date === date) { return db.sessions[i]; } }
    return null;
  }

  /* ---------- 今日 ---------- */
  var state = [];
  var stageIdx = 0;
  var todaySession = null;

  function lastPerf(exId, beforeDate) {
    for (var i = db.sessions.length - 1; i >= 0; i--) {
      var s = db.sessions[i];
      if (beforeDate && s.date >= beforeDate) { continue; }
      for (var k = s.entries.length - 1; k >= 0; k--) {
        var en = s.entries[k];
        if (en.exId !== exId) { continue; }
        var ok = en.sets.filter(function (x) { return x.r > 0; });
        if (ok.length) { return { date: s.date, sets: ok }; }
      }
    }
    return null;
  }
  function pickMenu(idx) {
    var st = STAGES[idx], out = [], td = dnum(today());
    st.parts.forEach(function (part) {
      var stats = db.exercises.filter(function (e) { return e.part === part; }).map(function (e) {
        var c = 0, last = -1e9;
        db.sessions.forEach(function (s) {
          if (dnum(s.date) < td - 90) { return; }
          s.entries.forEach(function (en) { if (en.exId === e.id) { c++; last = Math.max(last, dnum(s.date)); } });
        });
        return { e: e, c: c, last: last };
      });
      var used = stats.filter(function (x) { return x.c > 0; }).sort(function (a, b) { return b.c - a.c || b.last - a.last; });
      if (!used.length) { used = stats; }
      used.slice(0, LIMIT[part] || 3).forEach(function (x) { out.push(x.e); });
    });
    return out;
  }
  function recStage() {
    var td = today();
    for (var i = db.sessions.length - 1; i >= 0; i--) {
      if (db.sessions[i].date < td) {
        return typeof db.sessions[i].stage === "number" ? (db.sessions[i].stage + 1) % 3 : 0;
      }
    }
    return 0;
  }
  function legToday() { return ((db.settings.gymCount + 1) % 5 === 0) && !todaySession; }

  function buildToday() {
    var td = today();
    todaySession = sessionOn(td);
    if (todaySession && typeof todaySession.stage === "number") { stageIdx = todaySession.stage; }
    else if (db.settings.pickDate === td) { stageIdx = db.settings.nextStage % 3; }
    else { stageIdx = recStage(); }
    var list = pickMenu(stageIdx);
    var leg = exById("leg-extension");
    if (legToday() && leg) { list.push(leg); }
    if (todaySession) {
      todaySession.entries.forEach(function (en) {
        var e = exById(en.exId);
        if (e && list.indexOf(e) < 0) { list.push(e); }
      });
    }
    state = list.map(function (e) {
      var lp = lastPerf(e.id, td);
      var rec = null;
      if (todaySession) {
        for (var i = 0; i < todaySession.entries.length; i++) { if (todaySession.entries[i].exId === e.id) { rec = todaySession.entries[i]; } }
      }
      var sets;
      if (rec) { sets = rec.sets.map(function (s) { return [s.w, s.r]; }); }
      else if (lp) { sets = lp.sets.slice(0, 6).map(function (s) { return [s.w, s.r]; }); }
      else { sets = [[0, e.goalReps]]; }
      return { e: e, lp: lp, skip: !!todaySession && !rec, sets: sets };
    });
    renderToday();
  }
  function goalW(x) {
    if (!x.lp) { return 0; }
    var f = x.lp.sets[0];
    return f.r >= x.e.goalReps ? f.w + x.e.unit : f.w;
  }
  function goalText(x) {
    var e = x.e;
    if (!x.lp) { return "初めての種目。重さを決めて、" + e.goalReps + "回を目指す"; }
    var f = x.lp.sets[0];
    if (f.r >= e.goalReps) { return "今日の目標　" + fmt(f.w + e.unit) + "kgで" + e.goalReps + "回(前回は" + e.goalReps + "回に届いた)"; }
    return "今日の目標　" + fmt(f.w) + "kgで" + e.goalReps + "回";
  }
  function lastLine(x) {
    if (!x.lp) { return "前回の記録なし"; }
    return "前回(" + slab(x.lp.date) + ")　" + x.lp.sets.map(function (s) { return fmt(s.w) + "kg×" + s.r; }).join(" ／ ");
  }
  function renderToday() {
    var now = new Date();
    $("date").textContent = now.getFullYear() + "." + p2(now.getMonth() + 1) + "." + p2(now.getDate()) + " " + "日月火水木金土".charAt(now.getDay());
    /* さぼり日数 */
    var gap = $("gap");
    gap.className = "gap"; gap.innerHTML = "";
    var prev = null;
    for (var i = db.sessions.length - 1; i >= 0; i--) { if (db.sessions[i].date < today()) { prev = db.sessions[i]; break; } }
    if (prev && !todaySession) {
      var n = dnum(today()) - dnum(prev.date);
      if (n >= 7) { gap.className = "gap s7"; gap.innerHTML = n + "日ぶり<span>1週間以上空いています。重さは前回のままで、無理せず。</span>"; }
      else if (n >= 3) { gap.className = "gap s3"; gap.innerHTML = n + "日ぶり<span>" + n + "日ジムに行っていません。</span>"; }
      else if (n >= 1) { gap.className = "gap s1"; gap.innerHTML = n + "日ぶり"; }
    }
    $("menu").textContent = STAGES[stageIdx].name;
    var rec = recStage();
    $("dots").innerHTML = STAGES.map(function (s, k) {
      return '<button type="button" class="dot' + (k === stageIdx ? " on" : "") + (k === rec ? " rec" : "") + '" data-s="' + k + '">' + (k === rec ? '<span class="mk">今日</span>' : "") + s.name + "</button>";
    }).join("");
    $("leg").classList.toggle("show", legToday());
    var done = $("done");
    if (todaySession) { done.hidden = false; done.textContent = "今日は記録済みです。直して「記録する」を押すと上書きします。"; }
    else if (stageIdx !== rec) { done.hidden = false; done.textContent = "今日のおすすめは「" + STAGES[rec].name + "」です。"; }
    else { done.hidden = true; }
    if (!state.length) {
      $("exs").innerHTML = '<div class="empty">この部位の種目がありません。SETTINGS で種目を追加してください。</div>';
    } else {
      $("exs").innerHTML = state.map(function (x, i) {
        return '<section class="ex' + (x.skip ? " skip" : "") + '" data-i="' + i + '"><div class="ex-h"><b>' + esc(x.e.name) + '</b><div class="right"><span>' + x.e.part + '</span><button class="skipbtn" type="button" data-skip="1">' + (x.skip ? "やることにする" : "今日はやらない") + '</button></div></div>' +
          '<div class="last">' + esc(lastLine(x)) + '</div>' +
          '<div class="skipmsg">今日はスキップ。次回も同じ内容から始めます</div>' +
          '<div class="goal">' + esc(goalText(x)) + '</div>' +
          '<div class="sets"></div><div class="hint"></div>' +
          '<button class="add" type="button">+ セットを追加</button></section>';
      }).join("");
      state.forEach(function (x, i) { renderSets(i); });
    }
  }
  function renderSets(i) {
    var sec = document.querySelector('.ex[data-i="' + i + '"]'), x = state[i], w = "";
    x.sets.forEach(function (s, k) {
      w += '<div class="set"><span class="no">' + (k + 1) + '</span>' +
        '<div class="st"><button type="button" data-k="' + k + '" data-f="w" data-d="-1" aria-label="重量を下げる">−</button><div>' + fmt(s[0]) + '<small>kg</small></div><button type="button" data-k="' + k + '" data-f="w" data-d="1" aria-label="重量を上げる">＋</button></div>' +
        '<div class="st"><button type="button" data-k="' + k + '" data-f="r" data-d="-1" aria-label="回数を減らす">−</button><div>' + s[1] + '<small>回</small></div><button type="button" data-k="' + k + '" data-f="r" data-d="1" aria-label="回数を増やす">＋</button></div>' +
        (x.sets.length > 1 ? '<button class="del" type="button" data-del="' + k + '" aria-label="このセットを削除">✕</button>' : '<span class="ph"></span>') + '</div>';
    });
    sec.querySelector(".sets").innerHTML = w;
    var s0 = x.sets[0], hint = sec.querySelector(".hint");
    hint.textContent = (s0[1] >= x.e.goalReps && s0[0] > 0 && s0[0] >= goalW(x)) ? x.e.goalReps + "回達成。次回は" + fmt(s0[0] + x.e.unit) + "kgに上げてみよう" : "";
  }
  $("dots").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-s]");
    if (!b || todaySession) { return; }
    db.settings.nextStage = +b.getAttribute("data-s");
    db.settings.pickDate = today();
    persist(); buildToday();
  });
  $("exs").addEventListener("click", function (ev) {
    var sec = ev.target.closest(".ex");
    if (!sec) { return; }
    var i = +sec.getAttribute("data-i"), x = state[i];
    if (ev.target.classList.contains("add")) {
      var l = x.sets[x.sets.length - 1];
      x.sets.push([l[0], l[1]]); renderSets(i); return;
    }
    var sk = ev.target.closest("button[data-skip]");
    if (sk) {
      x.skip = !x.skip;
      sec.classList.toggle("skip", x.skip);
      sk.textContent = x.skip ? "やることにする" : "今日はやらない";
      return;
    }
    var dl = ev.target.closest("button[data-del]");
    if (dl) {
      if (x.sets.length > 1) { x.sets.splice(+dl.getAttribute("data-del"), 1); renderSets(i); }
      return;
    }
    var b = ev.target.closest("button[data-k]");
    if (!b) { return; }
    var k = +b.getAttribute("data-k"), f = b.getAttribute("data-f"), d = +b.getAttribute("data-d"), s = x.sets[k];
    if (f === "w") { s[0] = Math.max(0, Math.round((s[0] + d * x.e.unit) * 100) / 100); }
    else { s[1] = Math.max(0, s[1] + d); }
    renderSets(i);
  });

  function showToast(msg, warn) {
    var t = $("toast");
    t.hidden = false; t.textContent = msg;
    t.classList.toggle("warn", !!warn);
  }
  function scheduleNotify() {
    var topic = db.settings.ntfyTopic;
    if (!topic) { return Promise.resolve("no-topic"); }
    var last = db.sessions.length ? db.sessions[db.sessions.length - 1] : null;
    var base = db.settings.lastSaveTs || Date.now();
    var remain = Math.round(3 * 86400 - (Date.now() - base) / 1000);
    if (last && remain <= 0) { return Promise.resolve("overdue"); }
    var nextName = STAGES[db.settings.nextStage % 3].name;
    return fetch("https://ntfy.sh/" + encodeURIComponent(topic) + "/gymlog-remind", {
      method: "POST",
      headers: { "Delay": Math.max(60, remain) + "s", "Title": "GYM LOG", "Tags": "muscle" },
      body: "3日ジムに行っていません。今日は" + nextName + "の日"
    }).then(function (r) { return r.ok ? "ok" : "ng"; }).catch(function () { return "ng"; });
  }
  function afterSaveNotify() {
    return scheduleNotify().then(function (r) {
      db.settings.notifyPending = (r === "ng");
      persist();
      return r;
    });
  }

  $("save").addEventListener("click", function () {
    var entries = [], skipped = 0;
    state.forEach(function (x) {
      if (x.skip) { skipped++; return; }
      var sets = x.sets.filter(function (s) { return s[1] > 0; }).map(function (s) { return { w: s[0], r: s[1] }; });
      if (sets.length) { entries.push({ exId: x.e.id, sets: sets }); }
    });
    if (!entries.length) { showToast("記録する種目がありません。回数を入れてください。", true); return; }
    var date = today(), first = !todaySession;
    if (todaySession) {
      todaySession.entries = entries;
    } else {
      db.sessions.push({ date: date, stage: stageIdx, parts: STAGES[stageIdx].parts.slice(), entries: entries });
    }
    if (first) {
      db.settings.nextStage = (stageIdx + 1) % 3;
      db.settings.gymCount++;
    }
    db.settings.lastSaveTs = Date.now();
    normalize(db);
    var ok = persist();
    var msg = "保存しました。" + entries.length + "種目を記録" + (skipped ? "、" + skipped + "種目はスキップ" : "") + "。次は「" + STAGES[db.settings.nextStage % 3].name + "」です。";
    if (!ok) { msg = "保存できませんでした。ブラウザの保存領域がいっぱいか、使えない状態です。"; }
    buildToday();
    showToast(msg, !ok);
    if (ok) {
      afterSaveNotify().then(function (r) {
        if (r === "ok") { showToast(msg + " 3日後の通知を予約しました。"); }
        else if (r === "ng") { showToast(msg + " 通知の予約は送れませんでした。次に開いたときに再送します。", true); }
      });
    }
    window.scrollTo(0, 0);
  });

  /* ---------- 履歴 ---------- */
  var cur = [], span = 7, endD = 1e9;
  function seriesFor(exId) {
    var by = {};
    db.sessions.forEach(function (s) {
      s.entries.forEach(function (en) {
        if (en.exId !== exId) { return; }
        en.sets.forEach(function (st) {
          if (st.r > 0) { by[s.date] = Math.max(by[s.date] || 0, st.w); }
        });
      });
    });
    return Object.keys(by).sort().map(function (d) { return [dnum(d), by[d]]; });
  }
  function drawChart() {
    var svg = $("svg");
    if (!cur.length) {
      svg.innerHTML = '<text x="180" y="100" text-anchor="middle" font-size="13" fill="var(--sub)">まだ記録がありません</text>';
      $("rng").textContent = "";
      return;
    }
    var first = cur[0][0], lastD = cur[cur.length - 1][0], total = lastD - first + 1;
    span = Math.max(7, Math.min(span, Math.max(7, total)));
    endD = Math.max(first + span - 1, Math.min(endD, lastD));
    var start = endD - span + 1;
    var vis = cur.filter(function (p) { return p[0] >= start && p[0] <= endD; });
    var W = 360, H = 200, l = 38, r = 14, t = 16, b = 30, s = "", g = 0;
    var src = vis.length ? vis : cur, mn = Infinity, mx = 0;
    src.forEach(function (p) { mn = Math.min(mn, p[1]); mx = Math.max(mx, p[1]); });
    mn = Math.floor((mn - 5) / 5) * 5; mx = Math.ceil((mx + 2) / 5) * 5;
    if (mn < 0) { mn = 0; }
    function X(d) { return l + (W - l - r) * (d - start) / (span - 1); }
    function Y(v) { return t + (H - t - b) * (1 - (v - mn) / (mx - mn)); }
    var stepY = mx - mn > 30 ? 10 : 5;
    for (g = mn; g <= mx; g += stepY) {
      s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (l - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end" font-size="11" fill="var(--sub)">' + g + '</text>';
    }
    var step = span <= 14 ? 1 : (span <= 35 ? 7 : (span <= 90 ? 14 : 30)), d = 0;
    for (d = start; d <= endD; d++) {
      if ((d - start) % step !== 0) { continue; }
      var lab = step === 1 ? ((d === start || dom(d) === 1) ? dlab(d) : String(dom(d))) : dlab(d);
      s += '<line x1="' + X(d) + '" x2="' + X(d) + '" y1="' + t + '" y2="' + (H - b) + '" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 4"/><text x="' + X(d) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="var(--sub)">' + lab + '</text>';
    }
    if (!vis.length) {
      s += '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" font-size="13" fill="var(--sub)">この期間は記録がありません</text>';
    } else {
      s += '<polyline points="' + vis.map(function (p) { return X(p[0]) + "," + Y(p[1]); }).join(" ") + '" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>';
      var lp = vis[vis.length - 1];
      vis.forEach(function (p) {
        if (span <= 45) { s += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="3.5" fill="var(--accent)"/>'; }
        if (span <= 21 && p !== lp) { s += '<text x="' + X(p[0]) + '" y="' + (Y(p[1]) - 9) + '" text-anchor="middle" font-size="10" fill="var(--sub)">' + fmt(p[1]) + '</text>'; }
      });
      s += '<circle cx="' + X(lp[0]) + '" cy="' + Y(lp[1]) + '" r="5" fill="var(--accent)"/>';
      s += '<text x="' + Math.min(X(lp[0]) + 4, W - r) + '" y="' + (Y(lp[1]) - 10) + '" text-anchor="end" font-size="13" font-weight="700" fill="var(--fg)">' + fmt(lp[1]) + 'kg</text>';
    }
    svg.innerHTML = s;
    $("rng").textContent = dlab(start) + " 〜 " + dlab(endD) + "(" + span + "日間)";
  }
  function renderHistory() {
    var sel = $("exSel"), prevVal = sel.value;
    var counts = {};
    db.sessions.forEach(function (s) { s.entries.forEach(function (en) { counts[en.exId] = (counts[en.exId] || 0) + 1; }); });
    var ids = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    sel.innerHTML = ids.map(function (id) { var e = exById(id); return '<option value="' + esc(id) + '">' + esc(e ? e.name : id) + '</option>'; }).join("");
    if (ids.length) { sel.value = ids.indexOf(prevVal) >= 0 ? prevVal : ids[0]; }
    cur = ids.length ? seriesFor(sel.value) : [];
    span = 7; endD = 1e9;
    drawChart();
    var rows = db.sessions.slice(-30).reverse().map(function (s) {
      var label = (typeof s.stage === "number") ? STAGES[s.stage].name : (s.parts && s.parts.length ? s.parts.join("・") : "");
      var lines = s.entries.map(function (en) {
        var e = exById(en.exId);
        return esc(e ? e.name : en.exId) + " " + en.sets.map(function (st) { return fmt(st.w) + "kg×" + st.r; }).join(" / ");
      }).join("<br>");
      return '<div class="hrow" data-d="' + s.date + '"><span class="d">' + slab(s.date) + '</span><div><b>' + esc(label || "記録") + '</b><span>' + lines + '</span><button class="x" type="button" data-rm="' + s.date + '">この日を削除</button><div class="confirm" hidden>この日の記録を消します。<div class="row2"><button class="ghost danger" type="button" data-rmyes="' + s.date + '">消す</button><button class="ghost" type="button" data-rmno="1">やめる</button></div></div></div></div>';
    }).join("");
    $("hist").innerHTML = rows || '<div class="empty">まだ記録がありません。SETTINGS で過去の記録を読み込めます。</div>';
  }
  $("exSel").addEventListener("change", function (e) { cur = seriesFor(e.target.value); span = 7; endD = 1e9; drawChart(); });
  $("zin").addEventListener("click", function () { span = Math.max(7, Math.round(span * 0.6)); drawChart(); });
  $("zout").addEventListener("click", function () { span = Math.round(span / 0.6); drawChart(); });
  $("zl").addEventListener("click", function () { endD -= Math.max(1, Math.round(span / 3)); drawChart(); });
  $("zr").addEventListener("click", function () { endD += Math.max(1, Math.round(span / 3)); drawChart(); });
  $("z7").addEventListener("click", function () { span = 7; endD = 1e9; drawChart(); });
  $("z30").addEventListener("click", function () { span = 30; endD = 1e9; drawChart(); });
  $("zall").addEventListener("click", function () { span = 9999; endD = 1e9; drawChart(); });
  $("hist").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) { return; }
    var row = b.closest(".hrow");
    if (b.hasAttribute("data-rm")) { row.querySelector(".confirm").hidden = false; return; }
    if (b.hasAttribute("data-rmno")) { row.querySelector(".confirm").hidden = true; return; }
    if (b.hasAttribute("data-rmyes")) {
      var date = b.getAttribute("data-rmyes");
      var idx = -1;
      db.sessions.forEach(function (s, i) { if (s.date === date) { idx = i; } });
      if (idx >= 0) {
        var removed = db.sessions.splice(idx, 1)[0];
        db.settings.gymCount = Math.max(0, db.settings.gymCount - 1);
        if (idx === db.sessions.length && typeof removed.stage === "number") { db.settings.nextStage = removed.stage; }
        persist(); renderHistory(); buildToday();
      }
    }
  });

  /* ---------- 設定 ---------- */
  function renderSettings() {
    $("stageSel").innerHTML = STAGES.map(function (s, i) { return '<option value="' + i + '">' + s.name + '</option>'; }).join("");
    $("stageSel").value = String(db.settings.nextStage % 3);
    $("gymCount").value = db.settings.gymCount;
    $("newPart").innerHTML = PARTS.map(function (p) { return '<option>' + p + '</option>'; }).join("");
    $("topic").value = db.settings.ntfyTopic || "";
    $("ver").textContent = "GYM LOG " + VERSION + " / 記録 " + db.sessions.length + "日分";
    $("exList").innerHTML = PARTS.map(function (p) {
      var items = db.exercises.filter(function (e) { return e.part === p; });
      if (!items.length) { return ""; }
      return '<div class="grp"><div class="tag">' + p + '</div>' + items.map(function (e) {
        return '<div class="item" data-id="' + esc(e.id) + '"><div>' + esc(e.name) + '</div>' +
          '<div><span class="lab">目標回数</span><input type="number" min="1" inputmode="numeric" data-f="goalReps" value="' + e.goalReps + '" aria-label="' + esc(e.name) + 'の目標回数"></div>' +
          '<div><span class="lab">刻み kg</span><input type="number" min="0.25" step="0.25" inputmode="decimal" data-f="unit" value="' + e.unit + '" aria-label="' + esc(e.name) + 'の刻み"></div></div>';
      }).join("") + '</div>';
    }).join("");
  }
  $("stageSel").addEventListener("change", function (e) { db.settings.nextStage = +e.target.value; db.settings.pickDate = today(); persist(); buildToday(); });
  $("gymCount").addEventListener("change", function (e) { db.settings.gymCount = Math.max(0, parseInt(e.target.value, 10) || 0); persist(); buildToday(); });
  $("exList").addEventListener("change", function (ev) {
    var inp = ev.target.closest("input[data-f]");
    if (!inp) { return; }
    var e = exById(inp.closest(".item").getAttribute("data-id"));
    var v = parseFloat(inp.value);
    if (!e || !(v > 0)) { renderSettings(); return; }
    e[inp.getAttribute("data-f")] = v;
    persist(); buildToday();
  });
  $("addEx").addEventListener("click", function () {
    var name = $("newName").value.trim();
    var msg = $("backupMsg");
    if (!name) { $("newName").focus(); return; }
    db.exercises.push({ id: "x-" + Date.now().toString(36), name: name, part: $("newPart").value, unit: 2.5, goalReps: 10 });
    $("newName").value = "";
    persist(); renderSettings(); buildToday();
  });
  function say(id, text, warn) { var t = $(id); t.hidden = false; t.textContent = text; t.classList.toggle("warn", !!warn); }
  $("exportBtn").addEventListener("click", function () {
    try {
      var blob = new Blob([JSON.stringify(db, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gym-log-" + today().replace(/-/g, "") + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      say("backupMsg", "書き出しました。ダウンロードのフォルダを確認してください。");
    } catch (e) { say("backupMsg", "書き出せませんでした。", true); }
  });
  var pendingImport = null;
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) { return; }
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (!d || !Array.isArray(d.exercises) || !Array.isArray(d.sessions)) { throw new Error("形式が違います"); }
        pendingImport = d;
        $("importMsg").textContent = d.sessions.length + "日分の記録と、" + d.exercises.length + "種目を読み込みます。今の記録は置き換わります。";
        $("importConfirm").hidden = false;
      } catch (e) { say("backupMsg", "読み込めませんでした。gym-log の書き出しファイルを選んでください。", true); }
    };
    rd.readAsText(f);
    ev.target.value = "";
  });
  $("importNo").addEventListener("click", function () { pendingImport = null; $("importConfirm").hidden = true; });
  $("importYes").addEventListener("click", function () {
    if (!pendingImport) { return; }
    var keepTopic = db.settings.ntfyTopic;
    db = normalize(pendingImport);
    if (!db.settings.ntfyTopic) { db.settings.ntfyTopic = keepTopic; }
    pendingImport = null; $("importConfirm").hidden = true;
    var ok = persist();
    say("backupMsg", ok ? "読み込みました。" : "読み込みましたが、保存できませんでした。", !ok);
    renderSettings(); buildToday();
  });
  function randomTopic() {
    var a = new Uint8Array(9), s = "";
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) { s += "abcdefghijkmnpqrstuvwxyz23456789".charAt(a[i] % 32); }
    return "gymlog-" + s;
  }
  $("genTopic").addEventListener("click", function () {
    $("topic").value = randomTopic();
    db.settings.ntfyTopic = $("topic").value; persist();
    say("notifyMsg", "名前を作りました。ntfy アプリでこの名前を購読してください: " + $("topic").value);
  });
  $("topic").addEventListener("change", function () { db.settings.ntfyTopic = $("topic").value.trim(); persist(); });
  $("testNotify").addEventListener("click", function () {
    var t = $("topic").value.trim();
    if (!t) { say("notifyMsg", "先にトピック名を入れるか、「名前を作る」を押してください。", true); return; }
    db.settings.ntfyTopic = t; persist();
    fetch("https://ntfy.sh/" + encodeURIComponent(t), { method: "POST", headers: { "Title": "GYM LOG", "Tags": "muscle" }, body: "テスト通知です。これが届けば設定は完了です。" })
      .then(function (r) { say("notifyMsg", r.ok ? "送りました。ntfy アプリに届いているか確認してください。" : "送れませんでした。", !r.ok); })
      .catch(function () { say("notifyMsg", "送れませんでした。ネットにつながっているか確認してください。", true); });
  });

  /* ---------- 画面切り替え ---------- */
  var tabs = document.querySelectorAll(".tabs button");
  Array.prototype.forEach.call(tabs, function (b) {
    b.addEventListener("click", function () {
      var id = b.getAttribute("data-t");
      Array.prototype.forEach.call(tabs, function (o) { o.classList.toggle("on", o === b); });
      ["today", "history", "settings"].forEach(function (s) { $(s).hidden = (s !== id); });
      if (id === "history") { renderHistory(); }
      if (id === "settings") { renderSettings(); }
      window.scrollTo(0, 0);
    });
  });

  /* ---------- 起動 ---------- */
  buildToday();
  if (db.settings.notifyPending) { afterSaveNotify(); }
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(function () { /* 登録できなくても使える */ });
  }
})();
