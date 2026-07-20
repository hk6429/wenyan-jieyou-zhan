/* 解憂草堂——UI 層（DOM 渲染＋事件）。對外只暴露 window.WYCaotang.init(TEXTS) 與 .render(mountEl)。
 * 資料規則全在 js/caotang-store.js（WYCaotangStore）；進度由 WYStore 讀出。缺圖一律 onerror 退回 emoji/CSS。
 */
(function (root) {
  'use strict';

  const CT = root.WYCaotangStore;
  const IMG_DIR = 'assets/caotang';
  let TEXTS = [];
  let state = null;
  let seededOnce = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  // 缺圖時把 <img> 換成帶 emoji 的 span，保住版面尺寸
  const fb = (emoji) =>
    `onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${emoji}',className:'ct-emoji'}))"`;

  function progress() {
    return (root.WYStore && root.WYStore.load()) || { texts: {} };
  }
  function streak() {
    return (root.WYStore && root.WYStore.getStreak && root.WYStore.getStreak()) || { days: 0 };
  }
  function view() {
    return CT.getView(TEXTS, progress(), state, streak());
  }
  function persist() {
    CT.save(state);
  }

  // ── 純渲染：山門＋三院落＋庭園裝飾＋匾額對聯 ──
  function sceneHtml(v) {
    const g = v.gate;
    const plaqueText = v.plaque ? v.plaque.text : '解憂草堂';
    const couplet = v.couplet
      ? `<div class="ct-couplet ct-couplet--up">${esc(v.couplet.up.text)}</div>
         <div class="ct-couplet ct-couplet--down">${esc(v.couplet.down.text)}</div>`
      : '';
    const gate = `
      <button class="ct-gate" type="button" data-stage="${g.stage}" aria-label="山門・${esc(g.name)}，第 ${g.stage + 1} 之 ${g.total} 境">
        <img class="ct-gate-img" src="${IMG_DIR}/gate-s${g.stage + 1}.png" alt="" loading="lazy" ${fb('⛩️')}>
        <span class="ct-plaque">${esc(plaqueText)}</span>
        <span class="ct-gate-rank">文氣・${esc(g.name)}（${g.stage + 1}／${g.total} 境）</span>
      </button>`;

    const courts = v.courtyards.map((c) => `
      <div class="ct-court ct-court--t${c.tier}" data-id="${c.id}" aria-label="${esc(c.name)}・${esc(c.tierName)}・${c.pct}%">
        <img class="ct-court-img" src="${IMG_DIR}/court-${c.id}-t${c.tier + 1}.png" alt="" loading="lazy" ${fb('🏯')}>
        <div class="ct-court-cap">
          <strong>${esc(c.name)}</strong>
          <span class="ct-tier-badge">${esc(c.tierName)}</span>
          <span class="ct-court-pct">${c.pct}%</span>
        </div>
        <div class="ct-progress"><div class="ct-progress-fill" style="width:${c.pct}%"></div></div>
      </div>`).join('');

    const decors = v.decorations.map((d) => `
      <div class="ct-decor ct-decor--${d.kind}" data-decor="${d.id}" style="left:${d.x}%;top:${d.y}%"
           role="button" tabindex="0" aria-label="${esc(d.name)}（可拖曳擺放）">
        <img src="${IMG_DIR}/decor-${d.kind}.png" alt="" draggable="false" loading="lazy" ${fb(d.emoji)}>
      </div>`).join('');

    return `
      <div class="ct-scene" id="ct-scene">
        <div class="ct-bg"><img src="${IMG_DIR}/bg-garden.png" alt="" loading="lazy" ${fb('🏞️')}></div>
        ${couplet}
        <div class="ct-gate-wrap">${gate}</div>
        <div class="ct-courts">${courts}</div>
        <div class="ct-decor-layer">${decors}</div>
      </div>`;
  }

  function statHtml(v) {
    const done = v.decorations.length;
    return `
      <div class="card ct-stat">
        <div><span class="ct-stat-n">${v.gate.masteredCount}</span><small>精通篇</small></div>
        <div><span class="ct-stat-n">${v.scrolls.length}</span><small>掛軸</small></div>
        <div><span class="ct-stat-n">${done}</span><small>庭園裝飾</small></div>
        <div><span class="ct-stat-n">${v.quotePool.length}</span><small>可用名句</small></div>
      </div>`;
  }

  function scrollsHtml(v) {
    const body = v.scrolls.length
      ? v.scrolls.map((s) => `
          <div class="ct-scroll">
            <span class="ct-scroll-title">${esc(s.title)}</span>
            <span class="ct-scroll-author">${esc(s.author)}</span>
          </div>`).join('')
      : '<p class="ct-empty">尚無掛軸——把任一篇選文練到精通（答滿 8 題、答對率 80%），藏書閣就會多一幅掛軸。</p>';
    return `<div class="card"><h3>精通掛軸・藏書閣（${v.scrolls.length}）</h3><div class="ct-scroll-wall">${body}</div></div>`;
  }

  function wallHtml(v) {
    const items = v.achievements.map((a) => `
      <div class="ct-ach ${a.unlocked ? 'is-on' : ''}">
        <span class="ct-ach-name">${a.unlocked ? '🏅 ' : ''}${esc(a.name)}</span>
        <span class="ct-ach-desc">${esc(a.desc)}</span>
        <div class="ct-progress"><div class="ct-progress-fill" style="width:${Math.round((a.now / a.need) * 100)}%"></div></div>
        <span class="ct-ach-num">${a.now}／${a.need}</span>
      </div>`).join('');
    return `<div class="card"><h3>成就牆</h3><div class="ct-ach-grid">${items}</div></div>`;
  }

  function coupletPanelHtml(v) {
    if (!v.quotePool.length) {
      return `<div class="card"><h3>名句題聯</h3><p class="ct-empty">精通選文後，該篇名句才會進入可選清單。讀得越多，可用的句子越多。</p></div>`;
    }
    const opts = ['<option value="">—</option>']
      .concat(v.quotePool.map((q) => `<option value="${esc(q.id)}">${esc(q.text)}（${esc(q.title)}）</option>`))
      .join('');
    const curPlaque = v.plaque ? v.plaque.id : '';
    const curUp = v.couplet ? v.couplet.up.id : '';
    const curDown = v.couplet ? v.couplet.down.id : '';
    return `
      <div class="card ct-lian">
        <h3>名句題聯</h3>
        <p class="ct-hint">匾額與對聯不開放自由輸入，只能從你已精通選文的名句挑選。</p>
        <label class="ct-field"><span>門匾</span>
          <select id="ct-plaque">${opts.replace(`value="${esc(curPlaque)}"`, `value="${esc(curPlaque)}" selected`)}</select>
        </label>
        <label class="ct-field"><span>對聯・上聯</span>
          <select id="ct-up">${opts.replace(`value="${esc(curUp)}"`, `value="${esc(curUp)}" selected`)}</select>
        </label>
        <label class="ct-field"><span>對聯・下聯</span>
          <select id="ct-down">${opts.replace(`value="${esc(curDown)}"`, `value="${esc(curDown)}" selected`)}</select>
        </label>
        <div class="ct-lian-actions">
          <button class="primary" id="ct-apply-lian">掛上門楹</button>
          <button id="ct-clear-lian">取下</button>
        </div>
        <p class="ct-msg" id="ct-lian-msg"></p>
      </div>`;
  }

  function toolbarHtml() {
    return `
      <div class="card ct-toolbar">
        <button id="ct-reset-pos">還原裝飾位置</button>
        <small>拖曳庭園裡的竹、蓮、松、鯉可自由擺放，位置會自動保存。</small>
      </div>`;
  }

  function render(mountEl) {
    if (!mountEl) return;
    if (!state) state = CT.load();
    // 首次開堂：既有進度靜默入帳，避免慶典洪水
    if (!seededOnce && !state.seeded) {
      CT.seedCelebrated(TEXTS, progress(), state);
      persist();
    }
    seededOnce = true;

    const v = view();
    mountEl.innerHTML =
      statHtml(v) +
      `<div class="card ct-scene-card">${sceneHtml(v)}</div>` +
      coupletPanelHtml(v) +
      toolbarHtml() +
      scrollsHtml(v) +
      wallHtml(v);

    bindDrag(mountEl);
    bindLian(mountEl);
    bindTools(mountEl);
    runCelebrations(mountEl, v);
  }

  // ── 拖曳擺放（指標事件，桌機/觸控通用）──
  function bindDrag(mountEl) {
    const scene = mountEl.querySelector('#ct-scene');
    if (!scene) return;
    mountEl.querySelectorAll('.ct-decor').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const rect = scene.getBoundingClientRect();
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-dragging');
        const move = (ev) => {
          const x = ((ev.clientX - rect.left) / rect.width) * 100;
          const y = ((ev.clientY - rect.top) / rect.height) * 100;
          el.style.left = Math.max(4, Math.min(96, x)) + '%';
          el.style.top = Math.max(4, Math.min(96, y)) + '%';
        };
        const up = (ev) => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.classList.remove('is-dragging');
          const x = ((ev.clientX - rect.left) / rect.width) * 100;
          const y = ((ev.clientY - rect.top) / rect.height) * 100;
          CT.placeDecoration(state, el.dataset.decor, x, y);
          persist();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    });
  }

  function bindLian(mountEl) {
    const msg = mountEl.querySelector('#ct-lian-msg');
    const apply = mountEl.querySelector('#ct-apply-lian');
    const clear = mountEl.querySelector('#ct-clear-lian');
    const prog = progress();
    if (apply) apply.addEventListener('click', () => {
      const p = mountEl.querySelector('#ct-plaque').value || null;
      const up = mountEl.querySelector('#ct-up').value || null;
      const down = mountEl.querySelector('#ct-down').value || null;
      const r1 = CT.setPlaque(state, TEXTS, prog, p);
      let r2 = { ok: true };
      if (up && down) r2 = CT.setCouplet(state, TEXTS, prog, up, down);
      else if (!up && !down) CT.setCouplet(state, TEXTS, prog, null, null);
      else r2 = { ok: false, msg: '對聯需同時選上聯與下聯' };
      if (r1.ok && r2.ok) {
        persist();
        render(mountEl);
      } else if (msg) {
        msg.textContent = (r1.msg || r2.msg || '設定失敗');
      }
    });
    if (clear) clear.addEventListener('click', () => {
      CT.setPlaque(state, TEXTS, prog, null);
      CT.setCouplet(state, TEXTS, prog, null, null);
      persist();
      render(mountEl);
    });
  }

  function bindTools(mountEl) {
    const reset = mountEl.querySelector('#ct-reset-pos');
    if (reset) reset.addEventListener('click', () => {
      if (!confirm('要把所有裝飾放回預設位置嗎？（裝飾本身不會消失）')) return;
      CT.resetPlacements(state);
      persist();
      render(mountEl);
    });
  }

  // ── 慶典動畫：未慶祝過的升境／院落升級逐一播放 ──
  function runCelebrations(mountEl, v) {
    const pend = CT.pendingCelebrations(TEXTS, progress(), state);
    if (!pend.length) return;
    const ev = pend[0];
    CT.markCelebrated(state, ev.id);
    persist();
    const layer = document.createElement('div');
    layer.className = 'ct-epic';
    layer.innerHTML = `<div class="ct-epic-card">
      <div class="ct-epic-title">${esc(ev.title)}</div>
      <div class="ct-epic-text">${esc(ev.text)}</div>
    </div>`;
    document.body.appendChild(layer);
    layer.addEventListener('click', () => layer.remove());
    setTimeout(() => {
      layer.remove();
      // 還有其他待慶祝的，續播
      if (CT.pendingCelebrations(TEXTS, progress(), state).length) runCelebrations(mountEl, v);
    }, 2200);
  }

  root.WYCaotang = {
    init(texts) { TEXTS = texts || []; },
    render(mountEl) { render(mountEl); },
    // 供除錯/測試
    _sceneHtml: sceneHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
