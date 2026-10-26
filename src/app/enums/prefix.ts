export enum DocumentPrefixEnum {
  FiscalInvoice = 'B01', // Factura de Crédito Fiscal
  ConsumerInvoice = 'B02', // Factura de Consumo Final
  DebitNote = 'B03', // Nota de Débito
  CreditNote = 'B04', // Nota de Crédito
  InformalSupplier = 'B11', // Comprobante de Compras
  MinorExpense = 'B13', // Gastos Menores
  SpecialTaxRegime = 'B14', // Regímenes Especiales
  Governmental = 'B15', // Gubernamental
  ElectronicFiscal = 'E31', // e-NCF Crédito Fiscal
  ElectronicConsumer = 'E32', // e-NCF Consumo
}
