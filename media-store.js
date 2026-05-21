(function(window) {
    "use strict";

    var DB_NAME = "qnlanyang.localAi.media.v1";
    var DB_VERSION = 1;
    var IMAGE_STORE = "images";
    var dbPromise = null;

    function openDb() {
        if (!("indexedDB" in window)) {
            return Promise.reject(new Error("当前浏览器不支持 IndexedDB，无法持久保存生成图片。"));
        }
        if (dbPromise) {
            return dbPromise;
        }
        dbPromise = new Promise(function(resolve, reject) {
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function() {
                var db = request.result;
                if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                    db.createObjectStore(IMAGE_STORE, { keyPath: "id" });
                }
            };
            request.onsuccess = function() {
                resolve(request.result);
            };
            request.onerror = function() {
                reject(request.error || new Error("IndexedDB 打开失败。"));
            };
        });
        return dbPromise;
    }

    function putImage(record) {
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var transaction = db.transaction(IMAGE_STORE, "readwrite");
                var store = transaction.objectStore(IMAGE_STORE);
                transaction.oncomplete = function() {
                    resolve(record);
                };
                transaction.onerror = function() {
                    reject(transaction.error || new Error("图片保存失败。"));
                };
                transaction.onabort = function() {
                    reject(transaction.error || new Error("图片保存被中止。"));
                };
                store.put(record);
            });
        });
    }

    function getImage(id) {
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var transaction = db.transaction(IMAGE_STORE, "readonly");
                var store = transaction.objectStore(IMAGE_STORE);
                var request = store.get(id);
                request.onsuccess = function() {
                    resolve(request.result || null);
                };
                request.onerror = function() {
                    reject(request.error || new Error("图片读取失败。"));
                };
            });
        });
    }

    function listImages() {
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var records = [];
                var transaction = db.transaction(IMAGE_STORE, "readonly");
                var store = transaction.objectStore(IMAGE_STORE);
                var request = store.openCursor();
                request.onsuccess = function() {
                    var cursor = request.result;
                    if (!cursor) {
                        resolve(records);
                        return;
                    }
                    records.push(imageMetadata(cursor.value));
                    cursor.continue();
                };
                request.onerror = function() {
                    reject(request.error || new Error("图片列表读取失败。"));
                };
            });
        });
    }

    function pruneImages(keepIds, options) {
        options = options || {};
        var keep = {};
        (keepIds || []).forEach(function(id) {
            if (id) {
                keep[id] = true;
            }
        });
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var transaction = db.transaction(IMAGE_STORE, "readwrite");
                var store = transaction.objectStore(IMAGE_STORE);
                var request = store.openCursor();
                request.onsuccess = function() {
                    var cursor = request.result;
                    if (!cursor) {
                        resolve();
                        return;
                    }
                    if (!keep[cursor.key] && shouldPruneRecord(cursor.value, options)) {
                        cursor.delete();
                    }
                    cursor.continue();
                };
                request.onerror = function() {
                    reject(request.error || new Error("图片清理失败。"));
                };
            });
        });
    }

    function shouldPruneRecord(record, options) {
        if (options.scope) {
            return record && record.scope === options.scope;
        }
        if (record && record.scope && record.scope !== "image-job") {
            return false;
        }
        return true;
    }

    function clearImages(options) {
        options = options || {};
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var transaction = db.transaction(IMAGE_STORE, "readwrite");
                var store = transaction.objectStore(IMAGE_STORE);
                var request = store.openCursor();
                request.onsuccess = function() {
                    var cursor = request.result;
                    if (!cursor) {
                        resolve();
                        return;
                    }
                    if (!options.scope || cursor.value && cursor.value.scope === options.scope) {
                        cursor.delete();
                    }
                    cursor.continue();
                };
                request.onerror = function() {
                    reject(request.error || new Error("图片缓存清理失败。"));
                };
            });
        });
    }

    function imageMetadata(record) {
        var blob = record && record.blob;
        return {
            id: record && record.id || "",
            name: record && record.name || "",
            type: record && record.type || blob && blob.type || "",
            scope: record && record.scope || "",
            source: record && record.source || "",
            size: record && record.size || blob && blob.size || 0,
            createdAt: record && record.createdAt || ""
        };
    }

    function deleteDatabase() {
        var oldDbPromise = dbPromise;
        dbPromise = null;
        return Promise.resolve(oldDbPromise).catch(function() {
            return null;
        }).then(function(db) {
            if (db && typeof db.close === "function") {
                db.close();
            }
            return new Promise(function(resolve, reject) {
                if (!("indexedDB" in window)) {
                    resolve();
                    return;
                }
                var request = indexedDB.deleteDatabase(DB_NAME);
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
        });
    }

    window.LocalAiMediaStore = {
        DB_NAME: DB_NAME,
        putImage: putImage,
        getImage: getImage,
        listImages: listImages,
        pruneImages: pruneImages,
        clearImages: clearImages,
        deleteDatabase: deleteDatabase
    };
})(window);
