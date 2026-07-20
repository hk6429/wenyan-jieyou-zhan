// 文豪錄：收藏/圖鑑層。解鎖規則 = 該篇文言文全題型答對率 ≥ 80%（見 store.js masteryRatio），
// 不是操作次數或查看次數——避免「摸一下就算學會」的反教育設計。
const WYWenhao = (() => {
  let texts = [];

  const PORTRAIT = Object.fromEntries(WYBattle.ROSTER.map((r) => [r.unlockText, r.img]));

  function init(allTexts) {
    texts = allTexts;
  }

  function roster() {
    return texts.map((t) => {
      const ratio = WYStore.masteryRatio(t.id);
      const st = WYStore.getTextState(t.id);
      return {
        id: t.id,
        title: t.title,
        author: t.author,
        era: t.era,
        genre: t.genre,
        unlocked: st.mastered,
        progress: st.total > 0 ? Math.round(ratio * 100) : 0,
        img: PORTRAIT[t.id] || '',
      };
    });
  }

  function summary() {
    const r = roster();
    return { unlocked: r.filter((x) => x.unlocked).length, total: r.length };
  }

  return { init, roster, summary };
})();
