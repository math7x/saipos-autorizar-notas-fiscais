chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.tabs
    .sendMessage(tab.id, { type: "SAIPOS_FISCAL_TOGGLE_PANEL" })
    .catch(() => {
      // O clique fora de uma página do SAIPOS não precisa abrir nada.
    });
});
