(function() {
    "use strict";

    var config = window.LocalAiConfig;
    var presetsApi = window.LocalAiPresets;
    var secrets = window.LocalAiSecrets;
    var elements = {};
    var state = {
        kind: "chat",
        presets: [],
        active: null,
        isSaving: false,
        autoSaveTimer: 0
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        elements = {
            chatKindButton: document.getElementById("chatKindButton"),
            imageKindButton: document.getElementById("imageKindButton"),
            presetList: document.getElementById("presetList"),
            addPresetButton: document.getElementById("addPresetButton"),
            deletePresetButton: document.getElementById("deletePresetButton"),
            importPresetButton: document.getElementById("importPresetButton"),
            exportPresetButton: document.getElementById("exportPresetButton"),
            presetImportInput: document.getElementById("presetImportInput"),
            presetNameInput: document.getElementById("presetNameInput"),
            presetNameError: document.getElementById("presetNameError"),
            presetProviderSelect: document.getElementById("presetProviderSelect"),
            presetEndpointField: document.getElementById("presetEndpointField"),
            presetEndpointInput: document.getElementById("presetEndpointInput"),
            presetModelField: document.getElementById("presetModelField"),
            presetModelInput: document.getElementById("presetModelInput"),
            presetOpenAiApiField: document.getElementById("presetOpenAiApiField"),
            presetOpenAiApiSelect: document.getElementById("presetOpenAiApiSelect"),
            presetResponseImageGenerationField: document.getElementById("presetResponseImageGenerationField"),
            presetResponseImageGenerationCheckbox: document.getElementById("presetResponseImageGenerationCheckbox"),
            presetApiKeyField: document.getElementById("presetApiKeyField"),
            presetApiKeyInput: document.getElementById("presetApiKeyInput"),
            presetPreview: document.getElementById("presetPreview"),
            savePresetButton: document.getElementById("savePresetButton"),
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
            setFeedback("已新增预设。请填写后保存。", "ok");
            elements.presetNameInput.focus();
            elements.presetNameInput.select();
        });
        elements.deletePresetButton.addEventListener("click", function() {
            if (!state.active || !confirm("删除预设“" + state.active.name + "”？")) {
                return;
            }
            presetsApi.deletePreset(state.active.id);
            loadKind(state.kind);
            setFeedback("已删除预设。", "ok");
        });
        elements.importPresetButton.addEventListener("click", function() {
            elements.presetImportInput.click();
        });
        elements.exportPresetButton.addEventListener("click", exportPresets);
        elements.presetImportInput.addEventListener("change", function() {
            importPresets(elements.presetImportInput.files[0]).finally(function() {
                elements.presetImportInput.value = "";
            });
        });
        elements.presetProviderSelect.addEventListener("change", function() {
            var provider = currentProviderInfo();
            elements.presetEndpointInput.value = provider.defaultAddress || "";
            elements.presetModelInput.value = provider.defaultModel || "";
            updateVisibility();
            updatePreviewFromForm();
            scheduleAutoSave();
        });
        elements.presetOpenAiApiSelect.addEventListener("change", function() {
            updateVisibility();
            updatePreviewFromForm();
            scheduleAutoSave();
        });
        [
            elements.presetNameInput,
            elements.presetEndpointInput,
            elements.presetModelInput,
            elements.presetResponseImageGenerationCheckbox,
            elements.presetApiKeyInput
        ].forEach(function(input) {
            input.addEventListener("input", function() {
                updatePreviewFromForm();
                scheduleAutoSave();
            });
            input.addEventListener("change", function() {
                updatePreviewFromForm();
                scheduleAutoSave();
            });
        });
        elements.presetEndpointInput.addEventListener("blur", normalizeEndpoint);
        elements.savePresetButton.addEventListener("click", function() {
            saveCurrent({ explicit: true }).catch(function(error) {
                setFeedback(error.message, "error");
            });
        });
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

        var blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "请选择 Provider";
        elements.presetProviderSelect.appendChild(blank);

        Object.keys(providers).forEach(function(key) {
            var option = document.createElement("option");
            option.value = key;
            option.textContent = providers[key].label;
            elements.presetProviderSelect.appendChild(option);
        });
    }

    function renderPresetList() {
        elements.presetList.textContent = "";
        if (!state.presets.length) {
            var empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "暂无预设。可以直接新建，也可以导入 JSON。";
            elements.presetList.appendChild(empty);
            return;
        }
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
        var hasActive = Boolean(state.active);
        [
            elements.presetNameInput,
            elements.presetProviderSelect,
            elements.presetEndpointInput,
            elements.presetModelInput,
            elements.presetOpenAiApiSelect,
            elements.presetResponseImageGenerationCheckbox,
            elements.presetApiKeyInput,
            elements.savePresetButton,
            elements.deletePresetButton
        ].forEach(function(input) {
            input.disabled = !hasActive || state.isSaving;
        });

        if (!hasActive) {
            elements.presetNameInput.value = "";
            setFieldError(elements.presetNameError, "");
            elements.presetProviderSelect.value = "";
            elements.presetEndpointInput.value = "";
            elements.presetModelInput.value = "";
            elements.presetOpenAiApiSelect.value = "chat";
            elements.presetResponseImageGenerationCheckbox.checked = false;
            elements.presetApiKeyInput.value = "";
            elements.presetPreview.textContent = "暂无当前预设。";
            updateVisibility();
            return;
        }

        elements.presetNameInput.value = state.active.name;
        elements.presetProviderSelect.value = state.active.provider || "";
        elements.presetEndpointInput.value = state.active.endpoint || "";
        elements.presetModelInput.value = state.active.model || "";
        elements.presetOpenAiApiSelect.value = state.active.openaiApi || "chat";
        elements.presetResponseImageGenerationCheckbox.checked = Boolean(state.active.responseImageGeneration);
        elements.presetApiKeyInput.value = state.active.apiKey || "";
        elements.presetEndpointInput.placeholder = state.kind === "image" ?
            config.imageAddressPlaceholderFor(state.active.provider) :
            config.addressPlaceholderFor(state.active.provider);
        setFieldError(elements.presetNameError, "");
        updateVisibility();
        updatePreviewFromForm();
    }

    async function saveCurrent(options) {
        if (!state.active || state.isSaving) {
            return;
        }
        var validation = validateCurrent();
        applyValidation(validation);
        if (!validation.valid) {
            setFeedback(validation.message, "error");
            return;
        }
        var next = buildPresetFromForm();
        var explicit = Boolean(options && options.explicit);
        if (explicit) {
            state.isSaving = true;
            elements.savePresetButton.classList.add("is-loading");
            elements.savePresetButton.textContent = "保存中";
            renderEditorDisabledState();
            setFeedback("正在保存...", "ok");
            await delay(500);
        }

        presetsApi.upsertPreset(next);
        presetsApi.setActivePreset(state.kind, next.id);
        state.active = next;
        state.presets = presetsApi.presetsByKind(state.kind);

        if (explicit) {
            state.isSaving = false;
            elements.savePresetButton.classList.remove("is-loading");
            elements.savePresetButton.textContent = "保存预设";
            renderPresetList();
            renderEditor();
            setFeedback("保存成功。", "ok");
        } else {
            renderPresetList();
            setFeedback("已自动保存。", "ok");
        }
    }

    function renderEditorDisabledState() {
        [
            elements.presetNameInput,
            elements.presetProviderSelect,
            elements.presetEndpointInput,
            elements.presetModelInput,
            elements.presetOpenAiApiSelect,
            elements.presetResponseImageGenerationCheckbox,
            elements.presetApiKeyInput,
            elements.savePresetButton,
            elements.deletePresetButton
        ].forEach(function(input) {
            input.disabled = state.isSaving;
        });
    }

    function buildPresetFromForm() {
        var provider = elements.presetProviderSelect.value;
        var providerInfo = currentProviderInfo();
        var openaiApi = providerInfo.mode === "openai" && providerInfo.supportsResponses === false ?
            "chat" :
            elements.presetOpenAiApiSelect.value;
        return Object.assign({}, state.active, {
            name: elements.presetNameInput.value.trim(),
            provider: provider,
            endpoint: elements.presetEndpointInput.value.trim(),
            model: elements.presetModelInput.value.trim(),
            openaiApi: openaiApi,
            responseImageGeneration: Boolean(
                state.kind === "chat" &&
                providerInfo.mode === "openai" &&
                providerInfo.supportsResponses !== false &&
                openaiApi === "responses" &&
                elements.presetResponseImageGenerationCheckbox.checked
            ),
            apiKey: secrets.normalizeApiKey(elements.presetApiKeyInput.value)
        });
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
        }
        updatePreviewFromForm();
        scheduleAutoSave();
    }

    function updatePreviewFromForm() {
        if (!state.active) {
            return;
        }
        elements.presetEndpointInput.placeholder = state.kind === "image" ?
            config.imageAddressPlaceholderFor(elements.presetProviderSelect.value) :
            config.addressPlaceholderFor(elements.presetProviderSelect.value);

        var preset = buildPresetFromForm();
        var text = "";
        if (!preset.provider) {
            text = "请选择 Provider 后保存。";
        } else if (state.kind === "image") {
            text = "图片 POST: " + (config.imageRequestUrlFor(preset, "generation") || "待填写地址");
        } else {
            text = "对话 POST: " + (config.requestUrlFor(preset, "chat") || "待填写地址");
        }
        elements.presetPreview.textContent = text;
        applyValidation(validateCurrent());
    }

    function scheduleAutoSave() {
        window.clearTimeout(state.autoSaveTimer);
        if (!state.active || state.isSaving) {
            return;
        }
        state.autoSaveTimer = window.setTimeout(function() {
            saveCurrent({ explicit: false }).catch(function(error) {
                setFeedback(error.message, "error");
            });
        }, 300);
    }

    function validateCurrent() {
        var name = elements.presetNameInput.value.trim();
        if (!name) {
            return {
                valid: false,
                field: "name",
                message: "预设名称不能为空。"
            };
        }
        return {
            valid: true,
            field: "",
            message: ""
        };
    }

    function applyValidation(validation) {
        setFieldError(elements.presetNameError, validation.field === "name" ? validation.message : "");
    }

    function updateVisibility() {
        var provider = elements.presetProviderSelect.value;
        var providerInfo = currentProviderInfo();
        var hasProvider = Boolean(state.active && providerInfo.mode !== "none");
        var isOpenAiChat = state.kind === "chat" &&
            providerInfo.mode === "openai" &&
            providerInfo.supportsResponses !== false;

        setVisible(elements.presetEndpointField, hasProvider);
        setVisible(elements.presetModelField, hasProvider);
        setVisible(elements.presetApiKeyField, hasProvider);
        setVisible(elements.presetOpenAiApiField, hasProvider && isOpenAiChat);
        setVisible(elements.presetResponseImageGenerationField, hasProvider && isOpenAiChat && elements.presetOpenAiApiSelect.value === "responses");
    }

    function currentProviderInfo() {
        var provider = elements.presetProviderSelect.value;
        return state.kind === "image" ? config.getImageProvider(provider) : config.getProvider(provider);
    }

    function setVisible(element, visible) {
        element.hidden = !visible;
        element.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function setFieldError(element, text) {
        element.textContent = text || "";
        element.hidden = !text;
    }

    function exportPresets() {
        var presets = presetsApi.loadPresets();
        if (!presets.length) {
            setFeedback("当前没有可导出的预设。", "warn");
            return;
        }
        if (!confirm("导出的 Provider 预设会包含已保存的 API Key。请确认只在可信环境保存和分享这个 JSON 文件。")) {
            return;
        }
        var payload = {
            app: "LAI Chat",
            version: 1,
            exportedAt: new Date().toISOString(),
            presets: presets
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "lai-chat-provider-presets.json";
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
        setFeedback("已导出预设 JSON。", "ok");
    }

    async function importPresets(file) {
        if (!file) {
            return;
        }
        if (!confirm("导入的 Provider 预设可能包含 API Key，并会保存到本机 localStorage。请确认 JSON 文件来源可信。")) {
            return;
        }
        try {
            var payload = JSON.parse(await file.text());
            var imported = presetsFromPayload(payload);
            if (!imported.length) {
                setFeedback("未找到可导入的预设。", "warn");
                return;
            }
            var ready = imported.map(ensureImportId);
            ready.forEach(function(preset) {
                presetsApi.upsertPreset(preset);
            });
            var preferred = ready.find(function(preset) {
                return preset.kind === state.kind;
            });
            if (preferred) {
                presetsApi.setActivePreset(state.kind, preferred.id);
            }
            loadKind(state.kind);
            setFeedback("已导入 " + imported.length + " 个预设。", "ok");
        } catch (error) {
            setFeedback("导入失败：" + error.message, "error");
        }
    }

    function presetsFromPayload(payload) {
        if (Array.isArray(payload)) {
            return payload.filter(isPresetLike);
        }
        if (payload && Array.isArray(payload.presets)) {
            return payload.presets.filter(isPresetLike);
        }
        return [];
    }

    function isPresetLike(value) {
        return value && (value.kind === "chat" || value.kind === "image");
    }

    function ensureImportId(preset) {
        var next = Object.assign({}, preset);
        if (!next.id) {
            next.id = next.kind + "-imported-" + Date.now() + "-" + Math.random().toString(16).slice(2);
        }
        return next;
    }

    function setFeedback(text, tone) {
        elements.settingsFeedback.textContent = text;
        elements.settingsFeedback.className = "connection-feedback" + (tone ? " is-" + tone : "");
    }

    function delay(ms) {
        return new Promise(function(resolve) {
            window.setTimeout(resolve, ms);
        });
    }
})();
