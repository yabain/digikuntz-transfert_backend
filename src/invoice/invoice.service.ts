import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { extname, join } from 'path';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { Transaction, TransactionType, TStatus } from 'src/transaction/transaction.schema';
import { UserService } from 'src/user/user.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { SystemService } from 'src/system/system.service';
import { PaymentMethodService } from 'src/payment-method/payment-method.service';
import { Payin } from 'src/payin/payin.schema';
import { Invoice, InvoiceItem, InvoiceStatus } from './invoice.schema';
import { CreateInvoiceDto, UpdateInvoiceDto } from './invoice.dto';
import { EmailService } from 'src/email/email.service';

export interface InvoiceStats {
  total: number;
  pending: number;
  payed: number;
  disabled: number;
  drafts: number;
}

@Injectable()
export class InvoiceService {
  constructor(
    @InjectModel(Invoice.name)
    private readonly invoiceModel: mongoose.Model<Invoice>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: mongoose.Model<Transaction>,
    @InjectModel(Payin.name)
    private readonly payinModel: mongoose.Model<Payin>,
    private readonly userService: UserService,
    private readonly systemService: SystemService,
    private readonly paymentMethodService: PaymentMethodService,
    @Inject(forwardRef(() => FlutterwaveService))
    private readonly flutterwaveService: FlutterwaveService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  async create(userId: string, dto: CreateInvoiceDto): Promise<Invoice> {
    const user = await this.userService.getUserById(userId);
    const currency = user?.countryId?.currency || 'XAF';
    const items = this.normalizeItems(dto.items || []);
    if (!items.length) {
      throw new BadRequestException('Invoice must contain at least one line item.');
    }

    const totalAmount = this.computeTotal(items);
    await this.validateMinAmount(totalAmount, currency);

    const invoice = await this.invoiceModel.create({
      userId,
      name: dto.name,
      currency,
      items,
      totalAmount,
      invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
      status: InvoiceStatus.DRAFT,
      payed: false,
    });

    this.auditLogService.record({
      actorId: String(userId),
      actorEmail: user?.email,
      actorRole: user?.isAdmin ? 'admin' : user?.accountType || 'user',
      action: 'invoice.created',
      resourceType: 'invoice',
      resourceId: String(invoice._id),
      resourceLabel: this.label(invoice),
      method: 'POST',
      path: '/invoices',
      statusCode: 201,
      metadata: { status: invoice.status, totalAmount: invoice.totalAmount, currency: invoice.currency },
    });

    return invoice;
  }

  async findAllForUser(userId: string): Promise<Invoice[]> {
    const invoices = await this.invoiceModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    const configCache = new Map<string, number>();
    return Promise.all(
      invoices.map(async (invoice: any) => {
        const currency = invoice.currency || 'XAF';
        if (!configCache.has(currency)) {
          const { feesPercent } = await this.getPaymentConfig(currency);
          configCache.set(currency, feesPercent);
        }
        const feesPercent = configCache.get(currency) || 0;
        const feesAmount = Math.ceil((Number(invoice.totalAmount) * feesPercent) / 100);
        return {
          ...invoice,
          feesPercent,
          feesAmount,
          amountToPay: Number(invoice.totalAmount) + feesAmount,
        };
      }),
    );
  }

  async getStats(userId: string): Promise<InvoiceStats> {
    const [total, pending, payed, disabled, drafts] = await Promise.all([
      this.invoiceModel.countDocuments({ userId }),
      this.invoiceModel.countDocuments({ userId, payed: false, status: { $in: [InvoiceStatus.COMPLETED, InvoiceStatus.PAYING] } }),
      this.invoiceModel.countDocuments({ userId, payed: true }),
      this.invoiceModel.countDocuments({ userId, status: InvoiceStatus.ARCHIVED }),
      this.invoiceModel.countDocuments({ userId, status: InvoiceStatus.DRAFT }),
    ]);
    return { total, pending, payed, disabled, drafts };
  }

  async findByIdForUser(userId: string, invoiceId: string): Promise<any> {
    const invoice = await this.invoiceModel.findOne({ _id: this.toObjectId(invoiceId), userId }).lean();
    if (!invoice) throw new NotFoundException('Invoice not found');
    const fees = await this.computeFees(invoice.totalAmount, invoice.currency);
    return {
      ...invoice,
      feesPercent: fees.percent,
      feesAmount: fees.amount,
      amountToPay: fees.amountToPay,
    };
  }

  async getPublic(invoiceId: string): Promise<any> {
    const invoice = await this.invoiceModel.findById(this.toObjectId(invoiceId)).lean();
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.ARCHIVED) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status !== InvoiceStatus.PAYED && invoice.transactionId) {
      await this.repairStuckInvoice(invoice);
    }
    const current = await this.invoiceModel.findById(this.toObjectId(invoiceId)).lean();
    const live = current ?? invoice;
    const fees = await this.computeFees(live.totalAmount, live.currency);
    return {
      ...this.publicView(live),
      owner: await this.getPublicOwner(live.userId),
      feesPercent: fees.percent,
      feesAmount: fees.amount,
      amountToPay: fees.amountToPay,
    };
  }

  /**
   * Auto-réparation : si la transaction liée est déjà réussie mais que la
   * facture n'a pas été marquée payée (échec antérieur du webhook/cron),
   * la finalise immédiatement à l'ouverture de la page publique.
   */
  private async repairStuckInvoice(invoice: any): Promise<void> {
    try {
      const transaction = await this.transactionModel
        .findById(invoice.transactionId)
        .lean();
      if (transaction?.status === TStatus.PAYINSUCCESS) {
        await this.handlePaymentSuccess(transaction);
      }
    } catch {
      // Non bloquant : la page publique s'affiche même si la réparation échoue.
    }
  }

  private async getPublicOwner(userId: string): Promise<Record<string, any> | null> {
    try {
      const user = await this.userService.getUserById(userId);
      if (!user) return null;
      return {
        name: user.name || '',
        pictureUrl: user.pictureUrl || '',
        pictureData: await this.readPictureData(user.pictureUrl || ''),
        email: user.email || '',
        phone: user.phone || '',
        phone2: user.phone2 || '',
        rccm: user.rccm || '',
        niu: user.niu || '',
        website: user.website || '',
        address: user.address || '',
        city: user.cityId?.name || '',
        country: user.countryId?.name || '',
        dialCode: user.countryId?.code || '',
      };
    } catch {
      return null;
    }
  }

  private picturePaths(): string[] {
    const nodeEnv = process.env.NODE_ENV;
    return [
      ...new Set([
        nodeEnv === 'production' ? '/app/assets' : join(process.cwd(), 'public', 'assets'),
        join(process.cwd(), 'public', 'assets'),
        join(process.cwd(), 'assets'),
        '/app/assets',
      ]),
    ];
  }

  private resolvePictureFile(pictureUrl: string): string | null {
    if (!pictureUrl || /^https?:\/\//i.test(pictureUrl)) return null;
    let rel: string | null = null;
    if (pictureUrl.startsWith('/uploads/')) {
      rel = `images/${pictureUrl.slice('/uploads/'.length)}`;
    } else if (pictureUrl.startsWith('/assets/')) {
      rel = pictureUrl.slice('/assets/'.length);
    } else if (pictureUrl.startsWith('/')) {
      rel = pictureUrl.slice(1);
    }
    if (!rel) return null;
    for (const base of this.picturePaths()) {
      const file = join(base, rel);
      if (existsSync(file)) return file;
    }
    return null;
  }

  private async readPictureData(pictureUrl: string): Promise<string | null> {
    const file = this.resolvePictureFile(pictureUrl);
    if (!file) return null;
    try {
      const fileStat = await stat(file);
      if (fileStat.size > 500 * 1024) return null;
      const buf = await readFile(file);
      const mime = extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }

  async findTransactionsForUser(userId: string, invoiceId: string): Promise<Transaction[]> {
    await this.findByIdForUser(userId, invoiceId);
    return this.transactionModel
      .find({ invoiceId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async update(userId: string, invoiceId: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.invoiceModel.findOne({ _id: this.toObjectId(invoiceId), userId });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.payed) throw new ConflictException('A paid invoice cannot be modified.');

    if (dto.name !== undefined) {
      invoice.name = dto.name.trim();
    }
    if (dto.items !== undefined) {
      const items = this.normalizeItems(dto.items);
      if (!items.length) throw new BadRequestException('Invoice must contain at least one line item.');
      invoice.items = items;
      invoice.totalAmount = this.computeTotal(items);
      await this.validateMinAmount(invoice.totalAmount, invoice.currency);
    }
    if (dto.invoiceDate) invoice.invoiceDate = new Date(dto.invoiceDate);

    if (dto.status) {
      this.assertTransition(invoice.status, dto.status);
      invoice.status = dto.status;
      if (dto.status === InvoiceStatus.DRAFT || dto.status === InvoiceStatus.ARCHIVED) {
        invoice.payed = false;
      }
    }

    await invoice.save();

    this.auditLogService.record({
      actorId: String(userId),
      actorRole: 'user',
      action: `invoice.status_${invoice.status}`,
      resourceType: 'invoice',
      resourceId: String(invoice._id),
      resourceLabel: this.label(invoice),
      method: 'PATCH',
      path: `/invoices/${invoiceId}`,
      statusCode: 200,
      metadata: { status: invoice.status, totalAmount: invoice.totalAmount },
    });

    return invoice;
  }

  async archive(userId: string, invoiceId: string): Promise<Invoice> {
    return this.update(userId, invoiceId, { status: InvoiceStatus.ARCHIVED });
  }

  /**
   * Initie le paiement d'une facture (publique, sans authentification).
   * - Si la facture est déjà en cours de paiement (`paying`), on ne crée pas
   *   de nouvelle transaction : on renvoie le même lien de paiement déjà
   *   généré par le gateway pour continuer la tentative en cours.
   * - Sinon, on passe la facture en `paying` et on crée une transaction liée
   *   par `invoiceId` ; le montant facturé au payeur inclut les frais de la
   *   plateforme (`paymentWithTaxes`), mais seul le montant total sans frais
   *   sera crédité dans le solde du bénéficiaire.
   */
  async initiatePayment(
    invoiceId: string,
    payer: { payerName: string; payerPhone: string; payerEmail?: string; redirectUrl?: string },
  ): Promise<any> {
    const invoice = await this.invoiceModel.findById(this.toObjectId(invoiceId));
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.payed) {
      throw new ConflictException('This invoice is already paid.');
    }
    if (invoice.status !== InvoiceStatus.COMPLETED && invoice.status !== InvoiceStatus.PAYING) {
      throw new ConflictException('This invoice is not payable.');
    }

    // Nouvelle tentative pendant qu'un paiement est déjà en cours :
    // on réutilise le lien de paiement existant sans créer de transaction.
    if (invoice.status === InvoiceStatus.PAYING && invoice.transactionId) {
      const existing = await this.transactionModel.findById(invoice.transactionId).lean();
      if (existing) {
        let link = invoice.paymentLink || '';
        if (!link && existing.txRef) {
          const payin = await this.payinModel.findOne({ txRef: existing.txRef }).lean();
          link = payin?.raw?.data?.link || '';
        }
        return {
          status: 'pending',
          reused: true,
          transactionId: String(existing._id),
          txRef: existing.txRef,
          amount: Number(existing.paymentWithTaxes) || invoice.totalAmount,
          currency: existing.senderCurrency || invoice.currency,
          redirect_url: link,
          payerName: invoice.payerName,
          payerPhone: invoice.payerPhone,
          payerEmail: invoice.payerEmail,
        };
      }
    }

    if (invoice.status !== InvoiceStatus.COMPLETED) {
      throw new ConflictException('This invoice is not payable.');
    }

    const owner = await this.userService.getUserById(String(invoice.userId));
    const currency = invoice.currency || owner?.countryId?.currency || 'XAF';

    const transactionData = {
      transactionType: TransactionType.INVOICE,
      invoiceId: String(invoice._id),
      estimation: invoice.totalAmount,
      noFees: false,
      senderCurrency: currency,
      receiverCurrency: currency,
      senderName: payer.payerName || 'Client',
      senderContact: payer.payerPhone || '',
      senderEmail: payer.payerEmail || `${String(invoice._id)}@invoice.digikuntz.com`,
      receiverId: String(invoice.userId),
      receiverName: owner?.name || owner?.firstName || owner?.lastName || 'Merchant',
      receiverEmail: owner?.email || '',
      receiverContact: owner?.phone || '',
      raisonForTransfer: `Invoice ${String(invoice._id)}`,
      redirectUrl: payer.redirectUrl,
      status: 'transaction_payin_pending',
    };

    const payinResult = await this.flutterwaveService.createPayin(transactionData, undefined) as any;

    invoice.status = InvoiceStatus.PAYING;
    invoice.paymentStartedAt = new Date();
    invoice.paymentLink = payinResult?.redirect_url || payinResult?.link || payinResult?.url || '';
    invoice.transactionId = payinResult?.transactionId || undefined;
    invoice.payerName = payer.payerName;
    invoice.payerPhone = payer.payerPhone;
    invoice.payerEmail = payer.payerEmail || undefined;
    await invoice.save();

    this.auditLogService.record({
      actorRole: 'guest',
      action: 'invoice.payment_initiated',
      resourceType: 'invoice',
      resourceId: String(invoice._id),
      resourceLabel: this.label(invoice),
      method: 'POST',
      path: `/invoices/${invoiceId}/pay`,
      statusCode: 200,
      metadata: { payerName: payer.payerName, payerPhone: payer.payerPhone, status: invoice.status },
    });

    return {
      ...payinResult,
      payerName: invoice.payerName,
      payerPhone: invoice.payerPhone,
      payerEmail: invoice.payerEmail,
    };
  }

  /**
   * Appelé par le webhook de succès : seule cette étape marque la facture payée
   * et enregistre les informations du payeur issues de la transaction.
   */
  async handlePaymentSuccess(transaction: any): Promise<void> {
    const invoice = await this.invoiceModel.findById(transaction?.invoiceId);
    if (!invoice || invoice.payed) return;

    invoice.status = InvoiceStatus.PAYED;
    invoice.payed = true;
    invoice.paymentDate = new Date();
    invoice.paymentStartedAt = undefined;
    invoice.transactionId = String(transaction._id);
    invoice.payerName = transaction.senderName;
    invoice.payerPhone = transaction.senderContact;
    if (!this.isPlaceholderPayerEmail(transaction.senderEmail)) {
      invoice.payerEmail = transaction.senderEmail;
    }
    await invoice.save();

    this.auditLogService.record({
      actorRole: 'guest',
      action: 'invoice.payed',
      resourceType: 'invoice',
      resourceId: String(invoice._id),
      resourceLabel: this.label(invoice),
      statusCode: 200,
      metadata: {
        transactionId: String(transaction._id),
        payerName: invoice.payerName,
        payerPhone: invoice.payerPhone,
        paymentDate: invoice.paymentDate,
      },
    });

    await this.notifyPaymentSuccess(invoice, transaction);
  }

  /**
   * Email de secours généré pour satisfaire l'exigence Flutterwave d'un
   * email client ; il ne doit jamais être persisté sur la facture ni envoyé.
   */
  private isPlaceholderPayerEmail(email?: string): boolean {
    return typeof email === 'string' && email.endsWith('@invoice.digikuntz.com');
  }

  /**
   * Notifie par email le payeur (si son email réel est connu) et le
   * propriétaire de la facture après un paiement réussi.
   */
  private async notifyPaymentSuccess(invoice: any, transaction: any): Promise<void> {
    try {
      const owner = await this.userService.getUserById(String(invoice.userId)).catch(() => null);
      const payerEmail = invoice.payerEmail;
      const ownerEmail = owner?.email;

      const txData = {
        _id: invoice._id,
        totalAmount: Number(invoice.totalAmount) || 0,
        currency: invoice.currency,
        txRef: transaction?.txRef || transaction?.transactionRef,
        transactionDate: invoice.paymentDate || new Date(),
      };

      if (payerEmail) {
        await this.emailService.sendInvoicePaidEmail(
          { name: invoice.payerName || 'Client', email: payerEmail },
          txData,
        );
      }
      if (ownerEmail) {
        await this.emailService.sendInvoicePaidEmail(
          {
            name: owner?.name || owner?.firstName || owner?.lastName || 'Client',
            email: ownerEmail,
            language: owner?.language,
          },
          txData,
        );
      }
    } catch (err) {
      console.warn('Erreur envoi notification facture payée :', err);
    }
  }

  /**
   * Configuration de paiement d'une devise : montant minimal et pourcentage
   * de frais de plateforme (paramètre système `invoiceTaxes`).
   * Le montant minimal provient des méthodes de paiement actives en
   * encaissement (`statusPayin`) de la devise ; en l'absence de méthode,
   * on retombe sur les limites système `transactionLimits.minDeposit`.
   */
  async getPaymentConfig(currency: string): Promise<{ minAmount: number; feesPercent: number }> {
    const [system, methods] = await Promise.all([
      this.systemService.getSystemData(),
      this.paymentMethodService.findAll({ limit: 1000 } as any),
    ]);

    const currencyMethods = (methods || []).filter(
      (m: any) => m.currency === currency && m.statusPayin && m.minAmount != null,
    );
    let minAmount = currencyMethods.length
      ? Math.min(...currencyMethods.map((m: any) => Number(m.minAmount) || 0))
      : 0;

    if (!minAmount) {
      const limit = (system?.transactionLimits || []).find((l: any) => l.currency === currency);
      minAmount = Number(limit?.minDeposit) || 0;
    }

    const feesPercent = Number(system?.invoiceTaxes) || 0;
    return { minAmount, feesPercent };
  }

  async getPaymentMetaForUser(userId: string): Promise<{ currency: string; minAmount: number; feesPercent: number }> {
    const user = await this.userService.getUserById(userId);
    const currency = user?.countryId?.currency || 'XAF';
    const { minAmount, feesPercent } = await this.getPaymentConfig(currency);
    return { currency, minAmount, feesPercent };
  }

  private async validateMinAmount(totalAmount: number, currency: string): Promise<void> {
    const { minAmount } = await this.getPaymentConfig(currency);
    if (minAmount > 0 && totalAmount < minAmount) {
      throw new BadRequestException(
        `Invoice amount (${totalAmount}) is below the minimum of ${minAmount} ${currency} for this payment method.`,
      );
    }
  }

  private async computeFees(
    totalAmount: number,
    currency: string,
  ): Promise<{ percent: number; amount: number; amountToPay: number }> {
    const { feesPercent } = await this.getPaymentConfig(currency);
    const amount = Math.ceil((Number(totalAmount) * feesPercent) / 100);
    return { percent: feesPercent, amount, amountToPay: Number(totalAmount) + amount };
  }

  /**
   * Cron (chaque minute) : parcourt les factures en `paying` depuis plus
   * d'une minute (aucun changement d'état de transaction ne les a encore
   * fait évoluer), cherche la dernière transaction de paiement liée et
   * ajuste le statut si cette transaction est bouclée :
   * - succès  -> facture `payed`
   * - fermée/échouée -> retour en `completed` (redemander un paiement)
   * Sinon (transaction encore en cours), on ne fait rien.
   */
  async syncPayingInvoices(): Promise<number> {
    const since = new Date(Date.now() - 60_000);
    const paying = await this.invoiceModel
      .find({
        status: InvoiceStatus.PAYING,
        payed: false,
        paymentStartedAt: { $lt: since },
      })
      .lean();
    if (!paying.length) return 0;

    let adjusted = 0;
    for (const invoice of paying) {
      try {
        const latest = await this.transactionModel
          .find({ invoiceId: invoice._id })
          .sort({ createdAt: -1 })
          .limit(1)
          .lean();
        const tx = latest[0];
        if (!tx) continue;

        if (tx.status === TStatus.PAYINSUCCESS) {
          await this.handlePaymentSuccess(tx);
          adjusted++;
        } else if (tx.status === TStatus.PAYINCLOSED || tx.status === TStatus.PAYINERROR) {
          await this.invoiceModel.updateOne(
            { _id: invoice._id },
            {
              $set: { status: InvoiceStatus.COMPLETED, payed: false, paymentStartedAt: undefined, paymentLink: undefined },
              $unset: { transactionId: 1 },
            },
          );
          adjusted++;
        }
      } catch {
        // Une facture en erreur ne doit pas bloquer le traitement des autres.
      }
    }
    return adjusted;
  }

  private normalizeItems(items: any[]): InvoiceItem[] {
    return items
      .map((item) => {
        const unitPrice = Number(item.unitPrice) || 0;
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const designation = String(item.designation || '').trim();
        if (!designation) return null;
        return {
          designation,
          unitPrice,
          quantity,
          totalPrice: Number(item.totalPrice) > 0 ? Number(item.totalPrice) : unitPrice * quantity,
        };
      })
      .filter(Boolean) as InvoiceItem[];
  }

  private computeTotal(items: InvoiceItem[]): number {
    return Math.round(items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0) * 100) / 100;
  }

  private assertTransition(from: InvoiceStatus, to: InvoiceStatus): void {
    const allowed: Record<InvoiceStatus, InvoiceStatus[]> = {
      [InvoiceStatus.DRAFT]: [InvoiceStatus.COMPLETED, InvoiceStatus.ARCHIVED],
      [InvoiceStatus.COMPLETED]: [InvoiceStatus.DRAFT, InvoiceStatus.ARCHIVED],
      [InvoiceStatus.PAYING]: [], // géré par le cron / le flux de paiement uniquement
      [InvoiceStatus.PAYED]: [InvoiceStatus.ARCHIVED],
      [InvoiceStatus.ARCHIVED]: [InvoiceStatus.DRAFT, InvoiceStatus.COMPLETED],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Invalid invoice status transition: ${from} -> ${to}`);
    }
  }

  private toObjectId(id: string): mongoose.Types.ObjectId {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invoice not found');
    }
    return new mongoose.Types.ObjectId(id);
  }

  private label(invoice: any): string {
    return `Invoice ${String(invoice._id)} · ${invoice.currency} ${invoice.totalAmount}`;
  }

  private publicView(invoice: Invoice): Invoice {
    const { userId, payed, transactionId, ...rest } = invoice;
    void userId;
    void transactionId;
    return { ...rest, payed: !!payed } as Invoice;
  }
}
