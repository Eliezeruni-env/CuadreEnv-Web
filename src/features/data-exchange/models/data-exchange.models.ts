export interface RowFieldChangeDto {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface RowErrorDto {
  rowNumber: number;
  field: string;
  reason: string;
}

export interface PreviewRowItemDto {
  rowNumber: number;
  key: string;
  action: 'INSERT' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
  description: string;
  changes: RowFieldChangeDto[];
  errors: string[];
}

export interface ImportPreviewResponseDto {
  batchId: string;
  entityType: string;
  mode: 'create_and_update' | 'create_only';
  fileName: string;
  totalRows: number;
  rowsToInsert: number;
  rowsToUpdate: number;
  rowsUnchanged: number;
  rowsWithErrors: number;
  canConfirm: boolean;
  expiresAt: string;
  sampleRows: PreviewRowItemDto[];
  errors: RowErrorDto[];
}

export interface ImportConfirmResponseDto {
  batchId: string;
  success: boolean;
  message: string;
  insertedCount: number;
  updatedCount: number;
  alreadyApplied: boolean;
  appliedAt: string | null;
}

export interface DataExchangeLogDto {
  id: number;
  action: string;
  entityType: string;
  format: string;
  batchId: string | null;
  processedCount: number;
  successCount: number;
  errorCount: number;
  executedBy: string;
  date: string;
  details: string | null;
}
