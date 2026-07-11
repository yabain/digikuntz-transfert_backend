import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GatewayService } from './gateway.service';
import { CreateGatewayDto } from './create-gateway.dto';
import { UpdateGatewayDto } from './update-gateway.dto';
import { multerConfigForGateway, generateFileUrl } from '../multer.config';

@ApiTags('Gateway')
@Controller('gateways')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async create(@Body() dto: CreateGatewayDto, @Req() req): Promise<any> {
    if (!req.user.isAdmin) return 'Unauthorized';
    return this.gatewayService.create(dto);
  }

  @Get()
  async findAll(): Promise<any> {
    return this.gatewayService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<any> {
    return this.gatewayService.findById(id);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGatewayDto,
    @Req() req,
  ): Promise<any> {
    if (!req.user.isAdmin) return 'Unauthorized';
    return this.gatewayService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async remove(@Param('id') id: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) return 'Unauthorized';
    await this.gatewayService.remove(id);
    return { message: 'Gateway deleted successfully' };
  }

  @Post('upload-image')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('image', multerConfigForGateway))
  async uploadImage(@UploadedFile() file: Express.Multer.File, @Req() req): Promise<any> {
    if (!req.user.isAdmin) return 'Unauthorized';
    if (!file) throw new BadRequestException('No file uploaded');
    return { imageUrl: generateFileUrl(file.filename) };
  }
}
