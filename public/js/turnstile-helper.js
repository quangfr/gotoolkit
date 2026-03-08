(function (global) {
    const EMPTY_SUMMARY = Object.freeze({
        stage: "disabled",
        message: "Turnstile is disabled."
    });

    function getHeadersForUrl() {
        return Promise.resolve({});
    }

    function getTokenForUrl() {
        return Promise.resolve("");
    }

    function getLastAttemptSummary() {
        return { ...EMPTY_SUMMARY };
    }

    function getFailureSummary() {
        return "";
    }

    function getDiagnostics() {
        return [];
    }

    function clearDiagnostics() {
        return;
    }

    function shouldProtectUrl() {
        return false;
    }

    global.GoToolkitTurnstile = {
        getSiteKey: function () {
            return "";
        },
        shouldProtectUrl,
        getTokenForUrl,
        getHeadersForUrl,
        getLastAttemptSummary,
        getFailureSummary,
        getDiagnostics,
        clearDiagnostics
    };
})(window);
