// 全班文會純邏輯：白帽排名裁切（只露前五＋自己名次）＋硯靈宣讀戰報。可 node --test。
const WYLiveWall = (() => {
  // 只回前 topN＋自己（若不在前段）的名次，不外流倒數名單（避免公開處刑）
  function safeBoard(rows, myNick, topN = 5) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, topN).map(({ nick, score }) => ({ nick, score }));
    const idx = sorted.findIndex((r) => r.nick === myNick);
    const me = idx >= topN ? { rank: idx + 1, nick: myNick, score: sorted[idx].score } : null;
    return { top, me, total: sorted.length };
  }

  // 硯靈宣讀式戰報（文言腔）：開頭「硯靈宣讀：」、收尾「濁墨退散」
  function buildHerald({ label, rows }) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const champ = sorted[0];
    if (!champ) return [`硯靈宣讀：${label} 文會虛位以待，誰為先聲奪人之士？`];
    const ord = ['亞', '季'];
    return [
      `硯靈宣讀：${label} 文會戰況——`,
      `本場魁首：${champ.nick}！答對 ${champ.score} 題，筆掃千軍。`,
      ...sorted.slice(1, 3).map((e, i) => `${ord[i]}席：${e.nick}，答對 ${e.score} 題。`),
      '眾書生聞聲而賀，濁墨退散三尺！',
    ];
  }

  return { safeBoard, buildHerald };
})();
if (typeof globalThis !== 'undefined') globalThis.WYLiveWall = WYLiveWall;
