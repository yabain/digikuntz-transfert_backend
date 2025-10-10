import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class SendTextDto {
  @IsString()
  @Matches(/^[0-9+()\s-]+$/)
  to!: string;

  @IsString()
  @MinLength(1)
  message!: string;

  /** Ex: '237' (sans +) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,4}$/)
  countryCode?: string;
}
