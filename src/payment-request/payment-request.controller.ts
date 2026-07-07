import {
  Body,
  Controller,
  Get,ForbiddenException,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreatePaymentRequestDto } from './create-payment-request.dto';
import { PaymentRequestService } from './payment-request.service';

@ApiTags('payment-request')
@Controller('payment-request')
export class PaymentRequestController {
  constructor(private readonly paymentRequestService: PaymentRequestService) {}

  @Get('stats')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all payment request stats (admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'System-wide payment request stats.',
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllPaymentRequestStats(@Req() req) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.paymentRequestService.getAllPaymentRequestStats();
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all payment requests in the system (admin only, newest first)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Paginated system payment request list (newest to oldest).',
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllPaymentRequests(@Req() req, @Query() query: any) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.paymentRequestService.getAllSystemPaymentRequests(query);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a mobile money payment request for current user (XAF/NGN via Flutterwave, KES via M-Pesa)',
  })
  @ApiBody({ type: CreatePaymentRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Payment request initialized successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid payload or unsupported currency.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createPaymentRequest(@Req() req, @Body() dto: CreatePaymentRequestDto) {
    return this.paymentRequestService.createCurrentUserPaymentRequest(
      String(req.user._id),
      dto,
    );
  }

  @Get('my/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my payment request stats' })
  @ApiResponse({
    status: 200,
    description: 'Payment request stats (total, pending, success, canceled, failed).',
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyPaymentRequestStats(@Req() req) {
    return this.paymentRequestService.getMyPaymentRequestStats(String(req.user._id));
  }

  @Get('my')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my payment requests (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Paginated payment requests list.',
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyPaymentRequests(@Req() req, @Query() query: any) {
    return this.paymentRequestService.getMyPaymentRequests(
      String(req.user._id),
      query,
    );
  }
}
