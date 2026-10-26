const { execSync } = require('child_process');

const sqlCmd = `
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('CompanySettings', 'InvoiceFooterPhrase') IS NULL
    ALTER TABLE CompanySettings ADD InvoiceFooterPhrase NVARCHAR(500) NULL;

IF COL_LENGTH('CompanySettings', 'TicketPaperSize') IS NULL
    ALTER TABLE CompanySettings ADD TicketPaperSize NVARCHAR(20) NULL;

IF COL_LENGTH('CompanySettings', 'ModificationDate') IS NULL
    ALTER TABLE CompanySettings ADD ModificationDate DATETIME2 NULL;

IF COL_LENGTH('Sales', 'CancellationReason') IS NULL
    ALTER TABLE Sales ADD CancellationReason NVARCHAR(500) NULL;

IF COL_LENGTH('Sales', 'CancelledAt') IS NULL
    ALTER TABLE Sales ADD CancelledAt DATETIME2 NULL;

IF COL_LENGTH('CompanySettings', 'TicketInstagram') IS NULL
    ALTER TABLE CompanySettings ADD TicketInstagram NVARCHAR(200) NULL;

IF COL_LENGTH('CompanySettings', 'TicketWhatsapp') IS NULL
    ALTER TABLE CompanySettings ADD TicketWhatsapp NVARCHAR(50) NULL;

IF COL_LENGTH('CompanySettings', 'TicketShowQr') IS NULL
    ALTER TABLE CompanySettings ADD TicketShowQr BIT NULL DEFAULT 1;
`;

console.log('Executing SQL migration script on (localdb)\\MSSQLLocalDB ...');
try {
  const output = execSync(`sqlcmd -S "(localdb)\\MSSQLLocalDB" -d CuadreEnv -Q "${sqlCmd.replace(/\r?\n/g, ' ')}"`, { encoding: 'utf8' });
  console.log('Success:', output);
} catch (e) {
  console.error('Error running sqlcmd:', e.stdout || e.stderr || e.message);
}
