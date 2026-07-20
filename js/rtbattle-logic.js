// 文戰擂台純邏輯層：同 seed 不同機出同一組題、傷害記帳（我方 vs 標靶）、勝負判定、斷線判勝。
// 零 DOM、零網路，全部可 node --test。前端經 window.WYRtLogic 取用；出題委派 WYQuiz.buildQuiz。
// 傷害權威在攻擊方：我上報累計輸出 dmg，對方血量 = 對方最大血 − 我方 dmg。
const WYRtLogic = (() => {
  const ROUNDS = 20;
  const ROUND_SEC = 15;
  const POLL_MS = 1500;
  const DEAD_MS = 20000; // 對手心跳超過此值判斷斷線
  const MAX_HP = 100;

  // 確定性亂數（與 rt-events 分流）：同 seed 序列完全一致
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // scope → 候選篇目 id 陣列（排序後回，兩機載入順序不同也一致）
  //   { mode:'single', textId } | { mode:'level', level:'J'|'S' } | { mode:'mixed' }
  function pickTexts(TEXTS, scope) {
    let ids;
    if (scope.mode === 'single') ids = [scope.textId];
    else if (scope.mode === 'level') ids = TEXTS.filter((t) => t.level === scope.level).map((t) => t.id);
    else ids = TEXTS.map((t) => t.id);
    return [...new Set(ids)].sort();
  }

  // 用同一 seed 出同一組題：對每篇 buildQuiz(textId,{seed}) 取題彙整，seeded 洗序取 rounds。
  // buildQuizFn 預設走全域 WYQuiz.buildQuiz；測試可注入 stub。回傳題目每項附 textId。
  function buildRounds(TEXTS, scope, seed, rounds = ROUNDS, buildQuizFn) {
    const fn = buildQuizFn || (typeof WYQuiz !== 'undefined' ? WYQuiz.buildQuiz : (typeof globalThis !== 'undefined' && globalThis.WYQuiz ? globalThis.WYQuiz.buildQuiz : null));
    if (!fn) throw new Error('WYRtLogic.buildRounds 需要 WYQuiz.buildQuiz');
    const ids = pickTexts(TEXTS, scope);
    const pool = [];
    for (const id of ids) {
      const quiz = fn(id, { seed });
      for (const q of (quiz.questions || [])) pool.push({ ...q, textId: id });
    }
    // seeded 洗序（同 seed 同 pool → 同序），取前 rounds
    const rng = mulberry32((seed ^ 0x1F2E3D4C) >>> 0);
    const arr = pool.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.min(rounds, arr.length));
  }

  // 我方 vs 標靶的一題結算（沿用 WYBattle.resolveAnswer 的 combo/傷害語意）。
  // state = { hpB, combo, dmg }：hpB=標靶剩餘血、dmg=累計輸出。opts.double 觸發硯靈雙倍傷害。
  function newLocalState(maxHp = MAX_HP) {
    return { hpB: maxHp, combo: 0, dmg: 0 };
  }
  function resolveAnswer(state, isCorrect, opts = {}) {
    const s = { ...state };
    if (isCorrect) {
      s.combo += 1;
      let dmg = 10 + Math.min(s.combo, 5) * 4; // combo 封頂 5，避免連對雪崩
      if (opts.comboBoost) dmg = 10 + Math.min(s.combo, 8) * 4; // 硯靈：combo 門檻上調
      if (opts.double) dmg *= 2; // 硯靈：墨勢倍之
      const prevHpB = s.hpB;
      s.hpB = Math.max(0, s.hpB - dmg);
      s.dmg += (prevHpB - s.hpB);
    } else {
      s.combo = 0;
    }
    return s;
  }

  // 我方本回合對標靶多打的傷害（供同步累計；不為負，對方回血不倒扣）
  function dealtDamage(prevState, nextState) {
    return Math.max(0, prevState.hpB - nextState.hpB);
  }

  // 勝負判定：對方斷線→win；血量歸零先判；雙方 done 比剩餘血；否則 null（未分勝負）
  function judge({ myHp, oppHp, myDone, oppDone, oppHbAgeMs }) {
    if (oppHbAgeMs > DEAD_MS) return 'win';
    if (myHp <= 0 && oppHp <= 0) return 'draw';
    if (myHp <= 0) return 'lose';
    if (oppHp <= 0) return 'win';
    if (myDone && oppDone) return myHp > oppHp ? 'win' : myHp < oppHp ? 'lose' : 'draw';
    return null;
  }

  return { ROUNDS, ROUND_SEC, POLL_MS, DEAD_MS, MAX_HP, mulberry32, pickTexts, buildRounds, newLocalState, resolveAnswer, dealtDamage, judge };
})();
if (typeof globalThis !== 'undefined') globalThis.WYRtLogic = WYRtLogic;
