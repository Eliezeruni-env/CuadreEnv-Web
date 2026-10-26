import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { FormControl, FormGroup } from '@angular/forms';
import {
  mapApiErrorToUserMessage,
  applyFieldErrorsToForm,
} from './api-error-mapper';

describe('API Error Mapper (api-error-mapper)', () => {
  describe('Critical Server and Database Errors', () => {
    it('should map 500 DB_ERROR to generic friendly message and preserve requestId', () => {
      const rawError = {
        status: 500,
        error: {
          statusCode: 500,
          errorCode: 'DB_ERROR',
          message: 'SqlException: Invalid column name "xyz" in SELECT * FROM Products',
          requestId: 'req-abc-12345',
          path: '/product',
          timestamp: '2026-08-31T15:00:00Z',
        },
      };

      const mapped = mapApiErrorToUserMessage(rawError);

      expect(mapped.type).toBe('danger');
      expect(mapped.isCritical).toBe(true);
      expect(mapped.title).toBe('Avería del Servidor');
      expect(mapped.message).toBe('Estamos trabajando en una avería del servidor. El equipo de desarrollo se encargará de resolverlo a la brevedad.');
      expect(mapped.message).not.toContain('SqlException');
      expect(mapped.requestId).toBe('req-abc-12345');
      expect(mapped.errorCode).toBe('DB_ERROR');
    });

    it('should map status 0 (backend offline / server down) to averia message', () => {
      const rawError = {
        name: 'HttpErrorResponse',
        status: 0,
        statusText: 'Unknown Error',
        message: 'Http failure response for http://localhost:5000/api/product: 0 Unknown Error',
      };

      const mapped = mapApiErrorToUserMessage(rawError);

      expect(mapped.type).toBe('danger');
      expect(mapped.isCritical).toBe(true);
      expect(mapped.title).toBe('Avería del Servidor');
      expect(mapped.message).toBe('Estamos trabajando en una avería. El equipo de desarrollo se encargará de resolverlo a la brevedad.');
      expect(mapped.errorCode).toBe('SERVER_OUTAGE');
    });

    it('should sanitize TABLE_MISSING error without exposing internal DB table details', () => {
      const rawError = {
        error: {
          statusCode: 500,
          errorCode: 'TABLE_MISSING',
          message: 'Table dbo.CustomerSettings does not exist on catalog db_prod',
          requestId: 'req-table-999',
        },
      };

      const mapped = mapApiErrorToUserMessage(rawError);

      expect(mapped.isCritical).toBe(true);
      expect(mapped.type).toBe('danger');
      expect(mapped.title).toBe('Avería del Servidor');
      expect(mapped.message).toBe('El servicio no está disponible temporalmente por avería. El equipo de desarrollo se encargará de resolverlo.');
      expect(mapped.message).not.toContain('dbo.CustomerSettings');
      expect(mapped.requestId).toBe('req-table-999');
    });
  });

  describe('Validation & INVALID_MODEL Errors', () => {
    it('should extract structured fieldErrors from array of field error objects', () => {
      const rawError = {
        error: {
          statusCode: 400,
          errorCode: 'INVALID_MODEL',
          message: 'One or more validation errors occurred.',
          requestId: 'req-val-001',
          errors: [
            { field: 'description', message: 'La descripción es obligatoria' },
            { field: 'cost', message: 'El costo debe ser mayor a 0' },
          ],
        },
      };

      const mapped = mapApiErrorToUserMessage(rawError);

      expect(mapped.type).toBe('warning');
      expect(mapped.title).toBe('Datos Inválidos');
      expect(mapped.fieldErrors).toBeDefined();
      expect(mapped.fieldErrors!['description']).toBe('La descripción es obligatoria');
      expect(mapped.fieldErrors!['cost']).toBe('El costo debe ser mayor a 0');
    });

    it('should extract fieldErrors from key-value object map', () => {
      const rawError = {
        error: {
          statusCode: 400,
          errorCode: 'INVALID_MODEL',
          errors: {
            Name: ['Name is required', 'Must be less than 100 characters'],
            Email: 'Email format is invalid',
          },
        },
      };

      const mapped = mapApiErrorToUserMessage(rawError);

      expect(mapped.fieldErrors!['name']).toBe('Name is required, Must be less than 100 characters');
      expect(mapped.fieldErrors!['email']).toBe('Email format is invalid');
    });
  });

  describe('Constraint & Referential Integrity Errors', () => {
    it('should map DUPLICATE_NAME error with friendly message', () => {
      const rawError = {
        error: {
          statusCode: 409,
          errorCode: 'DUPLICATE_NAME',
          message: 'El nombre del producto ya existe.',
          requestId: 'req-dup-01',
        },
      };

      const mapped = mapApiErrorToUserMessage(rawError);

      expect(mapped.type).toBe('warning');
      expect(mapped.title).toBe('Registro Duplicado');
      expect(mapped.message).toContain('El nombre');
      expect(mapped.requestId).toBe('req-dup-01');
    });

    it('should map FK_VIOLATION with friendly relational integrity message', () => {
      const rawError = {
        error: {
          statusCode: 409,
          errorCode: 'FK_VIOLATION',
          message: 'The DELETE statement conflicted with the REFERENCE constraint FK_Sales_Products',
        },
      };

      const mapped = mapApiErrorToUserMessage(rawError);

      expect(mapped.type).toBe('warning');
      expect(mapped.title).toBe('Operación No Permitida');
      expect(mapped.message).toBe('No se puede completar la acción porque el registro está vinculado con otros datos en el sistema.');
    });

    it('should map OPEN_CASH_OPERATIONS with informative warning without treating as server error', () => {
      const rawError = {
        status: 400,
        error: {
          statusCode: 400,
          errorCode: 'OPEN_CASH_OPERATIONS',
          message: 'No se puede cerrar la caja: existen 1 venta(s) en espera que deben completarse o anularse primero.',
        },
      };

      const mapped = mapApiErrorToUserMessage(rawError);

      expect(mapped.type).toBe('warning');
      expect(mapped.title).toBe('Ventas Pendientes en Caja');
      expect(mapped.message).toContain('venta');
      expect(mapped.isCritical).toBe(false);
      expect(mapped.errorCode).toBe('OPEN_CASH_OPERATIONS');
    });
  });

  describe('applyFieldErrorsToForm Helper', () => {
    it('should set errors and mark controls as touched in FormGroup', () => {
      const form = new FormGroup({
        description: new FormControl(''),
        cost: new FormControl(0),
        barcode: new FormControl(''),
      });

      const fieldErrors = {
        description: 'Nombre requerido',
        cost: 'Debe ser mayor a 0',
      };

      applyFieldErrorsToForm(form, fieldErrors);

      expect(form.get('description')?.errors).toEqual({ serverError: 'Nombre requerido' });
      expect(form.get('description')?.touched).toBe(true);
      expect(form.get('cost')?.errors).toEqual({ serverError: 'Debe ser mayor a 0' });
      expect(form.get('cost')?.touched).toBe(true);
      expect(form.get('barcode')?.errors).toBeNull();
      expect(form.get('barcode')?.touched).toBe(false);
    });
  });
});
