# Documentación de Integración de la API para Frontend

Este documento proporciona una guía completa y una referencia rápida de los endpoints, autenticación, puertos de desarrollo y buenas prácticas para la integración del Frontend con la API del backend.

---

## 1. Información General de Conexión

### 📌 Base URL (Desarrollo)

En el entorno de desarrollo local, la API se expone en los siguientes puertos por defecto (verificar en `Properties/launchSettings.json` si hay variaciones):

- **HTTP:** `http://localhost:5000`
- **HTTPS:** `https://localhost:5001`

### 🔒 Autenticación y Autorización

- **Header requerido:** `Authorization: Bearer <jwt>`
- **Requisito del Token:** El JWT debe incluir obligatoriamente el claim `"CompanyId"`. El backend utiliza este claim para asignar automáticamente el tenant (inquilino) correspondiente sin requerir envío manual del identificador en cada endpoint.
- **Token de Desarrollo (Development Only):**
  Para agilizar las pruebas locales sin requerir el flujo de autenticación completo, se dispone de un endpoint especial (solo activo en entorno `Development`):
  - **Ruta:** `POST /auth/dev/token`
  - **Cuerpo de la petición:**
    ```json
    {
      "companyId": 1,
      "userId": 123,
      "email": "dev@local"
    }
    ```
  - **Respuesta:** `{ "accessToken": "...", "refreshToken": "..." }`

### 📥 Cabeceras de Petición

- `Content-Type: application/json`
- `Accept: application/json`
- `X-Correlation-ID` _(Opcional)_: Cabecera generada por el frontend para mejorar la trazabilidad extremo a extremo de cada petición.

### 🛠️ Diagnóstico de Errores y Soporte

Las respuestas de error de la API (HTTP >= 400) retornan la estructura estándar:

```json
{
  "statusCode": 400,
  "message": "Mensaje de error legible",
  "errorCode": "DUPLICATE_NAME",
  "requestId": "00-4bf92f3577b34da6...",
  "path": "/product",
  "method": "POST",
  "timestamp": "2026-08-26T19:30:00Z"
}
```

- **Importante:** El frontend **debe registrar y adjuntar el `requestId` (TraceIdentifier) y el `timestamp`** en cada reporte de errores o ticket de soporte técnico para facilitar la correlación de logs en el backend.

---

## 2. Convención de Rutas de Endpoints

Los controladores del backend utilizan la directiva `[Route("[controller]")]`. Por lo tanto, la ruta base para cada recurso es el **nombre del controlador en singular y minúscula** (ej. `ProductController` -> `/product`), salvo contadas excepciones que utilizan un prefijo explícito (ej. `/api/credits`).

---

## 3. Listado Completo de Endpoints

### 🔑 Auth

- `POST /auth/register` - Registro de usuario. Body: `{ email, password, ... }`
- `POST /auth/login` - Inicio de sesión. Body: `{ email, password }` -> Devuelve tokens.
- `POST /auth/refresh` - Refrescar tokens vencidos. Body: `{ refreshToken }`
- `POST /auth/revoke` - Invalidar un token de refresco. Body: `{ refreshToken }`
- `POST /auth/revoke-all` - Invalidar todos los tokens del usuario (requiere auth).
- `POST /auth/dev/token` - Generación rápida de JWT de desarrollo (solo en `Development`).

### 📦 Products (Productos)

- `GET /product` - Obtener listado de productos (soporta Query Params: `pageNumber`, `pageSize`).
- `GET /product/{id}` - Obtener el detalle de un producto específico.
- `GET /product/search?description=...` - Buscar productos por coincidencia de texto.
- `GET /product/paged` - Obtener lista paginada y filtrada.
- `POST /product` - Crear producto. Body: `ProductDto` (campos requeridos: `description`, `barcode`, `productTypeId`, `categoryId`, `companyId`, `cost`, `minimumQuantity`, etc.) -> Retorna `201 Created` con el objeto creado.
- `PUT /product` - Actualizar producto. Body: `ProductDto` (debe incluir el `id`).
- `DELETE /product/{id}` - Eliminar un producto por ID.

### 🏷️ Product Types (Tipos de Producto)

- `GET /producttype`
- `GET /producttype/{id}`
- `POST /producttype`
- `PUT /producttype`
- `DELETE /producttype/{id}`

### 📂 Categories (Categorías)

- `GET /category`
- `GET /category/{id}`
- `POST /category`
- `DELETE /category/{id}`

### 🏢 Company & Settings (Compañía y Ajustes)

- `GET /company` (Protegido, solo superadministrador).
- `GET /company/{id}`
- `POST /company` (Crea una compañía; puede retornar tokens si se completa autenticación).
- `PUT /company`
- `DELETE /company/{id}`
- `GET /companysettings` - Obtener configuraciones de la compañía asociada.
- `PUT /companysettings` - Actualizar configuraciones de la compañía.

### 👥 Users (Usuarios)

- `GET /user` - Lista de usuarios de la compañía.
- `GET /user/{id}` - Detalle de usuario.
- `POST /user` - Crear usuario (Admin).
- `PUT /user` - Actualizar datos de usuario (Admin).
- `DELETE /user/{id}` - Eliminar/desvincular usuario (Admin).
- `PUT /user/{id}/role` - Cambiar rol de usuario. Body: `{ role }` (Admin).
- `POST /user/{id}/deactivate` - Desactivar cuenta (Admin).
- `POST /user/{id}/reactivate` - Reactivar cuenta (Admin).

### ✉️ Invitations (Invitaciones)

- `POST /invitations` - Crear y enviar token de invitación. Body: `{ email, validDays }` (Admin).
- `POST /invitations/accept` - Aceptar invitación y crear cuenta. Body: `{ token, password, firstName, ... }` (Anónimo).

### 👥 Customers (Clientes)

- `GET /customer` - Lista de clientes (soporta paginación y búsqueda).
- `GET /customer/active?days=N` - Clientes activos en los últimos N días.
- `GET /customer/{id}`
- `POST /customer`
- `PUT /customer`
- `DELETE /customer/{id}`

### 🚚 Suppliers (Proveedores)

- `GET /supplier`
- `GET /supplier/{id}`
- `POST /supplier`
- `PUT /supplier`
- `DELETE /supplier/{id}`

### 💳 Payments (Pagos)

- `GET /payment`
- `GET /payment/{id}`
- `POST /payment` - Registrar pago.
- `PUT /payment`
- `DELETE /payment/{id}`

### 🛒 Purchases (Compras de Inventario)

- `GET /purchase`
- `GET /purchase/{id}`
- `POST /purchase`
- `PUT /purchase`
- `DELETE /purchase/{id}`

### 💰 Sales (Ventas)

- `GET /sale` - Lista de ventas (opcionalmente paginada).
- `GET /sale/{id}` - Detalle de venta.
- `POST /sale` - Crear venta. Body: `SaleRequestDto` (`customerId`, `details[]`, `total`, `paidAmount`, `cashRegisterId`, `dueDate`).
- `PUT /sale`
- `DELETE /sale/{id}`
- `POST /sale/{id}/payments` - Añadir un pago a una venta. Body: `PaymentDto`.
- `POST /sale/{id}/cancel` - Cancelar venta. Body: `{ reason }` (Admin/Manager).

### 🔄 Returns (Devoluciones)

- `GET /return`
- `GET /return/{id}`
- `POST /return`
- `PUT /return`
- `DELETE /return/{id}`

### 🏦 Cash Register / Movements (Caja Registradora)

- `GET /cashregister`
- `GET /cashregister/{id}`
- `POST /cashregister/open` - Apertura de caja. Body: `CashRegister`
- `POST /cashregister/{id}/close?closingAmount=...` - Cierre de caja.
- `GET /cashmovement`
- `POST /cashmovement` - Movimiento de efectivo manual (ingreso/egreso).

### 🏭 Warehouse / Inventory (Almacén e Inventario)

- `GET /warehouse` - Lista de almacenes.
- `POST /warehouse` - Crear almacén. Body: `CreateWarehouseDto`.
- `POST /warehouse/stock/add` - Añadir stock directamente. Body: `MovementRequestDto`.
- `POST /warehouse/stock/remove` - Retirar stock directamente. Body: `MovementRequestDto`.
- `POST /warehouse/stock/transfer` - Transferencia de stock entre almacenes. Body: `TransferRequestDto`.
- `POST /inventory/inbound` - Entrada de inventario autorizada. Body: `MovementRequestDto`.
- `POST /inventory/outbound` - Salida de inventario autorizada. Body: `MovementRequestDto`.
- `POST /inventory/transfer` - Traslado de inventario. Body: `TransferRequestDto`.
- `GET /inventory/low-stock` - Listado de productos con stock bajo el mínimo.
- `GET /inventory/movements` - Historial de movimientos filtrado.
- `GET /inventory/audit-movements` - Auditoría de movimientos de inventario.

### 📊 Reports (Reportes)

- `GET /reports/sales?from=...&to=...&period=day`
- `GET /reports/top-products?from=...&to=...`
- `GET /reports/inventory-status`
- `GET /reports/active-customers?from=...&to=...`
- `GET /reports/accounts-receivable-summary?from=...&to=...`

### 💳 Credits (Créditos - Prefijo explícito `api`)

- `GET /api/credits`
- `GET /api/credits/{id}`
- `POST /api/credits`
- `PATCH /api/credits/{id}/payments`
- `PATCH /api/credits/{id}/status`

### 📥 Account Receivable (Cuentas por Cobrar)

- `GET /accountreceivable/overdue` - Cuentas vencidas.
- `GET /accountreceivable/due-soon?days=7` - Próximas a vencer en los siguientes N días.
- `POST /accountreceivable/{id}/payments` - Registrar pago parcial o total. Body: `{ amount }`.

### 🎗️ Subscriptions (Suscripciones)

- `GET /subscription/my` - Retorna el estado de la suscripción de la compañía del usuario.

### 🌱 Seed / Utilities (Inicialización)

- `POST /seed/setup` - Inicializa por defecto tipos de productos y categorías base.

### 🌀 Misc

- `GET /weatherforecast` - Endpoint demo de verificación de salud/comunicación.

---

## 4. Prompt para Integradores FE (Copiar y Pegar)

````markdown
### Ficha Técnica de Integración API

- **Base URL (Local Dev):** https://localhost:5001 (o http://localhost:5000 sin SSL)
- **Autenticación:**
  - Login: `POST /auth/login` -> Body: `{ "email": "...", "password": "..." }` -> Retorna `{ accessToken, refreshToken }`
  - Adjuntar cabecera: `Authorization: Bearer <accessToken>` en cada petición.
  - (Dev Mode Quick JWT): `POST /auth/dev/token` -> Body: `{ "companyId": 1, "userId": 999, "email": "dev@local" }`
- **Headers Comunes:**
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `X-Correlation-ID: <uuid>` (Opcional, recomendado)
- **Manejo de Errores:**
  - Mostrar `payload.message` al usuario final.
  - Comportamiento específico en duplicados: `errorCode == 'DUPLICATE_NAME'` o `errorCode == 'DUPLICATE_BARCODE'`.
  - Capturar e incluir siempre `requestId` y `timestamp` en reportes de soporte.

#### Ejemplo de Petición cURL (Crear Producto):

```bash
curl -X POST "https://localhost:5001/product" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: my-unique-correlation-id" \
  -d '{
    "description": "Producto de Prueba",
    "barcode": "9876543210123",
    "productTypeId": 1,
    "categoryId": 1,
    "companyId": 1,
    "cost": 5.5,
    "minimumQuantity": 2
  }'
```
````

```

```
