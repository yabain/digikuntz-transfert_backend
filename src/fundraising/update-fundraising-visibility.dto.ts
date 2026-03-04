import { IsEnum } from 'class-validator';
import { FundraisingVisibility } from './fundraising.schema';

export class UpdateFundraisingVisibilityDto {
  @IsEnum(FundraisingVisibility)
  visibility: FundraisingVisibility;
}
