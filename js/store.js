const WYStore = (() => {
  const KEY = 'wy_progress_v1';

  const DAILY_INK_CAP = 80; // 每日「答對賺取」墨錠上限（白帽稀缺性；花費/退款不受限）

  function blank() {
    return { texts: {}, streak: { last: null, days: 0 }, inkIngots: 0, classCode: null, inkDay: { date: null, earned: 0 } };
  }

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
    localStorage.setItem(KEY, JSON.stringify(state));
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

  // 每題作答都記錄，正確率 = correct/total，用於「文豪錄」解鎖判定；答對順帶掉落墨錠（合契/市集共用貨幣，受每日上限）。
  // 選填 qType（char/sentence/gist/theme）另記入「逐題型」統計，供學習儀表板做弱點診斷。
  function recordAnswer(textId, isCorrect, qType) {
    const state = load();
    if (!state.texts[textId]) state.texts[textId] = { seen: 0, correct: 0, total: 0, mastered: false };
    const t = state.texts[textId];
    t.total += 1;
    if (isCorrect) {
      t.correct += 1;
      _earnInkInto(state, 2);
    }
    t.mastered = t.total >= 8 && t.correct / t.total >= 0.8;
    if (qType && QUIZ_TYPES.includes(qType)) {
      if (!state.byType) state.byType = {};
      if (!state.byType[qType]) state.byType[qType] = { correct: 0, total: 0 };
      state.byType[qType].total += 1;
      if (isCorrect) state.byType[qType].correct += 1;
    }
    save(state);
    return t;
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

  // 每天首次開站呼叫一次：今天已記錄過就不動，昨天記錄過則連續天數+1，其他情況重置為1
  function touchStreak() {
    const state = load();
    if (!state.streak) state.streak = { last: null, days: 0 };
    const today = new Date().toISOString().slice(0, 10);
    if (state.streak.last === today) return state.streak;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    state.streak.days = state.streak.last === yesterday ? state.streak.days + 1 : 1;
    state.streak.last = today;
    save(state);
    return state.streak;
  }

  function getStreak() {
    return load().streak || { last: null, days: 0 };
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
    load, save, getTextState, recordAnswer, masteryRatio, allMastered, touchStreak, getStreak,
    getInk, addInk, spendInk, earnInk, inkToday, DAILY_INK_CAP, typeStats, getClassCode, setClassCode,
  };
})();
