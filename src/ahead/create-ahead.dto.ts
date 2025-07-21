/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsEmpty, IsNotEmpty, IsString } from 'class-validator';
import { City } from 'src/city/city.schema';
import { Country } from 'src/country/country.schema';

export class CreateAheadDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsString()
  @IsNotEmpty()
  readonly eventId: Event;

  @IsString()
  @IsNotEmpty()
  readonly countryId: Country;

  @IsString()
  @IsNotEmpty()
  readonly cityId: City;
}
