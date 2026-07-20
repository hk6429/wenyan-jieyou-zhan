// 硯靈事件（文言解憂站差異化）：由 seed 決定每 5 題觸發一次隨機評點，效果只影響觸發方。
// 雙方同 seed → 同事件序列（各自在自己那台觸發同一事件，公平）。純函式、零 DOM，可 node --test。
// 三種效果對接 WYRtLogic.resolveAnswer 的 opts：
//   double        → 本題傷害雙倍（賜墨勢倍之）
//   eliminate     → 下一題排除一個錯誤選項（賜慧眼）
//   comboBoost    → combo 傷害門檻上調（連氣不散）
// 台詞一律文言腔（「硯靈曰：…」）。
const WYRtEvents = (() => {
  const EVERY = 5;

  // 事件池：weight 決定機率；effect 對應 resolveAnswer opts key。
  const EVENTS = [
    { id: 'double', name: '墨勢倍之', effect: 'double', weight: 3, line: '硯靈曰：此子可教，賜墨勢倍之——本題落筆，傷敵加倍。' },
    { id: 'eliminate', name: '慧眼識妄', effect: 'eliminate', weight: 3, line: '硯靈曰：去其糟粕，存其精要——下一題，替汝抹去一謬選。' },
    { id: 'comboBoost', name: '連氣不散', effect: 'comboBoost', weight: 2, line: '硯靈曰：一氣呵成，其鋒愈利——連對之勢，傷勢再長。' },
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 建事件腳本：Map<questionIndex, event>，questionIndex ∈ {5,10,15,20}（第 N 題答完後觸發）
  // 相鄰不重複同事件；不同 seed 大機率不同序列。
  function buildScript(seed, rounds = 20, every = EVERY) {
    const rng = mulberry32((seed ^ 0x5EEDCAFE) >>> 0); // 與出題 rng 分流，互不干擾
    const script = new Map();
    let lastId = null;
    for (let at = every; at <= rounds; at += every) {
      const pool = EVENTS.filter((e) => e.id !== lastId);
      const total = pool.reduce((s, e) => s + e.weight, 0);
      let roll = rng() * total;
      let picked = pool[pool.length - 1];
      for (const e of pool) { roll -= e.weight; if (roll < 0) { picked = e; break; } }
      lastId = picked.id;
      script.set(at, picked);
    }
    return script;
  }

  return { EVERY, EVENTS, mulberry32, buildScript };
})();
if (typeof globalThis !== 'undefined') globalThis.WYRtEvents = WYRtEvents;
