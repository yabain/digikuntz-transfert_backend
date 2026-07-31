import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InvoiceService } from './invoice.service';
import {
  CreateInvoiceDto,
  InitiateInvoicePaymentDto,
  UpdateInvoiceDto,
} from './invoice.dto';

@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  create(@Body() dto: CreateInvoiceDto, @Req() req: any) {
    return this.invoiceService.create(req.user._id, dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async list(@Req() req: any) {
    const [data, stats] = await Promise.all([
      this.invoiceService.findAllForUser(req.user._id),
      this.invoiceService.getStats(req.user._id),
    ]);
    return { data, stats };
  }

  @Get('meta')
  @UseGuards(AuthGuard('jwt'))
  getMeta(@Req() req: any) {
    return this.invoiceService.getPaymentMetaForUser(req.user._id);
  }

  @Get(':id')
  getPublic(@Param('id') id: string) {
    return this.invoiceService.getPublic(id);
  }

  @Get('mine/:id')
  @UseGuards(AuthGuard('jwt'))
  getOwn(@Param('id') id: string, @Req() req: any) {
    return this.invoiceService.findByIdForUser(req.user._id, id);
  }

  @Get(':id/transactions')
  @UseGuards(AuthGuard('jwt'))
  getTransactions(@Param('id') id: string, @Req() req: any) {
    return this.invoiceService.findTransactionsForUser(req.user._id, id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @Req() req: any) {
    return this.invoiceService.update(req.user._id, id, dto);
  }

  @Post(':id/archive')
  @UseGuards(AuthGuard('jwt'))
  archive(@Param('id') id: string, @Req() req: any) {
    return this.invoiceService.archive(req.user._id, id);
  }

  @Post(':id/pay')
  @HttpCode(200)
  @UsePipes(ValidationPipe)
  initiatePayment(@Param('id') id: string, @Body() dto: InitiateInvoicePaymentDto) {
    return this.invoiceService.initiatePayment(id, dto);
  }
}
