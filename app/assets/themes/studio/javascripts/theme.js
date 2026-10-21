(function () {
  var progressNames = {
    "已解决": true,
    "反馈": true,
    "Resolved": true,
    "Feedback": true
  };
  var dangerText = /删除|^Delete\b/i;

  function paintStatus(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var cells = scope.querySelectorAll("td.status, .attribute.status .value");
    Array.prototype.forEach.call(cells, function (cell) {
      if (cell.getAttribute("data-studio-status") === "1") return;
      if (cell.querySelector("input, select, textarea, .status-pill")) return;
      var text = cell.textContent.replace(/\s+/g, " ").trim();
      if (!text) return;
      var pill = document.createElement("span");
      pill.className = "status-pill";
      var row = cell.closest("tr, .issue");
      if (row && row.classList.contains("closed")) pill.classList.add("is-closed");
      else if (progressNames[text]) pill.classList.add("is-progress");
      pill.textContent = text;
      cell.textContent = "";
      cell.appendChild(pill);
      cell.setAttribute("data-studio-status", "1");
    });
  }

  function primaryLink(row) {
    return row.querySelector("td.subject a[href], td.name a[href], td.title a[href], td.login a[href]");
  }

  function markRows(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var rows = scope.querySelectorAll("table.list tbody tr, table.issues tbody tr");
    Array.prototype.forEach.call(rows, function (row) {
      if (primaryLink(row)) row.classList.add("studio-row-link");
    });
  }

  function markDanger(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll("input[type=submit], button[type=submit], a.icon-del");
    Array.prototype.forEach.call(nodes, function (node) {
      var text = (node.value || node.textContent || "").replace(/\s+/g, " ").trim();
      if (node.matches("a.icon-del") || dangerText.test(text)) node.classList.add("studio-danger");
    });
  }

  function upgradeDates() {
    if (!window.jQuery || !window.jQuery.fn.datepicker || !window.datepickerOptions) return;
    window.jQuery("input.date[type='date']").each(function () {
      if (this.getAttribute("data-studio-date") === "1") return;
      this.setAttribute("data-studio-date", "1");
      var value = this.value;
      this.type = "text";
      this.value = value;
      window.jQuery(this).datepicker(window.datepickerOptions);
    });
  }

  function paint(root) {
    paintStatus(root);
    markRows(root);
    markDanger(root);
    upgradeDates();
  }

  document.addEventListener("click", function (event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var row = event.target.closest("tr.studio-row-link");
    if (!row) return;
    if (event.target.closest("a, button, input, select, textarea, label")) return;
    var selection = window.getSelection && window.getSelection();
    if (selection && String(selection).trim()) return;
    var link = primaryLink(row);
    if (!link) return;
    window.location.href = link.href;
  });

  function boot() {
    try {
      paint(document);
    } catch (error) {
      window.__studio = String(error);
    }
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    boot();
    if (document.querySelector("[data-studio-date]") || tries > 25) clearInterval(timer);
  }, 200);
  document.addEventListener("DOMContentLoaded", boot);
  window.addEventListener("load", boot);
  if (window.jQuery) {
    window.jQuery(boot);
    window.jQuery(document).on("ajaxComplete", function () { paint(document); });
  }
})();
