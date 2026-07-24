// 全站問題回報：前端只呼叫本站 API，Telegram Token 與 Chat ID 僅存在伺服器環境變數。
(() => {
  const dialog = document.getElementById('report-dialog');
  const form = document.getElementById('report-form');
  const openButton = document.getElementById('report-open');
  const closeButton = document.getElementById('report-close');
  const submitButton = document.getElementById('report-submit');
  const status = document.getElementById('report-status');
  if (!dialog || !form || !openButton || !closeButton || !submitButton || !status) return;

  function setStatus(message, state = '') {
    status.textContent = message;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  openButton.addEventListener('click', () => {
    setStatus('');
    dialog.showModal();
    document.getElementById('report-message')?.focus();
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitButton.disabled = true;
    setStatus('正在送出回報……', 'loading');
    const fields = new FormData(form);
    const result = await WYAPI.call('/api/report', {
      body: {
        category: fields.get('category'),
        message: fields.get('message'),
        contact: fields.get('contact'),
        website: fields.get('website'),
        pageUrl: location.href,
        userAgent: navigator.userAgent,
      },
    });
    submitButton.disabled = false;
    if (result?.ok === 1) {
      form.reset();
      setStatus('已收到，謝謝你幫文言解憂站變得更好！', 'success');
      return;
    }
    setStatus(result?.error || '目前無法送出，請稍後再試。', 'error');
  });
})();
