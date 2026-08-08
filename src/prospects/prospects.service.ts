/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import * as XLSX from 'xlsx';
import { Prospect } from './prospect.schema';
import { CreateProspectDto, UpdateProspectDto } from './dto/prospect.dto';
import { EmailService } from 'src/email/email.service';

const IMPORT_COLUMNS = ['name', 'email', 'phone'];
const DEFAULT_LIMIT = 25;

@Injectable()
export class ProspectsService {
  constructor(
    @InjectModel(Prospect.name)
    private readonly prospectModel: Model<Prospect>,
    private readonly emailService: EmailService,
  ) {}

  async list(
    page?: number,
    limit?: number,
    keyword?: string,
  ): Promise<{ data: any[]; pagination: Record<string, any> }> {
    const safePage = Number(page) > 0 ? Number(page) : 1;
    const safeLimit =
      Number(limit) > 0 ? Math.min(Number(limit), 100) : DEFAULT_LIMIT;
    const skip = (safePage - 1) * safeLimit;

    const filter: FilterQuery<Prospect> = {};
    if (keyword && String(keyword).trim()) {
      const regex = { $regex: String(keyword).trim(), $options: 'i' };
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const [data, total] = await Promise.all([
      this.prospectModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.prospectModel.countDocuments(filter),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
    return {
      data,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalItems: total,
        hasNextPage: totalPages > 0 && safePage < totalPages,
        hasPrevPage: safePage > 1,
        limit: safeLimit,
      },
    };
  }

  async create(dto: CreateProspectDto) {
    const payload = this.normalizePayload(dto);
    if (!payload.email && !payload.phone) {
      throw new BadRequestException('Email or phone is required');
    }
    await this.ensureNoDuplicate(payload.email, payload.phone);
    const prospect = await this.prospectModel.create(payload);
    this.emailService
      .sendSubscriptionNewsletterEmail(prospect.email, 'en', prospect.name || '')
      .catch((error) => {
        console.warn('Newsletter confirmation email failed:', error?.message || error);
      });
    return prospect;
  }

  async update(id: string, dto: UpdateProspectDto) {
    const existing = await this.prospectModel.findById(id);
    if (!existing) throw new NotFoundException('Prospect not found');

    const payload = this.normalizePayload(dto);
    if (!payload.email && !payload.phone) {
      throw new BadRequestException('Email or phone is required');
    }
    await this.ensureNoDuplicate(payload.email, payload.phone, id);
    const updated = await this.prospectModel.findByIdAndUpdate(id, payload, {
      new: true,
    });
    if (!updated) throw new NotFoundException('Prospect not found');
    return updated;
  }

  async delete(id: string) {
    const deleted = await this.prospectModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Prospect not found');
    return deleted;
  }

  async exportExcel(): Promise<Buffer> {
    const prospects = await this.prospectModel.find().sort({ createdAt: -1 }).lean();
    const rows = prospects.map((prospect) => ({
      name: prospect.name || '',
      email: prospect.email || '',
      phone: prospect.phone || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const headers = ['name', 'email', 'phone'];
    worksheet['!cols'] = headers.map((header) => ({ wch: 28 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prospects');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async downloadTemplate(): Promise<Buffer> {
    const rows = [{ name: 'Exemple Nom', email: 'prospect@email.com', phone: '+2376XXXXXXXX' }];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = ['name', 'email', 'phone'].map((header) => ({ wch: 30 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prospects');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async importExcel(buffer: Buffer) {
    if (!buffer || !buffer.length) {
      throw new BadRequestException('Import file is required');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('Invalid Excel file');
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('Excel file has no sheet');
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[firstSheetName],
      { defval: '', raw: false },
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let ignored = 0;

    for (const row of rows) {
      const payload = this.normalizeImportRow(row);
      if (!payload.email && !payload.phone) {
        ignored += 1;
        continue;
      }

      const existingByEmail = payload.email
        ? await this.prospectModel.findOne({ email: payload.email })
        : null;
      const existingByPhone = payload.phone
        ? await this.prospectModel.findOne({ phone: payload.phone })
        : null;
      const existing =
        existingByEmail && existingByPhone &&
        String(existingByEmail._id) !== String(existingByPhone._id)
          ? null
          : existingByEmail || existingByPhone;

      if (existing) {
        const patch: Partial<Prospect> = {};
        if (!existing.name && payload.name) patch.name = payload.name;
        if (!existing.email && payload.email) patch.email = payload.email;
        if (!existing.phone && payload.phone) patch.phone = payload.phone;
        if (Object.keys(patch).length) {
          await this.prospectModel.updateOne(
            { _id: existing._id },
            { $set: patch },
          );
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      try {
        await this.prospectModel.create(payload);
        created += 1;
      } catch {
        skipped += 1;
      }
    }

    return { totalRows: rows.length, created, updated, skipped, ignored };
  }

  async removeMatchingProspect(email?: string, phone?: string) {
    const filters: any[] = [];
    if (email) filters.push({ email });
    if (phone) filters.push({ phone });
    if (!filters.length) return;
    await this.prospectModel.deleteMany({ $or: filters });
  }

  async findAllRecipients(): Promise<any[]> {
    return this.prospectModel.find({
      $or: [
        { email: { $exists: true, $ne: '' } },
        { phone: { $exists: true, $ne: '' } },
      ],
    });
  }

  private normalizePayload(dto: CreateProspectDto | UpdateProspectDto) {
    return {
      name: String(dto.name || '').trim(),
      email: this.normalizeEmail(dto.email),
      phone: this.normalizePhone(dto.phone),
    };
  }

  private normalizeEmail(email?: string) {
    return String(email || '').trim().toLowerCase();
  }

  private normalizePhone(phone?: string) {
    const value = String(phone || '').trim();
    if (!value) return '';
    if (value.startsWith('+')) return value;
    return `+${value}`;
  }

  private normalizeImportRow(row: Record<string, unknown>) {
    return {
      name: this.cell(row, 'name'),
      email: this.normalizeEmail(this.cell(row, 'email')),
      phone: this.normalizePhone(this.cell(row, 'phone')),
    };
  }

  private cell(row: Record<string, unknown>, column: string) {
    const key = Object.keys(row).find(
      (item) => item.trim().toLowerCase() === column,
    );
    return key ? String(row[key] || '').trim() : '';
  }

  private async ensureNoDuplicate(
    email?: string,
    phone?: string,
    excludeId?: string,
  ) {
    const filters: any[] = [];
    if (email) filters.push({ email });
    if (phone) filters.push({ phone });
    if (!filters.length) return;
    const duplicate = await this.prospectModel.exists({
      $or: filters,
      _id: { $ne: excludeId },
    });
    if (duplicate) {
      throw new BadRequestException(
        'A prospect already exists with this email or phone',
      );
    }
  }
}