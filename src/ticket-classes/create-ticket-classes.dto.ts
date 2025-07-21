import { IsString, IsNotEmpty, IsEmpty, IsNumber } from 'class-validator';

export class CreateTicketClassesDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly id: string;

  @IsString()
  @IsNotEmpty()
  readonly eventId: string;

  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @IsNumber()
  @IsNotEmpty()
  readonly price: number;

  @IsNumber()
  @IsNotEmpty()
  readonly quantity: number;

  @IsNumber()
  @IsNotEmpty()
  readonly taken: number;

  @IsString()
  @IsNotEmpty()
  readonly description: string;
}
