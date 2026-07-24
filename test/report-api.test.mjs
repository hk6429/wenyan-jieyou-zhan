import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitReport, onRequestPost } from '../functions/api/report.js';
import { createFakeD1 } from './helpers/fake-d1.mjs';

test('合法問題回報會整理成 Telegram 訊息並送出一次', async () => {
  const sent = [];
  const result = await submitReport({
    category: '內容錯誤',
    message: '〈桃花源記〉第二段的注釋似乎有誤。',
    contact: 'teacher@example.com',
    pageUrl: 'https://wenyan-jieyou-zhan.pages.dev/',
    userAgent: 'Test Browser',
  }, {
    send: async (text) => sent.push(text),
    now: new Date('2026-07-24T08:30:00.000Z'),
  });

  assert.deepEqual(result, { ok: 1 });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /文言解憂站｜問題回報/);
  assert.match(sent[0], /類型：內容錯誤/);
  assert.match(sent[0], /〈桃花源記〉第二段的注釋似乎有誤。/);
  assert.match(sent[0], /teacher@example\.com/);
  assert.match(sent[0], /wenyan-jieyou-zhan\.pages\.dev/);
});

test('問題說明太短時拒絕送出', async () => {
  let sendCount = 0;
  const result = await submitReport({
    category: '功能異常',
    message: '壞掉',
  }, {
    send: async () => { sendCount += 1; },
  });

  assert.deepEqual(result, { ok: 0, error: '請至少輸入 10 個字的問題說明' });
  assert.equal(sendCount, 0);
});

test('蜜罐欄位有值時靜默擋下機器人回報', async () => {
  let sendCount = 0;
  const result = await submitReport({
    category: '其他',
    message: '這是一筆看似正常但由機器人送出的回報。',
    website: 'https://spam.example',
  }, {
    send: async () => { sendCount += 1; },
  });

  assert.deepEqual(result, { ok: 1 });
  assert.equal(sendCount, 0);
});

test('POST /api/report 以伺服器端環境變數呼叫 Telegram', async () => {
  const calls = [];
  const request = new Request('https://wenyan-jieyou-zhan.pages.dev/api/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://wenyan-jieyou-zhan.pages.dev',
      'cf-connecting-ip': '203.0.113.8',
    },
    body: JSON.stringify({
      category: '操作建議',
      message: '希望選文列表可以增加朝代篩選功能。',
      pageUrl: 'https://wenyan-jieyou-zhan.pages.dev/',
    }),
  });
  const response = await onRequestPost({
    request,
    env: {
      wenyan_db: createFakeD1(),
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_CHAT_ID: '123456',
      REPORT_FETCH: async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: 1 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.telegram\.org\/bottest-token\/sendMessage$/);
  assert.equal(JSON.parse(calls[0].options.body).chat_id, '123456');
});
