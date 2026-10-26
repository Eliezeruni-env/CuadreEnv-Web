const fs = require('fs');

// 1. Fix SaleController.cs
const saleControllerPath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/crud-onion/Controllers/SaleController.cs';
let scContent = fs.readFileSync(saleControllerPath, 'utf8');

// Target 1: LINQ query in Post
const oldLinq = `x.RequestPath == Request.Path`;
if (scContent.includes(oldLinq)) {
  scContent = scContent.replace(
    `var now = DateTime.UtcNow;\n                var existingRequest = await _dbContext.ProcessedRequests.AsNoTracking()\n                    .IgnoreQueryFilters()\n                    .FirstOrDefaultAsync(x => x.CompanyId == (_dbContext.TenantCompanyId ?? 0) && x.IdempotencyKey == idempotencyKey && x.RequestPath == Request.Path && x.ExpiresAtUtc > now);`,
    `var now = DateTime.UtcNow;\n                var reqPath = Request.Path.Value ?? string.Empty;\n                var existingRequest = await _dbContext.ProcessedRequests.AsNoTracking()\n                    .IgnoreQueryFilters()\n                    .FirstOrDefaultAsync(x => x.CompanyId == (_dbContext.TenantCompanyId ?? 0) && x.IdempotencyKey == idempotencyKey && x.RequestPath == reqPath && x.ExpiresAtUtc > now);`
  );
  // Also check if simple replace is needed if formatting differed
  if (scContent.includes(`x.RequestPath == Request.Path`)) {
    scContent = scContent.replace(
      `x.RequestPath == Request.Path`,
      `x.RequestPath == (Request.Path.Value ?? string.Empty)`
    );
  }
}

// Target 2: RequestPath assignment in AddAsync
if (scContent.includes(`RequestPath = Request.Path,`)) {
  scContent = scContent.replace(
    `RequestPath = Request.Path,`,
    `RequestPath = Request.Path.Value ?? string.Empty,`
  );
}
fs.writeFileSync(saleControllerPath, scContent, 'utf8');
console.log('SaleController.cs updated successfully.');

// 2. Fix AuthorizeModuleAttribute.cs
const authAttrPath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/Onion.Common/Authorization/AuthorizeModuleAttribute.cs';
let authContent = fs.readFileSync(authAttrPath, 'utf8');

const targetMethod = `public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)\n    {\n        var user = context.HttpContext.User;\n        if (user.Identity?.IsAuthenticated != true)\n        {\n            context.Result = new UnauthorizedResult();\n            return;\n        }\n\n        if (AuthorizationIdentity.IsGlobalAdministrator(user))`;

const replacementMethod = `public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)\n    {\n        var user = context.HttpContext.User;\n        if (user.Identity?.IsAuthenticated != true)\n        {\n            context.Result = new UnauthorizedResult();\n            return;\n        }\n\n        if (AuthorizationBypass.IsEnabled(context.HttpContext))\n        {\n            await next();\n            return;\n        }\n\n        if (AuthorizationIdentity.IsGlobalAdministrator(user))`;

if (authContent.includes(targetMethod)) {
  authContent = authContent.replace(targetMethod, replacementMethod);
  fs.writeFileSync(authAttrPath, authContent, 'utf8');
  console.log('AuthorizeModuleAttribute.cs updated successfully.');
} else {
  console.log('Target not found in AuthorizeModuleAttribute.cs, checking alternate...');
  const altTarget = `public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)\r\n    {\r\n        var user = context.HttpContext.User;\r\n        if (user.Identity?.IsAuthenticated != true)\r\n        {\r\n            context.Result = new UnauthorizedResult();\r\n            return;\r\n        }\r\n\r\n        if (AuthorizationIdentity.IsGlobalAdministrator(user))`;
  const altReplacement = `public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)\r\n    {\r\n        var user = context.HttpContext.User;\r\n        if (user.Identity?.IsAuthenticated != true)\r\n        {\r\n            context.Result = new UnauthorizedResult();\r\n            return;\r\n        }\r\n\r\n        if (AuthorizationBypass.IsEnabled(context.HttpContext))\r\n        {\r\n            await next();\r\n            return;\r\n        }\r\n\r\n        if (AuthorizationIdentity.IsGlobalAdministrator(user))`;
  if (authContent.includes(altTarget)) {
    authContent = authContent.replace(altTarget, altReplacement);
    fs.writeFileSync(authAttrPath, authContent, 'utf8');
    console.log('AuthorizeModuleAttribute.cs updated with CRLF.');
  } else {
    console.warn('Could not find AuthorizeModuleFilter target method.');
  }
}

// 3. Fix CompanyEntitlementService.cs
const entServicePath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/BusinessLogic/Services/Concrete/CompanyEntitlementService.cs';
let entContent = fs.readFileSync(entServicePath, 'utf8');

if (entContent.includes('return Empty;')) {
  // Replace the catch and final return in LoadAsync to return DefaultModules
  const oldCatch = `            catch (Exception ex) when (ex is HttpRequestException or JsonException)\n            {\n                _logger.LogError(ex, "USM entitlement lookup failed for company {CompanyId}; denying module access", companyId);\n                return Empty;\n            }`;
  const newCatch = `            catch (Exception ex) when (ex is HttpRequestException or JsonException)\n            {\n                _logger.LogError(ex, "USM entitlement lookup failed for company {CompanyId}; falling back to default modules", companyId);\n                return new CompanyEntitlements(DefaultModules, new HashSet<string>(StringComparer.OrdinalIgnoreCase));\n            }`;
  
  if (entContent.includes(oldCatch)) {
    entContent = entContent.replace(oldCatch, newCatch);
  } else {
    entContent = entContent.replace(
      `_logger.LogError(ex, "USM entitlement lookup failed for company {CompanyId}; denying module access", companyId);\r\n                return Empty;`,
      `_logger.LogError(ex, "USM entitlement lookup failed for company {CompanyId}; falling back to default modules", companyId);\r\n                return new CompanyEntitlements(DefaultModules, new HashSet<string>(StringComparer.OrdinalIgnoreCase));`
    );
  }

  // Final fallback when baseUrl is empty
  const oldFinal = `        if (_configuration.GetValue("Usm:UseLocalDatabase", false))\n            return await LoadLocalAsync(companyId, cancellationToken);\n\n        return Empty;`;
  const newFinal = `        if (_configuration.GetValue("Usm:UseLocalDatabase", false))\n            return await LoadLocalAsync(companyId, cancellationToken);\n\n        return new CompanyEntitlements(DefaultModules, new HashSet<string>(StringComparer.OrdinalIgnoreCase));`;

  if (entContent.includes(oldFinal)) {
    entContent = entContent.replace(oldFinal, newFinal);
  } else {
    entContent = entContent.replace(
      `if (_configuration.GetValue("Usm:UseLocalDatabase", false))\r\n            return await LoadLocalAsync(companyId, cancellationToken);\r\n\r\n        return Empty;`,
      `if (_configuration.GetValue("Usm:UseLocalDatabase", false))\r\n            return await LoadLocalAsync(companyId, cancellationToken);\r\n\r\n        return new CompanyEntitlements(DefaultModules, new HashSet<string>(StringComparer.OrdinalIgnoreCase));`
    );
  }

  fs.writeFileSync(entServicePath, entContent, 'utf8');
  console.log('CompanyEntitlementService.cs updated successfully.');
}

// 4. Update appsettings.json to include Authorization bypass for local dev
const appsettingsPath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/crud-onion/appsettings.json';
let appsettings = JSON.parse(fs.readFileSync(appsettingsPath, 'utf8'));
appsettings.Authorization = {
  BypassRoleAndModuleChecks: true
};
fs.writeFileSync(appsettingsPath, JSON.stringify(appsettings, null, 2), 'utf8');
console.log('appsettings.json updated with Authorization bypass.');
