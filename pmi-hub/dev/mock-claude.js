// Local stand-in for the claude.ai runtime (window.claude.use) so the app can be
// run and tested outside claude.ai. Data lives in memory, seeded from
// window.__SEED__, and is kept in localStorage between reloads.
(function () {
  var KEY = 'pmihub-mock-db';
  var store;
  try {
    store = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {
    store = null;
  }
  store = store || JSON.parse(JSON.stringify(window.__SEED__ || {}));
  var subs = new Set();
  var clone = function (x) {
    return JSON.parse(JSON.stringify(x));
  };
  var save = function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {}
  };
  var notify = function () {
    setTimeout(function () {
      subs.forEach(function (fn) {
        fn();
      });
    }, 0);
  };
  function merge(a, b) {
    var out = Object.assign({}, a);
    Object.keys(b).forEach(function (k) {
      var v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = merge(out[k], v);
      else out[k] = v;
    });
    return out;
  }
  var meta = { fromCache: false, hasPendingWrites: false };
  function snap(path) {
    var data = store[path];
    return {
      id: path.split('/').pop(),
      exists: !!data,
      data: function () {
        return data ? clone(data) : undefined;
      },
      metadata: meta,
    };
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(),
      path: path,
      get: async function () {
        return snap(path);
      },
      set: async function (d) {
        store[path] = clone(d);
        save();
        notify();
      },
      update: async function (d) {
        if (!store[path]) throw { code: 'invalid_argument', message: 'document does not exist' };
        store[path] = merge(store[path], clone(d));
        save();
        notify();
      },
      delete: async function () {
        delete store[path];
        save();
        notify();
      },
      onSnapshot: function (next) {
        var fn = function () {
          next(snap(path));
        };
        subs.add(fn);
        setTimeout(fn, 20);
        return function () {
          subs.delete(fn);
        };
      },
      collection: function (sub) {
        return collRef(path + '/' + sub);
      },
    };
  }
  function query(coll, filters) {
    var depth = coll.split('/').length + 1;
    var run = function () {
      var docs = Object.keys(store)
        .filter(function (p) {
          return p.indexOf(coll + '/') === 0 && p.split('/').length === depth;
        })
        .sort()
        .map(snap);
      filters.forEach(function (f) {
        docs = docs.filter(function (d) {
          var x = d.data()[f[0]];
          var v = f[2];
          switch (f[1]) {
            case '==':
              return x === v;
            case '!=':
              return x !== v;
            case 'in':
              return v.indexOf(x) >= 0;
            case 'array-contains':
              return Array.isArray(x) && x.indexOf(v) >= 0;
            default:
              return true;
          }
        });
      });
      return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: meta };
    };
    return {
      where: function (f, op, v) {
        return query(coll, filters.concat([[f, op, v]]));
      },
      orderBy: function () {
        return query(coll, filters);
      },
      limit: function () {
        return query(coll, filters);
      },
      get: async function () {
        return run();
      },
      onSnapshot: function (next) {
        var fn = function () {
          next(run());
        };
        subs.add(fn);
        setTimeout(fn, 30);
        return function () {
          subs.delete(fn);
        };
      },
    };
  }
  function collRef(path) {
    var q = query(path, []);
    return Object.assign({}, q, {
      path: path,
      doc: function (id) {
        return docRef(path + '/' + (id || Math.random().toString(36).slice(2)));
      },
      add: async function (d) {
        var r = docRef(path + '/' + Math.random().toString(36).slice(2));
        await r.set(d);
        return r;
      },
    });
  }
  var db = { doc: docRef, collection: collRef };
  var me = { id: 'u_dev', name: 'Dev User', avatarUrl: '', color: '#6b7cff', email: null, isOwner: true, canEdit: true };
  var user = {
    me: async function () {
      return me;
    },
    id: async function () {
      return me.id;
    },
    can: async function () {
      return true;
    },
    isOwner: async function () {
      return true;
    },
    canEdit: async function () {
      return true;
    },
    profiles: async function (ids) {
      var out = {};
      [].concat(ids).forEach(function (id) {
        out[id] = { id: id, name: id === me.id ? me.name : 'Colleague', avatarUrl: '', color: '#888', email: null, isMe: id === me.id, guest: false };
      });
      return out;
    },
    search: async function () {
      return [];
    },
  };
  var downloads = {
    save: async function (req) {
      window.__lastDownload = { filename: req.filename, size: req.data.size || req.data.byteLength || req.data.length };
      window.__lastDownloadData = req.data;
      return { status: 'saved' };
    },
  };
  // Stand-in for "ask Claude": returns a fixed draft so the flow can be tested offline.
  var sample = async function () {
    return { text: 'mock', truncated: false, modelTierApplied: 'default' };
  };
  sample.json = async function (input) {
    window.__lastPrompt = input;
    await new Promise(function (r) {
      setTimeout(r, 300);
    });
    return { happened: ['(Mock Claude) First point about this week.', '(Mock Claude) Second point about this week.'], next: ['(Mock Claude) A point about next week.'] };
  };
  window.claude = {
    use: async function (name) {
      return { db: db, user: user, downloads: downloads, sample: sample }[name] || null;
    },
  };
})();
