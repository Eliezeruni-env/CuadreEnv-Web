const isBrowser = typeof window !== 'undefined';
const baseOrigin = isBrowser && window.location?.origin ? window.location.origin : 'http://localhost:8080';

export const environment = {
  production: false,
  API_BASE_URL: baseOrigin,
  apiUrl: `${baseOrigin}/v1`,
};
