const isBrowser = typeof window !== 'undefined';
const isCloudflare = isBrowser && !!window.location?.hostname?.includes('cuadreenv.epena.dev');
const resolvedOrigin = isCloudflare ? 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com' : (isBrowser && window.location?.origin ? window.location.origin : 'http://localhost:8080');

export const environment = {
  production: true,
  API_BASE_URL: resolvedOrigin,
  apiUrl: resolvedOrigin + '/v1',
};
