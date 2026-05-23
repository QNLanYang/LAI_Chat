(function(window) {
    "use strict";

    var KEYS = {
        chats: "qnlanyang.localAi.chats.v1",
        settings: "qnlanyang.localAi.settings.v1",
        apiKey: "qnlanyang.localAi.apiKey.local",
        presets: "qnlanyang.localAi.providerPresets.v1",
        activeChatPreset: "qnlanyang.localAi.activeChatPreset.v1",
        activeImagePreset: "qnlanyang.localAi.activeImagePreset.v1",
        imageJobs: "qnlanyang.localAi.imageJobs.v1",
        modelCapabilities: "qnlanyang.localAi.modelCapabilities.v1",
        theme: "qnlanyang.localAi.theme.v1"
    };

    var MEDIA_DB = {
        name: "qnlanyang.localAi.media.v1",
        version: 1,
        imageStore: "images"
    };

    function localStorageKey(name) {
        return KEYS[name] || "";
    }

    function parseJsonArray(storage, key) {
        try {
            var parsed = JSON.parse(storage.getItem(key) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function storageSnapshot(storage) {
        var snapshot = {};
        forEachStorageKey(storage, function(key) {
            snapshot[key] = storage.getItem(key);
        });
        return snapshot;
    }

    function storageBytes(storage) {
        var total = 0;
        forEachStorageKey(storage, function(key) {
            total += byteLength(key) + byteLength(storage.getItem(key) || "");
        });
        return total;
    }

    function removeMigrationKeys(storage) {
        var keys = [];
        forEachStorageKey(storage, function(key) {
            if (/^qnlanyang\.localAi\./.test(key) && /migrat/i.test(key)) {
                keys.push(key);
            }
        });
        keys.forEach(function(key) {
            storage.removeItem(key);
        });
        return keys.length;
    }

    function collectLocalStats(options) {
        options = options || {};
        var storage = options.localStorage || window.localStorage;
        var chats = parseJsonArray(storage, KEYS.chats);
        var imageJobs = parseJsonArray(storage, KEYS.imageJobs);
        var presets = parseJsonArray(storage, KEYS.presets);
        var messageCount = 0;
        var chatImageCount = 0;
        chats.forEach(function(chat) {
            (chat.messages || []).forEach(function(message) {
                messageCount += 1;
                chatImageCount += Array.isArray(message.images) ? message.images.length : 0;
            });
        });
        return {
            chats: chats.length,
            messages: messageCount,
            chatImages: chatImageCount,
            presets: presets.length,
            imageJobs: imageJobs.length,
            localStorageBytes: storageBytes(storage)
        };
    }

    function clearImageJobs(storage) {
        (storage || window.localStorage).removeItem(KEYS.imageJobs);
    }

    async function clearBrowserCaches() {
        if (!("caches" in window)) {
            return;
        }
        var keys = await caches.keys();
        await Promise.all(keys.map(function(key) {
            return caches.delete(key);
        }));
    }

    async function deleteMediaDatabase(mediaStore) {
        if (mediaStore && typeof mediaStore.deleteDatabase === "function") {
            await mediaStore.deleteDatabase();
            return;
        }
        if (!("indexedDB" in window)) {
            return;
        }
        await new Promise(function(resolve, reject) {
            var request = indexedDB.deleteDatabase(MEDIA_DB.name);
            request.onsuccess = function() {
                resolve();
            };
            request.onerror = function() {
                reject(request.error || new Error("IndexedDB 删除失败。"));
            };
            request.onblocked = function() {
                reject(new Error("IndexedDB 正被其他页面占用，请关闭本应用的其他标签页后重试。"));
            };
        });
    }

    async function resetAllLocalData(options) {
        options = options || {};
        (options.localStorage || window.localStorage).clear();
        (options.sessionStorage || window.sessionStorage).clear();
        await deleteMediaDatabase(options.mediaStore || window.LocalAiMediaStore);
        await clearBrowserCaches();
    }

    async function browserStorageEstimate() {
        return navigator.storage && navigator.storage.estimate ?
            navigator.storage.estimate() :
            null;
    }

    async function cacheKeys() {
        if (!("caches" in window)) {
            return [];
        }
        return caches.keys();
    }

    function forEachStorageKey(storage, callback) {
        for (var index = 0; index < storage.length; index += 1) {
            callback(storage.key(index));
        }
    }

    function byteLength(value) {
        return new Blob([String(value || "")]).size;
    }

    window.LocalAiStorage = {
        KEYS: KEYS,
        MEDIA_DB: MEDIA_DB,
        localStorageKey: localStorageKey,
        parseJsonArray: parseJsonArray,
        storageSnapshot: storageSnapshot,
        storageBytes: storageBytes,
        removeMigrationKeys: removeMigrationKeys,
        collectLocalStats: collectLocalStats,
        clearImageJobs: clearImageJobs,
        clearBrowserCaches: clearBrowserCaches,
        deleteMediaDatabase: deleteMediaDatabase,
        resetAllLocalData: resetAllLocalData,
        browserStorageEstimate: browserStorageEstimate,
        cacheKeys: cacheKeys,
        byteLength: byteLength
    };
})(window);
