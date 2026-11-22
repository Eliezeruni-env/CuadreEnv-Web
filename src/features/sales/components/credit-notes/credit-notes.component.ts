import {
  Component,
  OnInit,
  signal,
  computed,
  inject,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreditNoteService } from '../../services/credit-note.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { CreditNoteFormComponent } from './credit-note-form.component';
import { ListPaginationComponent } from '../../../cuadreEnv/components/list-pagination/list-pagination.component';
import { IconDirective } from '@coreui/icons-angular';
import {
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  ContainerComponent,
  SpinnerComponent,
} from '@coreui/angular';
import { KtPaginatorComponent } from '../../../billing/components/kt-paginator/kt-paginator.component';
import {
  WarehouseMovementReceiptModalComponent,
  type MovementReceiptData,
} from '../../../../app/shared/components/warehouse-movement-receipt-modal/warehouse-movement-receipt-modal.component';
import type { CreditNote } from '../../../../app/models/credit-note';

import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-credit-notes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SpinnerComponent,
    CreditNoteFormComponent,
    KtPaginatorComponent,
    WarehouseMovementReceiptModalComponent,
  ],
  templateUrl: './credit-notes.component.html',
  styleUrls: ['./credit-notes.component.scss'],
})
export class CreditNotesComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  private creditNoteService = inject(CreditNoteService);
  private notificationService = inject(NotificationService);
  private route = inject(ActivatedRoute);

  @ViewChild('creditNoteFormModal') creditNoteFormModal!: CreditNoteFormComponent;

  creditNotes = signal<CreditNote[]>([]);
  isLoading = signal<boolean>(false);
  searchTerm = '';

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  expandedNoteId = signal<number | null>(null);

  isCreateModalOpen = false;
  selectedCreditNote: CreditNote | null = null;

  // Image 2 Universal Comprobante Modal
  isReceiptModalOpen = signal<boolean>(false);
  selectedReceiptData: MovementReceiptData | null = null;

  readonly filteredCreditNotes = computed(() => {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.creditNotes();
    return this.creditNotes().filter(
      (n) =>
        (n.creditNoteNumber || '').toLowerCase().includes(term) ||
        (n.ncf || '').toLowerCase().includes(term) ||
        (n.billingNumber || '').toLowerCase().includes(term) ||
        (n.customerName || '').toLowerCase().includes(term),
    );
  });

  readonly pagedCreditNotes = computed(() => {
    const list = this.filteredCreditNotes();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  readonly totalRefundedAmount = computed(() => {
    return this.creditNotes().reduce((acc, n) => acc + (n.amountTotal || 0), 0);
  });

  ngOnInit() {
    this.loadCreditNotes();
    this.route.queryParams.subscribe((params) => {
      const invoiceTerm = params['billingNumber'] || params['invoiceNumber'] || params['billingId'];
      if (invoiceTerm) {
        setTimeout(() => {
          this.openCreateModal(String(invoiceTerm));
        }, 150);
      }
    });
  }

  async loadCreditNotes() {
    this.isLoading.set(true);
    try {
      const res = await this.creditNoteService.getCreditNotes();
      if (res?.success && res.data) {
        this.creditNotes.set(res.data);
      }
    } catch (e: any) {
      console.error('Error loading credit notes:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onSearchChange() {
    this.currentPage.set(1);
  }

  openCreateModal(invoiceId?: string) {
    if (this.creditNoteFormModal) {
      this.creditNoteFormModal.open(invoiceId);
    } else {
      this.isCreateModalOpen = true;
    }
  }

  onCreditNoteCreated(newNote: CreditNote) {
    this.loadCreditNotes();
    this.selectedCreditNote = newNote;
  }

  viewNoteDetail(note: CreditNote) {
    this.openReceiptModal(note);
  }

  openReceiptModal(note: CreditNote): void {
    const code = note.creditNoteNumber || (note.ncf ? note.ncf : `NC-${note.id}`);
    const rawItems = note.creditNoteDetails || [];
    this.selectedReceiptData = {
      movementCode: code,
      movementType: 'outlet',
      statusLabel: 'Emitida',
      title: 'Comprobante fiscal de nota de crédito',
      firstColumnHeader: 'COMPROBANTE',
      warehouseName: note.customerName || 'Consumidor Final',
      secondColumnHeader: 'CLIENTE',
      warehouseLocation: note.billingNumber ? `Afecta: ${note.billingNumber}` : 'Devolución de venta',
      conceptName: note.creditNoteType === 1 ? 'Devolución Total' : 'Devolución Parcial',
      thirdColumnHeader: 'TIPO DE NOTA',
      conceptDescription: note.ncf ? `NCF: ${note.ncf}` : 'Modificación fiscal',
      fourthColumnHeader: 'FECHA Y HORA',
      date: new Date(note.creationDate || Date.now()).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: new Date(note.creationDate || Date.now()).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }),
      itemsSectionTitle: 'Artículos reintegrados',
      items: rawItems.map((p: any) => ({
        code: p.barCode || (p.productId ? `PROD-${p.productId}` : 'N/A'),
        name: p.productName || 'Artículo',
        description: '',
        quantity: Number(p.quantity) || 1,
        unitCost: Number(p.price) || 0,
        totalCost: Number(p.totalAmount || (p.quantity * (p.price || 0))) || 0,
      })),
      totalUnits: rawItems.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 1), 0),
      totalCost: Number(note.amountTotal) || 0,
      footerNote: 'Nota de crédito aplicada al inventario y balance de cuenta',
    };
    this.isReceiptModalOpen.set(true);
  }

  toggleDetail(note: CreditNote) {
    if (note.id != null) {
      if (this.expandedNoteId() === note.id) {
        this.expandedNoteId.set(null);
      } else {
        this.expandedNoteId.set(note.id);
      }
    }
  }

  isNoteExpanded(noteId?: number): boolean {
    return noteId != null && this.expandedNoteId() === noteId;
  }

  printCreditNote() {
    setTimeout(() => {
      window.print();
    }, 150);
  }
}
