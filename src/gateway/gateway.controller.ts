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
  // SÉCURITÉ : `GatewayService.findAll()` renvoie les credentials DÉCHIFFRÉS
  // (clé secrète + hash de webhook) et, pour les passerelles M-Pesa, le
  // `balance` encaissé. L'accès est donc authentifié : seuls les appels
  // authentifiés sont servis, et un non-administrateur ne reçoit qu'une
  // projection publique (voir `scrubGateway`). Les pages de paiement publiques
  // d'une facture lisent, elles, `/payment-methods` (liste de méthodes
  // affichables), pas cet endpoint.
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async findAll(@Req() req: unknown): Promise<any> {
    const gateways = await this.gatewayService.findAll();

    return GatewayController.isAdminRequest(req)
      ? gateways
      : GatewayController.scrubCredentials(gateways);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async findById(@Param('id') id: string, @Req() req: unknown): Promise<any> {
    const gateway = await this.gatewayService.findById(id);

    return GatewayController.isAdminRequest(req)
      ? gateway
      : GatewayController.scrubCredentials(gateway);
  }

  /**
   * Vrai lorsque l'appelant authentifié est un administrateur.
   *
   * Le contrôle est fait sur `unknown` plutôt que sur `any` : `req` vient d'un
   * framework non typé, donc on vérifie la forme au lieu de faire confiance au
   * type. Seul un `isAdmin === true` strict ouvre l'accès.
   *
   * @param {unknown} req - Requête Express.
   * @returns {boolean} - Vrai pour un administrateur.
   */
  private static isAdminRequest(req: unknown): boolean {
    if (req === null || typeof req !== 'object') return false;

    const user = (req as { user?: unknown }).user;
    if (user === null || typeof user !== 'object') return false;

    return (user as { isAdmin?: unknown }).isAdmin === true;
  }

  /**
   * Masque les credentials déchiffrés pour tout appelant non administrateur.
   *
   * Un booléen `hasCredentials` est conservé afin que l'interface puisse indiquer
   * qu'une passerelle est configurée sans jamais exposer les secrets.
   *
   * @param {unknown} payload - Un ou plusieurs documents passerelle.
   * @returns {unknown} - La même forme, credentials retirés.
   */
  private static scrubCredentials(payload: unknown): unknown {
    if (Array.isArray(payload)) {
      return (payload as unknown[]).map((gateway) =>
        GatewayController.scrubGateway(gateway),
      );
    }

    return GatewayController.scrubGateway(payload);
  }

  /**
   * Projette un document passerelle vers sa vue publique (allow-list).
   *
   * On reconstruit explicitement les seuls champs affichables plutôt que de
   * retirer `credentials` : une liste d'exclusion a déjà laissé fuir `balance`
   * (encaisse M-Pesa) pour un appelant non administrateur. Toute donnée ajoutée
   * au schéma est ainsi exclue par défaut.
   *
   * @param {unknown} gateway - Document passerelle brut.
   * @returns {unknown} - La projection publique, sans secret ni trésorerie.
   */
  private static scrubGateway(gateway: unknown): unknown {
    if (gateway === null || typeof gateway !== 'object') return gateway;

    const source = gateway as Record<string, unknown>;
    const credentials = source.credentials;
    const hasCredentials =
      credentials !== null &&
      typeof credentials === 'object' &&
      Object.keys(credentials).length > 0;

    return {
      _id: source._id,
      name: source.name,
      description: source.description,
      imageUrl: source.imageUrl,
      type: source.type,
      currency: source.currency,
      isActive: source.isActive,
      providerCommission: source.providerCommission,
      hasCredentials,
    };
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
