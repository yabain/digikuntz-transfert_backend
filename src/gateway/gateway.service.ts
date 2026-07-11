import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Gateway } from './gateway.schema';
import { CreateGatewayDto } from './create-gateway.dto';
import { UpdateGatewayDto } from './update-gateway.dto';
import { CryptService } from '../dev/crypt.service';

@Injectable()
export class GatewayService {
  constructor(
    @InjectModel(Gateway.name) private gatewayModel: Model<Gateway>,
    private cryptService: CryptService,
  ) {}

  async create(dto: CreateGatewayDto): Promise<Gateway> {
    const encrypted = this.cryptService.encryptWithPassphrase(
      JSON.stringify(dto.credentials),
    );
    const created = new this.gatewayModel({
      ...dto,
      credentials: encrypted,
    });
    return created.save();
  }

  async findAll(): Promise<Gateway[]> {
    const gateways = await this.gatewayModel.find().sort({ createdAt: -1 }).exec();
    return gateways.map((g) => this.decrypt(g));
  }

  async findById(id: string): Promise<Gateway> {
    const gateway = await this.gatewayModel.findById(id).exec();
    if (!gateway) throw new NotFoundException('Gateway not found');
    return this.decrypt(gateway);
  }

  async update(id: string, dto: UpdateGatewayDto): Promise<Gateway> {
    const existing = await this.gatewayModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Gateway not found');

    const updateData: any = { ...dto };
    if (dto.credentials) {
      updateData.credentials = this.cryptService.encryptWithPassphrase(
        JSON.stringify(dto.credentials),
      );
    }
    const updated = await this.gatewayModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Gateway not found');
    return this.decrypt(updated);
  }

  async remove(id: string): Promise<void> {
    const result = await this.gatewayModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Gateway not found');
  }

  private decrypt(gateway: Gateway): Gateway {
    const doc = gateway.toObject ? gateway.toObject() : { ...gateway };
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(doc.credentials);
      (doc as any).credentials = JSON.parse(decrypted);
    } catch {
      (doc as any).credentials = {};
    }
    return doc as Gateway;
  }
}
