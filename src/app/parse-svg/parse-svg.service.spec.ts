import { TestBed } from '@angular/core/testing';

import { ParseSvgService } from './parse-svg.service';

describe('ParseSvgService', () => {
  let service: ParseSvgService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ParseSvgService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
