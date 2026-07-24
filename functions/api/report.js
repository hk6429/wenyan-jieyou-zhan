import { kvFor } from './_kv.js';

const CATEGORY_LABELS = new Set(['內容錯誤', '功能異常', '操作建議', '其他']);
const ORIGINS = [
  'https://wenyan-jieyou-zhan.vercel.app',
  'https://wenyan-jieyou-zhan.pages.dev',
  'https://wenyan-jieyou-zhan.netlify.app',
  'http://localhost:8788',
  'http://localhost:8080',
  'http://localhost:8099',
];

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const corsHeaders = (request) => {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[1],
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
};
const reply = (request, body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: corsHeaders(request),
});

export async function submitReport(body, { send, now = new Date() }) {
  if (clean(body?.website, 200)) return { ok: 1 };
  const category = CATEGORY_LABELS.has(body?.category) ? body.category : '其他';
  const message = clean(body?.message, 2000);
  const contact = clean(body?.contact, 120) || '未提供';
  const pageUrl = clean(body?.pageUrl, 500) || '未提供';
  const userAgent = clean(body?.userAgent, 300) || '未提供';
  if ([...message].length < 10) {
    return { ok: 0, error: '請至少輸入 10 個字的問題說明' };
  }
  const reportedAt = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(now);

  await send([
    '📮 文言解憂站｜問題回報',
    '',
    `類型：${category}`,
    `時間：${reportedAt}`,
    `說明：${message}`,
    `聯絡方式：${contact}`,
    `頁面：${pageUrl}`,
    `裝置：${userAgent}`,
  ].join('\n'));

  return { ok: 1 };
}

async function telegramSend(text, env) {
  const token = clean(env.TELEGRAM_BOT_TOKEN, 200);
  const chatId = clean(env.TELEGRAM_CHAT_ID, 100);
  if (!token || !chatId) throw new Error('Telegram 尚未設定');
  const fetcher = env.REPORT_FETCH || fetch;
  const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error('Telegram 傳送失敗');
}

async function rateLimited(request, env) {
  if (!env.wenyan_db) return false;
  const ip = String(
    request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || 'unknown',
  ).split(',')[0].trim();
  const kv = kvFor(env.wenyan_db);
  return (await kv.incr(`wy_report:rl:${ip}`, 3600)) > 5;
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  try {
    if (await rateLimited(request, env)) {
      return reply(request, { ok: 0, error: '回報次數太頻繁，請稍後再試' }, 429);
    }
    const result = await submitReport(body, {
      send: (text) => telegramSend(text, env),
    });
    return reply(request, result, result.ok ? 200 : 400);
  } catch {
    return reply(request, { ok: 0, error: '回報暫時無法送出，請稍後再試' }, 502);
  }
}
