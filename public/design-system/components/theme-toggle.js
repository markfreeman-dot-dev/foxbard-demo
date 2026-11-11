/* Foxbard theme toggle. Put <div class="fb-themes" data-fb-themes></div> anywhere; this fills it.
   Sets data-theme on <html> (dark | white | paper), remembers the choice per viewer when storage works.
   Default comes from <html data-theme-default="..."> or falls back to dark. */
(function () {
  var KEY = "fb-theme", THEMES = [["dark", "Dark"], ["white", "White"], ["paper", "Paper"]];
  var root = document.documentElement;
  var fallback = root.getAttribute("data-theme-default") || "dark";
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function apply(v) {
    if (!THEMES.some(function (t) { return t[0] === v; })) v = fallback;
    root.setAttribute("data-theme", v);
    document.querySelectorAll("[data-fb-themes] button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.theme === v)); });
  }
  function mount() {
    document.querySelectorAll("[data-fb-themes]").forEach(function (box) {
      box.setAttribute("role", "group"); box.setAttribute("aria-label", "Theme");
      box.innerHTML = THEMES.map(function (t) { return '<button type="button" data-theme="' + t[0] + '">' + t[1] + "</button>"; }).join("");
      box.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; write(b.dataset.theme); apply(b.dataset.theme); });
    });
    apply(read() || fallback);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
