(function(window) {
    "use strict";

    var STORAGE_KEYS = {
        chats: "qnlanyang.localAi.chats.v1",
        settings: "qnlanyang.localAi.settings.v1",
        apiKey: "qnlanyang.localAi.apiKey.local"
    };

    var PROVIDERS = {
        lmstudio: {
            label: "LM Studio REST v1",
            mode: "lmstudioRest",
            defaultAddress: "http://localhost:1234",
            defaultScheme: "http",
            modelsPath: "/api/v1/models",
            chatPath: "/api/v1/chat"
        },
        ollama: {
            label: "Ollama",
            mode: "ollama",
            defaultAddress: "http://localhost:11434",
            defaultScheme: "http",
            modelsPath: "/api/tags",
            chatPath: "/api/chat"
        },
        openai: {
            label: "OpenAI-compatible",
            mode: "openai",
            defaultAddress: "",
            defaultScheme: "https",
            versionPath: "/v1",
            modelsPath: "/models",
            chatPath: "/chat/completions",
            responsesPath: "/responses"
        },
        anthropic: {
            label: "Anthropic-compatible",
            mode: "anthropic",
            defaultAddress: "",
            defaultScheme: "https",
            versionPath: "/v1",
            modelsPath: "/models",
            chatPath: "/messages"
        }
    };

    var DEFAULT_SETTINGS = {
        provider: "lmstudio",
        endpoint: PROVIDERS.lmstudio.defaultAddress,
        model: "",
        openaiApi: "chat",
        reasoning: "auto",
        systemPrompt: "",
        temperature: 0.7,
        maxTokens: 2048,
        stream: true
    };

    function getProvider(key) {
        return PROVIDERS[key] || PROVIDERS.lmstudio;
    }

    function hasScheme(value) {
        return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    }

    function needsVersionBase(provider) {
        return Boolean(provider.versionPath);
    }

    function normalizeAddress(value, providerKey) {
        var provider = getProvider(providerKey);
        var raw = (value || "").trim();
        if (!raw) {
            return "";
        }

        var withScheme = hasScheme(raw) ? raw : defaultSchemeFor(raw, provider) + "://" + raw;
        try {
            var url = new URL(withScheme);
            url.hash = "";
            url.search = "";
            if (needsVersionBase(provider)) {
                ensureVersionPath(url, provider.versionPath);
            }
            return formatUrl(url, needsVersionBase(provider));
        } catch (error) {
            return normalizeAddressFallback(withScheme, provider);
        }
    }

    function ensureVersionPath(url, versionPath) {
        var cleanVersion = versionPath.replace(/\/+$/, "");
        var path = (url.pathname || "/").replace(/\/+$/, "");
        if (!path || path === "/") {
            url.pathname = cleanVersion + "/";
            return;
        }
        if (path.toLowerCase().endsWith(cleanVersion.toLowerCase())) {
            url.pathname = path + "/";
            return;
        }
        if (path.toLowerCase().indexOf(cleanVersion.toLowerCase() + "/") !== -1) {
            url.pathname = path + "/";
            return;
        }
        url.pathname = path + cleanVersion + "/";
    }

    function formatUrl(url, keepVersionSlash) {
        var text = url.toString().replace(/\/+$/, "");
        var path = url.pathname.replace(/\/+$/, "");
        if (keepVersionSlash && /\/v1$/i.test(path)) {
            return text + "/";
        }
        return text;
    }

    function normalizeAddressFallback(value, provider) {
        var text = value.replace(/\s+/g, "").replace(/\/+$/, "");
        if (needsVersionBase(provider)) {
            var cleanVersion = provider.versionPath.replace(/\/+$/, "");
            var lower = text.toLowerCase();
            if (!lower.endsWith(cleanVersion.toLowerCase()) && lower.indexOf(cleanVersion.toLowerCase() + "/") === -1) {
                text += cleanVersion;
            }
            if (text.toLowerCase().endsWith(cleanVersion.toLowerCase())) {
                text += "/";
            }
        }
        return text;
    }

    function defaultSchemeFor(value, provider) {
        if (provider.defaultScheme !== "https") {
            return provider.defaultScheme;
        }
        return isLocalAddress(value) ? "http" : provider.defaultScheme;
    }

    function isLocalAddress(value) {
        var host = extractHost(value).toLowerCase();
        return host === "localhost" ||
            host === "127.0.0.1" ||
            host === "::1" ||
            host.indexOf("127.") === 0 ||
            host.indexOf("192.168.") === 0 ||
            host.indexOf("10.") === 0 ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    }

    function extractHost(value) {
        var text = (value || "").trim();
        if (!text) {
            return "";
        }
        try {
            return new URL(hasScheme(text) ? text : "http://" + text).hostname.replace(/^\[|\]$/g, "");
        } catch (error) {
            return text.replace(/^\[|\]$/g, "").split("/")[0].split(":")[0];
        }
    }

    function endpointFor(base, path) {
        var cleanBase = (base || "").replace(/\/+$/, "");
        if (!cleanBase) {
            return "";
        }
        if (cleanBase.endsWith(path)) {
            return cleanBase;
        }
        if (cleanBase.endsWith("/api/v1") && path.indexOf("/api/v1/") === 0) {
            return cleanBase + path.slice("/api/v1".length);
        }
        return cleanBase + path;
    }

    function requestPathFor(settings, type) {
        var provider = getProvider(settings.provider);
        if (type === "models") {
            return provider.modelsPath;
        }
        if (provider.mode === "openai" && settings.openaiApi === "responses") {
            return provider.responsesPath;
        }
        return provider.chatPath;
    }

    function requestUrlFor(settings, type) {
        var base = normalizeAddress(settings.endpoint, settings.provider);
        return endpointFor(base, requestPathFor(settings, type));
    }

    function isDefaultAddress(providerKey, value) {
        var provider = getProvider(providerKey);
        if (!provider.defaultAddress || !value) {
            return false;
        }
        return normalizeAddress(value, providerKey) === normalizeAddress(provider.defaultAddress, providerKey);
    }

    function addressPlaceholderFor(providerKey) {
        var provider = getProvider(providerKey);
        if (provider.defaultAddress) {
            return provider.defaultAddress;
        }
        return provider.mode === "anthropic" ? "api.anthropic.com" : "api.example.com";
    }

    function hostLabelFor(value, providerKey) {
        var address = normalizeAddress(value, providerKey);
        if (!address) {
            return "";
        }
        try {
            var url = new URL(address);
            return url.host + " (" + url.protocol.replace(":", "") + ")";
        } catch (error) {
            return address;
        }
    }

    window.LocalAiConfig = {
        STORAGE_KEYS: STORAGE_KEYS,
        PROVIDERS: PROVIDERS,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        getProvider: getProvider,
        normalizeAddress: normalizeAddress,
        endpointFor: endpointFor,
        requestPathFor: requestPathFor,
        requestUrlFor: requestUrlFor,
        isDefaultAddress: isDefaultAddress,
        addressPlaceholderFor: addressPlaceholderFor,
        hostLabelFor: hostLabelFor
    };
})(window);
