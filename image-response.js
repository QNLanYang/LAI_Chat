(function(window) {
    "use strict";

    var VERIFIABLE_RESPONSE_FIELDS = ["size", "quality", "background", "output_format"];
    var FIELD_LABELS = {
        size: "size",
        quality: "quality",
        background: "background",
        output_format: "output_format"
    };

    async function handleOpenAiImageResponse(response, requestOptions, hooks) {
        var contentType = response.headers.get("content-type") || "";
        if (contentType.indexOf("text/event-stream") !== -1) {
            emitStatus(hooks, "接收中，请勿刷新或离开页面...", "ok");
            return extractOpenAiStreamImages(response, requestOptions, hooks);
        }
        emitStatus(hooks, "接收中...", "ok");
        return extractOpenAiImages(await response.json(), requestOptions, { hooks: hooks });
    }

    async function extractOpenAiStreamImages(response, requestOptions, hooks) {
        if (!response.body || !response.body.getReader) {
            throw new Error("当前浏览器不支持读取流式图片响应。");
        }
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        var images = [];
        var finalPayload = null;
        while (true) {
            var chunk = await reader.read();
            if (chunk.done) {
                break;
            }
            buffer += decoder.decode(chunk.value, { stream: true });
            var parts = buffer.split(/\r?\n\r?\n/);
            buffer = parts.pop() || "";
            parts.forEach(function(part) {
                var payload = parseSsePayload(part);
                if (!payload) {
                    return;
                }
                var partial = extractOpenAiPartialImage(payload, requestOptions);
                if (partial) {
                    images = [partial];
                    emitPartialImage(hooks, partial);
                    return;
                }
                var eventImages = extractOpenAiImages(payload, requestOptions, { skipWarnings: true });
                if (eventImages.length) {
                    images = eventImages;
                    finalPayload = payload;
                }
            });
        }
        buffer += decoder.decode();
        var payload = parseSsePayload(buffer);
        if (payload) {
            var lastImages = extractOpenAiImages(payload, requestOptions, { skipWarnings: true });
            if (lastImages.length) {
                images = lastImages;
                finalPayload = payload;
            }
        }
        if (finalPayload) {
            collectOpenAiResponseWarnings(finalPayload, requestOptions, hooks);
        } else if (requestOptions && requestOptions.stream) {
            emitWarning(hooks, "上游使用了流式响应，但没有回显可对比的最终参数。");
        }
        return images;
    }

    function extractOpenAiPartialImage(payload, requestOptions) {
        if (String(payload && payload.type || "").toLowerCase().indexOf("partial_image") === -1) {
            return "";
        }
        var image = payload.partial_image_b64 ||
            payload.partial_image ||
            payload.b64_json ||
            payload.image_base64 ||
            payload.b64;
        if (!image) {
            return "";
        }
        var type = imageTypeFromFormat(payload.output_format || requestOptions && requestOptions.output_format) || "image/png";
        return "data:" + type + ";base64," + image;
    }

    function parseSsePayload(part) {
        var lines = String(part || "").split(/\r?\n/);
        var dataLines = [];
        lines.forEach(function(line) {
            if (line.indexOf("data:") === 0) {
                dataLines.push(line.slice(5).trim());
            }
        });
        var text = dataLines.join("\n").trim();
        if (!text || text === "[DONE]") {
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    }

    function extractOpenAiImages(data, requestOptions, options) {
        options = options || {};
        var hooks = options.hooks || options;
        var responseType = imageTypeFromFormat(data && data.output_format);
        if (!options.skipWarnings) {
            collectOpenAiResponseWarnings(data, requestOptions, hooks);
        }
        return imageItemsFromOpenAiResponse(data).map(function(item) {
            var itemType = imageTypeFromFormat(item.output_format) || responseType || "image/png";
            if (item.b64_json) {
                return "data:" + itemType + ";base64," + item.b64_json;
            }
            if (item.image_base64 || item.b64) {
                return "data:" + itemType + ";base64," + (item.image_base64 || item.b64);
            }
            return item.url || "";
        }).filter(Boolean);
    }

    function imageItemsFromOpenAiResponse(data) {
        if (!data) {
            return [];
        }
        if (Array.isArray(data.data)) {
            return data.data;
        }
        if (data.b64_json || data.url || data.image_base64 || data.b64) {
            return [data];
        }
        if (data.result && (data.result.b64_json || data.result.url || data.result.image_base64 || data.result.b64)) {
            return [data.result];
        }
        if (Array.isArray(data.output)) {
            return data.output.filter(function(item) {
                return item && (item.b64_json || item.url || item.image_base64 || item.b64);
            });
        }
        return [];
    }

    function collectOpenAiResponseWarnings(data, requestOptions, hooks) {
        if (!requestOptions || !data) {
            return;
        }
        var responseOptions = responseOptionsFromPayload(data);
        var mismatches = [];
        var missing = [];
        var sawAnyOption = false;
        VERIFIABLE_RESPONSE_FIELDS.forEach(function(key) {
            if (hasValue(responseOptions[key])) {
                sawAnyOption = true;
            }
            if (!hasVerifiableRequestValue(requestOptions[key])) {
                return;
            }
            if (!hasValue(responseOptions[key])) {
                missing.push(FIELD_LABELS[key]);
                return;
            }
            if (normalizeOptionValue(key, requestOptions[key]) !== normalizeOptionValue(key, responseOptions[key])) {
                mismatches.push(FIELD_LABELS[key] + ": " + requestOptions[key] + " -> " + responseOptions[key]);
            }
        });
        if (mismatches.length) {
            emitWarning(hooks, "上游返回参数与请求不一致，可能已降级：" + mismatches.join("，") + "。");
        }
        if (missing.length) {
            emitWarning(hooks, missingOptionsWarning(data, missing));
        }
        if (!sawAnyOption && !missing.length && (imageItemsFromOpenAiResponse(data).length || data.usage)) {
            emitWarning(hooks, "上游未回显可验证生成参数，无法确认 size/quality/background/output_format 是否按请求执行。");
        }
    }

    function hasVerifiableRequestValue(value) {
        return hasValue(value) && String(value).toLowerCase() !== "auto";
    }

    function hasValue(value) {
        return value !== undefined && value !== null && value !== "";
    }

    function normalizeOptionValue(key, value) {
        value = String(value || "").toLowerCase();
        if (key === "output_format" && value === "jpg") {
            return "jpeg";
        }
        return value;
    }

    function missingOptionsWarning(data, missing) {
        if (isStreamingImageEvent(data)) {
            return "上游流式完成事件缺少参数：" + missing.join("，") + "，无法确认是否按请求执行。";
        }
        return "上游未回显可验证参数：" + missing.join("，") + "，无法确认是否按请求执行。";
    }

    function isStreamingImageEvent(data) {
        return /^image_(generation|edit)\.(partial_image|completed)$/i.test(String(data && data.type || ""));
    }

    function responseOptionsFromPayload(data) {
        var first = imageItemsFromOpenAiResponse(data)[0] || {};
        return {
            size: data.size || first.size,
            quality: data.quality || first.quality,
            background: data.background || first.background,
            output_format: data.output_format || first.output_format,
            output_compression: data.output_compression || first.output_compression,
            moderation: data.moderation || first.moderation
        };
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

    function emitStatus(hooks, text, tone) {
        if (hooks && typeof hooks.onStatus === "function") {
            hooks.onStatus(text, tone);
        }
    }

    function emitWarning(hooks, message) {
        if (hooks && typeof hooks.onWarning === "function") {
            hooks.onWarning(message);
        }
    }

    function emitPartialImage(hooks, dataUrl) {
        if (hooks && typeof hooks.onPartialImage === "function") {
            hooks.onPartialImage(dataUrl);
        }
    }

    window.LocalAiImageResponse = {
        handleOpenAiImageResponse: handleOpenAiImageResponse,
        extractOpenAiImages: extractOpenAiImages,
        extractGeminiImages: extractGeminiImages,
        imageTypeFromFormat: imageTypeFromFormat
    };
})(window);
