(function () {
    if (!window.history.replaceState) {
        return;
    }
    const url = new URL(window.location.href);
    if (!url.searchParams.has("v")) {
        return;
    }
    url.searchParams.delete("v");
    window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash
    );
})();
