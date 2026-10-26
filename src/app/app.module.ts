import { NgModule, ErrorHandler } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { IconSetService } from '@coreui/icons-angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app.routing';
import { SharedModule } from './shared/shared.module';
import { ComponentsModule } from './components/components.module';
import { AdminLayoutModule } from './layouts/admin-layout/admin-layout.module';
import { PosLayoutModule } from './layouts/pos-layout/pos-layout.module';
import { AuthLayoutModule } from './layouts/auth-layout/auth-layout.module';
import { AuthInterceptor, AppHttpInterceptor } from './interceptor';
import { GlobalErrorHandler } from './app.config';

@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    AppRoutingModule,
    SharedModule,
    ComponentsModule,
    AdminLayoutModule,
    PosLayoutModule,
    AuthLayoutModule,
    AppComponent,
  ],
  providers: [
    IconSetService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AppHttpInterceptor,
      multi: true,
    },
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler,
    },
  ],
})
export class AppModule {}
