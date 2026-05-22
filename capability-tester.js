(function(window) {
    "use strict";

    var DEFS = [
        { key: "reasoning", label: "推理" },
        { key: "vision", label: "视觉" },
        { key: "tools", label: "工具" }
    ];

    var TINY_PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P8z8DwHwAFBQIAHl6u2QAAAABJRU5ErkJggg==";

    function unknownCapability() {
        return {
            status: "unknown",
            source: "",
            detail: ""
        };
    }

    function capability(status, source, detail) {
        return {
            status: status,
            source: source,
            detail: detail || ""
        };
    }

    function capabilityStatusText(status) {
        if (status === "supported") {
            return "支持";
        }
        if (status === "probable") {
            return "可能";
        }
        if (status === "unsupported") {
            return "不支持";
        }
        if (status === "testing") {
            return "测试中";
        }
        if (status === "error") {
            return "失败";
        }
        return "未知";
    }

    function mergeCapabilityResults(base, override) {
        var result = {};
        DEFS.forEach(function(def) {
            result[def.key] = Object.assign({}, unknownCapability(), base[def.key] || {});
            if (override[def.key] && override[def.key].status !== "unknown") {
                result[def.key] = Object.assign({}, result[def.key], override[def.key]);
            }
        });
        return result;
    }

    function capabilitiesFromModelMetadata(model) {
        var result = {};
        DEFS.forEach(function(def) {
            result[def.key] = unknownCapability();
        });
        DEFS.forEach(function(def) {
            var status = metadataCapabilityStatus(model, def.key);
            if (status !== "unknown") {
                result[def.key] = {
                    status: status,
                    source: "模型列表",
                    detail: "来自 /models 返回的显式能力字段"
                };
            }
        });
        return result;
    }

    function metadataCapabilityStatus(model, capabilityKey) {
        var status = "unknown";
        if (!model || typeof model !== "object") {
            return status;
        }
        [
            "capabilities",
            "supported_capabilities",
            "supportedCapabilities",
            "features",
            "supported_features",
            "supportedFeatures",
            "modalities",
            "input_modalities",
            "inputModalities"
        ].forEach(function(fieldKey) {
            if (model[fieldKey] !== undefined) {
                status = mergeMetadataCapabilityStatus(status, metadataCapabilityStatusFromValue(model[fieldKey], capabilityKey));
            }
        });
        ["metadata", "details", "info"].forEach(function(nestedKey) {
            if (model[nestedKey] && typeof model[nestedKey] === "object") {
                status = mergeMetadataCapabilityStatus(status, metadataCapabilityStatus(model[nestedKey], capabilityKey));
            }
        });
        return status;
    }

    function metadataCapabilityStatusFromValue(value, capabilityKey) {
        if (Array.isArray(value)) {
            var arrayStatus = "unknown";
            value.forEach(function(item) {
                if (typeof item === "string" || typeof item === "number") {
                    if (capabilityTokenMatch([item], capabilityKey)) {
                        arrayStatus = "supported";
                    }
                    return;
                }
                arrayStatus = mergeMetadataCapabilityStatus(arrayStatus, metadataCapabilityStatusFromValue(item, capabilityKey));
            });
            return arrayStatus;
        }
        if (value && typeof value === "object") {
            var objectStatus = "unknown";
            Object.keys(value).forEach(function(fieldKey) {
                var item = value[fieldKey];
                if (capabilityTokenMatch([fieldKey], capabilityKey)) {
                    objectStatus = mergeMetadataCapabilityStatus(objectStatus, metadataStatusFromExplicitValue(item));
                    return;
                }
                objectStatus = mergeMetadataCapabilityStatus(objectStatus, metadataCapabilityStatusFromValue(item, capabilityKey));
            });
            return objectStatus;
        }
        if (value !== undefined && value !== null) {
            return capabilityTokenMatch([value], capabilityKey) ? "supported" : "unknown";
        }
        return "unknown";
    }

    function metadataStatusFromExplicitValue(value) {
        if (typeof value === "string") {
            value = value.toLowerCase();
        }
        if (value === false || value === "false" || value === "off" || value === "none") {
            return "unsupported";
        }
        if (value === undefined || value === null) {
            return "unknown";
        }
        if (Array.isArray(value)) {
            return value.length ? "supported" : "unknown";
        }
        if (typeof value === "object") {
            var keys = Object.keys(value);
            if (Array.isArray(value.allowed_options) &&
                    !value.allowed_options.some(function(option) {
                        option = String(option || "").toLowerCase();
                        return option && option !== "off" && option !== "none";
                    })) {
                return "unsupported";
            }
            var hasTrue = false;
            var hasFalse = false;
            keys.forEach(function(key) {
                if (typeof value[key] === "boolean") {
                    hasTrue = hasTrue || Boolean(value[key]);
                    hasFalse = hasFalse || !value[key];
                }
            });
            if (hasTrue) {
                return "supported";
            }
            if (hasFalse && !hasTrue) {
                return "unsupported";
            }
            return keys.length ? "supported" : "unknown";
        }
        return value ? "supported" : "unknown";
    }

    function mergeMetadataCapabilityStatus(current, next) {
        if (current === "supported" || next === "supported") {
            return "supported";
        }
        if (current === "unsupported" || next === "unsupported") {
            return "unsupported";
        }
        return "unknown";
    }

    function capabilityTokenMatch(tokens, key) {
        tokens = (tokens || []).map(function(token) {
            return String(token || "").toLowerCase();
        });
        var text = tokens.join(" ");
        if (key === "reasoning") {
            return /reason|thinking|thought/.test(text);
        }
        if (key === "vision") {
            return /vision|visual|multimodal|image[_ -]?input|input[_ -]?image/.test(text) ||
                tokens.indexOf("image") !== -1 ||
                tokens.indexOf("images") !== -1;
        }
        if (key === "tools") {
            return /tool|function[_ -]?call|functioncall/.test(text);
        }
        return false;
    }

    async function runProbe(key, deps) {
        try {
            if (key === "reasoning") {
                return await testReasoningCapability(deps);
            }
            if (key === "vision") {
                return await testVisionCapability(deps);
            }
            if (key === "tools") {
                return await testToolCapability(deps);
            }
            return unknownCapability();
        } catch (error) {
            return capabilityFromError(error, deps);
        }
    }

    async function testReasoningCapability(deps) {
        var messages = [{
            role: "user",
            content: "Reply only OK."
        }];
        var response;
        try {
            response = await sendCapabilityTextProbe({
                reasoning: true,
                messages: messages
            }, deps);
        } catch (error) {
            if (!isReasoningControlRejected(error)) {
                throw error;
            }
            response = await sendCapabilityTextProbe({
                messages: messages
            }, deps);
        }
        if (String(response.reasoning || "").trim()) {
            return capability("supported", "实测", "返回了 reasoning 内容");
        }
        if (/<\/?think/i.test(response.text || "")) {
            return capability("supported", "实测", "返回了思考标签");
        }
        return capability("unsupported", "实测", "请求成功但未返回 reasoning 内容");
    }

    async function testVisionCapability(deps) {
        var response = await sendCapabilityTextProbe({
            reasoningOff: true,
            messages: [{
                role: "user",
                content: "The attached image is exactly one pixel. What color is the pixel? Reply with one lowercase English color word.",
                images: [{
                    name: "capability-test.png",
                    type: "image/png",
                    size: 69,
                    dataUrl: TINY_PNG_DATA_URL
                }]
            }]
        }, deps);
        if (response.ok) {
            return capability("supported", "实测", "图片问答成功");
        }
        return capability("unsupported", "实测", "图片输入请求失败");
    }

    async function testToolCapability(deps) {
        var response = await sendCapabilityToolProbe(deps.provider, deps);
        var toolCalls = normalizeToolCalls(response.toolCalls);
        return toolCalls.length ?
            capability("supported", "实测", "模型返回了 tool_call") :
            capability("unsupported", "实测", "请求成功但未返回 tool_call");
    }

    function capabilityFromError(error, deps) {
        var explainError = deps && deps.explainError;
        if (isCapabilityUnsupportedError(error)) {
            return capability("unsupported", "实测", explainError ? explainError(error) : errorMessage(error));
        }
        return capability("error", "实测", explainError ? explainError(error) : errorMessage(error));
    }

    function isCapabilityUnsupportedError(error) {
        var message = errorMessage(error).toLowerCase();
        return message.indexOf("unsupported") !== -1 ||
            message.indexOf("not support") !== -1 ||
            message.indexOf("does not support") !== -1 ||
            message.indexOf("invalid parameter") !== -1 ||
            message.indexOf("unknown parameter") !== -1 ||
            message.indexOf("unrecognized") !== -1 ||
            message.indexOf("tool") !== -1 && message.indexOf("support") !== -1 ||
            message.indexOf("image") !== -1 && message.indexOf("support") !== -1 ||
            message.indexOf("vision") !== -1 && message.indexOf("support") !== -1 ||
            message.indexOf("reasoning") !== -1 && message.indexOf("support") !== -1 ||
            message.indexOf("不支持") !== -1;
    }

    async function sendCapabilityTextProbe(options, deps) {
        var provider = deps.provider;
        if (provider.mode === "ollama") {
            return sendOllamaCapabilityProbe(options, deps);
        }
        if (provider.mode === "lmstudioRest") {
            return sendLmStudioCapabilityProbe(options, deps);
        }
        if (provider.mode === "anthropic") {
            return sendAnthropicCapabilityProbe(options, deps);
        }
        if (deps.settings.openaiApi === "responses" && provider.supportsResponses !== false) {
            return sendOpenAiResponsesCapabilityProbe(options, deps);
        }
        return sendOpenAiChatCapabilityProbe(options, deps);
    }

    async function sendCapabilityToolProbe(provider, deps) {
        if (provider.mode === "ollama") {
            return sendOllamaCapabilityProbe({
                reasoningOff: true,
                tools: true,
                messages: [toolProbeMessage()]
            }, deps);
        }
        if (provider.mode === "lmstudioRest") {
            return sendOpenAiChatCapabilityProbe({
                reasoningOff: true,
                tools: true,
                toolChoice: "required",
                url: deps.lmStudioOpenAiChatCompletionsUrl(),
                messages: [toolProbeMessage()]
            }, deps);
        }
        if (provider.mode === "anthropic") {
            return sendAnthropicCapabilityProbe({
                tools: true,
                messages: [toolProbeMessage()]
            }, deps);
        }
        return sendOpenAiChatCapabilityProbe({
            reasoningOff: true,
            tools: true,
            toolChoice: "required",
            forceChatCompletions: true,
            messages: [toolProbeMessage()]
        }, deps);
    }

    function toolProbeMessage() {
        return {
            role: "user",
            content: "Call the capability_probe tool with ok=true. Do not answer in text."
        };
    }

    async function sendOpenAiChatCapabilityProbe(options, deps) {
        var settings = options.forceChatCompletions ? Object.assign({}, deps.settings, { openaiApi: "chat" }) : deps.settings;
        var url = options.url || deps.requestUrlFor(settings, "chat");
        var body = {
            model: deps.settings.model,
            messages: options.messages.map(deps.toOpenAiChatMessage),
            temperature: 0,
            stream: false
        };
        if (options.reasoning) {
            body.reasoning_effort = "minimal";
        } else if (options.reasoningOff) {
            body.reasoning_effort = "none";
        }
        if (options.tools) {
            body.tools = [openAiToolDefinition()];
            body.tool_choice = options.toolChoice || "required";
        }
        var data = await fetchCapabilityJsonWithProbeRetries(url, {
            method: "POST",
            headers: deps.requestHeaders({ auth: "bearer", json: true }),
            body: JSON.stringify(body)
        }, body, options, ["reasoning_effort"]);
        var message = (((data.choices || [])[0] || {}).message || {});
        return {
            ok: true,
            text: openAiMessageContent(message, deps),
            reasoning: deps.markdown.reasoningTextFromObject(message),
            toolCalls: normalizeToolCalls(message.tool_calls || message.toolCalls || message.function_call || message.functionCall)
        };
    }

    async function sendOpenAiResponsesCapabilityProbe(options, deps) {
        var body = {
            model: deps.settings.model,
            input: options.messages.map(deps.toOpenAiResponseInput),
            temperature: 0,
            stream: false
        };
        if (options.reasoning) {
            body.reasoning = {
                effort: "minimal"
            };
        } else if (options.reasoningOff) {
            body.reasoning = {
                effort: "none"
            };
        }
        var data = await fetchCapabilityJsonWithProbeRetries(deps.requestUrlFor(deps.settings, "chat"), {
            method: "POST",
            headers: deps.requestHeaders({ auth: "bearer", json: true }),
            body: JSON.stringify(body)
        }, body, options, ["reasoning"]);
        return {
            ok: true,
            text: extractOpenAiResponseText(data, deps),
            reasoning: extractOpenAiResponseReasoning(data, deps),
            toolCalls: extractOpenAiResponseToolCalls(data)
        };
    }

    async function sendLmStudioCapabilityProbe(options, deps) {
        var latest = options.messages[options.messages.length - 1];
        var body = {
            model: deps.settings.model,
            input: deps.toLmStudioInput(latest),
            stream: false,
            temperature: 0
        };
        if (options.reasoning) {
            body.reasoning = lmStudioReasoningProbeValue(deps);
        } else if (options.reasoningOff) {
            body.reasoning = "off";
        }
        var data = await fetchCapabilityJsonWithProbeRetries(deps.requestUrlFor(deps.settings, "chat"), {
            method: "POST",
            headers: deps.requestHeaders({ auth: "bearer", json: true }),
            body: JSON.stringify(body)
        }, body, options, ["reasoning"]);
        return {
            ok: true,
            text: extractLmStudioRestText(data, deps),
            reasoning: extractLmStudioRestReasoning(data, deps),
            toolCalls: []
        };
    }

    async function sendOllamaCapabilityProbe(options, deps) {
        var body = {
            model: deps.settings.model,
            messages: options.messages.map(deps.toOllamaMessage),
            stream: false,
            options: {
                temperature: 0
            }
        };
        if (options.reasoning) {
            body.think = true;
        } else if (options.reasoningOff) {
            body.think = false;
        }
        if (options.tools) {
            body.tools = [ollamaToolDefinition()];
        }
        var data = await fetchCapabilityJsonWithProbeRetries(deps.requestUrlFor(deps.settings, "chat"), {
            method: "POST",
            headers: deps.requestHeaders({ json: true }),
            body: JSON.stringify(body)
        }, body, options, ["think"]);
        var message = data.message || {};
        return {
            ok: true,
            text: message.content || data.response || "",
            reasoning: message.thinking || data.thinking || "",
            toolCalls: normalizeToolCalls(message.tool_calls || message.toolCalls || data.tool_calls || data.toolCalls)
        };
    }

    async function sendAnthropicCapabilityProbe(options, deps) {
        var body = {
            model: deps.settings.model,
            messages: options.messages.filter(function(message) {
                return message.role !== "system";
            }).map(deps.toAnthropicMessage),
            max_tokens: deps.anthropicMaxTokens(),
            temperature: 0,
            stream: false
        };
        if (options.tools) {
            body.tools = [anthropicToolDefinition()];
            body.tool_choice = {
                type: "tool",
                name: "capability_probe"
            };
        }
        var data = await fetchCapabilityJson(deps.requestUrlFor(deps.settings, "chat"), {
            method: "POST",
            headers: deps.requestHeaders({ auth: "x-api-key", json: true, anthropicVersion: true }),
            body: JSON.stringify(body)
        });
        return {
            ok: true,
            text: extractAnthropicText(data, deps),
            reasoning: extractAnthropicReasoning(data, deps),
            toolCalls: extractAnthropicToolCalls(data)
        };
    }

    function openAiToolDefinition() {
        return {
            type: "function",
            function: {
                name: "capability_probe",
                description: "Reports model tool-use capability.",
                parameters: toolProbeSchema()
            }
        };
    }

    function ollamaToolDefinition() {
        return openAiToolDefinition();
    }

    function anthropicToolDefinition() {
        return {
            name: "capability_probe",
            description: "Reports model tool-use capability.",
            input_schema: toolProbeSchema()
        };
    }

    function toolProbeSchema() {
        return {
            type: "object",
            properties: {
                ok: {
                    type: "boolean"
                }
            },
            required: ["ok"]
        };
    }

    function lmStudioReasoningProbeValue(deps) {
        var metadata = deps.currentModelMetadata || null;
        var reasoning = metadata &&
            metadata.capabilities &&
            metadata.capabilities.reasoning;
        var allowed = reasoning && Array.isArray(reasoning.allowed_options) ? reasoning.allowed_options : [];
        if (allowed.indexOf("on") !== -1) {
            return "on";
        }
        if (allowed.indexOf("low") !== -1) {
            return "low";
        }
        if (allowed.length) {
            return allowed[0];
        }
        return "on";
    }

    async function fetchCapabilityJson(url, options) {
        var controller = new AbortController();
        var timer = window.setTimeout(function() {
            controller.abort();
        }, 30000);
        try {
            var response = await fetch(url, Object.assign({}, options, {
                signal: controller.signal
            }));
            await ensureOk(response);
            return await response.json();
        } finally {
            window.clearTimeout(timer);
        }
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

    async function fetchCapabilityJsonWithProbeRetries(url, requestOptions, body, options, reasoningFields) {
        var reasoningRetried = false;
        var toolChoiceRetried = false;
        while (true) {
            try {
                return await fetchCapabilityJson(url, Object.assign({}, requestOptions, {
                    body: JSON.stringify(body)
                }));
            } catch (error) {
                if (options.reasoningOff && !reasoningRetried && isReasoningControlRejected(error)) {
                    reasoningRetried = true;
                    (reasoningFields || []).forEach(function(field) {
                        delete body[field];
                    });
                    continue;
                }
                if (options.tools && !toolChoiceRetried && isToolChoiceRejected(error)) {
                    toolChoiceRetried = true;
                    toggleToolChoiceShape(body);
                    continue;
                }
                throw error;
            }
        }
    }

    function isReasoningControlRejected(error) {
        var message = errorMessage(error).toLowerCase();
        return /reasoning|reasoning_effort|effort|think/i.test(message) &&
            /unsupported|unknown|unrecognized|invalid|not supported|extra|none/i.test(message);
    }

    function isToolChoiceRejected(error) {
        var message = errorMessage(error).toLowerCase();
        return /tool_choice|tool choice|toolchoice/i.test(message) &&
            /unsupported|unknown|unrecognized|invalid|not supported|must be|supported values/i.test(message);
    }

    function toggleToolChoiceShape(body) {
        if (body.tool_choice === "required") {
            body.tool_choice = {
                type: "function",
                function: {
                    name: "capability_probe"
                }
            };
            return;
        }
        body.tool_choice = "required";
    }

    function normalizeToolCalls(value) {
        if (!value) {
            return [];
        }
        if (Array.isArray(value)) {
            return value.filter(Boolean);
        }
        return [value];
    }

    function extractOpenAiResponseToolCalls(data) {
        if (!data || !Array.isArray(data.output)) {
            return [];
        }
        return data.output.filter(function(item) {
            return item && (item.type === "function_call" || item.type === "tool_call");
        });
    }

    function extractAnthropicToolCalls(data) {
        if (!data || !Array.isArray(data.content)) {
            return [];
        }
        return data.content.filter(function(item) {
            return item && item.type === "tool_use";
        });
    }

    function extractOpenAiResponseText(data, deps) {
        if (deps && typeof deps.extractOpenAiResponseText === "function") {
            return deps.extractOpenAiResponseText(data);
        }
        if (!data || !Array.isArray(data.output)) {
            return "";
        }
        return data.output.map(function(item) {
            return item && item.type === "message" ? String(item.content || "") : "";
        }).join("").trim();
    }

    function extractOpenAiResponseReasoning(data, deps) {
        if (deps && typeof deps.extractOpenAiResponseReasoning === "function") {
            return deps.extractOpenAiResponseReasoning(data);
        }
        if (!data || !Array.isArray(data.output)) {
            return "";
        }
        return data.output.map(function(item) {
            return item && item.type === "reasoning" ? String(item.content || "") : "";
        }).join("").trim();
    }

    function extractLmStudioRestText(data, deps) {
        if (deps && typeof deps.extractLmStudioRestText === "function") {
            return deps.extractLmStudioRestText(data);
        }
        if (!data || !Array.isArray(data.output)) {
            return "";
        }
        return data.output.map(function(item) {
            return item && item.type === "message" ? String(item.content || "") : "";
        }).join("").trim();
    }

    function extractLmStudioRestReasoning(data, deps) {
        if (deps && typeof deps.extractLmStudioRestReasoning === "function") {
            return deps.extractLmStudioRestReasoning(data);
        }
        if (!data || !Array.isArray(data.output)) {
            return "";
        }
        return data.output.map(function(item) {
            return item && item.type === "reasoning" ? String(item.content || "") : "";
        }).join("").trim();
    }

    function extractAnthropicText(data, deps) {
        if (deps && typeof deps.extractAnthropicText === "function") {
            return deps.extractAnthropicText(data);
        }
        if (!data || !Array.isArray(data.content)) {
            return "";
        }
        return data.content.map(function(item) {
            return item && item.type === "text" ? String(item.text || "") : "";
        }).join("").trim();
    }

    function extractAnthropicReasoning(data, deps) {
        if (deps && typeof deps.extractAnthropicReasoning === "function") {
            return deps.extractAnthropicReasoning(data);
        }
        if (!data || !Array.isArray(data.content)) {
            return "";
        }
        return data.content.map(function(item) {
            return item && item.type === "thinking" ? String(item.thinking || item.text || "") : "";
        }).join("").trim();
    }

    function openAiMessageContent(message, deps) {
        if (deps && typeof deps.openAiMessageContent === "function") {
            return deps.openAiMessageContent(message);
        }
        if (!message) {
            return "";
        }
        if (typeof message.content === "string") {
            return message.content;
        }
        if (Array.isArray(message.content)) {
            return message.content.map(function(part) {
                return part && typeof part.text === "string" ? part.text : "";
            }).join("").trim();
        }
        return "";
    }

    function errorMessage(error) {
        return error && error.message ? error.message : String(error || "");
    }

    window.LocalAiCapabilityTester = {
        DEFS: DEFS,
        unknownCapability: unknownCapability,
        capabilityStatusText: capabilityStatusText,
        mergeCapabilityResults: mergeCapabilityResults,
        capabilitiesFromModelMetadata: capabilitiesFromModelMetadata,
        runProbe: runProbe,
        capabilityFromError: capabilityFromError
    };
})(window);
