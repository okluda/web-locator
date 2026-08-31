(function initializeWebLocator() {
  const INITIALIZED_KEY = "__webLocatorInitialized";

  if (globalThis[INITIALIZED_KEY]) {
    return;
  }

  globalThis[INITIALIZED_KEY] = true;

  const CONNECTION_MESSAGE_ID =
    "web-locator-connection-message";

  const HIGHLIGHT_BOX_ID =
    "web-locator-highlight-box";

  const TOOLTIP_ID =
    "web-locator-element-tooltip";

  const SUPPORTED_INPUT_TYPES = new Set([
    "",
    "text",
    "email",
    "number",
    "tel",
    "url",
    "search"
  ]);

  let isLocating = false;
  let isAiming = false;
  let currentAimTarget = null;
  let currentTarget = null;
  let highlightBox = null;
  let tooltip = null;
  let selectionMessageTimer = null;
  const completedExecutionIds = new Set();
  const cancelledExecutionIds = new Set();

  function showConnectionMessage() {
    let messageBox =
      document.getElementById(CONNECTION_MESSAGE_ID);

    if (!messageBox) {
      messageBox = document.createElement("div");
      messageBox.id = CONNECTION_MESSAGE_ID;
      messageBox.textContent =
        "網頁定位工具已連接";

      document.body.appendChild(messageBox);
    }
  }

  function hideConnectionMessage() {
    const messageBox =
      document.getElementById(CONNECTION_MESSAGE_ID);

    if (messageBox) {
      messageBox.remove();
    }
  }

  function createHighlightElements() {
    highlightBox =
      document.getElementById(HIGHLIGHT_BOX_ID);

    if (!highlightBox) {
      highlightBox = document.createElement("div");
      highlightBox.id = HIGHLIGHT_BOX_ID;
      highlightBox.setAttribute("aria-hidden", "true");

      document.body.appendChild(highlightBox);
    }

    tooltip =
      document.getElementById(TOOLTIP_ID);

    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = TOOLTIP_ID;
      tooltip.setAttribute("aria-hidden", "true");

      document.body.appendChild(tooltip);
    }
  }

  function removeHighlightElements() {
    if (highlightBox) {
      highlightBox.remove();
      highlightBox = null;
    }

    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }

    currentTarget = null;
  }

  function isExtensionElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    return Boolean(
      element.closest(
        [
          `#${CONNECTION_MESSAGE_ID}`,
          `#${HIGHLIGHT_BOX_ID}`,
          `#${TOOLTIP_ID}`
        ].join(",")
      )
    );
  }

  function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    const rectangle = element.getBoundingClientRect();

    if (style.display === "none") {
      return false;
    }

    if (style.visibility === "hidden") {
      return false;
    }

    if (Number(style.opacity) === 0) {
      return false;
    }

    if (rectangle.width <= 0 || rectangle.height <= 0) {
      return false;
    }

    return true;
  }

  function isSupportedInput(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (isExtensionElement(element)) {
      return false;
    }

    if (!isElementVisible(element)) {
      return false;
    }

    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled && !element.readOnly;
    }

    if (element instanceof HTMLInputElement) {
      const inputType =
        (element.getAttribute("type") || "")
          .toLowerCase()
          .trim();

      if (!SUPPORTED_INPUT_TYPES.has(inputType)) {
        return false;
      }

      if (element.disabled || element.readOnly) {
        return false;
      }

      return true;
    }

    return false;
  }

  function isIncrementButton(element) {
    if (!(element instanceof HTMLButtonElement)) return false;
    if (element.disabled || !isElementVisible(element) || isExtensionElement(element)) return false;
    if ((element.getAttribute("type") || "button").toLowerCase() !== "button") return false;
    const signature = [
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.textContent || "",
      element.className || "",
      element.querySelector("i")?.className || ""
    ].join(" ").toLowerCase();
    return /(^|\s)(mdi-plus|fa-plus|plus)(\s|$)/.test(signature) || signature.includes("增加") || signature.includes("新增") || signature.trim() === "+";
  }

  function findLocatableElement(startElement) {
    if (!(startElement instanceof Element)) return null;
    const input = startElement.closest("input, textarea");
    if (input && isSupportedInput(input)) return input;
    const button = startElement.closest('button[type="button"], button:not([type])');
    return button && isIncrementButton(button) ? button : null;
  }

  function getLocatorActionType(element) {
    return isIncrementButton(element) ? "increment" : "input";
  }

  function isSupportedAimButton(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (isExtensionElement(element) || !isElementVisible(element)) {
      return false;
    }

    if (element instanceof HTMLButtonElement) {
      return !element.disabled;
    }

    if (element instanceof HTMLInputElement) {
      const inputType = (element.getAttribute("type") || "")
        .toLowerCase()
        .trim();

      return (
        (inputType === "button" || inputType === "submit") &&
        !element.disabled
      );
    }

    return false;
  }

  function findSupportedAimButton(startElement) {
    if (!(startElement instanceof Element)) {
      return null;
    }

    const candidate = startElement.closest(
      'button, input[type="button"], input[type="submit"]'
    );

    return candidate && isSupportedAimButton(candidate)
      ? candidate
      : null;
  }

  function findSupportedInput(startElement) {
    if (!(startElement instanceof Element)) {
      return null;
    }

    const candidate =
      startElement.closest("input, textarea");

    if (!candidate) {
      return null;
    }

    return isSupportedInput(candidate)
      ? candidate
      : null;
  }

  function getAssociatedLabel(element) {
    if (!element) {
      return "";
    }

    if (element.labels && element.labels.length > 0) {
      const labelText =
        element.labels[0].textContent || "";

      return cleanText(labelText);
    }

    const parentLabel = element.closest("label");

    if (parentLabel) {
      return cleanText(parentLabel.textContent || "");
    }

    return "";
  }

  function cleanText(value) {
    return String(value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function getElementName(element) {
    if (isIncrementButton(element)) {
      const ariaLabel = cleanText(element.getAttribute("aria-label") || "");
      const title = cleanText(element.getAttribute("title") || "");
      const count = cleanText(element.getAttribute("data-count") || "");
      return ariaLabel || title || (count ? `加號按鈕（目前 ${count}）` : "加號按鈕");
    }
    const labelText = getAssociatedLabel(element);

    if (labelText) {
      return labelText;
    }

    const ariaLabel =
      cleanText(element.getAttribute("aria-label") || "");

    if (ariaLabel) {
      return ariaLabel;
    }

    const placeholder =
      cleanText(element.getAttribute("placeholder") || "");

    if (placeholder) {
      return placeholder;
    }

    const name =
      cleanText(element.getAttribute("name") || "");

    if (name) {
      return name;
    }

    const id =
      cleanText(element.getAttribute("id") || "");

    if (id) {
      return id;
    }

    return "未命名欄位";
  }

  function escapeCssIdentifier(value) {
    if (globalThis.CSS && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }

    return String(value).replace(
      /([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g,
      "\\$1"
    );
  }

  function escapeCssAttributeValue(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\d ")
      .replace(/\n/g, "\\a ")
      .replace(/\f/g, "\\c ");
  }

  function isUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (error) {
      return false;
    }
  }

  function createSelectorPart(element) {
    let part = element.tagName.toLowerCase();
    const parent = element.parentElement;

    if (!parent) {
      return part;
    }

    const sameTagElements = Array.from(parent.children).filter(
      function (child) {
        return child.tagName === element.tagName;
      }
    );

    if (sameTagElements.length > 1) {
      const position = sameTagElements.indexOf(element) + 1;
      part += `:nth-of-type(${position})`;
    }

    return part;
  }

  function createElementSelector(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    if (element.id) {
      const idSelector = `#${escapeCssIdentifier(element.id)}`;

      if (isUniqueSelector(idSelector)) {
        return idSelector;
      }
    }

    const name = element.getAttribute("name");

    if (name) {
      const nameSelector =
        `${element.tagName.toLowerCase()}` +
        `[name="${escapeCssAttributeValue(name)}"]`;

      if (isUniqueSelector(nameSelector)) {
        return nameSelector;
      }
    }

    const parts = [];
    let currentElement = element;

    while (currentElement && currentElement !== document.documentElement) {
      if (currentElement.id) {
        const ancestorIdSelector =
          `#${escapeCssIdentifier(currentElement.id)}`;

        if (isUniqueSelector(ancestorIdSelector)) {
          parts.unshift(ancestorIdSelector);

          const selectorFromId = parts.join(" > ");

          if (isUniqueSelector(selectorFromId)) {
            return selectorFromId;
          }
        }
      }

      parts.unshift(createSelectorPart(currentElement));

      const selector = parts.join(" > ");

      if (isUniqueSelector(selector)) {
        return selector;
      }

      currentElement = currentElement.parentElement;
    }

    parts.unshift("html");

    const fullSelector = parts.join(" > ");

    return isUniqueSelector(fullSelector)
      ? fullSelector
      : "";
  }

  function createLocatorData(element) {
    const rectangle = element.getBoundingClientRect();

    return {
      id: globalThis.crypto.randomUUID(),
      name: getElementName(element),
      elementType: getElementTypeName(element),
      actionType: getLocatorActionType(element),
      tagName: element.tagName.toLowerCase(),
      inputType:
        element instanceof HTMLInputElement
          ? element.type || "text"
          : element instanceof HTMLTextAreaElement ? "textarea" : "button",
      selector: createElementSelector(element),
      elementId: element.id || "",
      elementName: element.getAttribute("name") || "",
      placeholder:
        element.getAttribute("placeholder") || "",
      pageUrl: window.location.href,
      pageTitle: document.title,
      position: {
        left: Math.round(rectangle.left),
        top: Math.round(rectangle.top),
        width: Math.round(rectangle.width),
        height: Math.round(rectangle.height)
      },
      createdAt: new Date().toISOString()
    };
  }

  function showLocatorErrorMessage(message) {
    createHighlightElements();

    if (selectionMessageTimer) {
      window.clearTimeout(selectionMessageTimer);
    }

    tooltip.textContent = message;
    tooltip.style.backgroundColor = "#a4262c";
    tooltip.style.display = "block";

    selectionMessageTimer = window.setTimeout(function () {
      if (!tooltip) {
        return;
      }

      tooltip.style.backgroundColor = "#0f6cbd";

      if (isLocating && currentTarget) {
        updateHighlightPosition();
      } else {
        tooltip.style.display = "none";
      }
    }, 1600);
  }

  function showSelectionMessage(element) {
    if (!tooltip) {
      return;
    }

    if (selectionMessageTimer) {
      window.clearTimeout(selectionMessageTimer);
    }

    tooltip.textContent =
      `已加入：${getElementName(element)}`;

    tooltip.style.backgroundColor = "#107c10";
    tooltip.style.display = "block";

    selectionMessageTimer = window.setTimeout(
      function () {
        if (!tooltip || !isLocating) {
          return;
        }

        tooltip.style.backgroundColor = "#0f6cbd";

        if (currentTarget) {
          updateHighlightPosition();
        } else {
          tooltip.style.display = "none";
        }
      },
      900
    );
  }

  function getElementTypeName(element) {
    if (isIncrementButton(element)) return "加號按鈕";
    if (element instanceof HTMLTextAreaElement) {
      return "多行文字框";
    }

    if (!(element instanceof HTMLInputElement)) {
      return "輸入欄位";
    }

    const inputType =
      (element.getAttribute("type") || "text")
        .toLowerCase();

    const typeNames = {
      text: "文字輸入框",
      email: "電子郵件欄位",
      number: "數字欄位",
      tel: "電話欄位",
      url: "網址欄位",
      search: "搜尋欄位"
    };

    return typeNames[inputType] || "文字輸入框";
  }

  function updateHighlightPosition() {
    if (
      !isLocating ||
      !currentTarget ||
      !document.contains(currentTarget)
    ) {
      hideHighlight();
      return;
    }

    if (!isSupportedInput(currentTarget) && !isIncrementButton(currentTarget)) {
      hideHighlight();
      return;
    }

    createHighlightElements();

    const rectangle =
      currentTarget.getBoundingClientRect();

    const borderOffset = 3;

    highlightBox.style.left =
      `${rectangle.left - borderOffset}px`;

    highlightBox.style.top =
      `${rectangle.top - borderOffset}px`;

    highlightBox.style.width =
      `${rectangle.width + borderOffset * 2}px`;

    highlightBox.style.height =
      `${rectangle.height + borderOffset * 2}px`;

    highlightBox.style.display = "block";

    const tooltipText =
      `${getElementTypeName(currentTarget)}｜` +
      `${getElementName(currentTarget)}`;

    tooltip.textContent = tooltipText;
    tooltip.style.display = "block";

    positionTooltip(rectangle);
  }

  function positionTooltip(targetRectangle) {
    if (!tooltip) {
      return;
    }

    const pageMargin = 8;
    const tooltipGap = 8;
    const tooltipRectangle =
      tooltip.getBoundingClientRect();

    let left = targetRectangle.left;

    if (
      left + tooltipRectangle.width >
      window.innerWidth - pageMargin
    ) {
      left =
        window.innerWidth -
        tooltipRectangle.width -
        pageMargin;
    }

    if (left < pageMargin) {
      left = pageMargin;
    }

    let top =
      targetRectangle.top -
      tooltipRectangle.height -
      tooltipGap;

    if (top < pageMargin) {
      top =
        targetRectangle.bottom +
        tooltipGap;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function showHighlight(element) {
    if (currentTarget === element) {
      updateHighlightPosition();
      return;
    }

    currentTarget = element;
    updateHighlightPosition();
  }

  function hideHighlight() {
    currentTarget = null;

    if (highlightBox) {
      highlightBox.style.display = "none";
    }

    if (tooltip) {
      tooltip.style.display = "none";
    }
  }

  function handleElementClick(event) {
    if (!isLocating) {
      return;
    }

    const supportedInput =
      findSupportedInput(event.target);

    if (!supportedInput) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const locatorData =
      createLocatorData(supportedInput);

    if (!locatorData.selector) {
      showLocatorErrorMessage(
        "此欄位目前無法建立唯一定位，未加入清單。"
      );
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "ELEMENT_SELECTED",
        payload: locatorData
      },
      function (response) {
        if (chrome.runtime.lastError) {
          console.error(
            "定位資料傳送失敗：",
            chrome.runtime.lastError.message
          );

          return;
        }

        if (response?.success === true) {
          showSelectionMessage(supportedInput);
        }
      }
    );
  }

  function handleMouseMove(event) {
    if (!isLocating) {
      return;
    }

    const supportedInput =
      findSupportedInput(event.target);

    if (!supportedInput) {
      hideHighlight();
      return;
    }

    showHighlight(supportedInput);
  }

  function handleMouseLeave() {
    if (!isLocating) {
      return;
    }

    hideHighlight();
  }

  function handleViewportChange() {
    if (!isLocating || !currentTarget) {
      return;
    }

    updateHighlightPosition();
  }

  function handleKeyDown(event) {
    if (!isLocating || event.key !== "Escape") return;
    stopLocatingMode();
    chrome.runtime.sendMessage({type: "LOCATING_STOPPED"}).catch(function () {});
  }

  function testSelector(item) {
    const result = { id: item.id, status: "not-found", matchCount: 0 };
    let matches;
    try { matches = document.querySelectorAll(item.selector); }
    catch { result.status = "invalid-selector"; return result; }
    result.matchCount = matches.length;
    if (!matches.length) return result;
    if (matches.length > 1) { result.status = "multiple"; return result; }
    const actionType = item.actionType === "increment" ? "increment" : "input";
    const valid = actionType === "increment" ? isIncrementButton(matches[0]) : isSupportedInput(matches[0]);
    if (!valid) { result.status = "unsupported"; return result; }
    result.status = "valid";
    showTestHighlight(matches[0]);
    return result;
  }
  function showTestHighlight(element) {
    createHighlightElements(); currentTarget=element; updateHighlightPosition();
    highlightBox.classList.add("web-locator-test-valid");
    tooltip.textContent=`測試成功｜${getElementName(element)}`; tooltip.style.display="block";
    window.setTimeout(function(){
      if(highlightBox) highlightBox.classList.remove("web-locator-test-valid");
      if(!isLocating) removeHighlightElements(); else hideHighlight();
    },1400);
  }

  function getAimButtonName(element) {
    const ariaLabel = cleanText(element.getAttribute("aria-label") || "");
    if (ariaLabel) {
      return ariaLabel;
    }

    const value = cleanText(element.getAttribute("value") || "");
    if (value) {
      return value;
    }

    const text = cleanText(element.textContent || "");
    if (text) {
      return text;
    }

    const title = cleanText(element.getAttribute("title") || "");
    if (title) {
      return title;
    }

    return "未命名按鈕";
  }

  function getAimButtonType(element) {
    if (element instanceof HTMLButtonElement) {
      return "button 元素";
    }

    const inputType = (element.getAttribute("type") || "button")
      .toLowerCase();

    return `input[type="${inputType}"]`;
  }

  function createAimData(element) {
    const selector = createElementSelector(element);

    if (!selector) {
      return null;
    }

    return {
      id: globalThis.crypto.randomUUID(),
      name: getAimButtonName(element),
      elementType: getAimButtonType(element),
      tagName: element.tagName.toLowerCase(),
      inputType:
        element instanceof HTMLInputElement
          ? (element.getAttribute("type") || "button").toLowerCase()
          : "button",
      selector: selector,
      elementId: element.id || "",
      elementName: element.getAttribute("name") || "",
      pageUrl: window.location.href,
      pageTitle: document.title,
      createdAt: new Date().toISOString()
    };
  }

  function showAimHighlight(element) {
    currentAimTarget = element;
    currentTarget = element;
    createHighlightElements();

    const rectangle = element.getBoundingClientRect();
    const borderOffset = 3;

    highlightBox.style.left = `${rectangle.left - borderOffset}px`;
    highlightBox.style.top = `${rectangle.top - borderOffset}px`;
    highlightBox.style.width = `${rectangle.width + borderOffset * 2}px`;
    highlightBox.style.height = `${rectangle.height + borderOffset * 2}px`;
    highlightBox.style.display = "block";
    highlightBox.classList.add("web-locator-aim-highlight");

    tooltip.textContent =
      `準星｜${getAimButtonName(element)}｜點擊只會記錄，不會執行`;
    tooltip.style.backgroundColor = "#8764b8";
    tooltip.style.display = "block";
    positionTooltip(rectangle);
  }

  function hideAimHighlight() {
    currentAimTarget = null;
    currentTarget = null;

    if (highlightBox) {
      highlightBox.style.display = "none";
      highlightBox.classList.remove("web-locator-aim-highlight");
    }

    if (tooltip) {
      tooltip.style.display = "none";
      tooltip.style.backgroundColor = "#0f6cbd";
    }
  }

  function handleAimMouseMove(event) {
    if (!isAiming) {
      return;
    }

    const aimButton = findSupportedAimButton(event.target);

    if (!aimButton) {
      hideAimHighlight();
      return;
    }

    showAimHighlight(aimButton);
  }

  function handleAimClick(event) {
    if (!isAiming) {
      return;
    }

    const aimButton = findSupportedAimButton(event.target);

    if (!aimButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const aimData = createAimData(aimButton);

    if (!aimData) {
      showLocatorErrorMessage(
        "此按鈕目前無法建立唯一準星定位，未記錄。"
      );
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "AIM_SELECTED",
        payload: aimData
      },
      function (response) {
        if (chrome.runtime.lastError) {
          console.error(
            "準星資料傳送失敗：",
            chrome.runtime.lastError.message
          );
          return;
        }

        if (response && response.success === true) {
          stopAimingMode();
        }
      }
    );
  }

  function handleAimKeyDown(event) {
    if (!isAiming || event.key !== "Escape") {
      return;
    }

    stopAimingMode();

    chrome.runtime.sendMessage({
      type: "AIMING_STOPPED"
    }).catch(function () {
      // Side Panel may have been closed.
    });
  }

  const MANUAL_TRIGGER_PROMPT_ID = "web-locator-manual-trigger-prompt";
  let manualTriggerTimer = null;

  function removeManualTriggerPrompt() {
    if (manualTriggerTimer) {
      window.clearTimeout(manualTriggerTimer);
      manualTriggerTimer = null;
    }
    const prompt = document.getElementById(MANUAL_TRIGGER_PROMPT_ID);
    if (prompt) prompt.remove();
  }

  async function prepareManualTrigger(payload) {
    const result={id:payload?.id||"",status:"not-found",matchCount:0};
    let matches;
    try { matches=document.querySelectorAll(payload.selector); } catch { result.status="invalid-selector"; return result; }
    result.matchCount=matches.length;
    if(!matches.length)return result;
    if(matches.length>1){result.status="multiple";return result;}
    const element=matches[0];
    if(!isSupportedAimButton(element)){result.status=element.disabled?"disabled":"unsupported";return result;}
    element.scrollIntoView({behavior:"smooth",block:"center",inline:"center"});
    await new Promise(resolve=>window.setTimeout(resolve,350));
    if(!isElementVisible(element)){result.status="invisible";return result;}
    showAimTestHighlight(element);
    showManualTriggerPrompt(element,payload?.name||getAimButtonName(element));
    result.status="awaiting-user-focus";
    return result;
  }

  function showManualTriggerPrompt(aimElement, aimName) {
    removeManualTriggerPrompt();
    const prompt=document.createElement("div");
    prompt.id=MANUAL_TRIGGER_PROMPT_ID;
    prompt.setAttribute("role","dialog");
    prompt.setAttribute("aria-label","手動板機鍵盤操作");
    const title=document.createElement("strong");
    title.textContent=`已找到準星：${aimName}`;
    const text=document.createElement("p");
    text.textContent="請先啟用網頁鍵盤操作，再按 Enter 或 Space。";
    const actions=document.createElement("div");
    const enable=document.createElement("button");
    enable.type="button"; enable.textContent="啟用鍵盤操作";
    const cancel=document.createElement("button");
    cancel.type="button"; cancel.textContent="取消";
    enable.addEventListener("click",function(event){
      event.preventDefault(); event.stopPropagation();
      aimElement.focus({preventScroll:true});
      const focused=document.hasFocus() && document.activeElement===aimElement;
      removeManualTriggerPrompt();
      if(focused){ showAimTestHighlight(aimElement); }
    });
    cancel.addEventListener("click",function(event){ event.preventDefault(); event.stopPropagation(); removeManualTriggerPrompt(); });
    actions.append(enable,cancel); prompt.append(title,text,actions); document.body.appendChild(prompt);
    manualTriggerTimer=window.setTimeout(removeManualTriggerPrompt,15000);
  }

  function testAimSelector(testItem) {
    const result = {
      id: testItem && testItem.id ? testItem.id : "",
      status: "not-found",
      matchCount: 0
    };

    if (!testItem || typeof testItem.selector !== "string") {
      result.status = "invalid-selector";
      return result;
    }

    let matches;

    try {
      matches = document.querySelectorAll(testItem.selector);
    } catch (error) {
      result.status = "invalid-selector";
      return result;
    }

    result.matchCount = matches.length;

    if (matches.length === 0) {
      return result;
    }

    if (matches.length > 1) {
      result.status = "multiple";
      return result;
    }

    if (!isSupportedAimButton(matches[0])) {
      result.status = "unsupported";
      return result;
    }

    result.status = "valid";
    showAimTestHighlight(matches[0]);
    return result;
  }

  function showAimTestHighlight(element) {
    createHighlightElements();

    const rectangle = element.getBoundingClientRect();
    const borderOffset = 3;

    highlightBox.style.left = `${rectangle.left - borderOffset}px`;
    highlightBox.style.top = `${rectangle.top - borderOffset}px`;
    highlightBox.style.width = `${rectangle.width + borderOffset * 2}px`;
    highlightBox.style.height = `${rectangle.height + borderOffset * 2}px`;
    highlightBox.style.display = "block";
    highlightBox.classList.add("web-locator-aim-test-valid");

    tooltip.textContent =
      `準星測試成功｜${getAimButtonName(element)}｜不會執行按鈕`;
    tooltip.style.backgroundColor = "#107c10";
    tooltip.style.display = "block";
    positionTooltip(rectangle);

    window.setTimeout(function () {
      if (highlightBox) {
        highlightBox.classList.remove("web-locator-aim-test-valid");
        highlightBox.style.display = "none";
      }

      if (tooltip) {
        tooltip.style.display = "none";
        tooltip.style.backgroundColor = "#0f6cbd";
      }

      if (!isLocating && !isAiming) {
        removeHighlightElements();
      }
    }, 3000);
  }

  function setNativeInputValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (!descriptor || typeof descriptor.set !== "function") {
      element.value = value;
      return;
    }

    descriptor.set.call(element, value);
  }

  async function fillFieldItem(item, executionId) {
    const result = { locatorId: item.locatorId, locatorName: item.locatorName || item.locatorId, status: "error", matchCount: 0 };
    let matches;
    try { matches = document.querySelectorAll(item.selector); }
    catch { result.status = "invalid-selector"; return result; }
    result.matchCount = matches.length;
    if (!matches.length) { result.status = "not-found"; return result; }
    if (matches.length > 1) { result.status = "multiple"; return result; }
    const element = matches[0];
    if (item.actionType === "increment") {
      const count = Number(item.repeatCount);
      if (!Number.isInteger(count) || count < 0 || count > 50) { result.status = "invalid-count"; return result; }
      if (!isIncrementButton(element)) { result.status = element.disabled ? "readonly" : "unsupported"; return result; }
      result.completedCount = 0;
      result.requestedCount = count;
      for (let index = 0; index < count; index += 1) {
        if (cancelledExecutionIds.has(executionId)) { result.status = "stopped"; return result; }
        if (!document.contains(element) || !isIncrementButton(element)) { result.status = "button-unavailable"; return result; }
        element.click();
        result.completedCount += 1;
        await new Promise(resolve => window.setTimeout(resolve, 120));
      }
      result.status = "success";
      return result;
    }
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) { result.status = "unsupported"; return result; }
    if (!isSupportedInput(element)) { result.status = element.disabled || element.readOnly ? "readonly" : "invisible"; return result; }
    try {
      element.focus({ preventScroll: true });
      setNativeInputValue(element, String(item.value ?? ""));
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      result.status = element.value === String(item.value ?? "") ? "success" : "mismatch";
      return result;
    } catch (error) { result.status = "error"; result.message = error instanceof Error ? error.message : String(error); return result; }
  }
  function waitForExecutionTurn() {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, 40);
    });
  }

  async function fillFields(payload) {
    const executionId = payload && typeof payload.executionId === "string"
      ? payload.executionId
      : "";
    const items = payload && Array.isArray(payload.items) ? payload.items : [];
    const stopOnFailure = !payload || payload.stopOnFailure !== false;
    const results = [];
    let stopped = false;

    if (!executionId) {
      return { success: false, completed: false, executionId: "", results: [], error: "missing-execution-id" };
    }
    if (completedExecutionIds.has(executionId)) {
      return { success: false, completed: false, executionId: executionId, results: [], error: "duplicate-execution-id" };
    }

    completedExecutionIds.add(executionId);

    for (const item of items) {
      await waitForExecutionTurn();
      if (cancelledExecutionIds.has(executionId) || stopped) {
        results.push({ locatorId: item.locatorId, locatorName: item.locatorName || item.locatorId, status: "not-executed", matchCount: 0 });
        continue;
      }
      const result = await fillFieldItem(item, executionId);
      results.push(result);
      if (stopOnFailure && result.status !== "success") stopped = true;
    }

    cancelledExecutionIds.delete(executionId);
    return {
      success: true,
      completed: results.length > 0 && results.every(function (result) { return result.status === "success"; }),
      executionId: executionId,
      results: results
    };
  }

  function startAimingMode() {
    if (isLocating) {
      stopLocatingMode();
    }

    if (isAiming) {
      return;
    }

    isAiming = true;
    createHighlightElements();
    showConnectionMessage();

    document.addEventListener("mousemove", handleAimMouseMove, true);
    document.addEventListener("click", handleAimClick, true);
    document.addEventListener("keydown", handleAimKeyDown, true);
  }

  function stopAimingMode() {
    isAiming = false;

    document.removeEventListener("mousemove", handleAimMouseMove, true);
    document.removeEventListener("click", handleAimClick, true);
    document.removeEventListener("keydown", handleAimKeyDown, true);

    hideAimHighlight();
    hideConnectionMessage();
    removeHighlightElements();
  }

  function startLocatingMode() {
    if (isAiming) {
      stopAimingMode();
    }

    if (isLocating) {
      showConnectionMessage();
      return;
    }

    isLocating = true;

    createHighlightElements();
    showConnectionMessage();

    document.addEventListener(
      "click",
      handleElementClick,
      true
    );

    document.addEventListener(
      "mousemove",
      handleMouseMove,
      true
    );

    document.addEventListener(
      "mouseleave",
      handleMouseLeave,
      true
    );
    document.addEventListener("keydown", handleKeyDown, true);

    window.addEventListener(
      "scroll",
      handleViewportChange,
      true
    );

    window.addEventListener(
      "resize",
      handleViewportChange
    );
  }

  function stopLocatingMode() {
    isLocating = false;

    document.removeEventListener(
      "click",
      handleElementClick,
      true
    );

    document.removeEventListener(
      "mousemove",
      handleMouseMove,
      true
    );

    document.removeEventListener(
      "mouseleave",
      handleMouseLeave,
      true
    );
    document.removeEventListener("keydown", handleKeyDown, true);

    window.removeEventListener(
      "scroll",
      handleViewportChange,
      true
    );

    window.removeEventListener(
      "resize",
      handleViewportChange
    );

    if (selectionMessageTimer) {
      window.clearTimeout(selectionMessageTimer);
      selectionMessageTimer = null;
    }    

    hideConnectionMessage();
    removeHighlightElements();
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "START_LOCATING") {
      startLocatingMode(); sendResponse({success:true,status:"started"}); return;
    }
    if (message.type === "STOP_LOCATING") {
      stopLocatingMode(); sendResponse({success:true,status:"stopped"}); return;
    }
    if (message.type === "GET_LOCATING_STATUS") {
      sendResponse({success:true,isLocating:isLocating}); return;
    }
    if (message.type === "START_AIMING") {
      startAimingMode();
      sendResponse({ success: true, status: "started" });
      return;
    }

    if (message.type === "STOP_AIMING") {
      stopAimingMode();
      sendResponse({ success: true, status: "stopped" });
      return;
    }

    if (message.type === "GET_AIMING_STATUS") {
      sendResponse({ success: true, isAiming: isAiming });
      return;
    }

    if (message.type === "PREPARE_MANUAL_TRIGGER") {
      prepareManualTrigger(message.payload).then(result=>sendResponse({success:true,result}));
      return true;
    }
    if (message.type === "TEST_AIM") {
      const result = testAimSelector(message.payload);
      sendResponse({
        success: true,
        result: result
      });
      return;
    }

    if (message.type === "FILL_FIELDS") {
      fillFields(message.payload).then(sendResponse);
      return true;
    }

    if (message.type === "STOP_FILLING") {
      const executionId = message.payload && message.payload.executionId;
      if (typeof executionId === "string" && executionId) {
        cancelledExecutionIds.add(executionId);
      }
      sendResponse({ success: true, executionId: executionId || "" });
      return;
    }

    if (message.type === "TEST_LOCATORS") {
      const items=Array.isArray(message.payload)?message.payload:[];
      sendResponse({success:true,results:items.map(testSelector)});
    }
  });
})();
