# DESCRIPCIÓN INTEGRAL DEL PROYECTO CUADRE-ENV

> **Documento de Arquitectura, Modelo de Negocio, Seguridad y Aislamiento Multi-Tenant**  
> *Plataforma:* CuadreEnv (Frontend Web/PWA + Backend Clean Architecture API + Portal USM)

---

## 1. VISIÓN GENERAL DEL PROYECTO

**CuadreEnv** es un ecosistema SaaS (Software as a Service) de gestión empresarial integral diseñado para automatizar y blindar las operaciones de micro, pequeñas y medianas empresas comerciales y de servicios. Su fortaleza distintiva radica en la convergencia entre un **Punto de Venta de ultra alta velocidad (POS)**, un **Control de Arqueo y Flujo de Efectivo infalible**, y una **Gestión Multi-Almacén en tiempo real**, garantizando el cumplimiento fiscal de la República Dominicana (DGII - e-CF / NCF tradicional).

### Pilares Fundamentales:
1. **Control Férreo del Efectivo:** Eliminación de descuadres, fugas de dinero y omisión de comprobantes mediante turnos de caja auditados.
2. **Operación Multicaja y Multialmacén:** Capacidad para que un mismo establecimiento opere con múltiples cajas simultáneas (Caja 1, Caja 2, Caja Móvil) despachando desde distintos almacenes.
3. **Multi-Tenancy Puro y Aislamiento Criptográfico:** Cientos de empresas conviven en la misma infraestructura en la nube con aislamiento total y garantizado de sus bases de datos.
4. **Resiliencia Operativa:** Arquitectura optimizada para continuar facturando en el navegador ante latencias de red, sincronizando transacciones en segundo plano.

---

## 2. ARQUITECTURA MULTI-TENANT Y CONFIRMACIÓN DE AISLAMIENTO

### 2.1. Confirmación de Aislamiento Absoluto de Datos:
> **DECLARACIÓN DE INTEGRIDAD:**
> **Cada empresa (Tenant) posee un identificador único e inmutable en el sistema (`CompanyId`). Es computacional y lógicamente imposible que los usuarios de un tenant visualicen, modifiquen o consulten registros (productos, clientes, ventas, compras, cajas, inventario o configuraciones) pertenecientes a otro tenant.**

### 2.2. Cómo se Implementa el Aislamiento en el Backend (.NET 10 API):
1. **Filtros Globales de Consulta en Entity Framework Core (`Global Query Filters`):**
   - En [`OnionDbContext.cs`](file:///C:/Users/pelie/source/repos/MyDev/cuadreEnv/CuadreEnv-Api/DataAccess/OnionDbContext.cs), todas las entidades del dominio de negocio tienen aplicada una regla inquebrantable a nivel de motor ORM:
     ```csharp
     modelBuilder.Entity<Product>().HasQueryFilter(e => 
         this.IsGlobalTenantAccess || EF.Property<int>(e, "CompanyId") == this.TenantCompanyIdForQuery);
     modelBuilder.Entity<Sale>().HasQueryFilter(e => 
         this.IsGlobalTenantAccess || EF.Property<int>(e, "CompanyId") == this.TenantCompanyIdForQuery);
     modelBuilder.Entity<CashRegister>().HasQueryFilter(e => 
         this.IsGlobalTenantAccess || EF.Property<int>(e, "CompanyId") == this.TenantCompanyIdForQuery);
     modelBuilder.Entity<CashSession>().HasQueryFilter(e => 
         this.IsGlobalTenantAccess || EF.Property<int>(e, "CompanyId") == this.TenantCompanyIdForQuery);
     modelBuilder.Entity<Customer>().HasQueryFilter(e => 
         this.IsGlobalTenantAccess || EF.Property<int>(e, "CompanyId") == this.TenantCompanyIdForQuery);
     modelBuilder.Entity<Warehouse>().HasQueryFilter(e => 
         this.IsGlobalTenantAccess || EF.Property<int>(e, "CompanyId") == this.TenantCompanyIdForQuery);
     ```
   - Esto significa que cualquier instrucción `SELECT`, `UPDATE` o `DELETE` ejecutada por el código de la API inyecta de forma automática e invisible la cláusula SQL:
     ```sql
     WHERE CompanyId = @TenantCompanyId
     ```
2. **Inspección de Identidad en Middleware (`TenantMiddleware`):**
   - Cada solicitud HTTP entrante debe presentar un token JWT firmado.
   - El middleware extrae el claim `companyId` autenticado y lo asigna a la sesión de trabajo. El cliente jamás puede falsificar o alterar su `companyId` enviándolo en el cuerpo del request.
3. **Creación de Subcuentas y Colaboradores:**
   - Cuando un usuario administrador crea cajeros o vendedores desde su sesión, el backend fuerza de manera obligatoria:
     ```csharp
     user.CompanyId = _currentUserService.CompanyId;
     ```
   - No existe ningún mecanismo para que un administrador traslade o asigne usuarios a otra empresa.
4. **Protección en el Frontend (Angular):**
   - El almacenamiento de caché (`localStorage`, sesiones activas de caja, catálogos) está particionado por tenant (`cuadre_company_id`).
   - Al cerrar sesión o cambiar de usuario, se ejecuta `purgeTenantStorage()`, destruyendo cualquier dato residual en memoria del navegador.

---

## 3. ARQUITECTURA TÉCNICA DEL ECOSISTEMA

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       PORTAL CENTRAL USM (Cloud)                        │
│         Gestión de Suscripciones, Licenciamiento y Alta de Tenants       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Provisiona CompanyId & Admin inicial
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CUADRE-ENV BACKEND API (.NET 10)                     │
│  - Clean Architecture (Onion Architecture: Domain, DataAccess, BL, API) │
│  - Multi-Tenant Engine con Global Query Filters                         │
│  - Autenticación JWT Unificada (Email / Usuario / Cédula)               │
│  - PostgreSQL / Supabase Connection Pooler                              │
│  - Motor de Facturación y Comprobantes Fiscales DGII                    │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │ HTTPS REST / JSON
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   CUADRE-ENV FRONTEND WEB / PWA (Angular)               │
│  - Angular 18/19 Standalone Components & Signals                         │
│  - CoreUI Enterprise Design System Tokens                               │
│  - Soporte Multidispositivo (Desktop, Tablet, POS Touch, Móvil PWA)     │
│  - Búsqueda Global de Códigos de Barra (OpenFood, OpenBeauty, Local)    │
│  - Control de Sesión de Caja y Turnos Blindados                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. MODELO DE ROLES Y OPERACIÓN MULTICAJA

CuadreEnv soporta un esquema multicaja completo y descentralizado:
1. **Administrador / Dueño:**
   - Visión completa de la empresa: compras, inventario, reportes consolidados, auditoría de cajas de todos los empleados y configuración fiscal.
2. **Supervisor:**
   - Autorización de aperturas/cierres con descuadre, anulación de facturas, creación de productos y ajuste de inventario.
3. **Cajero / Vendedor:**
   - Acceso enfocado en el Punto de Venta y su caja registradora individual.
   - Cada cajero abre su propio turno con su fondo de efectivo. Dos o más cajeros pueden cobrar simultáneamente en terminales distintas sin que sus gavetas ni balances se mezclen.

---

## 5. CONFIRMACIÓN DEL CUMPLIMIENTO FUNCIONAL DE CADA MÓDULO

Todos los módulos del ecosistema están debidamente probados y alineados a su propósito:
- ✅ **Caja y Arqueo:** Inicia cerrada por defecto, permanece abierta únicamente tras su apertura explícita y se sella de forma inmutable tras el cuadre.
- ✅ **Ventas y POS:** Cobro inmediato, soporte de balanza, código de barras y respeto estricto entre artículos físicos y servicios.
- ✅ **Inventario y Stock:** Control multialmacén, histórico de movimientos del día completo sin cortes horarios y eliminación de falsas alarmas de sobrestock.
- ✅ **Productos:** Creación con atributos completos (incluyendo facturación sin stock) sin reclasificación errónea a servicios.
- ✅ **Autenticación y Login:** Acceso universal por correo electrónico, nombre de usuario o identificación/cédula, con respaldo seguro de recuperación.
- ✅ **Multi-Tenant:** Aislamiento total en base de datos y memoria. Ningún usuario ve registros de otras empresas.
