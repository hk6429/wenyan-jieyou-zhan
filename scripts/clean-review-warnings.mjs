import { readFileSync, writeFileSync } from 'node:fs';

const DATA_URL = new URL('../data/texts.json', import.meta.url);
const texts = JSON.parse(readFileSync(DATA_URL, 'utf8'));
let moved = 0;

// 非該段原文字串不是「字詞注釋」：完整移入原段賞析，不刪除其說明內容。
for (const text of texts) {
  for (const segment of text.segments) {
    const commentary = segment.glossary.filter((item) => !segment.text.includes(item.word));
    if (!commentary.length) continue;
    segment.glossary = segment.glossary.filter((item) => segment.text.includes(item.word));
    const supplement = commentary.map((item) => `「${item.word}」：${item.gloss}`).join('；');
    segment.note = `${segment.note}\n補充說明：${supplement}`;
    moved += commentary.length;
  }
}

// 七題既有正解是唯一長選項：只補強原本就錯的誘答，使長度不再洩漏正解。
const optionFixes = {
  t01q28: ['前往、到達某地', '前往、到達某地（文中指前往遠方）'],
  t01q46: ['完全否定內省反思的重要性，主張修身只需外在規範約束', '完全否定內省反思的重要性，主張修身只需外在規範約束，並以此作為治學核心'],
  t05q42: ['兩人態度完全相同，都是徹底反對移山，只是妻子委婉詢問，智叟直接嘲諷，對計畫看法一致', '兩人態度完全相同，都是徹底反對移山，只是妻子委婉詢問，智叟直接嘲諷，對計畫看法一致，立場沒有差別'],
  t05q44: ['說明愚公其實根本沒有真正挖山，一切都只是天神的功勞', '說明愚公其實根本沒有真正挖山，一切只是天神為彰顯神力而獨自完成，與愚公的意志毫無關係'],
  t05q46: ['純粹訴諸家族人多勢眾的優勢，並未真正回應智叟的質疑', '純粹訴諸家族人多勢眾的優勢，認為只靠子孫數量就能立刻完成，並未真正回應智叟對人力有限的質疑'],
  t05q48: ['作者刻意誇大愚公的年齡與體力，藉此諷刺老年人不自量力', '作者刻意誇大愚公的年齡與體力，藉此諷刺老年人不自量力，並主張面對困難應立即放棄到底'],
  t05q49: ['現代社會講求效率，愚公「挖山」的做法已完全不具參考價值', '現代社會講求效率，愚公「挖山」的做法既緩慢又仰賴神力，因此已完全不具任何參考價值'],
};

let rebalanced = 0;
for (const [id, [before, after]] of Object.entries(optionFixes)) {
  const q = texts.flatMap((text) => text.questions).find((item) => item.id === id);
  if (!q) throw new Error(`找不到 ${id}`);
  const index = q.options.indexOf(before);
  if (index >= 0) {
    if (index === q.answer) throw new Error(`${id} 指定修改的竟是正解`);
    q.options[index] = after;
    rebalanced += 1;
  } else if (!q.options.includes(after)) {
    throw new Error(`${id} 找不到預期誘答，拒絕猜測修改`);
  }
}

writeFileSync(DATA_URL, `${JSON.stringify(texts, null, 2)}\n`);
console.log(`移入 note 的非原文 glossary：${moved} 筆；平衡誘答：${rebalanced} 題。`);
