// 文魄合契 UI 層：渲染合契坊、解謎揭曉、合契流程、被動二選一、隨行出戰、暱稱與文魄名片 canvas。
// 進場點：WYFusion.init(TEXTS)（boot 呼叫一次）、WYFusion.render(mountEl)（切到「合契」tab）。
// 純邏輯全在 WYFusionStore；本層只做 DOM／事件／canvas 與 WYStore 墨錠讀寫的接線。
const WYFusion = (() => {
  let TEXTS = [];
  let mount = null;

  function init(texts) { TEXTS = Array.isArray(texts) ? texts : []; }

  const textOf = (id) => TEXTS.find((t) => t.id === id) || { id, title: id, author: '' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 供 WYFusionStore 純函式用的瀏覽器 deps：墨錠走 WYStore，精通度走 WYStore，篇名走 TEXTS。
  function deps() {
    return {
      rng: Math.random,
      getInk: () => WYStore.getInk(),
      spendInk: (a) => WYStore.spendInk(a),
      addInk: (a) => WYStore.addInk(a),
      mastery: (tid) => {
        const t = WYStore.getTextState(tid);
        return { mastered: t.mastered === true, ratio: WYStore.masteryRatio(tid), total: t.total };
      },
      title: (tid) => textOf(tid).title,
      author: (tid) => textOf(tid).author,
    };
  }

  const imgTag = (src, alt, cls) =>
    `<img src="${esc(String(src || '').replace(/\.png$/i, '.webp'))}" alt="${esc(alt)}" class="${cls}" onerror="this.classList.add('img-fallback');this.removeAttribute('src');" />`;

  function render(mountEl) {
    mount = mountEl;
    draw();
  }

  function draw() {
    const fusion = WYFusionStore.loadFusion();
    const list = WYFusionStore.listWenpo(fusion);
    const ownedCount = list.filter((w) => w.owned).length;
    const nickname = fusion.nickname;
    mount.innerHTML = `
      <div class="card fusion-head">
        <div class="fusion-head-row">
          <div><h3 style="margin:0;">文魄合契</h3>
            <p class="fusion-sub">兩位文豪結為知音，喚醒共同精神所化的文魄。</p></div>
          <div class="fusion-ink">墨錠 <strong>${WYStore.getInk()}</strong></div>
        </div>
        ${ownedCount === 0 ? `<div class="fusion-onboard">還沒喚醒文魄？合契需要先<b>精通兩篇</b>（各答對率 ≥80%、作答 ≥30 題）。先去讀文章＋自測吧。<button class="fusion-mini-btn" id="fusion-go-list">去選文自測 →</button></div>` : ''}
        <div class="fusion-meta-row">
          <span class="badge">已喚醒 ${ownedCount} / 6</span>
          <span class="fusion-nick">道號：<strong>${nickname ? esc(nickname) : '（未設）'}</strong>
            <button class="fusion-mini-btn" id="editNick">${nickname ? '改' : '設定'}</button></span>
        </div>
        <p class="fusion-rule">合契需 ${WYFusionStore.FUSE_COST} 墨錠。資格：兩篇皆符合四題型核心精通門檻，且各累積作答 ≥30 題；達標後保證成功。墨錠不可兌換現實金錢或禮物。</p>
      </div>
      <div class="fusion-grid">
        ${list.map((w) => cardHtml(w, fusion)).join('')}
      </div>`;
    bind(fusion);
  }

  function cardHtml(w, fusion) {
    if (!w.revealed) {
      // 未揭曉：剪影 + ??? + 解謎入口（未知性）
      return `
        <div class="card wenpo-card masked" data-id="${w.id}">
          <div class="wenpo-silhouette">？</div>
          <strong>神秘文魄</strong>
          <p class="wenpo-desc">答對一題「跨兩篇的隱藏綜合題」即可揭曉此文魄的真身。</p>
          <button class="primary wenpo-reveal-btn" data-id="${w.id}">解謎揭曉</button>
        </div>`;
    }
    const p = w.parents.map((tid) => `${esc(textOf(tid).title)}·${esc(textOf(tid).author)}`).join(' × ');
    if (!w.owned) {
      const e = WYFusionStore.getEligibility(fusion, w.id, deps());
      const parentRows = e.parents.map((pr) => `
        <div class="parent-row ${pr.ok ? 'ok' : ''}">
          <span>${esc(pr.title)}</span>
          <span>${Math.round(pr.ratio * 100)}%・${pr.total}題 ${pr.ok ? '✓' : ''}</span>
        </div>`).join('');
      return `
        <div class="card wenpo-card revealed" data-id="${w.id}">
          ${imgTag(w.img, w.name, 'wenpo-portrait')}
          <strong>${esc(w.name)}</strong>
          <p class="wenpo-pair">${p}</p>
          <p class="wenpo-desc">${esc(w.desc)}</p>
          <div class="parent-stats">${parentRows}</div>
          <button class="primary wenpo-fuse-btn" data-id="${w.id}" ${e.eligible ? '' : 'disabled'}>
            ${e.eligible ? `合契（${WYFusionStore.FUSE_COST} 墨錠）` : (e.reasons.parents ? '墨錠不足' : '資格未達')}
          </button>
        </div>`;
    }
    // 已擁有：立繪 + 被動狀態 + 隨行 + 名片
    const chosen = w.passives.find((x) => x.id === w.passive);
    const passiveHtml = w.passive
      ? `<div class="wenpo-passive-set">被動：<strong>${esc(chosen.name)}</strong>（${esc(chosen.desc)}）</div>`
      : `<div class="wenpo-passive-pick">
           <p class="pick-label">選一個被動（一次定終身）：</p>
           ${w.passives.map((x) => `<button class="passive-btn" data-id="${w.id}" data-passive="${x.id}"><strong>${esc(x.name)}</strong>：${esc(x.desc)}</button>`).join('')}
         </div>`;
    return `
      <div class="card wenpo-card owned" data-id="${w.id}">
        ${imgTag(w.img, w.name, 'wenpo-portrait')}
        <strong>${esc(w.name)}</strong>${w.isActive ? '<span class="badge active-badge">隨行中</span>' : ''}
        <p class="wenpo-pair">${p}</p>
        ${passiveHtml}
        <div class="wenpo-actions">
          <button class="fusion-mini-btn follow-btn" data-id="${w.id}">${w.isActive ? '收起隨行' : '帶牠出戰'}</button>
          <button class="fusion-mini-btn card-btn" data-id="${w.id}">下載名片</button>
        </div>
      </div>`;
  }

  function bind(fusion) {
    const q = (sel) => mount.querySelectorAll(sel);
    const goList = mount.querySelector('#fusion-go-list');
    if (goList) goList.onclick = () => { if (typeof setActiveTab === 'function') setActiveTab('list'); if (typeof renderList === 'function') renderList(); };
    const nick = mount.querySelector('#editNick');
    if (nick) nick.onclick = () => {
      const cur = fusion.nickname || '';
      const val = window.prompt('輸入你的道號（1–8 字）：', cur);
      if (val === null) return;
      WYFusionStore.setNickname(fusion, val);
      WYFusionStore.saveFusion(fusion);
      draw();
    };
    q('.wenpo-reveal-btn').forEach((b) => { b.onclick = () => openRiddle(b.dataset.id); });
    q('.wenpo-fuse-btn').forEach((b) => { b.onclick = () => doFuse(b.dataset.id); });
    q('.passive-btn').forEach((b) => {
      b.onclick = () => {
        WYFusionStore.chooseWenpoPassive(fusion, b.dataset.id, b.dataset.passive);
        WYFusionStore.saveFusion(fusion);
        draw();
      };
    });
    q('.follow-btn').forEach((b) => {
      b.onclick = () => {
        const cur = WYFusionStore.loadFusion();
        WYFusionStore.setActive(cur, cur.active === b.dataset.id ? null : b.dataset.id);
        WYFusionStore.saveFusion(cur);
        draw();
      };
    });
    q('.card-btn').forEach((b) => { b.onclick = () => downloadCard(b.dataset.id); });
  }

  // 配方揭曉解謎 overlay
  function openRiddle(wenpoId) {
    const w = WYFusionStore.WENPO_BY_ID.get(wenpoId);
    const r = w.riddle;
    const ov = overlay(`
      <h3>知音之試</h3>
      <p class="riddle-q">${esc(r.q)}</p>
      <div class="riddle-options">
        ${r.options.map((o, i) => `<button class="riddle-opt" data-i="${i}">${esc(o)}</button>`).join('')}
      </div>
      <div id="riddleFeedback"></div>`);
    ov.querySelectorAll('.riddle-opt').forEach((btn) => {
      btn.onclick = () => {
        const fusion = WYFusionStore.loadFusion();
        const res = WYFusionStore.answerRiddle(fusion, wenpoId, Number(btn.dataset.i));
        WYFusionStore.saveFusion(fusion);
        ov.querySelectorAll('.riddle-opt').forEach((b) => { b.disabled = true; });
        const fb = ov.querySelector('#riddleFeedback');
        if (res.correct) {
          fb.innerHTML = `<p class="ok-line">揭曉了——這是「${esc(w.name)}」。</p><button class="primary" id="riddleClose">回合契坊</button>`;
        } else {
          fb.innerHTML = `<p class="bad-line">未中知音之心，且再讀書，改日再試。</p><button class="primary" id="riddleClose">關閉</button>`;
        }
        ov.querySelector('#riddleClose').onclick = () => { closeOverlay(ov); draw(); };
      };
    });
  }

  function doFuse(wenpoId) {
    const fusion = WYFusionStore.loadFusion();
    const res = WYFusionStore.fuse(fusion, wenpoId, deps());
    WYFusionStore.saveFusion(fusion);
    if (!res.ok) { draw(); return; }
    const w = WYFusionStore.WENPO_BY_ID.get(wenpoId);
    const ov = overlay(`
      <div class="fuse-burst">✦</div>
      <h3>文魄喚醒：${esc(w.name)}</h3>
      <p class="born-line">${esc(res.wenpo.bornLine)}</p>
      <button class="primary" id="fuseClose">收下這位知音</button>`);
    ov.querySelector('#fuseClose').onclick = () => { closeOverlay(ov); draw(); };
  }

  function overlay(inner) {
    const ov = document.createElement('div');
    ov.className = 'fusion-overlay';
    ov.innerHTML = `<div class="fusion-overlay-box">${inner}</div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov) closeOverlay(ov); });
    document.body.appendChild(ov);
    return ov;
  }
  function closeOverlay(ov) { ov.remove(); }

  // 文魄名片：canvas 直式分享卡，下載 png。缺立繪時以文字徽記替代，不阻斷下載。
  function downloadCard(wenpoId) {
    const fusion = WYFusionStore.loadFusion();
    const w = WYFusionStore.WENPO_BY_ID.get(wenpoId);
    const W = 720, H = 1000;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#f5ecd6'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#9e3b2c'; g.lineWidth = 8; g.strokeRect(24, 24, W - 48, H - 48);
    g.fillStyle = '#8a6a3b'; g.font = '28px "Noto Serif TC", serif';
    g.textAlign = 'center';
    g.fillText('文言解憂站 · 文魄名片', W / 2, 90);

    const paint = () => {
      g.fillStyle = '#3a2f22';
      g.font = 'bold 60px "Ma Shan Zheng","Noto Serif TC",serif';
      g.fillText(w.name, W / 2, 640);
      g.fillStyle = '#6b5f52'; g.font = '30px "Noto Serif TC",serif';
      const pair = w.parents.map((tid) => textOf(tid).title).join(' × ');
      g.fillText(pair, W / 2, 700);
      const chosen = w.passives.find((x) => x.id === fusion.wenpo[wenpoId].passive);
      if (chosen) g.fillText(`被動・${chosen.name}`, W / 2, 748);
      // 誕生台詞折行
      g.font = '26px "Noto Serif TC",serif'; g.fillStyle = '#4a3f30';
      wrap(g, w.bornLine, W / 2, 810, W - 140, 40);
      if (fusion.nickname) {
        g.font = '26px "Noto Serif TC",serif'; g.fillStyle = '#8a6a3b';
        g.fillText(`— 道號 ${fusion.nickname} —`, W / 2, 950);
      }
      const url = c.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = `文魄名片-${w.name}.png`; a.click();
    };

    const img = new Image();
    img.onload = () => { g.drawImage(img, W / 2 - 220, 130, 440, 440); paint(); };
    img.onerror = () => {
      g.fillStyle = '#e7dabb'; g.fillRect(W / 2 - 220, 130, 440, 440);
      g.fillStyle = '#9e3b2c'; g.font = 'bold 160px serif'; g.textAlign = 'center';
      g.fillText(w.element[0], W / 2, 400);
      g.textAlign = 'center'; paint();
    };
    img.src = w.img;
  }

  function wrap(g, text, cx, y, maxW, lh) {
    const chars = String(text).split('');
    let line = '', yy = y;
    for (const ch of chars) {
      if (g.measureText(line + ch).width > maxW) { g.fillText(line, cx, yy); line = ch; yy += lh; }
      else line += ch;
    }
    if (line) g.fillText(line, cx, yy);
  }

  return { init, render };
})();

if (typeof window !== 'undefined') window.WYFusion = WYFusion;
