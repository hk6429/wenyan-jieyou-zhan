const WYBattle = (() => {
  const MAX_HP = 100;

  // 文豪錄：PvE 對手，難度=每次攻擊傷害越高。刻意設計成有起伏而非單調線性遞增，
  // 避免「越後面越無腦難」，也讓 combo 傷害有上限（見 resolveAnswer）不會雪崩碾壓後期對手。
  const ROSTER = [
    { id: 'zhuge', name: '誡子丞相', hp: MAX_HP, atk: 6, unlockText: 't01', img: 'assets/characters/zhuge_home.png' },
    { id: 'taoyuanming', name: '靖節先生', hp: MAX_HP, atk: 7, unlockText: 't02', img: 'assets/characters/taoyuanming.png' },
    { id: 'zhuzhiwu', name: '燭大夫', hp: MAX_HP, atk: 8, unlockText: 't03', img: 'assets/characters/zhuzhiwu.png' },
    { id: 'zhuge_chushi', name: '武侯出師', hp: MAX_HP, atk: 9, unlockText: 't04', img: 'assets/characters/zhuge_war.png' },
    { id: 'yugong', name: '愚公', hp: MAX_HP, atk: 8, unlockText: 't05', img: 'assets/characters/t05.png' },
    { id: 'yongxue', name: '詠絮才女', hp: MAX_HP, atk: 10, unlockText: 't06', img: 'assets/characters/t06.png' },
    { id: 'wangrong', name: '苦李神童', hp: MAX_HP, atk: 9, unlockText: 't07', img: 'assets/characters/t07.png' },
    { id: 'dongpo', name: '東坡居士', hp: MAX_HP, atk: 12, unlockText: 't08', img: 'assets/characters/t08.png' },
    { id: 'mulan', name: '木蘭將軍', hp: MAX_HP, atk: 11, unlockText: 't09', img: 'assets/characters/t09.png' },
    { id: 'liuyuxi', name: '陋室主人', hp: MAX_HP, atk: 13, unlockText: 't10', img: 'assets/characters/t10.png' },
    { id: 'cuiyuan', name: '座右銘士', hp: MAX_HP, atk: 10, unlockText: 't11', img: 'assets/characters/t11.png' },
    { id: 'liurong', name: '養晦書生', hp: MAX_HP, atk: 14, unlockText: 't12', img: 'assets/characters/t12.png' },
    { id: 'zhengxie', name: '板橋先生', hp: MAX_HP, atk: 12, unlockText: 't13', img: 'assets/characters/t13.png' },
    { id: 'yuefei', name: '精忠武穆', hp: MAX_HP, atk: 16, unlockText: 't14', img: 'assets/characters/t14.png' },
    { id: 'liji', name: '大同聖賢', hp: MAX_HP, atk: 13, unlockText: 't15', img: 'assets/characters/t15.png' },
    { id: 'lisi', name: '客卿丞相', hp: MAX_HP, atk: 17, unlockText: 't16', img: 'assets/characters/t16.png' },
    { id: 'sima', name: '太史公', hp: MAX_HP, atk: 15, unlockText: 't17', img: 'assets/characters/t17.png' },
    { id: 'taoyuan', name: '桃源隱者', hp: MAX_HP, atk: 14, unlockText: 't18', img: 'assets/characters/t18.png' },
    { id: 'hanyu', name: '昌黎先生', hp: MAX_HP, atk: 18, unlockText: 't19', img: 'assets/characters/t19.png' },
    { id: 'qiuran', name: '虯髯客', hp: MAX_HP, atk: 16, unlockText: 't20', img: 'assets/characters/t20.png' },
    { id: 'chibi', name: '赤壁蘇子', hp: MAX_HP, atk: 19, unlockText: 't21', img: 'assets/characters/t21.png' },
    { id: 'yuanhongdao', name: '湖上公安', hp: MAX_HP, atk: 15, unlockText: 't22', img: 'assets/characters/t22.png' },
    { id: 'guiyouguang', name: '項脊軒主', hp: MAX_HP, atk: 20, unlockText: 't23', img: 'assets/characters/t23.png' },
    { id: 'pusongling', name: '聊齋居士', hp: MAX_HP, atk: 17, unlockText: 't24', img: 'assets/characters/t24.png' },
    { id: 'zhengyongxi', name: '開臺進士', hp: MAX_HP, atk: 21, unlockText: 't25', img: 'assets/characters/t25.png' },
    { id: 'honyi', name: '鹿港遺老', hp: MAX_HP, atk: 18, unlockText: 't26', img: 'assets/characters/t26.png' },
    { id: 'zhangdehe', name: '畫菊夫人', hp: MAX_HP, atk: 14, unlockText: 't27', img: 'assets/characters/t27.png' },
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
      const dmg = 10 + Math.min(state.combo, 5) * 4; // combo加成封頂5，避免連對雪崩讓後期對手形同虛設
      state.opponent.curHp = Math.max(0, state.opponent.curHp - dmg);
      state.log.push(`答對！造成 ${dmg} 傷害（combo x${state.combo}）`);
      state.comboMilestone = state.combo >= 3 && state.combo % 3 === 0;
    } else {
      state.combo = 0;
      state.comboMilestone = false;
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
