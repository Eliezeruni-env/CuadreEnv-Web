const isBrowser = typeof window !== 'undefined';
const isLocalhost = isBrowser && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');

let useLocalApi = isLocalhost;
if (isLocalhost && isBrowser) {
  if (window.location.search.includes('api=local')) {
    localStorage.setItem('cuadre_api_target', 'local');
    useLocalApi = true;
  } else if (window.location.search.includes('api=remote') || window.location.search.includes('api=heroku')) {
    localStorage.setItem('cuadre_api_target', 'remote');
    useLocalApi = false;
  } else {
    const stored = localStorage.getItem('cuadre_api_target');
    if (stored === 'remote') {
      useLocalApi = false;
    } else if (stored === 'local' || isLocalhost) {
      useLocalApi = true;
    }
  }
}

const resolvedOrigin = (isLocalhost && useLocalApi)
  ? 'http://localhost:8080'
  : 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com';

export const environment = {
  production: true,
  API_BASE_URL: resolvedOrigin,
  apiUrl: `${resolvedOrigin}/v1`,
};
