const WYStore = (() => {
  const KEY = 'wy_progress_v1';

  function blank() {
    return { texts: {}, streak: { last: null, days: 0 }, inkIngots: 0, classCode: null };
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

  // 每題作答都記錄，正確率 = correct/total，用於「文豪錄」解鎖判定；答對順帶掉落墨錠（合契/市集共用貨幣）
  function recordAnswer(textId, isCorrect) {
    const state = load();
    if (!state.texts[textId]) state.texts[textId] = { seen: 0, correct: 0, total: 0, mastered: false };
    const t = state.texts[textId];
    t.total += 1;
    if (isCorrect) {
      t.correct += 1;
      state.inkIngots = (state.inkIngots || 0) + 2;
    }
    t.mastered = t.total >= 8 && t.correct / t.total >= 0.8;
    save(state);
    return t;
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
    getInk, addInk, spendInk, getClassCode, setClassCode,
  };
})();
