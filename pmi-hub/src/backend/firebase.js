// Firebase backend for the GitHub Pages build: Microsoft 365 sign-in through
// Firebase Authentication and data in Cloud Firestore.
//
// It exposes the same small API the app uses on claude.ai (collection / doc /
// where / onSnapshot / get / set / update / delete), so src/store.js works
// unchanged on either host. Two Firestore differences are handled here:
//   * update() must merge nested objects field by field (the app appends
//     history events as { events: { <id>: event } }); Firestore's updateDoc
//     would replace the whole map, so nested objects become field paths.
//   * error codes are mapped to the ones the app already understands.
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut as fbSignOut,
  connectAuthEmulator,
  signInWithCredential,
} from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  connectFirestoreEmulator,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  FieldPath,
  serverTimestamp,
} from 'firebase/firestore';

const ERR = {
  'not-found': 'invalid_argument',
  'invalid-argument': 'invalid_argument',
  'failed-precondition': 'invalid_argument',
  'permission-denied': 'permission_denied',
  unauthenticated: 'permission_denied',
  'resource-exhausted': 'resource_exhausted',
  unavailable: 'unavailable',
  'deadline-exceeded': 'unavailable',
};
const mapErr = (e) => ({ code: ERR[e && e.code] || 'unavailable', message: (e && e.message) || String(e) });
const rethrow = (e) => {
  throw mapErr(e);
};

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

// { events: { e1: {...} }, title: 'x' } -> [FieldPath('events','e1'), {...}, FieldPath('title'), 'x']
function toFieldPaths(data, prefix = [], out = []) {
  for (const [k, v] of Object.entries(data)) {
    const path = [...prefix, k];
    if (isPlain(v) && Object.keys(v).length) toFieldPaths(v, path, out);
    else out.push(new FieldPath(...path), v === undefined ? null : v);
  }
  return out;
}

const wrapDoc = (s) => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
const wrapQuery = (s) => ({ docs: s.docs.map(wrapDoc), size: s.size, empty: s.empty, docChanges: () => s.docChanges(), metadata: s.metadata });

export function createFirebaseBackend(cfg) {
  const app = initializeApp(cfg.firebase);
  const auth = getAuth(app);
  const fs = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  if (cfg.emulator) {
    connectAuthEmulator(auth, `http://${cfg.emulator.auth}`, { disableWarnings: true });
    const [host, port] = cfg.emulator.firestore.split(':');
    connectFirestoreEmulator(fs, host, Number(port));
  }

  // ---------- database ----------
  function docRef(path) {
    const ref = doc(fs, path);
    return {
      id: ref.id,
      path,
      get: () => getDoc(ref).then(wrapDoc, rethrow),
      set: (data) => setDoc(ref, data).catch(rethrow),
      update: (data) => {
        const args = toFieldPaths(data);
        return args.length ? updateDoc(ref, ...args).catch(rethrow) : Promise.resolve();
      },
      delete: () => deleteDoc(ref).catch(rethrow),
      onSnapshot: (next, error) => onSnapshot(ref, (s) => next(wrapDoc(s)), (e) => error && error(mapErr(e))),
      collection: (sub) => collRef(`${path}/${sub}`),
    };
  }
  function queryRef(path, parts) {
    const build = () => (parts.length ? query(collection(fs, path), ...parts) : collection(fs, path));
    return {
      where: (f, op, v) => queryRef(path, [...parts, where(f, op, v)]),
      orderBy: (f, dir) => queryRef(path, [...parts, orderBy(f, dir)]),
      limit: (n) => queryRef(path, [...parts, limit(n)]),
      get: () => getDocs(build()).then(wrapQuery, rethrow),
      onSnapshot: (next, error) => onSnapshot(build(), (s) => next(wrapQuery(s)), (e) => error && error(mapErr(e))),
    };
  }
  function collRef(path) {
    return {
      ...queryRef(path, []),
      path,
      doc: (id) => docRef(id ? `${path}/${id}` : doc(collection(fs, path)).path),
      add: async (data) => {
        const ref = docRef(doc(collection(fs, path)).path);
        await ref.set(data);
        return ref;
      },
    };
  }
  const db = {
    doc: docRef,
    collection: collRef,
    // Fast path for imports: up to 400 writes per batch.
    async setMany(entries, onProgress) {
      for (let i = 0; i < entries.length; i += 400) {
        const batch = writeBatch(fs);
        for (const { path, data } of entries.slice(i, i + 400)) batch.set(doc(fs, path), data);
        await batch.commit().catch(rethrow);
        onProgress && onProgress(Math.min(entries.length, i + 400), entries.length);
      }
    },
  };

  // ---------- people directory for "who made this change" ----------
  const names = new Map();
  let legacy = null; // names of claude.ai users from an imported backup
  const user = {
    me: async () => {
      const u = auth.currentUser;
      return { id: u ? u.uid : null, name: (u && u.displayName) || '', email: (u && u.email) || null, avatarUrl: '', color: '', isOwner: false, canEdit: !!u };
    },
    id: async () => (auth.currentUser ? auth.currentUser.uid : null),
    can: async () => (auth.currentUser ? true : null),
    async profiles(ids) {
      const list = [].concat(ids).filter(Boolean);
      const missing = list.filter((id) => !names.has(id));
      if (missing.length && !legacy) {
        legacy = await getDoc(doc(fs, 'meta/legacyUsers'))
          .then((s) => (s.exists() ? s.data().names || {} : {}))
          .catch(() => ({}));
      }
      await Promise.all(
        missing.map((id) =>
          getDoc(doc(fs, `users/${id}`))
            .then((s) => names.set(id, s.exists() ? s.data().name || '' : legacy[id] || ''))
            .catch(() => names.set(id, legacy[id] || '')),
        ),
      );
      return Object.fromEntries(list.map((id) => [id, { id, name: names.get(id) || '', avatarUrl: '', color: '', email: null, isMe: auth.currentUser && id === auth.currentUser.uid, guest: false }]));
    },
  };

  // ---------- sign-in ----------
  const provider = new OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account', ...(cfg.microsoftTenantId ? { tenant: cfg.microsoftTenantId } : {}) });

  async function signIn() {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (e && ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
        return signInWithRedirect(auth, provider);
      }
      throw e;
    }
  }

  // Records the signed-in person's name so others see it in the change history.
  async function recordUser(u) {
    await setDoc(doc(fs, `users/${u.uid}`), { name: u.displayName || '', email: u.email || '', lastSignInAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }

  return {
    kind: 'firebase',
    db,
    user,
    downloads: null,
    sample: null,
    auth: {
      onChange: (fn) => onAuthStateChanged(auth, fn),
      redirectResult: () => getRedirectResult(auth).catch((e) => Promise.reject(e)),
      signIn,
      signOut: () => fbSignOut(auth),
      recordUser,
      current: () => auth.currentUser,
      // Emulator only: sign in as a test Microsoft account without a popup.
      testSignIn: cfg.emulator ? (email, name) => signInWithCredential(auth, provider.credential({ idToken: JSON.stringify({ sub: email, email, name, email_verified: true }) })) : null,
    },
  };
}
