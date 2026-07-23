// 同一份靜態站部署於不同平台時，以 host 加入統計路徑，避免三平台流量互相混淆。
window.goatcounter = window.goatcounter || {};
window.goatcounter.path = (path) => `${window.location.host}${path}`;
