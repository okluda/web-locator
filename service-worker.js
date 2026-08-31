const TARGET_STORAGE_KEY = "locatorTarget";
const ALLOWED_ORIGIN = "https://insprod.tii.org.tw";

function configureSidePanel() {
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
}

chrome.runtime.onInstalled.addListener(configureSidePanel);
chrome.runtime.onStartup.addListener(configureSidePanel);

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === "GET_TARGET_TAB") {
    getTargetTab()
      .then(function (target) {
        sendResponse({ success: true, target: target });
      })
      .catch(function (error) {
        sendResponse({ success: false, error: getErrorMessage(error) });
      });
    return true;
  }

  if (message.type === "SET_TARGET_TAB") {
    setTargetTab(message.payload)
      .then(function (target) {
        sendResponse({ success: true, target: target });
      })
      .catch(function (error) {
        sendResponse({ success: false, error: getErrorMessage(error) });
      });
    return true;
  }

  if (message.type === "CLEAR_TARGET_TAB") {
    clearTargetTab()
      .then(function () {
        sendResponse({ success: true });
      })
      .catch(function (error) {
        sendResponse({ success: false, error: getErrorMessage(error) });
      });
    return true;
  }
});

async function getTargetTab() {
  const result = await chrome.storage.session.get(TARGET_STORAGE_KEY);
  const target = result[TARGET_STORAGE_KEY];
  return isValidTarget(target) ? target : null;
}

async function setTargetTab(payload) {
  if (!payload || !Number.isInteger(payload.tabId)) {
    throw new Error("目標分頁識別資料無效。");
  }

  const tab = await chrome.tabs.get(payload.tabId);
  if (!tab || typeof tab.id !== "number") {
    throw new Error("找不到指定的目標分頁。");
  }

  const parsedUrl = parseAllowedUrl(tab.url);
  if (!parsedUrl) {
    throw new Error("目前分頁不在已授權的目標網站範圍內。");
  }

  const target = {
    tabId: tab.id,
    title: tab.title || "",
    origin: parsedUrl.origin,
    pathname: parsedUrl.pathname,
    pageKey: parsedUrl.origin + parsedUrl.pathname,
    selectedAt: new Date().toISOString(),
    status: "active",
    statusChangedAt: new Date().toISOString(),
    currentOrigin: parsedUrl.origin,
    currentPathname: parsedUrl.pathname
  };

  await saveTargetTab(target);
  await notifyTargetChanged(target, "selected");
  return target;
}

async function clearTargetTab() {
  await chrome.storage.session.remove(TARGET_STORAGE_KEY);
  await notifyTargetChanged(null, "cleared");
}

async function saveTargetTab(target) {
  const storageData = {};
  storageData[TARGET_STORAGE_KEY] = target;
  await chrome.storage.session.set(storageData);
}

async function updateTargetStatus(target, status, currentUrl, title) {
  const parsedCurrentUrl = parseUrl(currentUrl);
  const updatedTarget = {
    ...target,
    status: status,
    statusChangedAt: new Date().toISOString(),
    currentOrigin: parsedCurrentUrl ? parsedCurrentUrl.origin : "",
    currentPathname: parsedCurrentUrl ? parsedCurrentUrl.pathname : "",
    title: typeof title === "string" && title ? title : target.title
  };

  await saveTargetTab(updatedTarget);
  await notifyTargetChanged(updatedTarget, status);
  return updatedTarget;
}

async function notifyTargetChanged(target, reason) {
  try {
    await chrome.runtime.sendMessage({
      type: "TARGET_TAB_STATUS_CHANGED",
      payload: {
        target: target,
        reason: reason
      }
    });
  } catch (error) {
    // Side Panel may be closed. The latest status remains in storage.session.
  }
}

async function stopLocatingInTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "STOP_LOCATING"
    });
  } catch (error) {
    // The page may be loading, closed, unauthorized, or have no Content Script.
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "STOP_AIMING"
    });
  } catch (error) {
    // The page may be loading, closed, unauthorized, or have no Content Script.
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "STOP_FILLING",
      payload: { executionId: "lifecycle-stop" }
    });
  } catch (error) {
    // The page may be loading, closed, unauthorized, or have no Content Script.
  }
}

chrome.tabs.onRemoved.addListener(function (tabId) {
  handleTargetTabRemoved(tabId).catch(function (error) {
    console.error("處理目標分頁關閉時發生錯誤：", error);
  });
});

async function handleTargetTabRemoved(tabId) {
  const target = await getTargetTab();
  if (!target || target.tabId !== tabId) {
    return;
  }

  await chrome.storage.session.remove(TARGET_STORAGE_KEY);
  await notifyTargetChanged(null, "closed");
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  handleTargetTabUpdated(tabId, changeInfo, tab).catch(function (error) {
    console.error("處理目標分頁更新時發生錯誤：", error);
  });
});

async function handleTargetTabUpdated(tabId, changeInfo, tab) {
  const target = await getTargetTab();
  if (!target || target.tabId !== tabId) {
    return;
  }

  const currentUrl = changeInfo.url || tab.url || "";
  const parsedUrl = parseUrl(currentUrl);

  if (!parsedUrl || parsedUrl.origin !== ALLOWED_ORIGIN) {
    await stopLocatingInTab(tabId);
    await updateTargetStatus(
      target,
      "unauthorized",
      currentUrl,
      tab.title
    );
    return;
  }

  const currentPageKey = parsedUrl.origin + parsedUrl.pathname;
  if (currentPageKey !== target.pageKey) {
    await stopLocatingInTab(tabId);
    await updateTargetStatus(
      target,
      "page-changed",
      currentUrl,
      tab.title
    );
    return;
  }

  if (changeInfo.status === "loading") {
    await stopLocatingInTab(tabId);
    await updateTargetStatus(
      target,
      "reloading",
      currentUrl,
      tab.title
    );
    return;
  }

  if (changeInfo.status === "complete") {
    if (!parsedUrl || parsedUrl.origin !== ALLOWED_ORIGIN) {
      await updateTargetStatus(
        target,
        "unauthorized",
        currentUrl,
        tab.title
      );
      return;
    }

    const currentPageKey = parsedUrl.origin + parsedUrl.pathname;
    if (currentPageKey !== target.pageKey) {
      await updateTargetStatus(
        target,
        "page-changed",
        currentUrl,
        tab.title
      );
      return;
    }

    await updateTargetStatus(
      target,
      "active",
      currentUrl,
      tab.title
    );
  }
}

function parseAllowedUrl(urlValue) {
  const parsedUrl = parseUrl(urlValue);
  return parsedUrl && parsedUrl.origin === ALLOWED_ORIGIN
    ? parsedUrl
    : null;
}

function parseUrl(urlValue) {
  if (typeof urlValue !== "string" || urlValue.trim() === "") {
    return null;
  }

  try {
    return new URL(urlValue);
  } catch (error) {
    return null;
  }
}

function isValidTarget(target) {
  return Boolean(
    target &&
    typeof target === "object" &&
    Number.isInteger(target.tabId) &&
    typeof target.origin === "string" &&
    typeof target.pathname === "string" &&
    typeof target.pageKey === "string"
  );
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== "LOCATOR_SIDE_PANEL") {
    return;
  }

  let locatingTabId = null;
  let aimingTabId = null;

  port.onMessage.addListener(function (message) {
    if (message.type === "REGISTER_LOCATING_TAB") {
      locatingTabId = Number.isInteger(message.tabId)
        ? message.tabId
        : null;
      return;
    }

    if (message.type === "CLEAR_LOCATING_TAB") {
      locatingTabId = null;
      return;
    }

    if (message.type === "REGISTER_AIMING_TAB") {
      aimingTabId = Number.isInteger(message.tabId)
        ? message.tabId
        : null;
      return;
    }

    if (message.type === "CLEAR_AIMING_TAB") {
      aimingTabId = null;
    }
  });

  port.onDisconnect.addListener(function () {
    if (locatingTabId !== null) {
      stopLocatingInTab(locatingTabId);
    }

    if (aimingTabId !== null && aimingTabId !== locatingTabId) {
      stopLocatingInTab(aimingTabId);
    }
  });
});
