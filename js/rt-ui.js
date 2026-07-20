// 文戰擂台前端：房號約戰＋1.5 秒輪詢＋「我方 vs 標靶」本機戰鬥＋硯靈事件＋戰帖＋全班文會＋科舉賽季。
// 傷害權威在攻擊方：我上報累計 dmg，對方血量 = 對方最大血 − 我方 dmg。
// 一切後端呼叫走 WYAPI.call('/api/...')（禁相對路徑 fetch）；後端 null 時降級提示。
// 掛 window.WYRt，暴露 init(TEXTS) 與 render(mountEl)。
const WYRt = (() => {
  const L = () => globalThis.WYRtLogic;
  const EV = () => globalThis.WYRtEvents;
  const SEASON = () => globalThis.WYRtSeason;
  const WALL = () => globalThis.WYLiveWall;
  const NICK_KEY = 'wy_rt_nick';

  let TEXTS = [];
  let root = null;
  const timers = [];

  function init(texts) { TEXTS = texts || []; }
  function clearTimers() { while (timers.length) clearInterval(timers.pop()); }
  function every(ms, fn) { const id = setInterval(fn, ms); timers.push(id); return id; }
  const gone = () => !root || !root.isConnected;
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const api = (path, body) => WYAPI.call(path, { body });

  function getNick() {
    try { return (localStorage.getItem(NICK_KEY) || '').trim(); } catch { return ''; }
  }
  function setNick(n) {
    try { localStorage.setItem(NICK_KEY, n); } catch { /* 隱私模式：略過 */ }
  }

  function scopeLabel(scope) {
    if (!scope) return '';
    if (scope.mode === 'single') { const t = TEXTS.find((x) => x.id === scope.textId); return `單篇・${t ? t.title : scope.textId}`; }
    if (scope.mode === 'level') return scope.level === 'J' ? '難度・國中' : '難度・高中';
    return '混合・全 27 篇';
  }

  // ---------- 進場：主選單 ----------
  function render(mountEl) {
    root = mountEl;
    clearTimers();
    home();
    return root;
  }

  function shell(inner) {
    if (gone()) return;
    root.innerHTML = `<div class="rt">${inner}</div>`;
  }

  function home() {
    clearTimers();
    shell(`
      <div class="card rt-hero">
        <h2>⚔️ 文戰擂台</h2>
        <p class="rt-sub">同 seed 連線對戰・硯靈評點・科舉功名。連不上伺服器時可改用「戰帖」非同步對戰。</p>
      </div>
      <div class="rt-menu">
        <button class="rt-btn rt-btn--main" data-go="create">🏯 開房約戰<span>出一個 4 位數房號給同學</span></button>
        <button class="rt-btn rt-btn--main" data-go="join">🚪 輸房號加入<span>同學開房後把號碼給你</span></button>
        <button class="rt-btn" data-go="accept">📜 輸戰帖碼應戰<span>非同步・7 天內有效</span></button>
        <button class="rt-btn" data-go="live-stu">📡 全班文會（學生）<span>老師開場後輸班級碼進場</span></button>
        <button class="rt-btn" data-go="live-host">🧑‍🏫 我是主持人（老師）<span>開一場全班同題搶答</span></button>
        <button class="rt-btn" data-go="season">🏆 科舉賽季榜<span>月賽季・功名稱號</span></button>
      </div>
    `);
    root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const g = b.dataset.go;
      if (g === 'create') createScreen();
      else if (g === 'join') joinScreen();
      else if (g === 'accept') acceptScreen();
      else if (g === 'live-stu') liveStudentScreen();
      else if (g === 'live-host') liveHostScreen();
      else if (g === 'season') seasonScreen();
    }));
  }

  function backBar(label = '返回擂台') {
    return `<button class="rt-back" data-back>‹ ${label}</button>`;
  }
  function bindBack() {
    const b = root.querySelector('[data-back]');
    if (b) b.addEventListener('click', () => home());
  }

  function askNick(cb) {
    const cur = getNick();
    const n = (prompt('請輸入你的擂台暱稱（1-12 字）', cur) || '').trim();
    if (!n) return false;
    setNick(n.slice(0, 12));
    cb(n.slice(0, 12));
    return true;
  }

  // ---------- 開房 ----------
  function scopePicker(id) {
    const opts = TEXTS.map((t) => `<option value="${t.id}">${esc(t.title)}（${t.level === 'J' ? '國中' : '高中'}）</option>`).join('');
    return `
      <div class="rt-scope" id="${id}">
        <label><input type="radio" name="rtmode" value="mixed" checked> 混合・全 27 篇</label>
        <label><input type="radio" name="rtmode" value="level-J"> 難度・國中 14 篇</label>
        <label><input type="radio" name="rtmode" value="level-S"> 難度・高中 13 篇</label>
        <label><input type="radio" name="rtmode" value="single"> 單篇：</label>
        <select class="rt-single">${opts}</select>
      </div>`;
  }
  function readScope() {
    const m = root.querySelector('input[name="rtmode"]:checked');
    if (!m) return { mode: 'mixed' };
    if (m.value === 'mixed') return { mode: 'mixed' };
    if (m.value === 'level-J') return { mode: 'level', level: 'J' };
    if (m.value === 'level-S') return { mode: 'level', level: 'S' };
    return { mode: 'single', textId: root.querySelector('.rt-single').value };
  }

  function createScreen() {
    clearTimers();
    shell(`
      ${backBar()}
      <div class="card">
        <h3>🏯 開房約戰</h3>
        <p class="rt-sub">選好出題範圍，開房後把 4 位數房號給同學。</p>
        ${scopePicker('rt-create-scope')}
        <button class="rt-btn rt-btn--main" id="rt-do-create">產生房號</button>
      </div>
    `);
    bindBack();
    root.querySelector('#rt-do-create').addEventListener('click', () => {
      if (!getNick() && !askNick(() => {})) return;
      doCreate(readScope());
    });
  }

  async function doCreate(scope) {
    const nick = getNick() || '無名書生';
    shell(`${backBar()}<div class="card rt-loading">開房中…</div>`);
    bindBack();
    const r = await api('/api/rt-room', { op: 'create', snap: { nick, hp: L().MAX_HP, scope } });
    if (!r) return degrade('開房');
    if (!r.ok) return errCard(r.error || '開房失敗');
    lobby({ code: r.code, seed: r.seed, role: 'p1', scope, nick });
  }

  function lobby(room) {
    clearTimers();
    shell(`
      ${backBar('取消房間')}
      <div class="card rt-lobby">
        <h3>房號已開</h3>
        <div class="rt-code">${room.code}</div>
        <p class="rt-sub">把這個號碼給同學，請他在「輸房號加入」輸入。範圍：${scopeLabel(room.scope)}</p>
        <div class="rt-waiting">⏳ 等待對手加入…（房間 10 分鐘有效）</div>
      </div>
    `);
    bindBack();
    every(1500, async () => {
      if (gone()) return clearTimers();
      const r = await api('/api/rt-room', { op: 'poll', code: room.code, role: room.role });
      if (!r || !r.ok) return;
      if (r.opp && r.opp.snap) { clearTimers(); startBattle(room, r.opp.snap); }
    });
  }

  // ---------- 加入 ----------
  function joinScreen() {
    clearTimers();
    shell(`
      ${backBar()}
      <div class="card">
        <h3>🚪 輸房號加入</h3>
        <input class="rt-input" id="rt-join-code" inputmode="numeric" maxlength="4" placeholder="4 位數房號">
        <button class="rt-btn rt-btn--main" id="rt-do-join">加入對戰</button>
        <div class="rt-err" id="rt-join-err"></div>
      </div>
    `);
    bindBack();
    root.querySelector('#rt-do-join').addEventListener('click', () => {
      const code = (root.querySelector('#rt-join-code').value || '').trim();
      if (!/^\d{4}$/.test(code)) { root.querySelector('#rt-join-err').textContent = '房號是 4 位數字'; return; }
      if (!getNick() && !askNick(() => {})) return;
      doJoin(code);
    });
  }

  async function doJoin(code) {
    const nick = getNick() || '無名書生';
    shell(`${backBar()}<div class="card rt-loading">加入中…</div>`);
    bindBack();
    // join 需帶 scope（沿用房主範圍，先送 mixed 佔位，成功後以回傳 scope 為準）
    const r = await api('/api/rt-room', { op: 'join', code, snap: { nick, hp: L().MAX_HP, scope: { mode: 'mixed' } } });
    if (!r) return degrade('加入');
    if (!r.ok) return errCard(r.error || '加入失敗');
    startBattle({ code, seed: r.seed, role: 'p2', scope: r.scope, nick }, r.opp);
  }

  // ---------- 對戰引擎（create/join 共用）----------
  let B = null;
  function startBattle(room, oppSnap) {
    clearTimers();
    const qs = L().buildRounds(TEXTS, room.scope, room.seed, L().ROUNDS);
    B = {
      room, oppSnap,
      qs, idx: 0,
      local: L().newLocalState(100000), // 大血底，只為累計 dmg
      dmg: 0, correct: 0, done: false, finished: false,
      oppDmg: 0, oppDone: false, oppHb: Date.now(),
      script: EV().buildScript(room.seed, L().ROUNDS),
      pendingDouble: false, pendingBoost: false, pendingEliminate: false,
      locked: false,
    };
    // 對手心跳輪詢
    every(L().POLL_MS, pollOpp);
    renderRound();
  }

  const myMaxHp = () => (B.room.nick, L().MAX_HP);
  const myHp = () => Math.max(0, L().MAX_HP - B.oppDmg);
  const oppHp = () => Math.max(0, (B.oppSnap ? B.oppSnap.hp : L().MAX_HP) - B.dmg);

  function hud() {
    const meName = esc(B.room.nick || '我');
    const oppName = esc(B.oppSnap ? B.oppSnap.nick : '對手');
    const mp = Math.round(myHp() / L().MAX_HP * 100);
    const op = Math.round(oppHp() / ((B.oppSnap ? B.oppSnap.hp : L().MAX_HP)) * 100);
    return `
      <div class="rt-hud">
        <div class="rt-side rt-me">
          <div class="rt-name">${meName}</div>
          <div class="rt-hpbar"><span style="width:${mp}%"></span></div>
          <div class="rt-hpn">${myHp()}</div>
        </div>
        <div class="rt-vs">第 ${Math.min(B.idx + 1, B.qs.length)}/${B.qs.length} 題</div>
        <div class="rt-side rt-opp">
          <div class="rt-name">${oppName}</div>
          <div class="rt-hpbar rt-hpbar--opp"><span style="width:${op}%"></span></div>
          <div class="rt-hpn">${oppHp()}</div>
        </div>
      </div>`;
  }

  function renderRound() {
    if (gone() || B.finished) return;
    if (B.idx >= B.qs.length) { B.done = true; push(); return waitFinish(); }
    const q = B.qs[B.idx];
    B.locked = false;
    // eliminate：灰掉一個錯誤選項
    let elimIdx = -1;
    if (B.pendingEliminate) {
      const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answerIdx);
      elimIdx = wrong[Math.floor((B.room.seed + B.idx) % wrong.length)];
    }
    shell(`
      ${hud()}
      <div class="card rt-q">
        <div class="rt-qtype">${esc(WYQuiz.typeLabel(q.type))}</div>
        <div class="rt-stem">${esc(q.stem)}</div>
        <div class="rt-opts">
          ${q.options.map((o, i) => `<button class="rt-opt${i === elimIdx ? ' rt-opt--gone' : ''}" data-i="${i}" ${i === elimIdx ? 'disabled' : ''}>${esc(o)}</button>`).join('')}
        </div>
        <div class="rt-omen" id="rt-omen"></div>
      </div>
    `);
    root.querySelectorAll('.rt-opt').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.i))));
  }

  function answer(v) {
    if (B.locked || B.finished) return;
    B.locked = true;
    const q = B.qs[B.idx];
    const correct = v === q.answerIdx;
    const prev = B.local;
    B.local = L().resolveAnswer(prev, correct, { double: B.pendingDouble, comboBoost: B.pendingBoost });
    B.dmg += L().dealtDamage(prev, B.local);
    if (correct) B.correct += 1;
    // 標記作答
    root.querySelectorAll('.rt-opt').forEach((b, i) => {
      if (i === q.answerIdx) b.classList.add('rt-opt--right');
      else if (i === v) b.classList.add('rt-opt--wrong');
      b.disabled = true;
    });
    B.pendingDouble = false; B.pendingBoost = false; B.pendingEliminate = false;
    B.idx += 1;
    maybeOmen();
    push();
    setTimeout(() => { if (!B.finished) renderRound(); }, 850);
  }

  // 硯靈事件：第 5/10/15/20 題答完觸發，效果落在「下一題」（只影響自己）
  function maybeOmen() {
    const ev = B.script.get(B.idx);
    if (!ev) return;
    if (ev.effect === 'double') B.pendingDouble = true;
    else if (ev.effect === 'comboBoost') B.pendingBoost = true;
    else if (ev.effect === 'eliminate') B.pendingEliminate = true;
    const omen = root.querySelector('#rt-omen');
    if (omen) omen.innerHTML = `<div class="rt-yanling">🖋️ 【${esc(ev.name)}】${esc(ev.line)}</div>`;
  }

  async function push() {
    if (!B || B.finished) return;
    await api('/api/rt-room', {
      op: 'push', code: B.room.code, role: B.room.role,
      state: { dmg: B.dmg, round: B.idx, combo: B.local.combo, correct: B.correct, done: B.done ? 1 : 0 },
    });
  }

  async function pollOpp() {
    if (gone() || B.finished) return clearTimers();
    const r = await api('/api/rt-room', { op: 'poll', code: B.room.code, role: B.room.role });
    if (!r || !r.ok) return;
    if (r.opp && r.opp.state) {
      B.oppDmg = r.opp.state.dmg; B.oppDone = !!r.opp.state.done; B.oppHb = r.opp.hb;
      const hudEl = root.querySelector('.rt-hud');
      if (hudEl) hudEl.outerHTML = hud();
    }
    const verdict = L().judge({
      myHp: myHp(), oppHp: oppHp(), myDone: B.done, oppDone: B.oppDone,
      oppHbAgeMs: (r.opp && r.now && B.oppHb) ? r.now - B.oppHb : 0,
    });
    if (verdict) finish(verdict);
  }

  function waitFinish() {
    shell(`${hud()}<div class="card rt-loading">✍️ 你已答完 20 題，等待對手收筆…</div>`);
  }

  function finish(verdict) {
    if (B.finished) return;
    B.finished = true; clearTimers();
    // 賽季計分（本機＋後端）
    const s = SEASON().recordResult(SEASON().today(), verdict);
    if (verdict !== 'draw') api('/api/rt-room', { op: 'seasonAdd', nick: B.room.nick, pts: verdict === 'win' ? SEASON().WIN_PTS : SEASON().LOSE_PTS });
    const head = verdict === 'win' ? '🎉 得勝！硯靈為你添墨' : verdict === 'lose' ? '📖 惜敗，把字記牢下次贏回' : '⚖️ 平手，勢均力敵';
    const whitehat = verdict === 'lose' ? '<p class="rt-sub">科舉不倒扣——敗也記 5 分，勤能補拙。</p>' : '';
    shell(`
      <div class="card rt-result rt-result--${verdict}">
        <h2>${head}</h2>
        <div class="rt-score">答對 ${B.correct}/${B.qs.length}・總輸出 ${B.dmg}</div>
        <div class="rt-title-badge">本季 ${s.key}・${s.title}（${s.pts} 分）</div>
        ${whitehat}
        <div class="rt-result-btns">
          <button class="rt-btn rt-btn--main" id="rt-again">再來一場</button>
          <button class="rt-btn" id="rt-send-ch">📮 發戰帖（把這組題丟給同學）</button>
          <button class="rt-btn" data-back>返回擂台</button>
        </div>
        <div class="rt-err" id="rt-ch-msg"></div>
      </div>
    `);
    bindBack();
    root.querySelector('#rt-again').addEventListener('click', () => home());
    root.querySelector('#rt-send-ch').addEventListener('click', () => sendChallenge(B.room.scope, B.room.seed, B.room.nick, B.dmg));
  }

  // ---------- 非同步戰帖 ----------
  async function sendChallenge(scope, seed, nick, score) {
    const msg = root.querySelector('#rt-ch-msg');
    const r = await api('/api/rt-room', { op: 'challenge', seed, scope, nick, score });
    if (!r || !r.ok) { if (msg) msg.textContent = r ? (r.error || '發戰帖失敗') : '連不上伺服器'; return; }
    const text = `⚔️ 文戰擂台戰帖：${nick} 在同一組 20 題打出 ${score} 輸出——到「文戰擂台 → 輸戰帖碼應戰」輸入 ${r.code} 應戰！（7 天內有效）`;
    try { await navigator.clipboard.writeText(text); } catch { /* 部分瀏覽器需互動：略過 */ }
    if (msg) msg.innerHTML = `戰帖碼 <b class="rt-chcode">${r.code}</b>（已複製邀請文字）`;
  }

  function acceptScreen() {
    clearTimers();
    shell(`
      ${backBar()}
      <div class="card">
        <h3>📜 輸戰帖碼應戰</h3>
        <input class="rt-input" id="rt-ch-code" maxlength="6" placeholder="6 碼戰帖碼" style="text-transform:uppercase">
        <button class="rt-btn rt-btn--main" id="rt-do-accept">領戰帖</button>
        <div class="rt-err" id="rt-accept-err"></div>
      </div>
    `);
    bindBack();
    root.querySelector('#rt-do-accept').addEventListener('click', async () => {
      const code = (root.querySelector('#rt-ch-code').value || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) { root.querySelector('#rt-accept-err').textContent = '戰帖碼是 6 碼英數'; return; }
      if (!getNick() && !askNick(() => {})) return;
      const r = await api('/api/rt-room', { op: 'accept', code });
      if (!r) return degrade('應戰');
      if (!r.ok) { root.querySelector('#rt-accept-err').textContent = r.error || '戰帖無效'; return; }
      startChallengeRun({ code, seed: r.seed, scope: r.scope, challenger: r.challenger, chScore: r.score });
    });
  }

  // 應戰＝單機打同 seed 同題（含硯靈），打完回報比輸出
  function startChallengeRun(ch) {
    clearTimers();
    const qs = L().buildRounds(TEXTS, ch.scope, ch.seed, L().ROUNDS);
    B = {
      room: { code: ch.code, seed: ch.seed, scope: ch.scope, nick: getNick() || '無名書生', role: 'solo', challenge: ch },
      oppSnap: { nick: ch.challenger, hp: L().MAX_HP },
      qs, idx: 0, local: L().newLocalState(100000),
      dmg: 0, correct: 0, done: false, finished: false,
      oppDmg: 0, oppDone: true, oppHb: Date.now(),
      script: EV().buildScript(ch.seed, L().ROUNDS),
      pendingDouble: false, pendingBoost: false, pendingEliminate: false, locked: false,
      solo: true,
    };
    renderSolo();
  }

  function renderSolo() {
    if (gone() || B.finished) return;
    if (B.idx >= B.qs.length) return finishChallenge();
    const q = B.qs[B.idx];
    B.locked = false;
    let elimIdx = -1;
    if (B.pendingEliminate) {
      const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answerIdx);
      elimIdx = wrong[Math.floor((B.room.seed + B.idx) % wrong.length)];
    }
    shell(`
      <div class="rt-hud rt-hud--solo">
        <div class="rt-name">應戰 ${esc(B.room.nick)}　vs　${esc(B.oppSnap.nick)}（${B.room.challenge.chScore} 輸出）</div>
        <div class="rt-vs">第 ${B.idx + 1}/${B.qs.length} 題・你的輸出 ${B.dmg}</div>
      </div>
      <div class="card rt-q">
        <div class="rt-qtype">${esc(WYQuiz.typeLabel(q.type))}</div>
        <div class="rt-stem">${esc(q.stem)}</div>
        <div class="rt-opts">
          ${q.options.map((o, i) => `<button class="rt-opt${i === elimIdx ? ' rt-opt--gone' : ''}" data-i="${i}" ${i === elimIdx ? 'disabled' : ''}>${esc(o)}</button>`).join('')}
        </div>
        <div class="rt-omen" id="rt-omen"></div>
      </div>
    `);
    root.querySelectorAll('.rt-opt').forEach((b) => b.addEventListener('click', () => answerSolo(Number(b.dataset.i))));
  }

  function answerSolo(v) {
    if (B.locked) return;
    B.locked = true;
    const q = B.qs[B.idx];
    const correct = v === q.answerIdx;
    const prev = B.local;
    B.local = L().resolveAnswer(prev, correct, { double: B.pendingDouble, comboBoost: B.pendingBoost });
    B.dmg += L().dealtDamage(prev, B.local);
    if (correct) B.correct += 1;
    root.querySelectorAll('.rt-opt').forEach((b, i) => {
      if (i === q.answerIdx) b.classList.add('rt-opt--right');
      else if (i === v) b.classList.add('rt-opt--wrong');
      b.disabled = true;
    });
    B.pendingDouble = false; B.pendingBoost = false; B.pendingEliminate = false;
    B.idx += 1;
    maybeOmen();
    setTimeout(() => renderSolo(), 850);
  }

  async function finishChallenge() {
    B.finished = true;
    const ch = B.room.challenge;
    const r = await api('/api/rt-room', { op: 'challengeResult', code: ch.code, nick: B.room.nick, score: B.dmg });
    const win = B.dmg > ch.chScore;
    const verdict = B.dmg === ch.chScore ? 'draw' : (win ? 'win' : 'lose');
    const s = SEASON().recordResult(SEASON().today(), verdict);
    const head = win ? '🎉 應戰得勝！輸出更勝一籌' : verdict === 'draw' ? '⚖️ 平手' : '📖 惜敗，再磨一磨';
    shell(`
      <div class="card rt-result rt-result--${verdict}">
        <h2>${head}</h2>
        <div class="rt-score">你：${B.dmg} 輸出　vs　${esc(ch.challenger)}：${ch.chScore} 輸出</div>
        <div class="rt-title-badge">本季 ${s.key}・${s.title}（${s.pts} 分）</div>
        ${r && r.ok ? '<p class="rt-sub">成績已回報給下戰帖的同學。</p>' : '<p class="rt-sub">（成績回報未成功，但你的比分如上。）</p>'}
        <div class="rt-result-btns"><button class="rt-btn rt-btn--main" data-back>返回擂台</button></div>
      </div>
    `);
    bindBack();
  }

  // ---------- 全班文會：學生端 ----------
  function liveStudentScreen() {
    clearTimers();
    let cls = '';
    try { cls = WYStore.getClassCode() || ''; } catch { cls = ''; }
    shell(`
      ${backBar()}
      <div class="card">
        <h3>📡 全班文會（學生）</h3>
        <p class="rt-sub">老師開場後，輸入班級碼與暱稱進場，全班同題搶答。</p>
        <input class="rt-input" id="rt-live-code" maxlength="20" placeholder="班級碼" value="${esc(cls)}">
        <input class="rt-input" id="rt-live-nick" maxlength="12" placeholder="你的暱稱" value="${esc(getNick())}">
        <button class="rt-btn rt-btn--main" id="rt-live-enter">進場</button>
        <div class="rt-err" id="rt-live-err"></div>
      </div>
    `);
    bindBack();
    root.querySelector('#rt-live-enter').addEventListener('click', () => {
      const code = (root.querySelector('#rt-live-code').value || '').trim();
      const nick = (root.querySelector('#rt-live-nick').value || '').trim().slice(0, 12);
      if (!code || !nick) { root.querySelector('#rt-live-err').textContent = '班級碼與暱稱都要填'; return; }
      setNick(nick);
      liveStudentRun(code, nick);
    });
  }

  function liveStudentRun(code, nick) {
    clearTimers();
    const st = { code, nick, qs: null, seed: 0, scope: null, answeredQ: 0, score: 0, curQ: -1, locked: false };
    shell(`${backBar('離開文會')}<div class="card rt-loading">已進場，等待老師開始…</div>`);
    bindBack();
    every(3000, async () => {
      if (gone()) return clearTimers();
      const r = await api('/api/rt-live', { op: 'state', code });
      if (!r || !r.ok || !r.live) return;
      const live = r.live;
      if (!st.qs) { st.seed = live.seed; st.scope = live.scope; st.qs = L().buildRounds(TEXTS, live.scope, live.seed, live.qn); }
      if (live.phase === 'end') { clearTimers(); return liveStudentEnd(st); }
      if (live.phase === 'q' && live.qNo !== st.curQ) { st.curQ = live.qNo; st.locked = false; renderLiveQ(st); }
    });
  }

  function renderLiveQ(st) {
    const q = st.qs[st.curQ - 1];
    if (!q) { shell(`${backBar('離開文會')}<div class="card rt-loading">題目載入中…</div>`); bindBack(); return; }
    shell(`
      ${backBar('離開文會')}
      <div class="card rt-q">
        <div class="rt-qtype">全班文會・第 ${st.curQ} 題</div>
        <div class="rt-stem">${esc(q.stem)}</div>
        <div class="rt-opts">
          ${q.options.map((o, i) => `<button class="rt-opt" data-i="${i}">${esc(o)}</button>`).join('')}
        </div>
        <div class="rt-omen" id="rt-live-fb"></div>
      </div>
    `);
    bindBack();
    root.querySelectorAll('.rt-opt').forEach((b) => b.addEventListener('click', async () => {
      if (st.locked) return; st.locked = true;
      const v = Number(b.dataset.i);
      const correct = v === q.answerIdx;
      root.querySelectorAll('.rt-opt').forEach((x, i) => { if (i === q.answerIdx) x.classList.add('rt-opt--right'); else if (i === v) x.classList.add('rt-opt--wrong'); x.disabled = true; });
      if (correct) st.score += 1;
      st.answeredQ = st.curQ;
      const fb = root.querySelector('#rt-live-fb');
      if (fb) fb.textContent = correct ? '答對！等下一題…' : '答錯，等下一題…';
      await api('/api/rt-live', { op: 'answer', code: st.code, nick: st.nick, qNo: st.curQ, correct });
    }));
  }

  async function liveStudentEnd(st) {
    const r = await api('/api/rt-live', { op: 'roster', code: st.code });
    const rows = (r && r.ok) ? r.list : [];
    const board = WALL().safeBoard(rows, st.nick);
    const meLine = board.me ? `你是第 ${board.me.rank} 名・答對 ${board.me.score} 題` : `你在前五名內・答對 ${st.score} 題`;
    shell(`
      <div class="card rt-result">
        <h2>📡 文會結束</h2>
        <div class="rt-board">
          ${board.top.map((r2, i) => `<div class="rt-board-row"><span>${['🥇', '🥈', '🥉', '4', '5'][i]}</span><b>${esc(r2.nick)}</b><span>${r2.score} 題</span></div>`).join('')}
        </div>
        <div class="rt-title-badge">${meLine}</div>
        <p class="rt-sub">跟上一場的自己比就是進步。</p>
        <div class="rt-result-btns"><button class="rt-btn rt-btn--main" data-back>返回擂台</button></div>
      </div>
    `);
    bindBack();
  }

  // ---------- 全班文會：老師端 ----------
  function liveHostScreen() {
    clearTimers();
    let cls = '';
    try { cls = WYStore.getClassCode() || ''; } catch { cls = ''; }
    shell(`
      ${backBar()}
      <div class="card">
        <h3>🧑‍🏫 主持全班文會</h3>
        <input class="rt-input" id="rt-h-code" maxlength="20" placeholder="班級碼（例：五年三班）" value="${esc(cls)}">
        <input class="rt-input" id="rt-h-pin" inputmode="numeric" maxlength="8" placeholder="主持碼（4-8 位數，只你知道）">
        <div class="rt-scope-line">題數：
          <select id="rt-h-qn"><option value="5">5</option><option value="10" selected>10</option><option value="15">15</option></select>
        </div>
        ${scopePicker('rt-h-scope')}
        <button class="rt-btn rt-btn--main" id="rt-h-start">開場</button>
        <div class="rt-err" id="rt-h-err"></div>
      </div>
    `);
    bindBack();
    root.querySelector('#rt-h-start').addEventListener('click', async () => {
      const code = (root.querySelector('#rt-h-code').value || '').trim();
      const pin = (root.querySelector('#rt-h-pin').value || '').trim();
      const qn = Number(root.querySelector('#rt-h-qn').value);
      if (!code || !/^\d{4,8}$/.test(pin)) { root.querySelector('#rt-h-err').textContent = '班級碼＋4-8 位數主持碼'; return; }
      const scope = readScope();
      const r = await api('/api/rt-live', { op: 'start', code, pin, qn, scope });
      if (!r) return degrade('開場');
      if (!r.ok) { root.querySelector('#rt-h-err').textContent = r.error || '開場失敗'; return; }
      liveHostPanel({ code, pin, qn, scope });
    });
  }

  function liveHostPanel(h) {
    clearTimers();
    const draw = (phase, qNo, count) => {
      shell(`
        ${backBar('結束並離開')}
        <div class="card rt-host">
          <h3>主持中・${esc(h.code)}</h3>
          <div class="rt-code">${esc(h.code)}</div>
          <p class="rt-sub">學生在「全班文會（學生）」輸入此班級碼進場。範圍：${scopeLabel(h.scope)}</p>
          <div class="rt-host-state">階段：${phase === 'lobby' ? '大廳（尚未出題）' : phase === 'end' ? '已結束' : `第 ${qNo}/${h.qn} 題`}　已答：${count} 人</div>
          <div class="rt-result-btns">
            <button class="rt-btn rt-btn--main" id="rt-h-next" ${phase === 'end' ? 'disabled' : ''}>${phase === 'lobby' ? '出第一題' : qNo >= h.qn ? '收榜' : '下一題'}</button>
            <button class="rt-btn" id="rt-h-end" ${phase === 'end' ? 'disabled' : ''}>提前結束</button>
          </div>
          <div id="rt-h-herald"></div>
        </div>
      `);
      bindBack();
      const nx = root.querySelector('#rt-h-next');
      if (nx) nx.addEventListener('click', async () => { await api('/api/rt-live', { op: 'next', code: h.code, pin: h.pin }); });
      const en = root.querySelector('#rt-h-end');
      if (en) en.addEventListener('click', async () => { await api('/api/rt-live', { op: 'end', code: h.code, pin: h.pin }); });
    };
    draw('lobby', 0, 0);
    every(3000, async () => {
      if (gone()) return clearTimers();
      const [stR, roR] = await Promise.all([
        api('/api/rt-live', { op: 'state', code: h.code }),
        api('/api/rt-live', { op: 'roster', code: h.code }),
      ]);
      const live = stR && stR.ok ? stR.live : null;
      const rows = roR && roR.ok ? roR.list : [];
      const answered = live ? rows.filter((r) => r.qNo >= (live.qNo || 0) && live.phase === 'q').length : 0;
      if (!live) return;
      if (live.phase === 'end') {
        clearTimers();
        draw('end', live.qNo, rows.length);
        const herald = WALL().buildHerald({ label: h.code, rows });
        const board = WALL().safeBoard(rows, '__host__');
        const el = root.querySelector('#rt-h-herald');
        if (el) el.innerHTML = `
          <div class="rt-herald">${herald.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
          <div class="rt-board">${board.top.map((r2, i) => `<div class="rt-board-row"><span>${['🥇', '🥈', '🥉', '4', '5'][i]}</span><b>${esc(r2.nick)}</b><span>${r2.score} 題</span></div>`).join('')}</div>`;
      } else {
        draw(live.phase, live.qNo, answered);
      }
    });
  }

  // ---------- 科舉賽季榜 ----------
  async function seasonScreen() {
    clearTimers();
    const local = SEASON().loadSeason(SEASON().today());
    const title = SEASON().titleFor(local.pts);
    shell(`${backBar()}<div class="card rt-loading">載入賽季榜…</div>`);
    bindBack();
    const r = await api('/api/rt-room', { op: 'seasonTop' });
    const top = (r && r.ok) ? r.top : [];
    const list = top.length
      ? top.map((x, i) => `<div class="rt-board-row"><span>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span><b>${esc(x.nick)}</b><span>${x.pts} 分</span></div>`).join('')
      : '<p class="rt-sub">本季尚無上榜者，快去約戰！</p>';
    shell(`
      ${backBar()}
      <div class="card">
        <h3>🏆 科舉賽季榜　<small>${esc(r && r.ok ? r.season : local.key)}</small></h3>
        <div class="rt-title-badge">你本季：${title}（${local.pts} 分・${local.wins} 勝 / ${local.battles} 場）</div>
        <div class="rt-board">${list}</div>
        <p class="rt-sub">功名六階：童生 → 秀才 → 舉人 → 貢士 → 進士 → 狀元。每月 1 日換季，稱號重新起算；敗場不倒扣。</p>
        ${!r ? '<div class="rt-err">（連不上伺服器，僅顯示本機分數）</div>' : ''}
      </div>
    `);
    bindBack();
  }

  // ---------- 共用：降級 / 錯誤 ----------
  function degrade(what) {
    shell(`
      ${backBar()}
      <div class="card rt-degrade">
        <h3>🔌 連不上對戰伺服器</h3>
        <p>「${esc(what)}」需要連線。可能是離線、鏡像站後端未就緒，或伺服器忙碌。</p>
        <p class="rt-sub">你仍可用單機的「自測」「對戰（文豪錄）」練功；稍後再試連線對戰。</p>
      </div>
    `);
    bindBack();
  }
  function errCard(msg) {
    shell(`${backBar()}<div class="card rt-err-card"><h3>⚠️ ${esc(msg)}</h3></div>`);
    bindBack();
  }

  return { init, render };
})();
if (typeof window !== 'undefined') window.WYRt = WYRt;
