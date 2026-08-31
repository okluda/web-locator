const $ = function (id) {
  return document.getElementById(id);
};

const targetCurrentTabButton = $("targetCurrentTabButton");
const clearTargetButton = $("clearTargetButton");
const targetBadge = $("targetBadge");
const targetEmptyState = $("targetEmptyState");
const targetDetails = $("targetDetails");
const targetTitle = $("targetTitle");
const targetOrigin = $("targetOrigin");
const targetPath = $("targetPath");
const targetStatusText = $("targetStatusText");

const locateButton=$("locateButton"),statusText=$("statusText"),statusBox=$("statusBox"),modeBadge=$("modeBadge"),locatorList=$("locatorList"),emptyState=$("emptyState"),itemCount=$("itemCount"),clearButton=$("clearButton"),testAllButton=$("testAllButton");

const aimSelectButton = $("aimSelectButton");
const testAimButton = $("testAimButton");
const clearAimButton = $("clearAimButton");
const aimBadge = $("aimBadge");
const aimEmptyState = $("aimEmptyState");
const aimDetails = $("aimDetails");
const aimName = $("aimName");
const aimType = $("aimType");
const aimSelector = $("aimSelector");
const aimStatusText = $("aimStatusText");
const aimTestResult = $("aimTestResult");

const ammunitionList = $("ammunitionList");
const ammunitionCount = $("ammunitionCount");
const addAmmunitionButton = $("addAmmunitionButton");
const clearAmmunitionButton = $("clearAmmunitionButton");
const ammunitionStatusText = $("ammunitionStatusText");

const STORAGE_KEY="locatorProfiles",locatorItems=[];
const AIM_STORAGE_KEY = "aimProfiles";

let isLocating=false,connectedTabId=null,currentPageKey=null,currentPageTitle="",isSaving=false,testResults=new Map();

let selectedTarget = null;
let selectedAim = null;
let aimTestState = null;
let isTestingAim = false;
let isAiming = false;
let aimingTabId = null;
let targetOperationInProgress = false;

const DEFAULT_AMMUNITION_ROWS = 5;
const MAX_AMMUNITION_ROWS = 50;
const ammunitionRows = [];
let nextAmmunitionRowId = 1;

let panelPort = null;

let panelPortConnected = false;

function connectPanelPort() {

    if (panelPort && panelPortConnected) {

        return panelPort;

  }

    const newPort = chrome.runtime.connect( {

        name: "LOCATOR_SIDE_PANEL"

  });

    panelPort = newPort;

    panelPortConnected = true;

    newPort.onDisconnect.addListener(function () {

        if (panelPort === newPort) {

            panelPort = null;
            panelPortConnected = false;

    }

  });

    return newPort;

}

function postPanelMessage(message) {

    let port = connectPanelPort();

    try {

        port.postMessage(message);

        return true;

  }
   catch (error) {

        console.warn("Side Panel 連線已中斷，準備重新連線。", error);

        panelPort = null;

        panelPortConnected = false;

  }

    try {

        port = connectPanelPort();

        port.postMessage(message);

        return true;

  }
   catch (retryError) {

        console.error("Side Panel 重新連線失敗。", retryError);

        panelPort = null;

        panelPortConnected = false;

        return false;

  }

}

function registerTab(tabId) {

    return postPanelMessage( {

        type: "REGISTER_LOCATING_TAB",
        tabId: tabId

  });

}

function clearTab() {

    return postPanelMessage( {

        type: "CLEAR_LOCATING_TAB"

  });

}

function registerAimingTab(tabId) {
  return postPanelMessage({
    type: "REGISTER_AIMING_TAB",
    tabId: tabId
  });
}

function clearAimingTab() {
  return postPanelMessage({
    type: "CLEAR_AIMING_TAB"
  });
}

targetCurrentTabButton.addEventListener("click", async function () {
  if (targetOperationInProgress) {
    return;
  }

  setTargetOperationState(true);

  try {
    const currentTab = await activeTab();

    if (!currentTab || typeof currentTab.id !== "number") {
      throw new Error("找不到目前作用中的網頁分頁。");
    }

    const response = await chrome.runtime.sendMessage({
      type: "SET_TARGET_TAB",
      payload: {
        tabId: currentTab.id
      }
    });

    if (!response || response.success !== true) {
      throw new Error(
        response && response.error
          ? response.error
          : "無法將目前分頁設為目標。"
      );
    }

    selectedTarget = response.target;
    renderTarget();
    await switchToTargetContext();
    targetStatusText.textContent = "已將目前分頁設為唯一目標。";
  } catch (error) {
    showTargetError(error);
  } finally {
    setTargetOperationState(false);
  }
});

clearTargetButton.addEventListener("click", async function () {
  if (targetOperationInProgress || !selectedTarget) {
    return;
  }

  setTargetOperationState(true);

  try {
    if (isAiming) {
      await stopAiming();
    }

    const response = await chrome.runtime.sendMessage({
      type: "CLEAR_TARGET_TAB"
    });

    if (!response || response.success !== true) {
      throw new Error("無法取消目前目標。")
    }

    if (isLocating) {
      await stopLocating();
    }

    selectedTarget = null;
    clearTargetContextView();
    renderTarget();
    targetStatusText.textContent = "已取消瞄準，不會刪除定位清單。";
  } catch (error) {
    showTargetError(error);
  } finally {
    setTargetOperationState(false);
  }
});

aimSelectButton.addEventListener("click", async function () {
  aimSelectButton.disabled = true;

  try {
    if (isAiming) {
      await stopAiming();
    } else {
      await startAiming();
    }
  } catch (error) {
    showAimError(error);
  } finally {
    updateAimControls();
  }
});

testAimButton.addEventListener("click", async function () {
  if (!selectedAim || isAiming || isTestingAim) {
    return;
  }

  isTestingAim = true;
  updateAimControls();
  aimStatusText.textContent = "正在測試準星，測試期間不會執行按鈕...";

  try {
    const targetTab = await getOperationalTargetTab();

    if (pageKey(selectedAim.pageUrl) !== selectedTarget.pageKey) {
      throw new Error("準星與目前目標頁面不一致，請重新選取準星。")
    }

    await ensureContent(targetTab.id);

    const response = await chrome.tabs.sendMessage(
      targetTab.id,
      {
        type: "TEST_AIM",
        payload: {
          id: selectedAim.id,
          selector: selectedAim.selector
        }
      }
    );

    if (!response || response.success !== true || !response.result) {
      throw new Error("目標分頁未回傳正確的準星測試結果。")
    }

    aimTestState = response.result;
    renderAimTestResult();
    aimStatusText.textContent = getAimTestSummary(response.result);
  } catch (error) {
    aimTestState = {
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
    renderAimTestResult();
    showAimErrorWithMessage("準星測試失敗。", error);
  } finally {
    isTestingAim = false;
    updateAimControls();
  }
});

clearAimButton.addEventListener("click", async function () {
  if (isAiming || !selectedAim || !currentPageKey) {
    return;
  }

  const previousAim = selectedAim;
  clearAimButton.disabled = true;

  try {
    selectedAim = null;
    aimTestState = null;
    renderAim();
    await saveCurrentAim();
    aimStatusText.textContent = "已清除目前頁面的準星。";
  } catch (error) {
    selectedAim = previousAim;
    renderAim();
    showAimErrorWithMessage(
      "準星清除結果無法儲存，已恢復原本準星。",
      error
    );
  } finally {
    updateAimControls();
  }
});

addAmmunitionButton.addEventListener("click", function () {
  if (ammunitionRows.length >= MAX_AMMUNITION_ROWS) {
    ammunitionStatusText.textContent =
      `資料列上限為 ${MAX_AMMUNITION_ROWS} 列，無法繼續新增。`;
    return;
  }

  ammunitionRows.push(createAmmunitionRow());
  renderAmmunitionRows();
  ammunitionStatusText.textContent =
    `已新增第 ${ammunitionRows.length} 列。`;
});

clearAmmunitionButton.addEventListener("click", function () {
  const hasContent = ammunitionRows.some(function (row) {
    return row.value !== "";
  });

  if (!hasContent) {
    ammunitionStatusText.textContent = "目前沒有可清空的內容。";
    return;
  }

  const shouldClear = window.confirm(
    "確定要清空全部填彈內容嗎？資料列會保留。"
  );

  if (!shouldClear) {
    return;
  }

  ammunitionRows.forEach(function (row) {
    row.value = "";
  });

  renderAmmunitionRows();
  ammunitionStatusText.textContent = "已清空全部填彈內容，資料列仍保留。";
});

locateButton.addEventListener("click",async()=> {
  if(isSaving)return;locateButton.disabled=true;try {
    isLocating?await stopLocating():await startLocating()
  }
  catch(e) {
    showError(e)
  }
  finally {
    updateTargetBoundControls();
  }

});

clearButton.addEventListener("click",async()=> {
  if(isSaving||!locatorItems.length)return;if(!confirm(`確定要清除全部 ${locatorItems.length} 筆定位嗎？`))return;await mutate(()=>locatorItems.length=0,"全部定位已清除。","清除失敗，已恢復原資料。");
});

testAllButton.addEventListener("click",()=>testLocators(locatorItems));

chrome.runtime.onMessage.addListener((m,s,reply)=> {
  if(m.type==="ELEMENT_SELECTED") {
    selectElement(m.payload,s,reply);return true
  }
  if(m.type==="LOCATING_STOPPED"&&s.tab?.id===connectedTabId) {
    connectedTabId=null;isLocating=false;clearTab();idle();statusText.textContent="已按 Esc 停止定位。"
  }

  if (m.type === "TARGET_TAB_STATUS_CHANGED") {
    handleTargetStatusChanged(m.payload);
  }

  if (m.type === "AIM_SELECTED") {
    handleAimSelected(m.payload, s, reply);
    return true;
  }

  if (m.type === "AIMING_STOPPED") {
    if (s.tab?.id === aimingTabId) {
      isAiming = false;
      aimingTabId = null;
      clearAimingTab();
      renderAim();
      aimStatusText.textContent = "已按 Esc 停止準星選取。";
    }
  }

});

chrome.tabs.onUpdated.addListener((id,info)=> {
  if(id===connectedTabId&&info.status==="loading") {
    connectedTabId=null;isLocating=false;clearTab();idle();statusText.textContent="網頁已重新整理，請按「開始定位」重新連接。"
  }

});

chrome.tabs.onActivated.addListener(function () {
  updateActiveTabNotice().catch(function (error) {
    console.warn("作用中分頁提示更新失敗：", error);
  });
});

async function activeTab() {
  return(await chrome.tabs.query( {
    active:true,currentWindow:true
  }))[0]
}

function pageKey(value) {
  try {
    const u=new URL(value);
    return u.origin+u.pathname
  }
  catch {
    return null
  }

}

function valid(x) {
  return !!(x&&typeof x.id==="string"&&typeof x.name==="string"&&typeof x.selector==="string"&&x.selector.trim())
}

function plain(x) {
  return !!(x&&typeof x==="object"&&!Array.isArray(x))
}

async function init() {
  render();

  if (isTargetOperational()) {
    await switchToTargetContext();
  } else {
    clearTargetContextView();
  }

  await updateActiveTabNotice();
}

function isTargetOperational() {
  return Boolean(
    selectedTarget &&
    Number.isInteger(selectedTarget.tabId) &&
    (selectedTarget.status || "active") === "active"
  );
}

async function getOperationalTargetTab() {
  if (!isTargetOperational()) {
    throw new Error("請先瞄準有效的目標分頁。")
  }

  let targetTab;

  try {
    targetTab = await chrome.tabs.get(selectedTarget.tabId);
  } catch (error) {
    throw new Error("已瞄準的目標分頁不存在，請重新瞄準。")
  }

  const targetPageKey = pageKey(targetTab.url);

  if (targetPageKey !== selectedTarget.pageKey) {
    throw new Error("目標頁面已變更，請重新瞄準確認。")
  }

  return targetTab;
}

async function switchToTargetContext() {
  const targetTab = await getOperationalTargetTab();

  currentPageKey = selectedTarget.pageKey;
  currentPageTitle = targetTab.title || selectedTarget.title || "";

  await load();
  await loadCurrentAim();
  await syncStatus(targetTab);
  updateTargetBoundControls();
}

function clearTargetContextView() {
  currentPageKey = null;
  currentPageTitle = "";
  locatorItems.length = 0;
  testResults = new Map();
  selectedAim = null;
  aimTestState = null;
  isTestingAim = false;
  isAiming = false;
  aimingTabId = null;
  connectedTabId = null;
  isLocating = false;
  idle();
  render();
  renderAim();
  updateTargetBoundControls();
}

async function updateActiveTabNotice() {
  if (!selectedTarget) {
    return;
  }

  const currentTab = await activeTab();

  if (!currentTab || typeof currentTab.id !== "number") {
    return;
  }

  if (currentTab.id === selectedTarget.tabId) {
    targetStatusText.textContent = "目前正在查看已瞄準的目標分頁。";
  } else {
    targetStatusText.textContent =
      "目前作用中的分頁不是目標；定位與測試仍只會送往已瞄準分頁。";
  }
}

async function syncStatus(t) {
  try {
    const r=await chrome.tabs.sendMessage(t.id, {
      type:"GET_LOCATING_STATUS"
    });
    if(r?.success&&r.isLocating) {
      connectedTabId=t.id;
      isLocating=true;
      registerTab(t.id);
      active();
      return
    }

  }
  catch(e) {
    console.info("目前分頁尚未連接",e)
  }
  connectedTabId=null;
  isLocating=false;
  clearTab();
  idle()
}

async function load() {
  const r=await chrome.storage.local.get(STORAGE_KEY),ps=plain(r[STORAGE_KEY])?r[STORAGE_KEY]: {

  },p=ps[currentPageKey];
  locatorItems.length=0;
  testResults=new Map();
  if(p?.locatorItems)for(const x of p.locatorItems)if(valid(x))locatorItems.push(x);
  if(typeof p?.pageTitle==="string")currentPageTitle=p.pageTitle;
  render();
  if(locatorItems.length)statusText.textContent=`已恢復 ${locatorItems.length} 筆定位。`
}

async function save() {
  if(!currentPageKey)throw Error("尚未取得頁面識別資料。");
  const r=await chrome.storage.local.get(STORAGE_KEY),ps=plain(r[STORAGE_KEY])?r[STORAGE_KEY]: {

  };
  if(locatorItems.length)ps[currentPageKey]= {
    pageKey:currentPageKey,pageTitle:currentPageTitle,locatorItems,updatedAt:new Date().toISOString()
  };
  else delete ps[currentPageKey];
  const out= {

  };
  out[STORAGE_KEY]=ps;
  await chrome.storage.local.set(out)
}

const snapshot=()=>locatorItems.map(x=>( {
  ...x
}));

function restore(s) {
  locatorItems.length=0;
  locatorItems.push(...s.map(x=>( {
    ...x
  })))
}

function saving(v) {
  isSaving=v;
  render();
  if(v)statusText.textContent="正在儲存，請稍候..."
}

async function mutate(fn,ok,fail) {
  if(isSaving)return;
  const old=snapshot();
  saving(true);
  try {
    fn();
    render();
    await save();
    statusText.textContent=ok
  }
  catch(e) {
    restore(old);
    render();
    storageError(fail,e)
  }
  finally {
    saving(false)
  }

}

async function selectElement(x,s,reply) {
  if (
    !isTargetOperational() ||
    s.tab?.id !== selectedTarget.tabId ||
    !isLocating ||
    s.tab?.id !== connectedTabId
  ) {
    reply( {
      success:false,reason:"tab-mismatch"
    });
    return
  }
  if(!valid(x)||pageKey(x.pageUrl)!==currentPageKey) {
    reply( {
      success:false,reason:"page-mismatch"
    });
    return
  }
  if(locatorItems.some(i=>i.selector===x.selector)) {
    statusText.textContent=`「${x.name}」已在清單中。`;
    reply( {
      success:true,duplicate:true
    });
    return
  }
  if(isSaving) {
    reply( {
      success:false,reason:"saving"
    });
    return
  }
  const old=snapshot();
  saving(true);
  locatorItems.push(x);
  try {
    await save();
    render();
    reply( {
      success:true
    });
    statusText.textContent=`已加入「${x.name}」。`
  }
  catch(e) {
    restore(old);
    render();
    reply( {
      success:false,reason:"storage-error"
    });
    storageError("新增失敗，已恢復原資料。",e)
  }
  finally {
    saving(false)
  }

}

async function ensureContent(id) {
  try {
    const r=await chrome.tabs.sendMessage(id, {
      type:"GET_LOCATING_STATUS"
    });
    if(r?.success)return
  }
  catch {

  }
  await chrome.scripting.insertCSS( {
    target: {
      tabId:id
    },files:["content-style.css"]
  });
  await chrome.scripting.executeScript( {
    target: {
      tabId:id
    },files:["content-script.js"]
  })
}

function restricted(url="") {
  return["chrome://","edge://","about:","devtools://","chrome-extension://","edge-extension://","view-source:"].some(x=>url.startsWith(x))
}

async function startLocating() {
  loading("正在連接已瞄準的目標網頁...");

  const targetTab = await getOperationalTargetTab();

  if (restricted(targetTab.url)) {
    throw new Error("目標是瀏覽器內部或受保護頁面，無法操作。")
  }

  if (currentPageKey !== selectedTarget.pageKey) {
    await switchToTargetContext();
  }

  await ensureContent(targetTab.id);

  const response = await chrome.tabs.sendMessage(
    targetTab.id,
    {
      type: "START_LOCATING"
    }
  );

  if (!response || response.success !== true) {
    throw new Error("目標分頁的定位啟動失敗。")
  }

  connectedTabId = targetTab.id;
  isLocating = true;
  registerTab(targetTab.id);
  active();
}

async function stopLocating() {
  if(connectedTabId!==null)try {
    await chrome.tabs.sendMessage(connectedTabId, {
      type:"STOP_LOCATING"
    })
  }
  catch(e) {
    console.warn(e)
  }
  connectedTabId=null;
  isLocating=false;
  clearTab();
  idle()
}

async function startAiming() {
  const targetTab = await getOperationalTargetTab();

  if (isLocating) {
    await stopLocating();
  }

  await ensureContent(targetTab.id);

  const response = await chrome.tabs.sendMessage(
    targetTab.id,
    {
      type: "START_AIMING"
    }
  );

  if (!response || response.success !== true) {
    throw new Error("目標分頁未回傳正確的準星選取啟動結果。")
  }

  isAiming = true;
  aimingTabId = targetTab.id;
  registerAimingTab(targetTab.id);
  renderAim();
  aimStatusText.textContent =
    "準星選取已啟動。請切到目標分頁並點選支援的按鈕，按 Esc 可停止。";
}

async function stopAiming() {
  if (aimingTabId !== null) {
    try {
      await chrome.tabs.sendMessage(
        aimingTabId,
        {
          type: "STOP_AIMING"
        }
      );
    } catch (error) {
      console.warn("停止準星選取時，目標分頁可能已重新整理。", error);
    }
  }

  isAiming = false;
  aimingTabId = null;
  clearAimingTab();
  renderAim();
  aimStatusText.textContent = "準星選取已停止。";
}

async function handleAimSelected(aimData, sender, sendResponse) {
  if (
    !isTargetOperational() ||
    !isAiming ||
    sender.tab?.id !== selectedTarget.tabId ||
    sender.tab?.id !== aimingTabId
  ) {
    sendResponse({
      success: false,
      reason: "tab-mismatch"
    });
    return;
  }

  if (!isValidAimData(aimData)) {
    sendResponse({
      success: false,
      reason: "invalid-data"
    });
    return;
  }

  if (pageKey(aimData.pageUrl) !== selectedTarget.pageKey) {
    sendResponse({
      success: false,
      reason: "page-mismatch"
    });
    return;
  }

  const previousAim = selectedAim;
  const previousTestState = aimTestState;

  selectedAim = aimData;
  aimTestState = null;
  isAiming = false;
  aimingTabId = null;
  clearAimingTab();
  renderAim();
  aimStatusText.textContent = "正在儲存準星，請稍候...";

  try {
    await saveCurrentAim();
    aimStatusText.textContent =
      `已選取並保存準星「${aimData.name}」。本階段不會執行按鈕。`;

    sendResponse({
      success: true
    });
  } catch (error) {
    selectedAim = previousAim;
    aimTestState = previousTestState;
    renderAim();
    showAimErrorWithMessage(
      "準星無法儲存，已恢復原本準星。",
      error
    );

    sendResponse({
      success: false,
      reason: "storage-error"
    });
  }
}

function isValidAimData(aimData) {
  return Boolean(
    aimData &&
    typeof aimData === "object" &&
    typeof aimData.id === "string" &&
    typeof aimData.name === "string" &&
    typeof aimData.selector === "string" &&
    aimData.selector.trim() !== "" &&
    typeof aimData.pageUrl === "string"
  );
}

async function loadCurrentAim() {
  if (!currentPageKey) {
    selectedAim = null;
    renderAim();
    return;
  }

  const result = await chrome.storage.local.get(AIM_STORAGE_KEY);
  const profiles = plain(result[AIM_STORAGE_KEY])
    ? result[AIM_STORAGE_KEY]
    : {};
  const savedProfile = profiles[currentPageKey];

  selectedAim =
    savedProfile && isValidAimData(savedProfile.aim)
      ? savedProfile.aim
      : null;
  aimTestState = null;

  renderAim();

  if (selectedAim) {
    aimStatusText.textContent =
      `已恢復目前頁面的準星「${selectedAim.name}」。`;
  }
}

async function saveCurrentAim() {
  if (!currentPageKey) {
    throw new Error("尚未取得準星所屬頁面識別資料。")
  }

  const result = await chrome.storage.local.get(AIM_STORAGE_KEY);
  const profiles = plain(result[AIM_STORAGE_KEY])
    ? result[AIM_STORAGE_KEY]
    : {};

  if (selectedAim) {
    profiles[currentPageKey] = {
      pageKey: currentPageKey,
      pageTitle: currentPageTitle,
      aim: selectedAim,
      updatedAt: new Date().toISOString()
    };
  } else {
    delete profiles[currentPageKey];
  }

  const storageData = {};
  storageData[AIM_STORAGE_KEY] = profiles;

  await chrome.storage.local.set(storageData);
}

function renderAim() {
  const hasAim = Boolean(selectedAim);

  aimEmptyState.hidden = hasAim;
  aimDetails.hidden = !hasAim;
  aimBadge.textContent = isAiming
    ? "選取中"
    : hasAim
      ? "已選取"
      : "未選取";
  aimBadge.className = isAiming
    ? "status-badge status-pending"
    : hasAim
      ? "status-badge status-active"
      : "status-badge status-idle";

  aimSelectButton.textContent = isAiming
    ? "停止選取準星"
    : "開始選取準星";

  if (hasAim) {
    aimName.textContent = selectedAim.name;
    aimType.textContent = selectedAim.elementType;
    aimSelector.textContent = selectedAim.selector;
  } else {
    aimName.textContent = "";
    aimType.textContent = "";
    aimSelector.textContent = "";
  }

  renderAimTestResult();
  updateAimControls();
}

function getAimTestSummary(result) {
  const messages = {
    valid: "準星有效：Selector 唯一找到 1 個支援按鈕。",
    "not-found": "準星失效：目前頁面找不到該按鈕。",
    multiple: `準星不可靠：Selector 找到 ${result.matchCount} 個元素。`,
    unsupported: "準星不支援：Selector 找到的元素不是可支援按鈕。",
    "invalid-selector": "準星失效：Selector 格式錯誤。",
    error: result.message || "準星測試發生錯誤。"
  };

  return messages[result.status] || "準星測試結果未知。";
}

function renderAimTestResult() {
  if (!selectedAim || !aimTestState) {
    aimTestResult.hidden = true;
    aimTestResult.className = "aim-test-result";
    aimTestResult.textContent = "";
    return;
  }

  aimTestResult.hidden = false;
  aimTestResult.className =
    `aim-test-result aim-test-${aimTestState.status}`;
  aimTestResult.textContent = getAimTestSummary(aimTestState);
}

function updateAimControls() {
  const targetReady = isTargetOperational();

  aimSelectButton.disabled = !targetReady || isTestingAim;
  testAimButton.disabled =
    !targetReady || !selectedAim || isAiming || isTestingAim;
  clearAimButton.disabled = isAiming || isTestingAim || !selectedAim;

  if (!targetReady && !isAiming) {
    aimStatusText.textContent = "請先瞄準有效的目標分頁。";
  }
}

function showAimErrorWithMessage(message, error) {
  aimStatusText.textContent = message;
  console.error("準星區儲存錯誤：", error);
}

function showAimError(error) {
  isAiming = false;
  aimingTabId = null;
  renderAim();
  aimStatusText.textContent = error instanceof Error
    ? error.message
    : String(error);
  console.error("準星區錯誤：", error);
}

async function testLocators(items) {
  if (isSaving || !items.length) {
    return;
  }

  try {
    const targetTab = await getOperationalTargetTab();

    if (currentPageKey !== selectedTarget.pageKey) {
      await switchToTargetContext();
    }

    await ensureContent(targetTab.id);

    const response = await chrome.tabs.sendMessage(
      targetTab.id,
      {
        type: "TEST_LOCATORS",
        payload: items.map(function (item) {
          return {
            id: item.id,
            selector: item.selector
          };
        })
      }
    );

    if (!response || response.success !== true || !Array.isArray(response.results)) {
      throw new Error("未收到目標分頁的正確測試結果。")
    }

    response.results.forEach(function (result) {
      testResults.set(result.id, result);
    });

    render();

    const countStatus = function (status) {
      return response.results.filter(function (result) {
        return result.status === status;
      }).length;
    };

    statusText.textContent =
      `測試完成：有效 ${countStatus("valid")}、` +
      `失效 ${countStatus("not-found") + countStatus("invalid-selector")}、` +
      `多重 ${countStatus("multiple")}、` +
      `不支援 ${countStatus("unsupported")}。`;
  } catch (error) {
    showError(error);
  }
}

function button(text,cls,fn,disabled=false) {
  const b=document.createElement("button");
  b.type="button";
  b.className=cls;
  b.textContent=text;
  b.disabled=disabled;
  b.addEventListener("click",fn);
  return b
}

function resultText(r) {
  return( {
    valid:"有效：找到 1 個欄位","not-found":"失效：找不到元素",multiple:`多重匹配：${r.matchCount} 個`,unsupported:"不支援：不是支援欄位","invalid-selector":"失效：Selector 格式錯誤"
  })[r.status]||"未知"
}

function render() {
  locatorList.replaceChildren();
  locatorItems.forEach((x,i)=> {
    const li=document.createElement("li");li.className="locator-item";const n=document.createElement("span");n.className="locator-sequence";n.textContent=i+1;const info=document.createElement("div");info.className="locator-information";const name=document.createElement("strong");name.className="locator-name";name.textContent=x.name;const type=document.createElement("span");type.className="locator-type";type.textContent=x.elementType||x.tagName||"輸入欄位";const code=document.createElement("code");code.className="locator-selector";code.textContent=x.selector;info.append(name,type,code);const r=testResults.get(x.id);if(r) {
      const badge=document.createElement("span");badge.className=`locator-test-status status-${r.status}`;badge.textContent=resultText(r);info.append(badge)
    }
    const acts=document.createElement("div");acts.className="locator-actions";acts.append(button("改名","locator-action-button",()=>rename(x.id),isSaving),button("上移","locator-action-button",()=>move(x.id,-1),isSaving||i===0),button("下移","locator-action-button",()=>move(x.id,1),isSaving||i===locatorItems.length-1),button("測試","locator-test-button",()=>testLocators([x]),isSaving),button("刪除","locator-delete-button",()=>remove(x.id),isSaving));li.append(n,info,acts);locatorList.append(li)
  });
  const has=!!locatorItems.length;
  emptyState.hidden=has;
  clearButton.disabled=isSaving||!has;
  testAllButton.disabled=isSaving||!has;
  itemCount.textContent=`${locatorItems.length} 筆`;
  updateTargetBoundControls();
}

async function rename(id) {
  const i=locatorItems.findIndex(x=>x.id===id);
  if(i<0||isSaving)return;
  const old=locatorItems[i].name,v=prompt("請輸入新的定位名稱：",old);
  if(v===null)return;
  const next=v.replace(/\s+/g," ").trim().slice(0,50);
  if(!next) {
    statusText.textContent="名稱不能空白。";
    return
  }
  if(next===old) {
    statusText.textContent="名稱沒有變更。";
    return
  }
  await mutate(()=>locatorItems[i].name=next,`已重新命名為「${next}」。`,"重新命名失敗，已恢復原名稱。")
}

async function move(id,d) {
  const i=locatorItems.findIndex(x=>x.id===id),j=i+d;
  if(i<0||j<0||j>=locatorItems.length)return;
  const name=locatorItems[i].name;
  await mutate(()=> {
    const x=locatorItems.splice(i,1)[0];locatorItems.splice(j,0,x)
  },`已${d<0?"上移":"下移"}「${name}」。`,"排序失敗，已恢復原順序。")
}

async function remove(id) {
  const i=locatorItems.findIndex(x=>x.id===id);
  if(i<0)return;
  const name=locatorItems[i].name;
  await mutate(()=> {
    locatorItems.splice(i,1);testResults.delete(id)
  },`已刪除「${name}」。`,"刪除失敗，已恢復原資料。")
}

function loading(s) {
  statusText.textContent=s;
  modeBadge.textContent="連線中";
  locateButton.textContent="請稍候"
}

function active() {
  locateButton.textContent="停止定位";
  locateButton.setAttribute("aria-pressed","true");
  locateButton.classList.add("primary-button-active");
  statusText.textContent="定位模式已開啟，按 Esc 可停止。";
  statusBox.classList.add("status-box-active");
  modeBadge.textContent="定位中";
  modeBadge.className="status-badge status-active"
}

function idle() {
  locateButton.textContent="開始定位";
  locateButton.setAttribute("aria-pressed","false");
  locateButton.classList.remove("primary-button-active");
  statusText.textContent="尚未開始定位";
  statusBox.classList.remove("status-box-active");
  modeBadge.textContent="待命";
  modeBadge.className="status-badge status-idle"
}

function showError(e) {
  connectedTabId=null;
  isLocating=false;
  statusText.textContent=e instanceof Error?e.message:String(e);
  locateButton.textContent="重新嘗試";
  modeBadge.textContent="操作失敗";
  modeBadge.className="status-badge status-idle";
  console.error(e)
}

function storageError(m,e) {
  statusText.textContent=m;
  console.error(m,e)
}

async function loadSelectedTarget() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_TARGET_TAB"
    });

    if (!response || response.success !== true) {
      throw new Error("無法讀取目前目標分頁。")
    }

    selectedTarget = response.target || null;
    renderTarget();
  } catch (error) {
    selectedTarget = null;
    renderTarget();
    showTargetError(error);
  }
}

function handleTargetStatusChanged(payload) {
  const reason = payload && typeof payload.reason === "string"
    ? payload.reason
    : "unknown";

  selectedTarget = payload && payload.target
    ? payload.target
    : null;

  if (reason !== "active" && reason !== "selected") {
    aimTestState = null;
    isTestingAim = false;
  }

  renderTarget();

  const messages = {
    active: "目標分頁已完成載入，可以繼續使用。",
    reloading: "目標分頁正在重新整理，完成後會自動重新確認。",
    "page-changed": "目標頁面路徑已變更，請確認後重新瞄準目前分頁。",
    unauthorized: "目標分頁已離開授權網站，相關定位操作已停止。",
    closed: "原目標分頁已關閉，目標已自動清除。",
    cleared: "已取消瞄準，不會刪除定位清單。",
    selected: "已將目前分頁設為唯一目標。"
  };

  targetStatusText.textContent = messages[reason] || "目標狀態已更新。";

  if (reason === "active" && isTargetOperational()) {
    switchToTargetContext().catch(function (error) {
      showTargetError(error);
    });
  } else if (
    reason === "closed" ||
    reason === "cleared" ||
    reason === "page-changed" ||
    reason === "unauthorized"
  ) {
    clearTargetContextView();
  }

  if (
    isAiming &&
    reason !== "active" &&
    reason !== "selected"
  ) {
    isAiming = false;
    aimingTabId = null;
  }

  renderAim();
  updateTargetBoundControls();
}

function getTargetVisualState() {
  if (!selectedTarget) {
    return {
      badgeText: "未瞄準",
      badgeClass: "status-badge status-idle"
    };
  }

  const visualStates = {
    active: {
      badgeText: "已瞄準",
      badgeClass: "status-badge status-active"
    },
    reloading: {
      badgeText: "重新連接中",
      badgeClass: "status-badge status-pending"
    },
    "page-changed": {
      badgeText: "頁面已變更",
      badgeClass: "status-badge status-warning"
    },
    unauthorized: {
      badgeText: "已離開授權網站",
      badgeClass: "status-badge status-error"
    }
  };

  return visualStates[selectedTarget.status] || visualStates.active;
}

function renderTarget() {
  const hasTarget = Boolean(selectedTarget);
  const visualState = getTargetVisualState();

  targetEmptyState.hidden = hasTarget;
  targetDetails.hidden = !hasTarget;
  clearTargetButton.disabled = targetOperationInProgress || !hasTarget;
  targetCurrentTabButton.disabled = targetOperationInProgress;
  targetBadge.textContent = visualState.badgeText;
  targetBadge.className = visualState.badgeClass;

  if (!hasTarget) {
    targetTitle.textContent = "";
    targetOrigin.textContent = "";
    targetPath.textContent = "";
    return;
  }

  targetTitle.textContent = selectedTarget.title || "未命名分頁";
  targetOrigin.textContent = selectedTarget.currentOrigin || selectedTarget.origin || "";
  targetPath.textContent = selectedTarget.currentPathname || selectedTarget.pathname || "/";
}

function updateTargetBoundControls() {
  const enabled = isTargetOperational();
  const hasItems = locatorItems.length > 0;

  locateButton.disabled = !enabled || targetOperationInProgress;
  testAllButton.disabled = !enabled || isSaving || !hasItems;
  clearButton.disabled = !enabled || isSaving || !hasItems;

  if (!enabled && !isLocating) {
    statusText.textContent = selectedTarget
      ? "目標目前不可操作，請依瞄準區提示重新確認。"
      : "請先在瞄準區選定目標分頁。";
  }

  updateAimControls();
}

function setTargetOperationState(inProgress) {
  targetOperationInProgress = inProgress;
  targetCurrentTabButton.disabled = inProgress;
  clearTargetButton.disabled = inProgress || !selectedTarget;

  if (inProgress) {
    targetStatusText.textContent = "正在更新目標，請稍候...";
  }

  updateTargetBoundControls();
}

function showTargetError(error) {
  const message = error instanceof Error
    ? error.message
    : String(error);

  targetStatusText.textContent = message;
  console.error("瞄準區錯誤：", error);
}

function createAmmunitionRow() {
  const row = {
    id: `ammunition-row-${nextAmmunitionRowId}`,
    value: ""
  };

  nextAmmunitionRowId += 1;
  return row;
}

function initializeAmmunitionRows() {
  if (ammunitionRows.length > 0) {
    return;
  }

  for (let index = 0; index < DEFAULT_AMMUNITION_ROWS; index += 1) {
    ammunitionRows.push(createAmmunitionRow());
  }

  renderAmmunitionRows();
  ammunitionStatusText.textContent =
    "已建立 5 列暫存資料。關閉 Side Panel 後不會保留。";
}

function renderAmmunitionRows() {
  ammunitionList.replaceChildren();

  ammunitionRows.forEach(function (row, index) {
    const rowElement = document.createElement("div");
    rowElement.className = "ammunition-row";

    const sequence = document.createElement("span");
    sequence.className = "ammunition-sequence";
    sequence.textContent = String(index + 1);

    const input = document.createElement("input");
    input.className = "ammunition-input";
    input.type = "text";
    input.value = row.value;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = 500;
    input.setAttribute(
      "aria-label",
      `第 ${index + 1} 列待填資料`
    );
    input.placeholder = `第 ${index + 1} 列資料`;

    input.addEventListener("input", function (event) {
      row.value = event.target.value;
      updateAmmunitionControls();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "ammunition-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "刪除";
    deleteButton.setAttribute(
      "aria-label",
      `刪除第 ${index + 1} 列`
    );
    deleteButton.disabled = ammunitionRows.length === 1;

    deleteButton.addEventListener("click", function () {
      deleteAmmunitionRow(row.id);
    });

    rowElement.append(sequence, input, deleteButton);
    ammunitionList.appendChild(rowElement);
  });

  ammunitionCount.textContent = `${ammunitionRows.length} 列`;
  updateAmmunitionControls();
}

function deleteAmmunitionRow(rowId) {
  if (ammunitionRows.length === 1) {
    ammunitionStatusText.textContent = "至少需保留 1 列資料。";
    return;
  }

  const rowIndex = ammunitionRows.findIndex(function (row) {
    return row.id === rowId;
  });

  if (rowIndex === -1) {
    return;
  }

  ammunitionRows.splice(rowIndex, 1);
  renderAmmunitionRows();
  ammunitionStatusText.textContent =
    `已刪除資料列，目前共 ${ammunitionRows.length} 列。`;
}

function updateAmmunitionControls() {
  const hasContent = ammunitionRows.some(function (row) {
    return row.value !== "";
  });

  addAmmunitionButton.disabled =
    ammunitionRows.length >= MAX_AMMUNITION_ROWS;
  clearAmmunitionButton.disabled = !hasContent;
}

async function initializeStageFourteen() {
  initializeAmmunitionRows();
  renderAim();
  await loadSelectedTarget();
  await init();
}

initializeStageFourteen().catch(function (error) {
  showError(error);
});
