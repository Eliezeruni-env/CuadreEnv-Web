const fs = require('fs');

// 1. Update UnitOfMeasurementController.cs with [AuthorizeModule("sales")] and [AllowAnonymous] fallback
const uomPath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/crud-onion/Controllers/UnitOfMeasurementController.cs';
let uomCode = fs.readFileSync(uomPath, 'utf8');
uomCode = uomCode.replace(
  '[ApiController]',
  '[ApiController]\n    [Onion.Common.Authorization.AuthorizeModule("sales")]'
);
fs.writeFileSync(uomPath, uomCode, 'utf8');
console.log('UnitOfMeasurementController.cs updated with AuthorizeModule.');

// 2. Update ModuleAuthorizationConvention.cs
const convPath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/crud-onion/Authorization/ModuleAuthorizationConvention.cs';
let convCode = fs.readFileSync(convPath, 'utf8');
if (!convCode.includes('UnitOfMeasurementController')) {
  convCode = convCode.replace(
    '["ProductController"] = "sales",',
    '["ProductController"] = "sales", ["UnitOfMeasurementController"] = "sales",'
  );
  fs.writeFileSync(convPath, convCode, 'utf8');
  console.log('ModuleAuthorizationConvention.cs updated.');
}
