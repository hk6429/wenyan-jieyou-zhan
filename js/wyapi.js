// 跨子系統共用 API helper（文戰擂台 / 文房市集一律經此呼叫後端）。
// 後端只部署在 Cloudflare Pages 一個平台；鏡像站（vercel.app / netlify.app）打絕對網址，
// 讓鏡像站的線上功能不降級。⛔ 禁止任何模組繞過本檔直接 fetch('api/...') 相對路徑
// ——vocab-duel 的 rtbattle.js 用相對路徑導致只有 pages.dev 本尊能連後端，其餘鏡像站功能全掛。
const WYAPI = (() => {
  const API_ORIGIN = 'https://wenyan-jieyou-zhan.pages.dev';
  const SAME_ORIGIN_HOSTS = new Set(['wenyan-jieyou-zhan.pages.dev', 'localhost', '127.0.0.1']);

  function apiBase(hostname) {
    return SAME_ORIGIN_HOSTS.has(hostname) ? '' : API_ORIGIN;
  }

  function host() {
    return typeof location !== 'undefined' ? location.hostname : 'localhost';
  }

  return {
    base() { return apiBase(host()); },
    apiBase, // 匯出供測試注入 hostname
    // path 必以 '/api/' 開頭。回傳伺服器 JSON；網路失敗/斷線回 null（呼叫端顯示降級畫面）。
    async call(path, { method = 'POST', body } = {}) {
      if (typeof path !== 'string' || !path.startsWith('/api/')) {
        throw new TypeError(`WYAPI.call path 必須以 /api/ 開頭：${path}`);
      }
      const opts = { method };
      if (body !== undefined) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
      try {
        const r = await fetch(apiBase(host()) + path, opts);
        return await r.json();
      } catch {
        return null;
      }
    },
  };
})();
if (typeof window !== 'undefined') window.WYAPI = WYAPI;
