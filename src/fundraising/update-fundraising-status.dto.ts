import { IsBoolean } from 'class-validator';

export class UpdateFundraisingStatusDto {
  @IsBoolean()
  status: boolean;
}
