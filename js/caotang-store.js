/* 解憂草堂——純邏輯層（零 DOM）。
 * 山門十境／三院落繁茂度／精通掛軸／裝飾實體化／名句池／匾額對聯／慶典 全部由既有進度唯讀 derive。
 * 自有 localStorage key `wy_caotang`（擺放/命名/慶典），絕不寫回 wy_progress_v1。
 * 相容雙載入：瀏覽器 <script>（掛 window.WYCaotangStore）＋ Node ESM 副作用 import（掛 globalThis.WYCaotangStore）。
 * 精通判定自己重算（total>=8 且答對率>=0.8），不依賴 WYStore 內部旗標，方便單元測試傳純物件。
 */
(function (root) {
  'use strict';

  const KEY = 'wy_caotang';
  const VERSION = 1;
  const TOTAL_TEXTS = 27;          // 全站選文數（gate 十境的分母）
  const TREASURY_CAP = 300;        // 藏書閣繁茂度以「累計答題量」對此上限換算百分比

  // 文氣十境（0→9）：越往中軸越繁茂
  const GATE_STAGES = ['童蒙', '開卷', '識文', '誦章', '通句', '明義', '博覽', '融會', '通儒', '文宗'];
  const GATE_BLESS = [
    '初入草堂，一燈如豆。', '始知卷中有天地。', '識得文言門徑。', '誦讀成韻，漸有文氣。',
    '句讀分明，理路漸通。', '明其義理，讀而能思。', '博覽群篇，胸中有丘壑。', '融會貫通，文氣盈庭。',
    '通達經史，蔚然成儒。', '文宗風骨，草堂生輝。',
  ];

  // 繁茂度五級與門檻（百分比）
  const FLOURISH_TIERS = ['未闢', '初萌', '漸盛', '繁茂', '鼎盛'];
  const FLOURISH_AT = [0, 10, 30, 60, 100];

  // 三院落
  const COURTS = [
    { id: 'meng', name: '蒙學院', kind: 'level', level: 'J', desc: '國中選文精通度' },
    { id: 'guanzhi', name: '觀止軒', kind: 'level', level: 'S', desc: '高中選文精通度' },
    { id: 'cangshu', name: '藏書閣', kind: 'answers', desc: '累計答題量' },
  ];

  // 學習量裝飾：以「累計答對題數」換算件數（分品階門檻），各自獨立、皆有上限避免撐爆畫面
  const DECOR_KINDS = {
    bamboo: { name: '翠竹叢', per: 8, cap: 12, emoji: '🎋' },
    lotus: { name: '蓮池', per: 20, cap: 6, emoji: '🪷' },
    pine: { name: '松石', per: 40, cap: 5, emoji: '🪨' },
    koi: { name: '錦鯉', per: 60, cap: 6, emoji: '🐟' },
  };

  // 預設散佈分帶（百分比座標，相對場景）
  const BANDS = {
    bamboo: { x0: 8, y0: 68, dx: 6.6, dy: -3, wrap: 6 },
    lotus: { x0: 56, y0: 82, dx: 7, dy: -2, wrap: 6 },
    pine: { x0: 12, y0: 28, dx: 9, dy: 2, wrap: 5 },
    koi: { x0: 62, y0: 74, dx: 5, dy: 3, wrap: 6 },
  };

  // 名句池「代表句」白名單：只在該句確實是原文子字串時才採用，否則落回程式化擷取（杜絕捏造）
  const MINGJU = {
    t01: ['非淡泊無以明志，非寧靜無以致遠', '靜以修身，儉以養德'],
    t02: ['好讀書，不求甚解', '不慕榮利'],
    t03: ['因人之力而敝之，不仁'],
    t04: ['受任於敗軍之際，奉命於危難之間', '親賢臣，遠小人'],
    t05: ['子子孫孫無窮匱也', '汝心之固，固不可徹'],
    t06: ['未若柳絮因風起'],
    t07: ['樹在道邊而多子，此必苦李'],
    t08: ['庭下如積水空明', '何夜無月？何處無竹柏'],
    t09: ['萬里赴戎機，關山度若飛', '朔氣傳金柝，寒光照鐵衣'],
    t10: ['斯是陋室，惟吾德馨', '山不在高，有仙則名'],
    t11: ['無道人之短，無說己之長', '施人慎勿念，受施慎勿忘'],
    t12: ['習之中人甚矣哉'],
    t13: ['讀書以過目成誦為能，最是不濟事'],
    t14: ['莫等閒，白了少年頭，空悲切', '三十功名塵與土，八千里路雲和月'],
    t15: ['大道之行也，天下為公', '選賢與能，講信修睦'],
    t16: ['泰山不讓土壤，故能成其大', '河海不擇細流，故能就其深'],
    t17: ['大行不顧細謹，大禮不辭小讓', '人為刀俎，我為魚肉'],
    t18: ['芳草鮮美，落英繽紛', '黃髮垂髫，並怡然自樂'],
    t19: ['師者，所以傳道受業解惑也', '弟子不必不如師，師不必賢於弟子'],
    t20: ['此世界非公世界也'],
    t21: ['寄蜉蝣於天地，渺滄海之一粟', '清風徐來，水波不興'],
    t22: ['西湖最盛，為春為月'],
    t23: ['庭有枇杷樹，吾妻死之年所手植也', '借書滿架，偃仰嘯歌'],
    t24: ['一道士坐蒲團上'],
    t25: ['自分類始'],
    t26: ['有亭翼然，亙二、三里'],
    t27: ['學琴學詩，均從所好；工書工畫，各有專長'],
  };

  // ── 小工具 ────────────────────────────────────────────────
  const clampPct = (v) => Math.max(4, Math.min(96, v));
  const round = (v) => Math.round(v);

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function textStat(progress, id) {
    const t = (progress && progress.texts && progress.texts[id]) || null;
    return t || { seen: 0, correct: 0, total: 0 };
  }

  // 精通判準必須與核心 WYStore.computeMastered 完全一致（白帽底線：不得在終局/成就面偷降門檻）：
  // 總數≥10、答對率≥80%、且四題型（字義/句義/段旨/篇章）各≥2 題——防止只狂刷單一題型就點亮
  // 山門十境／掛軸／「精通全27篇」成就並對家長老師謊報精通。
  const CT_QUIZ_TYPES = ['char', 'sentence', 'gist', 'theme'];
  function isMastered(stat) {
    if (!stat || stat.total < 10 || !(stat.correct / stat.total >= 0.8)) return false;
    const types = stat.types || {};
    return CT_QUIZ_TYPES.every((ty) => (types[ty] && types[ty].correct >= 2));
  }

  function totalCorrect(progress) {
    const t = (progress && progress.texts) || {};
    return Object.values(t).reduce((s, x) => s + (x.correct || 0), 0);
  }

  function totalAnswers(progress) {
    const t = (progress && progress.texts) || {};
    return Object.values(t).reduce((s, x) => s + (x.total || 0), 0);
  }

  function masteredTexts(texts, progress) {
    return (texts || []).filter((t) => isMastered(textStat(progress, t.id)));
  }

  // ── 狀態存取（自有 key，只在有 localStorage 時動）─────────────
  function defaultState() {
    return { v: VERSION, seeded: false, placements: {}, plaque: null, couplet: null, celebrated: [] };
  }

  function storage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch { /* 隱私模式存取即拋錯 */ }
    return null;
  }

  function load() {
    const def = defaultState();
    const s = storage();
    if (!s) return def;
    try {
      const raw = s.getItem(KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) return def;
      const merged = { ...def, ...parsed };
      merged.v = VERSION;
      if (!isPlainObject(merged.placements)) merged.placements = {};
      if (!Array.isArray(merged.celebrated)) merged.celebrated = [];
      return merged;
    } catch {
      return def;
    }
  }

  function save(state) {
    const s = storage();
    if (!s) return false;
    try {
      s.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  // ── 文氣十境山門（唯讀 derive：已精通篇數 / 27 → 十階）─────────
  function gateStage(texts, progress) {
    const mastered = masteredTexts(texts, progress).length;
    const ratio = mastered / TOTAL_TEXTS;
    const stage = mastered === TOTAL_TEXTS
      ? GATE_STAGES.length - 1
      : Math.max(0, Math.min(GATE_STAGES.length - 2, Math.floor(ratio * GATE_STAGES.length)));
    return {
      stage,
      name: GATE_STAGES[stage],
      bless: GATE_BLESS[stage],
      total: GATE_STAGES.length,
      masteredCount: mastered,
      totalTexts: TOTAL_TEXTS,
      pct: round(ratio * 100),
    };
  }

  function flourishTier(pct) {
    let tier = 0;
    for (let i = 1; i < FLOURISH_AT.length; i++) {
      if (pct >= FLOURISH_AT[i]) tier = i;
    }
    return tier;
  }

  // ── 三院落繁茂度 ──────────────────────────────────────────
  function courtyards(texts, progress) {
    return COURTS.map((c) => {
      let done;
      let total;
      let pct;
      if (c.kind === 'level') {
        const pool = (texts || []).filter((t) => t.level === c.level);
        total = pool.length;
        done = pool.filter((t) => isMastered(textStat(progress, t.id))).length;
        pct = total > 0 ? round((done / total) * 100) : 0;
      } else {
        done = totalAnswers(progress);
        total = TREASURY_CAP;
        pct = Math.min(100, round((done / TREASURY_CAP) * 100));
      }
      const tier = flourishTier(pct);
      return { ...c, done, total, pct, tier, tierName: FLOURISH_TIERS[tier] };
    });
  }

  // ── 精通掛軸藏書閣（每篇達精通 → 一幅掛軸）────────────────────
  function scrolls(texts, progress) {
    return masteredTexts(texts, progress).map((t) => ({
      id: t.id, title: t.title, author: t.author, era: t.era, level: t.level,
    }));
  }

  // ── 學習量裝飾實體化 ──────────────────────────────────────
  function decorCounts(progress) {
    const correct = totalCorrect(progress);
    const out = {};
    for (const [kind, def] of Object.entries(DECOR_KINDS)) {
      out[kind] = Math.min(def.cap, Math.floor(correct / def.per));
    }
    return out;
  }

  function defaultPos(kind, i) {
    const b = BANDS[kind] || BANDS.bamboo;
    const k = i % b.wrap;
    return { x: clampPct(b.x0 + b.dx * k), y: clampPct(b.y0 + b.dy * k) };
  }

  function decorations(texts, progress, state) {
    const counts = decorCounts(progress);
    const placements = (state && state.placements) || {};
    const out = [];
    for (const [kind, def] of Object.entries(DECOR_KINDS)) {
      for (let i = 0; i < counts[kind]; i++) {
        const id = `${kind}-${i}`;
        const custom = !!placements[id];
        const pos = custom ? placements[id] : defaultPos(kind, i);
        out.push({ id, kind, name: def.name, emoji: def.emoji, x: pos.x, y: pos.y, custom });
      }
    }
    return out;
  }

  function placeDecoration(state, decorId, x, y) {
    const sep = typeof decorId === 'string' ? decorId.lastIndexOf('-') : -1;
    const kind = sep > 0 ? decorId.slice(0, sep) : '';
    if (!DECOR_KINDS[kind]) return { ok: false, msg: '沒有這個裝飾' };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, msg: '座標無效' };
    state.placements[decorId] = { x: clampPct(x), y: clampPct(y) };
    return { ok: true };
  }

  function resetPlacements(state) {
    state.placements = {};
    return { ok: true };
  }

  // ── 名句池（詞庫＝已精通選文的代表句；白名單命中原文才採用，否則程式化擷取）──
  function extractClauses(text) {
    if (!text) return [];
    return String(text)
      .split(/[。！？]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 5 && s.length <= 24);
  }

  function quotesFor(text) {
    const passage = text.passage || (text.segments || []).map((s) => s.text).join('');
    const picked = [];
    const seen = new Set();
    const push = (s) => {
      if (s && !seen.has(s)) { seen.add(s); picked.push(s); }
    };
    // 1) 白名單：僅在確為原文子字串時採用
    for (const line of (MINGJU[text.id] || [])) {
      if (passage.includes(line)) push(line);
      if (picked.length >= 3) break;
    }
    // 2) 不足 3 句，用真實段落擷取補齊
    if (picked.length < 3) {
      for (const seg of (text.segments || [])) {
        for (const c of extractClauses(seg.text)) {
          push(c);
          if (picked.length >= 3) break;
        }
        if (picked.length >= 3) break;
      }
    }
    return picked.slice(0, 3);
  }

  function quotePool(texts, progress) {
    const out = [];
    for (const t of masteredTexts(texts, progress)) {
      quotesFor(t).forEach((text, k) => {
        out.push({ id: `${t.id}#${k}`, textId: t.id, title: t.title, author: t.author, text });
      });
    }
    return out;
  }

  function quoteById(texts, progress, quoteId) {
    return quotePool(texts, progress).find((q) => q.id === quoteId) || null;
  }

  // ── 匾額（單句門匾）與對聯（上下聯，皆自名句池選）──────────────
  function setPlaque(state, texts, progress, quoteId) {
    if (quoteId === null) { state.plaque = null; return { ok: true }; }
    if (!quoteById(texts, progress, quoteId)) return { ok: false, msg: '只能選已精通選文的名句' };
    state.plaque = quoteId;
    return { ok: true };
  }

  function getPlaque(state, texts, progress) {
    if (!state.plaque) return null;
    return quoteById(texts, progress, state.plaque);
  }

  function setCouplet(state, texts, progress, upId, downId) {
    if (upId === null && downId === null) { state.couplet = null; return { ok: true }; }
    const up = quoteById(texts, progress, upId);
    const down = quoteById(texts, progress, downId);
    if (!up || !down) return { ok: false, msg: '上下聯都要選已精通選文的名句' };
    if (upId === downId) return { ok: false, msg: '上下聯不可用同一句' };
    state.couplet = { up: upId, down: downId };
    return { ok: true };
  }

  function getCouplet(state, texts, progress) {
    if (!state.couplet) return null;
    const up = quoteById(texts, progress, state.couplet.up);
    const down = quoteById(texts, progress, state.couplet.down);
    if (!up || !down) return null; // 若相關篇目退出精通（理論上不會）則不顯示
    return { up, down };
  }

  // ── 慶典佇列（升境／院落升級各慶祝一次，只加不扣）──────────────
  function pendingCelebrations(texts, progress, state) {
    const out = [];
    const g = gateStage(texts, progress);
    for (let r = 1; r <= g.stage; r++) {
      const id = `gate-${r}`;
      if (!state.celebrated.includes(id)) {
        out.push({ id, type: 'gate', title: `文氣入境・${GATE_STAGES[r]}`, text: GATE_BLESS[r] });
      }
    }
    for (const c of courtyards(texts, progress)) {
      for (let tier = 1; tier <= c.tier; tier++) {
        const id = `court-${c.id}-t${tier}`;
        if (!state.celebrated.includes(id)) {
          out.push({ id, type: 'court', title: `${c.name}・${FLOURISH_TIERS[tier]}`, text: `${c.name}日漸繁茂，庭園又添一分生氣。` });
        }
      }
    }
    return out;
  }

  function markCelebrated(state, celebId) {
    if (!state.celebrated.includes(celebId)) state.celebrated.push(celebId);
    return state;
  }

  // 首次開堂：既有進度全部靜默入帳，避免老玩家一開門被慶典洪水轟炸
  function seedCelebrated(texts, progress, state) {
    for (const p of pendingCelebrations(texts, progress, state)) markCelebrated(state, p.id);
    state.seeded = true;
    return state;
  }

  // ── 成就牆（由真實統計 derive；只陳列榮譽＋進度，不做懲罰）──────
  function achievements(texts, progress, streak) {
    const mastered = masteredTexts(texts, progress).length;
    const correct = totalCorrect(progress);
    const days = (streak && streak.days) || 0;
    const defs = [
      { id: 'first-scroll', name: '初通一篇', desc: '精通任一選文', now: mastered, need: 1 },
      { id: 'ten-scrolls', name: '博覽十篇', desc: '精通 10 篇選文', now: mastered, need: 10 },
      { id: 'all-scrolls', name: '文宗大成', desc: '精通全部 27 篇', now: mastered, need: TOTAL_TEXTS },
      { id: 'diligent-100', name: '勤學不輟', desc: '累計答對 100 題', now: correct, need: 100 },
      { id: 'diligent-300', name: '筆耕不休', desc: '累計答對 300 題', now: correct, need: 300 },
      { id: 'streak-7', name: '七日連讀', desc: '連續學習 7 天', now: days, need: 7 },
    ];
    return defs.map((d) => ({
      id: d.id, name: d.name, desc: d.desc,
      now: Math.min(d.now, d.need), need: d.need,
      unlocked: d.now >= d.need,
    }));
  }

  // ── 整包視圖（UI 一次拿齊）─────────────────────────────────
  function getView(texts, progress, state, streak) {
    return {
      gate: gateStage(texts, progress),
      courtyards: courtyards(texts, progress),
      scrolls: scrolls(texts, progress),
      decorations: decorations(texts, progress, state),
      plaque: getPlaque(state, texts, progress),
      couplet: getCouplet(state, texts, progress),
      quotePool: quotePool(texts, progress),
      achievements: achievements(texts, progress, streak),
    };
  }

  const API = {
    KEY, VERSION, TOTAL_TEXTS, TREASURY_CAP,
    GATE_STAGES, FLOURISH_TIERS, COURTS, DECOR_KINDS,
    defaultState, load, save,
    isMastered, textStat, totalCorrect, totalAnswers, masteredTexts,
    gateStage, flourishTier, courtyards, scrolls,
    decorCounts, defaultPos, decorations, placeDecoration, resetPlacements,
    quotePool, quoteById, quotesFor,
    setPlaque, getPlaque, setCouplet, getCouplet,
    pendingCelebrations, markCelebrated, seedCelebrated,
    achievements, getView,
  };

  root.WYCaotangStore = API;
})(typeof window !== 'undefined' ? window : globalThis);
