import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
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
import { Query as ExpressQuery } from 'express-serve-static-core';
import { CreatePaymentMethodDto } from './create-payment-method.dto';
import { UpdatePaymentMethodDto } from './update-payment-method.dto';
import { PaymentMethod } from './payment-method.schema';
import { PaymentMethodService } from './payment-method.service';

@ApiTags('payment-methods')
@Controller('payment-methods')
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a payment method' })
  @ApiBody({ type: CreatePaymentMethodDto })
  @ApiResponse({ status: 201, description: 'Payment method created.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async create(@Body() dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    return this.paymentMethodService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Get payment methods (paginated, default 10 items, most recent first)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  @ApiQuery({ name: 'countryId', required: false, type: String })
  @ApiQuery({ name: 'provider', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Payment methods list returned.' })
  async findAll(@Query() query: ExpressQuery): Promise<PaymentMethod[]> {
    return this.paymentMethodService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment method by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Payment method returned.' })
  async findById(@Param('id') id: string): Promise<PaymentMethod> {
    return this.paymentMethodService.findById(id);
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update payment method by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdatePaymentMethodDto })
  @ApiResponse({ status: 200, description: 'Payment method updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.paymentMethodService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete payment method by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Payment method deleted.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async remove(@Param('id') id: string): Promise<any> {
    return this.paymentMethodService.remove(id);
  }
}

