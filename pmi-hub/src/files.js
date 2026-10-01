// Offers a generated file to the viewer. Inside claude.ai the page must go
// through the `downloads` capability (the viewer confirms the save); on a
// regular website (e.g. GitHub Pages) a normal browser download is used.
import { S, toast } from './store.js';
import { t } from './i18n.js';

export async function saveFile(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  if (S.downloads) {
    try {
      await S.downloads.save({ filename, data: blob });
    } catch (e) {
      if (e && e.code !== 'declined') toast('error', t('Could not save the file: {m}', { m: e.message || e.code }));
    }
    return;
  }
  if (window.claude) {
    toast('error', t('Downloads are not available in this view.'));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Loads a library's browser build from the CDN on first use.
const loaded = new Map();
export function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => (window[globalName] ? resolve(window[globalName]) : reject(new Error(globalName)));
        s.onerror = () => {
          loaded.delete(src);
          reject(new Error(src));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return loaded.get(src);
}
