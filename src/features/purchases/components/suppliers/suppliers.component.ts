import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { SupplierService } from '../../services/supplier.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import {
  ContainerComponent,
  AlertComponent,
  SpinnerComponent,
  FormControlDirective,
  FormDirective,
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';

export interface SupplierContact {
  id?: number;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
}

export interface SupplierItem {
  id?: number;
  name: string;
  rnc?: string | null;
  cedula?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  additionalContacts?: SupplierContact[];
  active?: boolean;
}

const SUPPLIER_CONTACTS_KEY = 'cuadreenv_supplier_extra_contacts';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ContainerComponent,
    AlertComponent,
    SpinnerComponent,
    FormControlDirective,
    FormDirective,
    IconDirective,
  ],
  templateUrl: './suppliers.component.html',
  styleUrls: ['./suppliers.component.scss'],
})
export class SuppliersComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  private readonly supplierService = inject(SupplierService);
  private readonly notificationService = inject(NotificationService);
  private readonly confirmService = inject(ConfirmDialogService);
  private readonly fb = inject(FormBuilder);

  suppliers = signal<SupplierItem[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  searchTerm = signal<string>('');
  isModalOpen = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  selectedSupplierId = signal<number | null>(null);
  selectedSupplierDetail = signal<SupplierItem | null>(null);

  supplierType = signal<'EMPRESA' | 'PERSONA'>('EMPRESA');
  isAdditionalContactsExpanded = signal<boolean>(true);

  // Sorting
  sortColumn = signal<string>('name');
  sortDirection = signal<'asc' | 'desc'>('asc');

  toggleSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  // Dynamic additional contacts in current form
  additionalContacts = signal<SupplierContact[]>([]);

  supplierForm: FormGroup;

  // Filtered suppliers
  readonly filteredSuppliers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    let list = this.suppliers();
    if (term) {
      list = list.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(term) ||
          (s.rnc || '').toLowerCase().includes(term) ||
          (s.cedula || '').toLowerCase().includes(term) ||
          (s.email || '').toLowerCase().includes(term) ||
          (s.contactPerson || '').toLowerCase().includes(term) ||
          (s.phone || '').toLowerCase().includes(term) ||
          (s.mobile || '').toLowerCase().includes(term),
      );
    }

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      switch (col) {
        case 'name':
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
          break;
        case 'rnc':
          valA = (a.rnc || a.cedula || '').toLowerCase();
          valB = (b.rnc || b.cedula || '').toLowerCase();
          break;
        case 'contact':
          valA = (a.contactPerson || '').toLowerCase();
          valB = (b.contactPerson || '').toLowerCase();
          break;
        case 'phone':
          valA = (a.phone || a.mobile || '').toLowerCase();
          valB = (b.phone || b.mobile || '').toLowerCase();
          break;
        case 'email':
          valA = (a.email || '').toLowerCase();
          valB = (b.email || '').toLowerCase();
          break;
        case 'status':
          valA = a.active !== false ? 1 : 0;
          valB = b.active !== false ? 1 : 0;
          break;
        default:
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
      }
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  readonly totalSuppliers = computed(() => this.suppliers().length);
  readonly activeSuppliersCount = computed(
    () => this.suppliers().filter((s) => s.active !== false).length,
  );

  constructor() {
    this.supplierForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(150)]],
      rnc: ['', [Validators.maxLength(50)]],
      cedula: ['', [Validators.maxLength(50)]],
      phone: ['', [Validators.maxLength(50)]],
      mobile: ['', [Validators.maxLength(50)]],
      email: ['', [Validators.email, Validators.maxLength(100)]],
      address: ['', [Validators.maxLength(250)]],
      contactPerson: ['', [Validators.maxLength(100)]],
      active: [true],
    });
  }

  ngOnInit() {
    this.loadSuppliers();
  }

  private getContactsStorage(): Record<string, SupplierContact[]> {
    try {
      const raw = localStorage.getItem(SUPPLIER_CONTACTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveContactsStorage(data: Record<string, SupplierContact[]>): void {
    try {
      localStorage.setItem(SUPPLIER_CONTACTS_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  async loadSuppliers() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const res = await this.supplierService.getSuppliers();
      const contactsMap = this.getContactsStorage();
      if (res.success && res.data) {
        const enriched = res.data.map((s: SupplierItem) => {
          const key = String(s.id ?? s.name);
          return {
            ...s,
            additionalContacts: s.additionalContacts || contactsMap[key] || [],
          };
        });
        this.suppliers.set(enriched);
      } else {
        this.suppliers.set([]);
      }
    } catch (e: any) {
      this.errorMessage.set(
        e?.response?.data?.message ||
          e?.message ||
          'Error al cargar los proveedores.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  openCreateModal() {
    this.isEditMode.set(false);
    this.selectedSupplierId.set(null);
    this.supplierType.set('EMPRESA');
    this.isAdditionalContactsExpanded.set(true);
    this.additionalContacts.set([
      {
        id: Date.now(),
        name: 'Maria Gómez',
        role: 'Representante de ventas',
        email: 'maria.gomez@proveedor.com',
        phone: '809-555-0202',
      },
    ]);
    this.supplierForm.reset({
      name: '',
      rnc: '',
      cedula: '',
      phone: '',
      mobile: '',
      email: '',
      address: '',
      contactPerson: '',
      active: true,
    });
    this.isModalOpen.set(true);
  }

  openEditModal(supplier: SupplierItem) {
    this.isEditMode.set(true);
    this.selectedSupplierId.set(supplier.id || null);
    this.additionalContacts.set(
      supplier.additionalContacts ? [...supplier.additionalContacts] : [],
    );
    this.supplierForm.patchValue({
      name: supplier.name || '',
      rnc: supplier.rnc || '',
      cedula: supplier.cedula || '',
      phone: supplier.phone || '',
      mobile: supplier.mobile || '',
      email: supplier.email || '',
      address: supplier.address || '',
      contactPerson: supplier.contactPerson || '',
      active: supplier.active !== false,
    });
    this.isModalOpen.set(true);
  }

  addAdditionalContact() {
    const list = this.additionalContacts();
    this.additionalContacts.set([
      ...list,
      {
        id: Date.now(),
        name: '',
        role: 'Ventas / Comercial',
        phone: '',
        email: '',
      },
    ]);
  }

  removeAdditionalContact(index: number) {
    const list = [...this.additionalContacts()];
    list.splice(index, 1);
    this.additionalContacts.set(list);
  }

  updateContactField(
    index: number,
    field: keyof SupplierContact,
    value: string,
  ) {
    const list = [...this.additionalContacts()];
    if (list[index]) {
      list[index] = { ...list[index], [field]: value };
      this.additionalContacts.set(list);
    }
  }

  viewSupplierDetail(supplier: SupplierItem) {
    this.selectedSupplierDetail.set(supplier);
  }

  closeDetailModal() {
    this.selectedSupplierDetail.set(null);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  async saveSupplier() {
    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const val = this.supplierForm.value;
    const cleanContacts = this.additionalContacts().filter(
      (c) => c.name.trim().length > 0,
    );

    const payload: SupplierItem = {
      name: val.name.trim(),
      rnc: val.rnc ? val.rnc.trim() : null,
      cedula: val.cedula ? val.cedula.trim() : null,
      phone: val.phone ? val.phone.trim() : null,
      mobile: val.mobile ? val.mobile.trim() : null,
      email: val.email ? val.email.trim() : null,
      address: val.address ? val.address.trim() : null,
      contactPerson: val.contactPerson ? val.contactPerson.trim() : null,
      additionalContacts: cleanContacts,
      active: Boolean(val.active),
    };

    try {
      let createdOrUpdatedId: number | undefined;
      if (this.isEditMode() && this.selectedSupplierId()) {
        payload.id = this.selectedSupplierId()!;
        createdOrUpdatedId = payload.id;
        await this.supplierService.updateSupplier(payload);
        this.notificationService.success('Proveedor actualizado exitosamente.');
      } else {
        const res = await this.supplierService.createSupplier(payload);
        createdOrUpdatedId = res?.data?.id;
        this.notificationService.success('Proveedor creado exitosamente.');
      }

      // Persist additional contacts
      const storage = this.getContactsStorage();
      const storageKey = String(createdOrUpdatedId ?? payload.name);
      storage[storageKey] = cleanContacts;
      this.saveContactsStorage(storage);

      this.closeModal();
      await this.loadSuppliers();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteSupplier(supplier: SupplierItem) {
    if (!supplier.id) return;
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar Proveedor?',
      message: `¿Estás seguro de que deseas eliminar a "${supplier.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      await this.supplierService.deleteSupplier(supplier.id);
      this.notificationService.success('Proveedor eliminado exitosamente.');
      await this.loadSuppliers();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}
