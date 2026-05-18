(function(window) {
    "use strict";

    function setSidebarOpen(elements, open) {
        document.body.classList.toggle("is-sidebar-open", Boolean(open));
        elements.sidebarOpenButton.setAttribute("aria-expanded", open ? "true" : "false");
        elements.sidebarScrim.hidden = !open;
    }

    function setFieldVisible(field, visible) {
        field.hidden = !visible;
        field.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function toneClass(baseClass, tone) {
        return baseClass + (tone ? " is-" + tone : "");
    }

    function setToneText(element, baseClass, text, tone) {
        element.textContent = text || "";
        element.className = toneClass(baseClass, tone);
    }

    function clearToneText(element, baseClass) {
        setToneText(element, baseClass, "", "");
    }

    function setStatusPill(element, text, tone) {
        setToneText(element, "status-pill", text, tone);
    }

    function setButtonLoading(button, loading, loadingText, normalText) {
        button.disabled = Boolean(loading);
        button.textContent = loading ? loadingText : normalText;
    }

    function buildHeaders(options) {
        options = options || {};
        var headers = Object.assign({}, options.extra || {});
        if (options.json) {
            headers["Content-Type"] = "application/json";
        }
        var apiKey = options.apiKey || "";
        if (apiKey && options.auth === "bearer") {
            headers.Authorization = "Bearer " + apiKey;
        } else if (apiKey && options.auth === "x-api-key") {
            headers["x-api-key"] = apiKey;
        } else if (apiKey && options.auth === "x-goog-api-key") {
            headers["x-goog-api-key"] = apiKey;
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

    function explainError(error, options) {
        var message = error && error.message ? error.message : String(error);
        if (message === "Failed to fetch") {
            return options && options.localService ?
                "无法访问端点。请确认本地服务已启动，并允许当前页面跨域访问。" :
                "无法访问端点。请确认服务允许当前页面跨域访问。";
        }
        return message;
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

    function imageFilesFromList(fileList) {
        return Array.from(fileList || []).filter(function(file) {
            return file && file.type && file.type.indexOf("image/") === 0;
        });
    }

    function imageFilesFromPaste(event) {
        var items = Array.from((event.clipboardData && event.clipboardData.items) || []);
        return items.filter(function(item) {
            return item.kind === "file" && item.type.indexOf("image/") === 0;
        }).map(function(item) {
            return item.getAsFile();
        }).filter(Boolean);
    }

    async function readImageFiles(fileList) {
        var files = imageFilesFromList(fileList);
        if (!files.length) {
            return [];
        }
        return Promise.all(files.map(readImageFile));
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

    function uniqueValues(values) {
        var seen = {};
        return (values || []).filter(function(value) {
            if (seen[value]) {
                return false;
            }
            seen[value] = true;
            return true;
        });
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

    function modelTypeText(model) {
        if (!model || typeof model === "string") {
            return "";
        }
        return [
            model.type,
            model.modality,
            model.modalities,
            model.capabilities,
            model.task,
            model.pipeline_tag,
            model.supportedGenerationMethods,
            model.supported_generation_methods,
            model.input_modalities,
            model.output_modalities,
            model.tags
        ].map(function(value) {
            return Array.isArray(value) ? value.join(" ") : String(value || "");
        }).join(" ").toLowerCase();
    }

    function looksLikeImageModelName(value) {
        var name = String(value || "").toLowerCase();
        return /(^|[-_.:/])(?:gpt-image|dall-e|imagen|image|images|img|flux|sdxl?|stable-diffusion|midjourney|nano-banana|dreamshaper|realvis|juggernaut|playground|kandinsky|pixart|kolors|hidream)(?:[-_.:/]|$)/.test(name) ||
            /(?:image-generation|text-to-image|txt2img|t2i)/.test(name);
    }

    function looksLikeNonChatModelName(value) {
        var name = String(value || "").toLowerCase();
        return name.indexOf("embedding") !== -1 ||
            name.indexOf("embed") !== -1 ||
            looksLikeImageModelName(name);
    }

    function hasImageGenerationMetadata(model) {
        var typeText = modelTypeText(model);
        return /(?:image[_ -]?generation|generate[_ -]?image|image[_ -]?create|text[_ -]?to[_ -]?image|txt2img|t2i|images\/generations)/.test(typeText) ||
            (
                typeText.indexOf("image") !== -1 &&
                /(?:generation|generate|output|create|render)/.test(typeText) &&
                !/(?:input|vision|ocr|classification|embedding)/.test(typeText)
            );
    }

    function isChatModelItem(model) {
        var name = modelNameFromItem(model);
        if (!name || looksLikeNonChatModelName(name)) {
            return false;
        }
        var typeText = modelTypeText(model);
        return typeText.indexOf("embedding") === -1 &&
            typeText.indexOf("embed") === -1 &&
            typeText.indexOf("image_generation") === -1 &&
            typeText.indexOf("image-generation") === -1 &&
            typeText.indexOf("image generation") === -1 &&
            typeText.indexOf("generate-image") === -1 &&
            typeText.indexOf("generate image") === -1 &&
            typeText.indexOf("text-to-image") === -1 &&
            typeText.indexOf("txt2img") === -1;
    }

    function isImageModelItem(model) {
        var name = modelNameFromItem(model);
        if (!name) {
            return false;
        }
        return looksLikeImageModelName(name) ||
            hasImageGenerationMetadata(model);
    }

    function modelNamesFromItems(items, kind) {
        var filter = kind === "image" ? isImageModelItem : isChatModelItem;
        return uniqueValues((items || []).filter(filter).map(modelNameFromItem).filter(Boolean));
    }

    function createModelPicker(options) {
        var input = options.input;
        var menu = options.menu;
        var button = options.button;
        var modelOptions = [];

        function isDisabled() {
            return Boolean(options.isDisabled && options.isDisabled());
        }

        function getActiveModel() {
            return options.getActiveModel ? options.getActiveModel() : input.value;
        }

        function toggle(open) {
            var shouldOpen = Boolean(open && modelOptions.length && !isDisabled());
            menu.hidden = !shouldOpen;
            button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        }

        function focusOption(index) {
            var optionElements = menu.querySelectorAll(".model-option");
            if (!optionElements.length) {
                return;
            }
            var next = (index + optionElements.length) % optionElements.length;
            optionElements[next].focus();
        }

        function focusFirst() {
            focusOption(0);
        }

        function select(model) {
            input.value = model;
            if (options.onSelect) {
                options.onSelect(model);
            }
            render(modelOptions);
            toggle(false);
            input.focus();
        }

        function render(models) {
            modelOptions = uniqueValues((models || []).filter(Boolean));
            menu.textContent = "";
            modelOptions.forEach(function(model, index) {
                var option = document.createElement("button");
                option.type = "button";
                option.className = "model-option" + (model === getActiveModel() ? " is-selected" : "");
                option.textContent = model;
                option.addEventListener("click", function() {
                    select(model);
                });
                option.addEventListener("keydown", function(event) {
                    if (event.key === "ArrowDown") {
                        event.preventDefault();
                        focusOption(index + 1);
                    } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        focusOption(index - 1);
                    } else if (event.key === "Escape") {
                        event.preventDefault();
                        toggle(false);
                        input.focus();
                    }
                });
                menu.appendChild(option);
            });
            input.placeholder = modelOptions.length ? "选择或输入模型名" : "手动输入模型名";
            button.disabled = isDisabled() || !modelOptions.length;
            if (!modelOptions.length) {
                toggle(false);
            }
            if (options.onRender) {
                options.onRender(modelOptions.slice());
            }
        }

        return {
            render: render,
            toggle: toggle,
            focusFirst: focusFirst,
            options: function() {
                return modelOptions.slice();
            }
        };
    }

    window.LocalAiUi = {
        setSidebarOpen: setSidebarOpen,
        setFieldVisible: setFieldVisible,
        toneClass: toneClass,
        setToneText: setToneText,
        clearToneText: clearToneText,
        setStatusPill: setStatusPill,
        setButtonLoading: setButtonLoading,
        buildHeaders: buildHeaders,
        ensureOk: ensureOk,
        explainError: explainError,
        readImageFile: readImageFile,
        imageFilesFromList: imageFilesFromList,
        imageFilesFromPaste: imageFilesFromPaste,
        readImageFiles: readImageFiles,
        formatTime: formatTime,
        uniqueValues: uniqueValues,
        modelNameFromItem: modelNameFromItem,
        isChatModelItem: isChatModelItem,
        isImageModelItem: isImageModelItem,
        modelNamesFromItems: modelNamesFromItems,
        createModelPicker: createModelPicker
    };
})(window);
