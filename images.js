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
        isGenerating: false
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        elements = {
            statusText: document.getElementById("imageStatusText"),
            presetSelect: document.getElementById("imagePresetSelect"),
            providerSelect: document.getElementById("imageProviderSelect"),
            endpointInput: document.getElementById("imageEndpointInput"),
            modelInput: document.getElementById("imageModelInput"),
            apiKeyInput: document.getElementById("imageApiKeyInput"),
            requestPreview: document.getElementById("imageRequestPreview"),
            sizeSelect: document.getElementById("imageSizeSelect"),
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
        elements.presetSelect.addEventListener("change", function() {
            presetsApi.setActivePreset("image", elements.presetSelect.value);
            loadActivePreset();
            renderAll();
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
        elements.form.addEventListener("submit", generateImage);
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
        elements.apiKeyInput.value = state.activePreset.apiKey || "";
    }

    function syncPresetFromForm() {
        state.activePreset.endpoint = elements.endpointInput.value.trim();
        state.activePreset.model = elements.modelInput.value.trim();
        state.activePreset.apiKey = elements.apiKeyInput.value.trim();
        saveActivePreset();
        updateRequestPreview();
        updateStatus();
    }

    function saveActivePreset() {
        presetsApi.upsertPreset(state.activePreset);
        presetsApi.setActivePreset("image", state.activePreset.id);
        state.presets = presetsApi.presetsByKind("image");
    }

    function updateRequestPreview() {
        elements.requestPreview.textContent = "图片 POST: " + config.imageRequestUrlFor(state.activePreset, state.references.length ? "edit" : "generation");
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
        var prompt = elements.promptInput.value.trim();
        if (!prompt || state.isGenerating) {
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
            var images = await requestImages(prompt);
            if (!images.length) {
                throw new Error("接口未返回图片。");
            }
            var job = {
                id: "image-" + Date.now() + "-" + Math.random().toString(16).slice(2),
                provider: state.activePreset.provider,
                model: state.activePreset.model,
                prompt: prompt,
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
            size: elements.sizeSelect.value
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
        form.append("size", elements.sizeSelect.value);
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
        elements.providerSelect.disabled = state.isGenerating;
        elements.presetSelect.disabled = state.isGenerating;
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
