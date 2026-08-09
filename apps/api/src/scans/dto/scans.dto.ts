import { IsIn, IsOptional, IsString } from 'class-validator';
import { SCAN_TYPES, type ScanType } from '@devmate/shared';

export class CreateScanDto {
  @IsIn(SCAN_TYPES)
  type!: ScanType;

  @IsOptional()
  @IsString()
  query?: string;
}
