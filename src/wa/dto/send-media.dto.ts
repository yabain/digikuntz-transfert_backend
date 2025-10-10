import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
} from 'class-validator';

export class SendMediaDto {
  @IsString()
  @Matches(/^[0-9+()\s-]+$/)
  to!: string;

  @IsUrl()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  caption?: string;

  /** Ex: '237' (sans +) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,4}$/)
  countryCode?: string;
}
