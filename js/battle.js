const WYBattle = (() => {
  const MAX_HP = 100;

  // 文豪錄：PvE 對手，難度=每次攻擊傷害越高，越難被玩家 combo 壓制
  const ROSTER = [
    { id: 'zhuge', name: '誡子丞相', hp: MAX_HP, atk: 6, unlockText: 't01', img: 'assets/characters/zhuge_home.png' },
    { id: 'taoyuanming', name: '靖節先生', hp: MAX_HP, atk: 7, unlockText: 't02', img: 'assets/characters/taoyuanming.png' },
    { id: 'zhuzhiwu', name: '燭大夫', hp: MAX_HP, atk: 8, unlockText: 't03', img: 'assets/characters/zhuzhiwu.png' },
    { id: 'zhuge_chushi', name: '武侯出師', hp: MAX_HP, atk: 9, unlockText: 't04', img: 'assets/characters/zhuge_war.png' },
  ];

  function newBattle(opponentId) {
    const opp = ROSTER.find((r) => r.id === opponentId) || ROSTER[0];
    return {
      opponent: { ...opp, curHp: MAX_HP },
      player: { curHp: MAX_HP },
      combo: 0,
      log: [],
    };
  }

  // 答對=玩家攻擊，答錯=對手反擊；combo 連對加成，連錯歸零
  function resolveAnswer(state, isCorrect) {
    if (isCorrect) {
      state.combo += 1;
      const dmg = 10 + state.combo * 4;
      state.opponent.curHp = Math.max(0, state.opponent.curHp - dmg);
      state.log.push(`答對！造成 ${dmg} 傷害（combo x${state.combo}）`);
    } else {
      state.combo = 0;
      const dmg = state.opponent.atk;
      state.player.curHp = Math.max(0, state.player.curHp - dmg);
      state.log.push(`答錯，${state.opponent.name} 反擊 ${dmg} 傷害`);
    }
    return {
      ...state,
      finished: state.opponent.curHp <= 0 || state.player.curHp <= 0,
      win: state.opponent.curHp <= 0,
    };
  }

  function unlockedRoster() {
    const mastered = new Set(WYStore.allMastered());
    return ROSTER.map((r) => ({ ...r, unlocked: mastered.has(r.unlockText) }));
  }

  return { ROSTER, newBattle, resolveAnswer, unlockedRoster };
})();
