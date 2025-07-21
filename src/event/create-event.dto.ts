/* eslint-disable @typescript-eslint/no-unsafe-call */
import { TicketClasses } from 'src/ticket-classes/ticket-classes.shema';
import { User } from '../user/user.schema';
import { EventType } from './event.schema';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsEmpty,
  IsDate,
} from 'class-validator';

export class CreateEventDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly autor: User;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  readonly title: string;

  @IsString()
  @IsNotEmpty()
  readonly cover: string;

  @IsDate()
  @IsNotEmpty()
  readonly dateStart: Date;

  @IsDate()
  @IsNotEmpty()
  readonly dateEnd: Date;

  @IsString()
  @IsNotEmpty()
  readonly timeStart: string;

  @IsString()
  @IsNotEmpty()
  readonly timeEnd: string;

  @IsEnum(EventType, {
    message: 'Enter corect EventType : Public or Private',
  })
  @IsNotEmpty()
  readonly type: EventType;

  @IsNotEmpty()
  readonly ticketClasses: TicketClasses[];

  @IsString()
  @IsNotEmpty()
  readonly description: string;

  @IsBoolean()
  @IsNotEmpty()
  readonly status: boolean;

  @IsBoolean()
  @IsNotEmpty()
  readonly paid: boolean;

  @IsString()
  @IsNotEmpty()
  readonly cityId: string;

  @IsString()
  @IsNotEmpty()
  readonly countryId: string;

  @IsString()
  @IsNotEmpty()
  readonly categoryId: string;

  @IsString()
  @IsNotEmpty()
  agreeTerms: boolean;

  @IsString()
  @IsNotEmpty()
  readonly location: string;

  @IsString()
  @IsNotEmpty()
  readonly phone: string;

  @IsString()
  @IsOptional()
  readonly phone2: string;

  @IsString()
  @IsOptional()
  readonly onlineMeet: string;

  @IsString()
  @IsOptional()
  readonly whatsapp: string;

  @IsString()
  @IsOptional()
  readonly twitter: string;

  @IsString()
  @IsOptional()
  readonly instagram: string;

  @IsString()
  @IsOptional()
  readonly facebook: string;

  @IsString()
  @IsOptional()
  readonly externalLink: string;

  @IsString()
  @IsOptional()
  readonly linkedIn: string;

  @IsString()
  @IsOptional()
  readonly email: string;

  @IsString()
  @IsOptional()
  readonly address: string;
}
