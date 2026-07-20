let TEXTS = [];
let currentTextId = null;
let currentQuiz = null;
let currentQIdx = 0;
let currentQuizType = null;
let currentBattle = null;
let segTabPreference = 'translation';

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
  renderTab('list');
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderTab(btn.dataset.tab);
  });
});

function renderTab(tab) {
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
  app.innerHTML = streakHtml + TEXTS.map((t) => {
    const ratio = Math.round(WYStore.masteryRatio(t.id) * 100);
    return `
      <div class="card text-list-item" data-id="${t.id}">
        <div>
          <strong>${t.title}</strong>　${t.author}
          <div style="font-size:.8rem;color:#6b5f4f;">${t.era}·${t.genre}</div>
        </div>
        <span class="badge">${t.level === 'J' ? '國中' : '高中'}·${ratio}%</span>
      </div>`;
  }).join('');
  app.querySelectorAll('.text-list-item').forEach((el) => {
    el.addEventListener('click', () => {
      currentTextId = el.dataset.id;
      renderTextDetail(TEXTS.find((x) => x.id === currentTextId));
    });
  });
}

const SEG_TABS = [
  { key: 'translation', label: '白話語譯' },
  { key: 'glossary', label: '字詞注釋' },
  { key: 'note', label: '賞析' },
];

function renderTextDetail(t) {
  app.innerHTML = `
    <div class="card">
      <button class="link-back" id="backToList">◂ 返回選文</button>
      <h2>${t.title}</h2>
      <p style="color:#6b5f4f">${t.author}·${t.era}</p>
    </div>
    ${t.segments.map((seg, i) => `
      <div class="card segment-block">
        <div class="passage segment-original">${seg.text}</div>
        <div class="seg-tabs" data-seg="${i}">
          ${SEG_TABS.map((tab) => `<button class="seg-tab-btn ${tab.key === segTabPreference ? 'active' : ''}" data-tab="${tab.key}">${tab.label}</button>`).join('')}
        </div>
        <div class="seg-tab-content" data-seg="${i}">${renderSegTabContent(seg, segTabPreference)}</div>
      </div>`).join('')}`;
  document.getElementById('backToList').onclick = renderList;
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
      <div class="flashcard ${flashcardFlipped ? 'flipped' : ''}" id="flashcardEl">
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
  document.getElementById('flashcardEl').onclick = () => {
    flashcardFlipped = !flashcardFlipped;
    document.getElementById('flashcardEl').classList.toggle('flipped', flashcardFlipped);
  };
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
  drawQuiz();
}

function drawQuiz() {
  const typeFilterHtml = `
    <div class="card">
      <p style="font-size:.8rem;color:#6b5f4f;margin:0 0 6px;">練習題型（可先專攻單一題型打基礎）</p>
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
      isCorrect ? WYSound.correct() : WYSound.wrong();
      app.querySelectorAll('.options button').forEach((b, bi) => {
        b.disabled = true;
        if (bi === q.answerIdx) b.classList.add('correct');
        else if (bi === i) b.classList.add('wrong');
      });
      WYStore.recordAnswer(currentQuiz.textId, isCorrect);
      document.getElementById('feedback').innerHTML = `
        <p style="margin-top:8px;">${isCorrect ? '✅ 答對了！' : '❌ 答錯了。'}${q.explain}</p>
        <button class="primary" id="nextQ">下一題</button>`;
      document.getElementById('nextQ').onclick = () => { currentQIdx += 1; drawQuiz(); };
    });
  });
}

function bindQuizTypeTabs() {
  app.querySelectorAll('.quiz-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentQuizType = btn.dataset.type || null;
      renderQuiz();
    });
  });
}

function renderBattle() {
  const roster = WYBattle.unlockedRoster();
  app.innerHTML = `<div class="card"><h3>選擇對手</h3>
    <div class="opponent-grid">
      ${roster.map((r) => `
        <button class="opponent-card ${r.unlocked ? '' : 'locked'}" data-id="${r.id}" ${r.unlocked ? '' : 'disabled'}>
          <img src="${r.img}" alt="${r.name}" />
          <span>${r.name}${r.unlocked ? '' : '（未解鎖）'}</span>
        </button>`).join('')}
    </div>
    <p style="font-size:.8rem;color:#6b5f4f;">解鎖條件：對應篇目答對率達 80% 以上</p></div>`;
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
        <img class="battle-portrait" src="${b.opponent.img}" alt="${b.opponent.name}" />
        <div style="flex:1;">
          <strong>${b.opponent.name}</strong>
          <div class="hp-bar"><div class="hp-fill enemy" style="width:${b.opponent.curHp}%"></div></div>
          <strong>你</strong>
          <div class="hp-bar"><div class="hp-fill" style="width:${b.player.curHp}%"></div></div>
        </div>
      </div>
      <p>${q.stem}</p>
      <div class="options">${q.options.map((opt, i) => `<button data-i="${i}">${opt}</button>`).join('')}</div>
      <p style="font-size:.85rem;color:#6b5f4f;">${b.log.slice(-1)[0] || ''}</p>
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
      WYStore.recordAnswer(currentTextId, isCorrect);
      const beforeOpponentHp = currentBattle.opponent.curHp;
      const beforePlayerHp = currentBattle.player.curHp;
      // 隨行文魄＋文房裝備加成（無隨行/無裝備時皆回中性值 0/false/1，行為與原本一致）
      const shielded = !isCorrect && WYFusionAdapter.tryShield(currentBattle);
      currentBattle = WYBattle.resolveAnswer(currentBattle, isCorrect);
      if (isCorrect) {
        const bonus = WYFusionAdapter.damageBonus() + WYMarketAdapter.damageBonus();
        if (bonus > 0) currentBattle.opponent.curHp = Math.max(0, currentBattle.opponent.curHp - bonus);
        const inkExtra = (WYFusionAdapter.inkMultiplier() - 1) + (WYMarketAdapter.inkMultiplier() - 1);
        const inkBonus = Math.round(2 * inkExtra);
        if (inkBonus > 0) WYStore.addInk(inkBonus);
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
          <img src="${r.img}" alt="${r.title}" class="wenhao-portrait" />
          <strong>${r.title}</strong>
          <div style="font-size:.8rem;">${r.author}</div>
          <div style="font-size:.8rem;">${r.unlocked ? '已收錄' : `答對率 ${r.progress}%`}</div>
        </div>`).join('')}
    </div>`;
}

boot();
