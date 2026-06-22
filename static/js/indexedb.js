/* IndexedDB helper — 会话图片存储 */
var IDB = {
  _db: null,
  _name: 'sizeflow_store',
  _ver: 1,

  open: function() {
    var self = this;
    return new Promise(function(resolve, reject) {
      if (self._db) return resolve(self._db);
      var req = indexedDB.open(self._name, self._ver);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', {keyPath: 'id'});
        }
      };
      req.onsuccess = function(e) {
        self._db = e.target.result;
        resolve(self._db);
      };
      req.onerror = function() { reject(req.error); };
    });
  },

  put: function(id, b64) {
    var self = this;
    return self.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction('images', 'readwrite');
        var store = tx.objectStore('images');
        var req = store.put({id: id, blob: b64});
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  get: function(id) {
    var self = this;
    return self.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction('images', 'readonly');
        var store = tx.objectStore('images');
        var req = store.get(id);
        req.onsuccess = function() { resolve(req.result ? req.result.blob : null); };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  del: function(id) {
    var self = this;
    return self.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction('images', 'readwrite');
        var store = tx.objectStore('images');
        var req = store.delete(id);
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  delMany: function(ids) {
    var self = this;
    return self.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction('images', 'readwrite');
        var store = tx.objectStore('images');
        var count = ids.length;
        if (count === 0) return resolve();
        ids.forEach(function(id) { store.delete(id); });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
};
