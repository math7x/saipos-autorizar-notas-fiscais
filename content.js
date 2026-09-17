(() => {
  "use strict";

  if (window.__saiposFiscalAssistantLoaded) return;
  window.__saiposFiscalAssistantLoaded = true;

  const state = {
    running: false,
    stopRequested: false,
    processed: 0,
    contingency: 0,
    skipped: new Set(),
    completed: new Set(),
    current: "Aguardando",
  };

  const normalize = (value) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) =>
    Boolean(
      element &&
        (element.offsetWidth || element.offsetHeight || element.getClientRects().length) &&
        getComputedStyle(element).visibility !== "hidden"
    );

  function visibleAll(selector, root = document) {
    return [...root.querySelectorAll(selector)].filter(visible);
  }

  function textOf(element) {
    return normalize(element?.innerText || element?.textContent || "");
  }

  function findByText(selector, text, root = document, exact = true) {
    const wanted = normalize(text);
    return visibleAll(selector, root).find((element) => {
      const current = textOf(element);
      return exact ? current === wanted : current.includes(wanted);
    });
  }

  async function waitFor(getter, timeout = 15000, interval = 250) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (state.stopRequested) throw new Error("Processamento interrompido pelo usuário");
      const result = getter();
      if (result) return result;
      await sleep(interval);
    }
    throw new Error("Tempo de espera excedido");
  }

  function click(element) {
    if (!visible(element)) throw new Error("Controle não está visível");
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
  }

  function setCheckbox(checkbox, checked) {
    if (!checkbox) throw new Error("Opção obrigatória não encontrada");
    if (Boolean(checkbox.checked) !== checked) click(checkbox);
  }

  function dialogs() {
    return visibleAll('[role="dialog"], .modal.in, .modal.show');
  }

  function findDialogWith(text) {
    const wanted = normalize(text);
    return dialogs().reverse().find((dialog) => textOf(dialog).includes(wanted));
  }

  function noteRows() {
    return visibleAll("tr").filter((row) => {
      if (!textOf(row).includes("NAO ENVIADO")) return false;
      return Boolean(findByText("button", "VER", row));
    });
  }

  function rowKey(row) {
    return textOf(row);
  }

  function nextRow() {
    return noteRows().find((row) => {
      const key = rowKey(row);
      return !state.skipped.has(key) && !state.completed.has(key);
    });
  }

  function checkboxNearText(root, text) {
    const wanted = normalize(text);
    const optionContainers = visibleAll(
      'label, md-checkbox, .checkbox, [role="checkbox"]',
      root
    ).filter((element) => textOf(element).includes(wanted));
    for (const container of optionContainers) {
      const checkbox =
        (container.matches('input[type="checkbox"]') ? container : null) ||
        container.querySelector('input[type="checkbox"]');
      if (checkbox) return checkbox;
    }

    return [...root.querySelectorAll('input[type="checkbox"]')].find((checkbox) => {
      const nearby = `${textOf(checkbox.parentElement)} ${textOf(
        checkbox.parentElement?.parentElement
      )}`;
      return nearby.includes(wanted);
    });
  }

  function fiscalPrintButton(orderDialog) {
    return visibleAll('button[ng-click="vm.printNfce();"]', orderDialog)[0] || null;
  }

  function isAmber(button) {
    return Boolean(button && /bgm-amber|warning|amber/i.test(button.className));
  }

  function getFiscalRows(documentDialog) {
    return visibleAll("tbody tr", documentDialog).filter(
      (row) => row.querySelectorAll('input[type="checkbox"]').length >= 5
    );
  }

  function fiscalRowKey(row) {
    return [...row.querySelectorAll("td")]
      .slice(0, 3)
      .map((cell) => textOf(cell))
      .join("|");
  }

  function liveFiscalRow(documentDialog, key) {
    return getFiscalRows(documentDialog).find((row) => fiscalRowKey(row) === key);
  }

  function isFiscalRowAuthorized(row) {
    const checks = [...(row?.querySelectorAll('input[type="checkbox"]') || [])];
    return Boolean(checks[1]?.checked);
  }

  function updatePanel() {
    const status = document.querySelector("#saipos-fiscal-status");
    const counters = document.querySelector("#saipos-fiscal-counters");
    const start = document.querySelector("#saipos-fiscal-start");
    const stop = document.querySelector("#saipos-fiscal-stop");
    if (status) status.textContent = state.current;
    if (counters) {
      counters.textContent = `Autorizadas: ${state.processed} · Contingência: ${state.contingency} · Puladas: ${state.skipped.size}`;
    }
    if (start) start.disabled = state.running;
    if (stop) stop.disabled = !state.running;
  }

  function log(message, level = "info") {
    const time = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const list = document.querySelector("#saipos-fiscal-log");
    if (list) {
      const item = document.createElement("div");
      item.className = `saipos-fiscal-log-${level}`;
      item.textContent = `${time} — ${message}`;
      list.prepend(item);
      while (list.children.length > 80) list.lastElementChild.remove();
    }
    console[level === "error" ? "error" : "log"](`[SAIPOS Fiscal] ${message}`);
  }

  function noteLabel(row) {
    const cells = [...row.querySelectorAll("td")].map((cell) =>
      (cell.innerText || "").replace(/\s+/g, " ").trim()
    );
    return cells[2] ? `Cupom ${cells[2]}` : "Nota sem número identificado";
  }

  async function openDocuments(orderDialog) {
    const dropdown = visibleAll(
      'button[uib-dropdown-toggle][ng-class*="statusCupom"]',
      orderDialog
    )[0];
    click(dropdown);
    const coupons = await waitFor(
      () => findByText("a", "CUPONS DESSA VENDA", orderDialog, false),
      5000
    );
    click(coupons);
    const documentDialog = await waitFor(
      () => findDialogWith("DOCUMENTOS FISCAIS"),
      10000
    );
    await waitFor(() => getFiscalRows(documentDialog)[0], 10000);
    return documentDialog;
  }

  async function authorizeContingency(documentDialog) {
    const rowKeys = getFiscalRows(documentDialog).map(fiscalRowKey);
    for (const key of rowKeys) {
      let row = liveFiscalRow(documentDialog, key);
      if (!row) throw new Error("Documento fiscal não encontrado após a atualização");
      if (isFiscalRowAuthorized(row)) continue;

      const send = visibleAll(
        'button[uib-tooltip="Enviar Cupom em Contingência"], button[ng-click*="sendContingency"]',
        row
      )[0];
      if (!send) throw new Error("Ação 'Enviar Cupom em Contingência' não encontrada");

      click(send);
      // O Angular recria a linha quando chega o retorno da SEFAZ. Por isso a
      // confirmação precisa buscar a linha atual, em vez de observar o checkbox antigo.
      await waitFor(() => {
        row = liveFiscalRow(documentDialog, key);
        return isFiscalRowAuthorized(row);
      }, 60000, 500);
      state.contingency += 1;
      updatePanel();
    }

    const notAuthorized = rowKeys.some(
      (key) => !isFiscalRowAuthorized(liveFiscalRow(documentDialog, key))
    );
    if (notAuthorized) throw new Error("O documento permaneceu sem autorização");
  }

  async function closeDocuments(documentDialog) {
    const closeButton =
      visibleAll('button[ng-click="vm.close();"]', documentDialog)[0] ||
      findByText("button", "FECHAR", documentDialog);
    if (closeButton) click(closeButton);
    else throw new Error("Botão para fechar 'Documentos fiscais' não encontrado");
    await waitFor(() => !visible(documentDialog), 7000);
  }

  async function closeOrder(orderDialog) {
    const closeButton = visibleAll('button[ng-click="vm.close(true);"]', orderDialog)[0];
    if (closeButton) click(closeButton);
    await waitFor(() => !visible(orderDialog), 7000);
  }

  async function refreshList() {
    const search = document.querySelector("#searchGeneratedCoupons");
    if (visible(search)) {
      click(search);
      // A consulta do SAIPOS pode esvaziar a tabela por alguns segundos antes
      // de inserir os resultados novos.
      await sleep(2200);
    }
  }

  async function cleanupDialogs() {
    const fiscalDialog = findDialogWith("GERAR DOCUMENTO FISCAL");
    if (fiscalDialog) {
      const close = findByText("button", "FECHAR", fiscalDialog);
      if (close) click(close);
      await sleep(300);
    }

    const documentDialog = findDialogWith("DOCUMENTOS FISCAIS");
    if (documentDialog) {
      const close =
        visibleAll('button[ng-click="vm.close();"]', documentDialog)[0] ||
        findByText("button", "FECHAR", documentDialog);
      if (close) click(close);
      await sleep(300);
    }

    const orderDialog = dialogs().reverse().find((dialog) =>
      /FICHA:|PEDIDO N/.test(textOf(dialog))
    );
    if (orderDialog) {
      const close = visibleAll('button[ng-click="vm.close(true);"]', orderDialog)[0];
      if (close) click(close);
      await sleep(500);
    }
  }

  async function processRow(row) {
    const label = noteLabel(row);
    state.current = `Processando ${label}`;
    updatePanel();
    log(`Abrindo ${label}`);

    click(findByText("button", "VER", row));
    const orderDialog = await waitFor(
      () => dialogs().reverse().find((dialog) => /FICHA:|PEDIDO N/.test(textOf(dialog))),
      10000
    );
    await sleep(900);

    let printButton = fiscalPrintButton(orderDialog);
    let documentDialog = null;
    let authorizedInDocuments = false;

    if (!printButton) {
      const generateFiscal = findByText("button", "GERAR DOCUMENTO FISCAL", orderDialog);
      if (!generateFiscal) throw new Error("Botão 'Gerar Documento Fiscal' não encontrado");
      click(generateFiscal);

      const generateDialog = await waitFor(
        () => findDialogWith("CUPOM PRONTO PARA SER GERADO"),
        10000
      );

      // O CPF/CNPJ não é alterado: se o SAIPOS o carregou e marcou, ele permanece.
      setCheckbox(
        checkboxNearText(generateDialog, "Atualizar a data de emissão para a data atual"),
        true
      );
      setCheckbox(
        checkboxNearText(generateDialog, "Adicionar informação complementar do interesse do fisco"),
        false
      );

      // O SAIPOS aplica um bloqueio de três segundos ao botão de geração.
      await sleep(3200);
      click(findByText("button", "GERAR DOCUMENTO", generateDialog));

      await waitFor(() => {
        printButton = fiscalPrintButton(orderDialog);
        documentDialog = findDialogWith("DOCUMENTOS FISCAIS");
        return (!visible(generateDialog) && printButton) || documentDialog;
      }, 40000, 500);
    }

    if (!documentDialog && isAmber(printButton)) {
      log(`${label} está amarelo; enviando em contingência`);
      documentDialog = await openDocuments(orderDialog);
    }

    if (documentDialog) {
      await authorizeContingency(documentDialog);
      authorizedInDocuments = true;
      await closeDocuments(documentDialog);
      printButton = fiscalPrintButton(orderDialog);
    }

    // A caixa AUT. marcada é a confirmação definitiva. O botão da venda pode
    // continuar amarelo por alguns instantes enquanto o Angular atualiza a tela.
    if (isAmber(printButton) && !authorizedInDocuments) {
      throw new Error("O documento continuou amarelo após a tentativa de autorização");
    }

    await closeOrder(orderDialog);
    state.processed += 1;
    state.current = `${label} autorizado`;
    updatePanel();
    log(`${label} autorizado`, "success");
    await refreshList();
  }

  async function run() {
    if (state.running) return;
    if (!location.hash.includes("/app/report/coupons-generated")) {
      alert("Abra o relatório SAIPOS > Cupons Gerados antes de iniciar.");
      return;
    }
    if (
      !confirm(
        "A extensão gerará documentos fiscais para as notas com status 'Não enviado' visíveis no relatório. Deseja continuar?"
      )
    ) {
      return;
    }

    state.processed = 0;
    state.contingency = 0;
    state.skipped.clear();
    state.completed.clear();
    state.running = true;
    state.stopRequested = false;
    state.current = "Iniciando";
    updatePanel();
    log("Processamento iniciado");

    try {
      let emptyScans = 0;
      while (!state.stopRequested) {
        const row = nextRow();
        if (!row) {
          if (emptyScans < 2) {
            emptyScans += 1;
            state.current = `Conferindo notas restantes (${emptyScans}/2)`;
            updatePanel();
            await refreshList();
            continue;
          }
          break;
        }
        emptyScans = 0;
        const key = rowKey(row);
        const label = noteLabel(row);
        try {
          await processRow(row);
          state.completed.add(key);
        } catch (error) {
          if (state.stopRequested) break;
          state.skipped.add(key);
          state.current = `${label} pulado`;
          updatePanel();
          log(`${label} pulado: ${error?.message || error}`, "error");
          await cleanupDialogs();
          await refreshList();
        }
      }

      state.current = state.stopRequested
        ? "Interrompido pelo usuário"
        : state.skipped.size
          ? `Concluído com ${state.skipped.size} nota(s) pulada(s); clique em Iniciar para tentar novamente`
          : "Concluído: não há outras notas aplicáveis";
      log(state.current, state.stopRequested ? "info" : "success");
    } finally {
      state.running = false;
      state.stopRequested = false;
      updatePanel();
    }
  }

  function stop() {
    state.stopRequested = true;
    state.current = "Parando após a ação atual";
    updatePanel();
    log("Parada solicitada");
  }

  function buildPanel() {
    if (document.querySelector("#saipos-fiscal-assistant")) return;
    const panel = document.createElement("aside");
    panel.id = "saipos-fiscal-assistant";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="saipos-fiscal-title">Notas fiscais</div>
      <div id="saipos-fiscal-status">Aguardando</div>
      <div id="saipos-fiscal-counters">Autorizadas: 0 · Contingência: 0 · Puladas: 0</div>
      <div class="saipos-fiscal-actions">
        <button id="saipos-fiscal-start" type="button">Iniciar</button>
        <button id="saipos-fiscal-stop" type="button" disabled>Parar</button>
      </div>
      <div id="saipos-fiscal-log" aria-live="polite"></div>
      <div class="saipos-fiscal-author">Desenvolvido por math7x</div>
    `;
    document.body.appendChild(panel);
    panel.querySelector("#saipos-fiscal-start").addEventListener("click", run);
    panel.querySelector("#saipos-fiscal-stop").addEventListener("click", stop);
  }

  function togglePanel() {
    const panel = document.querySelector("#saipos-fiscal-assistant");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) updatePanel();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SAIPOS_FISCAL_TOGGLE_PANEL") togglePanel();
  });

  buildPanel();
})();
