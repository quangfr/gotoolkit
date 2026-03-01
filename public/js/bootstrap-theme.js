(function () {
    const storedTheme = localStorage.getItem("go-toolkit-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = storedTheme || (prefersDark ? "dark" : "cream");
    const resolvedTheme = theme === "auto" ? (prefersDark ? "dark" : "cream") : theme;
    document.documentElement.setAttribute("data-theme", resolvedTheme);
})();
