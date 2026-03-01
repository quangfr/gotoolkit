(function () {
    try {
        var url = new URL(window.location.href);
        var lowerPath = (url.pathname || "").toLowerCase();
        if (lowerPath.endsWith("/mobile.html")) return;
        if (url.searchParams.get("desktop") === "1") return;

        var forceMobile = url.searchParams.get("mobile") === "1";
        var ua = String(navigator.userAgent || "").toLowerCase();
        var uaMobile = /android|iphone|ipod|iemobile|windows phone|mobile/i.test(ua);
        var isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var hasTouch = Number(navigator.maxTouchPoints || 0) > 1;
        var vvWidth = Number(window.visualViewport && window.visualViewport.width) || 0;
        var innerWidth = Number(window.innerWidth) || 0;
        var screenWidth = Number(window.screen && window.screen.width) || 0;
        var isNarrow = [vvWidth, innerWidth, screenWidth].some(function (value) {
            return value > 0 && value <= 820;
        });
        var shouldRedirect = forceMobile || uaMobile || (isCoarse && hasTouch && isNarrow);
        if (!shouldRedirect) return;
        var nextUrl = new URL("/mobile.html", url.origin);
        url.searchParams.forEach(function (value, key) {
            if (key === "desktop") return;
            nextUrl.searchParams.set(key, value);
        });
        nextUrl.hash = url.hash;
        window.location.replace(nextUrl.toString());
    } catch (err) {
        // noop
    }
})();
