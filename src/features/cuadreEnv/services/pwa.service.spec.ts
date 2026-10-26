import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaService } from './pwa.service';

describe('PwaService', () => {
  let service: PwaService;

  beforeEach(() => {
    (window as any).__pwaInstallPrompt = null;
    TestBed.configureTestingModule({
      providers: [PwaService],
    });
    service = TestBed.inject(PwaService);
  });

  it('should initialize with default states', () => {
    expect(service).toBeDefined();
    expect(service.isOnline()).toBe(true);
  });

  it('should show guided modal if promptInstall is called without native prompt', async () => {
    service.showInstallModal.set(false);
    await service.promptInstall();
    expect(service.showInstallModal()).toBe(true);
  });

  it('should call native prompt when deferredPrompt is available', async () => {
    const mockPrompt = vi.fn().mockResolvedValue(undefined);
    const mockChoice = Promise.resolve({ outcome: 'accepted' });
    const fakeEvent = {
      prompt: mockPrompt,
      userChoice: mockChoice,
    };

    (window as any).__pwaInstallPrompt = fakeEvent;
    service['deferredPrompt'] = fakeEvent;

    await service.promptInstall();

    expect(mockPrompt).toHaveBeenCalled();
    expect(service.isInstalled()).toBe(true);
    expect(service.canInstall()).toBe(false);
    expect(service.showInstallModal()).toBe(false);
  });

  it('should close install modal and reset instructions on closeInstallModal', () => {
    service.showInstallModal.set(true);
    service.showIosInstructions.set(true);

    service.closeInstallModal();

    expect(service.showInstallModal()).toBe(false);
    expect(service.showIosInstructions()).toBe(false);
  });
});
