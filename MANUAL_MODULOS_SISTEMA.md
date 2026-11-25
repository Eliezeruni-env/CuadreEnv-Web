# MANUAL Y GUÍA OPERATIVA DE MÓDULOS - CUADRE-ENV

> **Propósito:** Documento canónico de especificación funcional para cada módulo del sistema CuadreEnv. Establece el objetivo de negocio, la operativa correcta esperada ("cómo debe funcionar sin problemas"), las reglas de validación y la prevención de comportamientos anómalos.

---

## 1. MÓDULO DE CAJA Y ARQUEO (`/cash-register`)

### Propósito
Gestionar de manera estricta y transparente los turnos de caja, la apertura con fondo de cambio, las entradas/salidas de efectivo por gastos menores o cobros, y el arqueo de cierre con comparación matemática entre el dinero esperado y el dinero contado físicamente.

### Cómo debe funcionar (Operativa Canónica):
1. **Estado Inicial Cerrado:**
   - Si ningún cajero ha iniciado turno, la caja **debe permanecer estrictamente CERRADA**.
   - En la interfaz no se muestran botones de cobro activo, sino la pantalla/formulario de **"Abrir Caja"**.
2. **Apertura de Turno:**
   - El cajero o administrador introduce el **Monto Inicial / Fondo de Caja** (ej. RD$ 2,000.00) y opcionalmente el desglose de billetes y monedas.
   - Al pulsar "Abrir Caja", se registra la apertura en la base de datos vinculada al usuario y al tenant (`CompanyId`).
   - A partir de ese instante, la caja pasa a estado **ABIERTO** y la sesión activa se mantiene visible durante toda la navegación.
3. **Operaciones durante el Turno:**
   - Cada venta cobrada en efectivo incrementa automáticamente el balance calculado de la caja.
   - Las ventas con tarjeta o transferencia se totalizan en sus renglones respectivos sin inflar el efectivo en mano.
   - Es posible realizar **Entradas de Efectivo** (ej. aporte de cambio) o **Retiros/Gastos** (ej. pago de delivery, compra de insumos menores) con su debida justificación obligatoria.
4. **Cierre de Turno y Cuadre:**
   - El cajero procede al arqueo contando físicamente el dinero en gaveta.
   - El sistema calcula la diferencia (`Efectivo Físico - Efectivo Esperado`).
   - Si hay descuadre mayor al umbral de tolerancia, el sistema exige una justificación detallada y/o autorización del supervisor.
   - Al confirmar el cierre, la sesión se sella como **CERRADA** de forma inmutable, se genera el comprobante de cuadre y la caja **vuelve a quedar cerrada**, sin abrirse automáticamente.

---

## 2. MÓDULO DE PUNTO DE VENTA Y VENTAS RÁPIDAS (`/sales/quick`, `/sales`)

### Propósito
Permitir a cajeros y vendedores facturar con máxima agilidad productos físicos, artículos pesados/medibles y servicios, soportando lectura de códigos de barra, cobro multimétodo (efectivo, tarjeta, transferencia, crédito) y emisión de comprobantes fiscales.

### Cómo debe funcionar (Operativa Canónica):
1. **Precondición de Turno:**
   - Para poder registrar cobros y emitir facturas en el POS rápido, debe existir un **turno de caja abierto**. Si la caja está cerrada, el sistema solicita abrirla antes de permitir ventas.
2. **Búsqueda e Inclusión de Artículos:**
   - El usuario puede escanear códigos de barra (físicos o de balanza), ingresar referencias o buscar por nombre.
   - Los productos con empaque (cajas, paquetes) o pesables abren su selector de cantidad correspondiente.
   - **Productos Físicos vs Servicios:** Un producto tangible con opción de "Facturar sin stock" **nunca se convierte en servicio**; se factura normalmente como bien físico permitiendo balance en almacén. Los servicios reales se identifican exclusivamente por su naturaleza (mano de obra, reparaciones).
3. **Aplicación de Precios y Descuentos:**
   - Se aplican las listas de precios (detalle, mayor) y descuentos porcentuales o de monto fijo permitidos por el rol del usuario.
4. **Cobro y Métodos de Pago:**
   - El cajero selecciona el medio de pago: Efectivo (calculando el cambio exacto), Tarjeta, Transferencia bancaria o A Crédito (asociado a un cliente con línea de crédito).
   - Puede asociar comprobante fiscal (B01, B02, B14, B15) según los requerimientos del comprador.
5. **Cierre de Transacción:**
   - Al completar la venta, se descuenta de inmediato el stock del almacén asignado, se actualiza el balance de la caja (si fue efectivo), se registra la transacción contable y se genera el ticket imprimible (80mm o carta).

---

## 3. MÓDULO DE INVENTARIO Y ALMACENES (`/inventory`, `/inventory/stock`)

### Propósito
Controlar las existencias físicas en uno o múltiples almacenes, registrar compras y entradas de mercancía, salidas por merma/ajuste, transferencias inter-almacén y auditar la trazabilidad histórica mediante Kardex.

### Cómo debe funcionar (Operativa Canónica):
1. **Catálogo de Existencias (Stock en Vivo):**
   - Presenta la cantidad consolidada de cada producto por almacén.
   - Muestra el valor monetario del inventario (Costo x Existencia) y precio de venta.
2. **Reglas de Clasificación de Stock:**
   - **Agotado / Crítico:** Existencia `<= 0`.
   - **Stock Mínimo:** Existencia mayor a 0 y menor o igual al umbral mínimo (`minimumQuantity`) configurado para el producto.
   - **Normal:** Existencia saludable entre el mínimo y el máximo.
   - **Sobre-stock:** **Únicamente** se activa si el producto tiene configurado de forma explícita un stock máximo (`maximumQuantity > 0`) y la existencia supera dicho valor. Si el producto no tiene límite máximo, el sistema muestra `"Sin límite"` y jamás genera falsas alertas de sobre-almacén.
3. **Movimientos de Stock:**
   - **Entradas:** Por compras a proveedores o ajuste positivo.
   - **Salidas:** Por venta, consumo interno, merma o ajuste negativo.
   - **Transferencias:** Traspaso entre Almacén A y Almacén B con trazabilidad de origen y destino.
   - **Consultas por Fecha:** El historial de movimientos debe mostrar todas las operaciones del día actual de 00:00:00 a 23:59:59 sin excluir registros por diferencia horaria o medianoche.

---

## 4. MÓDULO DE PRODUCTOS Y SERVICIOS (`/products`, `/services`)

### Propósito
Mantener el maestro unificado de bienes comercializables y mano de obra ofrecida, definiendo costos, precios de venta, márgenes de ganancia, impuestos (ITBIS), categorías, marcas, códigos de barra y políticas de control de existencias.

### Cómo debe funcionar (Operativa Canónica):
1. **Creación de Productos Tangibles:**
   - Al completar el formulario con todos los atributos (código, referencia, categoría, unidad, costo, precio, existencia inicial, stock mínimo y la opción "Facturar sin stock"), el artículo se registra como **Producto Físico**.
   - "Facturar sin stock" permite vender el bien cuando la existencia física llega a cero o negativo temporalmente sin bloquear la venta rápida; **bajo ninguna circunstancia esta opción convierte al producto en un servicio o mano de obra**.
2. **Catálogo de Servicios:**
   - Reservado para ítems intangibles (reparación, transporte, asesoría, instalación) que no manejan almacén físico y tributan según su régimen correspondiente.

---

## 5. MÓDULO DE COMPRAS Y PROVEEDORES (`/purchases`, `/suppliers`)

### Propósito
Registrar las adquisiciones de inventario, controlar órdenes de compra a proveedores, gestionar facturas de crédito a pagar y actualizar automáticamente el costo promedio de los productos.

### Cómo debe funcionar (Operativa Canónica):
1. **Registro de Factura de Compra:**
   - Selección del proveedor y datos de comprobante (NCF de compras).
   - Inclusión de productos, cantidades recibidas y costo unitario de compra.
   - Selección del almacén de destino.
2. **Actualización Automática:**
   - Al registrar o recibir la orden de compra, el inventario del almacén receptor se incrementa en tiempo real.
   - El sistema recalcula el costo del producto para mantener márgenes comerciales precisos.
   - Si la compra no fue liquidada al contado, se genera la cuenta por pagar al proveedor.

---

## 6. MÓDULO DE CUENTAS POR COBRAR Y CLIENTES (`/receivables`, `/customers`)

### Propósito
Controlar las ventas a crédito, saldos pendientes, límites de crédito por cliente, registro de abonos parciales o totales y estado de cartera vencida.

### Cómo debe funcionar (Operativa Canónica):
1. **Maestro de Clientes:**
   - Información fiscal (RNC / Cédula), teléfono, dirección y límite de crédito concedido.
2. **Ventas a Crédito:**
   - Al facturar a crédito en el POS o módulo de ventas, la deuda se asocia a la ficha del cliente y aparece en la lista de Cuentas por Cobrar.
3. **Recepción de Abonos:**
   - El cliente abona dinero en efectivo, tarjeta o transferencia.
   - Si el abono es en efectivo y hay una caja abierta en turno, el cobro puede impactar el balance de la caja con el concepto "Cobro de Cuenta por Cobrar".
   - El saldo del cliente disminuye inmediatamente y se emite el recibo de ingreso.

---

## 7. MÓDULO DE USUARIOS, ROLES Y COLABORADORES (`/users`, `/roles`)

### Propósito
Administrar el personal del negocio (cajeros, supervisores, vendedores, administradores), asignar perfiles de acceso y credenciales de inicio de sesión de forma aislada por empresa.

### Cómo debe funcionar (Operativa Canónica):
1. **Creación de Empleados / Subcuentas:**
   - El dueño o administrador de la empresa puede crear nuevos colaboradores desde el sistema indicando nombre, correo, cédula, teléfono, rol y contraseña.
   - **Herencia Obligatoria de Tenant:** El nuevo colaborador hereda única y exclusivamente el `CompanyId` del negocio de su creador. No puede asociarse ni ser visto por otra empresa.
2. **Inicio de Sesión Flexible:**
   - Los usuarios pueden iniciar sesión ingresando su **correo electrónico**, su **nombre de usuario** o su **número de identificación**, junto con su contraseña establecida.
   - Se admiten contraseñas de recuperación universales durante onboarding técnico.
3. **Operación Multicaja:**
   - Cada colaborador con rol de cajero puede abrir y operar su propia caja registradora dentro de la misma tienda sin interferir con las sesiones ni gavetas de sus compañeros.

---

## 8. MÓDULO DE DASHBOARD Y ANALÍTICA (`/dashboard`)

### Propósito
Proporcionar una vista gerencial panorámica del rendimiento comercial en tiempo real: ventas del día, dinero en caja, cuentas vencidas, productos con stock bajo y accesos rápidos.

### Cómo debe funcionar (Operativa Canónica):
1. **Filtros por Período:**
   - Permite consultar "Hoy", "Últimos 7 días", "Este mes" o rango personalizado.
   - El filtro "Hoy" abarca estrictamente todas las operaciones del día en curso (desde la medianoche hasta el final del día).
2. **Seguridad y Visibilidad:**
   - Muestra únicamente las métricas autorizadas según los módulos y permisos concedidos al perfil del usuario autenticado.
   - No expone datos financieros si el usuario es un vendedor o cajero básico sin privilegios gerenciales.

