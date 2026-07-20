// 文房道具對戰加成外掛層——刻意薄薄一層，讓對戰吃到「裝備中文房四寶」的小幅被動，而【不必修改 js/battle.js】。
// 概念與 js/fusion-adapter.js 完全平行：主線程在 app.js 的 drawBattle 掛鉤（見文房市集整合筆記「對戰掛鉤點」）。
// 全部純讀取 WYMarketStore.activeGearMods()，不改核心引擎、不寫任何狀態。
const WYMarketAdapter = (() => {
  function mods() {
    try {
      return (typeof WYMarketStore !== 'undefined')
        ? WYMarketStore.activeGearMods()
        : { damageBonus: 0, inkDropBonus: 0 };
    } catch {
      return { damageBonus: 0, inkDropBonus: 0 };
    }
  }
  // 掛鉤點 A（答對時）：算出玩家造成的傷害後，dmg += WYMarketAdapter.damageBonus()
  function damageBonus() { return mods().damageBonus || 0; }
  // 掛鉤點 C（給墨錠時）：amount = Math.round(base * WYMarketAdapter.inkMultiplier())
  function inkMultiplier() { return 1 + (mods().inkDropBonus || 0); }
  return { mods, damageBonus, inkMultiplier };
})();

if (typeof window !== 'undefined') window.WYMarketAdapter = WYMarketAdapter;
