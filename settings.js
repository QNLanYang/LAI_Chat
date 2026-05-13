(function() {
    "use strict";

    var config = window.LocalAiConfig;
    var presetsApi = window.LocalAiPresets;
    var elements = {};
    var state = {
        kind: "chat",
        presets: [],
        active: null
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        elements = {
            chatKindButton: document.getElementById("chatKindButton"),
            imageKindButton: document.getElementById("imageKindButton"),
            presetList: document.getElementById("presetList"),
            addPresetButton: document.getElementById("addPresetButton"),
            deletePresetButton: document.getElementById("deletePresetButton"),
            presetNameInput: document.getElementById("presetNameInput"),
            presetProviderSelect: document.getElementById("presetProviderSelect"),
            presetEndpointInput: document.getElementById("presetEndpointInput"),
            presetModelInput: document.getElementById("presetModelInput"),
            presetOpenAiApiField: document.getElementById("presetOpenAiApiField"),
            presetOpenAiApiSelect: document.getElementById("presetOpenAiApiSelect"),
            presetApiKeyInput: document.getElementById("presetApiKeyInput"),
            presetPreview: document.getElementById("presetPreview"),
            settingsFeedback: document.getElementById("settingsFeedback")
        };

        bindEvents();
        loadKind("chat");
    }

    function bindEvents() {
        elements.chatKindButton.addEventListener("click", function() {
            loadKind("chat");
        });
        elements.imageKindButton.addEventListener("click", function() {
            loadKind("image");
        });
        elements.addPresetButton.addEventListener("click", function() {
            var preset = presetsApi.newPreset(state.kind);
            presetsApi.upsertPreset(preset);
            presetsApi.setActivePreset(state.kind, preset.id);
            loadKind(state.kind);
            setFeedback("已新增预设。", "ok");
        });
        elements.deletePresetButton.addEventListener("click", function() {
            if (!state.active || !confirm("删除预设“" + state.active.name + "”？")) {
                return;
            }
            try {
                presetsApi.deletePreset(state.active.id);
                loadKind(state.kind);
                setFeedback("已删除预设。", "ok");
            } catch (error) {
                setFeedback(error.message, "error");
            }
        });
        elements.presetProviderSelect.addEventListener("change", function() {
            var provider = state.kind === "image" ?
                config.getImageProvider(elements.presetProviderSelect.value) :
                config.getProvider(elements.presetProviderSelect.value);
            elements.presetEndpointInput.value = provider.defaultAddress || "";
            elements.presetModelInput.value = provider.defaultModel || "";
            saveCurrent();
        });

        [
            elements.presetNameInput,
            elements.presetEndpointInput,
            elements.presetModelInput,
            elements.presetOpenAiApiSelect,
            elements.presetApiKeyInput
        ].forEach(function(input) {
            input.addEventListener("input", saveCurrent);
            input.addEventListener("change", saveCurrent);
        });
        elements.presetEndpointInput.addEventListener("blur", normalizeEndpoint);
    }

    function loadKind(kind) {
        state.kind = kind;
        state.presets = presetsApi.presetsByKind(kind);
        state.active = presetsApi.getActivePreset(kind);
        renderKindButtons();
        renderProviderOptions();
        renderPresetList();
        renderEditor();
    }

    function renderKindButtons() {
        elements.chatKindButton.classList.toggle("is-active", state.kind === "chat");
        elements.imageKindButton.classList.toggle("is-active", state.kind === "image");
    }

    function renderProviderOptions() {
        var providers = state.kind === "image" ? config.IMAGE_PROVIDERS : config.PROVIDERS;
        elements.presetProviderSelect.textContent = "";
        Object.keys(providers).forEach(function(key) {
            var option = document.createElement("option");
            option.value = key;
            option.textContent = providers[key].label;
            elements.presetProviderSelect.appendChild(option);
        });
    }

    function renderPresetList() {
        elements.presetList.textContent = "";
        state.presets.forEach(function(preset) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "preset-item" + (state.active && preset.id === state.active.id ? " is-active" : "");
            button.textContent = preset.name;
            button.addEventListener("click", function() {
                presetsApi.setActivePreset(state.kind, preset.id);
                state.active = preset;
                renderPresetList();
                renderEditor();
            });
            elements.presetList.appendChild(button);
        });
    }

    function renderEditor() {
        if (!state.active) {
            return;
        }
        elements.presetNameInput.value = state.active.name;
        elements.presetProviderSelect.value = state.active.provider;
        elements.presetEndpointInput.value = state.active.endpoint;
        elements.presetModelInput.value = state.active.model || "";
        elements.presetOpenAiApiSelect.value = state.active.openaiApi || "chat";
        elements.presetApiKeyInput.value = state.active.apiKey || "";
        elements.presetOpenAiApiField.hidden = state.kind !== "chat" || state.active.provider !== "openai";
        elements.presetEndpointInput.placeholder = state.kind === "image" ?
            config.imageAddressPlaceholderFor(state.active.provider) :
            config.addressPlaceholderFor(state.active.provider);
        updatePreview();
    }

    function saveCurrent() {
        if (!state.active) {
            return;
        }
        var provider = elements.presetProviderSelect.value;
        var providerInfo = state.kind === "image" ? config.getImageProvider(provider) : config.getProvider(provider);
        var next = Object.assign({}, state.active, {
            name: elements.presetNameInput.value.trim() || providerInfo.label,
            provider: provider,
            endpoint: elements.presetEndpointInput.value.trim(),
            model: elements.presetModelInput.value.trim(),
            openaiApi: elements.presetOpenAiApiSelect.value,
            apiKey: elements.presetApiKeyInput.value.trim()
        });
        if (!next.endpoint && providerInfo.defaultAddress) {
            next.endpoint = providerInfo.defaultAddress;
            elements.presetEndpointInput.value = next.endpoint;
        }
        if (!next.model && providerInfo.defaultModel) {
            next.model = providerInfo.defaultModel;
            elements.presetModelInput.value = next.model;
        }
        presetsApi.upsertPreset(next);
        presetsApi.setActivePreset(state.kind, next.id);
        state.active = next;
        state.presets = presetsApi.presetsByKind(state.kind);
        renderPresetList();
        renderEditor();
        setFeedback("已保存。", "ok");
    }

    function normalizeEndpoint() {
        if (!state.active) {
            return;
        }
        var normalized = state.kind === "image" ?
            config.normalizeImageAddress(elements.presetEndpointInput.value, elements.presetProviderSelect.value) :
            config.normalizeAddress(elements.presetEndpointInput.value, elements.presetProviderSelect.value);
        if (normalized) {
            elements.presetEndpointInput.value = normalized;
            saveCurrent();
        }
    }

    function updatePreview() {
        var text = "";
        if (state.kind === "image") {
            text = "图片 POST: " + config.imageRequestUrlFor(state.active, "generation");
        } else {
            text = "对话 POST: " + config.requestUrlFor(state.active, "chat");
        }
        elements.presetPreview.textContent = text;
    }

    function setFeedback(text, tone) {
        elements.settingsFeedback.textContent = text;
        elements.settingsFeedback.className = "connection-feedback" + (tone ? " is-" + tone : "");
    }
})();
