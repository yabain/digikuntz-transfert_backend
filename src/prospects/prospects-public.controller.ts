import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ProspectsService } from './prospects.service';
import { CreateProspectDto, UpdateProspectDto } from './dto/prospect.dto';

@ApiTags('prospects')
@Controller('prospects')
export class ProspectsPublicController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Post('subscribe')
  @ApiOperation({
    summary: 'Inscription publique à la newsletter digiKUNTZ Payments',
  })
  @ApiBody({ type: CreateProspectDto })
  @ApiResponse({ status: 201, description: 'Prospect inscrit' })
  @ApiResponse({ status: 400, description: 'Email ou téléphone déjà existant' })
  subscribe(@Body() dto: CreateProspectDto) {
    return this.prospectsService.create(dto);
  }
}