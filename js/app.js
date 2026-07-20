let TEXTS = [];
let currentTextId = null;
let currentQuiz = null;
let currentQIdx = 0;
let currentBattle = null;

const app = document.getElementById('app');
const tabButtons = document.querySelectorAll('nav.tabs button');

async function boot() {
  const res = await fetch('data/texts.json');
  TEXTS = await res.json();
  WYFlashcard.init(TEXTS);
  WYQuiz.init(TEXTS);
  WYWenhao.init(TEXTS);
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
}

function renderList() {
  app.innerHTML = TEXTS.map((t) => {
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
      const t = TEXTS.find((x) => x.id === currentTextId);
      app.innerHTML = `<div class="card"><h2>${t.title}</h2><p style="color:#6b5f4f">${t.author}·${t.era}</p><div class="passage">${t.passage}</div></div>`;
    });
  });
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

function renderQuiz() {
  if (!currentTextId) currentTextId = TEXTS[0]?.id;
  currentQuiz = WYQuiz.buildQuiz(currentTextId, {});
  currentQIdx = 0;
  drawQuiz();
}

function drawQuiz() {
  const q = currentQuiz.questions[currentQIdx];
  if (!q) {
    app.innerHTML = `<div class="card"><h3>本輪練習完成！</h3><p>《${currentQuiz.title}》答對率：${Math.round(WYStore.masteryRatio(currentQuiz.textId) * 100)}%</p></div>`;
    return;
  }
  app.innerHTML = `
    <div class="card">
      <span class="badge">${WYQuiz.typeLabel(q.type)}　第${currentQIdx + 1}/${currentQuiz.questions.length}題</span>
      <p style="font-size:1.05rem;margin-top:10px;">${q.stem}</p>
      <div class="options">
        ${q.options.map((opt, i) => `<button data-i="${i}">${opt}</button>`).join('')}
      </div>
      <div id="feedback"></div>
    </div>`;
  app.querySelectorAll('.options button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      const isCorrect = i === q.answerIdx;
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
    <div class="card">
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
      WYStore.recordAnswer(currentTextId, isCorrect);
      currentBattle = WYBattle.resolveAnswer(currentBattle, isCorrect);
      currentQIdx += 1;
      drawBattle();
    });
  });
}

function renderWenhao() {
  const roster = WYWenhao.roster();
  const s = WYWenhao.summary();
  app.innerHTML = `
    <div class="card">已解鎖 ${s.unlocked} / ${s.total} 篇</div>
    <div class="wenhao-grid">
      ${roster.map((r) => `
        <div class="wenhao-card ${r.unlocked ? '' : 'locked'}">
          <img src="${r.img}" alt="${r.title}" class="wenhao-portrait" />
          <strong>${r.title}</strong>
          <div style="font-size:.8rem;">${r.author}</div>
          <div style="font-size:.8rem;">${r.unlocked ? '已收錄' : `答對率 ${r.progress}%`}</div>
        </div>`).join('')}
    </div>`;
}

boot();
