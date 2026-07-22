const WYStore = (() => {
  const KEY = 'wy_progress_v1';

  const DAILY_INK_CAP = 200; // 約 80–100 題；花費／退款不受限
  const MAX_IMPORT_INK = 2000;
  const MASTERY_RULE_TEXT = '精通＝至少自測 10 題、答對率達 80%，且字義、句義、段旨、篇章文意四種題型各答對至少 2 題。';
  const INK_BY_TYPE = { char: 1, sentence: 2, gist: 3, theme: 4, cloze: 1 };
  const HINT_TICKET_COST = 30;

  function blank() {
    return { texts: {}, streak: { last: null, days: 0, best: 0, firePasses: 2 }, inkIngots: 0, hintTickets: 0, caotangDecorPurchases: 0, classCode: null, inkDay: { date: null, earned: 0 }, lastTextId: null, recent: [] };
  }

  const RECENT_WINDOW = 8; // 心流訊號：只看最近 N 題滾動正確率，用於連錯救援／難度自適應（不看終身累計）

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function load() {
    try {
      return { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
    } catch {
      return blank();
    }
  }

  function save(state) {
    // 隱私模式/配額爆掉時 setItem 會拋錯——吞掉以免作答中途整站半殘（進度只是無法持久，當次仍可玩）。
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 隱私模式或超出配額：略過持久化 */ }
  }

  function getTextState(textId) {
    const state = load();
    return state.texts[textId] || { seen: 0, correct: 0, total: 0, mastered: false };
  }

  // 內部：在每日上限內賺取墨錠，回傳「實際入帳」數（可能被上限截斷成 0）。花費請走 addInk/spendInk（不受上限限制）。
  function _earnInkInto(state, delta) {
    if (delta <= 0) return 0;
    const today = todayStr();
    if (!state.inkDay || state.inkDay.date !== today) state.inkDay = { date: today, earned: 0 };
    const room = Math.max(0, DAILY_INK_CAP - state.inkDay.earned);
    const gain = Math.min(delta, room);
    state.inkDay.earned += gain;
    state.inkIngots = (state.inkIngots || 0) + gain;
    return gain;
  }

  const QUIZ_TYPES = ['char', 'sentence', 'gist', 'theme'];
  const MASTERY_MIN_TOTAL = 10;   // 需真正練過的題數（自測，不含對戰）
  const MASTERY_MIN_RATIO = 0.8;  // 答對率門檻
  const MASTERY_MIN_PER_TYPE = 2; // 四題型每型至少答對過的下限（廣度：擋「只刷單一題型就精通整篇」）

  // 精通判定（B2 假精熟修正）：需 ①自測答滿門檻題數 ②答對率達標 ③四題型每型都練過（廣度）。
  // 對戰作答不計入這裡的 total/types（見 recordAnswer 的 countForMastery），避免重複刷同批題灌分。
  // 仍維持 sticky：一旦真達標即永久精通，不因日後偶爾答錯被歷史稀釋回退（保留「不越練越掉」的正向體驗）。
  function computeMastered(t) {
    if (t.mastered) return true;
    if (t.total < MASTERY_MIN_TOTAL) return false;
    if (t.correct / t.total < MASTERY_MIN_RATIO) return false;
    const types = t.types || {};
    return QUIZ_TYPES.every((ty) => (types[ty]?.correct || 0) >= MASTERY_MIN_PER_TYPE);
  }

  // ── per-item 間隔複習 / 錯題本（SRS）：SRS「今天複習」、錯題重測、閃卡自評三者共用同一份 state.items ──
  function dayNum(ts) {
    return Math.floor((ts == null ? Date.now() : ts) / 86400000);
  }
  // 簡化版 SM-2：grade ∈ {again(忘/答錯), hard(模糊), good(記得/答對)}。到期以「日序」記，不看時分。
  function _recordItemInto(state, qId, grade, textId) {
    if (!state.items) state.items = {};
    if (!state.wrong) state.wrong = {};
    const today = dayNum();
    const it = state.items[qId] || { reps: 0, ease: 2.5, interval: 0, due: today, lapses: 0, textId };
    if (grade === 'again') {
      it.reps = 0; it.interval = 0; it.lapses += 1;
      it.ease = Math.max(1.3, it.ease - 0.2); it.due = today; // 當日再測
      state.wrong[qId] = true;
    } else {
      if (grade === 'hard') {
        it.reps += 1;
        it.interval = Math.max(1, Math.round((it.interval || 1) * 1.2));
        it.ease = Math.max(1.3, it.ease - 0.15);
      } else { // good
        it.reps += 1;
        it.interval = it.reps <= 1 ? 1 : it.reps === 2 ? 3 : Math.max(1, Math.round((it.interval || 3) * it.ease));
      }
      it.due = today + it.interval;
      delete state.wrong[qId]; // 答對＝訂正閉環，移出錯題本
    }
    it.textId = textId || it.textId;
    state.items[qId] = it;
  }

  // 每題作答都記錄，正確率 = correct/total，用於精通/「文豪錄」解鎖判定；答對順帶掉落墨錠（合契/市集共用貨幣，受每日上限）。
  // 選填 qType（char/sentence/gist/theme）另記入「逐題型」統計，供學習儀表板做弱點診斷。
  // opts.qId：帶題號則同步更新 SRS/錯題本（grade 未指定時答對=good、答錯=again）。
  // opts.countForMastery=false：僅賺墨錠與更新 SRS，不計入精通/題型統計（對戰模式用，防重複刷灌分）。
  function recordAnswer(textId, isCorrect, qType, opts = {}) {
    const countForMastery = opts.countForMastery !== false;
    const state = load();
    if (opts.qId) _recordItemInto(state, opts.qId, opts.grade || (isCorrect ? 'good' : 'again'), textId);
    if (!state.texts[textId]) state.texts[textId] = { seen: 0, correct: 0, total: 0, mastered: false };
    const t = state.texts[textId];
    state.lastTextId = textId;                 // 續玩落點：回訪首頁「繼續練上次那篇」
    const mile = _touchStudyStreakInto(state); // 連續天數綁「真的有練」而非「有開站」（教育誠信）
    if (mile) state._pendingStreakMilestone = mile; // 跨里程碑（7/14/30…）供 UI 慶祝一次
    state.recent = [...(state.recent || []), !!isCorrect].slice(-RECENT_WINDOW); // 滾動正確率訊號
    if (isCorrect) _earnInkInto(state, INK_BY_TYPE[qType] || 1);
    if (countForMastery) {
      t.total += 1;
      if (isCorrect) t.correct += 1;
      if (qType && QUIZ_TYPES.includes(qType)) {
        if (!t.types) t.types = {};
        if (!t.types[qType]) t.types[qType] = { correct: 0, total: 0 };
        t.types[qType].total += 1;
        if (isCorrect) t.types[qType].correct += 1;
        if (!state.byType) state.byType = {};
        if (!state.byType[qType]) state.byType[qType] = { correct: 0, total: 0 };
        state.byType[qType].total += 1;
        if (isCorrect) state.byType[qType].correct += 1;
      }
      const newlyMastered = !t.mastered && computeMastered(t);
      t.mastered = t.mastered || newlyMastered;
      if (newlyMastered) _earnInkInto(state, 20);
    }
    save(state);
    return t;
  }

  // 閃卡三鍵自評（記得/模糊/忘了）等非計分情境更新 SRS：只動 state.items/錯題本，不碰精通與墨錠。
  function recordItem(qId, grade, textId) {
    const state = load();
    _recordItemInto(state, qId, grade, textId);
    save(state);
    return state.items[qId];
  }

  // 今天（含逾期）該複習的題目：回傳 [{qId, textId, due, ...}]，due 越舊越前面。可傳 validIds 過濾掉已不存在的題。
  function dueItems(validIds) {
    const items = load().items || {};
    const today = dayNum();
    const ok = validIds ? new Set(validIds) : null;
    return Object.entries(items)
      .filter(([qId, it]) => it.due <= today && (!ok || ok.has(qId)))
      .sort((a, b) => a[1].due - b[1].due)
      .map(([qId, it]) => ({ qId, ...it }));
  }

  function dueCount(validIds) {
    return dueItems(validIds).length;
  }

  // 目前未訂正的錯題（答錯後尚未再答對）：回傳 [qId, ...]，供「錯題本」重測入口
  function wrongItems(validIds) {
    const wrong = load().wrong || {};
    const ok = validIds ? new Set(validIds) : null;
    return Object.keys(wrong).filter((qId) => !ok || ok.has(qId));
  }

  // 逐題型正確率統計（學習儀表板用）：回傳 [{type,correct,total,ratio}]，含尚未作答的題型（total 0）
  function typeStats() {
    const bt = load().byType || {};
    return QUIZ_TYPES.map((type) => {
      const s = bt[type] || { correct: 0, total: 0 };
      return { type, correct: s.correct, total: s.total, ratio: s.total ? s.correct / s.total : 0 };
    });
  }

  // 對外賺取墨錠（受每日上限）：供對戰加成等額外獎勵使用；回傳實際入帳數。
  function earnInk(delta) {
    const state = load();
    const gain = _earnInkInto(state, delta);
    save(state);
    return gain;
  }

  // 今日賺取概況（給 header/UI 顯示「今日已賺 X/上限」）
  function inkToday() {
    const state = load();
    const today = todayStr();
    const earned = (state.inkDay && state.inkDay.date === today) ? state.inkDay.earned : 0;
    return { earned, cap: DAILY_INK_CAP, left: Math.max(0, DAILY_INK_CAP - earned) };
  }

  function masteryRatio(textId) {
    const t = getTextState(textId);
    return t.total > 0 ? t.correct / t.total : 0;
  }

  function allMastered() {
    const state = load();
    return Object.entries(state.texts).filter(([, v]) => v.mastered).map(([k]) => k);
  }

  // 連續學習天數：只在「今天真的練了（recordAnswer）」時前進，不因單純開站而+1（教育誠信）。
  // 回傳 { streak, milestone } —— milestone 為本次跨過的里程碑天數（7/14/30/50/100），否則 null。
  function _touchStudyStreakInto(state) {
    if (!state.streak) state.streak = { last: null, days: 0, best: 0, firePasses: 2 };
    const today = new Date().toISOString().slice(0, 10);
    if (state.streak.last === today) return null; // 今天已記過，不重複前進
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const beforeYesterday = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    if (state.streak.last === yesterday) state.streak.days += 1;
    else if (state.streak.last === beforeYesterday && (state.streak.firePasses || 0) > 0) {
      state.streak.days += 1;
      state.streak.firePasses -= 1;
      state._usedFirePass = true;
    } else state.streak.days = 1;
    state.streak.last = today;
    state.streak.best = Math.max(state.streak.best || 0, state.streak.days);
    const MILES = [7, 14, 30, 50, 100, 200, 365];
    return MILES.includes(state.streak.days) ? state.streak.days : null;
  }

  // 相容舊呼叫：不再於開站前進連續天數，只回目前值（連續天數改由 recordAnswer 驅動）
  function touchStreak() {
    return getStreak();
  }

  function getStreak() {
    return load().streak || { last: null, days: 0 };
  }

  // 今天是否已完成學習（用於首頁「今日已練」狀態）
  function studiedToday() {
    return (getStreak().last === new Date().toISOString().slice(0, 10));
  }

  // 取出並清掉待慶祝的連續天數里程碑（跨過 7/14/30… 當次回傳一次，之後回 null）
  function consumeStreakMilestone() {
    const state = load();
    const m = state._pendingStreakMilestone || null;
    if (m) { delete state._pendingStreakMilestone; save(state); }
    return m;
  }

  function peekStreakMilestone() { return load()._pendingStreakMilestone || null; }

  function streakAlive() {
    const s = getStreak();
    if (!s.last) return false;
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return s.last === today || s.last === yesterday;
  }

  // ── 續玩落點 / 滾動正確率（心流訊號）─────────────────────────────
  function getLastTextId() {
    return load().lastTextId || null;
  }
  // 最近 N 題正確率（0~1）與樣本數；樣本不足回 { ratio: null }
  function recentAccuracy() {
    const r = load().recent || [];
    if (!r.length) return { ratio: null, n: 0, streakWrong: 0 };
    const correct = r.filter(Boolean).length;
    let streakWrong = 0;
    for (let i = r.length - 1; i >= 0 && !r[i]; i--) streakWrong++;
    return { ratio: correct / r.length, n: r.length, streakWrong };
  }

  // ── 存檔備份 / 還原（進度純存 localStorage，清快取即失；提供本機匯出入堵最大流失）──
  // 匯出本站所有 localStorage 鍵（wy_ 前綴：核心進度＋草堂/合契/市集/擂台）為一份可攜 JSON 字串。
  function exportAll() {
    const dump = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('wy_')) dump[k] = localStorage.getItem(k);
      }
    } catch { /* 隱私模式：略過 */ }
    return JSON.stringify({ _wy_backup: 1, ts: Date.now(), data: dump });
  }
  // 還原：解析備份字串，逐鍵寫回。回傳寫回鍵數；格式不符回 -1（呼叫端提示）。
  function importAll(str) {
    let obj;
    try { obj = JSON.parse(str); } catch { return -1; }
    if (!obj || obj._wy_backup !== 1 || !obj.data || typeof obj.data !== 'object') return -1;
    try {
      const raw = obj.data[KEY];
      if (typeof raw !== 'string') return 0;
      const incoming = JSON.parse(raw);
      const current = load();
      const merged = { ...current, texts: { ...current.texts } };
      for (const [id, x] of Object.entries(incoming.texts || {})) {
        if (!/^t\d{2}$/.test(id) || !x || typeof x !== 'object') continue;
        const c = merged.texts[id] || { correct: 0, total: 0, types: {} };
        const total = Math.min(10000, Math.max(c.total || 0, Number(x.total) || 0));
        const correct = Math.min(total, Math.max(c.correct || 0, Number(x.correct) || 0));
        const types = { ...(c.types || {}) };
        for (const ty of QUIZ_TYPES) {
          const xt = (x.types || {})[ty] || {};
          const ct = types[ty] || {};
          const tyTotal = Math.min(total, Math.max(ct.total || 0, Number(xt.total) || 0));
          types[ty] = { total: tyTotal, correct: Math.min(tyTotal, Math.max(ct.correct || 0, Number(xt.correct) || 0)) };
        }
        const next = { ...c, total, correct, types, mastered: false };
        next.mastered = computeMastered(next);
        merged.texts[id] = next;
      }
      merged.inkIngots = Math.min(MAX_IMPORT_INK, Math.max(current.inkIngots || 0, Number(incoming.inkIngots) || 0));
      merged.hintTickets = Math.min(99, Math.max(current.hintTickets || 0, Number(incoming.hintTickets) || 0));
      save(merged);
    } catch { return -1; }
    return 1;
  }

  function totalCorrect() {
    return Object.values(load().texts || {}).reduce((sum, t) => sum + (t.correct || 0), 0);
  }
  function companionLevel() { return Math.floor(totalCorrect() / 20); }
  function getHintTickets() { return load().hintTickets || 0; }
  function buyHintTicket() {
    const state = load();
    if ((state.inkIngots || 0) < HINT_TICKET_COST) return false;
    state.inkIngots -= HINT_TICKET_COST;
    state.hintTickets = (state.hintTickets || 0) + 1;
    save(state); return true;
  }
  function useHintTicket() {
    const state = load();
    if ((state.hintTickets || 0) < 1) return false;
    state.hintTickets -= 1; save(state); return true;
  }
  function buyCaotangDecor(cost = 45) {
    const state = load();
    if ((state.inkIngots || 0) < cost) return false;
    state.inkIngots -= cost;
    state.caotangDecorPurchases = (state.caotangDecorPurchases || 0) + 1;
    save(state); return true;
  }
  function removeItems(qIds) {
    const state = load();
    for (const id of qIds || []) {
      if (state.items) delete state.items[id];
      if (state.wrong) delete state.wrong[id];
    }
    save(state);
  }

  // ── 墨錠貨幣（文魄合契的合契費、文房市集的交易幣共用）──────────────
  function getInk() {
    return load().inkIngots || 0;
  }

  // 直接加減墨錠；delta 可為負（合契費/交易付款）。回傳異動後餘額，餘額不會低於 0。
  function addInk(delta) {
    const state = load();
    state.inkIngots = Math.max(0, (state.inkIngots || 0) + delta);
    save(state);
    return state.inkIngots;
  }

  // 嘗試花費 amount 墨錠：夠才扣並回 true，不夠回 false 不動餘額
  function spendInk(amount) {
    const state = load();
    if ((state.inkIngots || 0) < amount) return false;
    state.inkIngots -= amount;
    save(state);
    return true;
  }

  // ── 班級碼（文房市集班級限定交易、全班文會依賴；選填）─────────────
  function getClassCode() {
    return load().classCode || null;
  }

  // 正規化：去空白、轉大寫、限 4~8 碼英數；空字串視為清除
  function setClassCode(code) {
    const norm = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const state = load();
    state.classCode = norm.length >= 4 ? norm : null;
    save(state);
    return state.classCode;
  }

  return {
    load, save, getTextState, recordAnswer, recordItem, masteryRatio, allMastered, touchStreak, getStreak,
    getInk, addInk, spendInk, earnInk, inkToday, DAILY_INK_CAP, typeStats, getClassCode, setClassCode,
    computeMastered, dueItems, dueCount, wrongItems, dayNum, removeItems,
    getLastTextId, recentAccuracy, studiedToday, consumeStreakMilestone, peekStreakMilestone, streakAlive, exportAll, importAll,
    MASTERY_RULE_TEXT, INK_BY_TYPE, HINT_TICKET_COST, getHintTickets, buyHintTicket, useHintTicket, buyCaotangDecor,
    totalCorrect, companionLevel,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WYStore;
