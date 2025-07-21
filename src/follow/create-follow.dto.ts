import { IsEmpty, IsNotEmpty, IsString } from 'class-validator';
import { User } from '../user/user.schema';

export class CreateFollowDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly userId: User;

  @IsString()
  @IsNotEmpty()
  readonly followId: User;
}
