import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { CreateDonationDto } from './create-donation.dto';
import { CreateFundraisingDto } from './create-fundraising.dto';
import { FundraisingService } from './fundraising.service';
import { UpdateFundraisingDto } from './update-fundraising.dto';
import { UpdateFundraisingStatusDto } from './update-fundraising-status.dto';
import { UpdateFundraisingVisibilityDto } from './update-fundraising-visibility.dto';

@ApiTags('fundraising')
@Controller('fundraising')
export class FundraisingController {
  constructor(
    private readonly fundraisingService: FundraisingService,
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a fundraising campaign' })
  @ApiBody({ type: CreateFundraisingDto })
  @ApiResponse({ status: 201, description: 'Fundraising created.' })
  @ApiResponse({ status: 400, description: 'Invalid payload (date/currency/amount).' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createFundraising(@Req() req, @Body() data: CreateFundraisingDto) {
    return this.fundraisingService.createFundraising(String(req.user._id), data);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all fundraisings (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated fundraising list.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllSystem(@Req() req, @Query() query: any) {
    if (!req.user?.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fundraisingService.getAllSystem(query);
  }

  @Get('my/list')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user fundraising list' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated fundraising list.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyFundraisings(@Req() req, @Query() query: any) {
    return this.fundraisingService.getUserFundraisings(String(req.user._id), query);
  }

  @Get('my/active')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user active fundraising list' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated active fundraising list.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyActiveFundraisings(@Req() req, @Query() query: any) {
    return this.fundraisingService.getUserActiveFundraisings(String(req.user._id), query);
  }

  @Get('user/:userId/list')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get fundraising list of a user (owner/admin)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated user fundraising list.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUserFundraisings(
    @Req() req,
    @Param('userId') userId: string,
    @Query() query: any,
  ) {
    if (!req.user?.isAdmin && String(req.user?._id) !== String(userId)) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fundraisingService.getUserFundraisings(userId, query);
  }

  @Get('user/:userId/active')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active fundraising list of a user (owner/admin)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated active user fundraising list.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUserActiveFundraisings(
    @Req() req,
    @Param('userId') userId: string,
    @Query() query: any,
  ) {
    if (!req.user?.isAdmin && String(req.user?._id) !== String(userId)) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fundraisingService.getUserActiveFundraisings(userId, query);
  }

  @Get('user/:userId/active-public')
  @ApiOperation({ summary: 'Get active public fundraising list of a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated active public list.' })
  @UsePipes(ValidationPipe)
  async getUserActivePublicFundraisings(
    @Param('userId') userId: string,
    @Query() query: any,
  ) {
    return this.fundraisingService.getUserActivePublicFundraisings(userId, query);
  }

  @Get('donations/stats/total')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get total donations count (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Total donations in database.',
    schema: {
      example: {
        totalDonations: 240,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getTotalDonations(@Req() req) {
    if (!req.user?.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fundraisingService.getTotalDonationsCount();
  }

  @Get(':id/donations/stats')
  @ApiOperation({ summary: 'Get donations statistics of a fundraising campaign' })
  @ApiParam({ name: 'id', description: 'Fundraising ID' })
  @ApiResponse({
    status: 200,
    description: 'Donation stats for fundraising.',
    schema: {
      example: {
        fundraisingId: '65f0aa12d4b1c2f1a8a4f010',
        fundraisingTitle: 'Help school project',
        currency: 'XAF',
        totalDonations: 25,
        totalAmount: 245000,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Fundraising not found.' })
  @UsePipes(ValidationPipe)
  async getFundraisingDonationStats(@Param('id') fundraisingId: string) {
    return this.fundraisingService.getFundraisingDonationStats(fundraisingId);
  }

  @Get(':id/donations')
  @ApiOperation({
    summary:
      'Get paginated donations list of a fundraising with full populated relations',
  })
  @ApiParam({ name: 'id', description: 'Fundraising ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated populated donation list.' })
  @ApiResponse({ status: 404, description: 'Fundraising not found.' })
  @UsePipes(ValidationPipe)
  async getFundraisingDonations(
    @Param('id') fundraisingId: string,
    @Query() query: any,
  ) {
    return this.fundraisingService.getFundraisingDonationsPaginated(
      fundraisingId,
      query,
    );
  }

  @Get('user/:userId/donations/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get donation statistics of a user (owner/admin)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Donation statistics returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUserDonationStats(@Req() req, @Param('userId') userId: string) {
    if (!req.user?.isAdmin && String(req.user?._id) !== String(userId)) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fundraisingService.getUserDonationStats(userId);
  }

  @Get('donations/:donationId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a donation by id with populated relations' })
  @ApiParam({ name: 'donationId', description: 'Donation ID' })
  @ApiResponse({ status: 200, description: 'Donation details returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'Donation not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getDonationDetails(@Param('donationId') donationId: string) {
    return this.fundraisingService.getDonationDetails(donationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fundraising details by ID' })
  @ApiParam({ name: 'id', description: 'Fundraising ID' })
  @ApiResponse({ status: 200, description: 'Fundraising returned.' })
  @ApiResponse({ status: 404, description: 'Fundraising not found.' })
  @UsePipes(ValidationPipe)
  async getById(@Param('id') id: string) {
    return this.fundraisingService.findById(id);
  }

  @Put(':id/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update fundraising active status (owner/admin)' })
  @ApiParam({ name: 'id', description: 'Fundraising ID' })
  @ApiBody({ type: UpdateFundraisingStatusDto })
  @ApiResponse({ status: 200, description: 'Status updated.' })
  @ApiResponse({ status: 400, description: 'Invalid status payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Fundraising not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() body: UpdateFundraisingStatusDto,
  ) {
    return this.fundraisingService.updateStatus(String(req.user._id), id, body.status);
  }

  @Put(':id/visibility')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update fundraising visibility (owner/admin)' })
  @ApiParam({ name: 'id', description: 'Fundraising ID' })
  @ApiBody({ type: UpdateFundraisingVisibilityDto })
  @ApiResponse({ status: 200, description: 'Visibility updated.' })
  @ApiResponse({ status: 400, description: 'Invalid visibility payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Fundraising not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateVisibility(
    @Req() req,
    @Param('id') id: string,
    @Body() body: UpdateFundraisingVisibilityDto,
  ) {
    return this.fundraisingService.updateVisibility(
      String(req.user._id),
      id,
      body.visibility,
    );
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update fundraising data (owner/admin)' })
  @ApiParam({ name: 'id', description: 'Fundraising ID' })
  @ApiBody({ type: UpdateFundraisingDto })
  @ApiResponse({ status: 200, description: 'Fundraising updated.' })
  @ApiResponse({ status: 400, description: 'Invalid update payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Fundraising not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateFundraising(
    @Req() req,
    @Param('id') id: string,
    @Body() body: UpdateFundraisingDto,
  ) {
    return this.fundraisingService.updateFundraising(String(req.user._id), id, body);
  }

  @Post(':id/donate')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a donation payin for a fundraising campaign',
    description:
      'Initializes donation transaction and creates a Flutterwave payin link/session.',
  })
  @ApiParam({ name: 'id', description: 'Fundraising ID' })
  @ApiBody({ type: CreateDonationDto })
  @ApiResponse({ status: 201, description: 'Donation payin initialized.' })
  @ApiResponse({ status: 400, description: 'Invalid donation payload or fundraising unavailable.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'Fundraising/user not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async donate(
    @Req() req,
    @Param('id') fundraisingId: string,
    @Body() body: CreateDonationDto,
  ) {
    const transactionData = await this.fundraisingService.buildDonationTransactionData(
      fundraisingId,
      String(req.user._id),
      body,
    );
    return this.flutterwaveService.createPayin(transactionData, String(req.user._id));
  }
}
