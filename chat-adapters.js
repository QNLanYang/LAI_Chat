(function(window) {
    "use strict";

    var markdown = window.LocalAiMarkdown || {
        reasoningTextFromObject: function() {
            return "";
        }
    };

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
        message.images.filter(hasImageDataUrl).forEach(function(image) {
            content.push({
                type: "image_url",
                image_url: {
                    url: image.dataUrl
                }
            });
        });
        if (!content.length) {
            return {
                role: message.role,
                content: message.content || ""
            };
        }
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
        (message.images || []).filter(hasImageDataUrl).forEach(function(image) {
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
        message.images.filter(hasImageDataUrl).forEach(function(image) {
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
            payload.images = message.images.filter(hasImageDataUrl).map(function(image) {
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
        message.images.filter(hasImageDataUrl).forEach(function(image) {
            content.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: image.type || "image/png",
                    data: image.dataUrl.split(",")[1] || ""
                }
            });
        });
        if (!content.length) {
            return {
                role: message.role,
                content: message.content || ""
            };
        }
        return {
            role: message.role,
            content: content
        };
    }

    function buildOpenAiChatBody(options) {
        var body = {
            model: options.model,
            messages: (options.messages || []).map(toOpenAiChatMessage),
            temperature: options.temperature,
            stream: options.stream
        };
        addMaxTokens(body, "max_tokens", options.maxTokens);
        addSamplerParams(body, "openaiChat", options);
        addChatReasoning(body, options.reasoning);
        return body;
    }

    function buildOpenAiResponsesBody(options) {
        var body = {
            model: options.model,
            input: options.input || (options.messages || []).map(toOpenAiResponseInput),
            temperature: options.temperature,
            stream: options.stream
        };
        addMaxTokens(body, "max_output_tokens", options.maxOutputTokens);
        addSamplerParams(body, "openaiResponses", options);
        if (options.tools && options.tools.length) {
            body.tools = options.tools;
        }
        if (options.previousResponseId) {
            body.previous_response_id = options.previousResponseId;
        }
        if (options.instructions) {
            body.instructions = options.instructions;
        }
        addResponsesReasoning(body, options.reasoning);
        return body;
    }

    function buildLmStudioBody(options) {
        var body = {
            model: options.model,
            input: options.input,
            stream: options.stream
        };
        addMaxTokens(body, "max_output_tokens", options.maxOutputTokens);
        addSamplerParams(body, "lmstudioRest", options);
        addLmStudioReasoning(body, options.reasoning);
        if (options.systemPrompt) {
            body.system_prompt = options.systemPrompt;
        }
        if (options.previousResponseId) {
            body.previous_response_id = options.previousResponseId;
        }
        return body;
    }

    function buildOllamaBody(options) {
        var body = {
            model: options.model,
            messages: (options.messages || []).map(toOllamaMessage),
            stream: options.stream,
            options: {}
        };
        addOllamaOptions(body.options, options);
        return body;
    }

    function buildAnthropicBody(options) {
        var body = {
            model: options.model,
            messages: (options.messages || []).filter(function(message) {
                return message.role !== "system";
            }).map(toAnthropicMessage),
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            stream: options.stream
        };
        addSamplerParams(body, "anthropic", options);
        if (options.system) {
            body.system = options.system;
        }
        if (options.tools && options.tools.length) {
            body.tools = options.tools;
        }
        if (options.toolChoice) {
            body.tool_choice = options.toolChoice;
        }
        return body;
    }

    function addMaxTokens(body, key, maxTokens) {
        if (Number(maxTokens) > 0) {
            body[key] = Number(maxTokens);
        }
    }

    function addSamplerParams(body, target, options) {
        options = options || {};
        if (target === "openaiChat") {
            addOptionalParam(body, "top_p", options.topP);
            addOptionalParam(body, "presence_penalty", options.presencePenalty);
            addOptionalParam(body, "frequency_penalty", options.frequencyPenalty);
            return;
        }
        if (target === "openaiResponses") {
            addOptionalParam(body, "top_p", options.topP);
            return;
        }
        if (target === "anthropic") {
            addOptionalParam(body, "top_p", options.topP);
            addOptionalParam(body, "top_k", options.topK);
            return;
        }
        if (target === "lmstudioRest") {
            addOptionalParam(body, "temperature", options.temperature);
            addOptionalParam(body, "top_p", options.topP);
            addOptionalParam(body, "top_k", options.topK);
            addOptionalParam(body, "min_p", options.minP);
            addOptionalParam(body, "repeat_penalty", options.repeatPenalty);
        }
    }

    function addOllamaOptions(optionsBody, options) {
        options = options || {};
        addOptionalParam(optionsBody, "temperature", options.temperature);
        if (Number(options.maxTokens) > 0) {
            optionsBody.num_predict = Number(options.maxTokens);
        }
        addOptionalParam(optionsBody, "top_p", options.topP);
        addOptionalParam(optionsBody, "top_k", options.topK);
        addOptionalParam(optionsBody, "min_p", options.minP);
        addOptionalParam(optionsBody, "repeat_penalty", options.repeatPenalty);
        addOptionalParam(optionsBody, "frequency_penalty", options.frequencyPenalty);
    }

    function addOptionalParam(body, key, value) {
        if (value !== null && value !== undefined && value !== "") {
            body[key] = value;
        }
    }

    function addLmStudioReasoning(body, reasoning) {
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

    function addResponsesReasoning(body, reasoning) {
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

    function addChatReasoning(body, reasoning) {
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
            var url = item.url || item.image_url || "";
            if (!b64 && !url) {
                return;
            }
            images.push({
                name: "Responses 生成图片 " + (index + 1),
                type: outputImageType(item),
                dataUrl: base64ImageDataUrl(b64, outputImageType(item)),
                url: url
            });
        });
        return images;
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
                url: image.url || image.image_url || "",
                objectUrl: image.objectUrl || "",
                partial: Boolean(image.partial),
                previewIndex: image.previewIndex
            };
        }).filter(function(image) {
            return image && messageImageSrc(image);
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

    function messageImageSrc(image) {
        if (!image) {
            return "";
        }
        return image.objectUrl || image.dataUrl || image.url || "";
    }

    function hasImageDataUrl(image) {
        return Boolean(image && image.dataUrl);
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

    function isEventStream(response) {
        return (response.headers.get("content-type") || "").toLowerCase().indexOf("text/event-stream") !== -1;
    }

    function isJsonResponse(response) {
        return (response.headers.get("content-type") || "").toLowerCase().indexOf("application/json") !== -1;
    }

    window.LocalAiChatAdapters = {
        toOpenAiChatMessage: toOpenAiChatMessage,
        toOpenAiResponseInput: toOpenAiResponseInput,
        toLmStudioInput: toLmStudioInput,
        toOllamaMessage: toOllamaMessage,
        toAnthropicMessage: toAnthropicMessage,
        buildOpenAiChatBody: buildOpenAiChatBody,
        buildOpenAiResponsesBody: buildOpenAiResponsesBody,
        buildLmStudioBody: buildLmStudioBody,
        buildOllamaBody: buildOllamaBody,
        buildAnthropicBody: buildAnthropicBody,
        openAiMessageContent: openAiMessageContent,
        extractOpenAiResponseText: extractOpenAiResponseText,
        extractOpenAiResponseReasoning: extractOpenAiResponseReasoning,
        extractOpenAiResponseImages: extractOpenAiResponseImages,
        extractLmStudioRestText: extractLmStudioRestText,
        extractLmStudioRestReasoning: extractLmStudioRestReasoning,
        extractAnthropicText: extractAnthropicText,
        extractAnthropicReasoning: extractAnthropicReasoning,
        normalizeGeneratedImages: normalizeGeneratedImages,
        base64ImageDataUrl: base64ImageDataUrl,
        readSse: readSse,
        readJsonLines: readJsonLines,
        isEventStream: isEventStream,
        isJsonResponse: isJsonResponse,
        messageImageSrc: messageImageSrc
    };
})(window);
