const isBrowser = typeof window !== 'undefined';

// Soporte dinámico para desarrollo en local:
// - Por defecto, en local conecta a la API de Heroku para que puedas desarrollar y probar la web sin levantar base de datos local
// - Si estás corriendo 'CuadreEnv-Api' en local (http://localhost:8080), simplemente abre la app con '?api=local'
let useLocalApi = false;
if (isBrowser) {
  if (window.location.search.includes('api=local')) {
    localStorage.setItem('cuadre_api_target', 'local');
  } else if (window.location.search.includes('api=remote') || window.location.search.includes('api=heroku')) {
    localStorage.setItem('cuadre_api_target', 'remote');
  }
  useLocalApi = localStorage.getItem('cuadre_api_target') === 'local';
}

const resolvedOrigin = useLocalApi
  ? 'http://localhost:8080'
  : 'https://cuadreenv-api-86ef5ddf9650.herokuapp.com';

export const environment = {
  production: false,
  API_BASE_URL: resolvedOrigin,
  apiUrl: `${resolvedOrigin}/v1`,
};
