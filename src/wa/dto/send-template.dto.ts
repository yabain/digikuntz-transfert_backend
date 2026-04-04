import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class SendTemplateDto {
  @IsString()
  @Matches(/^[0-9+()\s-]+$/)
  to!: string;

  @IsString()
  @MinLength(1)
  templateName!: string;

  /** Ex: 'en' | 'fr' */
  @IsString()
  @MinLength(2)
  language!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  bodyParams?: string[];

  @IsOptional()
  @IsString()
  buttonUrlParam?: string;

  /** Ex: '237' (sans +) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,4}$/)
  countryCode?: string;
}

