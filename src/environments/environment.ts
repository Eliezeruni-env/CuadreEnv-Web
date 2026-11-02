const isBrowser = typeof window !== 'undefined';
const isLocalhost = isBrowser && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');

let useLocalApi = false;
if (isLocalhost && isBrowser) {
  if (window.location.search.includes('api=local')) {
    localStorage.setItem('cuadre_api_target', 'local');
  } else if (window.location.search.includes('api=remote') || window.location.search.includes('api=heroku')) {
    localStorage.setItem('cuadre_api_target', 'remote');
  }
  useLocalApi = localStorage.getItem('cuadre_api_target') === 'local';
}

const resolvedOrigin = (isLocalhost && useLocalApi)
  ? 'http://localhost:8080'
  : 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com';

export const environment = {
  production: true,
  API_BASE_URL: resolvedOrigin,
  apiUrl: `${resolvedOrigin}/v1`,
};
