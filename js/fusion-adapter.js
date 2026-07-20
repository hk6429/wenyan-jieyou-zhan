// 文魄隨行加成外掛層——刻意薄薄一層，讓文戰擂台/對戰吃到隨行文魄的被動，而【不必修改 js/battle.js】。
// 主線程可在 app.js 的 drawBattle 掛鉤（見合契模組整合筆記「對戰掛鉤點」），全部是純讀取，不改核心引擎。
const WYFusionAdapter = (() => {
  function mods() {
    try {
      return (typeof WYFusionStore !== 'undefined')
        ? WYFusionStore.activeMods(WYFusionStore.loadFusion())
        : { damageBonus: 0, shieldOnce: 0, inkDropBonus: 0 };
    } catch {
      return { damageBonus: 0, shieldOnce: 0, inkDropBonus: 0 };
    }
  }

  // 掛鉤點 A（答對時）：算出玩家造成的傷害後，dmg += WYFusionAdapter.damageBonus()
  function damageBonus() { return mods().damageBonus || 0; }

  // 掛鉤點 B（答錯反擊前）：傳入本場對戰 state，回 true 表本場「免反擊」額度尚在、應吸收此次反擊並記為已用。
  // 不動 battle.js：額度旗標寫在傳入的 battle state 上（__wpShieldUsed），battle.js 不認得也不影響。
  function tryShield(battleState) {
    const m = mods();
    if (!m.shieldOnce || !battleState) return false;
    if (battleState.__wpShieldUsed) return false;
    battleState.__wpShieldUsed = true;
    return true;
  }

  // 掛鉤點 C（給墨錠時）：amount = Math.round(base * WYFusionAdapter.inkMultiplier())
  function inkMultiplier() { return 1 + (mods().inkDropBonus || 0); }

  return { mods, damageBonus, tryShield, inkMultiplier };
})();

if (typeof window !== 'undefined') window.WYFusionAdapter = WYFusionAdapter;
