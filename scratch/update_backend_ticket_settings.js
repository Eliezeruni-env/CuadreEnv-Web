const fs = require('fs');

// 1. Update Domain/PosEntities.cs
const posEntitiesPath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/Domain/PosEntities.cs';
let posEntities = fs.readFileSync(posEntitiesPath, 'utf8');
if (!posEntities.includes('TicketInstagram')) {
  posEntities = posEntities.replace(
    /public string\? TicketPaperSize \{ get; set; \} = "80mm";/,
    'public string? TicketPaperSize { get; set; } = "80mm";\r\n        public string? TicketInstagram { get; set; };\r\n        public string? TicketWhatsapp { get; set; };\r\n        public bool TicketShowQr { get; set; } = true;'
  );
  // remove possible extra semicolons
  posEntities = posEntities.replace('public string? TicketInstagram { get; set; };', 'public string? TicketInstagram { get; set; }');
  posEntities = posEntities.replace('public string? TicketWhatsapp { get; set; };', 'public string? TicketWhatsapp { get; set; }');
  fs.writeFileSync(posEntitiesPath, posEntities, 'utf8');
  console.log('Updated PosEntities.cs');
} else {
  console.log('PosEntities.cs already updated');
}

// 2. Update CompanySettingsEditableDto.cs
const dtoPath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/BusinessLogic/Dtos/CompanySettingsEditableDto.cs';
let dto = fs.readFileSync(dtoPath, 'utf8');
if (!dto.includes('TicketInstagram')) {
  dto = dto.replace(
    'public bool AllowNegativeStock { get; set; }',
    'public bool AllowNegativeStock { get; set; }\r\n        public string? TicketInstagram { get; set; }\r\n        public string? TicketWhatsapp { get; set; }\r\n        public bool TicketShowQr { get; set; } = true;'
  );
  fs.writeFileSync(dtoPath, dto, 'utf8');
  console.log('Updated CompanySettingsEditableDto.cs');
} else {
  console.log('CompanySettingsEditableDto.cs already updated');
}

// 3. Update CompanySettingsService.cs
const svcPath = 'C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/BusinessLogic/Services/Concrete/CompanySettingsService.cs';
let svc = fs.readFileSync(svcPath, 'utf8');
if (!svc.includes('TicketInstagram')) {
  svc = svc.replace(
    'AllowNegativeStock = settings?.AllowNegativeStock ?? false',
    'AllowNegativeStock = settings?.AllowNegativeStock ?? false,\r\n                TicketInstagram = settings?.TicketInstagram ?? string.Empty,\r\n                TicketWhatsapp = settings?.TicketWhatsapp ?? string.Empty,\r\n                TicketShowQr = settings?.TicketShowQr ?? true'
  );
  svc = svc.replace(
    's.AllowNegativeStock = dto.AllowNegativeStock;',
    's.AllowNegativeStock = dto.AllowNegativeStock;\r\n            s.TicketInstagram = dto.TicketInstagram;\r\n            s.TicketWhatsapp = dto.TicketWhatsapp;\r\n            s.TicketShowQr = dto.TicketShowQr;'
  );
  fs.writeFileSync(svcPath, svc, 'utf8');
  console.log('Updated CompanySettingsService.cs');
} else {
  console.log('CompanySettingsService.cs already updated');
}
