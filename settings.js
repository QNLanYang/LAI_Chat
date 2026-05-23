(function() {
    "use strict";

    var config = window.LocalAiConfig;
    var presetsApi = window.LocalAiPresets;
    var secrets = window.LocalAiSecrets;
    var ui = window.LocalAiUi;
    var mediaStore = window.LocalAiMediaStore;
    var storageRegistry = window.LocalAiStorage;
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
            refreshStorageButton: document.getElementById("refreshStorageButton"),
            storageStats: document.getElementById("storageStats"),
            exportAllDataButton: document.getElementById("exportAllDataButton"),
            resetMigrationStateButton: document.getElementById("resetMigrationStateButton"),
            clearImageCacheButton: document.getElementById("clearImageCacheButton"),
            resetLocalDataButton: document.getElementById("resetLocalDataButton"),
            settingsFeedback: document.getElementById("settingsFeedback")
        };

        bindEvents();
        loadKind("chat");
        refreshStorageStats().catch(function(error) {
            setFeedback("存储统计读取失败：" + error.message, "warn");
        });
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
        elements.refreshStorageButton.addEventListener("click", function() {
            refreshStorageStats().catch(function(error) {
                setFeedback("存储统计读取失败：" + error.message, "warn");
            });
        });
        elements.exportAllDataButton.addEventListener("click", function() {
            exportAllData().catch(function(error) {
                setFeedback("导出失败：" + error.message, "error");
            });
        });
        elements.resetMigrationStateButton.addEventListener("click", resetMigrationState);
        elements.clearImageCacheButton.addEventListener("click", function() {
            clearImageCache().catch(function(error) {
                setFeedback("清理失败：" + error.message, "error");
            });
        });
        elements.resetLocalDataButton.addEventListener("click", function() {
            resetLocalData().catch(function(error) {
                setFeedback("清空失败：" + error.message, "error");
            });
        });
    }

    async function refreshStorageStats() {
        var stats = await collectStorageStats();
        renderStorageStats(stats);
    }

    async function collectStorageStats() {
        var localStats = storageRegistry.collectLocalStats();
        var mediaRecords = await listMediaRecords();
        var estimate = await storageRegistry.browserStorageEstimate();
        return {
            chats: localStats.chats,
            messages: localStats.messages,
            chatImages: localStats.chatImages,
            presets: localStats.presets,
            imageJobs: localStats.imageJobs,
            mediaCount: mediaRecords.length,
            mediaBytes: sum(mediaRecords, "size"),
            localStorageBytes: localStats.localStorageBytes,
            usageBytes: estimate && estimate.usage || 0,
            quotaBytes: estimate && estimate.quota || 0
        };
    }

    function renderStorageStats(stats) {
        elements.storageStats.textContent = "";
        [
            ["聊天", stats.chats + " 个会话 · " + stats.messages + " 条消息 · " + stats.chatImages + " 张聊天图片"],
            ["预设", stats.presets + " 个 Provider 预设"],
            ["图片页", stats.imageJobs + " 条生成记录"],
            ["IndexedDB", stats.mediaCount + " 张媒体 · " + formatBytes(stats.mediaBytes)],
            ["localStorage", formatBytes(stats.localStorageBytes)],
            ["浏览器估算", stats.usageBytes ? formatBytes(stats.usageBytes) + " / " + formatBytes(stats.quotaBytes) : "当前浏览器未提供"]
        ].forEach(function(row) {
            var item = document.createElement("div");
            item.className = "storage-stat";
            var label = document.createElement("span");
            label.textContent = row[0];
            var value = document.createElement("strong");
            value.textContent = row[1];
            item.appendChild(label);
            item.appendChild(value);
            elements.storageStats.appendChild(item);
        });
    }

    async function clearImageCache() {
        if (!confirm("清理图片生成页历史和图片页 IndexedDB 缓存？聊天会话和 Provider 预设不会被删除。")) {
            return;
        }
        storageRegistry.clearImageJobs();
        if (mediaStore && typeof mediaStore.clearImages === "function") {
            await mediaStore.clearImages({ scope: "image-job" });
        } else if (mediaStore && typeof mediaStore.pruneImages === "function") {
            await mediaStore.pruneImages([], { scope: "image-job" });
        }
        await refreshStorageStats();
        setFeedback("已清理图片页缓存。", "ok");
    }

    async function exportAllData() {
        if (!confirm("全量导出会包含 Provider 预设、API Key、会话、图片历史和 IndexedDB 媒体文件。请只保存在可信位置。")) {
            return;
        }
        setFeedback("正在导出全量数据...", "ok");
        var payload = {
            app: "LAI Chat",
            version: 1,
            exportedAt: new Date().toISOString(),
            localStorage: storageRegistry.storageSnapshot(localStorage),
            sessionStorage: storageRegistry.storageSnapshot(sessionStorage),
            indexedDb: {
                mediaDb: storageRegistry.MEDIA_DB.name,
                images: await exportMediaRecords()
            },
            cacheStorage: {
                keys: await storageRegistry.cacheKeys()
            }
        };
        downloadJson(payload, "lai-chat-full-data-" + new Date().toISOString().slice(0, 10) + ".json");
        setFeedback("已导出全量数据。", "ok");
    }

    function resetMigrationState() {
        if (!confirm("重置迁移状态只会删除本应用命名空间下包含 migration/migrated 的标记，不会删除会话、预设或图片。")) {
            return;
        }
        var removed = storageRegistry.removeMigrationKeys(localStorage) + storageRegistry.removeMigrationKeys(sessionStorage);
        setFeedback(removed ? "已重置 " + removed + " 个迁移状态标记。" : "当前没有可重置的迁移状态标记。", removed ? "ok" : "warn");
        refreshStorageStats().catch(function() {});
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
        ui.setFieldVisible(element, visible);
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

    async function resetLocalData() {
        if (!confirm("将清空本应用保存在当前浏览器里的所有本地数据。操作前请先导出 Provider 预设，确认继续？")) {
            return;
        }
        var keyword = prompt("二次确认：输入“清空本地数据”以继续。");
        if (keyword !== "清空本地数据") {
            setFeedback("已取消清空。", "warn");
            return;
        }
        setFeedback("正在清空本地数据...", "warn");
        await storageRegistry.resetAllLocalData({ mediaStore: mediaStore });
        setFeedback("本地数据已清空，页面即将刷新。", "ok");
        window.setTimeout(function() {
            window.location.reload();
        }, 800);
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

    async function listMediaRecords() {
        if (!mediaStore || typeof mediaStore.listImages !== "function") {
            return [];
        }
        try {
            return await mediaStore.listImages();
        } catch (error) {
            return [];
        }
    }

    async function exportMediaRecords() {
        var records = await listMediaRecords();
        if (!mediaStore || typeof mediaStore.getImage !== "function") {
            return records;
        }
        var exported = [];
        for (var index = 0; index < records.length; index += 1) {
            var metadata = records[index];
            var full = await mediaStore.getImage(metadata.id);
            exported.push(Object.assign({}, metadata, {
                dataUrl: full && full.blob ? await blobToDataUrl(full.blob) : ""
            }));
        }
        return exported;
    }

    function sum(items, key) {
        return (items || []).reduce(function(total, item) {
            return total + (Number(item && item[key]) || 0);
        }, 0);
    }

    function formatBytes(bytes) {
        if (!bytes) {
            return "0 KB";
        }
        if (bytes < 1024 * 1024) {
            return Math.max(1, Math.round(bytes / 1024)) + " KB";
        }
        return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + " MB";
    }

    function blobToDataUrl(blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                resolve(String(reader.result || ""));
            };
            reader.onerror = function() {
                reject(new Error("媒体文件读取失败。"));
            };
            reader.readAsDataURL(blob);
        });
    }

    function downloadJson(payload, filename) {
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
    }

    function setFeedback(text, tone) {
        ui.setToneText(elements.settingsFeedback, "connection-feedback", text, tone);
    }

    function delay(ms) {
        return new Promise(function(resolve) {
            window.setTimeout(resolve, ms);
        });
    }
})();
