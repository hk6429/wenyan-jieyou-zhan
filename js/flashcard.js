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
    // 閃卡卡面 = 每個 segment，正面原文、背面為該段的國學大師深度賞析（seg.note）
    queue = t.segments.map((seg) => ({
      front: seg.text,
      back: seg.note || (t.questions.find((q) => q.type === 'gist' && q.stem.includes(seg.text.slice(0, 4))) || {}).explain || '本段賞析尚待補充。',
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
