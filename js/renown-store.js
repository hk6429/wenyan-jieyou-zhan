// 文名（renown）——把六個各自為政的養成系統收斂成一條「我是誰、我到哪了」的上升主軸。
// 純 derive，不新增可寫狀態；以「真實精通篇數」為最重權重（白帽：綁真實學習，不綁操作次數）。
// 收藏/文魄等外部系統若存在則加分，不存在也能獨立運作（防禦式讀取）。
const WYRenown = (() => {
  // 文名段位（由低到高），threshold = 需達到的文名值
  const RANKS = [
    { name: '白衣', at: 0 },
    { name: '童生', at: 30 },
    { name: '秀才', at: 80 },
    { name: '廩生', at: 160 },
    { name: '貢生', at: 280 },
    { name: '舉人', at: 440 },
    { name: '貢士', at: 640 },
    { name: '進士', at: 900 },
    { name: '翰林', at: 1200 },
    { name: '大學士', at: 1600 },
    { name: '文宗', at: 2900 },
  ];

  // 文名值：精通篇數×100（主軸）＋累計「答對」數×1（勤學）＋收藏加分（文魄/文房，若有）
  // 白帽：勤學分綁「答對」而非「作答」，否則亂猜/答錯也能灌段位＝操作次數刷數值。
  function score() {
    let s = 0;
    try {
      s += WYStore.allMastered().length * 100;
      s += WYStore.typeStats().reduce((a, x) => a + (x.correct || 0), 0) * 1;
    } catch { /* store 未載入 */ }
    // 文魄數（合契）與文房件數（市集）若存在則各加分——收斂多系統，但權重壓低於精通
    try { if (typeof WYFusionStore !== 'undefined' && WYFusionStore.ownedCount) s += WYFusionStore.ownedCount() * 30; } catch { /* 無 */ }
    try { if (typeof WYMarketStore !== 'undefined' && WYMarketStore.ownedList) s += (WYMarketStore.ownedList() || []).length * 10; } catch { /* 無 */ }
    return Math.round(s);
  }

  // 目前段位＋距下一段還差多少文名值（供進度條）
  function rank() {
    const sc = score();
    let cur = RANKS[0], next = null;
    let masteredCount = 0;
    try { masteredCount = WYStore.allMastered().length; } catch { /* store 未載入 */ }
    for (let i = 0; i < RANKS.length; i++) {
      if (RANKS[i].name === '文宗' && masteredCount !== 27) continue;
      if (sc >= RANKS[i].at) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
    }
    if (cur.name === '大學士' && masteredCount !== 27) next = RANKS[RANKS.length - 1];
    const span = next ? next.at - cur.at : 1;
    const into = next ? sc - cur.at : 1;
    return {
      score: sc, name: cur.name, tier: RANKS.indexOf(cur) + 1, maxTier: RANKS.length,
      next: next ? next.name : null, toNext: next ? next.at - sc : 0,
      pct: next ? Math.min(100, Math.round(into / span * 100)) : 100,
    };
  }

  // 道號（單一權威來源，收斂散在各系統的暱稱）：存在 WYStore state.nick
  function nickname() {
    try { return WYStore.load().nick || null; } catch { return null; }
  }
  function setNickname(n) {
    const nk = String(n || '').trim().slice(0, 12);
    try { const s = WYStore.load(); s.nick = nk || null; WYStore.save(s); } catch { /* 隱私模式 */ }
    return nk || null;
  }

  return { RANKS, score, rank, nickname, setNickname };
})();
if (typeof window !== 'undefined') window.WYRenown = WYRenown;
if (typeof module !== 'undefined' && module.exports) module.exports = WYRenown;
