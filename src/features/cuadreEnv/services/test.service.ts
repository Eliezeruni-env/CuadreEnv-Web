import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TestService {
  constructor(private http: HttpClient) {}

  loginTest() {
    const body = {
      email: 'test@admin.com',
      password: '123456',
      deviceId: 'web-browser',
    };
    return this.http.post(`${environment.apiUrl}/Auth/login`, body);
  }

  health() {
    const rootUrl = environment.apiUrl.replace(/\/v1\/?$/, '');
    return this.http.get(`${rootUrl}/hc`);
  }

  weatherForecast() {
    return this.http.get(`${environment.apiUrl}/WeatherForecast`);
  }

  inventory() {
    return this.http.get(`${environment.apiUrl}/Inventory`);
  }
}
