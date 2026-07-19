const WYQuiz = (() => {
  let texts = [];

  function init(allTexts) {
    texts = allTexts;
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

  // 出一輪題目：預設全題型混合，可傳 type 篩選單一題型（字義/句義/段旨/篇章）
  function buildQuiz(textId, { type = null, seed = Date.now() } = {}) {
    const t = texts.find((x) => x.id === textId);
    if (!t) return { title: '', questions: [] };
    let qs = type ? t.questions.filter((q) => q.type === type) : t.questions.slice();
    qs = seededShuffle(qs, seed).map((q) => {
      const optOrder = seededShuffle([0, 1, 2, 3], seed + q.id.length);
      return {
        id: q.id,
        stem: q.stem,
        options: optOrder.map((i) => q.options[i]),
        answerIdx: optOrder.indexOf(q.answer),
        explain: q.explain,
        type: q.type,
      };
    });
    return { title: t.title, textId, questions: qs };
  }

  function typeLabel(type) {
    return { char: '字義', sentence: '句義', gist: '段旨', theme: '篇章文意' }[type] || type;
  }

  return { init, buildQuiz, typeLabel, seededShuffle };
})();
