// 科舉賽季排位（純邏輯＋本機存檔）：月為週期，積分換功名稱號，月初自動換季歸零。
// 敗不倒扣（白帽）。本機 localStorage key = wy_rt_season。可 node --test（注入假 localStorage）。
const WYRtSeason = (() => {
  const LS_KEY = 'wy_rt_season';
  const WIN_PTS = 20;
  const LOSE_PTS = 5; // 輸／平也加分，白帽不倒扣

  // 功名六階：童生 → 秀才 → 舉人 → 貢士 → 進士 → 狀元
  const TITLES = [
    { min: 0, title: '童生' },
    { min: 60, title: '秀才' },
    { min: 160, title: '舉人' },
    { min: 320, title: '貢士' },
    { min: 560, title: '進士' },
    { min: 880, title: '狀元' },
  ];

  const seasonKey = (dateStr) => String(dateStr).slice(0, 7); // 'YYYY-MM-DD' → 'YYYY-MM'
  function titleFor(pts) {
    let t = TITLES[0].title;
    for (const x of TITLES) if (pts >= x.min) t = x.title;
    return t;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadSeason(dateStr = today()) {
    const key = seasonKey(dateStr);
    let cur = { key, pts: 0, wins: 0, battles: 0 };
    try {
      const raw = globalThis.localStorage && globalThis.localStorage.getItem(LS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.key === key) cur = { key, pts: o.pts || 0, wins: o.wins || 0, battles: o.battles || 0 };
      }
    } catch { /* 隱私模式讀取失敗：回全新賽季 */ }
    return cur;
  }

  function save(s) {
    try {
      globalThis.localStorage && globalThis.localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch { /* 隱私模式寫入失敗：略過 */ }
  }

  // verdict: 'win' | 'lose' | 'draw'
  function recordResult(dateStr, verdict) {
    const s = loadSeason(dateStr);
    s.pts += verdict === 'win' ? WIN_PTS : LOSE_PTS;
    if (verdict === 'win') s.wins += 1;
    s.battles += 1;
    save(s);
    return { ...s, title: titleFor(s.pts) };
  }

  return { LS_KEY, WIN_PTS, LOSE_PTS, TITLES, seasonKey, titleFor, today, loadSeason, recordResult };
})();
if (typeof globalThis !== 'undefined') globalThis.WYRtSeason = WYRtSeason;
