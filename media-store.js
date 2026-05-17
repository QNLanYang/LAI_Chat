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

    function pruneImages(keepIds) {
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
                    if (!keep[cursor.key]) {
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

    window.LocalAiMediaStore = {
        putImage: putImage,
        getImage: getImage,
        pruneImages: pruneImages
    };
})(window);
