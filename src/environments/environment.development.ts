const isBrowser = typeof window !== 'undefined';
const isLocalhost = isBrowser && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');

// Soporte dinámico para desarrollo en local:
// - Por defecto en localhost, conecta a la API local http://localhost:8080 sincronizada con USM (puerto 3000) y Supabase
// - Si se desea conectar a Heroku, simplemente abrir la app con '?api=remote' o '?api=heroku'
let useLocalApi = false;
if (isBrowser) {
  if (window.location.search.includes('api=local')) {
    localStorage.setItem('cuadre_api_target', 'local');
    useLocalApi = true;
  } else if (window.location.search.includes('api=remote') || window.location.search.includes('api=heroku')) {
    localStorage.setItem('cuadre_api_target', 'remote');
    useLocalApi = false;
  } else {
    const stored = localStorage.getItem('cuadre_api_target');
    useLocalApi = stored === 'local';
  }
}

const resolvedOrigin = useLocalApi
  ? 'http://localhost:8080'
  : 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com';

export const environment = {
  production: false,
  API_BASE_URL: resolvedOrigin,
  apiUrl: `${resolvedOrigin}/v1`,
};
