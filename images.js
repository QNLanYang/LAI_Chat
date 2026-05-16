(function() {
    "use strict";

    var config = window.LocalAiConfig;
    var presetsApi = window.LocalAiPresets;
    var IMAGE_KEY = config.STORAGE_KEYS.imageJobs;

    var elements = {};
    var state = {
        presets: [],
        activePreset: null,
        references: [],
        jobs: [],
        modelOptions: [],
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
            resolutionSelect: document.getElementById("imageResolutionSelect"),
            aspectSelect: document.getElementById("imageAspectSelect"),
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
        bindEvents();
        renderAll();
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
            var provider = config.getImageProvider(elements.providerSelect.value);
            state.activePreset.provider = elements.providerSelect.value;
            state.activePreset.endpoint = provider.defaultAddress || "";
            state.activePreset.model = provider.defaultModel || "";
            state.activePreset.apiKey = elements.apiKeyInput.value.trim();
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
        elements.resolutionSelect.addEventListener("change", syncPresetFromForm);
        elements.aspectSelect.addEventListener("change", syncPresetFromForm);
    }

    function setSidebarOpen(open) {
        document.body.classList.toggle("is-sidebar-open", Boolean(open));
        elements.sidebarOpenButton.setAttribute("aria-expanded", open ? "true" : "false");
        elements.sidebarScrim.hidden = !open;
    }

    function loadActivePreset() {
        state.presets = presetsApi.presetsByKind("image");
        state.activePreset = presetsApi.getActivePreset("image");
        if (!state.activePreset) {
            state.activePreset = presetsApi.newPreset("image");
            presetsApi.upsertPreset(state.activePreset);
        }
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
        state.presets.forEach(function(preset) {
            var option = document.createElement("option");
            option.value = preset.id;
            option.textContent = preset.name;
            elements.presetSelect.appendChild(option);
        });
        elements.presetSelect.value = state.activePreset.id;
    }

    function applyPresetToForm() {
        var provider = config.getImageProvider(state.activePreset.provider);
        elements.providerSelect.value = state.activePreset.provider;
        elements.endpointInput.value = state.activePreset.endpoint || provider.defaultAddress || "";
        elements.endpointInput.placeholder = config.imageAddressPlaceholderFor(state.activePreset.provider);
        elements.modelInput.value = state.activePreset.model || provider.defaultModel || "";
        elements.modelInput.placeholder = state.modelOptions.length ? "选择或输入模型名" : "手动输入模型名";
        elements.apiKeyInput.value = state.activePreset.apiKey || "";
        elements.resolutionSelect.value = normalizeImageResolution(state.activePreset.resolution);
        elements.aspectSelect.value = state.activePreset.aspect || "1:1";
    }

    function syncPresetFromForm() {
        state.activePreset.endpoint = elements.endpointInput.value.trim();
        state.activePreset.model = elements.modelInput.value.trim();
        state.activePreset.apiKey = elements.apiKeyInput.value.trim();
        state.activePreset.resolution = elements.resolutionSelect.value;
        state.activePreset.aspect = elements.aspectSelect.value;
        saveActivePreset();
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
        elements.requestPreview.textContent = "图片 POST: " + config.imageRequestUrlFor(state.activePreset, state.references.length ? "edit" : "generation");
        elements.requestPreview.hidden = true;
    }

    function updateStatus() {
        var provider = config.getImageProvider(state.activePreset.provider);
        elements.providerLabel.textContent = provider.label;
        elements.statusText.textContent = provider.label + " · " + (state.activePreset.model || provider.defaultModel || "未选择模型");
        elements.statusPill.textContent = state.isGenerating ? "生成中" : provider.label;
        elements.statusPill.className = "status-pill";
    }

    async function generateImage(event) {
        event.preventDefault();
        syncPresetFromForm();
        var rawPrompt = elements.promptInput.value.trim();
        var requestPrompt = withImageSizeInstruction(rawPrompt);
        if (!rawPrompt || state.isGenerating) {
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
            var job = {
                id: "image-" + Date.now() + "-" + Math.random().toString(16).slice(2),
                provider: state.activePreset.provider,
                model: state.activePreset.model,
                prompt: rawPrompt,
                size: selectedImageSize(),
                images: images,
                createdAt: new Date().toISOString()
            };
            state.jobs.unshift(job);
            state.jobs = state.jobs.slice(0, 40);
            saveJobs();
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
        var body = {
            model: state.activePreset.model,
            prompt: prompt,
            n: imageCount(),
            size: requestImageSize()
        };
        var response = await fetch(config.imageRequestUrlFor(state.activePreset, "generation"), {
            method: "POST",
            headers: imageHeaders({ json: true, bearer: true }),
            body: JSON.stringify(body)
        });
        await ensureOk(response);
        return extractOpenAiImages(await response.json());
    }

    async function requestOpenAiImageEdit(prompt) {
        var form = new FormData();
        form.append("model", state.activePreset.model);
        form.append("prompt", prompt);
        form.append("n", String(imageCount()));
        form.append("size", requestImageSize());
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
        var response = await fetch(config.imageRequestUrlFor(state.activePreset, "generation") + "?key=" + encodeURIComponent(state.activePreset.apiKey || ""), {
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
        var headers = {};
        if (options.json) {
            headers["Content-Type"] = "application/json";
        }
        if (options.bearer && state.activePreset.apiKey) {
            headers.Authorization = "Bearer " + state.activePreset.apiKey;
        }
        return headers;
    }

    function imageModelHeaders() {
        var provider = config.getImageProvider(state.activePreset.provider);
        if (provider.mode === "geminiImages") {
            return state.activePreset.apiKey ? {
                "x-goog-api-key": state.activePreset.apiKey
            } : {};
        }
        return imageHeaders({ bearer: true });
    }

    function extractImageModelNames(data) {
        if (!data) {
            return [];
        }
        if (Array.isArray(data.data)) {
            return data.data.map(function(item) {
                return typeof item === "string" ? item : item && (item.id || item.name);
            }).filter(Boolean);
        }
        if (Array.isArray(data.models)) {
            return data.models.map(function(item) {
                return typeof item === "string" ? item : item && (item.id || item.name);
            }).filter(Boolean);
        }
        return [];
    }

    function renderModelOptions(models) {
        state.modelOptions = uniqueValues((models || []).filter(Boolean));
        elements.modelMenu.textContent = "";
        state.modelOptions.forEach(function(model) {
            var option = document.createElement("button");
            option.type = "button";
            option.className = "model-option" + (model === state.activePreset.model ? " is-selected" : "");
            option.textContent = model;
            option.addEventListener("click", function() {
                selectModel(model);
            });
            option.addEventListener("keydown", function(event) {
                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    var next = option.nextElementSibling || elements.modelMenu.firstElementChild;
                    next.focus();
                }
                if (event.key === "ArrowUp") {
                    event.preventDefault();
                    var previous = option.previousElementSibling || elements.modelMenu.lastElementChild;
                    previous.focus();
                }
                if (event.key === "Escape") {
                    toggleModelMenu(false);
                    elements.modelInput.focus();
                }
            });
            elements.modelMenu.appendChild(option);
        });
        elements.modelInput.placeholder = state.modelOptions.length ? "选择或输入模型名" : "手动输入模型名";
        elements.modelMenuButton.disabled = state.isGenerating || state.isTesting || !state.modelOptions.length;
        if (!state.modelOptions.length) {
            toggleModelMenu(false);
        }
    }

    function uniqueValues(values) {
        return Array.from(new Set(values));
    }

    function toggleModelMenu(open) {
        var shouldOpen = Boolean(open && state.modelOptions.length && !state.isGenerating && !state.isTesting);
        elements.modelMenu.hidden = !shouldOpen;
        elements.modelMenuButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }

    function focusFirstModelOption() {
        var option = elements.modelMenu.querySelector(".model-option");
        if (option) {
            option.focus();
        }
    }

    function selectModel(model) {
        elements.modelInput.value = model;
        syncPresetFromForm();
        renderModelOptions(state.modelOptions);
        toggleModelMenu(false);
        elements.modelInput.focus();
    }

    function extractOpenAiImages(data) {
        return (data.data || []).map(function(item) {
            if (item.b64_json) {
                return "data:image/png;base64," + item.b64_json;
            }
            return item.url || "";
        }).filter(Boolean);
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
        var provider = config.getImageProvider(state.activePreset.provider);
        var size = selectedImageSize();
        if (supportsExactImageSize(provider)) {
            return size.width + "x" + size.height;
        }
        if (provider.imageSizeMode === "official" || provider.imageSizeMode === "model") {
            if (size.aspect === "1:1") {
                return "1024x1024";
            }
            if (size.width >= size.height) {
                return "1536x1024";
            }
            return "1024x1536";
        }
        return "";
    }

    function supportsExactImageSize(provider) {
        var model = (state.activePreset.model || provider.defaultModel || "").toLowerCase();
        return provider.mode === "openaiImages" && /^gpt-image-2(?:-|$)/.test(model);
    }

    function withImageSizeInstruction(prompt) {
        var size = selectedImageSize();
        var instruction = "Target image: " + size.aspect + " aspect ratio, around " + size.width + "x" + size.height + " px.";
        if (!prompt) {
            return "";
        }
        return prompt + "\n\n" + instruction;
    }

    function updateSizePreview() {
        var size = selectedImageSize();
        var provider = config.getImageProvider(state.activePreset.provider);
        var text = "目标约 " + size.width + " x " + size.height + " px";
        var requestSize = requestImageSize();
        if (provider.mode === "openaiImages" && requestSize) {
            text += " · API 请求 " + requestSize;
        }
        elements.sizePreview.textContent = text;
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
            meta.textContent = job.model + " · " + formatTime(job.createdAt);
            var prompt = document.createElement("p");
            prompt.textContent = job.prompt;
            var grid = document.createElement("div");
            grid.className = "image-grid";
            job.images.forEach(function(src) {
                var link = document.createElement("a");
                link.href = src;
                link.target = "_blank";
                link.rel = "noreferrer";
                var img = document.createElement("img");
                img.src = src;
                img.alt = job.prompt;
                link.appendChild(img);
                grid.appendChild(link);
            });
            article.appendChild(meta);
            article.appendChild(prompt);
            article.appendChild(grid);
            elements.results.appendChild(article);
        });
    }

    async function addReferenceFiles(fileList) {
        var files = Array.from(fileList || []).filter(function(file) {
            return file.type.indexOf("image/") === 0;
        });
        if (!files.length) {
            return;
        }
        state.references = state.references.concat(await Promise.all(files.map(readImageFile)));
        renderReferences();
        updateRequestPreview();
        setFeedback("已添加 " + files.length + " 张参考图。", "ok");
    }

    async function handlePaste(event) {
        var items = Array.from((event.clipboardData && event.clipboardData.items) || []);
        var files = items.filter(function(item) {
            return item.kind === "file" && item.type.indexOf("image/") === 0;
        }).map(function(item) {
            return item.getAsFile();
        }).filter(Boolean);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        await addReferenceFiles(files);
    }

    function readImageFile(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                resolve({
                    name: file.name,
                    type: file.type || "image/png",
                    size: file.size,
                    dataUrl: String(reader.result || "")
                });
            };
            reader.onerror = function() {
                reject(new Error("图片读取失败: " + file.name));
            };
            reader.readAsDataURL(file);
        });
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

    function loadJobs() {
        try {
            var stored = JSON.parse(localStorage.getItem(IMAGE_KEY) || "[]");
            return Array.isArray(stored) ? stored : [];
        } catch (error) {
            return [];
        }
    }

    function saveJobs() {
        localStorage.setItem(IMAGE_KEY, JSON.stringify(state.jobs));
    }

    function updateGeneratingState() {
        elements.generateButton.disabled = state.isGenerating;
        elements.generateButton.textContent = state.isGenerating ? "生成中" : "生成";
        elements.testButton.disabled = state.isGenerating || state.isTesting;
        elements.testButton.textContent = state.isTesting ? "测试中" : "测试连接/模型";
        elements.providerSelect.disabled = state.isGenerating || state.isTesting;
        elements.presetSelect.disabled = state.isGenerating || state.isTesting;
        elements.modelInput.disabled = state.isGenerating || state.isTesting;
        elements.modelMenuButton.disabled = state.isGenerating || state.isTesting || !state.modelOptions.length;
        if (state.isGenerating || state.isTesting) {
            toggleModelMenu(false);
        }
    }

    function setFeedback(text, tone) {
        elements.feedback.textContent = text;
        elements.feedback.className = "connection-feedback" + (tone ? " is-" + tone : "");
    }

    async function ensureOk(response) {
        if (response.ok) {
            return;
        }
        var text = "";
        try {
            text = await response.text();
        } catch (error) {
            text = response.statusText;
        }
        throw new Error("HTTP " + response.status + " " + text.slice(0, 260));
    }

    function explainError(error) {
        var message = error && error.message ? error.message : String(error);
        if (message === "Failed to fetch") {
            return "无法访问端点。请确认服务允许当前页面跨域访问。";
        }
        return message;
    }

    function formatTime(value) {
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        return date.toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }
})();
