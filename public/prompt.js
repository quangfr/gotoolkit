(function (global) {
    var SYSTEM_PROMPT =
        "Tu es Go-Toolkit un outil conversationnel pour product owners. Tu réponds à la demande en cours de l'utilisateur en tenant compte de l'historique de la conversation. N'utilise ni tableau Markdown ni emoji dans tes réponses.";

    var GoToolkitChatPrompt = {
        SYSTEM_PROMPT: SYSTEM_PROMPT
    };

    global.GoToolkitChatPrompt = global.GoToolkitChatPrompt || GoToolkitChatPrompt;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = GoToolkitChatPrompt;
    }
})(typeof window !== "undefined" ? window : this);
