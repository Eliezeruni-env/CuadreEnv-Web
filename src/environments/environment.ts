const isBrowser = typeof window !== 'undefined';
const isCloudflare = isBrowser && window.location?.hostname?.includes('cuadreenv.epena.dev');
const baseOrigin = isCloudflare ? 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com' : (isBrowser && window.location?.origin ? window.location.origin : 'http://localhost:8080');

export const environment = {
  production: true,
  API_BASE_URL: isCloudflare ? 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com' : baseOrigin,
  apiUrl: isCloudflare ? 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com/v1' : ${baseOrigin}/v1,
};