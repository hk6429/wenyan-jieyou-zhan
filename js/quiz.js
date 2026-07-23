const WYQuiz = (() => {
  let texts = [];

  function init(allTexts) {
    texts = allTexts;
  }

  // 以題目 id 的字元雜湊當各題「獨立」洗牌種子（base 混入回合 seed）。
  // 修正舊版 seed+q.id.length：id 長度只有 5/6 兩種，一回合僅套兩種排列，
  // 配合題庫 80% 正解落 index 0，學生看一兩題高亮就能「認位置」破解、不必讀懂。
  function optSeed(id, base) {
    let h = (base >>> 0) || 0;
    for (let i = 0; i < id.length; i++) h = ((h * 31 + id.charCodeAt(i)) >>> 0);
    return h;
  }

  function seededShuffle(arr, seed) {
    let s = seed;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 題型難度序（心流暖身斜坡用）：字義最易→篇章最難
  const TYPE_ORDER = { char: 0, sentence: 1, gist: 2, theme: 3 };

  // 出一輪題目。
  //   type：篩單一題型（char/sentence/gist/theme）；null＝混合。
  //   tag ：篩能力標籤（虛詞/活用/古今異義/通假/句式）——供「專練某能力」，不生成新題只篩既有題。
  //   n   ：短關題數上限（null＝全部；自測短關傳 8，對戰不傳＝整池循環）。
  //   ramp：true 時把三題由易到難的暖身題放在開頭，其餘維持洗牌順序。
  function buildQuiz(textId, { type = null, tag = null, seed = Date.now(), n = null, ramp = false } = {}) {
    const t = texts.find((x) => x.id === textId);
    if (!t) return { title: '', questions: [] };
    let pool = t.questions.slice();
    if (type) pool = pool.filter((q) => q.type === type);
    if (tag) pool = pool.filter((q) => Array.isArray(q.tags) && q.tags.includes(tag));
    let qs;
    if (!type && !tag && Number(n) === 8) {
      const selected = [];
      for (const [quizType, rank] of Object.entries(TYPE_ORDER)) {
        selected.push(...seededShuffle(pool.filter((q) => q.type === quizType), seed + rank + 1).slice(0, 2));
      }
      const picked = new Set(selected);
      const fallback = seededShuffle(pool.filter((q) => !picked.has(q)), seed + 97);
      qs = seededShuffle(selected.concat(fallback.slice(0, Math.max(0, 8 - selected.length))), seed).slice(0, 8);
    } else {
      qs = seededShuffle(pool, seed);
      if (n && n > 0) qs = qs.slice(0, n);
    }
    if (ramp && qs.length > 1) {
      const warmCount = Math.min(3, qs.length);
      const ranked = qs.map((q, i) => ({ q, i, rank: TYPE_ORDER[q.type] ?? 9 }))
        .sort((a, b) => a.rank - b.rank || a.i - b.i)
        .slice(0, warmCount);
      const picked = new Set(ranked.map((x) => x.q.id));
      const warmup = ranked.map((x) => x.q);
      qs = warmup.concat(qs.filter((q) => !picked.has(q.id)));
    }
    qs = qs.map((q) => {
      const optOrder = seededShuffle([0, 1, 2, 3], optSeed(q.id, seed));
      return {
        id: q.id,
        stem: q.stem,
        options: optOrder.map((i) => q.options[i]),
        answerIdx: optOrder.indexOf(q.answer),
        explain: q.explain,
        type: q.type,
        tags: q.tags || [],
      };
    });
    return { title: t.title, textId, questions: qs };
  }

  function isoWeekKey(input = new Date()) {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '';
    const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  function seedFromKey(key) {
    let h = 2166136261;
    for (const ch of String(key)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 週經典賽：每週固定從 20 篇各取一題，四題型各 5 題；完全重用既有題庫。
  function buildWeeklyQuiz({ date = new Date(), weekKey = null, n = 20 } = {}) {
    const key = weekKey || isoWeekKey(date);
    const seed = seedFromKey(key);
    const count = Math.max(1, Math.min(20, Number(n) || 20, texts.length));
    const textOrder = seededShuffle(texts.slice().sort((a, b) => a.id.localeCompare(b.id)), seed);
    const selected = [];
    const types = Object.keys(TYPE_ORDER);
    for (let i = 0; i < textOrder.length && selected.length < count; i++) {
      const t = textOrder[i];
      const preferred = types[selected.length % types.length];
      const sameType = (t.questions || []).filter((q) => q.type === preferred);
      const pool = sameType.length ? sameType : (t.questions || []);
      if (!pool.length) continue;
      const raw = seededShuffle(pool, optSeed(t.id, seed))[0];
      const optOrder = seededShuffle([0, 1, 2, 3], optSeed(raw.id, seed));
      selected.push({
        id: raw.id, textId: t.id, textTitle: t.title, stem: raw.stem,
        options: optOrder.map((k) => raw.options[k]), answerIdx: optOrder.indexOf(raw.answer),
        explain: raw.explain, type: raw.type, tags: raw.tags || [],
      });
    }
    return { title: `週經典賽 ${key}`, weekKey: key, textId: null, questions: selected, mode: 'weekly' };
  }

  // 某篇含指定能力標籤的題數（供 UI 判斷要不要顯示該專練入口）
  function tagCount(textId, tag) {
    const t = texts.find((x) => x.id === textId);
    if (!t) return 0;
    return t.questions.filter((q) => Array.isArray(q.tags) && q.tags.includes(tag)).length;
  }

  // 全形英數→半形、去所有空白，用於填空題自由輸入的寬鬆比對
  function normText(s) {
    return String(s == null ? '' : s)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/\s+/g, '')
      .trim();
  }

  // 填空生成題（B1 generation effect）：從既有「原文 segment ＋ 字詞注釋 glossary」即時挖空，
  // 看白話注釋回填原文字詞——強迫「回憶生成」而非「再認選項」，且天然免疫背選項位置。零資料改動、零捏造。
  function buildClozeQuiz(textId, { seed = Date.now(), n = 8 } = {}) {
    const t = texts.find((x) => x.id === textId);
    if (!t) return { title: '', textId, questions: [], mode: 'cloze' };
    const pool = [];
    const seen = new Set();
    (t.segments || []).forEach((seg) => {
      (seg.glossary || []).forEach((g) => {
        const w = (g.word || '').trim();
        if (!w || w.length > 4 || !g.gloss) return; // 只挖 1~4 字的詞、須有白話注釋
        const idx = (seg.text || '').indexOf(w);
        if (idx < 0) return; // 注釋詞須真的出現在原句（守住不捏造）
        if (idx !== seg.text.lastIndexOf(w)) return; // 只挖「該段僅出現一次」的詞：答案唯一、不會在別處露出
        const key = `${seg.no}|${w}`;
        if (seen.has(key)) return;
        seen.add(key);
        const blanked = seg.text.slice(0, idx) + '＿'.repeat(w.length) + seg.text.slice(idx + w.length);
        pool.push({
          id: `cloze-${textId}-${seg.no}-${w}`,
          type: 'cloze',
          segNo: seg.no,
          prompt: blanked,
          hint: g.gloss,
          answerText: w,
          accept: [w],
          explain: `原句：${seg.text}　「${w}」＝${g.gloss}`,
        });
      });
    });
    return { title: t.title, textId, questions: seededShuffle(pool, seed).slice(0, n), mode: 'cloze' };
  }

  // 依一組 qId（可跨篇、含 cloze）重建一份複習卷：SRS 今日到期、錯題本共用。
  // 每題自帶 textId（跨篇混合，作答計分時用各自的 textId）。找不到的 id 略過。
  function buildReviewQuiz(qIds, { seed = Date.now(), title = '複習', n = 10 } = {}) {
    const wantCloze = new Map(); // textId -> Set(word|segNo) 供批次重建
    const out = [];
    (qIds || []).forEach((qId, i) => {
      const fm = /^fc-(t\d{2})-(\d+)$/.exec(qId);
      if (fm) {
        const t = texts.find((x) => x.id === fm[1]);
        const seg = t && (t.segments || []).find((x) => Number(x.no) === Number(fm[2]));
        if (t && seg && seg.translation) {
          const distractors = texts.flatMap((x) => x.segments || []).map((x) => x.translation).filter((x) => x && x !== seg.translation);
          const options = [seg.translation, ...seededShuffle(distractors, optSeed(qId, seed)).slice(0, 3)];
          const order = seededShuffle([0, 1, 2, 3], optSeed(qId, seed + i));
          out.push({ id: qId, textId: t.id, stem: `下列何者最接近「${seg.text}」的白話語譯？`, options: order.map((k) => options[k]), answerIdx: order.indexOf(0), explain: `原句「${seg.text}」可譯為：${seg.translation}`, type: 'sentence', tags: [] });
        }
        return;
      }
      const m = /^cloze-(t\d{2})-(\d+)-(.+)$/.exec(qId);
      if (m) {
        const [, tId] = m;
        if (!wantCloze.has(tId)) wantCloze.set(tId, new Set());
        wantCloze.get(tId).add(qId);
        return;
      }
      // 一般選擇題：跨篇尋找
      for (const t of texts) {
        const q = t.questions.find((x) => x.id === qId);
        if (q) {
          const optOrder = seededShuffle([0, 1, 2, 3], optSeed(q.id, seed + i));
          out.push({
            id: q.id, textId: t.id, stem: q.stem,
            options: optOrder.map((k) => q.options[k]),
            answerIdx: optOrder.indexOf(q.answer),
            explain: q.explain, type: q.type, tags: q.tags || [],
          });
          break;
        }
      }
    });
    // 重建 cloze 題：整篇生成一次再挑出要的
    for (const [tId, ids] of wantCloze) {
      const full = buildClozeQuiz(tId, { seed, n: 999 });
      full.questions.forEach((q) => { if (ids.has(q.id)) out.push({ ...q, textId: tId }); });
    }
    return { title, textId: null, questions: seededShuffle(out.slice(0, n), seed), mode: 'review' };
  }

  // 填空作答判對（寬鬆比對：全半形、空白差異都容忍）
  function checkCloze(q, input) {
    const a = normText(input);
    return a.length > 0 && (q.accept || [q.answerText]).some((x) => normText(x) === a);
  }

  function hintWrongIndex(q, excluded = []) {
    if (!q || !Array.isArray(q.options)) return -1;
    const hidden = new Set(excluded);
    return q.options.findIndex((_, i) => i !== q.answerIdx && !hidden.has(i));
  }

  function typeLabel(type) {
    return { char: '字義', sentence: '句義', gist: '段旨', theme: '篇章文意', cloze: '填空' }[type] || type;
  }

  return { init, buildQuiz, buildWeeklyQuiz, buildClozeQuiz, buildReviewQuiz, isoWeekKey, seedFromKey, tagCount, checkCloze, hintWrongIndex, normText, typeLabel, seededShuffle };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WYQuiz;
