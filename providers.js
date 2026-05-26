(function(window) {
    "use strict";

    var STORAGE_KEYS = window.LocalAiStorage && window.LocalAiStorage.KEYS || {};

    var EMPTY_CHAT_PROVIDER = {
        label: "未配置",
        mode: "none",
        defaultAddress: "",
        defaultScheme: "https",
        modelsPath: "",
        chatPath: "",
        supportsResponses: false
    };

    var EMPTY_IMAGE_PROVIDER = {
        label: "未配置",
        mode: "none",
        defaultAddress: "",
        defaultScheme: "https",
        modelsPath: "",
        generationPath: "",
        editPath: "",
        defaultModel: "",
        imageSizeMode: "prompt",
        nativeSizes: [],
        qualityOptions: [],
        backgroundOptions: []
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
            responsesPath: "/responses",
            supportsResponses: true
        },
        gemini: {
            label: "Gemini OpenAI-compatible",
            mode: "openai",
            defaultAddress: "https://generativelanguage.googleapis.com/v1beta/openai/",
            defaultScheme: "https",
            modelsPath: "/models",
            chatPath: "/chat/completions",
            responsesPath: "",
            supportsResponses: false
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
            defaultModel: "gpt-image-2",
            imageSizeMode: "model",
            nativeSizes: ["auto", "1024x1024", "1536x1024", "1024x1536"],
            qualityOptions: ["auto", "low", "medium", "high"],
            backgroundOptions: ["auto", "transparent", "opaque"],
            outputFormatOptions: ["png", "jpeg", "webp"],
            moderationOptions: ["auto", "low"]
        },
        geminiImages: {
            label: "Gemini / Nano Banana",
            mode: "geminiImages",
            defaultAddress: "https://generativelanguage.googleapis.com/v1beta",
            defaultScheme: "https",
            modelsPath: "/models",
            generationPath: "/models/{model}:generateContent",
            defaultModel: "gemini-2.5-flash-image",
            imageSizeMode: "prompt",
            nativeSizes: [],
            qualityOptions: [],
            backgroundOptions: [],
            outputFormatOptions: [],
            moderationOptions: []
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
            defaultModel: "gpt-image-2",
            imageSizeMode: "model",
            nativeSizes: ["auto", "1024x1024", "1536x1024", "1024x1536"],
            qualityOptions: ["auto", "low", "medium", "high"],
            backgroundOptions: ["auto", "transparent", "opaque"],
            outputFormatOptions: ["png", "jpeg", "webp"],
            moderationOptions: ["auto", "low"]
        }
    };

    var DEFAULT_SETTINGS = {
        provider: "",
        endpoint: "",
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

    var DEFAULT_PROVIDER_PRESETS = [
        {
            id: "provider-unconfigured",
            name: "未配置接入配置",
            kind: "provider",
            provider: "",
            endpoint: "",
            apiKey: "",
            openaiApi: "chat",
            responseImageGeneration: false
        }
    ];

    var DEFAULT_CHAT_PRESETS = [
        {
            id: "chat-default",
            name: "默认聊天预设",
            kind: "chat",
            systemPrompt: "",
            temperature: 0.7,
            maxTokens: 0,
            topP: null,
            topK: null,
            minP: null,
            repeatPenalty: null,
            presencePenalty: null,
            frequencyPenalty: null,
            reasoning: "auto",
            stream: true
        }
    ];

    var DEFAULT_IMAGE_PRESETS = [
        {
            id: "image-unconfigured",
            name: "未配置图片预设",
            kind: "image",
            provider: "",
            endpoint: "",
            apiKey: "",
            model: "",
            sizeMode: "native",
            nativeSize: "auto",
            imageQuality: "auto",
            imageBackground: "auto",
            outputFormat: "png",
            outputCompression: 100,
            imageStream: false,
            partialImages: null,
            moderation: "auto",
            resolution: "720p",
            aspect: "1:1"
        }
    ];

    function getProvider(key) {
        return PROVIDERS[key] || EMPTY_CHAT_PROVIDER;
    }

    function getImageProvider(key) {
        return IMAGE_PROVIDERS[key] || EMPTY_IMAGE_PROVIDER;
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
        if (provider.mode === "openai" && settings.openaiApi === "responses" && provider.supportsResponses !== false) {
            return provider.responsesPath;
        }
        return provider.chatPath;
    }

    function requestUrlFor(settings, type) {
        var provider = getProvider(settings.provider);
        var path = requestPathFor(settings, type);
        var base = normalizeAddress(settings.endpoint, settings.provider);
        return endpointFor(stripConflictingRequestPath(base, provider, path), path);
    }

    function stripConflictingRequestPath(base, provider, desiredPath) {
        var paths = [provider.modelsPath, provider.chatPath, provider.responsesPath].filter(Boolean);
        var result = base || "";
        paths.forEach(function(path) {
            if (path === desiredPath) {
                return;
            }
            result = stripPathSuffix(result, path);
        });
        return result;
    }

    function stripPathSuffix(base, path) {
        var cleanBase = (base || "").replace(/\/+$/, "");
        var cleanPath = (path || "").replace(/\/+$/, "");
        if (!cleanBase || !cleanPath) {
            return base;
        }
        if (cleanBase.toLowerCase().endsWith(cleanPath.toLowerCase())) {
            return cleanBase.slice(0, -cleanPath.length).replace(/\/+$/, "");
        }
        return base;
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
        if (provider.mode === "none") {
            return "请先选择接入类型";
        }
        if (provider.defaultAddress) {
            return provider.defaultAddress;
        }
        return provider.mode === "anthropic" ? "api.anthropic.com" : "api.example.com";
    }

    function imageAddressPlaceholderFor(providerKey) {
        var provider = getImageProvider(providerKey);
        if (provider.mode === "none") {
            return "请先选择接入类型";
        }
        return provider.defaultAddress || "api.example.com";
    }

    window.LocalAiConfig = {
        STORAGE_KEYS: STORAGE_KEYS,
        PROVIDERS: PROVIDERS,
        IMAGE_PROVIDERS: IMAGE_PROVIDERS,
        EMPTY_CHAT_PROVIDER: EMPTY_CHAT_PROVIDER,
        EMPTY_IMAGE_PROVIDER: EMPTY_IMAGE_PROVIDER,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        DEFAULT_PROVIDER_PRESETS: DEFAULT_PROVIDER_PRESETS,
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
