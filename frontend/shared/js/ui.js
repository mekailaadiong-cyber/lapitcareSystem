export const icon = (name) => {
  if (name === "bell") return '<svg class="header-bell-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';
  const icons = {
    home: "⌂",
    search: "⌕",
    map: "⌖",
    calendar: "▣",
    bell: "◉",
    user: "○",
    clinic: "✚",
    staff: "♙",
    service: "◇",
    clock: "◷",
    report: "▥",
    log: "≡",
    logout: "↪",
    menu: "☰",
    close: "×",
    check: "✓",
  };
  return icons[name] || "•";
};

let customSelectSequence = 0;
function enhanceSelect(select) {
  if (!(select instanceof HTMLSelectElement) || select.hasAttribute("data-native-select") || select.multiple || select.size > 0) return;
  if (select.dataset.customized === "true") { select._customSelectRefresh?.(); return; }
  const parent = select.parentNode;
  if (!parent) return;
  select.dataset.customized = "true";
  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";
  wrapper.dataset.disabled = String(select.disabled);
  const controlId = `lapitcare-select-${++customSelectSequence}`;
  const button = document.createElement("button");
  button.type = "button";
  button.id = `${controlId}-button`;
  button.className = "custom-select-trigger";
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", `${controlId}-list`);
  const label = select.labels?.[0]?.textContent?.trim() || select.getAttribute("aria-label") || "Choose an option";
  [...(select.labels || [])].forEach((item) => { item.htmlFor = button.id; });
  button.setAttribute("aria-label", label);
  const list = document.createElement("div");
  list.className = "custom-select-list";
  list.id = `${controlId}-list`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", label);
  list.dataset.customSelectOwner = controlId;
  list.hidden = true;
  parent.insertBefore(wrapper, select);
  wrapper.append(select, button);
  wrapper._customSelectList = list;
  document.body.append(list);
  select.classList.add("custom-select-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const close = (returnFocus = false) => {
    list.hidden = true;
    wrapper.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    list.style.cssText = "";
    if (returnFocus) button.focus();
  };
  wrapper._closeCustomSelect = close;
  const open = (index) => {
    render();
    if (select.disabled) return;
    list.hidden = false;
    wrapper.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    const bounds = button.getBoundingClientRect();
    const roomBelow = window.innerHeight - bounds.bottom;
    const roomAbove = bounds.top;
    list.style.position = "fixed";
    list.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - bounds.width - 12))}px`;
    list.style.width = `${Math.min(bounds.width, window.innerWidth - 24)}px`;
    list.style.maxHeight = `${Math.max(120, Math.min(300, Math.max(roomBelow, roomAbove) - 18))}px`;
    if (roomBelow < 220 && roomAbove > roomBelow) {
      list.style.top = "auto";
      list.style.bottom = `${window.innerHeight - bounds.top + 7}px`;
    } else {
      list.style.top = `${bounds.bottom + 7}px`;
      list.style.bottom = "auto";
    }
    const options = [...list.querySelectorAll('[role="option"]:not([aria-disabled="true"])')];
    const selected = options.findIndex((option) => option.getAttribute("aria-selected") === "true");
    options[index ?? Math.max(0, selected)]?.focus();
  };
  let typeahead = "";
  let typeaheadTimer;
  let buttonValue;
  const syncSelection = () => {
    if (buttonValue) buttonValue.textContent = select.selectedOptions[0]?.textContent?.trim() || "Choose an option";
    [...list.querySelectorAll('[role="option"]')].forEach((item) => {
      const option = select.options[Number(item.dataset.optionIndex)];
      item.setAttribute("aria-selected", String(Boolean(option?.selected)));
      item.setAttribute("aria-disabled", String(Boolean(option?.disabled)));
    });
    wrapper.dataset.disabled = String(select.disabled);
    button.disabled = select.disabled;
    button.setAttribute("aria-required", String(select.required));
    const description = select.getAttribute("aria-describedby");
    if (description) button.setAttribute("aria-describedby", description);
    else button.removeAttribute("aria-describedby");
  };
  const render = () => {
    const options = [...select.options];
    button.replaceChildren();
    buttonValue = document.createElement("span");
    buttonValue.className = "custom-select-value";
    button.append(buttonValue);
    const icon = document.createElement("span");
    icon.className = "custom-select-chevron";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);
    list.replaceChildren();
    options.forEach((option, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "custom-select-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.setAttribute("aria-disabled", String(Boolean(option.disabled || select.disabled)));
      item.tabIndex = -1;
      item.dataset.optionIndex = String(index);
      item.textContent = option.textContent.trim();
      list.append(item);
    });
    syncSelection();
  };
  render();
  select._customSelectRefresh = render;
  select._customSelectSync = () => {
    render();
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  select.addEventListener("change", syncSelection);
  select.addEventListener("input", syncSelection);
  button.addEventListener("click", () => button.getAttribute("aria-expanded") === "true" ? close() : open());
  button.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      open(event.key === "ArrowUp" ? [...list.querySelectorAll('[role="option"]:not([aria-disabled="true"])')].length - 1 : undefined);
    }
  });
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[role=option]");
    if (!item || item.getAttribute("aria-disabled") === "true") return;
    const option = select.options[Number(item.dataset.optionIndex)];
    if (!option || option.disabled) return;
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    close(true);
  });
  list.addEventListener("keydown", (event) => {
    const enabled = [...list.querySelectorAll('[role="option"]:not([aria-disabled="true"])')];
    const current = enabled.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      enabled[Math.max(0, Math.min(enabled.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      enabled[event.key === "Home" ? 0 : enabled.length - 1]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.activeElement?.click();
    } else if (event.key === "Tab") {
      const controls = [...document.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.closest(".custom-select-list") && !element.closest('[aria-hidden="true"]') && !element.hidden && element.getClientRects().length);
      const triggerIndex = controls.indexOf(button);
      const target = controls[triggerIndex + (event.shiftKey ? -1 : 1)];
      event.preventDefault();
      close();
      target?.focus();
    } else if (event.key.length === 1 && /^[\p{L}\p{N} ]$/u.test(event.key)) {
      event.preventDefault();
      typeahead += event.key.toLocaleLowerCase();
      clearTimeout(typeaheadTimer);
      typeaheadTimer = setTimeout(() => { typeahead = ""; }, 700);
      const start = Math.max(0, current + 1);
      const ordered = [...enabled.slice(start), ...enabled.slice(0, start)];
      const match = ordered.find((option) => option.textContent.trim().toLocaleLowerCase().startsWith(typeahead));
      match?.focus();
    }
  });
}

let customCalendarSequence = 0;
function enhanceDateInput(input) {
  if (!(input instanceof HTMLInputElement) || input.type !== "date" || input.dataset.calendarized === "true") return;
  const parent = input.parentNode;
  if (!parent) return;
  input.dataset.calendarized = "true";
  const wrapper = document.createElement("div");
  wrapper.className = "custom-date-picker";
  const trigger = document.createElement("button");
  const popupId = `lapitcare-calendar-${++customCalendarSequence}`;
  trigger.type = "button";
  trigger.id = `${popupId}-trigger`;
  trigger.className = "custom-date-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", popupId);
  trigger.setAttribute("aria-required", String(input.required));
  if (input.getAttribute("aria-describedby")) trigger.setAttribute("aria-describedby", input.getAttribute("aria-describedby"));
  const label = input.labels?.[0]?.textContent?.trim() || input.getAttribute("aria-label") || "Choose a date";
  [...(input.labels || [])].forEach((item) => { item.htmlFor = trigger.id; });
  trigger.setAttribute("aria-label", label);
  const popup = document.createElement("section");
  popup.className = "custom-date-popover";
  popup.id = popupId;
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `${label} calendar`);
  popup.hidden = true;
  const month = document.createElement("div");
  month.className = "calendar-month";
  month.setAttribute("aria-live", "polite");
  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  const weekdays = document.createElement("div");
  weekdays.className = "calendar-weekdays";
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((day) => {
    const item = document.createElement("span");
    item.textContent = day;
    weekdays.append(item);
  });
  const days = document.createElement("div");
  days.className = "calendar-days";
  const clearDate = document.createElement("button");
  clearDate.type = "button";
  clearDate.className = "calendar-clear-date";
  clearDate.textContent = "Clear date";
  clearDate.hidden = input.required;
  const controls = document.createElement("div");
  controls.className = "calendar-controls";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "calendar-nav";
  previous.setAttribute("aria-label", "Previous month");
  previous.textContent = "‹";
  const title = document.createElement("strong");
  title.className = "calendar-title";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "calendar-nav";
  next.setAttribute("aria-label", "Next month");
  next.textContent = "›";
  controls.append(previous, title, next);
  grid.append(weekdays, days);
  popup.append(controls, grid, clearDate);
  parent.insertBefore(wrapper, input);
  wrapper.append(input, trigger, popup);
  input.classList.add("custom-date-native");
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");

  let shownMonth = input.value ? new Date(`${input.value}T00:00:00`) : new Date();
  shownMonth.setDate(1);
  const asISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const display = (value) => value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "Choose a date";
  const syncShownMonth = () => {
    if (!input.value) return;
    const selected = new Date(`${input.value}T00:00:00`);
    if (Number.isNaN(selected.getTime())) return;
    shownMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  };
  const render = () => {
    title.textContent = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(shownMonth);
    trigger.replaceChildren();
    const value = document.createElement("span");
    value.textContent = display(input.value);
    const icon = document.createElement("span");
    icon.className = "custom-date-icon";
    icon.setAttribute("aria-hidden", "true");
    trigger.append(value, icon);
    days.replaceChildren();
    const monthStart = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1);
    const offset = (monthStart.getDay() + 6) % 7;
    const count = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 0).getDate();
    for (let i = 0; i < offset; i++) {
      const blank = document.createElement("span");
      blank.className = "calendar-day calendar-day-empty";
      blank.setAttribute("aria-hidden", "true");
      days.append(blank);
    }
    for (let number = 1; number <= count; number++) {
      const date = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), number);
      const value = asISO(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.textContent = String(number);
      button.setAttribute("aria-label", new Intl.DateTimeFormat("en-PH", { dateStyle: "full" }).format(date));
      button.setAttribute("aria-pressed", String(value === input.value));
      if (value === input.value) button.setAttribute("aria-current", "date");
      button.disabled = Boolean((input.min && value < input.min) || (input.max && value > input.max));
      button.addEventListener("click", () => {
        input.value = value;
        shownMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        render();
        popup.hidden = true;
        wrapper.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      });
      days.append(button);
    }
    previous.disabled = Boolean(input.min && asISO(new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 0)) < input.min);
    next.disabled = Boolean(input.max && asISO(new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1)) > input.max);
  };
  const shiftMonth = (amount) => { shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + amount, 1); render(); };
  previous.addEventListener("click", () => shiftMonth(-1));
  next.addEventListener("click", () => shiftMonth(1));
  clearDate.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    render();
    popup.hidden = true;
    wrapper.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  });
  trigger.addEventListener("click", () => {
    const open = popup.hidden;
    popup.hidden = !open;
    wrapper.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      syncShownMonth();
      render();
      const bounds = trigger.getBoundingClientRect();
      const width = Math.min(330, window.innerWidth - 24);
      const roomBelow = window.innerHeight - bounds.bottom;
      const roomAbove = bounds.top;
      popup.style.position = "fixed";
      popup.style.width = `${width}px`;
      popup.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))}px`;
      popup.style.maxHeight = `${Math.max(200, Math.min(440, Math.max(roomBelow, roomAbove) - 18))}px`;
      popup.style.overflowY = "auto";
      popup.style.top = roomBelow < 300 && roomAbove > roomBelow ? "auto" : `${bounds.bottom + 7}px`;
      popup.style.bottom = roomBelow < 300 && roomAbove > roomBelow ? `${window.innerHeight - bounds.top + 7}px` : "auto";
    } else popup.style.cssText = "";
  });
  input.addEventListener("change", () => { syncShownMonth(); render(); });
  input.addEventListener("input", render);
  render();
}

export function setupCustomSelects(root = document) {
  root.querySelectorAll("select").forEach(enhanceSelect);
  root.querySelectorAll('input[type="date"]').forEach(enhanceDateInput);
  if (root === document && !document.documentElement.dataset.customSelectObserver) {
    document.documentElement.dataset.customSelectObserver = "true";
    document.addEventListener("click", (event) => {
      const clickedList = event.target.closest?.(".custom-select-list");
      const current = event.target.closest?.(".custom-select") ||
        (clickedList && [...document.querySelectorAll(".custom-select")].find((wrapper) => wrapper._customSelectList === clickedList));
      document.querySelectorAll(".custom-select.is-open").forEach((wrapper) => {
        if (wrapper !== current) wrapper._closeCustomSelect?.();
      });
      const calendar = event.target.closest?.(".custom-date-picker");
      document.querySelectorAll(".custom-date-picker.is-open").forEach((wrapper) => {
        if (wrapper !== calendar) {
          wrapper.classList.remove("is-open");
          wrapper.querySelector(".custom-date-popover").hidden = true;
          wrapper.querySelector(".custom-date-trigger").setAttribute("aria-expanded", "false");
        }
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
    const wrapper = [...document.querySelectorAll(".custom-select.is-open")].find((item) => item._customSelectList && !item._customSelectList.hidden);
      if (wrapper) {
        event.preventDefault();
        event.stopImmediatePropagation();
        wrapper._closeCustomSelect?.(true);
        return;
      }
    const datePicker = [...document.querySelectorAll(".custom-date-picker.is-open")].find((item) => !item.querySelector(".custom-date-popover")?.hidden);
      if (datePicker) {
        event.preventDefault();
        event.stopImmediatePropagation();
        datePicker.classList.remove("is-open");
        datePicker.querySelector(".custom-date-popover").hidden = true;
        datePicker.querySelector(".custom-date-trigger").setAttribute("aria-expanded", "false");
        datePicker.querySelector(".custom-date-trigger").focus();
      }
    });
    document.addEventListener("focusin", (event) => {
      const focusedList = event.target.closest?.(".custom-select-list");
      const focusedWrapper = event.target.closest?.(".custom-select") ||
        (focusedList && [...document.querySelectorAll(".custom-select")].find((wrapper) => wrapper._customSelectList === focusedList));
      document.querySelectorAll(".custom-select.is-open").forEach((wrapper) => {
        if (wrapper !== focusedWrapper) wrapper._closeCustomSelect?.();
      });
    });
    document.addEventListener("reset", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      requestAnimationFrame(() => form.querySelectorAll("select").forEach((select) => select._customSelectRefresh?.()));
    }, true);
    window.addEventListener("scroll", (event) => {
      if (event.target.closest?.(".custom-select-list, .custom-date-popover")) return;
      document.querySelectorAll(".custom-select.is-open, .custom-date-picker.is-open").forEach((wrapper) => {
        if (wrapper._closeCustomSelect) {
          wrapper._closeCustomSelect();
          return;
        }
        wrapper.classList.remove("is-open");
        const panel = wrapper.querySelector(".custom-date-popover");
        if (panel) { panel.hidden = true; panel.style.cssText = ""; }
        wrapper.querySelector(".custom-select-trigger, .custom-date-trigger")?.setAttribute("aria-expanded", "false");
      });
    }, true);
    window.addEventListener("resize", () => {
      document.querySelectorAll(".custom-select.is-open").forEach((wrapper) => wrapper._closeCustomSelect?.());
      document.querySelectorAll(".custom-date-picker.is-open").forEach((wrapper) => {
        wrapper.classList.remove("is-open");
        const panel = wrapper.querySelector(".custom-date-popover");
        if (panel) { panel.hidden = true; panel.style.cssText = ""; }
        wrapper.querySelector(".custom-date-trigger")?.setAttribute("aria-expanded", "false");
      });
    });
    new MutationObserver((records) => records.forEach((record) => {
      const select = record.target instanceof HTMLSelectElement
        ? record.target
        : record.target.closest?.("select");
      select?._customSelectRefresh?.();
      record.removedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const wrappers = [
          ...(node.matches?.(".custom-select") ? [node] : []),
          ...(node.querySelectorAll ? node.querySelectorAll(".custom-select") : []),
        ];
        wrappers.forEach((wrapper) => {
          if (wrapper.isConnected) return;
          wrapper._closeCustomSelect?.();
          wrapper._customSelectList?.remove();
        });
      });
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.("select")) enhanceSelect(node);
        if (node.matches?.('input[type="date"]')) enhanceDateInput(node);
        node.querySelectorAll?.("select").forEach(enhanceSelect);
        node.querySelectorAll?.('input[type="date"]').forEach(enhanceDateInput);
      });
    })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "selected"] });
  }
}
if (typeof document !== "undefined") setupCustomSelects();
export function statusClass(status = "") {
  return `status-${status.toLowerCase().replaceAll(" ", "-")}`;
}
export function badge(status) {
  return `<span class="badge ${statusClass(status)}">${status}</span>`;
}
export function toast(message) {
  let c = document.querySelector(".toast-container");
  if (!c) {
    c = document.createElement("div");
    c.className = "toast-container";
    document.body.append(c);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  c.append(t);
  setTimeout(() => t.remove(), 3200);
}
export function modal(title, message, onConfirm) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p class="eyebrow">Please confirm</p><h2>${title}</h2><p class="muted">${message}</p><div class="actions"><button class="btn btn-primary" data-confirm>Confirm</button><button class="btn btn-secondary" data-close>Go back</button></div></div>`;
  document.body.append(wrap);
  wrap
    .querySelector("[data-close]")
    .addEventListener("click", () => wrap.remove());
  wrap.querySelector("[data-confirm]").addEventListener("click", async () => {
    const button = wrap.querySelector("[data-confirm]");
    button.disabled = true;
    try {
      await onConfirm?.();
      wrap.remove();
    } catch (error) {
      console.error(error);
      toast(`Action failed: ${error.message}`);
      button.disabled = false;
    }
  });
}
export function formModal(title, message, field, submitLabel = "Continue") {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    const fields = Array.isArray(field) ? field : [field];
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const controls = fields.map((item, index) => {
      const id = `dialog-field-${index}`;
      const control = item.type === "select"
        ? `<select class="select" id="${id}" name="${escape(item.name || index)}" ${item.required ? "required" : ""}>${(item.options || []).map((option) => `<option value="${escape(option.value)}" ${String(option.value) === String(item.value ?? "") ? "selected" : ""}>${escape(option.label)}</option>`).join("")}</select>`
        : item.type === "textarea"
          ? `<textarea class="textarea" id="${id}" name="${escape(item.name || index)}" rows="4" maxlength="${Number(item.maxlength) || 500}" ${item.required ? "required" : ""} placeholder="${escape(item.placeholder)}">${escape(item.value)}</textarea>`
          : `<input class="input" id="${id}" name="${escape(item.name || index)}" type="${escape(item.type || "text")}" ${item.required ? "required" : ""} ${item.min ? `min="${escape(item.min)}"` : ""} ${item.max ? `max="${escape(item.max)}"` : ""} placeholder="${escape(item.placeholder)}" value="${escape(item.value)}">`;
      return `<div class="field"><label for="${id}">${escape(item.label)}</label>${control}</div>`;
    }).join("");
    wrap.innerHTML = `<form class="modal modal-form" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><p class="eyebrow">LapitCare</p><h2 id="dialog-title">${escape(title)}</h2><p class="muted">${escape(message)}</p><div class="modal-form-fields">${controls}</div><p class="form-error" id="dialog-error" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">${escape(submitLabel)}</button><button class="btn btn-secondary" type="button" data-close>Cancel</button></div></form>`;
    document.body.append(wrap);
    setupCustomSelects(wrap);
    const inputs = [...wrap.querySelectorAll(".modal-form-fields input, .modal-form-fields select, .modal-form-fields textarea")];
    let keyHandler = null;
    const close = (value) => {
      if (keyHandler) document.removeEventListener("keydown", keyHandler);
      wrap.remove();
      resolve(value);
    };
    wrap.querySelector("[data-close]").addEventListener("click", () => close(null));
    wrap.addEventListener("click", (event) => { if (event.target === wrap) close(null); });
    keyHandler = (event) => { if (event.key === "Escape") close(null); };
    document.addEventListener("keydown", keyHandler);
    wrap.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const missing = fields.findIndex((item, index) => item.required && !inputs[index].value.trim());
      if (missing >= 0) {
        wrap.querySelector("#dialog-error").textContent = `${fields[missing].label} is required.`;
        const dateTrigger = inputs[missing].closest(".custom-date-picker")?.querySelector(".custom-date-trigger");
        const selectTrigger = inputs[missing].closest(".custom-select")?.querySelector(".custom-select-trigger");
        (dateTrigger || selectTrigger || inputs[missing]).focus();
        return;
      }
      const values = Object.fromEntries(inputs.map((input, index) => [fields[index].name || String(index), input.value.trim()]));
      close(Array.isArray(field) ? values : inputs[0].value.trim());
    });
    requestAnimationFrame(() => {
      const firstTrigger = inputs[0]?.closest(".custom-select")?.querySelector(".custom-select-trigger") || inputs[0]?.closest(".custom-date-picker")?.querySelector(".custom-date-trigger");
      (firstTrigger || inputs[0])?.focus();
    });
  });
}
export function setupMobileNav(button = document.querySelector("[data-menu]")) {
  const btn = button,
    side = document.querySelector(".sidebar");
  const setOpen = (open) => {
    side?.classList.toggle("open", open);
    document.body.classList.toggle("nav-open", open);
    if (!btn) return;
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
    btn.querySelector(".sidebar-nav-icon")?.classList.toggle("is-open", open);
  };
  side
    ?.querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("click", (event) => {
    if (
      side?.classList.contains("open") &&
      !side.contains(event.target) &&
      !btn?.contains(event.target)
    )
      setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && side?.classList.contains("open")) {
      setOpen(false);
      btn?.focus();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) {
      setOpen(false);
    } else {
      btn?.querySelector(".sidebar-nav-icon")?.classList.remove("is-open");
    }
  });
  return () => setOpen(!side?.classList.contains("open"));
}
export function setupPassword() {
  document.querySelectorAll("[data-password-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.passwordToggle);
      const isVisible = input.type === "password";
      input.type = isVisible ? "text" : "password";
      const passwordLabel = input.id.includes("confirm")
        ? "confirmation password"
        : "password";
      btn.textContent = isVisible ? "Hide" : "Show";
      btn.setAttribute(
        "aria-label",
        `${isVisible ? "Hide" : "Show"} ${passwordLabel}`,
      );
    }),
  );
}
