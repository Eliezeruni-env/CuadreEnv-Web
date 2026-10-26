export const API_CONSTANTS = {
  DEFAULT_TIMEOUT_MS: 30000,
  AUTH_TOKEN_KEY: 'auth_token',
  AUTH_REFRESH_TOKEN_KEY: 'auth_refresh_token',
  COMPANY_ID_KEY: 'auth_company_id',
  ENDPOINTS: {
    AUTH: {
      LOGIN: '/v1/Auth/login',
      REGISTER: '/v1/Auth/register',
      REFRESH: '/v1/Auth/refresh-token',
      REVOKE: '/v1/Auth/revoke-token',
      LOGOUT: '/v1/Auth/logout',
    },
    DASHBOARD: {
      METRICS: '/v1/Dashboard/metrics',
    },
    SALES: {
      BASE: '/v1/Sale',
      BY_ID: (id: number) => `/v1/Sale/${id}`,
      PAYMENTS: (id: number) => `/v1/Sale/${id}/payments`,
    },
    RECEIVABLES: {
      BASE: '/v1/AccountReceivable',
      BY_ID: (id: number) => `/v1/AccountReceivable/${id}`,
      PAYMENTS: (id: number) => `/v1/AccountReceivable/${id}/payments`,
      INSTALLMENTS: (id: number) => `/v1/AccountReceivable/${id}/installments`,
      PAY_INSTALLMENT: (id: number, installmentId: number) =>
        `/v1/AccountReceivable/${id}/installments/${installmentId}/pay`,
    },
    CASH_REGISTER: {
      BASE: '/v1/CashRegister',
      OPEN: '/v1/CashRegister/open',
      CLOSE: '/v1/CashRegister/close',
      MOVEMENTS: '/v1/CashRegister/movements',
      SESSIONS: '/v1/CashRegister/sessions',
    },
    PRODUCTS: {
      BASE: '/v1/Product',
      BY_ID: (id: number) => `/v1/Product/${id}`,
      TYPES: '/v1/ProductType',
      CATEGORIES: '/v1/Category',
    },
    INVENTORY: {
      BASE: '/v1/Inventory',
      WAREHOUSES: '/v1/Warehouse',
      MOVEMENTS: '/v1/Inventory/movements',
      TRANSFER: '/v1/Inventory/transfer',
    },
    CUSTOMERS: {
      BASE: '/v1/Customer',
      BY_ID: (id: number) => `/v1/Customer/${id}`,
    },
    PURCHASES: {
      BASE: '/v1/Purchase',
      BY_ID: (id: number) => `/v1/Purchase/${id}`,
    },
    PAYMENTS: {
      BASE: '/v1/Payment',
      BY_ID: (id: number) => `/v1/Payment/${id}`,
    },
    USERS: {
      BASE: '/v1/Users',
      INVITE: '/v1/Users/invite',
    },
    COMPANIES: {
      BASE: '/v1/Company',
      SETTINGS: '/v1/Company/settings',
    },
  },
};
