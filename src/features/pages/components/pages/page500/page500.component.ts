import { Component, inject } from '@angular/core';
import { IconDirective } from '@coreui/icons-angular';
import { TranslationService } from '../../../../cuadreEnv/services/translation.service';
import {
  ButtonDirective,
  ColComponent,
  ContainerComponent,
  FormControlDirective,
  InputGroupComponent,
  InputGroupTextDirective,
  RowComponent
} from '@coreui/angular';

@Component({
  selector: 'app-page500',
  templateUrl: './page500.component.html',
  imports: [ContainerComponent, RowComponent, ColComponent]
})
export class Page500Component {
  readonly translationService = inject(TranslationService);
}

