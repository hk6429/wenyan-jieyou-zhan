// 文魄合契系統邏輯層：資格判定／合契成功與失敗／被動二選一／配方揭曉解謎／隨行加成／暱稱。
// 敘事定位：兩位文豪心志相通、結為知音，喚醒兩人共同精神所化的「文魄」（伯牙子期傳統）。
// 純函式：所有涉及外部資源（墨錠餘額、選文精通度、亂數）一律走注入的 deps，方便 node 單元測試。
// 硬性規則（vocab-duel P3-11 血淚教訓）：雙親（兩篇文豪選文）永不消耗——本模組只「讀」精通度，從不寫。
// 失敗走白帽時間成本：兩成機率失敗只扣墨錠＋回饋少量墨錠，學習進度與文豪完全不受影響。
//
// 前端以 classic <script> 載入，掛全域 window.WYFusionStore（無 import/export）；
// node 測試以 vm 載入後讀 module.exports（footer 兼容雙環境）。
const WYFusionStore = (() => {
  const KEY = 'wy_fusion';
  const FUSE_COST = 20;        // 一次合契的墨錠費用（≈答對 10 題累積）
  const FAIL_RATE = 0.2;       // 兩成失敗率——失敗只損墨錠（時間成本），不動資產
  const CONSOLE_INK = 4;       // 合契失敗的安慰墨錠回饋
  const MASTERY_GATE = 0.8;    // 選文精通答對率門檻
  const MASTERY_MIN_TOTAL = 8; // 精通判定的最低作答量（與 WYStore 一致）
  const TOTAL_MIN = 30;        // 合契額外要求：每篇累積作答量 ≥30
  const NICK_MAX = 8;          // 暱稱上限字數

  // 文魄全庫封頂 6 隻（控制生圖產量），配對取自本站 27 篇文豪，parents 為兩篇 textId。
  // 曠達之魄為「同人雙篇」特例（蘇軾記承天寺夜遊 t08 × 赤壁賦 t21）。
  // 每隻兩個被動由玩家親選（賦創造力）：一個偏對戰、一個偏墨錠，effect 欄位對齊 fusion-adapter。
  const WENPO = [
    {
      id: 'yinyi', name: '隱逸之魄', element: '隱逸', parents: ['t18', 't22'],
      img: 'assets/fusion/wenpo-yinyi.png',
      desc: '陶淵明的桃花源與袁宏道的西湖月色相契，化為嚮往山水、超脫濁世的隱逸之魄。',
      bornLine: '不知有漢，無論魏晉——山水之間，自有一片不受濁世沾染的天地，今夜由你尋回。',
      riddle: {
        q: '〈桃花源記〉與〈晚遊六橋待月記〉共同寄託的情懷，最接近下列何者？',
        options: ['厭棄濁世、寄情山水的隱逸情懷', '建立功業、名垂青史的雄心', '感時傷亂、憂國憂民的悲憤', '思念故鄉、盼歸不得的鄉愁'],
        answer: 0,
      },
      passives: [
        { id: 'wangji', name: '忘機', desc: '隨行時對戰答錯一次免反擊（每場一次）', effect: { shieldOnce: 1 } },
        { id: 'danbo', name: '淡泊', desc: '隨行時墨錠掉落 +10%', effect: { inkDropBonus: 0.1 } },
      ],
    },
    {
      id: 'zhongyi', name: '忠義之魄', element: '忠義', parents: ['t04', 't14'],
      img: 'assets/fusion/wenpo-zhongyi.png',
      desc: '諸葛亮的出師表與岳飛的滿江紅隔百年而共鳴，凝為至死不渝的忠義之魄。',
      bornLine: '鞠躬盡瘁，死而後已；壯志飢餐胡虜肉——忠義二字，穿越百年在你手中重新點亮。',
      riddle: {
        q: '〈出師表〉的「鞠躬盡瘁，死而後已」與〈滿江紅〉的「精忠報國」，共同體現何者？',
        options: ['寄情田園的閒適', '追名逐利的算計', '竭誠盡忠、至死不渝的志節', '及時行樂的曠達'],
        answer: 2,
      },
      passives: [
        { id: 'jinzhong', name: '盡忠', desc: '隨行時對戰傷害 +3', effect: { damageBonus: 3 } },
        { id: 'lizhi', name: '勵志', desc: '隨行時墨錠掉落 +10%', effect: { inkDropBonus: 0.1 } },
      ],
    },
    {
      id: 'haoxia', name: '豪俠之魄', element: '豪俠', parents: ['t09', 't20'],
      img: 'assets/fusion/wenpo-haoxia.png',
      desc: '花木蘭代父從軍、虯髯客縱橫江湖，兩股豪傑之氣相合，化為不拘身分的豪俠之魄。',
      bornLine: '萬里赴戎機，關山度若飛；虯髯一去不復返——豪傑之氣，不分男女，今為你所召。',
      riddle: {
        q: '花木蘭代父從軍與虯髯客縱橫天下，共同展現何種精神？',
        options: ['謹守禮法、溫良恭儉', '不拘身分、慷慨豪邁的俠義氣概', '皓首窮經、埋首書齋', '寄情山水、與世無爭'],
        answer: 1,
      },
      passives: [
        { id: 'yingyong', name: '英勇', desc: '隨行時對戰傷害 +3', effect: { damageBonus: 3 } },
        { id: 'haodang', name: '豪爽', desc: '隨行時對戰答錯一次免反擊（每場一次）', effect: { shieldOnce: 1 } },
      ],
    },
    {
      id: 'shibi', name: '史筆之魄', element: '史筆', parents: ['t17', 't16'],
      img: 'assets/fusion/wenpo-shibi.png',
      desc: '司馬遷的鴻門敘事與李斯的逐客雄辯相濟，凝為鋪陳嚴謹、敘議兼擅的史筆之魄。',
      bornLine: '筆落驚風雨，字字皆春秋——一支史筆、一篇雄文，皆為天下留真，今由你續寫。',
      riddle: {
        q: '〈鴻門宴〉的敘事與〈諫逐客書〉的論辯，共同彰顯作者何種功力？',
        options: ['婉約含蓄的抒情', '通俗淺白的口語', '對仗雕琢的駢儷', '鋪陳嚴謹、敘事說理兼擅的雄健文筆'],
        answer: 3,
      },
      passives: [
        { id: 'mingbian', name: '明辨', desc: '隨行時對戰答錯一次免反擊（每場一次）', effect: { shieldOnce: 1 } },
        { id: 'bowen', name: '博聞', desc: '隨行時墨錠掉落 +10%', effect: { inkDropBonus: 0.1 } },
      ],
    },
    {
      id: 'kuangda', name: '曠達之魄', element: '曠達', parents: ['t08', 't21'],
      img: 'assets/fusion/wenpo-kuangda.png',
      desc: '蘇軾承天寺的月色與赤壁的清風，同出一人胸襟，化為身處逆境仍超然自適的曠達之魄。',
      bornLine: '何夜無月？何處無竹柏？江上清風、山間明月，取之無禁，用之不竭——今與你共有。',
      riddle: {
        q: '〈記承天寺夜遊〉與〈赤壁賦〉共同流露蘇軾何種人生態度？',
        options: ['憤世嫉俗、抨擊時政', '身處逆境仍豁達超然的曠達胸襟', '消極厭世、萬念俱灰', '汲汲營營、力求聞達'],
        answer: 1,
      },
      passives: [
        { id: 'suiyuan', name: '隨緣', desc: '隨行時對戰答錯一次免反擊（每場一次）', effect: { shieldOnce: 1 } },
        { id: 'leguan', name: '樂觀', desc: '隨行時墨錠掉落 +10%', effect: { inkDropBonus: 0.1 } },
      ],
    },
    {
      id: 'xiangtu', name: '鄉土之魄', element: '鄉土', parents: ['t25', 't26'],
      img: 'assets/fusion/wenpo-xiangtu.png',
      desc: '鄭用錫勸和止鬥、洪繻低迴鹿港，兩份對斯土斯民的深情相繫，化為鄉土之魄。',
      bornLine: '同居一島，當親愛相守；鹿港繁華一夢——故土之情深植肺腑，今在你心中復甦。',
      riddle: {
        q: '〈勸和論〉與〈鹿港乘桴記〉共同關懷的核心是？',
        options: ['對中原故國的追慕', '個人仕途的失意牢騷', '對臺灣鄉土與斯民命運的深切關懷', '對神仙方術的嚮往'],
        answer: 2,
      },
      passives: [
        { id: 'shoutu', name: '守土', desc: '隨行時對戰傷害 +3', effect: { damageBonus: 3 } },
        { id: 'huaixiang', name: '懷鄉', desc: '隨行時墨錠掉落 +10%', effect: { inkDropBonus: 0.1 } },
      ],
    },
  ];
  const WENPO_BY_ID = new Map(WENPO.map((w) => [w.id, w]));

  const FAIL_LINES = [
    '文氣未合，且再讀書——兩位先生的心志尚未真正相通，這幾枚墨錠拿去，改日再會。',
    '知音難覓，本就急不得。你讀得還不夠深，墨錠散了些，但學問一分未減。',
    '硯池的墨還不夠濃。文魄在紙背動了一下又沉了回去，牠感覺得到你，下次必接得住。',
  ];

  function defaultFusion() {
    return { nickname: null, wenpo: {}, revealed: {}, active: null };
  }

  // 就地補齊缺欄位（舊存檔遷移）；容錯任何非物件輸入。
  function ensure(fusion) {
    if (!fusion || typeof fusion !== 'object') return defaultFusion();
    if (!fusion.wenpo || typeof fusion.wenpo !== 'object') fusion.wenpo = {};
    if (!fusion.revealed || typeof fusion.revealed !== 'object') fusion.revealed = {};
    if (fusion.active === undefined) fusion.active = null;
    if (fusion.nickname === undefined) fusion.nickname = null;
    return fusion;
  }

  // deps.mastery(textId) → { ratio, total }；只讀，不寫。
  function parentStat(textId, deps) {
    const m = (deps && deps.mastery(textId)) || { ratio: 0, total: 0 };
    const ratio = Number(m.ratio) || 0;
    const total = Number(m.total) || 0;
    const ok = ratio >= MASTERY_GATE && total >= MASTERY_MIN_TOTAL && total >= TOTAL_MIN;
    const title = deps && deps.title ? deps.title(textId) : textId;
    const author = deps && deps.author ? deps.author(textId) : '';
    return { textId, title, author, ratio, total, ok };
  }

  // 資格判定：兩篇皆符合核心精通門檻，且各累積作答量≥30，並有足夠合契費。
  function getEligibility(fusion, wenpoId, deps) {
    fusion = ensure(fusion);
    const w = WENPO_BY_ID.get(wenpoId);
    if (!w) return { eligible: false, reason: 'bad-wenpo', parents: [], reasons: { parents: false, ink: false } };
    const parents = w.parents.map((tid) => parentStat(tid, deps));
    const parentsOk = parents.every((p) => p.ok);
    const ink = deps ? deps.getInk() : 0;
    const owned = !!fusion.wenpo[wenpoId];
    const reasons = { parents: parentsOk, ink: ink >= FUSE_COST };
    return {
      eligible: !owned && parentsOk && reasons.ink,
      owned, parents, cost: FUSE_COST, ink, reasons,
    };
  }

  function canFuse(fusion, wenpoId, deps) {
    fusion = ensure(fusion);
    const w = WENPO_BY_ID.get(wenpoId);
    if (!w) return { ok: false, reason: 'bad-wenpo' };
    if (fusion.wenpo[wenpoId]) return { ok: false, reason: 'owned' };
    const e = getEligibility(fusion, wenpoId, deps);
    if (!e.reasons.parents) return { ok: false, reason: 'not-eligible' };
    if (!e.reasons.ink) return { ok: false, reason: 'ink' };
    return { ok: true, reason: null };
  }

  // 合契。deps: { rng?, getInk, spendInk, addInk, mastery, title?, author? }
  // 回傳：成功 {ok:true,result:'success',wenpo}；失敗 {ok:true,result:'fail',line,inkBack}；擋下 {ok:false,reason}
  // 雙親不消耗——本函式全程只讀 mastery，絕不寫任何選文進度。
  function fuse(fusion, wenpoId, deps) {
    fusion = ensure(fusion);
    const rng = (deps && deps.rng) || Math.random;
    const gate = canFuse(fusion, wenpoId, deps);
    if (!gate.ok) return { fusion, ok: false, reason: gate.reason };
    const w = WENPO_BY_ID.get(wenpoId);
    if (!deps.spendInk(FUSE_COST)) return { fusion, ok: false, reason: 'ink' };
    if (rng() < FAIL_RATE) {
      const line = FAIL_LINES[Math.floor(rng() * FAIL_LINES.length)] || FAIL_LINES[0];
      const inkBack = deps.addInk ? (deps.addInk(CONSOLE_INK), CONSOLE_INK) : 0;
      return { fusion, ok: true, result: 'fail', line, inkBack };
    }
    fusion.wenpo[wenpoId] = { bornAt: new Date().toISOString(), parents: w.parents.slice(), passive: null };
    return {
      fusion, ok: true, result: 'success',
      wenpo: { id: w.id, name: w.name, bornLine: w.bornLine, parents: w.parents.slice() },
    };
  }

  // 被動二選一：合契成功後由玩家親挑，一次定終身（強化選擇重量感）。
  function chooseWenpoPassive(fusion, wenpoId, passiveId) {
    fusion = ensure(fusion);
    const rec = fusion.wenpo[wenpoId];
    if (!rec) return { fusion, ok: false, reason: 'not-owned' };
    const w = WENPO_BY_ID.get(wenpoId);
    if (!w || !w.passives.some((p) => p.id === passiveId)) return { fusion, ok: false, reason: 'bad-passive' };
    if (rec.passive) return { fusion, ok: false, reason: 'already-chosen' };
    rec.passive = passiveId;
    return { fusion, ok: true, reason: null };
  }

  // 配方揭曉解謎（未知性）：答對跨兩篇的隱藏綜合題才解鎖文魄長相。已擁有者自動視為已揭曉。
  function answerRiddle(fusion, wenpoId, optionIndex) {
    fusion = ensure(fusion);
    const w = WENPO_BY_ID.get(wenpoId);
    if (!w) return { fusion, ok: false, correct: false, reason: 'bad-wenpo' };
    if (fusion.revealed[wenpoId] || fusion.wenpo[wenpoId]) return { fusion, ok: true, correct: true, reason: 'already-revealed' };
    const correct = optionIndex === w.riddle.answer;
    if (correct) fusion.revealed[wenpoId] = true;
    return { fusion, ok: true, correct, reason: null };
  }

  function isRevealed(fusion, wenpoId) {
    fusion = ensure(fusion);
    return !!fusion.revealed[wenpoId] || !!fusion.wenpo[wenpoId];
  }

  // UI 據此決定顯示剪影或真身。未揭曉回 riddle 供解謎，不洩漏文魄名稱與長相。
  function getPreview(fusion, wenpoId) {
    fusion = ensure(fusion);
    const w = WENPO_BY_ID.get(wenpoId);
    if (!w) return { known: false };
    if (isRevealed(fusion, wenpoId)) {
      return { known: true, wenpo: { id: w.id, name: w.name, element: w.element, desc: w.desc, img: w.img, passives: w.passives } };
    }
    return { known: false, riddle: w.riddle };
  }

  // 隨行文魄：選一隻出戰（null 為收起）。
  function setActive(fusion, wenpoId) {
    fusion = ensure(fusion);
    if (wenpoId === null) { fusion.active = null; return { fusion, ok: true, reason: null }; }
    if (!fusion.wenpo[wenpoId]) return { fusion, ok: false, reason: 'not-owned' };
    fusion.active = wenpoId;
    return { fusion, ok: true, reason: null };
  }

  // 隨行加成計算：回傳目前隨行文魄「已選被動」的效果聚合，供 fusion-adapter 折成對戰/墨錠加成。
  function activeMods(fusion) {
    fusion = ensure(fusion);
    const base = { damageBonus: 0, shieldOnce: 0, inkDropBonus: 0 };
    const id = fusion.active;
    if (!id || !fusion.wenpo[id]) return base;
    const rec = fusion.wenpo[id];
    const w = WENPO_BY_ID.get(id);
    if (!w || !rec.passive) return base;
    const p = w.passives.find((x) => x.id === rec.passive);
    if (!p) return base;
    return { ...base, ...p.effect };
  }

  function setNickname(fusion, name) {
    fusion = ensure(fusion);
    const n = String(name || '').trim().slice(0, NICK_MAX);
    fusion.nickname = n.length ? n : null;
    return { fusion, ok: true, nickname: fusion.nickname };
  }

  // UI 用 view model。
  function listWenpo(fusion) {
    fusion = ensure(fusion);
    return WENPO.map((w) => {
      const rec = fusion.wenpo[w.id];
      return {
        id: w.id, name: w.name, element: w.element, img: w.img, desc: w.desc, bornLine: w.bornLine,
        parents: w.parents.slice(), passives: w.passives,
        owned: !!rec, revealed: isRevealed(fusion, w.id),
        passive: rec ? rec.passive : null, isActive: fusion.active === w.id,
      };
    });
  }

  // ── 持久化（僅瀏覽器）──────────────────────────────────────────
  function loadFusion() {
    try { return ensure(JSON.parse(localStorage.getItem(KEY)) || defaultFusion()); }
    catch { return defaultFusion(); }
  }
  function saveFusion(fusion) {
    try { localStorage.setItem(KEY, JSON.stringify(ensure(fusion))); } catch { /* 隱私模式等寫入失敗靜默 */ }
  }

  return {
    KEY, FUSE_COST, FAIL_RATE, CONSOLE_INK, MASTERY_GATE, TOTAL_MIN, MASTERY_MIN_TOTAL,
    WENPO, WENPO_BY_ID, FAIL_LINES,
    defaultFusion, ensure, getEligibility, canFuse, fuse, chooseWenpoPassive,
    answerRiddle, isRevealed, getPreview, setActive, activeMods, setNickname, listWenpo,
    loadFusion, saveFusion,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WYFusionStore;
if (typeof window !== 'undefined') window.WYFusionStore = WYFusionStore;
