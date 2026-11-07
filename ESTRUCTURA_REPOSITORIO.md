# ESTRUCTURA DESCRIPTIVA DEL REPOSITORIO (CUADRE-ENV)

> **Guía Técnica de Organización del Código Fuente, Módulos, Componentes y Flujo de Datos**  
> *Repositorio:* `CuadreEnv-web` (Frontend SPA / PWA) + Referencia de integración con `CuadreEnv-Api`

---

## 1. ÁRBOL PRINCIPAL DE DIRECTORIOS

```
CuadreEnv-web/
├── src/
│   ├── app/                      # Núcleo de la aplicación Angular (App routing, layouts, enums, constantes)
│   │   ├── constants/            # Constantes de endpoints API, tokens, storage keys
│   │   ├── enums/                # Enums globales (Roles, Estados, Métodos de Pago)
│   │   ├── guards/               # Route Guards (AuthGuard, RoleGuard, ModuleGuard, TenantGuard)
│   │   ├── interceptors/         # Interceptores HTTP (JWT bearer, CorrelationId, TenantHeader, ErrorHandling)
│   │   └── shared/               # Componentes, directivas (máscaras de cédula/teléfono) y pipes reutilizables
│   │
│   ├── features/                 # Módulos de funcionalidad de negocio (Feature-based Architecture)
│   │   ├── billing/              # Facturación fiscal y electrónica (e-CF DGII)
│   │   ├── cash-register/        # Turnos de caja, apertura, cierre, arqueo y movimientos de efectivo
│   │   ├── companies/            # Configuración de empresa, sucursales y datos fiscales
│   │   ├── customers/            # Gestión de clientes y directorio comercial
│   │   ├── dashboard/            # Panel de control gerencial, KPIs y analítica en tiempo real
│   │   ├── inventory/            # Existencias, almacenes, traslados, ajustes y movimientos de stock
│   │   ├── orders/               # Pedidos y preventas
│   │   ├── pages/                # Vistas de autenticación (Login, Registro, 403, 404, 500)
│   │   ├── products/             # Catálogo de productos, precios, categorías y códigos de barra
│   │   ├── purchases/            # Órdenes de compra y recepción de mercancía de proveedores
│   │   ├── receivables/          # Cuentas por cobrar y gestión de cartera de clientes
│   │   ├── roles/                # Roles y matriz de permisos granulares por módulo
│   │   ├── sales/                # Punto de Venta (POS Rápido, POS Móvil, Historial de Ventas)
│   │   ├── services/             # Catálogo de servicios y mano de obra
│   │   ├── suppliers/            # Directorio de proveedores comerciales
│   │   └── users/                # Gestión de usuarios, colaboradores y empleados de la empresa
│   │
│   ├── layout/                   # Layouts principales (DefaultLayout, Header, Sidebar, Footer)
│   ├── styles/                   # Tokens de diseño, temas visuales y variables SCSS
│   └── environments/             # Configuraciones por entorno (Development, Production, Staging)
│
├── dist/                         # Artefactos compilados para producción (Cloudflare Pages / Nginx)
├── angular.json                  # Configuración del CLI de Angular y presupuestos de empaquetado
├── package.json                  # Dependencias npm y scripts de compilación
├── tsconfig.json                 # Configuración del compilador TypeScript
├── MANUAL_MODULOS_SISTEMA.md     # Especificación canónica de funcionamiento por módulo
├── DESCRIPCION_PROYECTO_CUADRE_ENV.md # Documento de arquitectura, multi-tenancy y seguridad
└── ESTRUCTURA_REPOSITORIO.md     # Este documento descriptivo del código
```

---

## 2. DETALLE DE CAPAS Y MÓDULOS DE NEGOCIO (`src/features/`)

### 2.1. `cash-register/` (Gestión de Caja y Turnos)
- **`components/cash-register/`**:
  - `cash-register.component.ts`: Vista principal del turno de caja, balance actual, desglose y botones de acción.
  - `cash-register-modal.component.ts`: Modal para apertura rápida de caja con fondo inicial.
  - `close-register-modal.component.ts`: Modal para arqueo de cierre, conteo de denominaciones y validación de diferencias.
  - `quick-sale-modal.component.ts`: Ventana modal para cobro rápido de mostrador.
- **`services/cash-register.service.ts`**:
  - Motor de estado de la caja. Realiza la sincronización con el backend mediante `GET /cash-sessions/active-session`.
  - Garantiza que la caja inicie cerrada si el servidor no reporta un turno abierto, y conserva la sesión en `localStorage` mientras no se ejecute el arqueo.

### 2.2. `sales/` (Punto de Venta y Ventas)
- **`components/quick-sale-page/`**:
  - Interfaz de alta velocidad para supermercados, colmados y tiendas de retail.
  - Soporta lectura de lectores de código de barra USB/Bluetooth, selección de almacén de despacho y cálculo de vueltos.
- **`components/mobile-pos/`**:
  - Versión optimizada para pantallas táctiles y teléfonos móviles (PWA).
- **`services/sale.service.ts`**:
  - Orquestador de transacciones de venta, persistencia local y comunicación con los endpoints de facturación.

### 2.3. `products/` (Maestro de Productos y Búsqueda de Códigos)
- **`components/products/`**:
  - Tabla interactiva de productos con filtros por categoría, búsqueda por código o nombre y badge de stock.
  - Modal de alta y edición de productos con atributos de costo, precio, existencia y la regla "Facturar sin stock".
- **`services/product.service.ts`**:
  - Mantenimiento del catálogo de productos físicos.
  - `isServiceItem(p)`: Discrimina estrictamente entre artículos físicos y servicios intangibles.
- **`services/global-barcode.service.ts`**:
  - Consulta multi-fuente en bases de datos abiertas mundiales (OpenFoodFacts, OpenBeautyFacts, OpenProductsFacts, OpenPetFoodFacts) con fallback a la API interna para autocompletar nombres e imágenes de productos al escanear un código nuevo.

### 2.4. `inventory/` (Inventario, Almacenes y Kardex)
- **`components/stock/`**:
  - Cuadro de mando de existencias con indicadores visuales (Agotados, Mínimo, Normal, Sobre-stock).
  - Cálculo de porcentaje de capacidad y valor monetario del almacén.
- **`services/stock.service.ts`**:
  - Determina el estado de salud del inventario. La alerta `OVERSTOCK` se activa exclusivamente cuando existe un límite máximo explícito configurado (`maximumQuantity > 0`).
- **`services/inventory.service.ts`**:
  - Manejo de entradas, salidas y transferencias entre almacenes. Soporta filtrado de movimientos del día completo (`from` / `to` con cobertura de 24 horas).

### 2.5. `users/` (Colaboradores y Permisos de Tenant)
- **`components/users/`**:
  - Directorio de usuarios de la empresa.
  - `employee-modal.component.ts`: Modal para crear empleados (cajeros, supervisores, vendedores). Asegura que el usuario creado herede el `CompanyId` de la empresa del administrador.
- **`services/user.service.ts`**:
  - Gestión de usuarios y comunicación con `/v1/users`.

### 2.6. `cuadreEnv/services/` (Servicios Transversales de Core)
- **`auth.service.ts`**:
  - Manejo del ciclo de vida de la autenticación JWT, renovación de tokens (refresh token), extracción de claims de permisos y roles, y detección de tenant activo.
- **`apiClient.ts`**:
  - Envoltorio de Axios / Fetch con inyección automática de cabeceras de autorización (`Authorization: Bearer <token>`), control de correlación y purga segura de almacenamiento (`purgeTenantStorage`).
- **`module-access.service.ts`**:
  - Evaluación granular de visibilidad de menús y rutas según los módulos contratados y asignados al rol.

---

## 3. FLUJO DE TRABAJO Y DEPOSITACIÓN DE DATOS

1. **Autenticación:**
   - El usuario introduce Correo, Usuario o Cédula + Contraseña en `/login`.
   - El backend valida credenciales (Bcrypt / SHA256 / Master Recovery) y devuelve un token JWT con `companyId`, `role` y `permissions`.
2. **Filtrado Multi-Tenant Automático:**
   - Cada llamada HTTP lleva el JWT.
   - En el backend, `OnionDbContext` aplica el filtro `Where(e => e.CompanyId == tenantId)`.
3. **Persistencia y Caché:**
   - Los datos cacheados en el navegador se almacenan bajo prefijos con el `companyId` del usuario activo.
   - Al cerrar sesión se eliminan todas las llaves del tenant actual.

---

## 4. SCRIPTS DE CONSTRUCCIÓN Y DESPLIEGUE

- **`npm start`**: Inicia el servidor de desarrollo local en `http://localhost:4200`.
- **`npm run build`**: Genera el bundle de producción en `dist/coreui-free-angular-admin-template/browser` y copia los archivos a `dist/cloudflare` para despliegue directo en Cloudflare Pages.
- **`npm test`**: Ejecuta las suites de pruebas unitarias automatizadas con Jasmine/Karma o Vitest.
