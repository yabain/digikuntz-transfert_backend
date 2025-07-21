/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsEmpty, IsNotEmpty, IsString } from 'class-validator';
import { User } from 'src/user/user.schema';

export class CreateFavoriteDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsString()
  @IsEmpty({ message: 'You cannot pass userId' })
  readonly userId: User;

  @IsString()
  @IsNotEmpty()
  readonly eventId: Event;
}
