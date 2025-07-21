import { IsOptional } from 'class-validator';
import { User } from '../user/user.schema';
import { Event } from '../event/event.schema';
import { NotifType } from './notification.schema';

export class UpdateNotificationDto {
  @IsOptional({ message: 'You cannot pass user id' })
  readonly userFromId: User;

  @IsOptional()
  readonly userToId: User;

  @IsOptional()
  readonly eventId: Event;

  @IsOptional()
  readonly type: NotifType;

  @IsOptional()
  readonly message: string;

  @IsOptional()
  readonly isRead: boolean;
}
