(function(window) {
    "use strict";

    var config = window.LocalAiConfig;
    var KEYS = config.STORAGE_KEYS;

    function loadPresets() {
        var stored = readJson(KEYS.presets, null);
        if (Array.isArray(stored)) {
            return stored.map(normalizePreset).filter(Boolean);
        }
        var presets = defaultPresets();
        savePresets(presets);
        return presets.map(normalizePreset).filter(Boolean);
    }

    function savePresets(presets) {
        localStorage.setItem(KEYS.presets, JSON.stringify(presets.map(normalizePreset).filter(Boolean)));
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
        localStorage.setItem(activeKey(kind), id);
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
        var sameKind = presets.filter(function(preset) {
            return preset.kind === target.kind;
        });
        if (sameKind.length <= 1) {
            throw new Error("至少保留一个同类预设。");
        }
        presets = presets.filter(function(preset) {
            return preset.id !== id;
        });
        savePresets(presets);
        if (localStorage.getItem(activeKey(target.kind)) === id) {
            setActivePreset(target.kind, presets.find(function(preset) {
                return preset.kind === target.kind;
            }).id);
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
            provider: preset.provider,
            endpoint: preset.endpoint,
            model: preset.model || "",
            openaiApi: preset.openaiApi || "chat"
        });
    }

    function apiKeyForPreset(preset) {
        return preset && preset.apiKey ? preset.apiKey : "";
    }

    function newPreset(kind) {
        var base = kind === "image" ? config.DEFAULT_IMAGE_PRESETS[0] : config.DEFAULT_CHAT_PRESETS[0];
        return normalizePreset(Object.assign({}, base, {
            id: kind + "-" + Date.now() + "-" + Math.random().toString(16).slice(2),
            name: kind === "image" ? "新图片预设" : "新聊天预设",
            apiKey: ""
        }));
    }

    function activeKey(kind) {
        return kind === "image" ? KEYS.activeImagePreset : KEYS.activeChatPreset;
    }

    function defaultPresets() {
        return config.DEFAULT_CHAT_PRESETS.concat(config.DEFAULT_IMAGE_PRESETS).map(function(preset) {
            return Object.assign({}, preset);
        });
    }

    function normalizePreset(preset) {
        if (!preset || !preset.kind) {
            return null;
        }
        var isImage = preset.kind === "image";
        var provider = isImage ? config.getImageProvider(preset.provider) : config.getProvider(preset.provider);
        return {
            id: preset.id || preset.kind + "-" + Date.now(),
            name: preset.name || provider.label,
            kind: isImage ? "image" : "chat",
            provider: preset.provider || (isImage ? "openaiImages" : "lmstudio"),
            endpoint: preset.endpoint || provider.defaultAddress || "",
            apiKey: preset.apiKey || "",
            model: preset.model || provider.defaultModel || "",
            openaiApi: preset.openaiApi || "chat"
        };
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
        apiKeyForPreset: apiKeyForPreset,
        newPreset: newPreset
    };
})(window);
