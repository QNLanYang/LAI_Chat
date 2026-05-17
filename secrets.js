(function(window) {
    "use strict";

    function normalizeApiKey(value) {
        var text = String(value || "").trim();
        text = text.replace(/^Bearer\s+/i, "").trim();
        if (
            (text.charAt(0) === "\"" && text.charAt(text.length - 1) === "\"") ||
            (text.charAt(0) === "'" && text.charAt(text.length - 1) === "'")
        ) {
            text = text.slice(1, -1).trim();
        }
        return text;
    }

    function apiKeyForHeader(value, label) {
        var key = normalizeApiKey(value);
        if (!key) {
            return "";
        }
        if (/[^\x20-\x7e]/.test(key)) {
            throw new Error((label || "API Key") + " 包含非法字符。请重新粘贴纯文本密钥，不要包含中文、换行、emoji、全角空格或说明文字。");
        }
        return key;
    }

    window.LocalAiSecrets = {
        normalizeApiKey: normalizeApiKey,
        apiKeyForHeader: apiKeyForHeader
    };
})(window);
