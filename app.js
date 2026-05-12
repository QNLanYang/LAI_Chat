(function() {
    "use strict";

    var config = window.LocalAiConfig;
    var CHAT_KEY = config.STORAGE_KEYS.chats;
    var SETTINGS_KEY = config.STORAGE_KEYS.settings;
    var API_KEY = config.STORAGE_KEYS.apiKey;
    var providerDefaults = config.PROVIDERS;
    var defaultSettings = config.DEFAULT_SETTINGS;

    var elements = {};
    var state = {
        chats: [],
        activeChatId: "",
        settings: loadSettings(),
        pendingImages: [],
        endpointWasAutoFilled: false,
        abortController: null,
        isSending: false,
        isLoadingModels: false,
        isTesting: false,
        status: null
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        elements = {
            statusText: document.getElementById("statusText"),
            chatList: document.getElementById("chatList"),
            newChatButton: document.getElementById("newChatButton"),
            providerSelect: document.getElementById("providerSelect"),
            openaiApiField: document.getElementById("openaiApiField"),
            openaiApiSelect: document.getElementById("openaiApiSelect"),
            endpointInput: document.getElementById("endpointInput"),
            requestPreview: document.getElementById("requestPreview"),
            modelInput: document.getElementById("modelInput"),
            modelOptions: document.getElementById("modelOptions"),
            loadModelsButton: document.getElementById("loadModelsButton"),
            testButton: document.getElementById("testButton"),
            connectionFeedback: document.getElementById("connectionFeedback"),
            apiKeyInput: document.getElementById("apiKeyInput"),
            systemPromptInput: document.getElementById("systemPromptInput"),
            temperatureInput: document.getElementById("temperatureInput"),
            maxTokensInput: document.getElementById("maxTokensInput"),
            reasoningSelect: document.getElementById("reasoningSelect"),
            streamCheckbox: document.getElementById("streamCheckbox"),
            exportButton: document.getElementById("exportButton"),
            clearButton: document.getElementById("clearButton"),
            providerLabel: document.getElementById("providerLabel"),
            chatTitle: document.getElementById("chatTitle"),
            connectionPill: document.getElementById("connectionPill"),
            messages: document.getElementById("messages"),
            composer: document.getElementById("composer"),
            attachmentStrip: document.getElementById("attachmentStrip"),
            imageInput: document.getElementById("imageInput"),
            attachButton: document.getElementById("attachButton"),
            promptInput: document.getElementById("promptInput"),
            stopButton: document.getElementById("stopButton"),
            sendButton: document.getElementById("sendButton")
        };

        state.chats = loadChats();
        if (!state.chats.length) {
            createChat(false);
        }
        state.activeChatId = state.chats[0].id;

        elements.providerSelect.value = state.settings.provider;
        elements.endpointInput.value = state.settings.endpoint;
        elements.endpointInput.placeholder = config.addressPlaceholderFor(state.settings.provider);
        elements.openaiApiSelect.value = state.settings.openaiApi;
        elements.modelInput.value = state.settings.model;
        elements.systemPromptInput.value = state.settings.systemPrompt;
        elements.temperatureInput.value = state.settings.temperature;
        elements.maxTokensInput.value = state.settings.maxTokens;
        elements.reasoningSelect.value = state.settings.reasoning;
        elements.streamCheckbox.checked = state.settings.stream;
        elements.apiKeyInput.value = loadApiKey();
        state.endpointWasAutoFilled = config.isDefaultAddress(state.settings.provider, state.settings.endpoint);

        bindEvents();
        updateProviderControls();
        updateRequestPreview();
        updateProviderLabels();
        renderAll();
        autosizePrompt();
    }

    function bindEvents() {
        elements.newChatButton.addEventListener("click", function() {
            createChat(true);
        });

        elements.providerSelect.addEventListener("change", function() {
            var previous = state.settings.provider;
            var next = elements.providerSelect.value;
            var currentEndpoint = elements.endpointInput.value.trim();
            var currentWasDefault = state.endpointWasAutoFilled || config.isDefaultAddress(previous, currentEndpoint);
            var nextProvider = config.getProvider(next);
            state.settings.provider = next;
            if (nextProvider.defaultAddress) {
                state.settings.endpoint = nextProvider.defaultAddress;
                state.endpointWasAutoFilled = true;
            } else {
                state.settings.endpoint = currentWasDefault ? "" : currentEndpoint;
                state.endpointWasAutoFilled = false;
            }
            elements.endpointInput.value = state.settings.endpoint;
            elements.endpointInput.placeholder = config.addressPlaceholderFor(next);
            state.settings.model = "";
            elements.modelInput.value = "";
            renderModelOptions([]);
            clearFeedback();
            state.status = null;
            saveSettings();
            updateProviderControls();
            updateRequestPreview();
            updateProviderLabels();
            renderAll();
        });

        elements.openaiApiSelect.addEventListener("change", function() {
            state.settings.openaiApi = elements.openaiApiSelect.value;
            clearFeedback();
            state.status = null;
            saveSettings();
            updateRequestPreview();
            updateProviderLabels();
        });

        elements.endpointInput.addEventListener("input", function() {
            state.endpointWasAutoFilled = false;
            syncSettingsFromForm();
        });

        [
            elements.modelInput,
            elements.systemPromptInput,
            elements.temperatureInput,
            elements.maxTokensInput,
            elements.reasoningSelect
        ].forEach(function(input) {
            input.addEventListener("input", syncSettingsFromForm);
        });

        elements.reasoningSelect.addEventListener("change", syncSettingsFromForm);

        elements.endpointInput.addEventListener("blur", normalizeEndpointInput);
        elements.streamCheckbox.addEventListener("change", syncSettingsFromForm);

        elements.apiKeyInput.addEventListener("input", function() {
            var apiKey = elements.apiKeyInput.value.trim();
            if (apiKey) {
                localStorage.setItem(API_KEY, apiKey);
            } else {
                localStorage.removeItem(API_KEY);
            }
        });

        elements.attachButton.addEventListener("click", function() {
            elements.imageInput.click();
        });

        elements.imageInput.addEventListener("change", function() {
            addImageFiles(elements.imageInput.files).catch(function(error) {
                setFeedback(explainError(error), "error");
            }).finally(function() {
                elements.imageInput.value = "";
            });
        });

        elements.loadModelsButton.addEventListener("click", function() {
            loadModels(true).catch(function(error) {
                setStatus(explainError(error), "error");
            });
        });

        elements.testButton.addEventListener("click", testConnection);
        elements.exportButton.addEventListener("click", exportChats);
        elements.clearButton.addEventListener("click", clearAllChats);
        elements.stopButton.addEventListener("click", stopGeneration);

        elements.promptInput.addEventListener("input", autosizePrompt);
        elements.promptInput.addEventListener("keydown", function(event) {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                elements.composer.requestSubmit();
            }
        });

        elements.composer.addEventListener("submit", sendPrompt);
    }

    function syncSettingsFromForm() {
        state.settings.endpoint = elements.endpointInput.value.trim();
        state.settings.model = elements.modelInput.value.trim();
        state.settings.openaiApi = elements.openaiApiSelect.value;
        state.settings.systemPrompt = elements.systemPromptInput.value;
        state.settings.temperature = clampNumber(elements.temperatureInput.value, 0, 2, 0.7);
        state.settings.maxTokens = Math.max(1, parseInt(elements.maxTokensInput.value, 10) || 2048);
        state.settings.reasoning = elements.reasoningSelect.value;
        state.settings.stream = elements.streamCheckbox.checked;
        clearFeedback();
        state.status = null;
        saveSettings();
        updateRequestPreview();
        updateProviderLabels();
    }

    function normalizeEndpointInput() {
        var normalized = config.normalizeAddress(elements.endpointInput.value, state.settings.provider);
        if (normalized && normalized !== elements.endpointInput.value.trim()) {
            elements.endpointInput.value = normalized;
            state.settings.endpoint = normalized;
            saveSettings();
        }
        updateRequestPreview();
    }

    function loadSettings() {
        try {
            var stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
            var settings = Object.assign({}, defaultSettings, stored);
            if (!providerDefaults[settings.provider]) {
                settings.provider = defaultSettings.provider;
                settings.endpoint = defaultSettings.endpoint;
            }
            if (!settings.endpoint && providerDefaults[settings.provider].defaultAddress) {
                settings.endpoint = providerDefaults[settings.provider].defaultAddress;
            }
            if (!settings.openaiApi) {
                settings.openaiApi = defaultSettings.openaiApi;
            }
            if (!settings.reasoning) {
                settings.reasoning = defaultSettings.reasoning;
            }
            return settings;
        } catch (error) {
            return Object.assign({}, defaultSettings);
        }
    }

    function saveSettings() {
        var safeSettings = Object.assign({}, state.settings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(safeSettings));
    }

    function loadApiKey() {
        return localStorage.getItem(API_KEY) || "";
    }

    function loadChats() {
        try {
            var stored = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
            return Array.isArray(stored) ? stored : [];
        } catch (error) {
            return [];
        }
    }

    function saveChats() {
        localStorage.setItem(CHAT_KEY, JSON.stringify(state.chats));
    }

    function createChat(makeActive) {
        var chat = {
            id: "chat-" + Date.now() + "-" + Math.random().toString(16).slice(2),
            title: "新会话",
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        state.chats.unshift(chat);
        if (makeActive) {
            state.activeChatId = chat.id;
            saveChats();
            renderAll();
            elements.promptInput.focus();
        }
        return chat;
    }

    function getActiveChat() {
        var chat = state.chats.find(function(item) {
            return item.id === state.activeChatId;
        });
        if (!chat) {
            chat = createChat(false);
            state.activeChatId = chat.id;
        }
        return chat;
    }

    function renderAll() {
        renderChatList();
        renderMessages();
        renderPendingImages();
        updateHeader();
        updateSendState();
    }

    function renderChatList() {
        elements.chatList.textContent = "";
        state.chats.forEach(function(chat) {
            var row = document.createElement("div");
            row.className = "chat-row" + (chat.id === state.activeChatId ? " is-active" : "");

            var button = document.createElement("button");
            button.type = "button";
            button.className = "chat-item";
            button.addEventListener("click", function() {
                state.activeChatId = chat.id;
                renderAll();
            });

            var title = document.createElement("strong");
            title.textContent = chat.title || "新会话";
            var time = document.createElement("span");
            time.textContent = formatTime(chat.updatedAt);
            button.appendChild(title);
            button.appendChild(time);

            var deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "chat-delete";
            deleteButton.textContent = "删除";
            deleteButton.title = "删除会话";
            deleteButton.disabled = state.isSending;
            deleteButton.addEventListener("click", function(event) {
                event.stopPropagation();
                deleteChat(chat.id);
            });

            row.appendChild(button);
            row.appendChild(deleteButton);
            elements.chatList.appendChild(row);
        });
    }

    function deleteChat(chatId) {
        if (state.isSending) {
            return;
        }
        var chat = state.chats.find(function(item) {
            return item.id === chatId;
        });
        if (!chat || !confirm("删除会话“" + (chat.title || "新会话") + "”？")) {
            return;
        }
        state.chats = state.chats.filter(function(item) {
            return item.id !== chatId;
        });
        if (!state.chats.length) {
            createChat(false);
        }
        if (state.activeChatId === chatId) {
            state.activeChatId = state.chats[0].id;
        }
        saveChats();
        renderAll();
    }

    function renderMessages() {
        var chat = getActiveChat();
        elements.messages.textContent = "";

        if (!chat.messages.length) {
            var empty = document.createElement("div");
            empty.className = "empty-state";
            var text = document.createElement("p");
            text.textContent = "还没有消息。";
            empty.appendChild(text);
            elements.messages.appendChild(empty);
            return;
        }

        chat.messages.forEach(function(message) {
            var article = document.createElement("article");
            article.className = "message " + message.role + (message.error ? " error" : "");

            var role = document.createElement("div");
            role.className = "message-role";
            role.textContent = roleLabel(message.role);

            var body = document.createElement("div");
            body.className = "message-body";
            body.textContent = message.content || (message.role === "assistant" ? "..." : "");
            if (Array.isArray(message.images) && message.images.length) {
                body.appendChild(renderMessageImages(message.images));
            }

            article.appendChild(role);
            article.appendChild(body);
            elements.messages.appendChild(article);
        });

        elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    function renderMessageImages(images) {
        var wrap = document.createElement("div");
        wrap.className = "message-images";
        images.forEach(function(image) {
            var img = document.createElement("img");
            img.src = image.dataUrl;
            img.alt = image.name || "图片";
            wrap.appendChild(img);
        });
        return wrap;
    }

    function renderPendingImages() {
        elements.attachmentStrip.textContent = "";
        elements.attachmentStrip.hidden = !state.pendingImages.length;
        state.pendingImages.forEach(function(image, index) {
            var chip = document.createElement("div");
            chip.className = "attachment-chip";

            var img = document.createElement("img");
            img.src = image.dataUrl;
            img.alt = image.name || "图片";

            var name = document.createElement("span");
            name.textContent = image.name || "图片";

            var remove = document.createElement("button");
            remove.className = "ghost-button remove-attachment";
            remove.type = "button";
            remove.textContent = "移除";
            remove.addEventListener("click", function() {
                state.pendingImages.splice(index, 1);
                renderPendingImages();
            });

            chip.appendChild(img);
            chip.appendChild(name);
            chip.appendChild(remove);
            elements.attachmentStrip.appendChild(chip);
        });
    }

    function updateHeader() {
        var chat = getActiveChat();
        elements.chatTitle.textContent = chat.title || "新会话";
        updateProviderLabels();
    }

    function updateProviderLabels() {
        var provider = config.getProvider(state.settings.provider);
        var model = state.settings.model || "未选择模型";
        elements.providerLabel.textContent = provider.label;
        if (state.status) {
            applyStatus(state.status.text, state.status.tone);
            return;
        }
        elements.statusText.textContent = provider.label + " · " + model;
        elements.connectionPill.textContent = state.isSending ? "生成中" : provider.label;
        elements.connectionPill.className = "status-pill";
    }

    function updateProviderControls() {
        var isOpenAi = state.settings.provider === "openai";
        elements.openaiApiField.hidden = !isOpenAi;
        elements.openaiApiSelect.value = state.settings.openaiApi;
        elements.endpointInput.placeholder = config.addressPlaceholderFor(state.settings.provider);
    }

    function updateRequestPreview() {
        var modelsUrl = config.requestUrlFor(state.settings, "models");
        var chatUrl = config.requestUrlFor(state.settings, "chat");
        var address = config.normalizeAddress(state.settings.endpoint, state.settings.provider);
        var host = config.hostLabelFor(state.settings.endpoint, state.settings.provider);
        var addressText = address || "待填写地址";
        var hostText = host || "待填写地址";
        var modelsText = modelsUrl || "待填写地址";
        var chatText = chatUrl || "待填写地址";
        elements.requestPreview.innerHTML = "";
        elements.requestPreview.appendChild(previewLine("地址: " + addressText));
        elements.requestPreview.appendChild(previewLine("主机: " + hostText));
        elements.requestPreview.appendChild(previewLine("模型 GET: " + modelsText));
        elements.requestPreview.appendChild(previewLine("对话 POST: " + chatText));
    }

    function previewLine(text) {
        var line = document.createElement("span");
        line.className = "preview-line";
        line.textContent = text;
        return line;
    }

    function updateSendState() {
        elements.sendButton.disabled = state.isSending;
        elements.stopButton.disabled = !state.isSending;
        elements.promptInput.disabled = state.isSending;
        elements.providerSelect.disabled = state.isSending;
        elements.openaiApiSelect.disabled = state.isSending;
        elements.endpointInput.disabled = state.isSending;
        elements.modelInput.disabled = state.isSending;
        elements.systemPromptInput.disabled = state.isSending;
        elements.temperatureInput.disabled = state.isSending;
        elements.maxTokensInput.disabled = state.isSending;
        elements.reasoningSelect.disabled = state.isSending;
        elements.streamCheckbox.disabled = state.isSending;
        elements.apiKeyInput.disabled = state.isSending;
        elements.attachButton.disabled = state.isSending;
        elements.loadModelsButton.disabled = state.isSending || state.isLoadingModels;
        elements.testButton.disabled = state.isSending || state.isTesting;
    }

    async function sendPrompt(event) {
        event.preventDefault();
        normalizeEndpointInput();
        syncSettingsFromForm();

        var prompt = elements.promptInput.value.trim();
        var images = state.pendingImages.slice();
        if ((!prompt && !images.length) || state.isSending) {
            return;
        }
        if (!state.settings.endpoint) {
            setStatus("请先填写地址", "error");
            setFeedback("请先填写服务地址。", "error");
            return;
        }
        if (!state.settings.model) {
            setStatus("请先填写模型名", "error");
            setFeedback("请先读取模型或手动填写模型名。", "warn");
            return;
        }

        var chat = getActiveChat();
        var userMessage = createMessage("user", prompt, images);
        var assistantMessage = createMessage("assistant", "");
        chat.messages.push(userMessage, assistantMessage);
        chat.updatedAt = new Date().toISOString();
        if (chat.title === "新会话") {
            chat.title = makeTitle(prompt);
        }
        elements.promptInput.value = "";
        state.pendingImages = [];
        renderPendingImages();
        autosizePrompt();

        state.abortController = new AbortController();
        state.isSending = true;
        setStatus("生成中", "ok");
        setFeedback("正在请求 " + config.requestUrlFor(state.settings, "chat"), "ok");
        saveChats();
        renderAll();

        try {
            await requestCompletion(chat, assistantMessage);
            if (!assistantMessage.content.trim()) {
                assistantMessage.content = "模型没有返回内容。";
            }
            setStatus("完成", "ok");
            setFeedback("请求完成。", "ok");
        } catch (error) {
            if (error.name === "AbortError") {
                if (!assistantMessage.content.trim()) {
                    assistantMessage.content = "已停止。";
                }
                setStatus("已停止", "warn");
                setFeedback("已停止生成。", "warn");
            } else {
                assistantMessage.error = true;
                assistantMessage.content = explainError(error);
                setStatus("请求失败", "error");
                setFeedback(explainError(error), "error");
            }
        } finally {
            chat.updatedAt = new Date().toISOString();
            state.abortController = null;
            state.isSending = false;
            saveChats();
            renderAll();
            elements.promptInput.focus();
        }
    }

    async function requestCompletion(chat, assistantMessage) {
        var provider = config.getProvider(state.settings.provider);
        var messages = buildMessages(chat);
        if (provider.mode === "ollama") {
            await requestOllama(messages, assistantMessage);
        } else if (provider.mode === "lmstudioRest") {
            await requestLmStudioRest(chat, assistantMessage);
        } else if (provider.mode === "anthropic") {
            await requestAnthropic(messages, assistantMessage);
        } else if (state.settings.openaiApi === "responses") {
            await requestOpenAiResponses(messages, assistantMessage);
        } else {
            await requestOpenAiCompatible(messages, assistantMessage);
        }
    }

    function buildMessages(chat) {
        var messages = chat.messages
            .filter(function(message) {
                return !message.error && (message.content.trim() || (Array.isArray(message.images) && message.images.length));
            })
            .map(function(message) {
                return {
                    role: message.role === "assistant" ? "assistant" : "user",
                    content: message.content,
                    images: Array.isArray(message.images) ? message.images : []
                };
            });

        if (state.settings.systemPrompt.trim()) {
            messages.unshift({
                role: "system",
                content: state.settings.systemPrompt.trim()
            });
        }
        return messages;
    }

    async function requestOpenAiCompatible(messages, assistantMessage) {
        var body = {
            model: state.settings.model,
            messages: messages.map(toOpenAiChatMessage),
            temperature: state.settings.temperature,
            max_tokens: state.settings.maxTokens,
            stream: state.settings.stream
        };
        addChatReasoning(body);
        var response = await fetch(config.requestUrlFor(state.settings, "chat"), {
            method: "POST",
            headers: requestHeaders({ auth: "bearer", json: true }),
            body: JSON.stringify(body),
            signal: state.abortController.signal
        });
        await ensureOk(response);

        if (state.settings.stream && response.body && isEventStream(response)) {
            await readSse(response, function(json) {
                var delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
                if (delta) {
                    assistantMessage.content += delta;
                    scheduleMessageRender();
                }
            });
            return;
        }

        var data = await response.json();
        assistantMessage.content = (((data.choices || [])[0] || {}).message || {}).content || "";
    }

    async function requestOpenAiResponses(messages, assistantMessage) {
        var input = messages.filter(function(message) {
            return message.role !== "system";
        }).map(toOpenAiResponseInput);
        var body = {
            model: state.settings.model,
            input: input,
            temperature: state.settings.temperature,
            max_output_tokens: state.settings.maxTokens,
            stream: state.settings.stream
        };
        if (state.settings.systemPrompt.trim()) {
            body.instructions = state.settings.systemPrompt.trim();
        }
        addResponsesReasoning(body);
        var response = await fetch(config.requestUrlFor(state.settings, "chat"), {
            method: "POST",
            headers: requestHeaders({ auth: "bearer", json: true }),
            body: JSON.stringify(body),
            signal: state.abortController.signal
        });
        await ensureOk(response);

        if (state.settings.stream && response.body && isEventStream(response)) {
            await readSse(response, function(json) {
                if (json.type === "response.output_text.delta" && typeof json.delta === "string") {
                    assistantMessage.content += json.delta;
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "response.completed" && json.response && !assistantMessage.content.trim()) {
                    assistantMessage.content = extractOpenAiResponseText(json.response);
                }
                if (json.type === "error" && json.error) {
                    throw new Error(json.error.message || "OpenAI Responses stream error");
                }
            });
            return;
        }

        var data = await response.json();
        assistantMessage.content = extractOpenAiResponseText(data);
    }

    async function requestLmStudioRest(chat, assistantMessage) {
        var latestUserMessage = chat.messages.slice().reverse().find(function(message) {
            return message.role === "user" && message.content.trim();
        });
        var body = {
            model: state.settings.model,
            input: latestUserMessage ? toLmStudioInput(latestUserMessage) : "",
            stream: state.settings.stream,
            max_output_tokens: state.settings.maxTokens
        };

        addLmStudioReasoning(body);
        if (state.settings.temperature !== null && state.settings.temperature !== undefined) {
            body.temperature = state.settings.temperature;
        }
        if (state.settings.systemPrompt.trim()) {
            body.system_prompt = state.settings.systemPrompt.trim();
        }
        if (chat.lmStudioResponseId) {
            body.previous_response_id = chat.lmStudioResponseId;
        }

        var response = await fetch(config.requestUrlFor(state.settings, "chat"), {
            method: "POST",
            headers: requestHeaders({ auth: "bearer", json: true }),
            body: JSON.stringify(body),
            signal: state.abortController.signal
        });
        await ensureOk(response);

        if (state.settings.stream && response.body && isEventStream(response)) {
            await readSse(response, function(json) {
                if (json.type === "message.delta" && typeof json.content === "string") {
                    assistantMessage.content += json.content;
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "chat.end" && json.result) {
                    chat.lmStudioResponseId = json.result.response_id || chat.lmStudioResponseId;
                    if (!assistantMessage.content.trim()) {
                        assistantMessage.content = extractLmStudioRestText(json.result);
                    }
                }
                if (json.type === "error" && json.error) {
                    throw new Error(json.error.message || "LM Studio REST v1 stream error");
                }
            });
            return;
        }

        var data = await response.json();
        chat.lmStudioResponseId = data.response_id || chat.lmStudioResponseId;
        assistantMessage.content = extractLmStudioRestText(data);
    }

    async function requestOllama(messages, assistantMessage) {
        var body = {
            model: state.settings.model,
            messages: messages.map(toOllamaMessage),
            stream: state.settings.stream,
            options: {
                temperature: state.settings.temperature,
                num_predict: state.settings.maxTokens
            }
        };
        var response = await fetch(config.requestUrlFor(state.settings, "chat"), {
            method: "POST",
            headers: requestHeaders({ json: true }),
            body: JSON.stringify(body),
            signal: state.abortController.signal
        });
        await ensureOk(response);

        if (state.settings.stream && response.body && !isJsonResponse(response)) {
            await readJsonLines(response, function(json) {
                var delta = json.message && json.message.content;
                if (delta) {
                    assistantMessage.content += delta;
                    scheduleMessageRender();
                }
            });
            return;
        }

        var data = await response.json();
        assistantMessage.content = (data.message && data.message.content) || "";
    }

    async function requestAnthropic(messages, assistantMessage) {
        var body = {
            model: state.settings.model,
            messages: messages.filter(function(message) {
                return message.role !== "system";
            }).map(toAnthropicMessage),
            max_tokens: state.settings.maxTokens,
            stream: state.settings.stream
        };
        if (state.settings.systemPrompt.trim()) {
            body.system = state.settings.systemPrompt.trim();
        }

        var response = await fetch(config.requestUrlFor(state.settings, "chat"), {
            method: "POST",
            headers: requestHeaders({ auth: "x-api-key", json: true, anthropicVersion: true }),
            body: JSON.stringify(body),
            signal: state.abortController.signal
        });
        await ensureOk(response);

        if (state.settings.stream && response.body && isEventStream(response)) {
            await readSse(response, function(json) {
                if (json.type === "content_block_delta" && json.delta) {
                    if (typeof json.delta.text === "string") {
                        assistantMessage.content += json.delta.text;
                        scheduleMessageRender();
                        return;
                    }
                    if (typeof json.delta.content === "string") {
                        assistantMessage.content += json.delta.content;
                        scheduleMessageRender();
                        return;
                    }
                }
                if (json.type === "message.delta" && typeof json.content === "string") {
                    assistantMessage.content += json.content;
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "message_stop" || json.type === "message.end") {
                    return;
                }
                if (json.type === "error" && json.error) {
                    throw new Error(json.error.message || "Anthropic stream error");
                }
            });
            return;
        }

        var data = await response.json();
        assistantMessage.content = extractAnthropicText(data);
    }

    function toOpenAiChatMessage(message) {
        if (!message.images || !message.images.length || message.role === "system") {
            return {
                role: message.role,
                content: message.content
            };
        }
        var content = [];
        if (message.content) {
            content.push({
                type: "text",
                text: message.content
            });
        }
        message.images.forEach(function(image) {
            content.push({
                type: "image_url",
                image_url: {
                    url: image.dataUrl
                }
            });
        });
        return {
            role: message.role,
            content: content
        };
    }

    function toOpenAiResponseInput(message) {
        var content = [];
        if (message.content) {
            content.push({
                type: "input_text",
                text: message.content
            });
        }
        (message.images || []).forEach(function(image) {
            content.push({
                type: "input_image",
                image_url: image.dataUrl
            });
        });
        return {
            role: message.role,
            content: content.length ? content : message.content
        };
    }

    function toLmStudioInput(message) {
        if (!message.images || !message.images.length) {
            return message.content;
        }
        var input = [];
        if (message.content) {
            input.push({
                type: "text",
                content: message.content
            });
        }
        message.images.forEach(function(image) {
            input.push({
                type: "image",
                data_url: image.dataUrl
            });
        });
        return input;
    }

    function toOllamaMessage(message) {
        var payload = {
            role: message.role,
            content: message.content
        };
        if (message.images && message.images.length && message.role !== "system") {
            payload.images = message.images.map(function(image) {
                return image.dataUrl.split(",")[1] || "";
            }).filter(Boolean);
        }
        return payload;
    }

    function toAnthropicMessage(message) {
        if (!message.images || !message.images.length) {
            return {
                role: message.role,
                content: message.content
            };
        }
        var content = [];
        if (message.content) {
            content.push({
                type: "text",
                text: message.content
            });
        }
        message.images.forEach(function(image) {
            content.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: image.type || "image/png",
                    data: image.dataUrl.split(",")[1] || ""
                }
            });
        });
        return {
            role: message.role,
            content: content
        };
    }

    function addLmStudioReasoning(body) {
        var reasoning = state.settings.reasoning;
        if (!reasoning || reasoning === "auto") {
            return;
        }
        if (reasoning === "off") {
            body.reasoning = "off";
        } else {
            body.reasoning = "on";
        }
    }

    function addResponsesReasoning(body) {
        var reasoning = state.settings.reasoning;
        if (!reasoning || reasoning === "auto") {
            return;
        }
        if (reasoning === "off") {
            reasoning = "none";
        }
        body.reasoning = {
            effort: reasoning
        };
    }

    function addChatReasoning(body) {
        var reasoning = state.settings.reasoning;
        if (!reasoning || reasoning === "auto") {
            return;
        }
        if (reasoning === "off") {
            body.reasoning_effort = "none";
            return;
        }
        if (reasoning === "minimal") {
            body.reasoning_effort = "minimal";
            return;
        }
        body.reasoning_effort = reasoning;
    }

    function requestHeaders(options) {
        options = options || {};
        var headers = {};
        if (options.json) {
            headers["Content-Type"] = "application/json";
        }
        var apiKey = elements.apiKeyInput.value.trim();
        if (apiKey && options.auth === "bearer") {
            headers.Authorization = "Bearer " + apiKey;
        } else if (apiKey && options.auth === "x-api-key") {
            headers["x-api-key"] = apiKey;
        }
        if (options.anthropicVersion) {
            headers["anthropic-version"] = "2023-06-01";
        }
        return headers;
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

    function isEventStream(response) {
        return (response.headers.get("content-type") || "").toLowerCase().indexOf("text/event-stream") !== -1;
    }

    function isJsonResponse(response) {
        return (response.headers.get("content-type") || "").toLowerCase().indexOf("application/json") !== -1;
    }

    function extractLmStudioRestText(data) {
        if (!data || !Array.isArray(data.output)) {
            return "";
        }
        return data.output.map(function(item) {
            if (!item || item.type !== "message") {
                return "";
            }
            return item.content || "";
        }).join("").trim();
    }

    function extractAnthropicText(data) {
        if (!data) {
            return "";
        }
        if (typeof data.content === "string") {
            return data.content;
        }
        if (!Array.isArray(data.content)) {
            return "";
        }
        return data.content.map(function(item) {
            return item && item.type === "text" ? item.text || "" : "";
        }).join("").trim();
    }

    function extractOpenAiResponseText(data) {
        if (!data) {
            return "";
        }
        if (typeof data.output_text === "string") {
            return data.output_text;
        }
        if (!Array.isArray(data.output)) {
            return "";
        }
        return data.output.map(function(item) {
            if (!item || !Array.isArray(item.content)) {
                return "";
            }
            return item.content.map(function(content) {
                if (!content) {
                    return "";
                }
                if (typeof content.text === "string") {
                    return content.text;
                }
                if (typeof content.content === "string") {
                    return content.content;
                }
                return "";
            }).join("");
        }).join("").trim();
    }

    async function readSse(response, onData) {
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        while (true) {
            var result = await reader.read();
            if (result.done) {
                break;
            }
            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            for (var i = 0; i < lines.length; i += 1) {
                var line = lines[i].trim();
                if (!line || line.indexOf("data:") !== 0) {
                    continue;
                }
                var data = line.slice(5).trim();
                if (data === "[DONE]") {
                    return;
                }
                try {
                    onData(JSON.parse(data));
                } catch (error) {
                    throw new Error("流式响应解析失败: " + data.slice(0, 120));
                }
            }
        }
    }

    async function readJsonLines(response, onData) {
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        while (true) {
            var result = await reader.read();
            if (result.done) {
                break;
            }
            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            for (var i = 0; i < lines.length; i += 1) {
                var line = lines[i].trim();
                if (!line) {
                    continue;
                }
                try {
                    onData(JSON.parse(line));
                } catch (error) {
                    throw new Error("流式响应解析失败: " + line.slice(0, 120));
                }
            }
        }
    }

    var renderQueued = false;

    function scheduleMessageRender() {
        if (renderQueued) {
            return;
        }
        renderQueued = true;
        requestAnimationFrame(function() {
            renderQueued = false;
            renderMessages();
        });
    }

    async function loadModels(showStatus) {
        normalizeEndpointInput();
        syncSettingsFromForm();
        var provider = config.getProvider(state.settings.provider);
        var modelEndpoint = modelsEndpointFor(provider);
        if (showStatus) {
            state.isLoadingModels = true;
            setButtonLoading(elements.loadModelsButton, true, "读取中", "读取模型");
            updateSendState();
        }
        try {
            if (showStatus) {
                setStatus("正在读取模型", "ok");
            }
            setFeedback("正在请求 " + modelEndpoint.url, "ok");
            var response = await fetch(modelEndpoint.url, {
                headers: modelEndpoint.headers
            });
            await ensureOk(response);
            var data = await response.json();
            var models = extractModelNames(provider, data);
            renderModelOptions(models);
            if (!state.settings.model && models.length) {
                state.settings.model = models[0];
                elements.modelInput.value = models[0];
                saveSettings();
                updateProviderLabels();
            }
            setStatus(models.length ? "模型读取完成" : "连接成功，无模型列表", models.length ? "ok" : "warn");
            setFeedback(models.length ? "已读取 " + models.length + " 个模型。" : "接口可访问，但响应里没有模型列表。", models.length ? "ok" : "warn");
            return models;
        } catch (error) {
            setStatus("模型读取失败", "error");
            setFeedback(explainError(error), "error");
            throw error;
        } finally {
            if (showStatus) {
                state.isLoadingModels = false;
                setButtonLoading(elements.loadModelsButton, false, "读取中", "读取模型");
                updateSendState();
            }
        }
    }

    function modelsEndpointFor(provider) {
        if (provider.mode === "ollama") {
            return {
                url: config.requestUrlFor(state.settings, "models"),
                headers: {}
            };
        }
        if (provider.mode === "lmstudioRest") {
            return {
                url: config.requestUrlFor(state.settings, "models"),
                headers: requestHeaders({ auth: "bearer" })
            };
        }
        if (provider.mode === "anthropic") {
            return {
                url: config.requestUrlFor(state.settings, "models"),
                headers: requestHeaders({ auth: "x-api-key", anthropicVersion: true })
            };
        }
        return {
            url: config.requestUrlFor(state.settings, "models"),
            headers: requestHeaders({ auth: "bearer" })
        };
    }

    function extractModelNames(provider, data) {
        if (provider.mode === "ollama") {
            return (data.models || []).map(function(model) { return model.name; });
        }
        if (provider.mode === "lmstudioRest" && Array.isArray(data.models)) {
            return extractLmStudioModelNames(data.models);
        }
        if (Array.isArray(data.data)) {
            return uniqueValues(data.data.map(modelNameFromItem).filter(isChatModelName));
        }
        if (Array.isArray(data.models)) {
            return uniqueValues(data.models.map(modelNameFromItem).filter(isChatModelName));
        }
        return [];
    }

    function extractLmStudioModelNames(models) {
        var loaded = [];
        var available = [];
        models.forEach(function(model) {
            if (!model || model.type === "embedding") {
                return;
            }
            if (Array.isArray(model.loaded_instances) && model.loaded_instances.length) {
                model.loaded_instances.forEach(function(instance) {
                    if (instance && instance.id) {
                        loaded.push(instance.id);
                    }
                });
                return;
            }
            available.push(modelNameFromItem(model));
        });
        return uniqueValues(loaded.concat(available).filter(isChatModelName));
    }

    function modelNameFromItem(model) {
        if (typeof model === "string") {
            return model;
        }
        if (!model) {
            return "";
        }
        if (Array.isArray(model.loaded_instances) && model.loaded_instances.length && model.loaded_instances[0].id) {
            return model.loaded_instances[0].id;
        }
        return model.id || model.name || model.key || model.display_name || "";
    }

    function uniqueValues(values) {
        var seen = {};
        return values.filter(function(value) {
            if (seen[value]) {
                return false;
            }
            seen[value] = true;
            return true;
        });
    }

    function isChatModelName(value) {
        return Boolean(value) && value.toLowerCase().indexOf("embedding") === -1 && value.toLowerCase().indexOf("embed") === -1;
    }

    async function testConnection() {
        state.isTesting = true;
        setButtonLoading(elements.testButton, true, "测试中", "测试连接");
        updateSendState();
        try {
            setStatus("正在测试连接", "ok");
            var models = await loadModels(false);
            setStatus("连接可用", "ok");
            setFeedback(models.length ? "连接可用，已读取 " + models.length + " 个模型。" : "连接可用，但没有模型列表。", models.length ? "ok" : "warn");
        } catch (error) {
            setStatus(explainError(error), "error");
            setFeedback(explainError(error), "error");
        } finally {
            state.isTesting = false;
            setButtonLoading(elements.testButton, false, "测试中", "测试连接");
            updateSendState();
        }
    }

    function renderModelOptions(models) {
        elements.modelOptions.textContent = "";
        models.forEach(function(model) {
            var option = document.createElement("option");
            option.value = model;
            elements.modelOptions.appendChild(option);
        });
        elements.modelInput.placeholder = models.length ? "选择或输入模型名" : "手动输入模型名";
    }

    function stopGeneration() {
        if (state.abortController) {
            state.abortController.abort();
        }
    }

    function exportChats() {
        var payload = {
            exportedAt: new Date().toISOString(),
            settings: Object.assign({}, state.settings, { apiKey: undefined }),
            chats: state.chats
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "local-ai-chats-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function clearAllChats() {
        if (!confirm("清空所有本地会话记录？")) {
            return;
        }
        state.chats = [];
        createChat(false);
        state.activeChatId = state.chats[0].id;
        saveChats();
        renderAll();
    }

    function setStatus(text, tone) {
        state.status = {
            text: text,
            tone: tone
        };
        applyStatus(text, tone);
    }

    function applyStatus(text, tone) {
        elements.connectionPill.textContent = text;
        elements.connectionPill.className = "status-pill" + (tone === "warn" ? " is-warn" : "") + (tone === "error" ? " is-error" : "");
        elements.statusText.textContent = text;
    }

    function setFeedback(text, tone) {
        elements.connectionFeedback.textContent = text;
        elements.connectionFeedback.className = "connection-feedback" + (tone ? " is-" + tone : "");
    }

    function clearFeedback() {
        elements.connectionFeedback.textContent = "";
        elements.connectionFeedback.className = "connection-feedback";
    }

    function setButtonLoading(button, loading, loadingText, normalText) {
        button.disabled = loading;
        button.textContent = loading ? loadingText : normalText;
    }

    async function addImageFiles(fileList) {
        var files = Array.from(fileList || []).filter(function(file) {
            return file.type.indexOf("image/") === 0;
        });
        if (!files.length) {
            return;
        }
        var loaded = await Promise.all(files.map(readImageFile));
        state.pendingImages = state.pendingImages.concat(loaded);
        renderPendingImages();
        setFeedback("已添加 " + loaded.length + " 张图片。", "ok");
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

    function createMessage(role, content, images) {
        return {
            role: role,
            content: content,
            images: images || [],
            createdAt: new Date().toISOString()
        };
    }

    function makeTitle(text) {
        return text.replace(/\s+/g, " ").slice(0, 28) || "新会话";
    }

    function roleLabel(role) {
        if (role === "user") {
            return "你";
        }
        if (role === "assistant") {
            return "AI";
        }
        return role;
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

    function clampNumber(value, min, max, fallback) {
        var number = Number(value);
        if (!Number.isFinite(number)) {
            return fallback;
        }
        return Math.min(max, Math.max(min, number));
    }

    function autosizePrompt() {
        elements.promptInput.style.height = "auto";
        elements.promptInput.style.height = Math.min(elements.promptInput.scrollHeight, 180) + "px";
    }

    function explainError(error) {
        var message = error && error.message ? error.message : String(error);
        if (message === "Failed to fetch") {
            return "无法访问端点。请确认本地服务已启动，并允许当前页面跨域访问。";
        }
        return message;
    }
})();
