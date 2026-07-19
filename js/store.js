const WYStore = (() => {
  const KEY = 'wy_progress_v1';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { texts: {}, streak: { last: null, days: 0 } };
    } catch {
      return { texts: {}, streak: { last: null, days: 0 } };
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function getTextState(textId) {
    const state = load();
    return state.texts[textId] || { seen: 0, correct: 0, total: 0, mastered: false };
  }

  // 每題作答都記錄，正確率 = correct/total，用於「文豪錄」解鎖判定
  function recordAnswer(textId, isCorrect) {
    const state = load();
    if (!state.texts[textId]) state.texts[textId] = { seen: 0, correct: 0, total: 0, mastered: false };
    const t = state.texts[textId];
    t.total += 1;
    if (isCorrect) t.correct += 1;
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

  return { load, save, getTextState, recordAnswer, masteryRatio, allMastered };
})();
