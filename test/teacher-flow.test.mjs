import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const rtUi = readFileSync(new URL('../js/rt-ui.js', import.meta.url), 'utf8');

function fakeMount() {
  const controls = new Map();
  return {
    isConnected: true,
    innerHTML: '',
    querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, { addEventListener() {}, value: '', dataset: {} });
      return controls.get(selector);
    },
    querySelectorAll() { return []; },
  };
}

test('教師可從永遠可見入口直接開啟主持畫面，不依賴江湖解鎖', async () => {
  assert.match(index, /id="teacher-launch"[^>]*>教師開課・文戰擂台</);
  await import('../js/rt-ui.js');
  const mount = fakeMount();
  globalThis.WYRt.openTeacher(mount);
  assert.match(mount.innerHTML, /主持全班文會/);
  assert.match(mount.innerHTML, /請勿使用學生真實姓名/);
});

test('教師 roster 帶主持 pin，學生結束不讀完整 roster，篇數不寫死', () => {
  assert.match(rtUi, /op:\s*'roster',\s*code:\s*h\.code,\s*pin:\s*h\.pin/);
  const studentEnd = rtUi.slice(rtUi.indexOf('async function liveStudentEnd'), rtUi.indexOf('// ---------- 全班文會：老師端'));
  assert.doesNotMatch(studentEnd, /op:\s*'roster'/);
  assert.doesNotMatch(rtUi, /全\s*27\s*篇/);
});

test('教師主持預設開啟投影安全模式，不在投影畫面公開學生排名', () => {
  assert.match(rtUi, /id="rt-projector-safe"[^>]*checked/);
  assert.match(rtUi, /projectorSafe\s*=\s*true/);
  assert.match(rtUi, /projectorSafe\s*\?\s*`[\s\S]*投影安全模式已開啟/);
});

test('排名與同儕對戰只比作答，不套用交易道具或文魄傷害加成', () => {
  const realtimeAnswer = rtUi.slice(rtUi.indexOf('function answer(v)'), rtUi.indexOf('function maybeOmen'));
  const soloAnswer = rtUi.slice(rtUi.indexOf('function answerSolo(v)'), rtUi.indexOf('async function finishChallenge'));
  assert.doesNotMatch(realtimeAnswer, /bonusDmg\(\)/);
  assert.match(soloAnswer, /B\.bot\s*&&\s*bonusDmg\(\)/);
});

test('全班文會的個人錯題回到本機自學處方，不灌入精通統計', () => {
  const studentAnswer = rtUi.slice(rtUi.indexOf('function renderLiveQ'), rtUi.indexOf('async function liveStudentEnd'));
  assert.match(studentAnswer, /WYStore\.recordAnswer/);
  assert.match(studentAnswer, /countForMastery:\s*false/);
  assert.match(studentAnswer, /source:\s*'class-meeting'/);
  assert.match(rtUi, /課後已整理到你的私人錯題修補/);
});
