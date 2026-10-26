import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-manage-request-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconDirective],
  templateUrl: './manage-request-modal.component.html',
  styleUrls: ['./manage-request-modal.component.scss'],
})
export class ManageRequestModalComponent implements OnInit {
  @Input() visible = false;
  @Input() requestTitle = 'Solicitud de Autorización';
  @Input() isLoading = false;
  @Output() submitRequest = new EventEmitter<{ reason: string; supervisorPin?: string }>();
  @Output() cancel = new EventEmitter<void>();

  form!: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit() {
    this.form = this.fb.group({
      reason: ['', [Validators.required, Validators.minLength(5)]],
      supervisorPin: [''],
    });
  }

  confirmRequest() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitRequest.emit(this.form.value);
  }
}
