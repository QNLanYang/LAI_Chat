(function(window) {
    "use strict";

    function renderAssistant(container, reasoning, content, options) {
        options = options || {};
        var rendered = false;
        if (reasoning) {
            container.appendChild(renderReasoningBlock(reasoning, reasoningKey(options, 0)));
            rendered = true;
        }
        var parts = splitReasoningBlocks(content);
        var offset = reasoning ? 1 : 0;
        parts.forEach(function(part) {
            if (part.type === "reasoning") {
                container.appendChild(renderReasoningBlock(part.text, reasoningKey(options, offset)));
                offset += 1;
                rendered = true;
            } else if (part.text) {
                var segment = document.createElement("div");
                segment.className = "markdown-body";
                segment.innerHTML = markdownToHtml(part.text);
                container.appendChild(segment);
                rendered = true;
            }
        });
        if (!rendered) {
            container.textContent = "";
        }
    }

    function reasoningKey(options, index) {
        return [options.messageId || "", "reasoning", index].join(":");
    }

    function splitReasoningBlocks(content) {
        if (!content) {
            return [];
        }
        var normalized = content.replace(/\r\n/g, "\n");
        var parts = [];
        var cursor = 0;
        var openTag = /<think>/ig;
        var openMatch;
        while ((openMatch = openTag.exec(normalized)) !== null) {
            var before = normalized.slice(cursor, openMatch.index).trim();
            if (before) {
                parts.push({ type: "answer", text: before });
            }
            var reasoningStart = openTag.lastIndex;
            var closeMatch = /<\/think>/ig.exec(normalized.slice(reasoningStart));
            if (!closeMatch) {
                var openReasoning = normalized.slice(reasoningStart).trim();
                if (openReasoning) {
                    parts.push({ type: "reasoning", text: openReasoning });
                }
                cursor = normalized.length;
                break;
            }
            var closeIndex = reasoningStart + closeMatch.index;
            var reasoning = normalized.slice(reasoningStart, closeIndex).trim();
            if (reasoning) {
                parts.push({ type: "reasoning", text: reasoning });
            }
            cursor = closeIndex + closeMatch[0].length;
            openTag.lastIndex = cursor;
        }
        if (parts.length) {
            var after = normalized.slice(cursor).trim();
            if (after) {
                parts.push({ type: "answer", text: after });
            }
            return parts;
        }
        var headingMatch = normalized.match(/^(Thinking Process:|思考过程[:：]|推理过程[:：])\s*([\s\S]*?)(?:\n{2,}(?=\S)|$)/i);
        if (headingMatch) {
            var headingReasoning = headingMatch[0].trim();
            var answer = normalized.slice(headingMatch[0].length).trim();
            return [
                { type: "reasoning", text: headingReasoning },
                { type: "answer", text: answer }
            ].filter(function(part) { return part.text; });
        }
        return [{ type: "answer", text: normalized }];
    }

    function renderReasoningBlock(text, key) {
        var details = document.createElement("details");
        details.className = "reasoning-block";
        if (key) {
            details.dataset.reasoningKey = key;
        }
        var summary = document.createElement("summary");
        summary.textContent = "推理过程";
        var body = document.createElement("div");
        body.className = "markdown-body";
        body.innerHTML = markdownToHtml(text);
        details.appendChild(summary);
        details.appendChild(body);
        return details;
    }

    function markdownToHtml(text) {
        if (window.marked && typeof window.marked.parse === "function") {
            var html = window.marked.parse(text, {
                breaks: true,
                gfm: true
            });
            if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
                return window.DOMPurify.sanitize(html);
            }
        }
        return escapeHtml(text).replace(/\n/g, "<br>");
    }

    function reasoningTextFromObject(value) {
        if (!value || typeof value !== "object") {
            return "";
        }
        var type = String(value.type || "").toLowerCase();
        var isReasoningLike = type.indexOf("reason") !== -1 ||
            type.indexOf("think") !== -1 ||
            type.indexOf("summary") !== -1;
        var candidates = [
            value.reasoning,
            value.reasoning_content,
            value.reasoning_text,
            value.thinking,
            value.thinking_text,
            value.summary
        ];
        if (isReasoningLike) {
            candidates.push(value.text);
            candidates.push(value.content);
        }
        if (Array.isArray(value.content)) {
            candidates = candidates.concat(value.content.map(reasoningTextFromObject));
        }
        return candidates.map(function(candidate) {
            if (typeof candidate === "string") {
                return candidate;
            }
            if (Array.isArray(candidate)) {
                return candidate.map(reasoningTextFromObject).join("");
            }
            return reasoningTextFromObject(candidate);
        }).join("").trim();
    }

    function escapeHtml(text) {
        return text.replace(/[&<>"']/g, function(char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            }[char];
        });
    }

    window.LocalAiMarkdown = {
        renderAssistant: renderAssistant,
        markdownToHtml: markdownToHtml,
        reasoningTextFromObject: reasoningTextFromObject
    };
})(window);
