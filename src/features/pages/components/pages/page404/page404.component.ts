import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../../../cuadreEnv/services/translation.service';

@Component({
  selector: 'app-page404',
  standalone: true,
  templateUrl: './page404.component.html',
  imports: [RouterLink]
})
export class Page404Component {
  readonly translationService = inject(TranslationService);
}
