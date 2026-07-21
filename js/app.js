let TEXTS = [];
let currentTextId = null;
let currentQuiz = null;
let currentQIdx = 0;
let currentQuizType = null;
let currentQuizCombo = 0;
let currentBattle = null;
let segTabPreference = 'translation';
let pendingQuizNote = null; // 從選文詳情頁「對戰作者」但尚未解鎖時，導去自測並提示

const app = document.getElementById('app');
const tabButtons = document.querySelectorAll('nav.tabs button');

// 極簡音效：純 WebAudio 合成音，不需外部音檔
const WYSound = (() => {
  let ctx = null;
  function beep(freq, dur, type = 'sine') {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* 部分瀏覽器需使用者互動後才能建立 AudioContext，靜默失敗即可 */ }
  }
  return {
    correct: () => beep(880, .12),
    wrong: () => beep(160, .2, 'square'),
    combo: () => beep(1320, .15),
  };
})();

// header 常駐墨錠計數器：任何得到/花費墨錠的動作後呼叫，讓玩家隨時看得到餘額＋今日賺取進度
function updateInkHud() {
  const el = document.getElementById('ink-count');
  if (el) el.textContent = WYStore.getInk();
  const today = document.getElementById('ink-today');
  if (today) {
    const t = WYStore.inkToday();
    today.textContent = `今日 ${t.earned}/${t.cap}`;
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
  setTimeout(() => f.remove(), 1000);
}

async function boot() {
  const res = await fetch('data/texts.json');
  TEXTS = await res.json();
  WYFlashcard.init(TEXTS);
  WYQuiz.init(TEXTS);
  WYWenhao.init(TEXTS);
  WYStore.touchStreak();
  WYCaotang.init(TEXTS);
  WYFusion.init(TEXTS);
  WYRt.init(TEXTS);
  WYMarket.init(TEXTS);
  updateInkHud();
  const reopen = document.getElementById('guide-reopen');
  if (reopen) reopen.onclick = () => {
    try { localStorage.removeItem('wy_guide_seen'); } catch { /* 隱私模式：略過 */ }
    setActiveTab('list');
    renderList();
  };
  renderTab('list');
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
    renderTab(btn.dataset.tab);
  });
});

// 只更新導覽列高亮（供選文詳情頁的「自測這篇／對戰作者」以程式切換分頁時同步高亮）
function setActiveTab(tab) {
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

function renderTab(tab) {
  updateInkHud();
  if (tab === 'list') return renderList();
  if (tab === 'flashcard') return renderFlashcard();
  if (tab === 'quiz') return renderQuiz();
  if (tab === 'battle') return renderBattle();
  if (tab === 'wenhao') return renderWenhao();
  if (tab === 'caotang') return WYCaotang.render(app);
  if (tab === 'fusion') return WYFusion.render(app);
  if (tab === 'rt') return WYRt.render(app);
  if (tab === 'market') return WYMarket.render(app);
}

function renderList() {
  const streak = WYStore.getStreak();
  const streakHtml = streak.days > 0
    ? `<div class="card streak-banner">🔥 連續學習 ${streak.days} 天</div>`
    : '';
  let guideSeen = true;
  try { guideSeen = !!localStorage.getItem('wy_guide_seen'); } catch { /* 隱私模式：當作已看過 */ }
  const guideHtml = guideSeen ? '' : `
    <div class="card guide-card" id="guideCard">
      <button class="guide-close" id="guideClose" aria-label="關閉">×</button>
      <h3>怎麼玩？三步驟</h3>
      <ol class="guide-steps">
        <li><b>讀一篇</b>：點下面任一篇，看原文＋白話語譯＋注釋賞析。</li>
        <li><b>去「自測」練到精通</b>：答對就賺墨錠，答對率達 80% 就精通這一篇。</li>
        <li><b>「對戰」解鎖文豪</b>：單人闖關打文豪，前兩位一開始就能打，精通更多篇解鎖後面的高手。</li>
      </ol>
      <p class="guide-more">行有餘力再逛「江湖」：草堂掛名句、擂台跟同學連線 PK、合契收文魄、市集換文房四寶（平日先逛硯靈行商）。</p>
    </div>`;
  app.innerHTML = streakHtml + guideHtml + renderDashboard() + TEXTS.map((t) => {
    const ratio = Math.round(WYStore.masteryRatio(t.id) * 100);
    return `
      <div class="card text-list-item" data-id="${t.id}" role="button" tabindex="0">
        <div>
          <strong>${t.title}</strong>　${t.author}
          <div style="font-size:.8rem;color:var(--ink-dan);">${t.era}·${t.genre}</div>
        </div>
        <span class="badge-group"><span class="badge-level">${t.level === 'J' ? '國中' : '高中'}</span><span class="badge-pct">${ratio}%</span></span>
      </div>`;
  }).join('');
  const gc = document.getElementById('guideClose');
  if (gc) gc.onclick = () => {
    try { localStorage.setItem('wy_guide_seen', '1'); } catch { /* 隱私模式：略過 */ }
    const card = document.getElementById('guideCard');
    if (card) card.remove();
  };
  app.querySelectorAll('.text-list-item').forEach((el) => {
    const open = () => {
      currentTextId = el.dataset.id;
      renderTextDetail(TEXTS.find((x) => x.id === currentTextId));
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

const SEG_TABS = [
  { key: 'translation', label: '白話語譯' },
  { key: 'glossary', label: '字詞注釋' },
  { key: 'note', label: '賞析' },
];

const TYPE_LABEL = { char: '字義', sentence: '句義', gist: '段旨', theme: '篇章文意' };

// 學習儀表板：逐題型正確率＋精通篇數，讓學生看到弱點、家長/老師看得懂學了什麼（教育專家審查要求）
function renderDashboard() {
  const stats = WYStore.typeStats();
  const answered = stats.reduce((s, x) => s + x.total, 0);
  const masteredCount = WYStore.allMastered().length;
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
  const weakLine = weakest && weakest.ratio < 0.8
    ? `<p class="dash-advice">💡 目前「${TYPE_LABEL[weakest.type]}」較弱（${Math.round(weakest.ratio * 100)}%），到「自測」上方切到該題型多練幾題。</p>`
    : (answered >= 8 ? '<p class="dash-advice">👍 各題型都在水準上，繼續保持！</p>' : '');
  return `
    <details class="card dash-card">
      <summary>📊 我的學習儀表板　<small>已精通 ${masteredCount}/27 篇・答題 ${answered} 次</small></summary>
      <div class="dash-body">
        ${bars}
        ${weakLine}
        <details class="dash-parent">
          <summary>給家長／老師看</summary>
          <p>孩子在做的是「文言文閱讀理解」四種能力的練習：<b>字義</b>（讀懂關鍵字詞）、<b>句義</b>（翻譯理解句子）、<b>段旨</b>（抓每段重點）、<b>篇章文意</b>（掌握全篇主旨）。上面的百分比就是每種能力的答對率，越低代表越需要加強。「精通」＝某篇答對率達 80%（至少答 8 題），不是點幾下就算學會。獎勵（墨錠、對手解鎖、草堂掛軸）全部要真的答對才拿得到，且每日賺取墨錠有上限，避免變成刷數值。</p>
        </details>
      </div>
    </details>`;
}

function renderTextDetail(t) {
  app.innerHTML = `
    <div class="card">
      <button class="link-back" id="backToList">◂ 返回選文</button>
      <h2>${t.title}</h2>
      <p style="color:var(--ink-dan)">${t.author}·${t.era}</p>
    </div>
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
  document.getElementById('battleThis').onclick = () => {
    const entry = WYBattle.unlockedRoster().find((r) => r.unlockText === t.id);
    if (entry && entry.unlocked) {
      currentBattle = WYBattle.newBattle(entry.id);
      currentTextId = t.id;
      currentQuiz = WYQuiz.buildQuiz(t.id, {});
      currentQIdx = 0;
      setActiveTab('battle');
      drawBattle();
    } else {
      // 尚未解鎖：導去自測這篇並提示（對應篇答對率達 80% 才能對戰作者）
      currentTextId = t.id;
      currentQuizType = null;
      pendingQuizNote = `先把〈${t.title}〉自測到答對率 80%，就能對戰 ${t.author}。`;
      setActiveTab('quiz');
      renderQuiz();
    }
  };
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

function renderSegTabContent(seg, tabKey) {
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
  if (!currentTextId) currentTextId = TEXTS[0]?.id;
  WYFlashcard.buildQueue(currentTextId);
  flashcardFlipped = false;
  drawFlashcard();
}

function drawFlashcard() {
  const card = WYFlashcard.current();
  const p = WYFlashcard.progress();
  if (!card) { app.innerHTML = '<div class="card">請先在「選文」挑一篇文章</div>'; return; }
  app.innerHTML = `
    <div class="card">
      <div class="badge">${p.idx}/${p.total}</div>
      <div class="flashcard ${flashcardFlipped ? 'flipped' : ''}" id="flashcardEl" role="button" tabindex="0" aria-label="翻面卡片">
        <div class="flashcard-inner">
          <div class="flashcard-face flashcard-front">
            <p class="passage">${card.front}</p>
            <span class="flip-hint">點卡片看段旨提示 ▸</span>
          </div>
          <div class="flashcard-face flashcard-back">
            <p class="hint-label">段旨提示</p>
            <p>${card.back}</p>
            <span class="flip-hint">點卡片翻回原文 ▸</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="primary" id="prevBtn">上一張</button>
        <button class="primary" id="nextBtn">下一張</button>
      </div>
    </div>`;
  const flipCard = () => {
    flashcardFlipped = !flashcardFlipped;
    document.getElementById('flashcardEl').classList.toggle('flipped', flashcardFlipped);
  };
  document.getElementById('flashcardEl').onclick = flipCard;
  document.getElementById('flashcardEl').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(); } });
  document.getElementById('prevBtn').onclick = () => { flashcardFlipped = false; WYFlashcard.prev(); drawFlashcard(); };
  document.getElementById('nextBtn').onclick = () => { flashcardFlipped = false; WYFlashcard.next(); drawFlashcard(); };
}

const QUIZ_TYPES = [
  { key: null, label: '混合' },
  { key: 'char', label: '字義' },
  { key: 'sentence', label: '句義' },
  { key: 'gist', label: '段旨' },
  { key: 'theme', label: '篇章文意' },
];

function renderQuiz() {
  if (!currentTextId) currentTextId = TEXTS[0]?.id;
  currentQuiz = WYQuiz.buildQuiz(currentTextId, { type: currentQuizType });
  currentQIdx = 0;
  currentQuizCombo = 0;
  drawQuiz();
}

function drawQuiz() {
  const noteHtml = pendingQuizNote ? `<div class="card quiz-note">💡 ${pendingQuizNote}</div>` : '';
  pendingQuizNote = null; // 只提示一次
  const typeFilterHtml = noteHtml + `
    <div class="card">
      <p class="quiz-focus">📖 自測：《${currentQuiz.title}》　<button class="link-back" id="quizPickOther">換一篇</button></p>
      <p style="font-size:.8rem;color:var(--ink-dan);margin:0 0 6px;">練習題型（可先專攻單一題型打基礎）</p>
      <div class="quiz-type-tabs">
        ${QUIZ_TYPES.map((qt) => `<button class="quiz-type-btn ${qt.key === currentQuizType ? 'active' : ''}" data-type="${qt.key ?? ''}">${qt.label}</button>`).join('')}
      </div>
    </div>`;
  const q = currentQuiz.questions[currentQIdx];
  if (!q) {
    app.innerHTML = typeFilterHtml + `<div class="card"><h3>本輪練習完成！</h3><p>《${currentQuiz.title}》答對率：${Math.round(WYStore.masteryRatio(currentQuiz.textId) * 100)}%</p></div>`;
    bindQuizTypeTabs();
    return;
  }
  app.innerHTML = typeFilterHtml + `
    <div class="card">
      <span class="badge">${WYQuiz.typeLabel(q.type)}　第${currentQIdx + 1}/${currentQuiz.questions.length}題</span>
      <p style="font-size:1.05rem;margin-top:10px;">${q.stem}</p>
      <div class="options">
        ${q.options.map((opt, i) => `<button data-i="${i}">${opt}</button>`).join('')}
      </div>
      <div id="feedback"></div>
    </div>`;
  bindQuizTypeTabs();
  app.querySelectorAll('.options button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      const isCorrect = i === q.answerIdx;
      const clicked = app.querySelectorAll('.options button')[i];
      app.querySelectorAll('.options button').forEach((b, bi) => {
        b.disabled = true;
        if (bi === q.answerIdx) b.classList.add('correct');
        else if (bi === i) b.classList.add('wrong');
      });
      const inkBefore = WYStore.getInk();
      WYStore.recordAnswer(currentQuiz.textId, isCorrect, q.type);
      const inkGain = WYStore.getInk() - inkBefore;
      updateInkHud();
      if (isCorrect) {
        currentQuizCombo += 1;
        WYSound.correct();
        if (inkGain > 0) floatInk(inkGain, clicked);
        if (currentQuizCombo >= 3 && currentQuizCombo % 3 === 0) {
          WYSound.combo();
          showQuizCombo(currentQuizCombo);
        }
      } else {
        currentQuizCombo = 0;
        WYSound.wrong();
      }
      const capNote = (isCorrect && inkGain === 0) ? '<span class="ink-cap-note">（今日墨錠已達上限，明天再賺）</span>' : '';
      document.getElementById('feedback').innerHTML = `
        <p style="margin-top:8px;">${isCorrect ? `✅ 答對了！${currentQuizCombo >= 2 ? `連對 x${currentQuizCombo}　` : ''}` : '❌ 答錯了。'}${q.explain} ${capNote}</p>
        <button class="primary" id="nextQ">下一題</button>`;
      document.getElementById('nextQ').onclick = () => { currentQIdx += 1; drawQuiz(); };
    });
  });
}

function showQuizCombo(combo) {
  const banner = document.createElement('div');
  banner.className = 'combo-banner';
  banner.textContent = `連對 x${combo}！`;
  app.appendChild(banner);
  setTimeout(() => banner.remove(), 900);
}

function bindQuizTypeTabs() {
  app.querySelectorAll('.quiz-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentQuizType = btn.dataset.type || null;
      renderQuiz();
    });
  });
  const pick = document.getElementById('quizPickOther');
  if (pick) pick.onclick = () => { setActiveTab('list'); renderList(); };
}

function renderBattle() {
  const roster = WYBattle.unlockedRoster();
  app.innerHTML = `<div class="card"><h3>選擇對手</h3>
    <p style="font-size:.85rem;color:var(--ink-dan);margin:.2em 0 0;">單人闖關，答對就攻擊文豪、答錯換牠出招（想跟同學連線 PK 請去「擂台」）。</p>
    <div class="opponent-grid">
      ${roster.map((r) => `
        <button class="opponent-card ${r.unlocked ? '' : 'locked'}" data-id="${r.id}" ${r.unlocked ? '' : 'disabled'}>
          <img src="${r.img}" alt="${r.name}" loading="lazy" width="72" height="72" />
          <span>${r.name}${r.unlocked ? '' : '（未解鎖）'}</span>
        </button>`).join('')}
    </div>
    <p style="font-size:.8rem;color:var(--ink-dan);">解鎖條件：對應篇目答對率達 80% 以上</p></div>`;
  app.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentBattle = WYBattle.newBattle(btn.dataset.id);
      currentTextId = currentBattle.opponent.unlockText;
      currentQuiz = WYQuiz.buildQuiz(currentTextId, {});
      currentQIdx = 0;
      drawBattle();
    });
  });
}

function drawBattle() {
  const b = currentBattle;
  const q = currentQuiz.questions[currentQIdx % currentQuiz.questions.length];
  app.innerHTML = `
    <div class="card battle-card">
      <div class="battle-vs">
        <img class="battle-portrait" src="${b.opponent.img}" alt="${b.opponent.name}" loading="lazy" width="64" height="64" />
        <div style="flex:1;">
          <strong>${b.opponent.name}</strong>
          <div class="hp-bar"><div class="hp-fill enemy" style="width:${b.opponent.curHp}%"></div></div>
          <strong>你</strong>
          <div class="hp-bar"><div class="hp-fill" style="width:${b.player.curHp}%"></div></div>
        </div>
      </div>
      <p>${q.stem}</p>
      <div class="options">${q.options.map((opt, i) => `<button data-i="${i}">${opt}</button>`).join('')}</div>
      <p style="font-size:.85rem;color:var(--ink-dan);">${b.log.slice(-1)[0] || ''}</p>
    </div>`;
  if (b.finished) {
    app.innerHTML = `<div class="card"><h3>${b.win ? '🎉 你贏了！' : '💀 你被擊敗了'}</h3><button class="primary" id="backBattle">返回對戰選單</button></div>`;
    document.getElementById('backBattle').onclick = renderBattle;
    return;
  }
  app.querySelectorAll('.options button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const isCorrect = Number(btn.dataset.i) === q.answerIdx;
      const wasMastered = WYStore.getTextState(currentTextId).mastered;
      WYStore.recordAnswer(currentTextId, isCorrect, q.type);
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
        // 精通里程碑（false→true）必掉一件文房道具
        if (!wasMastered && WYStore.getTextState(currentTextId).mastered) {
          const g = WYMarketStore.rollDrop({ event: 'mastery' });
          if (g) WYMarketStore.addOwned(g);
        }
      } else if (shielded) {
        currentBattle.player.curHp = beforePlayerHp; // 護心文魄：免此次反擊
        currentBattle.log.push('隨行文魄護體，免去一次反擊');
      }
      currentBattle.win = currentBattle.opponent.curHp <= 0;
      currentBattle.finished = currentBattle.opponent.curHp <= 0 || currentBattle.player.curHp <= 0;
      // 對戰勝利機率掉落文房道具
      if (currentBattle.win) {
        const g = WYMarketStore.rollDrop({ event: 'battleWin', combo: currentBattle.combo });
        if (g) WYMarketStore.addOwned(g);
      }
      const dmg = isCorrect ? beforeOpponentHp - currentBattle.opponent.curHp : beforePlayerHp - currentBattle.player.curHp;
      isCorrect ? WYSound.correct() : WYSound.wrong();
      if (currentBattle.comboMilestone) WYSound.combo();
      currentQIdx += 1;
      drawBattle();
      showBattleFeedback(isCorrect, dmg, currentBattle.comboMilestone, currentBattle.combo);
    });
  });
}

function showBattleFeedback(isCorrect, dmg, comboMilestone, combo) {
  const target = app.querySelector('.battle-portrait');
  if (!target) return;
  const float = document.createElement('span');
  float.className = `dmg-float ${isCorrect ? 'dmg-hit' : 'dmg-hurt'}`;
  float.textContent = `-${dmg}`;
  target.parentElement.appendChild(float);
  setTimeout(() => float.remove(), 900);
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
}

function renderWenhao() {
  const roster = WYWenhao.roster();
  const s = WYWenhao.summary();
  app.innerHTML = `
    <div class="card">已解鎖 ${s.unlocked} / ${s.total} 篇</div>
    <div class="wenhao-grid">
      ${roster.map((r) => `
        <div class="wenhao-card ${r.unlocked ? '' : 'locked'}">
          <span class="wenhao-no">${r.id.toUpperCase()}</span>
          <img src="${r.img}" alt="${r.title}" class="wenhao-portrait" loading="lazy" />
          <strong>${r.title}</strong>
          <div style="font-size:.8rem;">${r.author}</div>
          <div style="font-size:.8rem;">${r.unlocked ? '已收錄' : `答對率 ${r.progress}%`}</div>
        </div>`).join('')}
    </div>`;
}

boot();
