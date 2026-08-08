import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  AnnouncementChannel,
  AnnouncementRecipientGroup,
} from '../announcement.schema';

export class CreateAnnouncementDto {
  @ApiPropertyOptional({ enum: AnnouncementChannel, example: AnnouncementChannel.EMAIL })
  @IsOptional()
  @IsEnum(AnnouncementChannel)
  channel?: AnnouncementChannel;

  @ApiProperty({ example: 'Nouveautés digiKUNTZ' })
  @IsString()
  subject: string;

  @ApiProperty({ example: '<p>Bonjour {userFirstName}, découvrez nos nouveautés.</p>' })
  @IsString()
  html: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  useHeader?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  useFooter?: boolean;

  @ApiPropertyOptional({ example: 'https://backend.example.com/uploads/announcements/offer.jpg' })
  @IsOptional() @IsString() attachmentUrl?: string;
  @ApiPropertyOptional({ example: '/uploads/announcements/offer.jpg' })
  @IsOptional() @IsString() attachmentPath?: string;
  @ApiPropertyOptional({ example: 'offre.jpg' })
  @IsOptional() @IsString() attachmentName?: string;
  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional() @IsString() attachmentMimeType?: string;
  @ApiPropertyOptional({ example: 245678 })
  @IsOptional() @IsInt() @Min(0) attachmentSize?: number;

  @ApiPropertyOptional({ enum: AnnouncementRecipientGroup, example: AnnouncementRecipientGroup.ALL_PERSONAL })
  @IsOptional()
  @IsEnum(AnnouncementRecipientGroup)
  recipientGroup?: AnnouncementRecipientGroup;

  @ApiPropertyOptional({ example: 'client@example.com; autre@example.com' })
  @IsOptional()
  @IsString()
  recipientEmails?: string;

  @ApiPropertyOptional({ example: '2026-06-03T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ enum: AnnouncementChannel })
  @IsOptional()
  @IsEnum(AnnouncementChannel)
  channel?: AnnouncementChannel;

  @ApiPropertyOptional({ example: 'Nouveautés digiKUNT' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: '<p>Bonjour {userFirstName}, découvrez nos nouveautés.</p>' })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  useHeader?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  useFooter?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() attachmentUrl?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() attachmentPath?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() attachmentName?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() attachmentMimeType?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0) attachmentSize?: number;

  @ApiPropertyOptional({ enum: AnnouncementRecipientGroup })
  @IsOptional()
  @IsEnum(AnnouncementRecipientGroup)
  recipientGroup?: AnnouncementRecipientGroup;

  @ApiPropertyOptional({ example: 'client@example.com; autre@example.com' })
  @IsOptional()
  @IsString()
  recipientEmails?: string;

  @ApiPropertyOptional({ example: '2026-06-03T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}