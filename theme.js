(function(window, document) {
    "use strict";

    var config = window.LocalAiConfig;
    var THEME_KEY = config.STORAGE_KEYS.theme;

    applyTheme(loadTheme());
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        var navs = document.querySelectorAll(".app-nav");
        navs.forEach(function(nav) {
            if (nav.querySelector("[data-theme-toggle]")) {
                return;
            }
            var button = document.createElement("button");
            button.type = "button";
            button.className = "theme-toggle";
            button.setAttribute("data-theme-toggle", "");
            button.addEventListener("click", function() {
                var next = currentTheme() === "dark" ? "light" : "dark";
                localStorage.setItem(THEME_KEY, next);
                applyTheme(next);
                updateButtons();
            });
            nav.appendChild(button);
        });
        updateButtons();
    }

    function currentTheme() {
        return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }

    function loadTheme() {
        var stored = localStorage.getItem(THEME_KEY);
        if (stored === "light" || stored === "dark") {
            return stored;
        }
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            return "dark";
        }
        return "light";
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    }

    function updateButtons() {
        var dark = currentTheme() === "dark";
        document.querySelectorAll("[data-theme-toggle]").forEach(function(button) {
            button.textContent = dark ? "浅色" : "深色";
            button.setAttribute("aria-label", dark ? "切换浅色模式" : "切换深色模式");
        });
    }
})(window, document);
