// 文房市集 UI 層：逛市集／上架／我的掛單（領款・下架）／集市達人／曾經持有／我的文房（裝備）。
// 進場點：WYMarket.init(TEXTS)（boot 呼叫一次，可省）、WYMarket.render(mountEl)（切到「市集」tab；mountEl=#app）。
// 純邏輯全在 WYMarketStore；金流走 WYStore（墨錠）；網路一律 WYAPI.call('/api/market')，⛔ 全檔唯一出口、禁裸 fetch。
const WYMarket = (() => {
  let mount = null;
  let tab = 'yanling';   // 預設落在硯靈行商（平日恆開、免班級碼），避免第一次進市集就撞「未開市／需設定」死牆
  let scope = 'class';   // browse 子範圍：class | pub
  const S = () => window.WYMarketStore;

  function init() { /* 目前不需 TEXTS；保留簽名供主線程 boot 呼叫 */ }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const imgTag = (src, alt, cls) => `<img src="${esc(String(src || '').replace(/\.png$/i, '-thumb.webp'))}" alt="${esc(alt)}" class="${cls}" onerror="this.classList.add('img-fallback');this.removeAttribute('src');" />`;
  const now = () => Date.now();
  const toast = (msg) => { const el = document.getElementById('mkt-status'); if (el) { el.textContent = msg; el.classList.add('mkt-flash'); setTimeout(() => el.classList.remove('mkt-flash'), 800); } };

  async function callMarket(body) {
    try { return await WYAPI.call('/api/market', { body }); } catch { return null; }
  }

  function render(mountEl) { mount = mountEl; draw(); }

  function draw() {
    const cc = WYStore.getClassCode();
    const nick = S().getNick();
    const open = S().isMarketOpen(now());
    mount.innerHTML = `
      <div class="card mkt-head">
        <div class="mkt-head-row">
          <div><h3 style="margin:0;">文房市集</h3>
            <p class="mkt-sub">同窗之間交換筆墨紙硯——文豪與文魄是師友，不是商品。</p></div>
          <div class="mkt-ink">墨錠 <strong>${WYStore.getInk()}</strong></div>
        </div>
        <div class="mkt-meta-row">
          <span class="mkt-badge ${open ? 'mkt-open' : 'mkt-closed'}">${open ? '🔥 開市中' : '⏳ ' + esc(S().nextOpenText(now()))}</span>
          <span class="mkt-idrow">班級：<strong>${cc ? esc(cc) : '（未設）'}</strong>　道號：<strong>${nick ? esc(nick) : '（未設）'}</strong>
            <button class="mkt-mini-btn" id="mkt-setid">${cc && nick ? '改' : '設定'}</button></span>
        </div>
        <div id="mkt-status" class="mkt-statusline"></div>
      </div>
      <details class="card mkt-rules">
        <summary>📜 集市規則（點開）</summary>
        <ul class="mkt-rule-list">
          <li><strong>墨錠不可兌換現實金錢或禮物</strong>，純為站內練功樂趣。</li>
          <li>只交易文房四寶道具（筆／墨／紙／硯）；文豪、文魄一律不可交易。</li>
          <li>定價公開透明依品階：凡品 40–120、良品 75–225、珍品 150–450 墨錠，無隱藏折扣。</li>
          <li>成交抽 10% 交易稅（墨錠回收）；賣出後回「我的掛單」領貨款。</li>
          <li>每日限購 3 件、每人同時最多掛 3 筆；珍品每班每週限量 10 件。</li>
          <li>每週五 16:00 至週日夜間開市，平日僅供瀏覽。</li>
          <li>預設只在同班可見可交易，公開到全站為自選；購買僅能選預設感謝小卡，不開放自由留言。</li>
        </ul>
      </details>
      <div class="mkt-tabs" id="mkt-tabs">
        ${tabBtn('yanling', '硯靈行商')}${tabBtn('browse', '逛市集')}${tabBtn('gear', '我的文房')}${tabBtn('sell', '我要上架')}${tabBtn('mine', '我的掛單')}${tabBtn('stars', '集市達人')}${tabBtn('ever', '曾經持有')}
      </div>
      <div id="mkt-body"></div>`;

    document.getElementById('mkt-setid').onclick = editIdentity;
    mount.querySelectorAll('.mkt-tab-btn').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
    drawBody();
  }

  const tabBtn = (key, label) => `<button class="mkt-tab-btn ${tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`;

  function needIdentity() {
    return `<div class="card mkt-guide">這一區是同班／全站同學之間的交易，需先設定班級代碼與道號。<br>還沒有班級也沒關係——左邊「硯靈行商」平日就能用墨錠直接買基礎文房。<br><button class="primary" id="mkt-go-setid">設定班級與道號</button></div>`;
  }

  function drawBody() {
    const body = document.getElementById('mkt-body');
    const cc = WYStore.getClassCode();
    const nick = S().getNick();
    // 硯靈行商不需班級碼／道號，單機玩家也能買基礎文房；放在身分關卡之前。
    if (tab === 'yanling') return drawYanling(body);
    if (!cc || !nick) {
      body.innerHTML = needIdentity();
      document.getElementById('mkt-go-setid').onclick = editIdentity;
      return;
    }
    if (tab === 'browse') return drawBrowse(body, cc, nick);
    if (tab === 'gear') return drawGear(body);
    if (tab === 'sell') return drawSell(body, cc, nick);
    if (tab === 'mine') return drawMine(body);
    if (tab === 'stars') return drawStars(body, cc);
    if (tab === 'ever') return drawEver(body);
  }

  // —— 逛市集 ——
  async function drawBrowse(body, cc, nick) {
    body.innerHTML = `
      <div class="mkt-subtabs">
        <button class="mkt-subtab ${scope === 'class' ? 'active' : ''}" data-s="class">本班集市</button>
        <button class="mkt-subtab ${scope === 'pub' ? 'active' : ''}" data-s="pub">全站集市</button>
      </div>
      <div id="mkt-list" class="mkt-list"><div class="card mkt-loading">載入中…</div></div>`;
    body.querySelectorAll('.mkt-subtab').forEach((b) => { b.onclick = () => { scope = b.dataset.s; drawBrowse(body, cc, nick); }; });
    const res = await callMarket(scope === 'pub' ? { op: 'list', scope: 'pub' } : { op: 'list', classCode: cc, scope: 'class' });
    const list = document.getElementById('mkt-list');
    if (!list) return;
    if (!res || res.ok !== 1) { list.innerHTML = '<div class="card mkt-offline">📡 連不上集市伺服器，稍後再試（不影響其他練功）。</div>'; return; }
    const items = (res.list || []).filter((it) => it.seller !== nick); // 自己的掛單不顯示在購買列
    if (!items.length) { list.innerHTML = '<div class="card mkt-empty">目前沒有掛單。' + (S().isMarketOpen(now()) ? '去「我要上架」擺攤吧！' : '週五 16:00 開市。') + '</div>'; return; }
    list.innerHTML = items.map(cardHtml).join('');
    list.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => startBuy(b.dataset.buy, Number(b.dataset.price), b.dataset.gear, cc, nick); });
  }

  function cardHtml(it) {
    const g = S().GEAR_BY_ID[it.gearId] || { name: it.gearId, cat: '', img: '' };
    const tier = S().tierOf(it.gearId), grade = tier ? S().TIER_GRADE[tier] : 0;
    const open = S().isMarketOpen(now());
    return `<div class="card mkt-card mkt-g${grade}">
        <div class="mkt-card-main">
          ${imgTag(g.img, g.name, 'mkt-card-img')}
          <div class="mkt-card-info">
            <strong class="mkt-card-name">${esc(g.name)}</strong>
            <div class="mkt-card-sub"><span class="mkt-tier mkt-tier-g${grade}">${tier ? S().TIER_LABEL[tier] : ''}</span>　${esc(S().CAT_LABEL[g.cat] || '')}${it.reserved ? '　🔒保留單' : ''}</div>
            <div class="mkt-card-seller">賣家：${esc(it.seller)}</div>
          </div>
          <div class="mkt-card-price">${it.price} 墨</div>
        </div>
        ${open ? `<button class="primary mkt-buy-btn" data-buy="${esc(it.id)}" data-price="${it.price}" data-gear="${esc(it.gearId)}">購買</button>` : '<div class="mkt-closed-hint">平日僅供瀏覽</div>'}
      </div>`;
  }

  // —— 購買（本機三擋 → 感謝小卡 → buy）——
  function startBuy(id, price, gearId, cc, nick) {
    if (!S().isMarketOpen(now())) return toast('尚未開市');
    if (S().buysToday(now()) >= S().DAILY_BUY_CAP) return toast('今日已購滿 3 件，明天再來');
    if (WYStore.getInk() < price) return toast('墨錠不足');
    if (S().loadGear().owned.includes(gearId)) { if (!confirm('你已擁有這件文房寶貝，仍要再收一件嗎？')) return; }
    showThanksPicker((cardId) => doBuy(id, price, gearId, cc, nick, cardId));
  }

  function showThanksPicker(onPick) {
    const ov = document.createElement('div');
    ov.className = 'mkt-modal';
    ov.innerHTML = `<div class="mkt-modal-box">
        <h4>挑一張感謝小卡送給賣家</h4>
        <div class="mkt-cards">
          ${S().THANKS_CARDS.map((c) => `<button class="mkt-thanks" data-c="${c.id}">${esc(c.text)}</button>`).join('')}
          <button class="mkt-thanks mkt-thanks-none" data-c="0">這次不送</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelectorAll('.mkt-thanks').forEach((b) => { b.onclick = () => { ov.remove(); onPick(Number(b.dataset.c)); }; });
  }

  async function doBuy(id, price, gearId, cc, nick, cardId) {
    if (!WYStore.spendInk(price)) { toast('墨錠不足'); return; }
    const res = await callMarket({ op: 'buy', id, nick, classCode: cc, cardId });
    if (!res || res.ok !== 1) { WYStore.addInk(price); toast((res && res.error) || '購買失敗，墨錠已退回'); if (res && res.error) draw(); return; }
    S().addOwned(res.gearId);
    S().bumpBuys(now());
    S().recordEverOwned({ gearId: res.gearId, dir: 'bought', peer: '', ts: now() });
    toast(`購得「${S().GEAR_BY_ID[res.gearId]?.name || res.gearId}」！`);
    draw();
  }

  // —— 我的文房（擁有＋裝備出戰）——
  function drawGear(body) {
    const owned = S().sellableGear();
    const mods = S().activeGearMods();
    const dup = new Set(S().duplicateIds());
    if (!owned.length) { body.innerHTML = '<div class="card mkt-empty">還沒有文房道具。對戰勝利與篇目精通有機會掉落，或到集市購入。</div>'; return; }
    body.innerHTML = `
      <div class="card mkt-gear-summary">裝備加成：對戰傷害 +${mods.damageBonus}　墨錠掉落 +${Math.round(mods.inkDropBonus * 100)}%
        <div class="mkt-gear-hint">最多裝備 ${S().EQUIP_MAX} 件；筆／硯加傷害、墨／紙加墨錠掉落。裝備也擺飾在你的草堂。</div></div>
      <div class="mkt-list">${owned.map((g) => {
        const eq = S().isEquipped(g.id);
        return `<div class="card mkt-card mkt-g${g.grade}">
          <div class="mkt-card-main">${imgTag(g.img, g.name, 'mkt-card-img')}
            <div class="mkt-card-info"><strong class="mkt-card-name">${esc(g.name)}</strong>
              <div class="mkt-card-sub"><span class="mkt-tier mkt-tier-g${g.grade}">${g.tierLabel}</span>　${esc(g.catLabel)}</div></div>
            <button class="mkt-equip-btn ${eq ? 'on' : ''}" data-eq="${esc(g.id)}">${eq ? '✓ 已裝備' : '裝備'}</button>
            ${dup.has(g.id) ? `<button class="mkt-mini-btn" data-melt="${esc(g.id)}">熔煉重複件・回收 5 墨</button>` : ''}
          </div></div>`;
      }).join('')}</div>`;
    body.querySelectorAll('[data-eq]').forEach((b) => { b.onclick = () => {
      const r = S().toggleEquip(b.dataset.eq);
      if (!r.ok && r.reason === 'full') return toast(`最多裝備 ${S().EQUIP_MAX} 件`);
      drawGear(body);
    }; });
    body.querySelectorAll('[data-melt]').forEach((b) => { b.onclick = () => {
      if (!S().removeOwned(b.dataset.melt).ok) return;
      WYStore.earnInk(5); toast('重複文房已熔煉，回收墨錠受每日上限約束。'); drawGear(body);
    }; });
  }

  // —— 上架 ——
  async function drawSell(body, cc, nick) {
    if (!S().isMarketOpen(now())) { body.innerHTML = '<div class="card mkt-empty">⏳ 今日僅供瀏覽——週五 16:00 開市才能上架。</div>'; return; }
    const gears = S().sellableGear();
    if (!gears.length) { body.innerHTML = '<div class="card mkt-empty">你手上還沒有可上架的文房道具。</div>'; return; }
    body.innerHTML = `<div class="card"><p class="mkt-sub">選一件擺上集市（上架後從你的文房移出，賣出後回「我的掛單」領款）：</p>
      <div class="mkt-sell-grid">${gears.map((g) => `<button class="mkt-sell-pick mkt-g${g.grade}" data-id="${esc(g.id)}">${imgTag(g.img, g.name, 'mkt-sell-img')}<span>${esc(g.name)}</span><span class="mkt-tier mkt-tier-g${g.grade}">${g.tierLabel}</span></button>`).join('')}</div>
      <div id="mkt-sell-form"></div></div>`;
    // 取本班名單供保留單下拉（拿不到就隱藏保留功能）
    let roster = [];
    const st = await callMarket({ op: 'stars', classCode: cc });
    if (st && st.ok === 1) roster = st.top.map((x) => x.name).filter((n) => n !== nick);
    body.querySelectorAll('.mkt-sell-pick').forEach((b) => { b.onclick = () => sellForm(b.dataset.id, cc, nick, roster); });
  }

  function sellForm(gearId, cc, nick, roster) {
    const [lo, hi] = S().bandOf(gearId);
    const g = S().GEAR_BY_ID[gearId];
    const form = document.getElementById('mkt-sell-form');
    form.innerHTML = `
      <div class="mkt-form">
        <div class="mkt-form-row">上架「${esc(g.name)}」　定價帶：${lo}–${hi} 墨錠</div>
        <label class="mkt-form-row">定價 <input type="number" id="mkt-price" min="${lo}" max="${hi}" value="${lo}" /></label>
        ${roster.length ? `<label class="mkt-form-row">保留給同班同學
          <select id="mkt-reserve"><option value="">（不保留，全班可買）</option>${roster.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select></label>` : ''}
        <label class="mkt-form-row mkt-check"><input type="checkbox" id="mkt-pub" /> 公開到全站集市（預設只限本班）</label>
        <button class="primary" id="mkt-post-go">確認上架</button>
      </div>`;
    document.getElementById('mkt-post-go').onclick = async () => {
      const price = Math.round(Number(document.getElementById('mkt-price').value) || 0);
      if (price < lo || price > hi) return toast(`定價要在 ${lo}–${hi} 墨錠`);
      const reserveFor = (document.getElementById('mkt-reserve') || {}).value || '';
      const pub = document.getElementById('mkt-pub').checked ? 1 : 0;
      const res = await callMarket({ op: 'post', gearId, price, seller: nick, classCode: cc, pub, reserveFor: reserveFor || undefined });
      if (!res || res.ok !== 1) return toast((res && res.error) || '上架失敗');
      S().removeOwned(gearId);
      S().addClaim({ id: res.id, claimKey: res.claimKey, gearId, price, reserveFor });
      tab = 'mine'; draw();
      toast('已上架！賣出後回這裡領貨款。');
    };
  }

  // —— 我的掛單（領款・下架）——
  function drawMine(body) {
    const claims = S().getClaims();
    if (!claims.length) { body.innerHTML = '<div class="card mkt-empty">目前沒有掛單。上架後在這裡追蹤與領款。</div>'; return; }
    body.innerHTML = `<div class="mkt-list">${claims.map((c) => {
      const g = S().GEAR_BY_ID[c.gearId] || { name: c.gearId };
      return `<div class="card mkt-card"><div class="mkt-card-main">
          <div class="mkt-card-info"><strong class="mkt-card-name">${esc(g.name)}</strong>
            <div class="mkt-card-sub">定價 ${c.price} 墨${c.reserveFor ? '　🔒保留給 ' + esc(c.reserveFor) : ''}</div></div>
          <button class="primary mkt-check-btn" data-id="${esc(c.id)}">檢查/領款</button>
        </div><div class="mkt-mine-result" data-r="${esc(c.id)}"></div></div>`;
    }).join('')}</div>`;
    body.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => checkClaim(b.dataset.id); });
  }

  async function checkClaim(id) {
    const c = S().getClaims().find((x) => x.id === id);
    if (!c) return;
    const out = document.querySelector(`[data-r="${CSS.escape(id)}"]`);
    const res = await callMarket({ op: 'claim', id, claimKey: c.claimKey });
    if (!res) { if (out) out.textContent = '📡 連不上伺服器'; return; }
    if (res.ok === 1) {
      const net = res.pearls;
      WYStore.addInk(net);
      S().removeClaim(id);
      S().recordEverOwned({ gearId: c.gearId, dir: 'sold', peer: res.buyer || '', ts: now() });
      const card = S().THANKS_CARDS.find((k) => k.id === res.card);
      if (out) out.innerHTML = `✅ 已售出！入帳 ${net} 墨（已扣 10% 稅）${res.buyer ? '　買家：' + esc(res.buyer) : ''}${card ? `<div class="mkt-thanks-got">💌 ${esc(card.text)}</div>` : ''}`;
      setTimeout(draw, 1600);
      return;
    }
    if (res.sold === 0) {
      // 未售出 → 提供下架拿回
      if (out) { out.innerHTML = '尚未售出。<button class="mkt-mini-btn" data-cancel="' + esc(id) + '">下架拿回</button>'; out.querySelector('[data-cancel]').onclick = () => cancelClaim(id); }
      return;
    }
    // 找不到/已領過 → 自癒清掉本機 claim
    S().removeClaim(id);
    if (out) out.textContent = res.error || '此掛單已失效';
    setTimeout(draw, 1200);
  }

  async function cancelClaim(id) {
    const c = S().getClaims().find((x) => x.id === id);
    if (!c) return;
    const res = await callMarket({ op: 'cancel', id, claimKey: c.claimKey });
    if (!res || res.ok !== 1) return toast((res && res.error) || '下架失敗');
    S().addOwned(res.gearId);
    S().removeClaim(id);
    toast('已下架，文房道具已收回。');
    draw();
  }

  // —— 集市達人 ——
  async function drawStars(body, cc) {
    body.innerHTML = '<div class="card mkt-loading">載入中…</div>';
    const res = await callMarket({ op: 'stars', classCode: cc });
    if (!res || res.ok !== 1) { body.innerHTML = '<div class="card mkt-offline">📡 連不上集市伺服器。</div>'; return; }
    if (!res.top || !res.top.length) { body.innerHTML = '<div class="card mkt-empty">本週還沒有人成交——當第一個吧！</div>'; return; }
    body.innerHTML = `<div class="card"><h4 style="margin:.2em 0;">🏆 本班集市達人</h4>
      <ol class="mkt-stars">${res.top.map((x, i) => `<li class="${i === 0 ? 'mkt-champ' : ''}"><span class="mkt-rank">${i + 1}</span><span class="mkt-star-name">${esc(x.name)}${i === 0 ? ' 🏆' : ''}</span><span class="mkt-star-deals">成交 ${x.deals} 筆</span></li>`).join('')}</ol>
      <p class="mkt-gear-hint">只記成交筆數、不比財富——流通越多越風光。</p></div>`;
  }

  // —— 曾經持有 ——
  function drawEver(body) {
    const ever = S().getEverOwned();
    if (!ever.length) { body.innerHTML = '<div class="card mkt-empty">還沒有交易紀錄。買進或賣出後，這裡會留下你的文房足跡。</div>'; return; }
    body.innerHTML = `<div class="card"><p class="mkt-sub">賣掉的寶物也在收藏冊留名，擁有感不清零。</p>
      <div class="mkt-list">${ever.map((e) => {
        const g = S().GEAR_BY_ID[e.gearId] || { name: e.gearId, img: '' };
        const when = new Date(e.ts).toISOString().slice(0, 10);
        const line = e.dir === 'sold' ? `售予 ${esc(e.peer || '同窗')}` : `購自集市${e.peer ? ' ' + esc(e.peer) : ''}`;
        return `<div class="card mkt-card mkt-ever"><div class="mkt-card-main">${imgTag(g.img, g.name, 'mkt-card-img')}
          <div class="mkt-card-info"><strong class="mkt-card-name">${esc(g.name)}</strong>
            <div class="mkt-card-sub">${line}　${when}</div></div>
          <span class="mkt-dir mkt-dir-${e.dir}">${e.dir === 'sold' ? '售出' : '購入'}</span></div></div>`;
      }).join('')}</div></div>`;
  }

  // —— 硯靈行商（NPC 直購，不需班級碼、每日皆可）——
  function drawYanling(body) {
    const stock = S().yanlingStock();
    body.innerHTML = `
      <div class="card mkt-yanling-head">
        <p class="mkt-sub">🖋️ 硯靈平日擺攤：凡品、良品與純外觀都有，隨買隨得；不販售精通捷徑。</p>
        <div class="mkt-card-main"><button class="primary" id="buyHint">30 墨・提示券（現有 ${WYStore.getHintTickets()}）</button><button class="primary" id="buyDecor">45 墨・限定仙鶴（庭園，至多 4 隻）</button></div>
      </div>
      <div class="mkt-list">
        ${stock.map((g) => `
          <div class="card mkt-card">
            <div class="mkt-card-main">${imgTag(g.img, g.name, 'mkt-card-img')}
              <div class="mkt-card-info">
                <strong class="mkt-card-name">${esc(g.name)}</strong>
                <div class="mkt-card-sub">${esc(g.catLabel)}・${esc(g.tierLabel)}　${esc(g.desc)}</div>
              </div>
              <button class="primary mkt-buy-btn" data-yl="${esc(g.id)}" data-price="${g.price}">${g.price} 墨・購入</button>
            </div>
          </div>`).join('')}
      </div>`;
    body.querySelectorAll('.mkt-buy-btn[data-yl]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.yl;
        if (!S().GEAR_BY_ID[id]) return toast('查無此物');
        const price = Number(b.dataset.price);
        if (!WYStore.spendInk(price)) return toast('墨錠不足');
        S().addOwned(id);
        S().recordEverOwned({ gearId: id, dir: 'buy', peer: '硯靈行商' });
        toast(`購入 ${S().GEAR_BY_ID[id].name}！`);
        draw();
      };
    });
    document.getElementById('buyHint').onclick = () => { if (!WYStore.buyHintTicket()) return toast('墨錠不足'); toast('提示券已入袋；答錯時可排除一個誘答。'); draw(); };
    document.getElementById('buyDecor').onclick = () => { const r = WYStore.buyCaotangDecor(); if (r === 'capped') return toast('仙鶴已滿（庭園上限 4 隻）'); if (!r) return toast('墨錠不足'); toast('限定仙鶴已入庭園！到解憂草堂看看～'); draw(); };
  }

  // —— 設定班級與道號 ——
  function editIdentity() {
    const ov = document.createElement('div');
    ov.className = 'mkt-modal';
    ov.innerHTML = `<div class="mkt-modal-box">
        <h4>設定班級與道號</h4>
        <label class="mkt-form-row">班級代碼（4~8 英數）<input id="mkt-cc" maxlength="8" value="${esc(WYStore.getClassCode() || '')}" /></label>
        <label class="mkt-form-row">道號（暱稱，最多 12 字）<input id="mkt-nk" maxlength="12" value="${esc(S().getNick())}" /></label>
        <div class="mkt-form-row"><button class="primary" id="mkt-save-id">儲存</button> <button class="mkt-mini-btn" id="mkt-cancel-id">取消</button></div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.getElementById('mkt-cancel-id').onclick = () => ov.remove();
    document.getElementById('mkt-save-id').onclick = () => {
      const cc = WYStore.setClassCode(document.getElementById('mkt-cc').value);
      const nk = S().setNick(document.getElementById('mkt-nk').value);
      if (!cc) return toast('班級代碼需 4~8 碼英數');
      if (!nk) return toast('請輸入道號');
      ov.remove(); draw();
    };
  }

  return { init, render };
})();
if (typeof window !== 'undefined') window.WYMarket = WYMarket;
