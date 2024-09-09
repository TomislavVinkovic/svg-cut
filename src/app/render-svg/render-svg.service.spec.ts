import { TestBed } from '@angular/core/testing';

import { RenderSvgService } from './render-svg.service';

describe('RenderSvgService', () => {
  let service: RenderSvgService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RenderSvgService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
