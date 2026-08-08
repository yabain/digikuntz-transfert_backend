import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';
import { AnnouncementStatus } from './announcement.schema';

const announcementAttachmentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const destination = 'public/uploads/announcements';
    mkdirSync(destination, { recursive: true });
    cb(null, destination);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${randomUUID()}${extname(file.originalname).toLowerCase()}`);
  },
});

@ApiTags('announcements (admin)')
@ApiBearerAuth('bearer')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post('attachment')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importer une pièce jointe pour une annonce' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: announcementAttachmentStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        const accepted = allowed.includes(file.mimetype);
        cb(accepted ? null : new Error('Unsupported attachment type'), accepted);
      },
    }),
  )
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    if (!file) throw new BadRequestException('Attachment file is required');
    const relativePath = `/uploads/announcements/${file.filename}`;
    const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
    return {
      attachmentUrl: appUrl ? `${appUrl}${relativePath}` : relativePath,
      attachmentPath: relativePath,
      attachmentName: file.originalname,
      attachmentMimeType: file.mimetype,
      attachmentSize: file.size,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lister les annonces (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: AnnouncementStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  @UseGuards(AuthGuard('jwt'))
  list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: AnnouncementStatus,
    @Query('search') search?: string,
    @Req() req: any = {},
  ) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.list(page, limit, status, search);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Récupérer le header/footer des e-mails (admin)' })
  @UseGuards(AuthGuard('jwt'))
  getSettings(@Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Mettre à jour le header/footer des e-mails (admin)' })
  @UseGuards(AuthGuard('jwt'))
  updateSettings(
    @Body() dto: { headerHtml?: string; footerHtml?: string },
    @Req() req: any,
  ) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.updateSettings(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail annonce (admin)' })
  @ApiParam({ name: 'id' })
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une annonce en brouillon ou programmée (admin)' })
  @ApiBody({ type: CreateAnnouncementDto })
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req: any, @Body() dto: CreateAnnouncementDto) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.create(req.user, dto, false);
  }

  @Post('send')
  @ApiOperation({ summary: 'Créer et envoyer immédiatement une annonce (admin)' })
  @ApiBody({ type: CreateAnnouncementDto })
  @UseGuards(AuthGuard('jwt'))
  createAndSend(@Req() req: any, @Body() dto: CreateAnnouncementDto) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.create(req.user, dto, true);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une annonce brouillon ou programmée (admin)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateAnnouncementDto })
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.update(id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier une annonce brouillon ou programmée (admin)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateAnnouncementDto })
  @UseGuards(AuthGuard('jwt'))
  updatePut(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.update(id, dto);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Envoyer immédiatement une annonce existante (admin)' })
  @ApiParam({ name: 'id' })
  @UseGuards(AuthGuard('jwt'))
  send(@Param('id') id: string, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.sendAnnouncement(id);
  }

  @Post(':id/retry-failed')
  @ApiOperation({
    summary: 'Relancer uniquement les destinataires en échec d’une annonce',
  })
  @ApiParam({ name: 'id' })
  @UseGuards(AuthGuard('jwt'))
  retryFailed(@Param('id') id: string, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.retryFailedDeliveries(id);
  }

  @Post(':id/resume')
  @ApiOperation({
    summary: 'Relancer l’envoi après arrêt pour échecs',
  })
  @ApiParam({ name: 'id' })
  @UseGuards(AuthGuard('jwt'))
  resume(@Param('id') id: string, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.retryFailedDeliveries(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une annonce (admin)' })
  @ApiParam({ name: 'id' })
  @UseGuards(AuthGuard('jwt'))
  delete(@Param('id') id: string, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.announcementsService.delete(id);
  }
}