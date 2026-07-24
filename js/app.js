let TEXTS = [];
let currentTextId = null;
let currentQuiz = null;
let currentQIdx = 0;
let currentQuizType = null;
let currentQuizCombo = 0;
let currentQuizComboPeak = 0;   // 本輪連對峰值（結算卡用）
let currentQuizRound = { correct: 0, total: 0 }; // 本輪對錯統計（結算卡／全對彩蛋用）
let currentBattle = null;
let segTabPreference = 'attempt';
let pendingQuizNote = null; // 從選文詳情頁「對戰作者」但尚未解鎖時，導去自測並提示
let currentMoodFilter = null; // 心情選文篩選（今天想解什麼憂）
let currentListSort = 'difficulty'; // 首頁選文預設由易入難，可切回原編排
let pendingClassGoalAdd = 0;  // 待上報的班級集體答對數（節流批量送，減少後端請求）
let currentRoundInkStart = 0; // 本輪開始時墨錠數（結算卡算本輪賺得）
let currentQuizTag = null;    // 能力標籤專練篩選（虛詞/活用/…）
let classGoalTimer = null;
let currentRoundCompanionLevel = 0;
let weeklyDeadline = 0;
let weeklyTimerId = null;

const SHORT_ROUND = 8; // 一輪短關題數：把「整篇馬拉松」切成可重複的爽脆小關（心流閉環）
const START_TEXT_ID = 't06'; // 新手「從這篇開始」：〈詠雪〉短、輕快、好上手
const MOODS = ['焦慮', '迷惘', '想放棄', '被否定', '失去', '孤單', '憤懣', '思鄉', '怕落後', '浮躁'];

const app = document.getElementById('app');
const tabButtons = document.querySelectorAll('nav.tabs button');

// 極簡音效：純 WebAudio 合成音，不需外部音檔。答對音隨 combo 漸強（連對越高、音越亮），
// 搭配 navigator.vibrate 觸覺回饋——把每分鐘重複最多次的「答對」做出漸強爽感（juice）。
const WYSound = (() => {
  let ctx = null;
  function beep(freq, dur, type = 'sine', gainv = .15) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(gainv, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* 部分瀏覽器需使用者互動後才能建立 AudioContext，靜默失敗即可 */ }
  }
  function buzz(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* 桌機無此 API */ } }
  return {
    // combo 越高音越亮（660→封頂約 980Hz），答對同時輕震
    correct: (combo = 0) => { beep(660 + Math.min(combo, 8) * 40, .12); buzz(15); },
    wrong: () => { beep(160, .2, 'square'); buzz(60); },
    combo: (combo = 3) => { beep(1180 + Math.min(combo, 12) * 20, .16, 'sine', .18); buzz([20, 40, 20]); },
    drop: (tier = 0) => { [523, 659, 784].slice(0, tier + 1).forEach((f, i) => setTimeout(() => beep(f, .18, 'triangle', .16), i * 90)); buzz([15, 30, 15]); },
  };
})();

// 中文語音朗讀（zh-TW），供閃卡「聽讀」——文言文很需要讀出來（合成音為輔，以課堂範讀為準）
function speakZh(text) {
  try {
    if (!('speechSynthesis' in window)) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text || ''));
    u.lang = 'zh-TW'; u.rate = 0.85;
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}

// header 常駐墨錠計數器：任何得到/花費墨錠的動作後呼叫，讓玩家隨時看得到餘額＋今日賺取進度
function updateInkHud() {
  const hud = document.getElementById('ink-hud');
  const earnedAny = WYStore.getInk() > 0 || WYStore.inkToday().earned > 0;
  if (hud) {
    hud.hidden = !earnedAny;
    hud.setAttribute('aria-hidden', earnedAny ? 'false' : 'true');
  }
  const el = document.getElementById('ink-count');
  if (el) el.textContent = WYStore.getInk();
  const today = document.getElementById('ink-today');
  if (today) {
    const t = WYStore.inkToday();
    today.textContent = t.left === 0 ? '今日墨錠已滿・精通與掉寶仍會累積' : `今日 ${t.earned}/${t.cap}`;
    today.classList.toggle('ink-today-full', t.left === 0);
  }
}

// 墨錠飄字（沿用戰鬥浮字語彙，附在指定元素上；elOrSel 可為元素或選擇器，預設 header 計數器）
function floatInk(amount, elOrSel) {
  if (!amount) return;
  const anchor = typeof elOrSel === 'string' ? document.querySelector(elOrSel) : (elOrSel || document.getElementById('ink-hud'));
  if (!anchor) return;
  const f = document.createElement('span');
  f.className = 'ink-float';
  f.textContent = `+${amount} 墨`;
  anchor.appendChild(f);
  const live = document.getElementById('live-region');
  if (live) live.textContent = `答對，增加 ${amount} 墨錠，連對 ${currentQuizCombo} 次。`;
  setTimeout(() => f.remove(), 1000);
}

async function boot() {
  if (app) app.innerHTML = '<div class="card loading-card">古卷展開中…</div>';
  try {
    const res = await fetch('data/texts.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    TEXTS = await res.json();
  } catch (e) {
    // 離線／載入失敗不再整站白畫面：給明確訊息＋重試鍵（教育站常在校園弱網下開）
    if (app) app.innerHTML = '<div class="card" style="text-align:center;padding:28px;"><h3>📡 載入題庫失敗</h3><p style="color:var(--ink-dan);">可能是網路不穩或離線。請確認連線後再試一次。</p><button class="primary" id="bootRetry">重新載入</button></div>';
    const rb = document.getElementById('bootRetry');
    if (rb) rb.onclick = () => location.reload();
    return;
  }
  WYFlashcard.init(TEXTS);
  WYQuiz.init(TEXTS);
  WYWenhao.init(TEXTS);
  WYStore.touchStreak();
  WYCaotang.init(TEXTS);
  WYFusion.init(TEXTS);
  WYRt.init(TEXTS);
  WYMarket.init(TEXTS);
  updateInkHud();
  updateJianghuNav();
  updateTitleBadge();
  const reopen = document.getElementById('guide-reopen');
  if (reopen) reopen.onclick = () => {
    try { localStorage.removeItem('wy_guide_seen'); } catch { /* 隱私模式：略過 */ }
    setActiveTab('list');
    renderList();
  };
  renderTab('list');
}

// 江湖採分級揭露：進階功能只隨「真正精通篇數」解鎖，避免新手一次面對四套系統。
function updateJianghuNav() {
  const sub = document.querySelector('nav.tabs-sub');
  if (!sub) return;
  const masteredCount = WYStore.allMastered().length;
  const unlocked = {
    caotang: masteredCount >= 1,
    market: masteredCount >= 3,
    fusion: masteredCount >= 5,
    rt: masteredCount >= 5,
  };
  sub.style.display = masteredCount >= 1 ? '' : 'none';
  sub.querySelectorAll('button').forEach((b) => { b.style.display = unlocked[b.dataset.tab] ? '' : 'none'; });
}

const SYSTEM_ONBOARDING = {
  caotang: '草堂會把真正精通的篇目化成院落，讓累積的學習成果看得見。',
  market: '市集讓你用真實答對賺到的墨錠，交換喜歡的文房收藏。',
  fusion: '合契讓兩篇已精通文章相遇，解鎖專屬文魄能力。',
  rt: '擂台用真實答對與同學較量，考驗的是讀懂，而不是猜位置。',
};

function showSystemOnboarding(tab) {
  const copy = SYSTEM_ONBOARDING[tab];
  if (!copy) return;
  const key = `wy_system_intro_seen_${tab}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch { /* 隱私模式仍顯示當次導覽 */ }
  const card = document.createElement('div');
  card.className = 'card guide-card system-onboarding';
  card.setAttribute('role', 'status');
  card.textContent = copy;
  app.prepend(card);
}

// 分頁標題徽章：有到期複習題時把數字帶進 <title>，回訪者一眼看到「該回來清複習了」
// 不傳 validIds：cloze 題號為動態生成、可由 buildReviewQuiz 重建，全數計入才不漏複習
function updateTitleBadge() {
  try {
    const n = WYStore.dueCount();
    document.title = n > 0 ? `(${n}) 文言解憂站` : '文言解憂站';
  } catch { /* 略過 */ }
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
    renderTab(btn.dataset.tab);
  });
});

// 只更新導覽列高亮（供選文詳情頁的「自測這篇／對戰作者」以程式切換分頁時同步高亮）
function setActiveTab(tab) {
  tabButtons.forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

function renderTab(tab) {
  if (tab !== 'quiz' && weeklyTimerId) { clearInterval(weeklyTimerId); weeklyTimerId = null; }
  updateInkHud();
  if (tab === 'list') return renderList();
  if (tab === 'flashcard') return renderFlashcard();
  if (tab === 'quiz') return renderQuiz();
  if (tab === 'battle') return renderBattle();
  if (tab === 'wenhao') return renderWenhao();
  if (tab === 'caotang') { WYCaotang.render(app); showSystemOnboarding(tab); return; }
  if (tab === 'fusion') { WYFusion.render(app); showSystemOnboarding(tab); return; }
  if (tab === 'rt') { WYRt.render(app); showSystemOnboarding(tab); return; }
  if (tab === 'market') { WYMarket.render(app); showSystemOnboarding(tab); }
}

function renderList() {
  const answered = WYStore.typeStats().reduce((s, x) => s + x.total, 0);
  const isNew = answered === 0;
  const streak = WYStore.getStreak();
  const mile = WYStore.consumeStreakMilestone(); // 跨連續天數里程碑（7/14/30…）本次慶祝一次
  const alive = WYStore.streakAlive();
  const streakHtml = streak.days > 0
    ? `<div class="card streak-banner">${alive ? `🌿 累積學習 ${streak.days} 天${WYStore.studiedToday() ? '（今日已練 ✓，可以收筆休息）' : `　今天尚未練；仍有 ${streak.firePasses || 0} 天彈性，可安心休息`}` : `🌱 上次累積 ${streak.days} 天很棒！想回來時再接著學；最佳紀錄 ${streak.best || streak.days} 天。`}</div>`
    : '';

  let guideSeen = true;
  try { guideSeen = !!localStorage.getItem('wy_guide_seen'); } catch { /* 隱私模式：當作已看過 */ }
  const guideHtml = (guideSeen || !isNew) ? '' : `
    <div class="card guide-card" id="guideCard">
      <button class="guide-close" id="guideClose" aria-label="關閉">×</button>
      <h3>怎麼玩？三步驟</h3>
      <ol class="guide-steps">
        <li><b>讀一篇</b>：先讀原文並找證據，需要時才開注釋，最後再核對語譯。</li>
        <li><b>去「自測」練到精通</b>：${WYStore.MASTERY_RULE_TEXT}獎勵只算真實答對。</li>
        <li><b>「對戰」解鎖文豪</b>：單人闖關打文豪，精通更多篇解鎖後面的高手與「江湖」進階玩法。</li>
      </ol>
    </div>`;

  // 新手收斂：第一次來就給「從這篇開始」單一入口，砍掉全站選文等權清單的選擇癱瘓
  const startText = TEXTS.find((x) => x.id === START_TEXT_ID) || TEXTS[0];
  const beginnerIds = new Set(TEXTS.slice().sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id)).slice(0, 3).map((t) => t.id));
  const startHtml = isNew && startText ? `
    <div class="card start-card" id="startCard" role="button" tabindex="0">
      <span class="start-kicker">第一次來？就從這篇開始 ▸</span>
      <strong>《${startText.title}》</strong>　${startText.author}
      <p class="start-sub">短短幾句，先體驗一次「讀懂 → 答對 → 上手」。</p>
    </div>` : '';

  app.innerHTML =
    (mile ? `<div class="card streak-milestone">🎉 連續學習 ${mile} 天！筆耕不輟，文氣日長。</div>` : '') +
    streakHtml + guideHtml + startHtml +
    (isNew ? '' : renderRenownBar()) +
    (isNew ? '' : renderHomeStatus()) +
    renderWeeklyCard() +
    '<div id="classGoalSlot"></div>' +
    (isNew ? '' : renderMoodPicker()) +
    renderDashboard(answered) +
    `<div class="list-tools"><label for="textSort">選文排序</label><select id="textSort"><option value="difficulty"${currentListSort === 'difficulty' ? ' selected' : ''}>由易到難</option><option value="original"${currentListSort === 'original' ? ' selected' : ''}>課程原順序</option></select></div>` +
    (isNew ? '<p class="list-heading">或自己挑一篇：</p>' : '') +
    TEXTS.filter(moodMatch).sort((a, b) => currentListSort === 'difficulty' ? a.difficulty - b.difficulty || a.id.localeCompare(b.id) : a.id.localeCompare(b.id)).map((t) => {
      const ratio = Math.round(WYStore.masteryRatio(t.id) * 100);
      const st = WYStore.getTextState(t.id);
      const nudge = (!st.mastered && st.total >= 3) ? masteryNudge(st) : '';
      return `
      <div class="card text-list-item" data-id="${t.id}" role="button" tabindex="0">
        <div>
          <strong>${t.title}</strong>　${t.author}
          <div style="font-size:.8rem;color:var(--ink-dan);">${t.era}·${t.genre}・難度 ${t.difficulty}/5${beginnerIds.has(t.id) ? '・新手先讀' : ''}</div>
        </div>
        <span class="badge-group"><span class="badge-level">${t.level === 'J' ? '國中' : '高中'}</span>${nudge || `<span class="badge-pct">${ratio}%</span>`}</span>
      </div>`;
    }).join('');

  const gc = document.getElementById('guideClose');
  if (gc) gc.onclick = () => {
    try { localStorage.setItem('wy_guide_seen', '1'); } catch { /* 隱私模式：略過 */ }
    const card = document.getElementById('guideCard');
    if (card) card.remove();
  };
  const sc = document.getElementById('startCard');
  if (sc) {
    const go = () => { currentTextId = startText.id; renderTextDetail(startText); };
    sc.addEventListener('click', go);
    sc.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  bindHomeStatus();
  bindMoodPicker();
  bindDashboardBackup();
  const sort = document.getElementById('textSort');
  if (sort) sort.onchange = () => { currentListSort = sort.value; renderList(); };
  app.querySelectorAll('.text-list-item').forEach((el) => {
    const open = () => {
      currentTextId = el.dataset.id;
      renderTextDetail(TEXTS.find((x) => x.id === currentTextId));
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  loadClassGoal(); // 班級文氣進度條（非同步，若有班級碼）
}

function renderWeeklyCard() {
  const key = WYQuiz.isoWeekKey(new Date());
  const best = WYStore.weeklyResult(key);
  return `<button class="card weekly-card" data-act="weekly" aria-label="開始 ${key} 週經典賽">
    <span><b>本週經典賽・${key}</b><small>20 篇 × 四題型，每週固定一卷，可重複挑戰刷高分</small></span>
    <strong>${best.attempts ? `最高 ${best.best}/${best.total}` : '開始挑戰'}</strong>
  </button>`;
}

function startWeeklyQuiz() {
  currentQuiz = WYQuiz.buildWeeklyQuiz({ date: new Date(), n: 20 });
  currentQuizType = '__weekly__';
  weeklyDeadline = Date.now() + 10 * 60 * 1000;
  if (weeklyTimerId) clearInterval(weeklyTimerId);
  weeklyTimerId = setInterval(updateWeeklyTimer, 1000);
  _resetRound();
  setActiveTab('quiz');
  drawQuiz();
}

function updateWeeklyTimer() {
  if (!currentQuiz || currentQuiz.mode !== 'weekly') return;
  const left = Math.max(0, Math.ceil((weeklyDeadline - Date.now()) / 1000));
  const el = document.getElementById('weeklyTimer');
  if (el) el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (left > 0) return;
  clearInterval(weeklyTimerId); weeklyTimerId = null;
  currentQIdx = currentQuiz.questions.length;
  drawQuiz();
}

// 「就差 N 題精通」nudge：把最關鍵的「再進這篇」決策點放在選文清單卡上（不只藏在自測內）
function masteryNudge(st) {
  const need = [];
  const types = st.types || {};
  ['char', 'sentence', 'gist', 'theme'].forEach((ty) => {
    const got = types[ty]?.correct || 0;
    if (got < 2) need.push(TYPE_LABEL[ty]);
  });
  const ratioGap = st.total < 10 ? (10 - st.total) : 0;
  if (need.length) return `<span class="badge-nudge">還差：${need.join('·')}</span>`;
  if (st.correct / st.total < 0.8) return `<span class="badge-nudge">答對率再拚一下</span>`;
  if (ratioGap) return `<span class="badge-nudge">就差 ${ratioGap} 題</span>`;
  return '';
}

// 首頁只給一個可完成的下一步：避免同時丟出續玩、複習、錯題等多張卡造成選擇負擔。
function renderHomeStatus() {
  const action = WYStore.nextAction(TEXTS);
  const icon = { wrong: '✍️', retention: '🧭', due: '📖', start: '▶', continue: '▶', rest: '🌿' }[action.kind] || '▶';
  const actionCard = action.kind === 'rest'
    ? `<div class="home-status home-next home-rest">
        <span class="hs-icon">${icon}</span><span class="hs-text"><small>今日五分鐘</small><b>今日已完成，收筆休息</b><small>${action.reason}・全站共 ${TEXTS.length} 篇</small></span>
      </div>`
    : `<button class="home-status home-next" data-act="${action.kind}" data-id="${action.textId || ''}">
        <span class="hs-icon">${icon}</span><span class="hs-text"><small>今日五分鐘・${action.count} 題</small><b>${action.title}</b><small>${action.reason}</small></span>
      </button>`;
  const cards = [actionCard];
  if (!WYStore.getClassCode()) cards.push(`<div class="home-status class-join-card"><span class="hs-icon">🏫</span><span class="hs-text"><b>輸入班級碼加入本班</b><small>老師有給 4–8 碼英數代碼嗎？一起衝文氣。</small></span><input id="homeClassCode" maxlength="8" aria-label="班級碼"><button class="primary" id="homeClassJoin">加入</button></div>`);
  return `<div class="home-status-wrap">${cards.join('')}</div>`;
}

function bindHomeStatus() {
  app.querySelectorAll('.home-status, .weekly-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'start' || act === 'continue') { currentTextId = btn.dataset.id; currentQuizType = null; setActiveTab('quiz'); renderQuiz(); }
      else if (act === 'caotang') { setActiveTab('caotang'); WYCaotang.render(app); }
      else if (act === 'retention') startRetentionQuiz(btn.dataset.id);
      else if (act === 'due') startReviewQuiz(WYStore.dueItems().slice(0, 8).map((x) => x.qId), '今日複習');
      else if (act === 'wrong') startReviewQuiz(WYStore.wrongItems().slice(0, 8), '錯題修補');
      else if (act === 'weekly') startWeeklyQuiz();
    });
  });
  const join = document.getElementById('homeClassJoin');
  if (join) join.onclick = () => {
    const code = WYStore.setClassCode(document.getElementById('homeClassCode').value);
    if (!code) { document.getElementById('homeClassCode').setCustomValidity('請輸入 4–8 碼英數'); document.getElementById('homeClassCode').reportValidity(); return; }
    renderList();
  };
}

// 文名段位主軸：把六個各自為政的養成系統收斂成一條「我到哪了」的上升線
function renderRenownBar() {
  const r = WYRenown.rank(TEXTS.length);
  const nick = WYRenown.nickname();
  return `
    <div class="card renown-bar">
      <div class="renown-top"><span class="renown-name">📜 文名：${r.name}${nick ? `　<small>道號「${nick}」</small>` : ''}</span>
        <span class="renown-tier">第 ${r.tier}/${r.maxTier} 階</span></div>
      <div class="renown-track"><span class="renown-fill" style="width:${r.pct}%"></span></div>
      <div class="renown-foot">${r.next ? `距「${r.next}」還差 ${r.toNext} 文名（每精通一篇 +100）` : '已臻文宗之境，滿級！'}</div>
    </div>`;
}

// 心情選文（今天想解什麼憂）：從玩家當下出發推薦篇目，把站名「解憂」的承諾變成按得下去的動作
function renderMoodPicker() {
  const chips = MOODS.map((m) => `<button class="mood-chip ${currentMoodFilter === m ? 'active' : ''}" data-mood="${m}">${m}</button>`).join('');
  const hint = currentMoodFilter
    ? `<p class="mood-hint">為「${currentMoodFilter}」的你選了這幾篇，也許正好 ▾　<button class="mood-clear" id="moodClear">看全部</button></p>`
    : '';
  return `<div class="card mood-picker"><p class="mood-title">今天想解什麼憂？</p><div class="mood-chips">${chips}</div>${hint}</div>`;
}
function moodMatch(t) {
  if (!currentMoodFilter) return true;
  return Array.isArray(t.moods) && t.moods.includes(currentMoodFilter);
}
function bindMoodPicker() {
  app.querySelectorAll('.mood-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMoodFilter = currentMoodFilter === btn.dataset.mood ? null : btn.dataset.mood;
      renderList();
    });
  });
  const clr = document.getElementById('moodClear');
  if (clr) clr.onclick = () => { currentMoodFilter = null; renderList(); };
}

// 班級文氣進度條（⑭b）：全班本週累計答對，唯一同時黏前段＋後段的白帽機制（不做班際排行）
async function loadClassGoal() {
  const slot = document.getElementById('classGoalSlot');
  const code = WYStore.getClassCode();
  if (!slot || !code) return;
  const r = await WYAPI.call('/api/rt-live', { body: { op: 'goalState', code } });
  if (!r || !r.ok) return;
  const count = r.count || 0;
  const TARGET = r.target || 100;
  const pct = Math.min(100, Math.round(count / TARGET * 100));
  slot.innerHTML = `
    <div class="card class-goal">
      <p class="cg-title">🏮 本班文氣　<small>${code}・本週</small></p>
      <div class="cg-track"><span class="cg-fill" style="width:${pct}%"></span></div>
      <p class="cg-foot">全班本週已答對 <b>${count}</b> / ${TARGET} 題${count >= TARGET ? '——文氣沖霄，達標！限定掛軸需以各自真實答對領取。' : '，每個人的每一題都在推進'}　累計達標 ${r.achievedWeeks || 0} 週</p>
    </div>`;
}

const SEG_TABS = [
  { key: 'attempt', label: '先自己讀' },
  { key: 'glossary', label: '字詞注釋' },
  { key: 'translation', label: '白話語譯' },
  { key: 'note', label: '賞析' },
];

// 全站共用的文言文閱讀四步法（每篇詳情頁都出現，練熟能遷移到沒讀過的古文）。
const READING_STEPS = [
  ['斷句定調', '先看標題、作者、文體，猜這篇要說什麼'],
  ['抓虛詞與句式', '之乎者也、判斷句／倒裝，定準句義'],
  ['逐段抓主語與動作', '誰做了什麼、時間與空間怎麼移動'],
  ['收束問主旨', '作者的立場、情感或勸勉是什麼'],
];

// 「怎麼讀這一篇」策略卡：通用四步法 + 該篇客製切入點（t.readingStrategy）。
function readingStrategyHtml(t) {
  const focus = Array.isArray(t.readingStrategy) ? t.readingStrategy : [];
  return `
    <details class="card strategy-card">
      <summary class="strategy-summary">📖 怎麼讀這一篇？<span class="strategy-hint">閱讀理解策略・點開展開</span></summary>
      <div class="strategy-body">
        <p class="strategy-sub">通用四步法（每篇都適用，練熟就能帶著走）</p>
        <ol class="strategy-steps">
          ${READING_STEPS.map(([h, d]) => `<li><b>${h}</b>：${d}</li>`).join('')}
        </ol>
        ${focus.length ? `
        <p class="strategy-sub">這一篇特別注意</p>
        <ul class="strategy-focus">
          ${focus.map((s) => `<li>${s}</li>`).join('')}
        </ul>` : ''}
      </div>
    </details>`;
}

const TYPE_LABEL = { char: '字義', sentence: '句義', gist: '段旨', theme: '篇章文意' };

// 學習儀表板：逐題型正確率＋精通篇數，讓學生看到弱點、家長/老師看得懂學了什麼（教育專家審查要求）
function renderDashboard(answeredArg) {
  const stats = WYStore.typeStats();
  const answered = answeredArg != null ? answeredArg : stats.reduce((s, x) => s + x.total, 0);
  const masteredCount = WYStore.allMastered().length;
  const durableCount = WYStore.allDurableMastered().length;
  const corrections = WYStore.correctionStats();
  if (answered === 0) return ''; // 還沒作答就不佔版面
  const weakest = stats.filter((x) => x.total >= 3).sort((a, b) => a.ratio - b.ratio)[0];
  const bars = stats.map((x) => {
    const pct = x.total ? Math.round(x.ratio * 100) : 0;
    const cls = x.total < 3 ? 'dash-na' : x.ratio >= 0.8 ? 'dash-good' : x.ratio >= 0.6 ? 'dash-mid' : 'dash-low';
    return `<div class="dash-row">
      <span class="dash-type">${TYPE_LABEL[x.type]}</span>
      <span class="dash-track"><span class="dash-fill ${cls}" style="width:${pct}%"></span></span>
      <span class="dash-num">${x.total ? pct + '%' : '—'}<small>（${x.correct}/${x.total}）</small></span>
    </div>`;
  }).join('');
  // 弱點建議常駐在儀表板卡頂（不再收合），回訪者迎面第一眼就看到「該補哪一塊」
  const weakLine = weakest && weakest.ratio < 0.8
    ? `<p class="dash-advice">💡 目前「${TYPE_LABEL[weakest.type]}」較弱（${Math.round(weakest.ratio * 100)}%），到「自測」切到該題型多練幾題。</p>`
    : (answered >= 8 ? '<p class="dash-advice">👍 各題型都在水準上，繼續保持！</p>' : '');
  return `
    <details class="card dash-card" open>
      <summary>📊 我的學習儀表板　<small>本次達標 ${masteredCount}/${TEXTS.length} 篇・穩固精通 ${durableCount}/${TEXTS.length} 篇・答題 ${answered} 次・錯題精通率 ${corrections.seen ? Math.round(corrections.ratio * 100) + '%' : '尚無錯題'}</small></summary>
      <div class="dash-body">
        ${weakLine}
        ${bars}
        <details class="dash-parent">
          <summary>給家長／老師看</summary>
          <p>孩子在做的是「文言文閱讀理解」四種能力的練習：<b>字義</b>、<b>句義</b>、<b>段旨</b>與<b>篇章文意</b>。${WYStore.MASTERY_RULE_TEXT}獎勵全部要真的答對才拿得到，且每日墨錠有上限。</p>
          <p>學習進度、墨錠與精通紀錄只存在本機；進入擂台、文會或科舉榜時，暱稱、裝置識別與分數會送到伺服器並顯示於排行榜。請勿使用真實姓名；即時房間資料約兩小時到期。</p>
        </details>
        <details class="dash-parent">
          <summary>備份 / 還原存檔</summary>
          <p class="dash-backup-note">本機學習進度清快取或換裝置會消失。匯入採保守合併，精通會依真實統計重算，文魄與市集道具不會由備份憑空授予。</p>
          <div class="dash-backup-btns">
            <button class="primary" id="dashExport">匯出存檔</button>
            <button class="primary" id="dashImport">還原存檔</button>
          </div>
          <textarea id="dashBackupBox" class="dash-backup-box" placeholder="按「匯出存檔」會在此產生備份文字；還原時把備份貼進來再按「還原存檔」。" spellcheck="false"></textarea>
        </details>
      </div>
    </details>`;
}

function bindDashboardBackup() {
  const ex = document.getElementById('dashExport');
  const im = document.getElementById('dashImport');
  const box = document.getElementById('dashBackupBox');
  if (ex) ex.onclick = () => { box.value = WYStore.exportAll(); box.select(); try { document.execCommand('copy'); } catch { /* 略 */ } ex.textContent = '已匯出（已複製）'; setTimeout(() => { ex.textContent = '匯出存檔'; }, 2000); };
  if (im) im.onclick = () => {
    const n = WYStore.importAll(box.value.trim());
    if (n < 0) { im.textContent = '格式不符'; setTimeout(() => { im.textContent = '還原存檔'; }, 2000); return; }
    im.textContent = `已還原 ${n} 項，重新整理中…`;
    setTimeout(() => location.reload(), 800);
  };
}

function renderTextDetail(t) {
  const worryHtml = t.worry ? `
    <div class="card worry-card">
      <p class="worry-label">此篇之憂</p>
      <p class="worry-ancient">${t.worry}</p>
      ${worryEchoHtml(t)}
    </div>` : '';
  app.innerHTML = `
    <div class="card">
      <button class="link-back" id="backToList">◂ 返回選文</button>
      <h2>${t.title}</h2>
      <p style="color:var(--ink-dan)">${t.author}·${t.era}</p>
    </div>
    ${worryHtml}
    ${readingStrategyHtml(t)}
    ${t.segments.map((seg, i) => `
      <div class="card segment-block">
        <div class="passage segment-original">${seg.text}</div>
        <div class="seg-tabs" data-seg="${i}">
          ${SEG_TABS.map((tab) => `<button class="seg-tab-btn ${tab.key === segTabPreference ? 'active' : ''}" data-tab="${tab.key}">${tab.label}</button>`).join('')}
        </div>
        <div class="seg-tab-content" data-seg="${i}">${renderSegTabContent(seg, segTabPreference)}</div>
      </div>`).join('')}
    <div class="card detail-cta">
      <p class="detail-cta-hint">讀完了？直接針對這一篇接續練功：</p>
      <div class="detail-cta-btns">
        <button class="primary" id="quizThis">📝 自測這篇</button>
        <button class="primary" id="battleThis">⚔️ 對戰${t.author}</button>
      </div>
    </div>`;
  document.getElementById('backToList').onclick = renderList;
  document.getElementById('quizThis').onclick = () => {
    currentTextId = t.id;
    currentQuizType = null;
    pendingQuizNote = null;
    setActiveTab('quiz');
    renderQuiz();
  };
  document.getElementById('battleThis').onclick = () => { setActiveTab('battle'); startBattleForText(t.id); };
  app.querySelectorAll('.seg-tabs').forEach((tabsEl) => {
    const segIdx = tabsEl.dataset.seg;
    const contentEl = app.querySelector(`.seg-tab-content[data-seg="${segIdx}"]`);
    tabsEl.querySelectorAll('.seg-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        segTabPreference = btn.dataset.tab;
        app.querySelectorAll('.seg-tabs').forEach((otherTabs) => {
          otherTabs.querySelectorAll('.seg-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === segTabPreference));
        });
        app.querySelectorAll('.seg-tab-content').forEach((el) => {
          el.innerHTML = renderSegTabContent(t.segments[el.dataset.seg], segTabPreference);
        });
      });
    });
  });
}

function worryEchoHtml(t) {
  if (!t || !t.worryEcho || !currentMoodFilter || !Array.isArray(t.moods) || !t.moods.includes(currentMoodFilter)) return '';
  return `<p class="worry-echo">🫧 硯靈低語：你帶著「${currentMoodFilter}」來讀這篇，也許正因為……${t.worryEcho}</p>`;
}

function renderSegTabContent(seg, tabKey) {
  if (tabKey === 'attempt') {
    return `<div class="seg-attempt">
      <strong>先讀後揭</strong>
      <p>先找出「誰、做了什麼、語氣在哪裡轉折」，先用自己的話說一句。需要時才開字詞注釋，最後再核對白話語譯。</p>
    </div>`;
  }
  if (tabKey === 'translation') {
    return `<p class="seg-translation">${seg.translation || '（尚無語譯）'}</p>`;
  }
  if (tabKey === 'glossary') {
    if (!seg.glossary || !seg.glossary.length) return '<p>（尚無字詞注釋）</p>';
    return `<ul class="glossary-list">${seg.glossary.map((g) => `<li><strong>${g.word}</strong>：${g.gloss}</li>`).join('')}</ul>`;
  }
  if (tabKey === 'note') {
    return `<p class="seg-note">${seg.note || '（尚無賞析）'}</p>`;
  }
  return '';
}

let flashcardFlipped = false;

function renderFlashcard() {
  if (!currentTextId) currentTextId = START_TEXT_ID;
  WYFlashcard.buildQueue(currentTextId);
  flashcardFlipped = false;
  drawFlashcard();
}

function drawFlashcard() {
  const card = WYFlashcard.current();
  const p = WYFlashcard.progress();
  if (!card) {
    app.innerHTML = p.finished
      ? `<div class="card settle-card"><h3>這疊閃卡完成！</h3><p>本疊 ${p.total} 張已複習。</p><div class="settle-btns"><button class="primary" id="fcQuiz">去自測</button><button id="fcHome">回選文</button></div></div>`
      : '<div class="card">請先在「選文」挑一篇文章</div>';
    const quiz = document.getElementById('fcQuiz'); if (quiz) quiz.onclick = () => { setActiveTab('quiz'); renderQuiz(); };
    const home = document.getElementById('fcHome'); if (home) home.onclick = () => { setActiveTab('list'); renderList(); };
    return;
  }
  const transHtml = card.translation
    ? `<p class="hint-label">白話語譯</p><p class="fc-translation">${card.translation}</p>`
    : '';
  app.innerHTML = `
    <div class="card">
      <div class="badge">${p.idx}/${p.total}</div>
      <div class="flashcard ${flashcardFlipped ? 'flipped' : ''}" id="flashcardEl" role="button" tabindex="0" aria-label="翻面卡片">
        <div class="flashcard-inner">
          <div class="flashcard-face flashcard-front">
            <p class="passage">${card.front}</p>
            ${'speechSynthesis' in window ? '<button class="fc-tts" id="ttsBtn" aria-label="朗讀原文" title="朗讀原文">🔊 朗讀</button>' : ''}
            <span class="flip-hint">先在心裡白話一遍，再點卡片對照 ▸</span>
          </div>
          <div class="flashcard-face flashcard-back">
            ${transHtml}
            <p class="hint-label">段旨賞析</p>
            <p>${card.back}</p>
            <span class="flip-hint">點卡片翻回原文 ▸</span>
          </div>
        </div>
      </div>
      <div class="fc-srs ${flashcardFlipped ? 'show' : ''}" id="fcSrs">
        <p class="fc-srs-q">剛剛自己譯的，跟答案差多少？</p>
        <div class="fc-srs-btns">
          <button class="se-btn" data-g="again">又忘了</button>
          <button class="se-btn" data-g="hard">有印象</button>
          <button class="se-btn" data-g="good">很熟</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="primary" id="prevBtn">上一張</button>
        <button class="primary" id="nextBtn">下一張</button>
      </div>
    </div>`;
  // 翻面只切 class（觸發 CSS 3D flip 動畫）＋顯示自評列，不整頁重建，否則動畫永遠不播。
  const flipCard = () => {
    flashcardFlipped = !flashcardFlipped;
    document.getElementById('flashcardEl').classList.toggle('flipped', flashcardFlipped);
    const s = document.getElementById('fcSrs');
    if (s) s.classList.toggle('show', flashcardFlipped);
  };
  document.getElementById('flashcardEl').onclick = (e) => { if (e.target.closest('.fc-tts')) return; flipCard(); };
  document.getElementById('flashcardEl').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(); } });
  const tts = document.getElementById('ttsBtn');
  if (tts) tts.onclick = (e) => { e.stopPropagation(); speakZh(card.front); };
  const srs = document.getElementById('fcSrs');
  if (srs) srs.querySelectorAll('.se-btn').forEach((btn) => {
    btn.onclick = () => {
      // 自評答案 → SM-2 排程（qId=fc-<textId>-<segNo>）：grade 必須是 again/hard/good 字串，
      // 否則 _recordItemInto 的 grade 比對會把「又忘了」誤當「很熟」（數字永遠落 good 分支）。
      const g = btn.dataset.g;
      WYStore.recordItem(card.qId, g, card.textId);
      if (g === 'again') { WYSound.wrong(); const live = document.getElementById('live-region'); if (live) live.textContent = '收進今天要再看一次。'; }
      else if (g === 'hard') WYSound.combo(1);
      else WYSound.correct();
      flashcardFlipped = false;
      WYFlashcard.next();
      drawFlashcard();
    };
  });
  document.getElementById('prevBtn').onclick = () => { flashcardFlipped = false; WYFlashcard.prev(); drawFlashcard(); };
  document.getElementById('nextBtn').onclick = () => { flashcardFlipped = false; WYFlashcard.next(); drawFlashcard(); };
}

const QUIZ_TYPES = [
  { key: null, label: '混合' },
  { key: 'char', label: '字義' },
  { key: 'sentence', label: '句義' },
  { key: 'gist', label: '段旨' },
  { key: 'theme', label: '篇章文意' },
  { key: 'cloze', label: '填空' },
];

const TAG_LIST = ['虛詞', '活用', '古今異義', '通假', '句式'];

const COMPANION_TITLES = ['初醒', '識墨', '聽雨', '讀心', '解憂', '知言', '含章', '照夜', '澄懷', '通微', '硯心'];
function companionHtml() {
  const level = WYStore.companionLevel();
  const artLevel = Math.min(5, level);
  const title = COMPANION_TITLES[level] || COMPANION_TITLES.at(-1);
  return `<div class="yanling-companion yanling-lv-${level} ${level >= 6 ? 'yanling-golden' : ''}" aria-label="硯靈等級 ${level}，雅稱 ${title}"><img class="yanling-art" src="assets/companion/yanling-lv${artLevel}.webp" alt="硯靈 Lv.${level} ${title}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🖋️'}))"><small>Lv.${level}・${title}</small></div>`;
}

function _resetRound() {
  currentQIdx = 0;
  currentQuizCombo = 0;
  currentQuizComboPeak = 0;
  currentQuizRound = { correct: 0, total: 0 };
  currentRoundInkStart = WYStore.getInk();
  currentRoundCompanionLevel = WYStore.companionLevel();
}

function renderQuiz() {
  if (weeklyTimerId) { clearInterval(weeklyTimerId); weeklyTimerId = null; }
  if (String(currentQuizType || '').startsWith('__')) currentQuizType = null; // 從跨篇卷退出後回正常自測
  if (!currentTextId) currentTextId = START_TEXT_ID;
  currentQuiz = currentQuizType === 'cloze'
    ? WYQuiz.buildClozeQuiz(currentTextId, { n: SHORT_ROUND })
    : WYQuiz.buildQuiz(currentTextId, { type: currentQuizType, tag: currentQuizTag, n: SHORT_ROUND, ramp: currentQuizType === null && !currentQuizTag });
  _resetRound();
  drawQuiz();
}

// SRS 到期複習／錯題本：用一組 qId 重建跨篇複習卷（②）
function startReviewQuiz(qIds, title) {
  if (!qIds || !qIds.length) { setActiveTab('list'); renderList(); return; }
  currentQuiz = WYQuiz.buildReviewQuiz(qIds, { title, n: 10 });
  if (!currentQuiz.questions.length) {
    WYStore.removeItems(qIds);
    app.innerHTML = '<div class="card"><h3>這批複習題已失效或已清空</h3><p>先去自測練新題吧。</p><button class="primary" id="reviewHome">回選文</button></div>';
    document.getElementById('reviewHome').onclick = () => { setActiveTab('list'); renderList(); };
    return;
  }
  currentQuizType = '__review__';
  _resetRound();
  setActiveTab('quiz');
  drawQuiz();
}

function startRetentionQuiz(textId) {
  const text = TEXTS.find((t) => t.id === textId);
  if (!text) { setActiveTab('list'); renderList(); return; }
  currentQuiz = WYQuiz.buildQuiz(textId, { n: SHORT_ROUND, ramp: true, seed: Date.now() });
  currentQuiz.mode = 'retention';
  currentQuiz.title = `七日驗證：《${text.title}》`;
  currentQuizType = '__retention__';
  _resetRound();
  setActiveTab('quiz');
  drawQuiz();
}

function _qTextId(q) { return q.textId || currentQuiz.textId; }

function confidencePickerHtml() {
  return `<div class="confidence-picker" aria-label="作答信心">
    <span>作答前先估：</span>
    <button type="button" data-confidence="low" aria-pressed="false">沒把握</button>
    <button type="button" data-confidence="medium" aria-pressed="true">有點把握</button>
    <button type="button" data-confidence="high" aria-pressed="false">很有把握</button>
  </div>`;
}

function bindConfidencePicker(root = app) {
  root.querySelectorAll('[data-confidence]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelectorAll('[data-confidence]').forEach((other) => other.setAttribute('aria-pressed', other === button ? 'true' : 'false'));
    });
  });
}

function selectedConfidence(root = app) {
  return root.querySelector('[data-confidence][aria-pressed="true"]')?.dataset.confidence || 'medium';
}

// 本輪結算卡（①）：把「馬拉松」切成可重複的爽脆小關——結束即結算＋一鍵再來，收尾不再是死路
function quizSettlementHtml() {
  const { correct, total } = currentQuizRound;
  const inkGain = Math.max(0, WYStore.getInk() - currentRoundInkStart);
  const perfect = total > 0 && correct === total;
  const isReview = currentQuiz.mode === 'review';
  const isWeekly = currentQuiz.mode === 'weekly';
  const isRetention = currentQuiz.mode === 'retention';
  const tId = currentQuiz.textId;
  const st = tId ? WYStore.getTextState(tId) : null;
  let masteryLine = '';
  if (isRetention && currentQuiz._retentionResult) {
    masteryLine = currentQuiz._retentionResult.passed
      ? '<p class="settle-mastery">✅ 七日後仍讀得懂，這篇已成為「穩固精通」。</p>'
      : '<p class="settle-mastery">🌱 這次還不穩，明天會安排一輪短複習；本次達標與既有獎勵都不會被拿走。</p>';
  } else if (st && !isReview) {
    if (st.mastered) {
      const t = TEXTS.find((x) => x.id === tId);
      masteryLine = `<p class="settle-mastery">🫧 硯靈低語：你聽懂了${t ? `「${t.worry}」` : '這位古人的憂'}。</p>`;
    }
    else {
      const nudge = masteryNudge(st).replace(/<[^>]+>/g, '');
      masteryLine = `<p class="settle-mastery">距精通：${nudge || '再拚一下答對率'}</p>`;
    }
  }
  const due = WYStore.dueCount();
  const btns = [`<button class="primary settle-again" id="settleAgain">🔁 再來一輪</button>`];
  if (tId && !isReview && !isWeekly && !isRetention) btns.push(`<button class="primary settle-battle" id="settleBattle">⚔️ 去對戰作者</button>`);
  if (due > 0) btns.push(`<button class="primary settle-review" id="settleReview">📖 複習到期 ${due} 題</button>`);
  btns.push(`<button class="link-back" id="settleHome">回選文</button>`);
  const milestone = WYStore.peekStreakMilestone();
  const companionNow = WYStore.companionLevel();
  const companionLine = companionNow > currentRoundCompanionLevel ? `<p class="settle-companion">🖋️ 硯靈升到 Lv.${companionNow}！</p>` : `<p class="settle-companion">🖋️ 硯靈 Lv.${companionNow}</p>`;
  const moodLine = currentMoodFilter && tId ? `<p class="settle-mood">你今天帶著「${currentMoodFilter}」而來，也已陪自己讀完這一輪——憂還在，但你已往前一步。</p>` : '';
  return `
    <div class="card settle-card ${perfect ? 'settle-perfect' : ''}">
      ${milestone ? `<div class="streak-milestone">🎉 連續學習 ${milestone} 天達成！</div>` : ''}
      ${perfect ? '<div class="settle-perfect-badge">✨ 全對！筆下生花 ✨</div>' : ''}
      <h3>本輪完成！</h3>
      <div class="settle-stats">
        <span class="settle-stat"><b>${correct}/${total}</b><small>本輪答對</small></span>
        <span class="settle-stat"><b>x${currentQuizComboPeak}</b><small>連對峰值</small></span>
        <span class="settle-stat"><b>+${inkGain}</b><small>墨錠</small></span>
      </div>
      ${masteryLine}
      ${companionLine}${moodLine}
      <div class="settle-btns">${btns.join('')}</div>
    </div>`;
}

function bindSettlement() {
  const perfect = currentQuizRound.total > 0 && currentQuizRound.correct === currentQuizRound.total;
  perfect ? WYSound.drop(2) : WYSound.combo(Math.max(2, currentQuizComboPeak));
  document.querySelectorAll('.settle-stat b').forEach((el) => {
    const finalText = el.textContent; el.dataset.final = finalText; el.classList.add('count-up');
  });
  if (WYStore.peekStreakMilestone()) WYStore.consumeStreakMilestone();
  if (currentQuiz.mode === 'weekly' && !currentQuiz._resultSaved) {
    if (weeklyTimerId) { clearInterval(weeklyTimerId); weeklyTimerId = null; }
    WYStore.recordWeeklyResult(currentQuiz.weekKey, currentQuizRound.correct, currentQuizRound.total);
    currentQuiz._resultSaved = true;
  }
  const again = document.getElementById('settleAgain');
  if (again) again.onclick = () => {
    if (currentQuiz.mode === 'review' || currentQuiz.mode === 'retention') { setActiveTab('list'); renderList(); return; }
    if (currentQuiz.mode === 'weekly') { startWeeklyQuiz(); return; }
    renderQuiz();
  };
  const battle = document.getElementById('settleBattle');
  if (battle) battle.onclick = () => { setActiveTab('battle'); startBattleForText(currentQuiz.textId); };
  const review = document.getElementById('settleReview');
  if (review) review.onclick = () => startReviewQuiz(WYStore.dueItems().map((x) => x.qId), '今日複習');
  const home = document.getElementById('settleHome');
  if (home) home.onclick = () => { setActiveTab('list'); renderList(); };
}

function drawQuiz() {
  const noteHtml = pendingQuizNote ? `<div class="card quiz-note">💡 ${pendingQuizNote}</div>` : '';
  pendingQuizNote = null; // 只提示一次
  const isReview = currentQuiz.mode === 'review';
  const isWeekly = currentQuiz.mode === 'weekly';
  const isRetention = currentQuiz.mode === 'retention';
  // 複習模式：只顯示標題＋離開，不顯示題型/標籤切換（跨篇混合）
  const headerHtml = isReview || isRetention
    ? noteHtml + `<div class="card"><p class="quiz-focus">📖 ${currentQuiz.title}（${isRetention ? '七日後驗證' : '跨篇複習'}）　<button class="link-back" id="quizPickOther">結束複習</button></p></div>`
    : isWeekly
      ? noteHtml + `<div class="card"><p class="quiz-focus">🏮 ${currentQuiz.title}（20 篇跨篇限時卷）　倒數 <strong id="weeklyTimer">10:00</strong>　<button class="link-back" id="quizPickOther">離開週賽</button></p><p class="weekly-note">同一週題目固定；成績只計真實答對，可重複挑戰最高分。</p></div>`
    : noteHtml + `
    <div class="card">
      <p class="quiz-focus">📖 自測：《${currentQuiz.title}》　<button class="link-back" id="quizPickOther">換一篇</button></p>
      <p style="font-size:.8rem;color:var(--ink-dan);margin:0 0 6px;">練習題型（精通需四題型都練過）</p>
      <div class="quiz-type-tabs">
        ${QUIZ_TYPES.map((qt) => `<button class="quiz-type-btn ${qt.key === currentQuizType && !currentQuizTag ? 'active' : ''}" data-type="${qt.key ?? ''}">${qt.label}</button>`).join('')}
      </div>
      ${renderTagChips()}
    </div>`;
  const q = currentQuiz.questions[currentQIdx];
  if (!q) {
    if (currentQuiz.mode === 'cloze' && currentQuiz.questions.length === 0) {
      app.innerHTML = headerHtml + '<div class="card"><h3>此篇暫無填空題</h3><p>換一篇，或改練其他題型。</p></div>';
    } else if (currentQuizRound.total === 0 && currentQuiz.questions.length === 0) {
      app.innerHTML = headerHtml + '<div class="card"><h3>此範圍暫無題目</h3><p>換一篇或換題型／標籤。</p></div>';
    } else {
      if (isRetention && !currentQuiz._retentionResult) {
        currentQuiz._retentionResult = WYStore.recordRetentionCheck(
          currentQuiz.textId,
          currentQuizRound.correct,
          currentQuizRound.total,
        );
      }
      app.innerHTML = headerHtml + quizSettlementHtml();
      bindSettlement();
    }
    bindQuizTypeTabs();
    return;
  }
  const qTextId = _qTextId(q);
  // B8 對照原文：選擇題作答時把原文帶回現場（填空題本身即原句，不另帶以免露答案）
  const src = TEXTS.find((x) => x.id === qTextId);
  const sourceHtml = (q.type !== 'cloze' && src) ? `
    <details class="card quiz-source" open>
      <summary>📜 對照原文（作答時回去讀，別只背答案）</summary>
      <p class="passage">${src.passage}</p>
    </details>` : '';
  const posBadge = `第${currentQIdx + 1}/${currentQuiz.questions.length}題`;
  const shellKey = `${currentQuiz.mode || 'quiz'}|${currentQuiz.title}|${currentQuizType || ''}|${currentQuizTag || ''}|${qTextId}`;
  const quizStage = ensureQuizShell(headerHtml, sourceHtml, shellKey);
  if (q.type === 'cloze') {
    quizStage.innerHTML = `
      <div class="card">
        <span class="badge">填空　${posBadge}</span>
        <p class="cloze-hint">白話提示：${q.hint}</p>
        <p class="passage cloze-prompt">${q.prompt}</p>
        ${confidencePickerHtml()}
        <div class="cloze-input-row">
          <input type="text" id="clozeInput" class="cloze-input" placeholder="填入原文字詞" autocomplete="off" autocapitalize="off" />
          <button class="primary" id="clozeSubmit">作答</button>
        </div>
        <div id="feedback" role="status" aria-live="polite" tabindex="-1"></div>
      </div>`;
    bindQuizTypeTabs();
    bindConfidencePicker(quizStage);
    const input = document.getElementById('clozeInput');
    const submit = () => {
      if (input.disabled) return;
      const isCorrect = WYQuiz.checkCloze(q, input.value);
      input.disabled = true;
      document.getElementById('clozeSubmit').disabled = true;
      input.classList.add(isCorrect ? 'correct' : 'wrong');
      const inkGain = gradeQuizAnswer(q, isCorrect, input, qTextId, {
        confidence: selectedConfidence(quizStage),
        source: currentQuiz.mode || 'self-quiz',
      });
      revealFeedback(isCorrect, inkGain, q, isCorrect ? '' : `正解是「${q.answerText}」。`);
    };
    document.getElementById('clozeSubmit').onclick = submit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    input.focus();
    return;
  }
  const hintTickets = WYStore.getHintTickets();
  const hintBeforeHtml = hintTickets > 0
    ? `<button class="primary" id="useHintBefore">使用提示券（剩 ${hintTickets}）排除一個誘答</button>`
    : '';
  quizStage.innerHTML = `
    <div class="card quiz-question-card">
      ${companionHtml()}
      <span class="badge">${WYQuiz.typeLabel(q.type)}　${posBadge}</span>
      <p style="font-size:1.05rem;margin-top:10px;">${q.stem}</p>
      ${confidencePickerHtml()}
      ${hintBeforeHtml}
      <div class="options">
        ${q.options.map((opt, i) => `<button data-i="${i}" aria-label="選項 ${i + 1}：${opt}" aria-pressed="false" aria-describedby="feedback">${opt}</button>`).join('')}
      </div>
      <div id="feedback" role="status" aria-live="polite" tabindex="-1"></div>
    </div>`;
  bindQuizTypeTabs();
  bindConfidencePicker(quizStage);
  const useHintBefore = document.getElementById('useHintBefore');
  if (useHintBefore) useHintBefore.onclick = () => {
    if (!WYStore.useHintTicket()) return;
    const wrongIdx = WYQuiz.hintWrongIndex(q);
    const wrong = app.querySelector(`.options button[data-i="${wrongIdx}"]`);
    if (wrong) wrong.hidden = true;
    useHintBefore.textContent = '已排除一個誘答';
    useHintBefore.disabled = true;
    updateInkHud();
  };
  app.querySelectorAll('.options button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      const isCorrect = i === q.answerIdx;
      const clicked = app.querySelectorAll('.options button')[i];
      app.querySelectorAll('.options button').forEach((b, bi) => {
        b.disabled = true;
        b.setAttribute('aria-pressed', bi === q.answerIdx ? 'true' : 'false');
        if (bi === q.answerIdx) b.classList.add('correct');
        else if (bi === i) b.classList.add('wrong');
      });
      if (isCorrect) clicked.classList.add('pop');
      const inkGain = gradeQuizAnswer(q, isCorrect, clicked, qTextId, {
        selectedIndex: i,
        correctIndex: q.answerIdx,
        confidence: selectedConfidence(quizStage),
        hintUsed: !!(useHintBefore && useHintBefore.disabled),
        source: currentQuiz.mode || 'self-quiz',
      });
      if (isCorrect) revealFeedback(true, inkGain, q, '');
      else askSelfExplain(q, inkGain); // 答錯先自我解釋錯因，再揭示解析（生成效應打斷誤讀迴路）
    });
  });
}

function ensureQuizShell(headerHtml, sourceHtml, key) {
  let shell = document.getElementById('quizShell');
  if (!shell || shell.dataset.key !== key) {
    app.innerHTML = `<div id="quizShell" data-key="${key.replace(/"/g, '')}">${headerHtml}${sourceHtml}<div id="quizStage"></div></div>`;
    shell = document.getElementById('quizShell');
  }
  return document.getElementById('quizStage');
}

// 無論答對或答錯，都保留解析並由學生手動進下一題。
function revealFeedback(isCorrect, inkGain, q, wrongLead) {
  const capNote = (isCorrect && inkGain === 0) ? '<span class="ink-cap-note">🌿 今日墨錠已滿——接下來每一題，純粹是你想讀懂它。</span>' : '';
  const fb = document.getElementById('feedback');
  if (!fb) return;
  fb.innerHTML = `
    <p style="margin-top:8px;">${isCorrect ? `✅ 答對了！${currentQuizCombo >= 2 ? `連對 x${currentQuizCombo}　` : ''}` : `❌ ${wrongLead}`}${q.explain} ${capNote}</p>
    <button class="primary" id="nextQ">下一題</button>`;
  const advance = () => { currentQIdx += 1; drawQuiz(); };
  document.getElementById('nextQ').onclick = advance;
  fb.focus();
}

// 自我解釋錯因（⑨記憶科學）：答錯先讓學生說「為什麼會選錯」，再揭示解析
const WRONG_REASONS = ['我把它當成現代語意了', '我沒回到句子脈絡看', '這個字／詞我本來就不熟', '我用猜的'];
function askSelfExplain(q, inkGain) {
  const fb = document.getElementById('feedback');
  if (!fb) return;
  const rescue = WYStore.recentAccuracy().streakWrong >= 2 ? '<p class="rescue-hint">先打開上方「對照原文」找線索；慢一點沒關係。</p>' : '';
  fb.innerHTML = `
    <div class="self-explain">
      <p class="se-q">❌ 先想一下：你為什麼會選錯？</p>
      ${rescue}
      <div class="se-opts">${WRONG_REASONS.map((r, i) => `<button class="se-btn" data-i="${i}">${r}</button>`).join('')}</div>
    </div>`;
  fb.querySelectorAll('.se-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const r = WRONG_REASONS[Number(b.dataset.i)] || b.textContent;
      WYStore.recordErrorReason(q.id, r);
      revealFeedback(false, inkGain, q, '正解：');
    });
  });
  fb.focus();
}

// 能力標籤專練（⑧）：某篇若有帶標籤的題，顯示「專練」chips（虛詞/活用/…）
function renderTagChips() {
  const avail = TAG_LIST.filter((tag) => WYQuiz.tagCount(currentTextId, tag) > 0);
  if (!avail.length) return '';
  return `<div class="quiz-tag-row"><span class="quiz-tag-label">專練能力：</span>
    ${avail.map((tag) => `<button class="quiz-tag-btn ${currentQuizTag === tag ? 'active' : ''}" data-tag="${tag}">${tag}</button>`).join('')}</div>`;
}

// 自測作答計分共用：記錄（含 SRS qId、各自 textId）、精通里程碑掉落＋揭曉、班級文氣上報、連對音效／飄字。
// 填空題（cloze）能力統計歸入「字義」，SRS 用自己的 qId 獨立追蹤。回傳本題墨錠入帳數。
function gradeQuizAnswer(q, isCorrect, floatAnchor, qTextId, evidence = {}) {
  const tId = qTextId || _qTextId(q);
  const qType = q.type === 'cloze' ? 'char' : q.type;
  const inkBefore = WYStore.getInk();
  const wasMastered = WYStore.getTextState(tId).mastered;
  WYStore.recordAnswer(tId, isCorrect, qType, { qId: q.id, ...evidence });
  const inkGain = WYStore.getInk() - inkBefore;
  currentQuizRound.total += 1;
  if (isCorrect) currentQuizRound.correct += 1;
  // 精通里程碑掉落＋開盒揭曉（④）
  if (!wasMastered && WYStore.getTextState(tId).mastered) {
    const g = WYMarketStore.rollDropNew ? WYMarketStore.rollDropNew({ event: 'mastery' }) : WYMarketStore.rollDrop({ event: 'mastery' });
    if (g) { WYMarketStore.addOwned(g); showDropReveal(g); }
    showMasteryReveal(TEXTS.find((x) => x.id === tId), g);
    updateJianghuNav(); // 首次精通解鎖江湖分頁
  }
  if (isCorrect) reportClassGoal(); // 班級文氣：只累加真實答對（⑭b）
  updateInkHud();
  updateTitleBadge();
  if (isCorrect) {
    currentQuizCombo += 1;
    currentQuizComboPeak = Math.max(currentQuizComboPeak, currentQuizCombo);
    WYSound.correct(currentQuizCombo);
    if (inkGain > 0 && floatAnchor) floatInk(inkGain, floatAnchor);
    if (currentQuizCombo >= 2) showQuizCombo(currentQuizCombo);
    const spirit = document.querySelector('.yanling-companion');
    if (spirit) { spirit.classList.add('cheer'); setTimeout(() => spirit.classList.remove('cheer'), 500); }
  } else {
    currentQuizCombo = 0;
    WYSound.wrong();
  }
  return inkGain;
}

function showMasteryReveal(t, gearId) {
  if (!t) return;
  WYSound.drop(2);
  const box = document.createElement('div');
  box.className = 'drop-reveal mastery-reveal';
  const echo = worryEchoHtml(t) || '<p>🫧 硯靈低語：你已讀懂他了。</p>';
  box.innerHTML = `<div class="drop-inner"><p class="drop-got">解憂結算</p><h3>你聽懂了 ${t.author} 的憂</h3><p>${t.worry}</p>${echo}${gearId ? '<small>另獲得一件文房收藏</small>' : ''}</div>`;
  app.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}

// 班級集體目標上報：節流批量（每累積到門檻或答對時送一次），只在有班級碼時
function reportClassGoal() {
  const code = WYStore.getClassCode();
  if (!code) return;
  pendingClassGoalAdd += 1;
  if (pendingClassGoalAdd >= 5) return flushClassGoal();
  clearTimeout(classGoalTimer);
  classGoalTimer = setTimeout(flushClassGoal, 3000);
}
function flushClassGoal() {
  const code = WYStore.getClassCode();
  const n = pendingClassGoalAdd;
  if (!code || n <= 0) return;
  pendingClassGoalAdd = 0;
  clearTimeout(classGoalTimer);
  WYAPI.call('/api/rt-live', { body: { op: 'goal', code, n } });
}

// 連對慶祝分級（⑤）：x2 微反應、x5/x10 升格稱號＋更亮動畫，主題用文言階梯，避免同一橫幅回饋疲乏
const COMBO_TIERS = [
  { at: 10, label: '一氣呵成！', cls: 'combo-t3' },
  { at: 5, label: '筆走龍蛇！', cls: 'combo-t2' },
  { at: 3, label: '文思泉湧！', cls: 'combo-t1' },
  { at: 2, label: '連對 x2', cls: 'combo-t0' },
];
function showQuizCombo(combo) {
  const tier = COMBO_TIERS.find((t) => combo >= t.at);
  if (!tier) return;
  if (combo >= 3) WYSound.combo(combo);
  const banner = document.createElement('div');
  banner.className = `${combo < 5 ? 'combo-chip' : 'combo-banner'} ${tier.cls}`;
  banner.textContent = combo >= 3 ? `${tier.label}　連對 x${combo}` : tier.label;
  app.appendChild(banner);
  setTimeout(() => banner.remove(), 900);
}

// 掉寶開盒揭曉（④）：把「已經在發、卻沒被感知」的變動比率獎勵演出來，依品階給不同光暈音效
function showDropReveal(gearId) {
  let name = gearId, tier = 0, tierName = '';
  try {
    if (typeof WYMarketStore !== 'undefined') {
      if (WYMarketStore.GEAR_BY_ID && WYMarketStore.GEAR_BY_ID[gearId]) name = WYMarketStore.GEAR_BY_ID[gearId].name || gearId;
      if (WYMarketStore.tierOf) { const t = WYMarketStore.tierOf(gearId); tierName = { fan: '凡品', liang: '良品', zhen: '珍品' }[t] || ''; tier = { fan: 0, liang: 1, zhen: 2 }[t] || 0; }
    }
  } catch { /* 缺 API 就用 id */ }
  WYSound.drop(tier);
  const box = document.createElement('div');
  box.className = `drop-reveal drop-tier-${tier}`;
  box.innerHTML = `<div class="drop-inner"><span class="drop-spark">✦</span><p class="drop-got">獲得文房${tierName ? `・${tierName}` : ''}</p><p class="drop-name">${name}</p></div>`;
  app.appendChild(box);
  setTimeout(() => box.remove(), 1900);
}

function bindQuizTypeTabs() {
  app.querySelectorAll('.quiz-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentQuizType = btn.dataset.type || null;
      currentQuizTag = null;
      renderQuiz();
    });
  });
  app.querySelectorAll('.quiz-tag-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentQuizTag = currentQuizTag === btn.dataset.tag ? null : btn.dataset.tag;
      currentQuizType = null;
      renderQuiz();
    });
  });
  const pick = document.getElementById('quizPickOther');
  if (pick) pick.onclick = () => { setActiveTab('list'); renderList(); };
}

// 從一篇文章直接開戰（自測結算「去對戰」、選文詳情「對戰作者」共用）。
// 未解鎖（該篇答對率未達 80%）→ 導去自測並提示，維持白帽：對戰資格綁真實學習成果。
function startBattleForText(textId) {
  const t = TEXTS.find((x) => x.id === textId);
  if (!t) { renderBattle(); return; }
  const entry = WYBattle.unlockedRoster().find((r) => r.unlockText === textId);
  if (entry && entry.unlocked) {
    currentBattle = WYBattle.newBattle(entry.id);
    currentTextId = textId;
    currentQuiz = WYQuiz.buildQuiz(textId, {});
    currentQIdx = 0;
    drawBattle();
  } else {
    currentTextId = textId;
    currentQuizType = null;
    currentQuizTag = null;
    pendingQuizNote = `先把〈${t.title}〉自測到答對率 80%，就能對戰 ${t.author}。`;
    setActiveTab('quiz');
    renderQuiz();
  }
}

function renderBattle() {
  const roster = WYBattle.unlockedRoster();
  app.innerHTML = `<div class="card"><h3>選擇對手</h3>
    <p style="font-size:.85rem;color:var(--ink-dan);margin:.2em 0 0;">單人闖關，答對就攻擊文豪、答錯換牠出招（想跟同學連線 PK 請去「擂台」）。</p>
    <div class="opponent-grid">
      ${roster.map((r) => {
        const unlockTitle = (TEXTS.find((t) => t.id === r.unlockText) || {}).title || r.unlockText;
        return `
        <button class="opponent-card ${r.unlocked ? '' : 'locked'}" data-id="${r.id}" data-text="${r.unlockText}" data-locked="${r.unlocked ? '0' : '1'}">
          <img src="${thumbPath(r.img)}" alt="${r.name}" loading="lazy" width="72" height="72" />
          <span>${r.name}${r.unlocked ? '' : `<small>精通〈${unlockTitle}〉解鎖</small>`}</span>
        </button>`;
      }).join('')}
    </div>
    <p style="font-size:.8rem;color:var(--ink-dan);">${WYStore.MASTERY_RULE_TEXT}</p></div>`;
  app.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.locked === '1') { currentTextId = btn.dataset.text; currentQuizType = null; setActiveTab('quiz'); pendingQuizNote = masteryNudge(WYStore.getTextState(currentTextId)).replace(/<[^>]+>/g, ''); renderQuiz(); return; }
      currentBattle = WYBattle.newBattle(btn.dataset.id);
      currentTextId = currentBattle.opponent.unlockText;
      currentQuiz = WYQuiz.buildQuiz(currentTextId, {});
      currentQIdx = 0;
      drawBattle();
    });
  });
}

function _nextOpponentAfter(unlockText) {
  const roster = WYBattle.unlockedRoster();
  const i = roster.findIndex((r) => r.unlockText === unlockText);
  for (let k = 1; k <= roster.length; k++) {
    const r = roster[(i + k) % roster.length];
    if (r && r.unlocked && r.unlockText !== unlockText) return r;
  }
  return null;
}

function drawBattle() {
  const b = currentBattle;
  if (b.finished) {
    const dropId = b._drop;
    let dropHtml = '';
    if (dropId) {
      try {
        const nm = (WYMarketStore.GEAR_BY_ID && WYMarketStore.GEAR_BY_ID[dropId] && WYMarketStore.GEAR_BY_ID[dropId].name) || dropId;
        dropHtml = `<p class="battle-drop">🎁 戰利品：掉落文房「${nm}」，已收進行囊。</p>`;
      } catch (e) { dropHtml = ''; }
    }
    const nxt = b.win ? _nextOpponentAfter(b.opponent.unlockText) : null;
    app.innerHTML = `
      <div class="card battle-end ${b.win ? 'win' : 'lose'}">
        <h3>${b.win ? '🎉 你贏了！' : '💀 你被擊敗了'}</h3>
        <p style="color:var(--ink-dan);">${b.win ? `你以文會友，勝過了 ${b.opponent.name}。` : `${b.opponent.name} 技高一籌，再讀熟一點捲土重來。`}</p>
        ${dropHtml}
        <div class="battle-end-btns">
          <button class="primary" id="battleAgain">↺ 再戰 ${b.opponent.name}</button>
          ${nxt ? `<button class="primary" id="battleNext">⚔️ 打下一位（${nxt.name}）</button>` : ''}
          <button id="backBattle">返回對戰選單</button>
        </div>
      </div>`;
    document.getElementById('backBattle').onclick = renderBattle;
    document.getElementById('battleAgain').onclick = () => { startBattleForText(b.opponent.unlockText); };
    if (nxt) document.getElementById('battleNext').onclick = () => { startBattleForText(nxt.unlockText); };
    return;
  }
  const q = currentQuiz.questions[currentQIdx % currentQuiz.questions.length];
  const src = TEXTS.find((x) => x.id === currentTextId);
  const playerLow = b.player.curHp <= 30;
  let shell = document.getElementById('battleShell');
  if (!shell) {
    app.innerHTML = `
    <div class="card battle-card" id="battleShell">
      <div class="battle-vs">
        <img class="battle-portrait" src="${thumbPath(b.opponent.img)}" alt="${b.opponent.name}" loading="lazy" width="64" height="64" />
        <div style="flex:1;">
          <strong>${b.opponent.name}</strong>
          <div class="hp-bar"><div class="hp-fill enemy" style="width:100%"></div></div>
          <strong>你</strong>
          <div class="hp-bar"><div class="hp-fill player" style="width:100%"></div></div>
        </div>
      </div>
      ${src ? `<details class="battle-source"><summary>📜 對照原文與語譯</summary><p class="passage">${src.passage}</p><p>${src.segments.map((s) => s.translation || '').join(' ')}</p></details>` : ''}
      <div id="battleStage"></div>
    </div>`;
    shell = document.getElementById('battleShell');
  }
  const enemyFill = shell.querySelector('.hp-fill.enemy');
  const playerFill = shell.querySelector('.hp-fill.player');
  requestAnimationFrame(() => { enemyFill.style.width = `${b.opponent.curHp}%`; playerFill.style.width = `${b.player.curHp}%`; });
  playerFill.classList.toggle('low', playerLow);
  document.getElementById('battleStage').innerHTML = `
      <p>${q.stem}</p>
      <div class="options">${q.options.map((opt, i) => `<button data-i="${i}">${opt}</button>`).join('')}</div>
      <p style="font-size:.85rem;color:var(--ink-dan);">${b.log.slice(-1)[0] || ''}</p>
    `;
  document.getElementById('battleStage').querySelectorAll('.options button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const isCorrect = Number(btn.dataset.i) === q.answerIdx;
      document.getElementById('battleStage').querySelectorAll('.options button').forEach((option) => {
        const optionIdx = Number(option.dataset.i);
        option.disabled = true;
        if (optionIdx === q.answerIdx) option.classList.add('correct');
        else if (option === btn) option.classList.add('wrong');
      });
      // 對戰不計精通（防重複刷同批題灌分）；精通只能靠「自測」達成。仍賺墨錠。
      WYStore.recordAnswer(currentTextId, isCorrect, q.type, { countForMastery: false });
      const beforeOpponentHp = currentBattle.opponent.curHp;
      const beforePlayerHp = currentBattle.player.curHp;
      // 隨行文魄＋文房裝備加成（無隨行/無裝備時皆回中性值 0/false/1，行為與原本一致）
      const shielded = !isCorrect && WYFusionAdapter.tryShield(currentBattle);
      currentBattle = WYBattle.resolveAnswer(currentBattle, isCorrect);
      if (isCorrect) {
        const bonus = WYFusionAdapter.damageBonus() + WYMarketAdapter.damageBonus();
        if (bonus > 0) {
          currentBattle.opponent.curHp = Math.max(0, currentBattle.opponent.curHp - bonus);
          currentBattle.log.push(`文魄／文房加持，額外造成 ${bonus} 傷害`);
        }
        const inkExtra = (WYFusionAdapter.inkMultiplier() - 1) + (WYMarketAdapter.inkMultiplier() - 1);
        const inkBonus = Math.round(2 * inkExtra);
        if (inkBonus > 0) WYStore.earnInk(inkBonus);
        updateInkHud();
      } else if (shielded) {
        currentBattle.player.curHp = beforePlayerHp; // 護心文魄：免此次反擊
        currentBattle.log.push('隨行文魄護體，免去一次反擊');
      }
      currentBattle.win = currentBattle.opponent.curHp <= 0;
      currentBattle.finished = currentBattle.opponent.curHp <= 0 || currentBattle.player.curHp <= 0;
      // 對戰勝利機率掉落文房道具（記在 _drop 上，勝利畫面亮出「掉落文房」）
      if (currentBattle.win && WYStore.getTextState(currentTextId).mastered && canDropBattleToday(currentBattle.opponent.id)) {
        const g = WYMarketStore.rollDrop({ event: 'battleWin', combo: currentBattle.combo });
        if (g) { WYMarketStore.addOwned(g); currentBattle._drop = g; }
      }
      const dmg = isCorrect ? beforeOpponentHp - currentBattle.opponent.curHp : beforePlayerHp - currentBattle.player.curHp;
      isCorrect ? WYSound.correct() : WYSound.wrong();
      if (currentBattle.comboMilestone) WYSound.combo();
      const battleShell = document.getElementById('battleShell');
      const nextEnemyFill = battleShell.querySelector('.hp-fill.enemy');
      const nextPlayerFill = battleShell.querySelector('.hp-fill.player');
      requestAnimationFrame(() => {
        nextEnemyFill.style.width = `${currentBattle.opponent.curHp}%`;
        nextPlayerFill.style.width = `${currentBattle.player.curHp}%`;
        nextPlayerFill.classList.toggle('low', currentBattle.player.curHp <= 30);
      });
      showBattleFeedback(isCorrect, dmg, currentBattle.comboMilestone, currentBattle.combo, q);
    });
  });
}

function thumbPath(src) { return String(src || '').replace(/\.png$/i, '-thumb.webp'); }
function canDropBattleToday(opponentId) {
  const key = 'wy_battle_firstwins';
  const day = new Date().toISOString().slice(0, 10);
  try {
    const rec = JSON.parse(localStorage.getItem(key) || '{}');
    if (rec.day !== day) { localStorage.setItem(key, JSON.stringify({ day, ids: [opponentId] })); return true; }
    if ((rec.ids || []).includes(opponentId)) return false;
    rec.ids = [...(rec.ids || []), opponentId]; localStorage.setItem(key, JSON.stringify(rec)); return true;
  } catch { return false; }
}

function showBattleFeedback(isCorrect, dmg, comboMilestone, combo, q) {
  const target = app.querySelector('.battle-portrait');
  if (target) {
    const float = document.createElement('span');
    float.className = `dmg-float ${isCorrect ? 'dmg-hit' : 'dmg-hurt'}`;
    float.textContent = `-${dmg}`;
    target.parentElement.appendChild(float);
    setTimeout(() => float.remove(), 900);
  }
  const card = app.querySelector('.battle-card');
  if (card) {
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 300);
  }
  if (comboMilestone) {
    const banner = document.createElement('div');
    banner.className = 'combo-banner';
    banner.textContent = `連擊 x${combo}！`;
    app.appendChild(banner);
    setTimeout(() => banner.remove(), 900);
  }
  const stage = document.getElementById('battleStage');
  if (!stage) return;
  const feedback = document.createElement('div');
  feedback.className = 'battle-answer-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('tabindex', '-1');
  feedback.innerHTML = `
    <p>${isCorrect ? '✅ 答對了！' : '❌ 再看一次。'}正解：${q.options[q.answerIdx]}</p>
    <p>${q.explain}</p>
    <button class="primary" id="battleContinue">${currentBattle.finished ? '查看對戰結果' : '繼續下一題'}</button>`;
  stage.appendChild(feedback);
  document.getElementById('battleContinue').onclick = () => {
    currentQIdx += 1;
    drawBattle();
  };
  feedback.focus();
}

function renderWenhao() {
  const roster = WYWenhao.roster();
  const s = WYWenhao.summary();
  const pct = s.total ? Math.round(s.unlocked / s.total * 100) : 0;
  // 解憂簿：把「已解鎖」重新包裝成「已聽懂 N 位古人的心事」，讓收集有情感意義（⑪）
  const finale = s.unlocked >= s.total && s.total > 0 ? `
    <div class="card wenhao-finale">
      <h3>📖 解憂簿・圓滿</h3>
      <p>${s.total} 位古人的憂，你都聽懂了。從諸葛亮的託孤、陶淵明的歸隱，到蘇軾在赤壁與天地和解——他們隔著千年，把走過的關卡寫給你。</p>
      <p style="color:var(--ink-dan);">你不是在背文言文，你是在讀懂一個個曾經跟你一樣困惑的人。</p>
    </div>` : '';
  app.innerHTML = `
    <div class="card wenhao-header">
      <h3>📖 解憂簿</h3>
      <p>已聽懂 <strong>${s.unlocked}</strong> / ${s.total} 位古人的心事</p>
      <div class="wenhao-progress"><div class="wenhao-progress-fill" style="width:${pct}%"></div></div>
    </div>
    ${finale}
    <div class="wenhao-grid">
      ${roster.map((r) => `
        <div class="wenhao-card ${r.unlocked ? '' : 'locked'}">
          <span class="wenhao-no">${r.id.toUpperCase()}</span>
          <img src="${thumbPath(r.img)}" alt="${r.title}" class="wenhao-portrait" loading="lazy" />
          <strong>${r.title}</strong>
          <div style="font-size:.8rem;">${r.author}</div>
          <div style="font-size:.8rem;">${r.unlocked ? `你解開了：${r.worry}` : `他的憂：${r.worry}——${masteryNudge(WYStore.getTextState(r.id)).replace(/<[^>]+>/g, '') || '讀懂他'}`}</div>
          ${r.reunion ? `<p class="wenhao-reunion">${r.reunion}</p>` : ''}
        </div>`).join('')}
    </div>`;
}

boot();
