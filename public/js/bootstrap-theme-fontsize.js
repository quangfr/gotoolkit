(function () {
    const storedTheme = localStorage.getItem("go-toolkit-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = storedTheme || (prefersDark ? "dark" : "cream");
    const resolvedTheme = theme === "auto" ? (prefersDark ? "dark" : "cream") : theme;
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    const storedFontSize = localStorage.getItem("go-toolkit-ui-font-size");
    const normalizedFontSize = Math.min(20, Math.max(12, Math.round(Number(storedFontSize) || 16)));
    document.documentElement.style.setProperty("--go-ui-font-size", normalizedFontSize + "px");
})();
