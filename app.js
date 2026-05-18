(function() {
    "use strict";

    var config = window.LocalAiConfig;
    var markdown = window.LocalAiMarkdown;
    var presetsApi = window.LocalAiPresets;
    var secrets = window.LocalAiSecrets;
    var ui = window.LocalAiUi;
    var CHAT_KEY = config.STORAGE_KEYS.chats;
    var SETTINGS_KEY = config.STORAGE_KEYS.settings;
    var API_KEY = config.STORAGE_KEYS.apiKey;
    var providerDefaults = config.PROVIDERS;
    var defaultSettings = config.DEFAULT_SETTINGS;

    var elements = {};
    var modelPicker = null;
    var state = {
        chats: [],
        activeChatId: "",
        settings: loadSettings(),
        pendingImages: [],
        modelOptions: [],
        endpointWasAutoFilled: false,
        abortController: null,
        isSending: false,
        isLoadingModels: false,
        chatPresets: [],
        activeChatPreset: null,
        editingMessageId: "",
        reasoningOpenState: {},
        activeGeneratingMessageId: "",
        status: null
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        elements = {
            statusText: document.getElementById("statusText"),
            sidebar: document.querySelector(".sidebar"),
            sidebarOpenButton: document.getElementById("sidebarOpenButton"),
            sidebarCloseButton: document.getElementById("sidebarCloseButton"),
            sidebarScrim: document.getElementById("sidebarScrim"),
            chatList: document.getElementById("chatList"),
            newChatButton: document.getElementById("newChatButton"),
            chatPresetSelect: document.getElementById("chatPresetSelect"),
            providerSelect: document.getElementById("providerSelect"),
            openaiApiField: document.getElementById("openaiApiField"),
            openaiApiSelect: document.getElementById("openaiApiSelect"),
            endpointInput: document.getElementById("endpointInput"),
            requestPreview: document.getElementById("requestPreview"),
            modelPicker: document.getElementById("modelPicker"),
            modelInput: document.getElementById("modelInput"),
            modelMenuButton: document.getElementById("modelMenuButton"),
            modelMenu: document.getElementById("modelMenu"),
            loadModelsButton: document.getElementById("loadModelsButton"),
            connectionFeedback: document.getElementById("connectionFeedback"),
            apiKeyInput: document.getElementById("apiKeyInput"),
            systemPromptInput: document.getElementById("systemPromptInput"),
            temperatureInput: document.getElementById("temperatureInput"),
            maxTokensInput: document.getElementById("maxTokensInput"),
            topPField: document.getElementById("topPField"),
            topPInput: document.getElementById("topPInput"),
            topKField: document.getElementById("topKField"),
            topKInput: document.getElementById("topKInput"),
            minPField: document.getElementById("minPField"),
            minPInput: document.getElementById("minPInput"),
            repeatPenaltyField: document.getElementById("repeatPenaltyField"),
            repeatPenaltyInput: document.getElementById("repeatPenaltyInput"),
            presencePenaltyField: document.getElementById("presencePenaltyField"),
            presencePenaltyInput: document.getElementById("presencePenaltyInput"),
            frequencyPenaltyField: document.getElementById("frequencyPenaltyField"),
            frequencyPenaltyInput: document.getElementById("frequencyPenaltyInput"),
            reasoningSelect: document.getElementById("reasoningSelect"),
            streamCheckbox: document.getElementById("streamCheckbox"),
            responseImageGenerationField: document.getElementById("responseImageGenerationField"),
            responseImageGenerationCheckbox: document.getElementById("responseImageGenerationCheckbox"),
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

        state.chatPresets = presetsApi.presetsByKind("chat");
        state.activeChatPreset = presetsApi.getActivePreset("chat");
        state.settings = presetsApi.applyChatPreset(state.settings, state.activeChatPreset);
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
        elements.maxTokensInput.value = state.settings.maxTokens || 0;
        elements.topPInput.value = optionalNumberValue(state.settings.topP);
        elements.topKInput.value = optionalNumberValue(state.settings.topK);
        elements.minPInput.value = optionalNumberValue(state.settings.minP);
        elements.repeatPenaltyInput.value = optionalNumberValue(state.settings.repeatPenalty);
        elements.presencePenaltyInput.value = optionalNumberValue(state.settings.presencePenalty);
        elements.frequencyPenaltyInput.value = optionalNumberValue(state.settings.frequencyPenalty);
        elements.reasoningSelect.value = state.settings.reasoning;
        elements.streamCheckbox.checked = state.settings.stream;
        elements.responseImageGenerationCheckbox.checked = Boolean(state.settings.responseImageGeneration);
        renderChatPresetSelect();
        elements.apiKeyInput.value = loadApiKey();
        state.endpointWasAutoFilled = config.isDefaultAddress(state.settings.provider, state.settings.endpoint);
        modelPicker = ui.createModelPicker({
            input: elements.modelInput,
            button: elements.modelMenuButton,
            menu: elements.modelMenu,
            getActiveModel: function() {
                return state.settings.model;
            },
            isDisabled: function() {
                return state.isSending;
            },
            onSelect: function() {
                syncSettingsFromForm();
            },
            onRender: function(models) {
                state.modelOptions = models;
            }
        });

        bindEvents();
        updateProviderControls();
        updateRequestPreview();
        updateProviderLabels();
        renderAll();
        applyChatPageVisibility();
        autosizePrompt();
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

        elements.newChatButton.addEventListener("click", function() {
            createChat(true);
            setSidebarOpen(false);
        });

        elements.chatPresetSelect.addEventListener("change", function() {
            var presetId = elements.chatPresetSelect.value;
            presetsApi.setActivePreset("chat", presetId);
            state.activeChatPreset = state.chatPresets.find(function(preset) {
                return preset.id === presetId;
            }) || presetsApi.getActivePreset("chat");
            state.settings = presetsApi.applyChatPreset(state.settings, state.activeChatPreset);
            applySettingsToForm();
            renderModelOptions([]);
            clearFeedback();
            state.status = null;
            saveSettings();
            updateProviderControls();
            updateRequestPreview();
            updateProviderLabels();
            renderAll();
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
            saveActiveChatPresetFromCurrent();
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
            saveActiveChatPresetFromCurrent();
            clearFeedback();
            state.status = null;
            saveSettings();
            updateParameterVisibility();
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
            elements.topPInput,
            elements.topKInput,
            elements.minPInput,
            elements.repeatPenaltyInput,
            elements.presencePenaltyInput,
            elements.frequencyPenaltyInput,
            elements.reasoningSelect
        ].forEach(function(input) {
            input.addEventListener("input", syncSettingsFromForm);
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

        elements.reasoningSelect.addEventListener("change", syncSettingsFromForm);

        elements.endpointInput.addEventListener("blur", normalizeEndpointInput);
        elements.streamCheckbox.addEventListener("change", syncSettingsFromForm);
        elements.responseImageGenerationCheckbox.addEventListener("change", syncSettingsFromForm);

        elements.apiKeyInput.addEventListener("input", function() {
            var apiKey = elements.apiKeyInput.value.trim();
            saveActiveChatPresetFromCurrent();
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

        elements.promptInput.addEventListener("paste", function(event) {
            handlePromptPaste(event).catch(function(error) {
                setFeedback(explainError(error), "error");
            });
        });

        elements.loadModelsButton.addEventListener("click", function() {
            loadModels(true).catch(function(error) {
                setStatus(explainError(error), "error");
            });
        });

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

    function applyChatPageVisibility() {
        [
            elements.providerSelect,
            elements.openaiApiSelect,
            elements.endpointInput,
            elements.apiKeyInput
        ].forEach(function(element) {
            var label = element.closest("label");
            if (label) {
                label.hidden = true;
            }
        });
        elements.requestPreview.hidden = true;
    }

    function syncSettingsFromForm() {
        state.settings.endpoint = elements.endpointInput.value.trim();
        state.settings.model = elements.modelInput.value.trim();
        state.settings.openaiApi = elements.openaiApiSelect.value;
        state.settings.systemPrompt = elements.systemPromptInput.value;
        state.settings.temperature = clampNumber(elements.temperatureInput.value, 0, 2, 0.7);
        state.settings.maxTokens = parseTokenLimit(elements.maxTokensInput.value);
        state.settings.topP = parseOptionalNumber(elements.topPInput.value, 0, 1);
        state.settings.topK = parseOptionalInteger(elements.topKInput.value, 0);
        state.settings.minP = parseOptionalNumber(elements.minPInput.value, 0, 1);
        state.settings.repeatPenalty = parseOptionalNumber(elements.repeatPenaltyInput.value, 0, 4);
        state.settings.presencePenalty = parseOptionalNumber(elements.presencePenaltyInput.value, -2, 2);
        state.settings.frequencyPenalty = parseOptionalNumber(elements.frequencyPenaltyInput.value, -2, 2);
        state.settings.reasoning = elements.reasoningSelect.value;
        state.settings.stream = elements.streamCheckbox.checked;
        state.settings.responseImageGeneration = Boolean(elements.responseImageGenerationCheckbox.checked);
        if (shouldSaveActiveChatPreset()) {
            saveActiveChatPresetFromCurrent();
        }
        clearFeedback();
        state.status = null;
        saveSettings();
        updateParameterVisibility();
        updateRequestPreview();
        updateProviderLabels();
    }

    function normalizeEndpointInput() {
        var normalized = config.normalizeAddress(elements.endpointInput.value, state.settings.provider);
        if (normalized && normalized !== elements.endpointInput.value.trim()) {
            elements.endpointInput.value = normalized;
            state.settings.endpoint = normalized;
            saveActiveChatPresetFromCurrent();
            saveSettings();
        }
        updateRequestPreview();
    }

    function applySettingsToForm() {
        elements.providerSelect.value = state.settings.provider;
        elements.endpointInput.value = state.settings.endpoint;
        elements.endpointInput.placeholder = config.addressPlaceholderFor(state.settings.provider);
        elements.openaiApiSelect.value = state.settings.openaiApi;
        elements.modelInput.value = state.settings.model;
        elements.systemPromptInput.value = state.settings.systemPrompt || "";
        elements.temperatureInput.value = state.settings.temperature;
        elements.maxTokensInput.value = state.settings.maxTokens || 0;
        elements.topPInput.value = optionalNumberValue(state.settings.topP);
        elements.topKInput.value = optionalNumberValue(state.settings.topK);
        elements.minPInput.value = optionalNumberValue(state.settings.minP);
        elements.repeatPenaltyInput.value = optionalNumberValue(state.settings.repeatPenalty);
        elements.presencePenaltyInput.value = optionalNumberValue(state.settings.presencePenalty);
        elements.frequencyPenaltyInput.value = optionalNumberValue(state.settings.frequencyPenalty);
        elements.reasoningSelect.value = state.settings.reasoning || defaultSettings.reasoning;
        elements.streamCheckbox.checked = Boolean(state.settings.stream);
        elements.responseImageGenerationCheckbox.checked = Boolean(state.settings.responseImageGeneration);
        elements.apiKeyInput.value = loadApiKey();
    }

    function loadSettings() {
        try {
            var stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
            var settings = Object.assign({}, defaultSettings, stored);
            if (settings.provider && !providerDefaults[settings.provider]) {
                settings.provider = defaultSettings.provider;
                settings.endpoint = defaultSettings.endpoint;
            }
            if (settings.provider && !settings.endpoint && providerDefaults[settings.provider].defaultAddress) {
                settings.endpoint = providerDefaults[settings.provider].defaultAddress;
            }
            if (!settings.openaiApi) {
                settings.openaiApi = defaultSettings.openaiApi;
            }
            if (!settings.reasoning) {
                settings.reasoning = defaultSettings.reasoning;
            }
            normalizeParameterSettings(settings);
            return settings;
        } catch (error) {
            var fallback = Object.assign({}, defaultSettings);
            normalizeParameterSettings(fallback);
            return fallback;
        }
    }

    function saveSettings() {
        var safeSettings = Object.assign({}, state.settings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(safeSettings));
    }

    function normalizeParameterSettings(settings) {
        settings.temperature = clampNumber(settings.temperature, 0, 2, defaultSettings.temperature);
        settings.maxTokens = parseTokenLimit(settings.maxTokens);
        settings.topP = normalizeOptionalNumber(settings.topP, 0, 1);
        settings.topK = normalizeOptionalInteger(settings.topK, 0);
        settings.minP = normalizeOptionalNumber(settings.minP, 0, 1);
        settings.repeatPenalty = normalizeOptionalNumber(settings.repeatPenalty, 0, 4);
        settings.presencePenalty = normalizeOptionalNumber(settings.presencePenalty, -2, 2);
        settings.frequencyPenalty = normalizeOptionalNumber(settings.frequencyPenalty, -2, 2);
        settings.responseImageGeneration = Boolean(settings.responseImageGeneration);
    }

    function loadApiKey() {
        var presetKey = presetsApi.apiKeyForPreset(state.activeChatPreset);
        return presetKey || localStorage.getItem(API_KEY) || "";
    }

    function loadChats() {
        try {
            var stored = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
            return Array.isArray(stored) ? normalizeChats(stored) : [];
        } catch (error) {
            return [];
        }
    }

    function normalizeChats(chats) {
        var changed = false;
        var normalized = chats.map(function(chat) {
            if (!Array.isArray(chat.messages)) {
                chat.messages = [];
                changed = true;
            }
            if (chat.responsesState && typeof chat.responsesState !== "object") {
                chat.responsesState = null;
                changed = true;
            }
            if (chat.responsesState) {
                chat.responsesState.responseId = chat.responsesState.responseId || "";
                chat.responsesState.signature = chat.responsesState.signature || "";
                chat.responsesState.transport = chat.responsesState.transport || "";
                chat.responsesState.dirty = Boolean(chat.responsesState.dirty);
                chat.responsesState.downgradedFromRest = Boolean(chat.responsesState.downgradedFromRest);
            }
            if (chat.lmStudioRestState && typeof chat.lmStudioRestState !== "object") {
                chat.lmStudioRestState = null;
                changed = true;
            }
            if (chat.lmStudioRestState) {
                chat.lmStudioRestState.responseId = chat.lmStudioRestState.responseId || "";
                chat.lmStudioRestState.signature = chat.lmStudioRestState.signature || "";
            }
            chat.messages.forEach(function(message) {
                if (!message.id) {
                    message.id = newMessageId();
                    changed = true;
                }
                if (!Array.isArray(message.images)) {
                    message.images = [];
                    changed = true;
                }
                message.images.forEach(function(image) {
                    if (image && image.partial) {
                        image.partial = false;
                        changed = true;
                    }
                });
                if (typeof message.reasoning !== "string") {
                    message.reasoning = "";
                    changed = true;
                }
                message.reasoningComplete = Boolean(message.reasoningComplete);
            });
            return chat;
        });
        if (changed) {
            localStorage.setItem(CHAT_KEY, JSON.stringify(normalized));
        }
        return normalized;
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

    function findMessage(chat, messageId) {
        return chat.messages.find(function(message) {
            return message.id === messageId;
        });
    }

    function renderAll() {
        renderChatPresetSelect();
        renderChatList();
        renderMessages();
        renderPendingImages();
        updateHeader();
        updateSendState();
    }

    function renderChatPresetSelect() {
        state.chatPresets = presetsApi.presetsByKind("chat");
        state.activeChatPreset = presetsApi.getActivePreset("chat");
        elements.chatPresetSelect.textContent = "";
        if (!state.chatPresets.length) {
            var empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "未配置预设";
            elements.chatPresetSelect.appendChild(empty);
            elements.chatPresetSelect.value = "";
            return;
        }
        state.chatPresets.forEach(function(preset) {
            var option = document.createElement("option");
            option.value = preset.id;
            option.textContent = preset.name;
            elements.chatPresetSelect.appendChild(option);
        });
        if (state.activeChatPreset) {
            elements.chatPresetSelect.value = state.activeChatPreset.id;
        }
    }

    function saveActiveChatPresetFromCurrent() {
        if (!state.activeChatPreset) {
            return;
        }
        var next = Object.assign({}, state.activeChatPreset, {
            provider: state.settings.provider,
            endpoint: state.settings.endpoint,
            apiKey: elements.apiKeyInput.value.trim(),
            model: state.settings.model,
            openaiApi: state.settings.openaiApi,
            responseImageGeneration: Boolean(state.settings.responseImageGeneration)
        });
        presetsApi.upsertPreset(next);
        state.activeChatPreset = next;
        state.chatPresets = presetsApi.presetsByKind("chat");
    }

    function shouldSaveActiveChatPreset() {
        if (!state.activeChatPreset) {
            return false;
        }
        return state.activeChatPreset.provider !== state.settings.provider ||
            state.activeChatPreset.endpoint !== state.settings.endpoint ||
            state.activeChatPreset.model !== state.settings.model ||
            state.activeChatPreset.openaiApi !== state.settings.openaiApi ||
            Boolean(state.activeChatPreset.responseImageGeneration) !== Boolean(state.settings.responseImageGeneration) ||
            state.activeChatPreset.apiKey !== elements.apiKeyInput.value.trim();
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
                setSidebarOpen(false);
            });

            var title = document.createElement("strong");
            title.textContent = chat.title || "新会话";
            var time = document.createElement("span");
            time.textContent = ui.formatTime(chat.updatedAt);
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

    function setSidebarOpen(open) {
        ui.setSidebarOpen(elements, open);
    }

    function renderMessages() {
        var chat = getActiveChat();
        var shouldStickToBottom = isMessagesNearBottom();
        rememberReasoningOpenState();
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
            if (state.editingMessageId === message.id) {
                renderMessageEditor(body, chat, message);
            } else {
                renderMessageBody(body, message);
                if (Array.isArray(message.images) && message.images.length) {
                    body.appendChild(renderMessageImages(message.images));
                }
                body.appendChild(renderMessageActions(chat, message));
            }

            article.appendChild(role);
            article.appendChild(body);
            elements.messages.appendChild(article);
        });

        if (shouldStickToBottom) {
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }
    }

    function isMessagesNearBottom() {
        var distance = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight;
        return distance < 80;
    }

    function rememberReasoningOpenState() {
        elements.messages.querySelectorAll(".reasoning-block[data-reasoning-key]").forEach(function(block) {
            var key = block.dataset.reasoningKey;
            var current = state.reasoningOpenState[key] || {
                open: false,
                manual: false
            };
            state.reasoningOpenState[key] = {
                open: block.open,
                manual: current.manual || block.dataset.manualOpen === "true"
            };
        });
    }

    function renderMessageBody(container, message) {
        var hasImages = Array.isArray(message.images) && message.images.length;
        var content = message.content || (message.role === "assistant" && !hasImages ? "..." : "");
        if (message.role === "assistant" && !message.error) {
            markdown.renderAssistant(container, message.reasoning || "", content, {
                messageId: message.id
            });
            restoreReasoningBlocks(container, message);
            return;
        }
        container.textContent = content;
    }

    function restoreReasoningBlocks(container, message) {
        container.querySelectorAll(".reasoning-block[data-reasoning-key]").forEach(function(block) {
            var key = block.dataset.reasoningKey;
            var current = state.reasoningOpenState[key] || null;
            var isLive = state.isSending && state.activeGeneratingMessageId === message.id && !message.reasoningComplete;
            if (current && current.manual) {
                block.open = current.open;
                block.classList.add("is-user-open");
                block.dataset.manualOpen = "true";
            } else if (isLive) {
                block.open = true;
                block.classList.add("is-live-preview");
                state.reasoningOpenState[key] = {
                    open: true,
                    manual: false
                };
            } else {
                block.open = false;
                state.reasoningOpenState[key] = {
                    open: false,
                    manual: false
                };
            }
            block.querySelector("summary").addEventListener("click", function(event) {
                if (block.classList.contains("is-live-preview") && !block.classList.contains("is-user-open")) {
                    event.preventDefault();
                    block.open = true;
                    block.classList.remove("is-live-preview");
                    block.classList.add("is-user-open");
                    block.dataset.manualOpen = "true";
                    state.reasoningOpenState[key] = {
                        open: true,
                        manual: true
                    };
                    return;
                }
                state.reasoningOpenState[key] = {
                    open: !block.open,
                    manual: true
                };
                block.dataset.manualOpen = "true";
                block.classList.add("is-user-open");
            });
        });
    }

    function renderMessageImages(images) {
        var wrap = document.createElement("div");
        wrap.className = "message-images";
        images.forEach(function(image) {
            var img = document.createElement("img");
            img.src = image.dataUrl;
            img.alt = image.name || "图片";
            if (image.partial) {
                img.className = "is-partial";
                img.title = "生成预览";
            }
            wrap.appendChild(img);
        });
        return wrap;
    }

    function renderMessageActions(chat, message) {
        var actions = document.createElement("div");
        actions.className = "message-actions";

        if (message.role === "user") {
            actions.appendChild(messageActionButton("编辑", function() {
                state.editingMessageId = message.id;
                renderMessages();
            }));
            actions.appendChild(messageActionButton("从这里继续", function() {
                continueAfterMessage(chat, message.id);
            }));
            actions.appendChild(messageActionButton("删除", function() {
                deleteMessage(chat, message.id);
            }, "danger"));
        } else if (message.role === "assistant") {
            actions.appendChild(messageActionButton("重新生成", function() {
                regenerateAssistant(chat, message.id);
            }));
            actions.appendChild(messageActionButton("编辑", function() {
                state.editingMessageId = message.id;
                renderMessages();
            }));
            actions.appendChild(messageActionButton("从这里继续", function() {
                continueAfterMessage(chat, message.id);
            }));
            actions.appendChild(messageActionButton("删除", function() {
                deleteMessage(chat, message.id);
            }, "danger"));
        }

        return actions;
    }

    function messageActionButton(label, onClick, tone) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "message-action" + (tone ? " " + tone : "");
        button.textContent = label;
        button.disabled = state.isSending;
        button.addEventListener("click", function() {
            var result = onClick();
            if (result && typeof result.catch === "function") {
                result.catch(function(error) {
                    setFeedback(explainError(error), "error");
                });
            }
        });
        return button;
    }

    function renderMessageEditor(container, chat, message) {
        var editor = document.createElement("div");
        editor.className = "message-editor";
        var textarea = document.createElement("textarea");
        textarea.rows = Math.min(10, Math.max(3, String(message.content || "").split(/\r?\n/).length + 1));
        textarea.value = message.content || "";

        var actions = document.createElement("div");
        actions.className = "message-actions";
        actions.appendChild(messageActionButton("保存", function() {
            saveMessageEdit(chat, message.id, textarea.value);
        }));
        actions.appendChild(messageActionButton("取消", function() {
            state.editingMessageId = "";
            renderMessages();
        }));

        editor.appendChild(textarea);
        if (Array.isArray(message.images) && message.images.length) {
            editor.appendChild(renderMessageImages(message.images));
        }
        editor.appendChild(actions);
        container.appendChild(editor);
        setTimeout(function() {
            textarea.focus();
        }, 0);
    }

    async function saveMessageEdit(chat, messageId, value) {
        var index = chat.messages.findIndex(function(message) {
            return message.id === messageId;
        });
        if (index === -1) {
            state.editingMessageId = "";
            renderMessages();
            return;
        }
        var text = value.trim();
        var message = chat.messages[index];
        if (!text && (!Array.isArray(message.images) || !message.images.length)) {
            setFeedback("消息内容不能为空。", "warn");
            return;
        }
        message.content = text;
        message.reasoning = "";
        message.reasoningComplete = false;
        message.error = false;
        if (message.role === "user") {
            chat.messages = chat.messages.slice(0, index + 1);
            markChatHistoryDirty(chat);
        } else if (message.role === "assistant") {
            chat.messages = chat.messages.slice(0, index + 1);
            markChatHistoryDirty(chat);
        }
        chat.updatedAt = new Date().toISOString();
        state.editingMessageId = "";
        saveChats();
        renderAll();
        if (message.role === "user") {
            await requestAssistantForChat(chat);
        } else {
            setFeedback("已保存，后续消息已截断。", "ok");
            elements.promptInput.focus();
        }
    }

    function deleteMessage(chat, messageId) {
        if (state.isSending) {
            return;
        }
        var index = chat.messages.findIndex(function(message) {
            return message.id === messageId;
        });
        if (index === -1) {
            return;
        }
        chat.messages.splice(index, 1);
        if (state.editingMessageId === messageId) {
            state.editingMessageId = "";
        }
        markChatHistoryDirty(chat);
        chat.updatedAt = new Date().toISOString();
        if (!chat.messages.length) {
            chat.title = "新会话";
        }
        saveChats();
        renderAll();
        setFeedback("已删除这条消息。", "ok");
    }

    async function continueAfterMessage(chat, messageId) {
        if (state.isSending) {
            return;
        }
        var index = chat.messages.findIndex(function(message) {
            return message.id === messageId;
        });
        if (index === -1) {
            return;
        }
        var message = chat.messages[index];
        chat.messages = chat.messages.slice(0, index + 1);
        markChatHistoryDirty(chat);
        chat.updatedAt = new Date().toISOString();
        saveChats();
        renderAll();
        if (message.role === "user") {
            await requestAssistantForChat(chat);
            return;
        }
        await requestAssistantForChat(chat, {
            continueMessageId: message.id
        });
    }

    async function regenerateAssistant(chat, messageId) {
        if (state.isSending) {
            return;
        }
        var index = chat.messages.findIndex(function(message) {
            return message.id === messageId;
        });
        if (index === -1) {
            return;
        }
        chat.messages = chat.messages.slice(0, index);
        markChatHistoryDirty(chat);
        var previousUser = chat.messages.slice().reverse().find(function(message) {
            return message.role === "user" && hasMessageContent(message);
        });
        if (!previousUser) {
            setFeedback("没有可用于重新生成的用户消息。", "warn");
            return;
        }
        await requestAssistantForChat(chat);
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
        var chat = getActiveChat();
        if (isLmStudioRestDowngraded(chat)) {
            elements.statusText.textContent = provider.label + " · 已降级为 Responses · " + model;
            ui.setStatusPill(elements.connectionPill, state.isSending ? "生成中" : "已降级为 Responses", "warn");
            return;
        }
        elements.statusText.textContent = provider.label + " · " + model;
        ui.setStatusPill(elements.connectionPill, state.isSending ? "生成中" : provider.label);
    }

    function updateProviderControls() {
        var provider = config.getProvider(state.settings.provider);
        var isOpenAi = provider.mode === "openai" && provider.supportsResponses !== false;
        elements.openaiApiField.hidden = true;
        elements.openaiApiField.setAttribute("aria-hidden", "true");
        elements.openaiApiSelect.disabled = !isOpenAi || state.isSending;
        if (provider.mode === "openai" && provider.supportsResponses === false) {
            state.settings.openaiApi = "chat";
            state.settings.responseImageGeneration = false;
        }
        elements.openaiApiSelect.value = state.settings.openaiApi;
        elements.endpointInput.placeholder = config.addressPlaceholderFor(state.settings.provider);
        updateParameterVisibility();
    }

    function updateParameterVisibility() {
        var provider = config.getProvider(state.settings.provider);
        var capabilities = parameterCapabilitiesFor(provider);
        setFieldVisible(elements.topPField, capabilities.topP);
        setFieldVisible(elements.topKField, capabilities.topK);
        setFieldVisible(elements.minPField, capabilities.minP);
        setFieldVisible(elements.repeatPenaltyField, capabilities.repeatPenalty);
        setFieldVisible(elements.presencePenaltyField, capabilities.presencePenalty);
        setFieldVisible(elements.frequencyPenaltyField, capabilities.frequencyPenalty);
        setFieldVisible(elements.responseImageGenerationField, supportsResponsesImageGeneration());
        elements.topPInput.disabled = state.isSending || !capabilities.topP;
        elements.topKInput.disabled = state.isSending || !capabilities.topK;
        elements.minPInput.disabled = state.isSending || !capabilities.minP;
        elements.repeatPenaltyInput.disabled = state.isSending || !capabilities.repeatPenalty;
        elements.presencePenaltyInput.disabled = state.isSending || !capabilities.presencePenalty;
        elements.frequencyPenaltyInput.disabled = state.isSending || !capabilities.frequencyPenalty;
        elements.responseImageGenerationCheckbox.disabled = state.isSending || !supportsResponsesImageGeneration();
    }

    function supportsResponsesImageGeneration() {
        var provider = config.getProvider(state.settings.provider);
        return provider.mode === "openai" &&
            provider.supportsResponses !== false &&
            state.settings.openaiApi === "responses";
    }

    function parameterCapabilitiesFor(provider) {
        if (provider.mode === "ollama") {
            return {
                topP: true,
                topK: true,
                minP: true,
                repeatPenalty: true,
                presencePenalty: false,
                frequencyPenalty: true
            };
        }
        if (provider.mode === "lmstudioRest") {
            return {
                topP: true,
                topK: true,
                minP: true,
                repeatPenalty: true,
                presencePenalty: false,
                frequencyPenalty: false
            };
        }
        if (provider.mode === "anthropic") {
            return {
                topP: true,
                topK: true,
                minP: false,
                repeatPenalty: false,
                presencePenalty: false,
                frequencyPenalty: false
            };
        }
        if (state.settings.openaiApi === "responses") {
            return {
                topP: true,
                topK: false,
                minP: false,
                repeatPenalty: false,
                presencePenalty: false,
                frequencyPenalty: false
            };
        }
        return {
            topP: true,
            topK: false,
            minP: false,
            repeatPenalty: false,
            presencePenalty: true,
            frequencyPenalty: true
        };
    }

    function setFieldVisible(field, visible) {
        ui.setFieldVisible(field, visible);
    }

    function updateRequestPreview() {
        var chatUrl = config.requestUrlFor(state.settings, "chat");
        var chatText = chatUrl || "待填写地址";
        elements.requestPreview.innerHTML = "";
        elements.requestPreview.appendChild(previewLine("对话 POST: " + chatText));
    }

    function toggleModelMenu(open) {
        modelPicker.toggle(open);
    }

    function focusFirstModelOption() {
        modelPicker.focusFirst();
    }

    function previewLine(text) {
        var line = document.createElement("span");
        line.className = "preview-line";
        line.textContent = text;
        return line;
    }

    function updateSendState() {
        var provider = config.getProvider(state.settings.provider);
        var hasProvider = provider.mode !== "none";
        elements.sendButton.disabled = state.isSending;
        elements.stopButton.disabled = !state.isSending;
        elements.promptInput.disabled = state.isSending;
        elements.providerSelect.disabled = state.isSending;
        elements.openaiApiSelect.disabled = state.isSending || state.settings.provider !== "openai";
        elements.endpointInput.disabled = state.isSending;
        elements.modelInput.disabled = state.isSending;
        elements.modelMenuButton.disabled = state.isSending || !state.modelOptions.length;
        elements.systemPromptInput.disabled = state.isSending;
        elements.temperatureInput.disabled = state.isSending;
        elements.maxTokensInput.disabled = state.isSending;
        elements.reasoningSelect.disabled = state.isSending;
        elements.streamCheckbox.disabled = state.isSending;
        elements.responseImageGenerationCheckbox.disabled = state.isSending || !supportsResponsesImageGeneration();
        elements.apiKeyInput.disabled = state.isSending;
        elements.attachButton.disabled = state.isSending;
        elements.loadModelsButton.disabled = state.isSending || state.isLoadingModels;
        updateParameterVisibility();
        if (state.isSending) {
            toggleModelMenu(false);
        }
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
        var connectionValidation = validateConnectionConfig({ requireModel: true });
        if (!connectionValidation.valid) {
            setStatus(connectionValidation.status, "error");
            setFeedback(connectionValidation.message, connectionValidation.tone || "error");
            return;
        }
        if (!state.settings.model) {
            setStatus("请先填写模型名", "error");
            setFeedback("请先读取模型或手动填写模型名。", "warn");
            return;
        }

        var chat = getActiveChat();
        var userMessage = createMessage("user", prompt, images);
        chat.messages.push(userMessage);
        chat.updatedAt = new Date().toISOString();
        if (chat.title === "新会话") {
            chat.title = makeTitle(prompt);
        }
        elements.promptInput.value = "";
        state.pendingImages = [];
        renderPendingImages();
        autosizePrompt();

        await requestAssistantForChat(chat);
    }

    async function requestAssistantForChat(chat, options) {
        options = options || {};
        var assistantMessage = options.continueMessageId ? findMessage(chat, options.continueMessageId) : null;
        var continuingAssistant = false;
        var continuationPrefix = "";
        if (assistantMessage && assistantMessage.role === "assistant") {
            continuingAssistant = true;
            continuationPrefix = assistantMessage.content || "";
            assistantMessage.error = false;
        } else {
            assistantMessage = createMessage("assistant", "");
            chat.messages.push(assistantMessage);
        }
        state.abortController = new AbortController();
        state.isSending = true;
        state.activeGeneratingMessageId = assistantMessage.id;
        setStatus(continuingAssistant ? "续写中" : "生成中", "ok");
        setFeedback("正在请求 " + completionRequestUrlFor(chat, {
            continuingAssistant: continuingAssistant
        }), "ok");
        saveChats();
        renderAll();

        try {
            await requestCompletion(chat, assistantMessage, {
                chat: chat,
                continuingAssistant: continuingAssistant,
                continuationPrefix: continuationPrefix,
                forceFullHistory: continuingAssistant
            });
            if (continuingAssistant) {
                assistantMessage.content = normalizeContinuationContent(assistantMessage.content, continuationPrefix);
            }
            if (!hasGeneratedAssistantContent(assistantMessage, continuationPrefix)) {
                assistantMessage.content = continuationPrefix || "模型没有返回内容。";
                if (continuingAssistant) {
                    setFeedback("模型没有返回续写内容。", "warn");
                }
            }
            setStatus("完成", "ok");
            if (isLmStudioRestDowngraded(chat)) {
                state.status = null;
            }
            if (!continuingAssistant || hasGeneratedAssistantContent(assistantMessage, continuationPrefix)) {
                setFeedback("请求完成。", "ok");
            }
        } catch (error) {
            if (error.name === "AbortError") {
                if (!assistantMessage.content.trim()) {
                    assistantMessage.content = "已停止。";
                }
                setStatus("已停止", "warn");
                setFeedback("已停止生成。", "warn");
            } else {
                if (continuingAssistant) {
                    assistantMessage.error = false;
                    assistantMessage.content = normalizeContinuationContent(assistantMessage.content || continuationPrefix, continuationPrefix);
                } else {
                    assistantMessage.error = true;
                    assistantMessage.content = explainError(error);
                }
                setStatus("请求失败", "error");
                setFeedback(explainError(error), "error");
            }
        } finally {
            chat.updatedAt = new Date().toISOString();
            state.abortController = null;
            state.isSending = false;
            state.activeGeneratingMessageId = "";
            saveChats();
            renderAll();
            elements.promptInput.focus();
        }
    }

    async function requestCompletion(chat, assistantMessage, options) {
        try {
            await requestCompletionOnce(chat, assistantMessage, options || {});
        } catch (error) {
            if (!disableUnsupportedReasoning(error)) {
                throw error;
            }
            resetAssistantMessageForRetry(assistantMessage, options || {});
            await requestCompletionOnce(chat, assistantMessage, options || {});
        }
    }

    async function requestCompletionOnce(chat, assistantMessage, options) {
        var provider = config.getProvider(state.settings.provider);
        var messages = buildMessages(chat, options);
        options = Object.assign({}, options, {
            messages: messages
        });
        if (provider.mode === "ollama") {
            await requestOllama(messages, assistantMessage, options);
        } else if (provider.mode === "lmstudioRest") {
            if (shouldUseLmStudioResponses(chat, options)) {
                await requestLmStudioRestAsResponses(messages, assistantMessage, options);
            } else {
                try {
                    await requestLmStudioRest(chat, assistantMessage, options);
                } catch (error) {
                    if (!hasReplayContext(messages) || !shouldFallbackToFullHistory(error)) {
                        throw error;
                    }
                    resetAssistantMessageForRetry(assistantMessage, options);
                    markChatHistoryDirty(chat);
                    setFeedback("REST 状态不可用，已改用 Responses 按完整历史重试。", "warn");
                    await requestLmStudioRestAsResponses(messages, assistantMessage, options);
                }
            }
        } else if (provider.mode === "anthropic") {
            await requestAnthropic(messages, assistantMessage, options);
        } else if (state.settings.openaiApi === "responses") {
            await requestOpenAiResponses(messages, assistantMessage, options);
        } else {
            await requestOpenAiCompatible(messages, assistantMessage, options);
        }
    }

    function buildMessages(chat, options) {
        var messages = chat.messages
            .filter(function(message) {
                return !message.error && hasMessageContent(message);
            })
            .map(function(message) {
                return {
                    role: message.role === "assistant" ? "assistant" : "user",
                    content: message.content,
                    images: Array.isArray(message.images) ? message.images : []
                };
            });

        var systemPrompt = requestSystemPrompt(options);
        if (systemPrompt) {
            messages.unshift({
                role: "system",
                content: systemPrompt
            });
        }
        return messages;
    }

    function requestSystemPrompt(options) {
        var parts = [];
        var base = String(state.settings.systemPrompt || "").trim();
        if (base) {
            parts.push(base);
        }
        if (options && options.continuingAssistant) {
            parts.push("Continue the final assistant message exactly from where it ended. Do not repeat existing text, do not add a new user turn, and do not explain that you are continuing.");
        }
        return parts.join("\n\n");
    }

    function responseImageGenerationEnabled(options) {
        if (options && options.responseImageGeneration !== undefined) {
            return Boolean(options.responseImageGeneration);
        }
        return Boolean(state.settings.responseImageGeneration) && supportsResponsesImageGeneration();
    }

    function markChatHistoryDirty(chat) {
        chat.lmStudioResponseId = "";
        chat.lmStudioRestState = null;
        var responseState = ensureResponsesState(chat);
        responseState.dirty = true;
        responseState.responseId = "";
        responseState.signature = "";
    }

    function ensureResponsesState(chat) {
        if (!chat.responsesState || typeof chat.responsesState !== "object") {
            chat.responsesState = {
                responseId: "",
                signature: "",
                transport: "",
                dirty: false,
                downgradedFromRest: false
            };
        }
        return chat.responsesState;
    }

    function isLmStudioRestDowngraded(chat) {
        return Boolean(
            chat &&
            chat.responsesState &&
            chat.responsesState.downgradedFromRest &&
            config.getProvider(state.settings.provider).mode === "lmstudioRest"
        );
    }

    function shouldUseLmStudioResponses(chat, options) {
        var messages = options && Array.isArray(options.messages) ? options.messages : [];
        return isLmStudioRestDowngraded(chat) ||
            Boolean(options && options.continuingAssistant) ||
            Boolean(chat.responsesState && chat.responsesState.dirty) ||
            (!hasValidLmStudioRestState(chat) && hasReplayContext(messages));
    }

    function completionRequestUrlFor(chat, options) {
        var provider = config.getProvider(state.settings.provider);
        if (provider.mode === "lmstudioRest" && shouldUseLmStudioResponses(chat, options || {})) {
            return lmStudioOpenAiResponsesUrl();
        }
        return config.requestUrlFor(state.settings, "chat");
    }

    function lmStudioRestSignatureFor() {
        return [
            config.requestUrlFor(state.settings, "chat"),
            state.settings.model || "",
            state.settings.systemPrompt.trim()
        ].join("\n");
    }

    function hasValidLmStudioRestState(chat) {
        return Boolean(
            chat &&
            chat.lmStudioRestState &&
            chat.lmStudioRestState.responseId &&
            chat.lmStudioRestState.signature === lmStudioRestSignatureFor()
        );
    }

    function lmStudioRestPreviousResponseId(chat) {
        return hasValidLmStudioRestState(chat) ? chat.lmStudioRestState.responseId : "";
    }

    function recordLmStudioRestSuccess(chat, data, options) {
        var responseId = data && (data.response_id || data.id);
        if (!responseId) {
            return;
        }
        chat.lmStudioResponseId = responseId;
        if (options && options.continuingAssistant) {
            chat.lmStudioRestState = null;
            var responseState = ensureResponsesState(chat);
            responseState.dirty = true;
            return;
        }
        chat.lmStudioRestState = {
            responseId: responseId,
            signature: lmStudioRestSignatureFor()
        };
    }

    function hasReplayContext(messages) {
        var nonSystemMessages = messages.filter(function(message) {
            return message.role !== "system" && hasMessageContent(message);
        });
        return nonSystemMessages.length > 1;
    }

    function shouldFallbackToFullHistory(error) {
        var message = String(error && error.message ? error.message : error).toLowerCase();
        return message.indexOf("previous_response_id") !== -1 ||
            message.indexOf("response") !== -1 ||
            message.indexOf("not found") !== -1 ||
            message.indexOf("invalid") !== -1 ||
            message.indexOf("expired") !== -1 ||
            message.indexOf("cache") !== -1 ||
            message.indexOf("state") !== -1 ||
            message.indexOf("400") !== -1 ||
            message.indexOf("404") !== -1 ||
            message.indexOf("409") !== -1 ||
            message.indexOf("422") !== -1;
    }

    function resetAssistantMessageForRetry(assistantMessage, options) {
        assistantMessage.error = false;
        assistantMessage.reasoning = "";
        assistantMessage.reasoningComplete = false;
        assistantMessage.content = options && options.continuingAssistant ? options.continuationPrefix || "" : "";
    }

    function disableUnsupportedReasoning(error) {
        if (!state.settings.reasoning || state.settings.reasoning === "auto") {
            return false;
        }
        if (!isUnsupportedReasoningError(error)) {
            return false;
        }
        state.settings.reasoning = "auto";
        elements.reasoningSelect.value = "auto";
        saveSettings();
        saveActiveChatPresetFromCurrent();
        setFeedback("当前模型不支持所选思考模式，已切换为自动并重试。", "warn");
        return true;
    }

    function isUnsupportedReasoningError(error) {
        var message = String(error && error.message ? error.message : error).toLowerCase();
        return message.indexOf("reasoning") !== -1 &&
            (
                message.indexOf("support") !== -1 ||
                message.indexOf("unsupported") !== -1 ||
                message.indexOf("not available") !== -1 ||
                message.indexOf("invalid") !== -1 ||
                message.indexOf("不支持") !== -1
            );
    }

    function applyAssistantContent(assistantMessage, content, options) {
        var text = String(content || "");
        if (text) {
            markAssistantReasoningComplete(assistantMessage);
        }
        if (!options || !options.continuingAssistant) {
            assistantMessage.content = text;
            return;
        }
        assistantMessage.content += text;
    }

    function appendAssistantContent(assistantMessage, text) {
        if (!text) {
            return;
        }
        markAssistantReasoningComplete(assistantMessage);
        assistantMessage.content += text;
    }

    function markAssistantReasoningComplete(assistantMessage) {
        if (!String(assistantMessage.reasoning || "").trim()) {
            return;
        }
        assistantMessage.reasoningComplete = true;
        collapseAutoReasoningBlocks(assistantMessage);
    }

    function collapseAutoReasoningBlocks(assistantMessage) {
        Object.keys(state.reasoningOpenState).forEach(function(key) {
            if (key.indexOf(assistantMessage.id + ":reasoning:") !== 0) {
                return;
            }
            var current = state.reasoningOpenState[key];
            if (current && !current.manual) {
                state.reasoningOpenState[key] = {
                    open: false,
                    manual: false,
                    nearBottom: true
                };
            }
        });
    }

    function applyAssistantReasoning(assistantMessage, reasoning, options) {
        var text = String(reasoning || "");
        if (!text) {
            return;
        }
        if (!options || !options.continuingAssistant) {
            assistantMessage.reasoning = text;
            return;
        }
        assistantMessage.reasoning = assistantMessage.reasoning ? assistantMessage.reasoning + "\n\n" + text : text;
    }

    function normalizeContinuationContent(content, prefix) {
        var full = String(content || "");
        var start = String(prefix || "");
        if (start && full.indexOf(start + start) === 0) {
            return start + full.slice((start + start).length);
        }
        return full;
    }

    function hasGeneratedAssistantContent(assistantMessage, prefix) {
        var current = String(assistantMessage.content || "");
        var start = String(prefix || "");
        if (Array.isArray(assistantMessage.images) && assistantMessage.images.length) {
            return true;
        }
        if (!start) {
            return Boolean(current.trim());
        }
        return current.length > start.length;
    }

    function applyAssistantImages(assistantMessage, images, options) {
        var incoming = normalizeGeneratedImages(images);
        if (!incoming.length) {
            return;
        }
        options = options || {};
        if (!Array.isArray(assistantMessage.images)) {
            assistantMessage.images = [];
        }
        if (options.replacePreviews) {
            assistantMessage.images = assistantMessage.images.filter(function(image) {
                return !image.partial;
            });
        }
        incoming.forEach(function(image) {
            var sameData = assistantMessage.images.some(function(existing) {
                return existing.dataUrl === image.dataUrl;
            });
            if (!sameData) {
                assistantMessage.images.push(image);
            }
        });
    }

    function applyOpenAiResponseImagePreview(assistantMessage, event) {
        var b64 = event && (event.partial_image_b64 || event.b64_json || event.result);
        if (!b64) {
            return;
        }
        var index = event.partial_image_index || 0;
        var image = {
            name: "Responses 图片预览 " + (index + 1),
            type: "image/png",
            dataUrl: base64ImageDataUrl(b64, "image/png"),
            partial: true
        };
        if (!Array.isArray(assistantMessage.images)) {
            assistantMessage.images = [];
        }
        var existing = assistantMessage.images.find(function(item) {
            return item.partial && item.previewIndex === index;
        });
        image.previewIndex = index;
        if (existing) {
            existing.dataUrl = image.dataUrl;
            existing.name = image.name;
            existing.type = image.type;
            return;
        }
        assistantMessage.images.push(image);
    }

    function responsesSignatureFor(responseUrl, responseTransport) {
        return [
            responseTransport,
            responseUrl,
            state.settings.model || "",
            state.settings.systemPrompt.trim(),
            responseImageGenerationEnabled() ? "image_generation:on" : "image_generation:off"
        ].join("\n");
    }

    function latestOpenAiResponseInput(messages) {
        for (var index = messages.length - 1; index >= 0; index -= 1) {
            if (hasMessageContent(messages[index])) {
                return [toOpenAiResponseInput(messages[index])];
            }
        }
        return [];
    }

    function recordOpenAiResponsesSuccess(options, responseSignature, responseTransport, responseData) {
        if (!options || !options.chat) {
            return;
        }
        var responseState = ensureResponsesState(options.chat);
        if (options.continuingAssistant) {
            responseState.responseId = "";
            responseState.signature = "";
            responseState.transport = responseTransport;
            responseState.dirty = true;
            responseState.downgradedFromRest = Boolean(responseState.downgradedFromRest || options.downgradedFromRest);
            return;
        }
        responseState.responseId = extractOpenAiResponseId(responseData);
        responseState.signature = responseSignature;
        responseState.transport = responseTransport;
        responseState.dirty = false;
        if (options.downgradedFromRest) {
            responseState.downgradedFromRest = true;
        }
    }

    function extractOpenAiResponseId(data) {
        if (!data) {
            return "";
        }
        if (typeof data.id === "string") {
            return data.id;
        }
        if (typeof data.response_id === "string") {
            return data.response_id;
        }
        if (data.response) {
            return extractOpenAiResponseId(data.response);
        }
        return "";
    }

    async function requestOpenAiCompatible(messages, assistantMessage, options) {
        var body = {
            model: state.settings.model,
            messages: messages.map(toOpenAiChatMessage),
            temperature: state.settings.temperature,
            stream: state.settings.stream
        };
        addMaxTokens(body, "max_tokens");
        addSamplerParams(body, "openaiChat");
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
                var choice = json.choices && json.choices[0];
                var delta = (choice && choice.delta) || {};
                var reasoningDelta = markdown.reasoningTextFromObject(delta);
                if (reasoningDelta) {
                    assistantMessage.reasoning = (assistantMessage.reasoning || "") + reasoningDelta;
                    scheduleMessageRender();
                }
                if (typeof delta.content === "string") {
                    appendAssistantContent(assistantMessage, delta.content);
                    scheduleMessageRender();
                }
            });
            return;
        }

        var data = await response.json();
        var message = (((data.choices || [])[0] || {}).message || {});
        applyAssistantReasoning(assistantMessage, markdown.reasoningTextFromObject(message), options);
        applyAssistantContent(assistantMessage, openAiMessageContent(message), options);
    }

    async function requestOpenAiResponses(messages, assistantMessage, options) {
        options = options || {};
        var responseUrl = options.responsesUrl || config.requestUrlFor(state.settings, "chat");
        var responseTransport = options.responseTransport || "openaiResponses";
        var responseState = options.chat ? ensureResponsesState(options.chat) : null;
        var responseSignature = responsesSignatureFor(responseUrl, responseTransport);
        var usePreviousResponse = shouldUsePreviousOpenAiResponse(responseState, responseSignature, options);
        var useImageGeneration = responseImageGenerationEnabled(options);
        await sendOpenAiResponsesRequest({
            messages: messages,
            assistantMessage: assistantMessage,
            options: options,
            responseUrl: responseUrl,
            responseTransport: responseTransport,
            responseSignature: responseSignature,
            usePreviousResponse: usePreviousResponse,
            useImageGeneration: useImageGeneration
        });
    }

    function shouldUsePreviousOpenAiResponse(responseState, responseSignature, options) {
        return Boolean(
            responseState &&
            responseState.responseId &&
            !responseState.dirty &&
            responseState.signature === responseSignature &&
            !options.forceFullHistory &&
            !options.continuingAssistant
        );
    }

    async function sendOpenAiResponsesRequest(request) {
        try {
            await sendOpenAiResponsesRequestOnce(request);
        } catch (error) {
            if (!request.usePreviousResponse || !request.options.chat || !shouldFallbackToFullHistory(error)) {
                throw error;
            }
            var responseState = ensureResponsesState(request.options.chat);
            responseState.responseId = "";
            responseState.dirty = true;
            resetAssistantMessageForRetry(request.assistantMessage, request.options);
            setFeedback("Responses 状态不可用，已按完整历史重试。", "warn");
            await sendOpenAiResponsesRequestOnce(Object.assign({}, request, {
                usePreviousResponse: false
            }));
        }
    }

    async function sendOpenAiResponsesRequestOnce(request) {
        var messages = request.messages;
        var assistantMessage = request.assistantMessage;
        var options = request.options;
        var responseUrl = request.responseUrl;
        var responseTransport = request.responseTransport;
        var responseSignature = request.responseSignature;
        var usePreviousResponse = request.usePreviousResponse;
        var useImageGeneration = Boolean(request.useImageGeneration);
        var responseState = options.chat ? ensureResponsesState(options.chat) : null;
        var responseMessages = messages.filter(function(message) {
            return message.role !== "system";
        });
        var input = usePreviousResponse ?
            latestOpenAiResponseInput(responseMessages) :
            responseMessages.map(toOpenAiResponseInput);
        var body = {
            model: state.settings.model,
            input: input,
            temperature: state.settings.temperature,
            stream: state.settings.stream
        };
        addMaxTokens(body, "max_output_tokens");
        addSamplerParams(body, "openaiResponses");
        if (useImageGeneration) {
            body.tools = [{
                type: "image_generation"
            }];
        }
        if (usePreviousResponse) {
            body.previous_response_id = responseState.responseId;
        }
        var systemPrompt = requestSystemPrompt(options);
        if (systemPrompt) {
            body.instructions = systemPrompt;
        }
        addResponsesReasoning(body);
        var response = await fetch(responseUrl, {
            method: "POST",
            headers: requestHeaders({ auth: "bearer", json: true }),
            body: JSON.stringify(body),
            signal: state.abortController.signal
        });
        await ensureOk(response);

        if (state.settings.stream && response.body && isEventStream(response)) {
            var completedResponse = null;
            await readSse(response, function(json) {
                if (json.response && json.response.id) {
                    completedResponse = json.response;
                }
                if (json.type === "response.output_text.delta" && typeof json.delta === "string") {
                    appendAssistantContent(assistantMessage, json.delta);
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "response.reasoning_text.delta" && typeof json.delta === "string") {
                    assistantMessage.reasoning = (assistantMessage.reasoning || "") + json.delta;
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "response.image_generation_call.partial_image") {
                    applyOpenAiResponseImagePreview(assistantMessage, json);
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "response.image_generation_call.completed") {
                    applyAssistantImages(assistantMessage, [json], { replacePreviews: true });
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "response.completed" && json.response) {
                    completedResponse = json.response;
                    if (!String(assistantMessage.reasoning || "").trim()) {
                        applyAssistantReasoning(assistantMessage, extractOpenAiResponseReasoning(json.response), options);
                    }
                    if (!hasGeneratedAssistantContent(assistantMessage, options.continuationPrefix || "")) {
                        applyAssistantContent(assistantMessage, extractOpenAiResponseText(json.response), options);
                    }
                    applyAssistantImages(assistantMessage, extractOpenAiResponseImages(json.response), { replacePreviews: true });
                }
                if (json.type === "error" && json.error) {
                    throw new Error(json.error.message || "OpenAI Responses stream error");
                }
            });
            recordOpenAiResponsesSuccess(options, responseSignature, responseTransport, completedResponse);
            return;
        }

        var data = await response.json();
        applyAssistantReasoning(assistantMessage, extractOpenAiResponseReasoning(data), options);
        applyAssistantContent(assistantMessage, extractOpenAiResponseText(data), options);
        applyAssistantImages(assistantMessage, extractOpenAiResponseImages(data), { replacePreviews: true });
        recordOpenAiResponsesSuccess(options, responseSignature, responseTransport, data);
    }

    async function requestLmStudioRest(chat, assistantMessage, options) {
        var latestUserMessage = chat.messages.slice().reverse().find(function(message) {
            return message.role === "user" && hasMessageContent(message);
        });
        var body = {
            model: state.settings.model,
            input: latestUserMessage ? toLmStudioInput(latestUserMessage) : "",
            stream: state.settings.stream
        };
        addMaxTokens(body, "max_output_tokens");
        addSamplerParams(body, "lmstudioRest");

        addLmStudioReasoning(body);
        var systemPrompt = requestSystemPrompt(options);
        if (systemPrompt) {
            body.system_prompt = systemPrompt;
        }
        var previousResponseId = lmStudioRestPreviousResponseId(chat);
        if (previousResponseId) {
            body.previous_response_id = previousResponseId;
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
                if (json.type === "reasoning.delta" && typeof json.content === "string") {
                    assistantMessage.reasoning = (assistantMessage.reasoning || "") + json.content;
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "message.delta" && typeof json.content === "string") {
                    appendAssistantContent(assistantMessage, json.content);
                    scheduleMessageRender();
                    return;
                }
                if (json.type === "chat.end" && json.result) {
                    recordLmStudioRestSuccess(chat, json.result, options);
                    if (!String(assistantMessage.reasoning || "").trim()) {
                        assistantMessage.reasoning = extractLmStudioRestReasoning(json.result);
                    }
                    if (!assistantMessage.content.trim()) {
                        applyAssistantContent(assistantMessage, extractLmStudioRestText(json.result), options);
                    }
                }
                if (json.type === "error" && json.error) {
                    throw new Error(json.error.message || "LM Studio REST v1 stream error");
                }
            });
            return;
        }

        var data = await response.json();
        recordLmStudioRestSuccess(chat, data, options);
        assistantMessage.reasoning = extractLmStudioRestReasoning(data);
        applyAssistantContent(assistantMessage, extractLmStudioRestText(data), options);
    }

    async function requestLmStudioRestAsResponses(messages, assistantMessage, options) {
        var responsesOptions = Object.assign({}, options, {
            responsesUrl: lmStudioOpenAiResponsesUrl(),
            responseTransport: "lmstudioRestResponses",
            downgradedFromRest: true
        });
        await requestOpenAiResponses(messages, assistantMessage, responsesOptions);
    }

    function lmStudioOpenAiResponsesUrl() {
        var restBase = config.normalizeAddress(state.settings.endpoint, "lmstudio");
        try {
            var url = new URL(restBase);
            url.pathname = url.pathname.replace(/\/api\/v1\/?$/i, "/");
            url.search = "";
            url.hash = "";
            restBase = url.toString();
        } catch (error) {
            restBase = state.settings.endpoint;
        }
        var openAiBase = config.normalizeAddress(restBase, "openai");
        return config.endpointFor(openAiBase, "/responses");
    }

    async function requestOllama(messages, assistantMessage, options) {
        var body = {
            model: state.settings.model,
            messages: messages.map(toOllamaMessage),
            stream: state.settings.stream,
            options: {}
        };
        addOllamaOptions(body.options);
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
                    appendAssistantContent(assistantMessage, delta);
                    scheduleMessageRender();
                }
            });
            return;
        }

        var data = await response.json();
        applyAssistantContent(assistantMessage, (data.message && data.message.content) || "", options);
    }

    async function requestAnthropic(messages, assistantMessage, options) {
        var body = {
            model: state.settings.model,
            messages: messages.filter(function(message) {
                return message.role !== "system";
            }).map(toAnthropicMessage),
            max_tokens: anthropicMaxTokens(),
            temperature: state.settings.temperature,
            stream: state.settings.stream
        };
        addSamplerParams(body, "anthropic");
        var systemPrompt = requestSystemPrompt(options);
        if (systemPrompt) {
            body.system = systemPrompt;
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
                        appendAssistantContent(assistantMessage, json.delta.text);
                        scheduleMessageRender();
                        return;
                    }
                    if (typeof json.delta.content === "string") {
                        appendAssistantContent(assistantMessage, json.delta.content);
                        scheduleMessageRender();
                        return;
                    }
                }
                if (json.type === "message.delta" && typeof json.content === "string") {
                    appendAssistantContent(assistantMessage, json.content);
                    scheduleMessageRender();
                    return;
                }
                var reasoningDelta = markdown.reasoningTextFromObject(json.delta || json);
                if (reasoningDelta) {
                    assistantMessage.reasoning = (assistantMessage.reasoning || "") + reasoningDelta;
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
        applyAssistantReasoning(assistantMessage, extractAnthropicReasoning(data), options);
        applyAssistantContent(assistantMessage, extractAnthropicText(data), options);
    }

    function hasMessageContent(message) {
        return Boolean(
            message &&
            (
                String(message.content || "").trim() ||
                (Array.isArray(message.images) && message.images.length)
            )
        );
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
        if (!message.images || !message.images.length || message.role !== "user") {
            return {
                role: message.role,
                content: message.content
            };
        }
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
        input.push({
            type: "text",
            content: message.content || " "
        });
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

    function addMaxTokens(body, key) {
        if (state.settings.maxTokens > 0) {
            body[key] = state.settings.maxTokens;
        }
    }

    function anthropicMaxTokens() {
        return state.settings.maxTokens > 0 ? state.settings.maxTokens : defaultSettings.maxTokens;
    }

    function addSamplerParams(body, target) {
        if (target === "openaiChat") {
            addOptionalParam(body, "top_p", state.settings.topP);
            addOptionalParam(body, "presence_penalty", state.settings.presencePenalty);
            addOptionalParam(body, "frequency_penalty", state.settings.frequencyPenalty);
            return;
        }
        if (target === "openaiResponses") {
            addOptionalParam(body, "top_p", state.settings.topP);
            return;
        }
        if (target === "anthropic") {
            addOptionalParam(body, "top_p", state.settings.topP);
            addOptionalParam(body, "top_k", state.settings.topK);
            return;
        }
        if (target === "lmstudioRest") {
            addOptionalParam(body, "temperature", state.settings.temperature);
            addOptionalParam(body, "top_p", state.settings.topP);
            addOptionalParam(body, "top_k", state.settings.topK);
            addOptionalParam(body, "min_p", state.settings.minP);
            addOptionalParam(body, "repeat_penalty", state.settings.repeatPenalty);
        }
    }

    function addOllamaOptions(options) {
        addOptionalParam(options, "temperature", state.settings.temperature);
        if (state.settings.maxTokens > 0) {
            options.num_predict = state.settings.maxTokens;
        }
        addOptionalParam(options, "top_p", state.settings.topP);
        addOptionalParam(options, "top_k", state.settings.topK);
        addOptionalParam(options, "min_p", state.settings.minP);
        addOptionalParam(options, "repeat_penalty", state.settings.repeatPenalty);
        addOptionalParam(options, "frequency_penalty", state.settings.frequencyPenalty);
    }

    function addOptionalParam(body, key, value) {
        if (value !== null && value !== undefined && value !== "") {
            body[key] = value;
        }
    }

    function addLmStudioReasoning(body) {
        var reasoning = state.settings.reasoning;
        if (!reasoning || reasoning === "auto") {
            return;
        }
        if (reasoning === "off") {
            body.reasoning = "off";
        } else if (reasoning === "on") {
            body.reasoning = "on";
        } else if (reasoning === "minimal") {
            body.reasoning = "low";
        } else if (reasoning === "xhigh") {
            body.reasoning = "high";
        } else {
            body.reasoning = reasoning;
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
        if (reasoning === "on") {
            reasoning = "medium";
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
        if (reasoning === "on") {
            body.reasoning_effort = "medium";
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
        var apiKey = secrets.apiKeyForHeader(elements.apiKeyInput.value, "API Key");
        return ui.buildHeaders({
            apiKey: apiKey,
            auth: options.auth,
            json: options.json,
            extra: options.anthropicVersion ? { "anthropic-version": "2023-06-01" } : null
        });
    }

    async function ensureOk(response) {
        return ui.ensureOk(response);
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

    function extractLmStudioRestReasoning(data) {
        if (!data || !Array.isArray(data.output)) {
            return "";
        }
        return data.output.map(function(item) {
            if (!item || item.type !== "reasoning") {
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

    function extractAnthropicReasoning(data) {
        if (!data || !Array.isArray(data.content)) {
            return "";
        }
        return data.content.map(function(item) {
            return markdown.reasoningTextFromObject(item);
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

    function extractOpenAiResponseReasoning(data) {
        if (!data || !Array.isArray(data.output)) {
            return "";
        }
        return data.output.map(function(item) {
            return markdown.reasoningTextFromObject(item);
        }).join("").trim();
    }

    function extractOpenAiResponseImages(data) {
        if (!data || !Array.isArray(data.output)) {
            return [];
        }
        var images = [];
        data.output.forEach(function(item, index) {
            if (!item || item.type !== "image_generation_call") {
                return;
            }
            var b64 = item.result || item.b64_json || item.image_b64 || "";
            if (!b64) {
                return;
            }
            images.push({
                name: "Responses 生成图片 " + (index + 1),
                type: outputImageType(item),
                dataUrl: base64ImageDataUrl(b64, outputImageType(item))
            });
        });
        return images;
    }

    function outputImageType(item) {
        var format = String(item.output_format || item.format || "png").toLowerCase();
        if (format === "jpg") {
            format = "jpeg";
        }
        return "image/" + (["png", "jpeg", "webp"].indexOf(format) !== -1 ? format : "png");
    }

    function normalizeGeneratedImages(images) {
        return (images || []).map(function(image, index) {
            if (!image) {
                return null;
            }
            if (typeof image === "string") {
                return {
                    name: "Responses 生成图片 " + (index + 1),
                    type: "image/png",
                    dataUrl: base64ImageDataUrl(image, "image/png")
                };
            }
            var type = image.type || "image/png";
            return {
                name: image.name || "Responses 生成图片 " + (index + 1),
                type: type,
                dataUrl: image.dataUrl || base64ImageDataUrl(image.b64_json || image.result || "", type),
                partial: Boolean(image.partial),
                previewIndex: image.previewIndex
            };
        }).filter(function(image) {
            return image && image.dataUrl;
        });
    }

    function base64ImageDataUrl(value, type) {
        var text = String(value || "");
        if (!text) {
            return "";
        }
        if (text.indexOf("data:") === 0) {
            return text;
        }
        return "data:" + (type || "image/png") + ";base64," + text;
    }

    function openAiMessageContent(message) {
        if (!message) {
            return "";
        }
        if (typeof message.content === "string") {
            return message.content;
        }
        if (!Array.isArray(message.content)) {
            return "";
        }
        return message.content.map(function(part) {
            if (!part) {
                return "";
            }
            if (typeof part === "string") {
                return part;
            }
            if (typeof part.text === "string") {
                return part.text;
            }
            if (typeof part.content === "string") {
                return part.content;
            }
            return "";
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
        var validation = validateConnectionConfig({ requireModel: false });
        if (!validation.valid) {
            setStatus(validation.status, "error");
            setFeedback(validation.message, validation.tone || "error");
            return [];
        }
        var modelEndpoint = modelsEndpointFor(provider);
        if (showStatus) {
            state.isLoadingModels = true;
            setButtonLoading(elements.loadModelsButton, true, "测试中", "测试连接/刷新模型");
            updateSendState();
        }
        try {
            if (showStatus) {
                setStatus("正在测试连接", "ok");
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
            setStatus(models.length ? "连接正常，已刷新模型列表" : "连接正常，但未返回模型列表", models.length ? "ok" : "warn");
            setFeedback(models.length ? "连接正常，已刷新模型列表。" : "连接正常，但未返回模型列表。", models.length ? "ok" : "warn");
            return models;
        } catch (error) {
            setStatus("模型读取失败", "error");
            setFeedback(explainError(error), "error");
            throw error;
        } finally {
            if (showStatus) {
                state.isLoadingModels = false;
                setButtonLoading(elements.loadModelsButton, false, "测试中", "测试连接/刷新模型");
                updateSendState();
            }
        }
    }

    function validateConnectionConfig(options) {
        options = options || {};
        var provider = config.getProvider(state.settings.provider);
        if (provider.mode === "none" || !state.settings.provider) {
            return {
                valid: false,
                status: "未配置 Provider",
                message: "当前还未配置 Provider 信息。请先在设置页创建并选择一个预设。"
            };
        }
        if (!state.settings.endpoint) {
            return {
                valid: false,
                status: "请先填写地址",
                message: "当前预设还没有填写服务地址。请到设置页补全地址。"
            };
        }
        if (options.requireModel && !state.settings.model) {
            return {
                valid: false,
                status: "请先填写模型名",
                message: "当前预设还没有选择模型。请先测试连接/刷新模型，或手动填写模型名。",
                tone: "warn"
            };
        }
        return {
            valid: true,
            status: "",
            message: ""
        };
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
            return ui.modelNamesFromItems(data.models || [], "chat");
        }
        if (provider.mode === "lmstudioRest" && Array.isArray(data.models)) {
            return extractLmStudioModelNames(data.models);
        }
        if (Array.isArray(data.data)) {
            return ui.modelNamesFromItems(data.data, "chat");
        }
        if (Array.isArray(data.models)) {
            return ui.modelNamesFromItems(data.models, "chat");
        }
        return [];
    }

    function extractLmStudioModelNames(models) {
        var loaded = [];
        var available = [];
        models.forEach(function(model) {
            if (!ui.isChatModelItem(model)) {
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
            available.push(ui.modelNameFromItem(model));
        });
        return ui.uniqueValues(loaded.concat(available));
    }

    function renderModelOptions(models) {
        modelPicker.render(models);
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
        ui.setStatusPill(elements.connectionPill, text, tone);
        elements.statusText.textContent = text;
    }

    function setFeedback(text, tone) {
        ui.setToneText(elements.connectionFeedback, "connection-feedback", text, tone);
    }

    function clearFeedback() {
        ui.clearToneText(elements.connectionFeedback, "connection-feedback");
    }

    function setButtonLoading(button, loading, loadingText, normalText) {
        ui.setButtonLoading(button, loading, loadingText, normalText);
    }

    async function addImageFiles(fileList) {
        var loaded = await ui.readImageFiles(fileList);
        if (!loaded.length) {
            return;
        }
        state.pendingImages = state.pendingImages.concat(loaded);
        renderPendingImages();
        setFeedback("已添加 " + loaded.length + " 张图片。", "ok");
    }

    async function handlePromptPaste(event) {
        var files = ui.imageFilesFromPaste(event);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        await addImageFiles(files);
    }

    function createMessage(role, content, images) {
        return {
            id: newMessageId(),
            role: role,
            content: content,
            reasoning: "",
            reasoningComplete: false,
            images: images || [],
            createdAt: new Date().toISOString()
        };
    }

    function newMessageId() {
        return "msg-" + Date.now() + "-" + Math.random().toString(16).slice(2);
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

    function optionalNumberValue(value) {
        return value === null || value === undefined ? "" : String(value);
    }

    function parseTokenLimit(value) {
        var number = parseInt(value, 10);
        if (!Number.isFinite(number) || number <= 0) {
            return 0;
        }
        return number;
    }

    function parseOptionalNumber(value, min, max) {
        if (value === null || value === undefined || String(value).trim() === "") {
            return null;
        }
        return clampNumber(value, min, max, null);
    }

    function parseOptionalInteger(value, min) {
        if (value === null || value === undefined || String(value).trim() === "") {
            return null;
        }
        var number = parseInt(value, 10);
        if (!Number.isFinite(number)) {
            return null;
        }
        return Math.max(min, number);
    }

    function normalizeOptionalNumber(value, min, max) {
        if (value === null || value === undefined || value === "") {
            return null;
        }
        return clampNumber(value, min, max, null);
    }

    function normalizeOptionalInteger(value, min) {
        if (value === null || value === undefined || value === "") {
            return null;
        }
        var number = parseInt(value, 10);
        if (!Number.isFinite(number)) {
            return null;
        }
        return Math.max(min, number);
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
        return ui.explainError(error, { localService: true });
    }
})();
