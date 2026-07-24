import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('新手首頁「從這篇開始」先開啟《詠雪》閱讀詳情，不直接開始自測', () => {
  const binding = app.match(/const sc = document\.getElementById\('startCard'\);[\s\S]*?\n  }\n/);
  assert.ok(binding, '應綁定新手起步卡');
  assert.match(binding[0], /renderTextDetail\(startText\)/);
  assert.doesNotMatch(binding[0], /renderQuiz\(\)/);
});

test('自測答對後保留解析，必須由學生按「下一題」才前進', () => {
  const feedback = app.match(/function revealFeedback\([\s\S]*?\n}\n\n/);
  assert.ok(feedback, '應有共用作答回饋流程');
  assert.match(feedback[0], /id="nextQ"/);
  assert.doesNotMatch(feedback[0], /setTimeout\([\s\S]*advance/);
});

test('提示券在作答前提供，答錯後的自我解釋不再顯示失效提示', () => {
  const question = app.match(/const hintTickets = WYStore\.getHintTickets\(\);[\s\S]*?<div class="options">/);
  assert.ok(question, '應有選擇題卡片');
  assert.match(question[0], /id="useHintBefore"/);
  assert.ok(question[0].indexOf('id="useHintBefore"') < question[0].indexOf('<div class="options">'));

  const wrongFeedback = app.match(/function askSelfExplain\([\s\S]*?\n}\n\n/);
  assert.ok(wrongFeedback, '應有答錯自我解釋流程');
  assert.doesNotMatch(wrongFeedback[0], /useHint|getHintTickets/);
});

test('完成文案與儀表板的篇數取自 TEXTS.length', () => {
  const home = app.match(/function renderHomeStatus\([\s\S]*?\n}\n\n/);
  const dashboard = app.match(/function renderDashboard\([\s\S]*?\n}\n\n/);
  assert.ok(home && dashboard);
  assert.match(home[0], /TEXTS\.length/);
  assert.match(dashboard[0], /TEXTS\.length/);
  assert.doesNotMatch(`${home[0]}\n${dashboard[0]}`, /\/27|27 篇/);
});

test('對戰答題後顯示正解與解析，由學生按鈕繼續', () => {
  const battle = app.match(/function drawBattle\([\s\S]*?\n}\n\nfunction thumbPath/);
  const feedback = app.match(/function showBattleFeedback\([\s\S]*?\n}\n\nfunction renderWenhao/);
  assert.ok(battle && feedback);
  assert.doesNotMatch(battle[0], /currentQIdx \+= 1;\s*drawBattle\(\);\s*showBattleFeedback/);
  assert.match(battle[0], /showBattleFeedback\([^;]*q\)/);
  assert.match(feedback[0], /q\.options\[q\.answerIdx\]/);
  assert.match(feedback[0], /q\.explain/);
  assert.match(feedback[0], /id="battleContinue"/);
  assert.match(feedback[0], /currentQIdx \+= 1;\s*drawBattle\(\)/);
});

test('首頁只呈現一張五分鐘下一步，延後驗證完成後才標記穩固精通', () => {
  assert.match(app, /WYStore\.nextAction\(TEXTS\)/);
  assert.match(app, /今日五分鐘/);
  assert.match(app, /startRetentionQuiz/);
  assert.match(app, /WYStore\.recordRetentionCheck/);
  assert.match(app, /今日已完成，收筆休息/);
  assert.match(app, /穩固精通/);
  assert.doesNotMatch(app, /別讓火苗熄了/);
  assert.match(app, /可安心休息/);
});

test('選文詳情預設先讀原文，不在學生嘗試前直接揭露完整語譯', () => {
  assert.match(app, /let segTabPreference = 'attempt'/);
  assert.ok(app.indexOf("{ key: 'attempt'") < app.indexOf("{ key: 'translation'"));
  assert.match(app, /先讀後揭/);
  assert.match(app, /先用自己的話說一句/);
  assert.match(app, /tabKey === 'translation'/);
});
