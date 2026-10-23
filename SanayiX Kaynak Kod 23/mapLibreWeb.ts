import type * as MapLibre from 'maplibre-gl';

type MapWindow = Window & { sanayixMapLibre?: typeof MapLibre };
let library: Promise<typeof MapLibre> | null = null;
let attempt = 0;

// The official ESM build keeps its module worker/import.meta context outside Metro.
export function loadMapLibreWeb(): Promise<typeof MapLibre> {
  const cached = (window as MapWindow).sanayixMapLibre;
  if (cached) return Promise.resolve(cached);
  if (library) return library;
  const pending = new Promise<typeof MapLibre>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = `/maplibre/maplibre-loader.mjs?attempt=${attempt++}`;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('sanayix-maplibre-ready', done);
      script.onerror = null;
      script.remove();
    };
    const done = (event: Event) => {
      cleanup();
      resolve((event as CustomEvent<typeof MapLibre>).detail);
    };
    const fail = () => { cleanup(); reject(new Error('Harita kütüphanesi yüklenemedi.')); };
    const timer = setTimeout(fail, 20000);
    window.addEventListener('sanayix-maplibre-ready', done, { once: true });
    script.onerror = fail;
    document.head.appendChild(script);
  });
  library = pending.catch(error => { library = null; throw error; });
  return library;
}
