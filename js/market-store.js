// 文房市集邏輯層：道具庫／價格帶／開市時窗／掉落規則／擁有＋裝備／每日限購／claims 領款單／曾經持有留痕。
// 純邏輯零 DOM；金流（墨錠）由 UI 層走 WYStore，本層不碰。localStorage 一律 wy_mkt_ 前綴、可注入 storage 測試。
// 前端以 classic <script> 載入，掛全域 window.WYMarketStore；node 測試以 vm 載入後讀 module.exports（footer 雙環境）。
const WYMarketStore = (() => {
  // —— 道具庫（12 件：筆／墨／紙／硯 × 凡品／良品／珍品）——
  // 文豪與文魄不在此表＝不可交易（情感資產）。id→price 與 functions/api/market.js 的 GEAR_WHITELIST 同步，
  // test/market-store.test.mjs 有交叉驗證，改一邊必改另一邊。
  const GEAR = [
    { id: 'bi_tu', name: '兔毫筆', cat: 'bi', price: 80, img: 'assets/market/bi_tu.png', desc: '尋常兔毫，起筆練字的入門良伴。' },
    { id: 'bi_hu', name: '湖筆', cat: 'bi', price: 150, img: 'assets/market/bi_hu.png', desc: '湖州名筆，尖齊圓健，文人案頭常備。' },
    { id: 'bi_zi', name: '紫毫筆', cat: 'bi', price: 300, img: 'assets/market/bi_zi.png', desc: '紫兔項毫所製，剛勁挺拔，一枝難求。' },
    { id: 'mo_song', name: '松煙墨', cat: 'mo', price: 80, img: 'assets/market/mo_song.png', desc: '松枝燒煙製墨，黑潤耐用。' },
    { id: 'mo_hui', name: '徽墨', cat: 'mo', price: 150, img: 'assets/market/mo_hui.png', desc: '徽州名墨，香氣清雅，落紙如漆。' },
    { id: 'mo_long', name: '龍香墨', cat: 'mo', price: 300, img: 'assets/market/mo_long.png', desc: '入龍腦麝香，宮廷貢品，稀世珍墨。' },
    { id: 'zhi_zhu', name: '竹紙', cat: 'zhi', price: 80, img: 'assets/market/zhi_zhu.png', desc: '竹料所造，價廉耐寫，日常抄書之選。' },
    { id: 'zhi_xuan', name: '宣紙', cat: 'zhi', price: 150, img: 'assets/market/zhi_xuan.png', desc: '涇縣宣紙，潤墨勻透，書畫皆宜。' },
    { id: 'zhi_cheng', name: '澄心堂紙', cat: 'zhi', price: 300, img: 'assets/market/zhi_cheng.png', desc: '南唐御紙，膚卵如膜，千金難得。' },
    { id: 'yan_tao', name: '陶硯', cat: 'yan', price: 80, img: 'assets/market/yan_tao.png', desc: '陶土燒成，發墨堪用的樸實硯台。' },
    { id: 'yan_she', name: '歙硯', cat: 'yan', price: 150, img: 'assets/market/yan_she.png', desc: '歙州龍尾石硯，紋理如眉，貯墨不涸。' },
    { id: 'yan_duan', name: '端硯', cat: 'yan', price: 300, img: 'assets/market/yan_duan.png', desc: '端溪名硯，呵氣成雲，四寶之首。' },
  ];
  const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g]));
  const CAT_LABEL = { bi: '筆', mo: '墨', zhi: '紙', yan: '硯' };

  const TIER_OF_PRICE = { 80: 'fan', 150: 'liang', 300: 'zhen' };
  const TIER_LABEL = { fan: '凡品', liang: '良品', zhen: '珍品' };
  const TIER_GRADE = { fan: 0, liang: 1, zhen: 2 };
  const PRICE_BAND = { fan: [40, 120], liang: [75, 225], zhen: [150, 450] };
  const DAILY_BUY_CAP = 3;

  // 感謝小卡（僅存 cardId，前後端同一張表；無自由文字輸入，杜絕留言霸凌）
  const THANKS_CARDS = [
    { id: 1, text: '謝謝你，這件文房寶貝我會好好珍惜！' },
    { id: 2, text: '集市有你真好，交易愉快！' },
    { id: 3, text: '你開的價真公道，讚！' },
    { id: 4, text: '正好缺這件，太感謝了！' },
    { id: 5, text: '祝你下次也大豐收！' },
    { id: 6, text: '同窗之誼，銘感五內！' },
  ];

  function tierOf(gearId) {
    const g = GEAR_BY_ID[gearId];
    return g ? TIER_OF_PRICE[g.price] : null;
  }
  function bandOf(gearId) {
    const t = tierOf(gearId);
    return t ? PRICE_BAND[t] : null;
  }

  // —— 開市時窗（與 functions/api/market.js 同一份邏輯；test 交叉驗證兩份一致，改一邊必改另一邊）——
  function isMarketOpen(nowMs = Date.now()) {
    const t = new Date(nowMs + 8 * 3600 * 1000);
    const day = t.getUTCDay(), hh = t.getUTCHours();
    if (day === 6 || day === 0) return true;
    return day === 5 && hh >= 16;
  }
  function weekKey(nowMs = Date.now()) {
    const t = new Date(nowMs + 8 * 3600 * 1000);
    const day = t.getUTCDay();
    const back = day === 5 ? 0 : day === 6 ? 1 : day === 0 ? 2 : (day + 2) % 7;
    const fri = new Date(t.getTime() - back * 86400 * 1000);
    return fri.toISOString().slice(0, 10);
  }
  function nextOpenText(nowMs = Date.now()) {
    return isMarketOpen(nowMs) ? '開市中' : '週五 16:00 開市（平日可找硯靈行商）';
  }

  // —— 硯靈行商（NPC 直購）——：不需班級碼、每日皆可，只賣「凡品」四寶當基礎道具來源，
  // 讓單機玩家平日也有地方花墨錠；珍稀道具仍留給週末同窗交易。金流（扣墨錠）仍由 UI 層走 WYStore，本層不碰。
  const YANLING_PRICE = 60;
  function yanlingStock() {
    return GEAR.filter((g) => tierOf(g.id) !== 'zhen').map((g) => ({ id: g.id, name: g.name, cat: g.cat, catLabel: CAT_LABEL[g.cat], img: g.img, desc: g.desc, price: tierOf(g.id) === 'fan' ? YANLING_PRICE : 180, tierLabel: TIER_LABEL[tierOf(g.id)] }));
  }

  // —— 掉落規則（資料結構＋純函式；實際接點在整合筆記說明，主線程於對戰勝利／精通里程碑呼叫）——
  // event='battleWin'：機率掉落，combo 越高掉率略升；event='mastery'：篇目達精通必掉一件（無珍品）。
  const DROP_RULE = {
    battleWin: { chance: 0.45, comboBonusPer: 0.03, comboBonusMax: 0.2, tierWeights: { fan: 0.7, liang: 0.25, zhen: 0.05 } },
    mastery: { chance: 1, comboBonusPer: 0, comboBonusMax: 0, tierWeights: { fan: 0.6, liang: 0.4, zhen: 0 } },
  };
  const GEAR_BY_TIER = { fan: GEAR.filter((g) => tierOf(g.id) === 'fan'), liang: GEAR.filter((g) => tierOf(g.id) === 'liang'), zhen: GEAR.filter((g) => tierOf(g.id) === 'zhen') };
  // rollDrop({event, combo, rng}) → gearId | null。rng 預設 Math.random，可注入以測試。
  function rollDrop({ event = 'battleWin', combo = 0, rng = Math.random } = {}) {
    const rule = DROP_RULE[event];
    if (!rule) return null;
    const rate = Math.min(rule.chance + Math.min(combo * rule.comboBonusPer, rule.comboBonusMax), 1);
    if (rng() >= rate) return null;
    // 依權重挑品階
    const tiers = Object.entries(rule.tierWeights).filter(([, w]) => w > 0);
    const total = tiers.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total, tier = tiers[0][0];
    for (const [t, w] of tiers) { r -= w; if (r < 0) { tier = t; break; } }
    const pool = GEAR_BY_TIER[tier];
    if (!pool || !pool.length) return null;
    return pool[Math.floor(rng() * pool.length)].id;
  }
  function rollDropNew({ event = 'mastery', combo = 0, rng = Math.random } = {}) {
    const owned = new Set(loadGear().owned);
    const preferred = GEAR.filter((g) => !owned.has(g.id) && tierOf(g.id) !== 'zhen');
    if (preferred.length) return preferred[Math.floor(rng() * preferred.length)].id;
    return rollDrop({ event, combo, rng });
  }

  // —— 可注入 storage backend（比照 store.js／fusion-store.js 手法）——
  let _storage = (typeof localStorage !== 'undefined') ? localStorage : null;
  function setStorageBackend(b) { _storage = b; }
  function _get(k) { try { return _storage ? _storage.getItem(k) : null; } catch { return null; } }
  function _set(k, v) { try { if (_storage) _storage.setItem(k, v); } catch { /* 隱私模式寫入失敗靜默 */ } }
  const readJSON = (k, fb) => { try { const v = _get(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } };

  const K_GEAR = 'wy_mkt_gear';     // {owned:[gearId], loadout:[gearId]}
  const K_CLAIMS = 'wy_mkt_claims'; // [{id,claimKey,gearId,price,reserveFor}]
  const K_BUYS = 'wy_mkt_buys';     // {date, n}
  const K_EVER = 'wy_mkt_ever';     // [{gearId,dir,peer,ts}]（上限 100 筆）
  const K_NICK = 'wy_mkt_nick';     // 市集暱稱

  // —— 擁有／裝備 ——
  function loadGear() { const g = readJSON(K_GEAR, null) || { owned: [], loadout: [] }; g.owned = Array.isArray(g.owned) ? g.owned : []; g.loadout = Array.isArray(g.loadout) ? g.loadout : []; return g; }
  function saveGear(g) { _set(K_GEAR, JSON.stringify({ owned: g.owned || [], loadout: g.loadout || [] })); }
  function ownedGear() { return loadGear().owned.map((id) => GEAR_BY_ID[id]).filter(Boolean); }
  // sellableGear：已擁有且在道具庫的，附階級資訊供 UI 珠面卡渲染
  function sellableGear() {
    return loadGear().owned.filter((id) => GEAR_BY_ID[id]).map((id) => {
      const g = GEAR_BY_ID[id], tier = tierOf(id);
      return { id, name: g.name, cat: g.cat, catLabel: CAT_LABEL[g.cat], price: g.price, tier, tierLabel: TIER_LABEL[tier], grade: TIER_GRADE[tier], img: g.img };
    });
  }
  function addOwned(gearId) { if (!GEAR_BY_ID[gearId]) return { ok: false }; const g = loadGear(); g.owned.push(gearId); saveGear(g); return { ok: true }; }
  // 上架成功／賣出後移除一件（owned 移一個實例，並同步退出 loadout）
  function removeOwned(gearId) {
    const g = loadGear();
    const i = g.owned.indexOf(gearId);
    if (i < 0) return { ok: false };
    g.owned.splice(i, 1);
    if (!g.owned.includes(gearId)) g.loadout = g.loadout.filter((x) => x !== gearId);
    saveGear(g);
    return { ok: true };
  }
  function duplicateIds() {
    const seen = new Set(), dup = new Set();
    for (const id of loadGear().owned) { if (seen.has(id)) dup.add(id); seen.add(id); }
    return [...dup];
  }
  function isEquipped(gearId) { return loadGear().loadout.includes(gearId); }
  const EQUIP_MAX = 4;
  function toggleEquip(gearId) {
    const g = loadGear();
    if (!g.owned.includes(gearId)) return { ok: false, reason: 'not-owned' };
    const at = g.loadout.indexOf(gearId);
    if (at >= 0) { g.loadout.splice(at, 1); saveGear(g); return { ok: true, equipped: false }; }
    if (g.loadout.length >= EQUIP_MAX) return { ok: false, reason: 'full' };
    g.loadout.push(gearId); saveGear(g); return { ok: true, equipped: true };
  }
  // 裝備中道具的對戰／墨錠加成（薄外掛層，供 js/market-adapter.js 讀取；封頂防濫用）
  function gearMods(gearId) {
    const g = GEAR_BY_ID[gearId]; if (!g) return { damageBonus: 0, inkDropBonus: 0 };
    const grade = TIER_GRADE[tierOf(gearId)] + 1; // 1/2/3
    if (g.cat === 'bi' || g.cat === 'yan') return { damageBonus: grade, inkDropBonus: 0 };  // 筆／硯 → 傷害
    return { damageBonus: 0, inkDropBonus: 0.05 * grade };                                   // 墨／紙 → 墨錠掉落
  }
  function activeGearMods() {
    const eq = loadGear().loadout;
    let damageBonus = 0, inkDropBonus = 0;
    for (const id of eq) { const m = gearMods(id); damageBonus += m.damageBonus; inkDropBonus += m.inkDropBonus; }
    return { damageBonus: Math.min(damageBonus, 6), inkDropBonus: Math.min(Number(inkDropBonus.toFixed(3)), 0.5) };
  }

  // —— claims（我的掛單，事後憑 claimKey 領款）——
  function getClaims() { return readJSON(K_CLAIMS, []) || []; }
  function addClaim(c) { const arr = getClaims(); arr.push({ id: c.id, claimKey: c.claimKey, gearId: c.gearId, price: c.price, reserveFor: c.reserveFor || '' }); _set(K_CLAIMS, JSON.stringify(arr)); return arr; }
  function removeClaim(id) { const arr = getClaims().filter((c) => c.id !== id); _set(K_CLAIMS, JSON.stringify(arr)); return arr; }

  // —— 每日限購（本機先擋省 API；伺服器仍硬擋）——
  function buysToday(nowMs = Date.now()) { const rec = readJSON(K_BUYS, null); return rec && rec.date === dayStr(nowMs) ? (rec.n || 0) : 0; }
  function bumpBuys(nowMs = Date.now()) { const d = dayStr(nowMs); const rec = readJSON(K_BUYS, null); const n = (rec && rec.date === d ? rec.n : 0) + 1; _set(K_BUYS, JSON.stringify({ date: d, n })); return n; }
  function dayStr(ms) { return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10); }

  // —— 曾經持有留痕（賣掉的寶物也在收藏冊留名，擁有感不清零；FIFO 上限 100）——
  function getEverOwned() { return readJSON(K_EVER, []) || []; }
  function recordEverOwned({ gearId, dir, peer = '', ts = Date.now() }) { const arr = getEverOwned(); arr.unshift({ gearId, dir, peer, ts }); _set(K_EVER, JSON.stringify(arr.slice(0, 100))); return arr; }

  // —— 市集暱稱 ——
  function getNick() { return _get(K_NICK) || ''; }
  function setNick(n) { const v = String(n || '').trim().slice(0, 12); if (v) _set(K_NICK, v); return v; }

  return {
    GEAR, GEAR_BY_ID, CAT_LABEL, TIER_OF_PRICE, TIER_LABEL, TIER_GRADE, PRICE_BAND, THANKS_CARDS, DAILY_BUY_CAP, DROP_RULE, EQUIP_MAX, YANLING_PRICE,
    tierOf, bandOf, isMarketOpen, weekKey, nextOpenText, rollDrop, rollDropNew, yanlingStock,
    setStorageBackend, loadGear, saveGear, ownedGear, sellableGear, addOwned, removeOwned, duplicateIds, isEquipped, toggleEquip, gearMods, activeGearMods,
    getClaims, addClaim, removeClaim, buysToday, bumpBuys, getEverOwned, recordEverOwned, getNick, setNick,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WYMarketStore;
if (typeof window !== 'undefined') window.WYMarketStore = WYMarketStore;
