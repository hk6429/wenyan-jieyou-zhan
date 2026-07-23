// 全班文會純邏輯：白帽排名裁切（只露前五＋自己名次）＋硯靈宣讀戰報。可 node --test。
const WYLiveWall = (() => {
  // 只回前 topN＋自己（若不在前段）的名次，不外流倒數名單（避免公開處刑）
  function safeBoard(rows, myNick, topN = 5) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, topN).map(({ nick, score }) => ({ nick, score }));
    const idx = sorted.findIndex((r) => r.nick === myNick);
    const me = idx >= topN ? { rank: idx + 1, nick: myNick, score: sorted[idx].score } : null;
    return { top, me, total: sorted.length };
  }

  // 硯靈宣讀式戰報（文言腔）：開頭「硯靈宣讀：」、收尾「濁墨退散」
  function buildHerald({ label, rows }) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const champ = sorted[0];
    if (!champ) return [`硯靈宣讀：${label} 文會虛位以待，誰為先聲奪人之士？`];
    const ord = ['亞', '季'];
    return [
      `硯靈宣讀：${label} 文會戰況——`,
      `本場魁首：${champ.nick}！答對 ${champ.score} 題，筆掃千軍。`,
      ...sorted.slice(1, 3).map((e, i) => `${ord[i]}席：${e.nick}，答對 ${e.score} 題。`),
      '眾書生聞聲而賀，濁墨退散三尺！',
    ];
  }

  function histAnswer(hist, qNo) {
    if (hist && typeof hist === 'object' && !Array.isArray(hist)) {
      const value = hist[qNo] ?? hist[String(qNo)];
      return value === 1 || value === '1' ? 1 : value === 0 || value === '0' ? 0 : null;
    }
    const legacy = String(hist || '');
    const value = legacy[qNo - 1];
    return value === '1' ? 1 : value === '0' ? 0 : null;
  }

  // 老師戰情室：以題號聚合逐題對錯；新格式 hist={題號:0|1}，並相容舊字串。
  // 回 [{ qNo, correct, answered, pct, cold }]，cold=正確率<50%（隔天課堂該講評的題）。qn=本場題數。
  function questionHotspots(rows, qn) {
    const n = Math.max(0, Math.round(qn) || 0);
    const out = [];
    for (let j = 0; j < n; j++) {
      let correct = 0, answered = 0;
      for (const r of rows) {
        const value = histAnswer(r.hist, j + 1);
        if (value !== null) { answered++; if (value === 1) correct++; }
      }
      const pct = answered ? Math.round(correct / answered * 100) : null;
      out.push({ qNo: j + 1, correct, answered, pct, cold: pct !== null && pct < 50 });
    }
    return out;
  }

  function buildTeacherReview({ rows = [], questions = [] } = {}) {
    const hotspots = questionHotspots(rows, questions.length);
    return hotspots.map((spot, index) => {
      const q = questions[index] || {};
      const options = Array.isArray(q.options) ? q.options : [];
      return {
        qNo: spot.qNo,
        stem: String(q.stem || ''),
        answer: String(options[q.answerIdx] ?? ''),
        correct: spot.correct,
        answered: spot.answered,
        missing: Math.max(0, rows.length - spot.answered),
        pct: spot.pct,
        needsReview: spot.cold,
      };
    });
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function teacherReviewCsv(review = []) {
    const header = ['題號', '題幹', '正解', '有效作答N', '缺答N', '正確率', '是否需講評'];
    const lines = review.map((row) => [
      row.qNo,
      row.stem,
      row.answer,
      row.answered,
      row.missing,
      row.pct == null ? '—' : `${row.pct}%`,
      row.needsReview ? '是' : '否',
    ].map(csvCell).join(','));
    return `\uFEFF${[header.join(','), ...lines].join('\r\n')}`;
  }

  function htmlText(value) {
    return String(value ?? '').replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]));
  }

  function teacherReviewPrintHtml({ code = '', review = [] } = {}) {
    const rows = review.map((row) => `<tr class="${row.needsReview ? 'needs-review' : ''}">
      <td>${htmlText(row.qNo)}</td><td>${htmlText(row.stem)}</td><td>${htmlText(row.answer)}</td>
      <td>${htmlText(row.answered)}</td><td>${htmlText(row.missing)}</td>
      <td>${row.pct == null ? '—' : `${htmlText(row.pct)}%`}</td><td>${row.needsReview ? '是' : '否'}</td>
    </tr>`).join('');
    return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><title>本場講評・${htmlText(code)}</title>
      <style>body{font-family:system-ui,sans-serif;color:#241f1b;margin:24px}h1{font-size:22px}p{color:#665c52}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #aaa;padding:7px;text-align:left;vertical-align:top}.needs-review{background:#fde8e5}@media print{body{margin:12mm}}</style>
      </head><body><h1>本場講評・${htmlText(code)}</h1><p>本表不含學生姓名，僅供教師依全班匿名作答統計安排講評。</p>
      <table><thead><tr><th>題號</th><th>題幹</th><th>正解</th><th>有效作答N</th><th>缺答N</th><th>正確率</th><th>是否需講評</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  }

  return { safeBoard, buildHerald, questionHotspots, buildTeacherReview, teacherReviewCsv, teacherReviewPrintHtml };
})();
if (typeof globalThis !== 'undefined') globalThis.WYLiveWall = WYLiveWall;
