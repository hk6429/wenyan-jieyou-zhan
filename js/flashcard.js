const WYFlashcard = (() => {
  let texts = [];
  let queue = [];
  let idx = 0;

  function init(allTexts) {
    texts = allTexts;
  }

  function buildQueue(textId) {
    const t = texts.find((x) => x.id === textId);
    if (!t) return [];
    // 閃卡卡面 = 每個 segment，正面原文、背面段旨提示（取該段第一題 gist 題幹當提示）
    queue = t.segments.map((seg) => ({
      front: seg.text,
      back: (t.questions.find((q) => q.type === 'gist' && q.stem.includes(seg.text.slice(0, 4))) || {}).explain || '本段為承接／開篇段落，暫無獨立段旨提示，可直接翻回正面複習原文。',
    }));
    idx = 0;
    return queue;
  }

  function current() {
    return queue[idx] || null;
  }

  function next() {
    idx = Math.min(idx + 1, queue.length - 1);
    return current();
  }

  function prev() {
    idx = Math.max(idx - 1, 0);
    return current();
  }

  function progress() {
    return { idx: idx + 1, total: queue.length };
  }

  return { init, buildQueue, current, next, prev, progress };
})();
