import {
  IsBoolean,
  IsEmpty,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { User } from '../user/user.schema';
import { Event } from '../event/event.schema';
import { NotifType } from './notification.schema';

export class CreateNotificationDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly userFromId: User;

  @IsNotEmpty()
  readonly userToId: User;

  @IsOptional()
  readonly eventId: Event;

  @IsString()
  @IsNotEmpty()
  readonly type: NotifType;

  @IsString()
  @IsOptional()
  readonly message: string;

  @IsBoolean()
  @IsEmpty()
  readonly isRead: boolean;
}
