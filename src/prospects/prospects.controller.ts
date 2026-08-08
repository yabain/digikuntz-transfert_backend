/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProspectsService } from './prospects.service';
import { CreateProspectDto, UpdateProspectDto } from './dto/prospect.dto';

@ApiTags('prospects (admin)')
@Controller('prospects')
export class ProspectsController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les prospects (admin)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des prospects' })
  @UseGuards(AuthGuard('jwt'))
  async list(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('keyword') keyword?: string,
  ) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.prospectsService.list(page, limit, keyword);
  }

  @Get('template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Télécharger le modèle d’import Excel' })
  @UseGuards(AuthGuard('jwt'))
  async downloadTemplate(@Res() response: Response, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    const buffer = await this.prospectsService.downloadTemplate();
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="prospects-modele.xlsx"',
    );
    response.setHeader('Content-Length', buffer.length);
    response.end(buffer);
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exporter tous les prospects en Excel (admin)' })
  @UseGuards(AuthGuard('jwt'))
  async export(@Res() response: Response, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    const buffer = await this.prospectsService.exportExcel();
    const date = new Date().toISOString().slice(0, 10);
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="prospects-${date}.xlsx"`,
    );
    response.setHeader('Content-Length', buffer.length);
    response.end(buffer);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter un prospect (admin)' })
  @ApiBody({ type: CreateProspectDto })
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateProspectDto, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.prospectsService.create(dto);
  }

  @Post('import')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importer des prospects depuis un fichier Excel' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Fichier .xlsx avec les colonnes name, email, phone',
        },
      },
      required: ['file'],
    },
  })
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.prospectsService.importExcel(file?.buffer);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier un prospect (admin)' })
  @UseGuards(AuthGuard('jwt'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProspectDto,
    @Req() req: any,
  ) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.prospectsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un prospect (admin)' })
  @UseGuards(AuthGuard('jwt'))
  delete(@Param('id') id: string, @Req() req: any) {
    if (!req.user?.isAdmin) throw new BadRequestException('Unauthorised');
    return this.prospectsService.delete(id);
  }
}