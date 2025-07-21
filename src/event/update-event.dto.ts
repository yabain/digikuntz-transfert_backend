import { User } from '../user/user.schema';
import { EventType } from './event.schema';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsEmpty,
  IsNotEmpty,
} from 'class-validator';

export class UpdateEventDto {
  @IsNotEmpty()
  readonly autor: User;

  @IsEnum(EventType, {
    message: 'Enter corect EventType : personal/organisation',
  })
  @IsOptional()
  type: EventType;

  @IsEmpty({ message: 'You cannot pass user id' })
  @IsOptional()
  readonly ticketClasses: any;

  @IsString()
  @IsOptional()
  title: string;

  @IsString()
  @IsOptional()
  categoryId: string;

  @IsBoolean()
  @IsOptional()
  agreeTerms: boolean;

  @IsString()
  @IsOptional()
  dateStart: string;

  @IsString()
  @IsOptional()
  dateEnd: string;

  @IsString()
  @IsOptional()
  timeStart: string;

  @IsString()
  @IsOptional()
  timeEnd: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsBoolean()
  @IsOptional()
  paid: boolean;

  @IsEmpty({ message: 'You cannot pass city id' })
  @IsString()
  @IsOptional()
  cityId: string;

  @IsEmpty({ message: 'You cannot pass country id' })
  @IsString()
  @IsOptional()
  countryId: string;

  @IsString()
  @IsOptional()
  location: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsOptional()
  firstName: string;

  @IsString()
  @IsOptional()
  lastName: string;

  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  pictureUrl: string;

  @IsString()
  @IsOptional()
  cover: string;

  @IsString()
  @IsOptional()
  phone2: string;

  @IsString()
  @IsOptional()
  whatsapp: string;

  @IsString()
  @IsOptional()
  twitter: string;

  @IsString()
  @IsOptional()
  instagram: string;

  @IsString()
  @IsOptional()
  facebook: string;

  @IsString()
  @IsOptional()
  externalLink: string;

  @IsString()
  @IsOptional()
  linkedIn: string;

  @IsString()
  @IsOptional()
  email: string;

  @IsString()
  @IsOptional()
  address: string;
}
