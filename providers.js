(function(window) {
    "use strict";

    var STORAGE_KEYS = {
        chats: "qnlanyang.localAi.chats.v1",
        settings: "qnlanyang.localAi.settings.v1",
        apiKey: "qnlanyang.localAi.apiKey.local",
        presets: "qnlanyang.localAi.providerPresets.v1",
        activeChatPreset: "qnlanyang.localAi.activeChatPreset.v1",
        activeImagePreset: "qnlanyang.localAi.activeImagePreset.v1",
        imageJobs: "qnlanyang.localAi.imageJobs.v1",
        theme: "qnlanyang.localAi.theme.v1"
    };

    var PROVIDERS = {
        lmstudio: {
            label: "LM Studio REST v1",
            mode: "lmstudioRest",
            defaultAddress: "localhost:1234",
            defaultScheme: "auto",
            modelsPath: "/api/v1/models",
            chatPath: "/api/v1/chat"
        },
        ollama: {
            label: "Ollama",
            mode: "ollama",
            defaultAddress: "localhost:11434",
            defaultScheme: "auto",
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

    var IMAGE_PROVIDERS = {
        openaiImages: {
            label: "OpenAI Images",
            mode: "openaiImages",
            defaultAddress: "https://api.openai.com/v1/",
            defaultScheme: "https",
            versionPath: "/v1",
            modelsPath: "/models",
            generationPath: "/images/generations",
            editPath: "/images/edits",
            defaultModel: "gpt-image-2"
        },
        geminiImages: {
            label: "Gemini / Nano Banana",
            mode: "geminiImages",
            defaultAddress: "https://generativelanguage.googleapis.com/v1beta",
            defaultScheme: "https",
            modelsPath: "/models",
            generationPath: "/models/{model}:generateContent",
            defaultModel: "gemini-2.5-flash-image"
        },
        customOpenAiImages: {
            label: "OpenAI Images-compatible",
            mode: "openaiImages",
            defaultAddress: "",
            defaultScheme: "https",
            versionPath: "/v1",
            modelsPath: "/models",
            generationPath: "/images/generations",
            editPath: "/images/edits",
            defaultModel: "gpt-image-2"
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
        maxTokens: 0,
        topP: null,
        topK: null,
        minP: null,
        repeatPenalty: null,
        presencePenalty: null,
        frequencyPenalty: null,
        stream: true
    };

    var DEFAULT_CHAT_PRESETS = [
        {
            id: "chat-lmstudio-rest",
            name: "LM Studio REST",
            kind: "chat",
            provider: "lmstudio",
            endpoint: PROVIDERS.lmstudio.defaultAddress,
            apiKey: "",
            model: "",
            openaiApi: "chat"
        },
        {
            id: "chat-openai-compatible",
            name: "OpenAI-compatible",
            kind: "chat",
            provider: "openai",
            endpoint: "",
            apiKey: "",
            model: "",
            openaiApi: "chat"
        }
    ];

    var DEFAULT_IMAGE_PRESETS = [
        {
            id: "image-openai",
            name: "OpenAI Images",
            kind: "image",
            provider: "openaiImages",
            endpoint: IMAGE_PROVIDERS.openaiImages.defaultAddress,
            apiKey: "",
            model: IMAGE_PROVIDERS.openaiImages.defaultModel
        },
        {
            id: "image-gemini",
            name: "Gemini / Nano Banana",
            kind: "image",
            provider: "geminiImages",
            endpoint: IMAGE_PROVIDERS.geminiImages.defaultAddress,
            apiKey: "",
            model: IMAGE_PROVIDERS.geminiImages.defaultModel
        }
    ];

    function getProvider(key) {
        return PROVIDERS[key] || PROVIDERS.lmstudio;
    }

    function getImageProvider(key) {
        return IMAGE_PROVIDERS[key] || IMAGE_PROVIDERS.openaiImages;
    }

    function hasScheme(value) {
        return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    }

    function needsVersionBase(provider) {
        return Boolean(provider.versionPath);
    }

    function normalizeAddress(value, providerKey) {
        var provider = getProvider(providerKey);
        return normalizeAddressForProvider(value, provider);
    }

    function normalizeImageAddress(value, providerKey) {
        var provider = getImageProvider(providerKey);
        return normalizeAddressForProvider(value, provider);
    }

    function normalizeAddressForProvider(value, provider) {
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
        if (provider.defaultScheme === "auto") {
            return isLocalAddress(value) ? "http" : "https";
        }
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

    function imageRequestPathFor(preset, type) {
        var provider = getImageProvider(preset.provider);
        if (type === "models") {
            return provider.modelsPath || "/models";
        }
        if (provider.mode === "geminiImages") {
            return provider.generationPath.replace("{model}", encodeURIComponent(preset.model || provider.defaultModel));
        }
        if (type === "edit") {
            return provider.editPath;
        }
        return provider.generationPath;
    }

    function imageRequestUrlFor(preset, type) {
        var base = normalizeImageAddress(preset.endpoint, preset.provider);
        return endpointFor(base, imageRequestPathFor(preset, type));
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

    function imageAddressPlaceholderFor(providerKey) {
        var provider = getImageProvider(providerKey);
        return provider.defaultAddress || "api.example.com";
    }

    window.LocalAiConfig = {
        STORAGE_KEYS: STORAGE_KEYS,
        PROVIDERS: PROVIDERS,
        IMAGE_PROVIDERS: IMAGE_PROVIDERS,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        DEFAULT_CHAT_PRESETS: DEFAULT_CHAT_PRESETS,
        DEFAULT_IMAGE_PRESETS: DEFAULT_IMAGE_PRESETS,
        getProvider: getProvider,
        getImageProvider: getImageProvider,
        normalizeAddress: normalizeAddress,
        normalizeImageAddress: normalizeImageAddress,
        endpointFor: endpointFor,
        requestPathFor: requestPathFor,
        requestUrlFor: requestUrlFor,
        imageRequestUrlFor: imageRequestUrlFor,
        isDefaultAddress: isDefaultAddress,
        addressPlaceholderFor: addressPlaceholderFor,
        imageAddressPlaceholderFor: imageAddressPlaceholderFor
    };
})(window);
