import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CreatePaymentMethodDto } from './create-payment-method.dto';
import { UpdatePaymentMethodDto } from './update-payment-method.dto';
import { PaymentMethod } from './payment-method.schema';

@Injectable()
export class PaymentMethodService {
  constructor(
    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: mongoose.Model<PaymentMethod>,
  ) {}

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    if (Number(dto.minAmount) > Number(dto.maxAmount)) {
      throw new NotFoundException('minAmount cannot be greater than maxAmount');
    }
    return this.paymentMethodModel.create(dto);
  }

  async findAll(query: Query): Promise<PaymentMethod[]> {
    const resPerPage = Number((query as any)?.limit) > 0 ? Number((query as any).limit) : 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          name: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};

    const countryId = String((query as any)?.countryId || '').trim();
    const provider = String((query as any)?.provider || '').trim();
    const filter: any = { ...keyword };
    if (countryId) filter.countryId = countryId;
    if (provider) filter.provider = provider;

    return this.paymentMethodModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(resPerPage)
      .skip(skip)
      .populate('countryId');
  }

  async findById(id: string): Promise<PaymentMethod> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid payment method ID');
    }
    const paymentMethod = await this.paymentMethodModel
      .findById(id)
      .populate('countryId');
    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }
    return paymentMethod;
  }

  async findByCountryAndProvider(
    countryId: string,
    provider: string,
  ): Promise<PaymentMethod[]> {
    return this.paymentMethodModel
      .find({ countryId, provider })
      .sort({ name: 1 })
      .populate('countryId');
  }

  async findByCountry(
    countryId: string,
  ): Promise<PaymentMethod[]> {
    return this.paymentMethodModel
      .find({ countryId })
      .sort({ name: 1 })
      .populate('countryId');
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethod> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid payment method ID');
    }
    if (
      dto.minAmount !== undefined &&
      dto.maxAmount !== undefined &&
      Number(dto.minAmount) > Number(dto.maxAmount)
    ) {
      throw new NotFoundException('minAmount cannot be greater than maxAmount');
    }

    const updated = await this.paymentMethodModel.findByIdAndUpdate(id, dto, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      throw new NotFoundException('Payment method not found');
    }
    return updated;
  }

  async remove(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid payment method ID');
    }
    const deleted = await this.paymentMethodModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('Payment method not found');
    }
    return deleted;
  }
}

