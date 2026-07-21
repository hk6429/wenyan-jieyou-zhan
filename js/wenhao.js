// 文豪錄：收藏/圖鑑層。解鎖規則 = 該篇文言文全題型答對率 ≥ 80%（見 store.js masteryRatio），
// 不是操作次數或查看次數——避免「摸一下就算學會」的反教育設計。
const WYWenhao = (() => {
  let texts = [];

  const PORTRAIT = Object.fromEntries(WYBattle.ROSTER.map((r) => [r.unlockText, r.img]));

  // 同一位文豪的跨篇弧線（資料裡已存在的情感金礦）：解鎖第二篇時「原來你就是……」的重逢。
  const SAME_PERSON = [
    { person: '諸葛亮', ids: ['t01', 't04'], reunion: '原來你就是寫〈誡子書〉叮嚀後輩的那位丞相——如今〈出師表〉裡，換你成了託孤受命、放心不下的人。' },
    { person: '陶淵明', ids: ['t02', 't18'], reunion: '原來〈五柳先生傳〉裡那位不慕榮利的先生，就是你——你把心中的桃花源，寫成了一整個世界。' },
    { person: '蘇軾', ids: ['t08', 't21'], reunion: '原來你就是那晚在承天寺散步、找張懷民的蘇軾——歷經烏臺詩案被貶，你在赤壁江上，終於與天地和自己和解。' },
  ];
  function _groupOf(id) { return SAME_PERSON.find((g) => g.ids.includes(id)); }

  function init(allTexts) {
    texts = allTexts;
  }

  function roster() {
    return texts.map((t) => {
      const ratio = WYStore.masteryRatio(t.id);
      const st = WYStore.getTextState(t.id);
      const g = _groupOf(t.id);
      const others = g ? g.ids.filter((x) => x !== t.id) : [];
      const othersMastered = others.some((x) => WYStore.getTextState(x).mastered);
      return {
        id: t.id,
        title: t.title,
        author: t.author,
        era: t.era,
        genre: t.genre,
        unlocked: st.mastered,
        progress: st.total > 0 ? Math.round(ratio * 100) : 0,
        img: PORTRAIT[t.id] || '',
        person: g ? g.person : null,
        // 重逢台詞：本篇與同人另一篇「都已解鎖」時才亮，讓學生認出是同一個人
        reunion: (g && st.mastered && othersMastered) ? g.reunion : null,
      };
    });
  }

  function summary() {
    const r = roster();
    return { unlocked: r.filter((x) => x.unlocked).length, total: r.length };
  }

  return { init, roster, summary };
})();
