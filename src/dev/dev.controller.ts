/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Controller,
  Get,
  Post,
  Req,
  ValidationPipe,
  UseGuards,
  UsePipes,
  NotFoundException,
  Param,
  Body,
  Put,
} from '@nestjs/common';
import { Dev } from './dev.schema';
import { DevService } from './dev.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from 'src/user/user.service';
import { SystemService } from 'src/system/system.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { TransactionService } from 'src/transaction/transaction.service';

@ApiTags('dev')
@Controller('dev')
export class DevController {
  constructor(
    private devService: DevService,
    private userService: UserService,
    private systemService: SystemService,
    private fwService: FlutterwaveService,
    private transactionService: TransactionService,
  ) { }

  @Get('api-keys/:userId')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getData(@Req() req, @Param('userId') userId): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.devService.getDevDataByUserId(userId);
  }

  @Post('api-keys')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createDevData(
    @Req() req, 
    @Body() data): Promise<any> {
    data.userId = req.user._id.toString();
    data.secretKey = this.devService.generateKey('SK');
    data.publicKey = this.devService.generateKey('PK');
    return this.devService.createDevData(req.user._id, data);
  }

  @Put('api-keys/:publicKey')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateDevData(@Req() req, @Body() data, @Param('publicKey') publicKey): Promise<any> {
    const auth = await this.devService.authKey(req.user._id, publicKey, false);
    data.userId = req.user._id.toString();
    return this.devService.updateDevData(req.user._id, data);
  }

  @Get('transaction/:userId/:secretKey')
  @UsePipes(ValidationPipe)
  async getTransactionData(
    @Param('userId') userId: string,
    @Param('secretKey') secretKey: string,
    @Body() data: any,
  ): Promise<any> {
    if (!secretKey) {
      throw new NotFoundException('secretKey is required');
    }
    if (!userId) {
      throw new NotFoundException('userId is required');
    }
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
    return this.devService.getTransactionData(data.transactionId, userId);
  }

  @Post('transaction/:userId/:secretKey')
  @UsePipes(ValidationPipe)
  async createPayinTransaction(
    @Param('userId') userId: string,
    @Param('secretKey') secretKey: string,
    @Body() data: {
      estimation: number,
      raisonForTransfer: string,
      userEmail: string,
      userPhone: string,
      userCountry: string,
      senderName: string,
    },
  ): Promise<any> {
    if (!secretKey) {
      throw new NotFoundException('secretKey is required');
    }
    if (!userId) {
      throw new NotFoundException('userId is required');
    }
    console.log("data: ", data);
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
    const userData = await this.userService.getUserById(userId);
    if (!userData) return 'user not found';
    const transactionData = {
      transactionRef: this.transactionService.generateInRef(),
      estimation: data.estimation,
      transactionType: 'apiCall',
      receiverId: userData._id.toString(),
      raisonForTransfer: data.raisonForTransfer,

      senderId: userData._id.toString(),
      senderName: 'API Call: ' + data.senderName,
      senderEmail: data.userEmail,
      senderContact: data.userPhone,
      senderCountry: data.userCountry,
      senderCurrency: userData.countryId.currency,

      receiverName: this.userService.showName(userData),
      receiverEmail: userData.email,
      receiverContact: userData.phone,
      receiverCountry: userData.countryId.name,
      receiverCurrency: userData.countryId.currency,

      status: 'transaction_payin_pending'
    }

    return this.devService.createPayinTransaction(transactionData, userId)
  }
  

}
