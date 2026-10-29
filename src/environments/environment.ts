const isBrowser = typeof window !== 'undefined';
const isLocalhost = isBrowser && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');
const resolvedOrigin = isLocalhost ? 'http://localhost:8080' : 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com';

export const environment = {
  production: true,
  API_BASE_URL: resolvedOrigin,
  apiUrl: resolvedOrigin + '/v1',
};
