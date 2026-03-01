(function () {
    if (!("serviceWorker" in navigator)) return;
    const reloadFlag = "goToolkit.swCleared";
    const shouldReload = !sessionStorage.getItem(reloadFlag);
    let unregistered = false;
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
            const scope = reg.scope || "";
            const scriptUrl = reg.active && reg.active.scriptURL ? reg.active.scriptURL : "";
            const isMobileScope = scope.endsWith("/mobile") || scope.endsWith("/mobile/");
            if (!isMobileScope && scriptUrl.endsWith("/sw.js")) {
                unregistered = true;
                reg.unregister();
            }
        });
        if (unregistered && "caches" in window) {
            return caches.keys().then((keys) => {
                return Promise.all(keys.map((key) => {
                    if (key.indexOf("go-toolkit-mobile") === 0) {
                        return caches.delete(key);
                    }
                    return Promise.resolve();
                }));
            });
        }
        return null;
    }).then(() => {
        if (unregistered && shouldReload) {
            sessionStorage.setItem(reloadFlag, "1");
            window.location.reload();
        }
    }).catch(() => {
        // noop
    });
})();
