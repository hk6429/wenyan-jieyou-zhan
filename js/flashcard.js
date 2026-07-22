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
    // 閃卡卡面 = 每個 segment：正面原文，背面為賞析＋白話語譯。
    // 帶 textId/segNo/translation：供「先自譯再對照」的生成型練習與 SRS 自評（qId=fc-<textId>-<segNo>）。
    queue = t.segments.map((seg) => ({
      front: seg.text,
      translation: seg.translation || '',
      back: seg.note || (t.questions.find((q) => q.type === 'gist' && q.stem.includes(seg.text.slice(0, 4))) || {}).explain || '本段賞析尚待補充。',
      textId,
      segNo: seg.no,
      qId: `fc-${textId}-${seg.no}`,
    }));
    idx = 0;
    return queue;
  }

  function current() {
    return queue[idx] || null;
  }

  function next() {
    idx = Math.min(idx + 1, queue.length);
    return current();
  }

  function prev() {
    idx = Math.max(idx - 1, 0);
    return current();
  }

  function progress() {
    return { idx: Math.min(idx + 1, queue.length), total: queue.length, finished: queue.length > 0 && idx >= queue.length };
  }

  return { init, buildQueue, current, next, prev, progress };
})();
