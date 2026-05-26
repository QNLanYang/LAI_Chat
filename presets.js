(function(window) {
    "use strict";

    var config = window.LocalAiConfig;
    var secrets = window.LocalAiSecrets || {
        normalizeApiKey: function(value) {
            return String(value || "").trim().replace(/^Bearer\s+/i, "").trim();
        }
    };
    var KEYS = config.STORAGE_KEYS;

    function loadPresets() {
        var stored = readJson(KEYS.presets, null);
        if (Array.isArray(stored)) {
            var normalized = normalizePresetList(stored);
            if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
                savePresets(normalized);
            }
            return normalized;
        }
        var presets = defaultPresets();
        savePresets(presets);
        return presets.map(normalizePreset).filter(Boolean);
    }

    function savePresets(presets) {
        localStorage.setItem(KEYS.presets, JSON.stringify(presets.map(normalizePreset).filter(Boolean)));
    }

    function normalizePresetList(presets) {
        return ensureDefaultKinds(expandLegacyChatPresets(presets).map(normalizePreset).filter(Boolean));
    }

    function expandLegacyChatPresets(presets) {
        var expanded = [];
        presets.forEach(function(preset) {
            if (isLegacyChatProviderPreset(preset)) {
                expanded.push(Object.assign({}, preset, {
                    id: "provider-" + (preset.id || Date.now()),
                    kind: "provider",
                    name: preset.name || "接入配置"
                }));
                if (!hasChatPresetFields(preset)) {
                    return;
                }
            }
            expanded.push(preset);
        });
        return expanded;
    }

    function isLegacyChatProviderPreset(preset) {
        return preset &&
            preset.kind === "chat" &&
            (
                preset.provider ||
                preset.endpoint ||
                preset.apiKey ||
                preset.openaiApi ||
                preset.responseImageGeneration
            );
    }

    function hasChatPresetFields(preset) {
        return preset &&
            (
                preset.systemPrompt ||
                preset.temperature !== undefined ||
                preset.maxTokens !== undefined ||
                preset.topP !== undefined ||
                preset.topK !== undefined ||
                preset.minP !== undefined ||
                preset.repeatPenalty !== undefined ||
                preset.presencePenalty !== undefined ||
                preset.frequencyPenalty !== undefined ||
                preset.reasoning ||
                preset.stream !== undefined
            );
    }

    function ensureDefaultKinds(presets) {
        ["provider", "chat", "image"].forEach(function(kind) {
            if (!presets.some(function(preset) {
                return preset.kind === kind;
            })) {
                presets.push(normalizePreset(defaultPresetForKind(kind)));
            }
        });
        return presets.filter(Boolean);
    }

    function presetsByKind(kind) {
        return loadPresets().filter(function(preset) {
            return preset.kind === kind;
        });
    }

    function getActivePreset(kind) {
        var presets = presetsByKind(kind);
        if (!presets.length) {
            return null;
        }
        var activeId = localStorage.getItem(activeKey(kind));
        return presets.find(function(preset) {
            return preset.id === activeId;
        }) || presets[0];
    }

    function setActivePreset(kind, id) {
        if (id) {
            localStorage.setItem(activeKey(kind), id);
        } else {
            localStorage.removeItem(activeKey(kind));
        }
    }

    function upsertPreset(preset) {
        var presets = loadPresets();
        var normalized = normalizePreset(preset);
        if (!normalized) {
            return presets;
        }
        var index = presets.findIndex(function(item) {
            return item.id === normalized.id;
        });
        if (index === -1) {
            presets.push(normalized);
        } else {
            presets[index] = normalized;
        }
        savePresets(presets);
        return presets;
    }

    function deletePreset(id) {
        var presets = loadPresets();
        var target = presets.find(function(preset) {
            return preset.id === id;
        });
        if (!target) {
            return presets;
        }
        presets = presets.filter(function(preset) {
            return preset.id !== id;
        });
        savePresets(presets);
        if (localStorage.getItem(activeKey(target.kind)) === id) {
            var nextActive = presets.find(function(preset) {
                return preset.kind === target.kind;
            });
            setActivePreset(target.kind, nextActive ? nextActive.id : "");
        }
        return presets;
    }

    function updateActivePreset(kind, updater) {
        var active = getActivePreset(kind);
        if (!active) {
            return null;
        }
        var next = Object.assign({}, active);
        updater(next);
        upsertPreset(next);
        return next;
    }

    function applyChatPreset(settings, preset) {
        if (!preset) {
            return Object.assign({}, settings);
        }
        return Object.assign({}, settings, {
            systemPrompt: preset.systemPrompt || "",
            temperature: normalizeNumber(preset.temperature, 0, 2, config.DEFAULT_SETTINGS.temperature),
            maxTokens: normalizeTokenLimit(preset.maxTokens),
            topP: normalizeOptionalNumber(preset.topP, 0, 1),
            topK: normalizeOptionalInteger(preset.topK, 0),
            minP: normalizeOptionalNumber(preset.minP, 0, 1),
            repeatPenalty: normalizeOptionalNumber(preset.repeatPenalty, 0, 4),
            presencePenalty: normalizeOptionalNumber(preset.presencePenalty, -2, 2),
            frequencyPenalty: normalizeOptionalNumber(preset.frequencyPenalty, -2, 2),
            reasoning: preset.reasoning || "auto",
            stream: preset.stream !== false
        });
    }

    function applyProviderPreset(settings, preset) {
        if (!preset) {
            return Object.assign({}, settings);
        }
        var provider = config.getProvider(preset.provider);
        var openaiApi = normalizeOpenAiApi(provider, preset.openaiApi);
        return Object.assign({}, settings, {
            provider: preset.provider || "",
            endpoint: preset.endpoint || "",
            openaiApi: openaiApi
        });
    }

    function apiKeyForProviderPreset(preset) {
        return preset && preset.apiKey ? preset.apiKey : "";
    }

    function apiKeyForPreset(preset) {
        return apiKeyForProviderPreset(preset);
    }

    function newPreset(kind) {
        var base = defaultPresetForKind(kind);
        return normalizePreset(Object.assign({}, base, {
            id: kind + "-" + Date.now() + "-" + Math.random().toString(16).slice(2),
            name: defaultPresetName(kind),
            apiKey: ""
        }));
    }

    function activeKey(kind) {
        if (kind === "image") {
            return KEYS.activeImagePreset;
        }
        if (kind === "provider") {
            return KEYS.activeProviderPreset;
        }
        return KEYS.activeChatPreset;
    }

    function defaultPresetForKind(kind) {
        if (kind === "image") {
            return config.DEFAULT_IMAGE_PRESETS[0];
        }
        if (kind === "provider") {
            return config.DEFAULT_PROVIDER_PRESETS[0];
        }
        return config.DEFAULT_CHAT_PRESETS[0];
    }

    function defaultPresetName(kind) {
        if (kind === "image") {
            return "新图片预设";
        }
        if (kind === "provider") {
            return "新接入配置";
        }
        return "新聊天预设";
    }

    function defaultPresets() {
        return config.DEFAULT_PROVIDER_PRESETS.concat(config.DEFAULT_CHAT_PRESETS, config.DEFAULT_IMAGE_PRESETS).map(function(preset) {
            return Object.assign({}, preset);
        });
    }

    function normalizePreset(preset) {
        if (!preset || !preset.kind) {
            return null;
        }
        var isImage = preset.kind === "image";
        var isProvider = preset.kind === "provider";
        var providerKey = preset.provider || "";
        var provider = isImage ? config.getImageProvider(providerKey) : config.getProvider(providerKey);
        var endpoint = preset.endpoint || "";
        if (isProvider && provider.defaultScheme === "auto" && provider.defaultAddress && config.isDefaultAddress(providerKey, endpoint)) {
            endpoint = provider.defaultAddress;
        }
        var normalized = {
            id: preset.id || preset.kind + "-" + Date.now(),
            name: preset.name || defaultPresetName(preset.kind),
            kind: isImage ? "image" : isProvider ? "provider" : "chat"
        };
        if (isProvider || isImage) {
            normalized.provider = providerKey;
            normalized.endpoint = endpoint;
            normalized.apiKey = secrets.normalizeApiKey(preset.apiKey);
        }
        if (isProvider) {
            normalized.openaiApi = normalizeOpenAiApi(provider, preset.openaiApi);
            normalized.responseImageGeneration = Boolean(
                provider.mode === "openai" &&
                provider.supportsResponses !== false &&
                normalized.openaiApi === "responses" &&
                preset.responseImageGeneration
            );
        }
        if (!isImage && !isProvider) {
            normalized.systemPrompt = preset.systemPrompt || "";
            normalized.temperature = normalizeNumber(preset.temperature, 0, 2, config.DEFAULT_SETTINGS.temperature);
            normalized.maxTokens = normalizeTokenLimit(preset.maxTokens);
            normalized.topP = normalizeOptionalNumber(preset.topP, 0, 1);
            normalized.topK = normalizeOptionalInteger(preset.topK, 0);
            normalized.minP = normalizeOptionalNumber(preset.minP, 0, 1);
            normalized.repeatPenalty = normalizeOptionalNumber(preset.repeatPenalty, 0, 4);
            normalized.presencePenalty = normalizeOptionalNumber(preset.presencePenalty, -2, 2);
            normalized.frequencyPenalty = normalizeOptionalNumber(preset.frequencyPenalty, -2, 2);
            normalized.reasoning = preset.reasoning || "auto";
            normalized.stream = preset.stream !== false;
        }
        if (isImage) {
            normalized.model = preset.model || "";
            normalized.sizeMode = preset.sizeMode === "custom" ? "custom" : "native";
            normalized.nativeSize = isValidNativeSize(preset.nativeSize) ? preset.nativeSize : "auto";
            normalized.imageQuality = isValidImageQuality(preset.imageQuality) ? preset.imageQuality : "auto";
            normalized.imageBackground = isValidImageBackground(preset.imageBackground) ? preset.imageBackground : "auto";
            normalized.outputFormat = isValidOutputFormat(preset.outputFormat) ? preset.outputFormat : "png";
            normalized.outputCompression = normalizeOutputCompression(preset.outputCompression);
            normalized.partialImages = preset.imageStream ? normalizePartialImages(preset.partialImages) : null;
            normalized.imageStream = Boolean(normalized.partialImages);
            normalized.moderation = isValidModeration(preset.moderation) ? preset.moderation : "auto";
            normalized.resolution = normalizeImageResolution(preset.resolution);
            normalized.aspect = isValidAspect(preset.aspect) ? preset.aspect : "1:1";
        }
        return normalized;
    }

    function isValidResolution(value) {
        return ["720p", "1080p", "2k", "4k"].indexOf(value) !== -1;
    }

    function normalizeImageResolution(value) {
        if (value === "1k") {
            return "720p";
        }
        if (value === "1_9k") {
            return "1080p";
        }
        return isValidResolution(value) ? value : "720p";
    }

    function isValidAspect(value) {
        return ["1:1", "3:4", "2:3", "9:16", "4:3", "3:2", "16:9"].indexOf(value) !== -1;
    }

    function isValidNativeSize(value) {
        return ["auto", "1024x1024", "1536x1024", "1024x1536"].indexOf(value) !== -1;
    }

    function isValidImageQuality(value) {
        return ["auto", "low", "medium", "high"].indexOf(value) !== -1;
    }

    function isValidImageBackground(value) {
        return ["auto", "transparent", "opaque"].indexOf(value) !== -1;
    }

    function isValidOutputFormat(value) {
        return ["png", "jpeg", "webp"].indexOf(value) !== -1;
    }

    function normalizeOutputCompression(value) {
        var number = parseInt(value, 10);
        if (!Number.isFinite(number)) {
            return 100;
        }
        return Math.min(100, Math.max(0, number));
    }

    function normalizePartialImages(value) {
        var number = parseInt(value, 10);
        if (!Number.isFinite(number) || number <= 0) {
            return null;
        }
        return Math.min(3, number);
    }

    function isValidModeration(value) {
        return ["auto", "low"].indexOf(value) !== -1;
    }

    function normalizeOpenAiApi(provider, value) {
        return provider.mode === "openai" &&
            provider.supportsResponses !== false &&
            value === "responses" ?
            "responses" :
            "chat";
    }

    function normalizeNumber(value, min, max, fallback) {
        var number = parseFloat(value);
        if (!Number.isFinite(number)) {
            return fallback;
        }
        return Math.min(max, Math.max(min, number));
    }

    function normalizeTokenLimit(value) {
        var number = parseInt(value, 10);
        if (!Number.isFinite(number) || number < 0) {
            return 0;
        }
        return number;
    }

    function normalizeOptionalNumber(value, min, max) {
        if (value === "" || value === null || value === undefined) {
            return null;
        }
        var number = parseFloat(value);
        if (!Number.isFinite(number)) {
            return null;
        }
        return Math.min(max, Math.max(min, number));
    }

    function normalizeOptionalInteger(value, min) {
        if (value === "" || value === null || value === undefined) {
            return null;
        }
        var number = parseInt(value, 10);
        if (!Number.isFinite(number)) {
            return null;
        }
        return Math.max(min, number);
    }

    function readJson(key, fallback) {
        try {
            var value = JSON.parse(localStorage.getItem(key) || "null");
            return value === null ? fallback : value;
        } catch (error) {
            return fallback;
        }
    }

    window.LocalAiPresets = {
        loadPresets: loadPresets,
        savePresets: savePresets,
        presetsByKind: presetsByKind,
        getActivePreset: getActivePreset,
        setActivePreset: setActivePreset,
        upsertPreset: upsertPreset,
        deletePreset: deletePreset,
        updateActivePreset: updateActivePreset,
        applyChatPreset: applyChatPreset,
        applyProviderPreset: applyProviderPreset,
        apiKeyForProviderPreset: apiKeyForProviderPreset,
        apiKeyForPreset: apiKeyForPreset,
        newPreset: newPreset
    };
})(window);
