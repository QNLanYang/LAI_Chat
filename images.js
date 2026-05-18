(function() {
    "use strict";

    var config = window.LocalAiConfig;
    var presetsApi = window.LocalAiPresets;
    var secrets = window.LocalAiSecrets;
    var mediaStore = window.LocalAiMediaStore;
    var ui = window.LocalAiUi;
    var IMAGE_KEY = config.STORAGE_KEYS.imageJobs;

    var elements = {};
    var modelPicker = null;
    var state = {
        presets: [],
        activePreset: null,
        references: [],
        jobs: [],
        modelOptions: [],
        objectUrls: [],
        isGenerating: false,
        isTesting: false
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        elements = {
            statusText: document.getElementById("imageStatusText"),
            sidebarOpenButton: document.getElementById("imageSidebarOpenButton"),
            sidebarCloseButton: document.getElementById("imageSidebarCloseButton"),
            sidebarScrim: document.getElementById("imageSidebarScrim"),
            presetSelect: document.getElementById("imagePresetSelect"),
            providerSelect: document.getElementById("imageProviderSelect"),
            endpointInput: document.getElementById("imageEndpointInput"),
            modelPicker: document.getElementById("imageModelPicker"),
            modelInput: document.getElementById("imageModelInput"),
            modelMenuButton: document.getElementById("imageModelMenuButton"),
            modelMenu: document.getElementById("imageModelMenu"),
            apiKeyInput: document.getElementById("imageApiKeyInput"),
            requestPreview: document.getElementById("imageRequestPreview"),
            testButton: document.getElementById("imageTestButton"),
            sizeModeSelect: document.getElementById("imageSizeModeSelect"),
            nativeSizeField: document.getElementById("imageNativeSizeField"),
            nativeSizeSelect: document.getElementById("imageNativeSizeSelect"),
            resolutionField: document.getElementById("imageResolutionField"),
            resolutionSelect: document.getElementById("imageResolutionSelect"),
            aspectField: document.getElementById("imageAspectField"),
            aspectSelect: document.getElementById("imageAspectSelect"),
            qualityField: document.getElementById("imageQualityField"),
            qualitySelect: document.getElementById("imageQualitySelect"),
            backgroundField: document.getElementById("imageBackgroundField"),
            backgroundSelect: document.getElementById("imageBackgroundSelect"),
            sizePreview: document.getElementById("imageSizePreview"),
            countInput: document.getElementById("imageCountInput"),
            providerLabel: document.getElementById("imageProviderLabel"),
            statusPill: document.getElementById("imageStatusPill"),
            form: document.getElementById("imageForm"),
            promptInput: document.getElementById("imagePromptInput"),
            referenceInput: document.getElementById("imageReferenceInput"),
            attachButton: document.getElementById("imageAttachButton"),
            clearButton: document.getElementById("imageClearButton"),
            generateButton: document.getElementById("imageGenerateButton"),
            attachmentStrip: document.getElementById("imageAttachmentStrip"),
            feedback: document.getElementById("imageFeedback"),
            results: document.getElementById("imageResults")
        };

        state.jobs = loadJobs();
        renderProviderOptions();
        loadActivePreset();
        modelPicker = ui.createModelPicker({
            input: elements.modelInput,
            button: elements.modelMenuButton,
            menu: elements.modelMenu,
            getActiveModel: function() {
                return state.activePreset ? state.activePreset.model : "";
            },
            isDisabled: function() {
                return state.isGenerating || state.isTesting;
            },
            onSelect: function() {
                syncPresetFromForm();
            },
            onRender: function(models) {
                state.modelOptions = models;
            }
        });
        bindEvents();
        renderAll();
        migrateLegacyJobs().catch(function(error) {
            setFeedback(explainError(error), "warn");
        });
    }

    function bindEvents() {
        elements.sidebarOpenButton.addEventListener("click", function() {
            setSidebarOpen(true);
        });
        elements.sidebarCloseButton.addEventListener("click", function() {
            setSidebarOpen(false);
        });
        elements.sidebarScrim.addEventListener("click", function() {
            setSidebarOpen(false);
        });
        document.addEventListener("keydown", function(event) {
            if (event.key === "Escape") {
                setSidebarOpen(false);
            }
        });
        elements.presetSelect.addEventListener("change", function() {
            presetsApi.setActivePreset("image", elements.presetSelect.value);
            loadActivePreset();
            renderModelOptions([]);
            renderAll();
            setSidebarOpen(false);
        });
        elements.providerSelect.addEventListener("change", function() {
            if (!state.activePreset) {
                return;
            }
            var provider = config.getImageProvider(elements.providerSelect.value);
            state.activePreset.provider = elements.providerSelect.value;
            state.activePreset.endpoint = provider.defaultAddress || "";
            state.activePreset.model = provider.defaultModel || "";
            state.activePreset.apiKey = secrets.normalizeApiKey(elements.apiKeyInput.value);
            saveActivePreset();
            renderAll();
        });
        [
            elements.endpointInput,
            elements.modelInput,
            elements.apiKeyInput
        ].forEach(function(input) {
            input.addEventListener("input", syncPresetFromForm);
        });
        elements.modelMenuButton.addEventListener("click", function() {
            toggleModelMenu(elements.modelMenu.hidden);
        });
        document.addEventListener("click", function(event) {
            if (!elements.modelPicker.contains(event.target)) {
                toggleModelMenu(false);
            }
        });
        elements.modelInput.addEventListener("keydown", function(event) {
            if (event.key === "ArrowDown" && state.modelOptions.length) {
                event.preventDefault();
                toggleModelMenu(true);
                focusFirstModelOption();
            }
            if (event.key === "Escape") {
                toggleModelMenu(false);
            }
        });
        elements.endpointInput.addEventListener("blur", function() {
            if (!state.activePreset) {
                return;
            }
            var normalized = config.normalizeImageAddress(elements.endpointInput.value, state.activePreset.provider);
            if (normalized) {
                elements.endpointInput.value = normalized;
                syncPresetFromForm();
            }
        });
        elements.attachButton.addEventListener("click", function() {
            elements.referenceInput.click();
        });
        elements.referenceInput.addEventListener("change", function() {
            addReferenceFiles(elements.referenceInput.files).catch(function(error) {
                setFeedback(error.message, "error");
            }).finally(function() {
                elements.referenceInput.value = "";
            });
        });
        elements.promptInput.addEventListener("paste", function(event) {
            handlePaste(event).catch(function(error) {
                setFeedback(error.message, "error");
            });
        });
        elements.clearButton.addEventListener("click", function() {
            state.references = [];
            elements.promptInput.value = "";
            renderReferences();
        });
        elements.testButton.addEventListener("click", function() {
            testImageConnection().catch(function(error) {
                setFeedback(explainError(error), "error");
            });
        });
        elements.form.addEventListener("submit", generateImage);
        elements.sizeModeSelect.addEventListener("change", function() {
            if (!state.activePreset) {
                return;
            }
            state.activePreset.sizeMode = elements.sizeModeSelect.value === "custom" ? "custom" : "native";
            if (state.activePreset.sizeMode === "native") {
                state.activePreset.nativeSize = validNativeSizeOrDefault(
                    state.activePreset.nativeSize,
                    config.getImageProvider(state.activePreset.provider)
                );
            }
            saveActivePreset();
            updateSizeModeVisibility();
            updateRequestPreview();
            updateStatus();
            updateSizePreview();
        });
        elements.nativeSizeSelect.addEventListener("change", function() {
            if (!state.activePreset) {
                return;
            }
            state.activePreset.nativeSize = elements.nativeSizeSelect.value;
            saveActivePreset();
            updateRequestPreview();
            updateStatus();
            updateSizePreview();
        });
        elements.resolutionSelect.addEventListener("change", syncPresetFromForm);
        elements.aspectSelect.addEventListener("change", syncPresetFromForm);
        elements.qualitySelect.addEventListener("change", syncPresetFromForm);
        elements.backgroundSelect.addEventListener("change", syncPresetFromForm);
        window.addEventListener("beforeunload", revokeObjectUrls);
    }

    function setSidebarOpen(open) {
        ui.setSidebarOpen(elements, open);
    }

    function loadActivePreset() {
        state.presets = presetsApi.presetsByKind("image");
        state.activePreset = presetsApi.getActivePreset("image");
    }

    function renderAll() {
        renderPresetSelect();
        applyPresetToForm();
        updateRequestPreview();
        updateStatus();
        renderReferences();
        renderResults();
        renderModelOptions(state.modelOptions);
        updateSizePreview();
        updateGeneratingState();
    }

    function renderProviderOptions() {
        elements.providerSelect.textContent = "";
        Object.keys(config.IMAGE_PROVIDERS).forEach(function(key) {
            var option = document.createElement("option");
            option.value = key;
            option.textContent = config.IMAGE_PROVIDERS[key].label;
            elements.providerSelect.appendChild(option);
        });
    }

    function renderPresetSelect() {
        state.presets = presetsApi.presetsByKind("image");
        elements.presetSelect.textContent = "";
        if (!state.presets.length) {
            var empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "未配置预设";
            elements.presetSelect.appendChild(empty);
            elements.presetSelect.value = "";
            return;
        }
        state.presets.forEach(function(preset) {
            var option = document.createElement("option");
            option.value = preset.id;
            option.textContent = preset.name;
            elements.presetSelect.appendChild(option);
        });
        elements.presetSelect.value = state.activePreset ? state.activePreset.id : "";
    }

    function applyPresetToForm() {
        if (!state.activePreset) {
            elements.providerSelect.value = "";
            elements.endpointInput.value = "";
            elements.endpointInput.placeholder = config.imageAddressPlaceholderFor("");
            elements.modelInput.value = "";
            elements.modelInput.placeholder = "请先在设置页创建预设";
            elements.apiKeyInput.value = "";
            elements.sizeModeSelect.value = "native";
            renderNativeSizeOptions([]);
            renderQualityOptions([]);
            renderBackgroundOptions([]);
            elements.nativeSizeSelect.value = "auto";
            elements.resolutionSelect.value = "720p";
            elements.aspectSelect.value = "1:1";
            elements.qualitySelect.value = "auto";
            elements.backgroundSelect.value = "auto";
            updateSizeModeVisibility();
            return;
        }
        var provider = config.getImageProvider(state.activePreset.provider);
        elements.providerSelect.value = state.activePreset.provider;
        elements.endpointInput.value = state.activePreset.endpoint || "";
        elements.endpointInput.placeholder = config.imageAddressPlaceholderFor(state.activePreset.provider);
        elements.modelInput.value = state.activePreset.model || "";
        elements.modelInput.placeholder = state.modelOptions.length ? "选择或输入模型名" : "手动输入模型名";
        elements.apiKeyInput.value = state.activePreset.apiKey || "";
        elements.sizeModeSelect.value = state.activePreset.sizeMode === "custom" ? "custom" : "native";
        renderNativeSizeOptions(nativeSizesForCurrentModel(provider));
        renderQualityOptions(qualityOptionsForCurrentModel(provider));
        renderBackgroundOptions(backgroundOptionsForCurrentModel(provider));
        elements.nativeSizeSelect.value = validNativeSizeOrDefault(state.activePreset.nativeSize, provider);
        elements.resolutionSelect.value = normalizeImageResolution(state.activePreset.resolution);
        elements.aspectSelect.value = state.activePreset.aspect || "1:1";
        elements.qualitySelect.value = validQualityOrDefault(state.activePreset.imageQuality, provider);
        elements.backgroundSelect.value = validBackgroundOrDefault(state.activePreset.imageBackground, provider);
        updateSizeModeVisibility();
        updateQualityBackgroundVisibility(provider);
    }

    function syncPresetFromForm() {
        if (!state.activePreset) {
            return;
        }
        var previousModel = state.activePreset.model || "";
        state.activePreset.endpoint = elements.endpointInput.value.trim();
        state.activePreset.model = elements.modelInput.value.trim();
        state.activePreset.apiKey = secrets.normalizeApiKey(elements.apiKeyInput.value);
        var provider = config.getImageProvider(state.activePreset.provider);
        if (previousModel !== state.activePreset.model) {
            renderNativeSizeOptions(nativeSizesForCurrentModel(provider));
            renderQualityOptions(qualityOptionsForCurrentModel(provider));
            renderBackgroundOptions(backgroundOptionsForCurrentModel(provider));
        }
        state.activePreset.sizeMode = elements.sizeModeSelect.value === "custom" ? "custom" : "native";
        state.activePreset.nativeSize = validNativeSizeOrDefault(
            elements.nativeSizeSelect.value || state.activePreset.nativeSize,
            provider
        );
        state.activePreset.imageQuality = validQualityOrDefault(
            elements.qualitySelect.value || state.activePreset.imageQuality,
            provider
        );
        state.activePreset.imageBackground = validBackgroundOrDefault(
            elements.backgroundSelect.value || state.activePreset.imageBackground,
            provider
        );
        elements.nativeSizeSelect.value = state.activePreset.nativeSize;
        elements.backgroundSelect.value = state.activePreset.imageBackground;
        state.activePreset.resolution = elements.resolutionSelect.value;
        state.activePreset.aspect = elements.aspectSelect.value;
        saveActivePreset();
        updateSizeModeVisibility();
        updateRequestPreview();
        updateStatus();
        updateSizePreview();
    }

    function saveActivePreset() {
        presetsApi.upsertPreset(state.activePreset);
        presetsApi.setActivePreset("image", state.activePreset.id);
        state.presets = presetsApi.presetsByKind("image");
    }

    function updateRequestPreview() {
        if (!state.activePreset) {
            elements.requestPreview.textContent = "请先在设置页创建图片预设。";
            elements.requestPreview.hidden = true;
            return;
        }
        elements.requestPreview.textContent = "图片 POST: " + config.imageRequestUrlFor(state.activePreset, state.references.length ? "edit" : "generation");
        elements.requestPreview.hidden = true;
    }

    function updateStatus() {
        if (!state.activePreset) {
            elements.providerLabel.textContent = "未配置";
            elements.statusText.textContent = "未配置 Provider";
            ui.setStatusPill(elements.statusPill, "未配置", "warn");
            return;
        }
        var provider = config.getImageProvider(state.activePreset.provider);
        elements.providerLabel.textContent = provider.label;
        elements.statusText.textContent = provider.label + " · " + (state.activePreset.model || provider.defaultModel || "未选择模型");
        ui.setStatusPill(elements.statusPill, state.isGenerating ? "生成中" : provider.label);
    }

    async function generateImage(event) {
        event.preventDefault();
        syncPresetFromForm();
        var rawPrompt = elements.promptInput.value.trim();
        var requestPrompt = withImageSizeInstruction(rawPrompt);
        if (!rawPrompt || state.isGenerating) {
            return;
        }
        if (!state.activePreset || !state.activePreset.provider) {
            setFeedback("请先在设置页创建并选择图片 Provider 预设。", "error");
            return;
        }
        if (!state.activePreset.endpoint) {
            setFeedback("请先填写图片 API 地址。", "error");
            return;
        }
        if (!state.activePreset.model) {
            setFeedback("请先填写模型。", "error");
            return;
        }

        state.isGenerating = true;
        updateGeneratingState();
        setFeedback("正在请求 " + config.imageRequestUrlFor(state.activePreset, state.references.length ? "edit" : "generation"), "ok");
        try {
            var images = await requestImages(requestPrompt);
            if (!images.length) {
                throw new Error("接口未返回图片。");
            }
            var jobId = "image-" + Date.now() + "-" + Math.random().toString(16).slice(2);
            var storedImages = await storeGeneratedImages(jobId, images, rawPrompt);
            var job = {
                id: jobId,
                provider: state.activePreset.provider,
                model: state.activePreset.model,
                prompt: rawPrompt,
                size: selectedImageSize(),
                images: storedImages,
                createdAt: new Date().toISOString()
            };
            state.jobs.unshift(job);
            state.jobs = state.jobs.slice(0, 40);
            saveJobs();
            pruneStoredImages();
            renderResults();
            setFeedback("生成完成。", "ok");
        } catch (error) {
            setFeedback(explainError(error), "error");
        } finally {
            state.isGenerating = false;
            updateGeneratingState();
            updateStatus();
        }
    }

    async function testImageConnection() {
        syncPresetFromForm();
        if (!state.activePreset || !state.activePreset.provider) {
            setFeedback("请先在设置页创建并选择图片 Provider 预设。", "error");
            return [];
        }
        if (!state.activePreset.endpoint) {
            setFeedback("请先填写图片 API 地址。", "error");
            return [];
        }
        state.isTesting = true;
        updateGeneratingState();
        var url = config.imageRequestUrlFor(state.activePreset, "models");
        setFeedback("正在测试 " + url, "ok");
        try {
            var response = await fetch(url, {
                headers: imageModelHeaders()
            });
            await ensureOk(response);
            var data = await response.json();
            var models = extractImageModelNames(data);
            renderModelOptions(models);
            if (models.length) {
                var current = state.activePreset.model || config.getImageProvider(state.activePreset.provider).defaultModel || "";
                var matched = current && models.indexOf(current) !== -1;
                if (!state.activePreset.model) {
                    state.activePreset.model = models[0];
                    elements.modelInput.value = models[0];
                    saveActivePreset();
                }
                setFeedback(matched ? "连接正常，当前模型在模型列表中。" : "连接正常，返回 " + models.length + " 个模型。", "ok");
            } else {
                setFeedback("连接正常，但未返回可识别的模型列表。", "warn");
            }
            updateStatus();
            return models;
        } catch (error) {
            setFeedback(explainError(error), "error");
            throw error;
        } finally {
            state.isTesting = false;
            updateGeneratingState();
        }
    }

    async function requestImages(prompt) {
        var provider = config.getImageProvider(state.activePreset.provider);
        if (provider.mode === "geminiImages") {
            return requestGeminiImages(prompt);
        }
        if (state.references.length) {
            return requestOpenAiImageEdit(prompt);
        }
        return requestOpenAiImageGeneration(prompt);
    }

    async function requestOpenAiImageGeneration(prompt) {
        var requestSize = requestImageSize();
        var body = {
            model: state.activePreset.model,
            prompt: prompt,
            n: imageCount()
        };
        if (requestSize) {
            body.size = requestSize;
        }
        var requestQuality = requestImageQuality();
        if (requestQuality) {
            body.quality = requestQuality;
        }
        var requestBackground = requestImageBackground();
        if (requestBackground) {
            body.background = requestBackground;
        }
        var response = await fetch(config.imageRequestUrlFor(state.activePreset, "generation"), {
            method: "POST",
            headers: imageHeaders({ json: true, bearer: true }),
            body: JSON.stringify(body)
        });
        await ensureOk(response);
        return extractOpenAiImages(await response.json());
    }

    async function requestOpenAiImageEdit(prompt) {
        var requestSize = requestImageSize();
        var form = new FormData();
        form.append("model", state.activePreset.model);
        form.append("prompt", prompt);
        form.append("n", String(imageCount()));
        if (requestSize) {
            form.append("size", requestSize);
        }
        var requestQuality = requestImageQuality();
        if (requestQuality) {
            form.append("quality", requestQuality);
        }
        var requestBackground = requestImageBackground();
        if (requestBackground) {
            form.append("background", requestBackground);
        }
        state.references.forEach(function(image, index) {
            form.append("image[]", dataUrlToBlob(image.dataUrl, image.type), image.name || "reference-" + index + ".png");
        });
        var response = await fetch(config.imageRequestUrlFor(state.activePreset, "edit"), {
            method: "POST",
            headers: imageHeaders({ bearer: true }),
            body: form
        });
        await ensureOk(response);
        return extractOpenAiImages(await response.json());
    }

    async function requestGeminiImages(prompt) {
        var parts = [{ text: prompt }];
        state.references.forEach(function(image) {
            parts.push({
                inline_data: {
                    mime_type: image.type || "image/png",
                    data: image.dataUrl.split(",")[1] || ""
                }
            });
        });
        var apiKey = secrets.apiKeyForHeader(state.activePreset.apiKey, "API Key");
        var response = await fetch(config.imageRequestUrlFor(state.activePreset, "generation") + "?key=" + encodeURIComponent(apiKey), {
            method: "POST",
            headers: imageHeaders({ json: true }),
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: parts
                }]
            })
        });
        await ensureOk(response);
        return extractGeminiImages(await response.json());
    }

    function imageHeaders(options) {
        options = options || {};
        var apiKey = secrets.apiKeyForHeader(state.activePreset.apiKey, "API Key");
        return ui.buildHeaders({
            apiKey: apiKey,
            auth: options.bearer ? "bearer" : "",
            json: options.json
        });
    }

    function imageModelHeaders() {
        var provider = config.getImageProvider(state.activePreset.provider);
        var apiKey = secrets.apiKeyForHeader(state.activePreset.apiKey, "API Key");
        if (provider.mode === "geminiImages") {
            return ui.buildHeaders({
                apiKey: apiKey,
                auth: "x-goog-api-key"
            });
        }
        return imageHeaders({ bearer: true });
    }

    function extractImageModelNames(data) {
        if (!data) {
            return [];
        }
        if (Array.isArray(data.data)) {
            return ui.modelNamesFromItems(data.data, "image");
        }
        if (Array.isArray(data.models)) {
            return ui.modelNamesFromItems(data.models, "image");
        }
        return [];
    }

    function renderModelOptions(models) {
        modelPicker.render(models);
    }

    function toggleModelMenu(open) {
        modelPicker.toggle(open);
    }

    function focusFirstModelOption() {
        modelPicker.focusFirst();
    }

    function extractOpenAiImages(data) {
        var responseType = imageTypeFromFormat(data && data.output_format);
        return (data.data || []).map(function(item) {
            var itemType = imageTypeFromFormat(item.output_format) || responseType || "image/png";
            if (item.b64_json) {
                return "data:" + itemType + ";base64," + item.b64_json;
            }
            return item.url || "";
        }).filter(Boolean);
    }

    function imageTypeFromFormat(format) {
        var value = String(format || "").toLowerCase();
        if (value === "jpg") {
            value = "jpeg";
        }
        return ["png", "jpeg", "webp"].indexOf(value) !== -1 ? "image/" + value : "";
    }

    function extractGeminiImages(data) {
        var images = [];
        (data.candidates || []).forEach(function(candidate) {
            var parts = candidate.content && candidate.content.parts || [];
            parts.forEach(function(part) {
                var inline = part.inlineData || part.inline_data;
                if (inline && inline.data) {
                    images.push("data:" + (inline.mimeType || inline.mime_type || "image/png") + ";base64," + inline.data);
                }
            });
        });
        return images;
    }

    function imageCount() {
        return Math.min(4, Math.max(1, parseInt(elements.countInput.value, 10) || 1));
    }

    function selectedImageSize() {
        if (!state.activePreset || (state.activePreset.sizeMode || "native") !== "custom") {
            return nativeImageSizeForProvider(config.getImageProvider(state.activePreset ? state.activePreset.provider : ""));
        }
        var resolution = normalizeImageResolution(elements.resolutionSelect.value);
        var aspect = elements.aspectSelect.value || "1:1";
        var preset = imageResolutionPreset(resolution);
        var parts = aspect.split(":").map(function(value) {
            return parseInt(value, 10) || 1;
        });
        var ratioW = parts[0] || 1;
        var ratioH = parts[1] || 1;
        var width = Math.sqrt(preset.pixels * ratioW / ratioH);
        var height = Math.sqrt(preset.pixels * ratioH / ratioW);
        return {
            resolution: resolution,
            aspect: aspect,
            width: floorToStep(width, 16),
            height: floorToStep(height, 16)
        };
    }

    function imageResolutionPreset(value) {
        var preset = {
            "720p": { width: 1280, height: 720 },
            "1080p": { width: 1920, height: 1080 },
            "2k": { width: 2560, height: 1440 },
            "4k": { width: 3840, height: 2160 }
        }[normalizeImageResolution(value)] || { width: 1280, height: 720 };
        return Object.assign({}, preset, {
            pixels: preset.width * preset.height
        });
    }

    function normalizeImageResolution(value) {
        if (value === "1k") {
            return "720p";
        }
        if (value === "1_9k") {
            return "1080p";
        }
        return ["720p", "1080p", "2k", "4k"].indexOf(value) !== -1 ? value : "720p";
    }

    function floorToStep(value, step) {
        return Math.max(step, Math.floor(value / step) * step);
    }

    function requestImageSize() {
        if (!state.activePreset) {
            return "";
        }
        var provider = config.getImageProvider(state.activePreset.provider);
        if ((state.activePreset.sizeMode || "native") !== "custom") {
            return validNativeSizeOrDefault(state.activePreset.nativeSize, provider);
        }
        var size = selectedImageSize();
        if (supportsExactImageSize(provider)) {
            return size.width + "x" + size.height;
        }
        if (provider.imageSizeMode === "official" || provider.imageSizeMode === "model") {
            return mapCustomSizeToNative(size, provider);
        }
        return "";
    }

    function mapCustomSizeToNative(size, provider) {
        var nativeSizes = validNativeSizes(provider);
        var parsed = nativeSizes.map(function(nativeSize) {
            var parts = String(nativeSize).split("x");
            return {
                value: nativeSize,
                width: parseInt(parts[0], 10) || 0,
                height: parseInt(parts[1], 10) || 0
            };
        }).filter(function(nativeSize) {
            return nativeSize.width && nativeSize.height;
        });
        var match = null;
        if (size.width === size.height) {
            match = parsed.find(function(nativeSize) {
                return nativeSize.width === nativeSize.height;
            });
        } else if (size.width > size.height) {
            match = parsed.find(function(nativeSize) {
                return nativeSize.width > nativeSize.height;
            });
        } else {
            match = parsed.find(function(nativeSize) {
                return nativeSize.height > nativeSize.width;
            });
        }
        return match ? match.value : nativeSizes[0] || "";
    }

    function supportsExactImageSize(provider) {
        var model = (state.activePreset.model || provider.defaultModel || "").toLowerCase();
        return provider.mode === "openaiImages" && /^gpt-image-2(?:-|$)/.test(model);
    }

    function withImageSizeInstruction(prompt) {
        if (!state.activePreset || (state.activePreset.sizeMode || "native") !== "custom") {
            return prompt || "";
        }
        if (requestImageSize()) {
            return prompt || "";
        }
        var size = selectedImageSize();
        var instruction = "Target image: " + size.aspect + " aspect ratio, around " + size.width + "x" + size.height + " px.";
        if (!prompt) {
            return "";
        }
        return prompt + "\n\n" + instruction;
    }

    function updateSizePreview() {
        if (!state.activePreset) {
            elements.sizePreview.textContent = "请先在设置页创建图片预设。";
            return;
        }
        var provider = config.getImageProvider(state.activePreset.provider);
        var mode = state.activePreset.sizeMode || "native";
        if (mode !== "custom") {
            var nativeSizes = nativeSizesForCurrentModel(provider);
            var text = provider.imageSizeMode === "prompt" || !nativeSizes.length ?
                "原生模式: 不额外注入尺寸提示" :
                "原生尺寸: " + formatImageSizeLabel(validNativeSizeOrDefault(state.activePreset.nativeSize, provider));
            if (nativeSizes.length) {
                text += " · 可选 " + nativeSizes.map(formatImageSizeLabel).join(" / ");
            }
            if (qualityOptionsForCurrentModel(provider).length) {
                text += " · 质量 " + validQualityOrDefault(state.activePreset.imageQuality, provider);
            }
            if (backgroundOptionsForCurrentModel(provider).length) {
                text += " · 背景 " + validBackgroundOrDefault(state.activePreset.imageBackground, provider);
            }
            elements.sizePreview.textContent = text;
            return;
        }
        var size = selectedImageSize();
        var text = "目标约 " + size.width + " x " + size.height + " px";
        var requestSize = requestImageSize();
        if (provider.mode === "openaiImages" && requestSize) {
            text += " · API 请求 " + requestSize;
        }
        var requestQuality = requestImageQuality();
        if (requestQuality) {
            text += " · 质量 " + requestQuality;
        }
        var requestBackground = requestImageBackground();
        if (requestBackground) {
            text += " · 背景 " + requestBackground;
        }
        elements.sizePreview.textContent = text;
    }

    function updateSizeModeVisibility() {
        var isCustom = (elements.sizeModeSelect.value || "native") === "custom";
        var provider = state.activePreset ? config.getImageProvider(state.activePreset.provider) : config.getImageProvider("");
        setFieldVisible(elements.nativeSizeField, !isCustom && Boolean(nativeSizesForCurrentModel(provider).length));
        setFieldVisible(elements.resolutionField, isCustom);
        setFieldVisible(elements.aspectField, isCustom);
        updateQualityBackgroundVisibility(provider);
    }

    function updateQualityBackgroundVisibility(provider) {
        provider = provider || (state.activePreset ? config.getImageProvider(state.activePreset.provider) : config.getImageProvider(""));
        setFieldVisible(elements.qualityField, Boolean(qualityOptionsForCurrentModel(provider).length));
        setFieldVisible(elements.backgroundField, Boolean(backgroundOptionsForCurrentModel(provider).length));
    }

    function renderNativeSizeOptions(nativeSizes) {
        var sizes = nativeSizes && nativeSizes.length ? nativeSizes.slice() : [];
        elements.nativeSizeSelect.textContent = "";
        sizes.forEach(function(size) {
            var option = document.createElement("option");
            option.value = size;
            option.textContent = formatImageSizeLabel(size);
            elements.nativeSizeSelect.appendChild(option);
        });
    }

    function validNativeSizeOrDefault(value, provider) {
        var nativeSizes = validNativeSizes(provider);
        if (nativeSizes.indexOf(value) !== -1) {
            return value;
        }
        return nativeSizes[0] || "";
    }

    function nativeImageSizeForProvider(provider) {
        return validNativeSizeOrDefault("", provider);
    }

    function formatImageSizeLabel(value) {
        if (value === "auto") {
            return "自动";
        }
        return String(value || "").replace("x", " × ");
    }

    function validNativeSizes(provider) {
        var sizes = nativeSizesForCurrentModel(provider);
        return sizes && sizes.length ? sizes : [];
    }

    function nativeSizesForCurrentModel(provider) {
        var model = currentImageModel(provider);
        if (provider.mode !== "openaiImages") {
            return provider.nativeSizes && provider.nativeSizes.length ? provider.nativeSizes.slice() : [];
        }
        if (model === "dall-e-2") {
            return ["256x256", "512x512", "1024x1024"];
        }
        if (model === "dall-e-3") {
            return ["1024x1024", "1792x1024", "1024x1792"];
        }
        return provider.nativeSizes && provider.nativeSizes.length ? provider.nativeSizes.slice() : [];
    }

    function renderQualityOptions(qualityOptions) {
        var options = qualityOptions && qualityOptions.length ? qualityOptions.slice() : [];
        elements.qualitySelect.textContent = "";
        options.forEach(function(optionValue) {
            var option = document.createElement("option");
            option.value = optionValue;
            option.textContent = optionValue === "auto" ? "自动" : optionValue;
            elements.qualitySelect.appendChild(option);
        });
    }

    function renderBackgroundOptions(backgroundOptions) {
        var options = backgroundOptions && backgroundOptions.length ? backgroundOptions.slice() : [];
        elements.backgroundSelect.textContent = "";
        options.forEach(function(optionValue) {
            var option = document.createElement("option");
            option.value = optionValue;
            option.textContent = optionValue === "auto" ? "自动" : optionValue;
            elements.backgroundSelect.appendChild(option);
        });
    }

    function validQualityOrDefault(value, provider) {
        var options = qualityOptionsForCurrentModel(provider);
        return options.indexOf(value) !== -1 ? value : options[0] || "";
    }

    function validBackgroundOrDefault(value, provider) {
        var options = backgroundOptionsForCurrentModel(provider);
        return options.indexOf(value) !== -1 ? value : options[0] || "";
    }

    function requestImageQuality() {
        if (!state.activePreset) {
            return "";
        }
        var provider = config.getImageProvider(state.activePreset.provider);
        if (!qualityOptionsForCurrentModel(provider).length) {
            return "";
        }
        return validQualityOrDefault(elements.qualitySelect.value || state.activePreset.imageQuality, provider);
    }

    function requestImageBackground() {
        if (!state.activePreset) {
            return "";
        }
        var provider = config.getImageProvider(state.activePreset.provider);
        if (!backgroundOptionsForCurrentModel(provider).length) {
            return "";
        }
        return validBackgroundOrDefault(elements.backgroundSelect.value || state.activePreset.imageBackground, provider);
    }

    function qualityOptionsForCurrentModel(provider) {
        if (provider.mode !== "openaiImages") {
            return provider.qualityOptions && provider.qualityOptions.length ? provider.qualityOptions.slice() : [];
        }
        var model = currentImageModel(provider);
        if (model === "dall-e-2") {
            return ["standard"];
        }
        if (model === "dall-e-3") {
            return ["standard", "hd"];
        }
        return provider.qualityOptions && provider.qualityOptions.length ? provider.qualityOptions.slice() : [];
    }

    function backgroundOptionsForCurrentModel(provider) {
        if (provider.mode !== "openaiImages") {
            return provider.backgroundOptions && provider.backgroundOptions.length ? provider.backgroundOptions.slice() : [];
        }
        var model = currentImageModel(provider);
        if (model === "dall-e-2" || model === "dall-e-3") {
            return [];
        }
        return provider.backgroundOptions && provider.backgroundOptions.length ? provider.backgroundOptions.slice() : [];
    }

    function currentImageModel(provider) {
        return String(state.activePreset && state.activePreset.model || provider.defaultModel || "").trim().toLowerCase();
    }

    function setFieldVisible(field, visible) {
        ui.setFieldVisible(field, visible);
    }

    function renderReferences() {
        elements.attachmentStrip.textContent = "";
        elements.attachmentStrip.hidden = !state.references.length;
        state.references.forEach(function(image, index) {
            var chip = document.createElement("div");
            chip.className = "attachment-chip";
            var img = document.createElement("img");
            img.src = image.dataUrl;
            img.alt = image.name || "参考图";
            var name = document.createElement("span");
            name.textContent = image.name || "参考图";
            var remove = document.createElement("button");
            remove.className = "ghost-button remove-attachment";
            remove.type = "button";
            remove.textContent = "移除";
            remove.addEventListener("click", function() {
                state.references.splice(index, 1);
                renderReferences();
                updateRequestPreview();
            });
            chip.appendChild(img);
            chip.appendChild(name);
            chip.appendChild(remove);
            elements.attachmentStrip.appendChild(chip);
        });
    }

    function renderResults() {
        elements.results.textContent = "";
        if (!state.jobs.length) {
            var empty = document.createElement("div");
            empty.className = "empty-state";
            var text = document.createElement("p");
            text.textContent = "还没有图片。";
            empty.appendChild(text);
            elements.results.appendChild(empty);
            return;
        }
        state.jobs.forEach(function(job) {
            var article = document.createElement("article");
            article.className = "image-job";
            var meta = document.createElement("div");
            meta.className = "image-job-meta";
            meta.textContent = job.model + " · " + ui.formatTime(job.createdAt);
            var prompt = document.createElement("p");
            prompt.textContent = job.prompt;
            var grid = document.createElement("div");
            grid.className = "image-grid";
            job.images.forEach(function(image) {
                var src = image.objectUrl || image.dataUrl || image.url || "";
                var frame = document.createElement("div");
                frame.className = "image-frame";
                if (image.missing) {
                    frame.classList.add("is-missing");
                }
                var link = document.createElement("a");
                link.href = src || "#";
                link.target = "_blank";
                link.rel = "noreferrer";
                if (src) {
                    var img = document.createElement("img");
                    img.src = src;
                    img.alt = image.name || job.prompt;
                    link.appendChild(img);
                } else {
                    var placeholder = document.createElement("div");
                    placeholder.className = "image-placeholder";
                    placeholder.textContent = "正在读取图片";
                    link.appendChild(placeholder);
                }
                var download = document.createElement("button");
                download.type = "button";
                download.className = "ghost-button image-download-button";
                download.textContent = "下载";
                download.addEventListener("click", function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    downloadImage(image);
                });
                frame.appendChild(link);
                frame.appendChild(download);
                if (image.missing) {
                    var missing = document.createElement("span");
                    missing.className = "image-missing-label";
                    missing.textContent = "本地图片已清理";
                    frame.appendChild(missing);
                }
                grid.appendChild(frame);
            });
            article.appendChild(meta);
            article.appendChild(prompt);
            article.appendChild(grid);
            elements.results.appendChild(article);
        });
    }

    async function addReferenceFiles(fileList) {
        var loaded = await ui.readImageFiles(fileList);
        if (!loaded.length) {
            return;
        }
        state.references = state.references.concat(loaded);
        renderReferences();
        updateRequestPreview();
        setFeedback("已添加 " + loaded.length + " 张参考图。", "ok");
    }

    async function handlePaste(event) {
        var files = ui.imageFilesFromPaste(event);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        await addReferenceFiles(files);
    }

    function dataUrlToBlob(dataUrl, type) {
        var parts = dataUrl.split(",");
        var binary = atob(parts[1] || "");
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: type || "image/png" });
    }

    async function storeGeneratedImages(jobId, images, prompt) {
        var stored = [];
        for (var index = 0; index < images.length; index += 1) {
            stored.push(await storeGeneratedImage(jobId, images[index], index, prompt));
        }
        return stored;
    }

    async function storeGeneratedImage(jobId, src, index, prompt) {
        if (isDataUrl(src)) {
            var type = mimeTypeFromDataUrl(src) || "image/png";
            var blob = dataUrlToBlob(src, type);
            var imageId = jobId + "-image-" + index;
            var name = imageFileName(prompt, index, type);
            await mediaStore.putImage({
                id: imageId,
                blob: blob,
                type: type,
                name: name,
                createdAt: new Date().toISOString()
            });
            return {
                id: imageId,
                type: type,
                name: name,
                size: blob.size,
                objectUrl: trackObjectUrl(URL.createObjectURL(blob))
            };
        }
        return {
            id: "",
            url: src,
            objectUrl: src,
            type: "",
            name: imageFileName(prompt, index, "image/png"),
            size: 0
        };
    }

    async function hydrateStoredImages() {
        revokeObjectUrls();
        var changed = false;
        for (var jobIndex = 0; jobIndex < state.jobs.length; jobIndex += 1) {
            var job = state.jobs[jobIndex];
            if (!Array.isArray(job.images)) {
                job.images = [];
                changed = true;
            }
            for (var imageIndex = 0; imageIndex < job.images.length; imageIndex += 1) {
                var image = job.images[imageIndex];
                if (typeof image === "string") {
                    continue;
                }
                if (!image || !image.id || image.objectUrl) {
                    continue;
                }
                try {
                    var record = await mediaStore.getImage(image.id);
                    if (record && record.blob) {
                        image.objectUrl = trackObjectUrl(URL.createObjectURL(record.blob));
                        image.type = image.type || record.type || record.blob.type;
                        image.name = image.name || record.name || imageFileName(job.prompt, imageIndex, image.type);
                        image.size = image.size || record.blob.size;
                    } else {
                        image.missing = true;
                        changed = true;
                    }
                } catch (error) {
                    image.missing = true;
                    changed = true;
                }
            }
        }
        if (changed) {
            saveJobs();
        }
    }

    function trackObjectUrl(url) {
        state.objectUrls.push(url);
        return url;
    }

    function revokeObjectUrls() {
        state.objectUrls.forEach(function(url) {
            URL.revokeObjectURL(url);
        });
        state.objectUrls = [];
    }

    async function downloadImage(image) {
        var href = "";
        if (image.objectUrl && !/^https?:\/\//i.test(image.objectUrl)) {
            href = image.objectUrl;
        }
        if (!href && image.dataUrl) {
            href = image.dataUrl;
        }
        if (!href && image.id) {
            var record = await mediaStore.getImage(image.id);
            if (record && record.blob) {
                href = trackObjectUrl(URL.createObjectURL(record.blob));
            }
        }
        var remoteUrl = image.url || (/^https?:\/\//i.test(image.objectUrl || "") ? image.objectUrl : "");
        if (!href && remoteUrl) {
            try {
                var response = await fetch(remoteUrl);
                await ensureOk(response);
                var blob = await response.blob();
                href = trackObjectUrl(URL.createObjectURL(blob));
                image.type = image.type || blob.type || "";
                image.size = image.size || blob.size || 0;
            } catch (error) {
                setFeedback("浏览器无法直接下载这张远程图片，请点击缩略图打开后另存。", "warn");
                return;
            }
        }
        if (!href) {
            setFeedback("这张图片的本地文件已经不可用。", "error");
            return;
        }
        var link = document.createElement("a");
        link.href = href;
        link.download = image.name || "lai-chat-image.png";
        link.rel = "noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async function migrateLegacyJobs() {
        var changed = false;
        for (var jobIndex = 0; jobIndex < state.jobs.length; jobIndex += 1) {
            var job = state.jobs[jobIndex];
            if (!Array.isArray(job.images)) {
                job.images = [];
                changed = true;
                continue;
            }
            for (var imageIndex = 0; imageIndex < job.images.length; imageIndex += 1) {
                var image = job.images[imageIndex];
                if (typeof image === "string" && isDataUrl(image)) {
                    job.images[imageIndex] = await storeGeneratedImage(job.id || "legacy-" + jobIndex, image, imageIndex, job.prompt || "");
                    changed = true;
                } else if (typeof image === "string") {
                    job.images[imageIndex] = {
                        id: "",
                        url: image,
                        objectUrl: image,
                        type: "",
                        name: imageFileName(job.prompt, imageIndex, "image/png"),
                        size: 0
                    };
                    changed = true;
                }
            }
        }
        if (changed) {
            saveJobs();
            await hydrateStoredImages();
            renderResults();
            setFeedback("已迁移旧图片历史，后续不再把大图写入 localStorage。", "ok");
        } else {
            await hydrateStoredImages();
            renderResults();
        }
    }

    function isDataUrl(value) {
        return /^data:image\//i.test(String(value || ""));
    }

    function mimeTypeFromDataUrl(value) {
        var match = /^data:([^;,]+)/i.exec(String(value || ""));
        return match ? match[1].toLowerCase() : "";
    }

    function imageFileName(prompt, index, type) {
        var ext = extensionForMime(type);
        var slug = String(prompt || "lai-chat-image")
            .trim()
            .replace(/[\\/:*?"<>|]+/g, "")
            .replace(/\s+/g, "-")
            .slice(0, 36) || "lai-chat-image";
        return slug + "-" + (index + 1) + "." + ext;
    }

    function extensionForMime(type) {
        if (type === "image/jpeg") {
            return "jpg";
        }
        if (type === "image/webp") {
            return "webp";
        }
        return "png";
    }

    function loadJobs() {
        try {
            var stored = JSON.parse(localStorage.getItem(IMAGE_KEY) || "[]");
            return Array.isArray(stored) ? stored.map(normalizeJob).filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    }

    function saveJobs() {
        var jobs = state.jobs.map(serializeJob);
        try {
            localStorage.setItem(IMAGE_KEY, JSON.stringify(jobs));
        } catch (error) {
            if (isQuotaError(error)) {
                localStorage.setItem(IMAGE_KEY, JSON.stringify(jobs.map(stripLegacyImageData)));
                setFeedback("图片已生成，但历史空间不足，已只保存图片元数据。请及时下载重要图片。", "warn");
                return;
            }
            throw error;
        }
    }

    function normalizeJob(job) {
        if (!job || typeof job !== "object") {
            return null;
        }
        return Object.assign({}, job, {
            images: (job.images || []).filter(Boolean)
        });
    }

    function serializeJob(job) {
        return Object.assign({}, job, {
            images: (job.images || []).map(function(image) {
                if (typeof image === "string") {
                    return image;
                }
                return {
                    id: image.id || "",
                    url: image.url || "",
                    type: image.type || "",
                    name: image.name || "",
                    size: image.size || 0,
                    missing: Boolean(image.missing)
                };
            })
        });
    }

    function stripLegacyImageData(job) {
        return Object.assign({}, job, {
            images: (job.images || []).map(function(image, index) {
                if (typeof image === "string") {
                    return {
                        id: "",
                        url: "",
                        type: mimeTypeFromDataUrl(image),
                        name: imageFileName(job.prompt, index, mimeTypeFromDataUrl(image)),
                        size: 0,
                        missing: true
                    };
                }
                return image;
            })
        });
    }

    function isQuotaError(error) {
        return error && (
            error.name === "QuotaExceededError" ||
            error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
            String(error.message || "").toLowerCase().indexOf("quota") !== -1
        );
    }

    function pruneStoredImages() {
        var keepIds = [];
        state.jobs.forEach(function(job) {
            (job.images || []).forEach(function(image) {
                if (image && image.id) {
                    keepIds.push(image.id);
                }
            });
        });
        mediaStore.pruneImages(keepIds).catch(function() {});
    }

    function updateGeneratingState() {
        var hasPreset = Boolean(state.activePreset && state.activePreset.provider);
        ui.setButtonLoading(elements.generateButton, state.isGenerating, "生成中", "生成");
        elements.generateButton.disabled = state.isGenerating || !hasPreset;
        ui.setButtonLoading(elements.testButton, state.isTesting, "测试中", "测试连接/模型");
        elements.testButton.disabled = state.isGenerating || state.isTesting || !hasPreset;
        elements.providerSelect.disabled = state.isGenerating || state.isTesting || !state.activePreset;
        elements.presetSelect.disabled = state.isGenerating || state.isTesting;
        elements.modelInput.disabled = state.isGenerating || state.isTesting || !hasPreset;
        elements.modelMenuButton.disabled = state.isGenerating || state.isTesting || !state.modelOptions.length;
        if (state.isGenerating || state.isTesting) {
            toggleModelMenu(false);
        }
    }

    function setFeedback(text, tone) {
        ui.setToneText(elements.feedback, "connection-feedback", text, tone);
    }

    async function ensureOk(response) {
        return ui.ensureOk(response);
    }

    function explainError(error) {
        return ui.explainError(error);
    }
})();
