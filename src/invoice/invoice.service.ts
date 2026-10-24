import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';
import {
  isPreChargeRejection,
  readChargeOutcome,
} from 'src/flutterwave/mobile-money-charge.builder';
import { PayinRouteService } from 'src/flutterwave/payin-route.service';
import {
  Transaction,
  TransactionType,
  TStatus,
} from 'src/transaction/transaction.schema';
import { UserService } from 'src/user/user.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { SystemService } from 'src/system/system.service';
import { CommissionResolverService } from 'src/common/services/commission-resolver.service';
import { PaymentMethodService } from 'src/payment-method/payment-method.service';
import { Payin } from 'src/payin/payin.schema';
import { Invoice, InvoiceItem, InvoiceStatus } from './invoice.schema';
import {
  CreateInvoiceDto,
  MarkInvoicePaidDto,
  UpdateInvoiceDto,
} from './invoice.dto';
import { EmailService } from 'src/email/email.service';
import { getUploadRootDir } from 'src/common/upload-dir.util';

export interface InvoiceStats {
  total: number;
  pending: number;
  payed: number;
  disabled: number;
  drafts: number;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
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
    // La voie d'encaissement (directe / hébergée) n'est plus décida ici : voir
    // `PayinRouteService`. `InvoiceService` n'appelle donc plus directement la
    // passerelle, ce qui supprime la copie locale de cette règle monétaire.
    @Inject(forwardRef(() => PayinRouteService))
    private readonly payinRoute: PayinRouteService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
    private readonly commissionResolver: CommissionResolverService,
  ) {}

  async create(userId: string, dto: CreateInvoiceDto): Promise<Invoice> {
    const user = await this.userService.getUserById(userId);
    const currency = user?.countryId?.currency || 'XAF';
    const items = this.normalizeItems(dto.items || []);
    if (!items.length) {
      throw new BadRequestException(
        'Invoice must contain at least one line item.',
      );
    }

    const totalAmount = this.computeTotal(items);
    await this.validateMinAmount(totalAmount, currency);

    const requestedPayer = (dto as any)?.commissionPayer;
    const commissionPayer =
      requestedPayer === 'customer' || requestedPayer === 'organization'
        ? requestedPayer
        : await this.commissionResolver.getCommissionPayer(String(userId));

    const invoice = await this.invoiceModel.create({
      userId,
      name: dto.name,
      currency,
      items,
      totalAmount,
      invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
      status: InvoiceStatus.DRAFT,
      payed: false,
      commissionPayer,
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
      metadata: {
        status: invoice.status,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
      },
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
        const base = Number(invoice.totalAmount);
        const feesAmount = Math.ceil((base * feesPercent) / 100);
        const orgPays = invoice.commissionPayer === 'organization';
        return {
          ...invoice,
          feesPercent,
          feesAmount,
          // Customer pays the fees -> base + fees ; organisation pays them ->
          // the customer only pays the base amount and the organisation
          // receives the base amount minus the fees.
          amountToPay: orgPays ? base : base + feesAmount,
          amountToReceive: orgPays ? base - feesAmount : base,
        };
      }),
    );
  }

  async getStats(userId: string): Promise<InvoiceStats> {
    const [total, pending, payed, disabled, drafts] = await Promise.all([
      this.invoiceModel.countDocuments({ userId }),
      this.invoiceModel.countDocuments({
        userId,
        payed: false,
        status: { $in: [InvoiceStatus.COMPLETED, InvoiceStatus.PAYING] },
      }),
      this.invoiceModel.countDocuments({ userId, payed: true }),
      this.invoiceModel.countDocuments({
        userId,
        status: InvoiceStatus.ARCHIVED,
      }),
      this.invoiceModel.countDocuments({ userId, status: InvoiceStatus.DRAFT }),
    ]);
    return { total, pending, payed, disabled, drafts };
  }

  async findByIdForUser(userId: string, invoiceId: string): Promise<any> {
    const invoice = await this.invoiceModel
      .findOne({ _id: this.toObjectId(invoiceId), userId })
      .lean();
    if (!invoice) throw new NotFoundException('Invoice not found');
    const fees = await this.computeFees(
      invoice.totalAmount,
      invoice.currency,
      invoice.commissionPayer,
    );
    return {
      ...invoice,
      feesPercent: fees.percent,
      feesAmount: fees.amount,
      amountToPay: fees.amountToPay,
      amountToReceive: fees.amountToReceive,
    };
  }

  async getPublic(invoiceId: string): Promise<any> {
    const invoice = await this.invoiceModel
      .findById(this.toObjectId(invoiceId))
      .lean();
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      invoice.status === InvoiceStatus.DRAFT ||
      invoice.status === InvoiceStatus.ARCHIVED
    ) {
      throw new NotFoundException('Invoice not found');
    }
    // Auto-réparation à chaque consultation publique : si une tentative de
    // paiement a réussi mais que la facture n'a pas encore été marquée payée
    // (webhook non reçu, plusieurs tentatives…), on la finalise tout de suite.
    if (invoice.status !== InvoiceStatus.PAYED) {
      await this.repairStuckInvoice(invoice);
    }
    const current = await this.invoiceModel
      .findById(this.toObjectId(invoiceId))
      .lean();
    const live = current ?? invoice;
    const fees = await this.computeFees(
      live.totalAmount,
      live.currency,
      live.commissionPayer,
    );
    return {
      ...this.publicView(live),
      owner: await this.getPublicOwner(live.userId),
      feesPercent: fees.percent,
      feesAmount: fees.amount,
      amountToPay: fees.amountToPay,
      amountToReceive: fees.amountToReceive,
    };
  }

  /**
   * Auto-réparation : si la transaction liée est déjà réussie mais que la
   * facture n'a pas été marquée payée (échec antérieur du webhook/cron),
   * la finalise immédiatement à l'ouverture de la page publique.
   */
  private async repairStuckInvoice(invoice: any): Promise<void> {
    try {
      // On cherche toute transaction de paiement réussie liée à la facture,
      // et pas seulement celle référencée par `transactionId` : le payeur peut
      // avoir retenté le paiement (plusieurs tentatives), et la réussie n'est
      // pas forcément la dernière tentative enregistrée sur la facture.
      const successTx = await this.transactionModel
        .findOne({
          invoiceId: String(invoice._id),
          status: TStatus.PAYINSUCCESS,
        })
        .sort({ createdAt: -1 })
        .lean();
      if (successTx) {
        await this.handlePaymentSuccess(successTx);
      }
    } catch {
      // Non bloquant : la page publique s'affiche même si la réparation échoue.
    }
  }

  private async getPublicOwner(
    userId: string,
  ): Promise<Record<string, any> | null> {
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

  private legacyAssetsPaths(): string[] {
    return [
      join(process.cwd(), 'public', 'assets'),
      join(process.cwd(), 'assets'),
      '/app/assets',
    ];
  }

  private resolvePictureFile(pictureUrl: string): string | null {
    if (!pictureUrl || /^https?:\/\//i.test(pictureUrl)) return null;

    let roots: string[] = [];
    let rel: string | null = null;

    if (pictureUrl.startsWith('/uploads/announcements/')) {
      return null; // pièces jointes d'annonces : hors périmètre facture
    } else if (pictureUrl.startsWith('/uploads/')) {
      roots = [getUploadRootDir()];
      rel = pictureUrl.slice('/uploads/'.length);
    } else if (pictureUrl.startsWith('/assets/images/')) {
      roots = [getUploadRootDir()];
      rel = pictureUrl.slice('/assets/images/'.length);
    } else if (pictureUrl.startsWith('/assets/')) {
      roots = this.legacyAssetsPaths();
      rel = pictureUrl.slice('/assets/'.length);
    } else if (pictureUrl.startsWith('/')) {
      roots = this.legacyAssetsPaths();
      rel = pictureUrl.slice(1);
    }

    if (!rel) return null;
    for (const root of roots) {
      // Confinement anti path-traversal : le fichier résolu doit rester
      // sous la racine (refuse les `..` sortant du répertoire autorisé).
      const base = resolve(root);
      const file = resolve(base, rel);
      // Confinement strict : le fichier doit être DANS la racine (un
      // relatif vide ou un `..` sortant est refusé).
      if (!file.startsWith(base + sep)) continue;
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
      const mime =
        extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }

  async findTransactionsForUser(
    userId: string,
    invoiceId: string,
  ): Promise<Transaction[]> {
    await this.findByIdForUser(userId, invoiceId);
    return this.transactionModel
      .find({ invoiceId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async update(
    userId: string,
    invoiceId: string,
    dto: UpdateInvoiceDto,
  ): Promise<Invoice> {
    const invoice = await this.invoiceModel.findOne({
      _id: this.toObjectId(invoiceId),
      userId,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.payed)
      throw new ConflictException('A paid invoice cannot be modified.');

    if (dto.name !== undefined) {
      invoice.name = dto.name.trim();
    }
    if (dto.items !== undefined) {
      const items = this.normalizeItems(dto.items);
      if (!items.length)
        throw new BadRequestException(
          'Invoice must contain at least one line item.',
        );
      invoice.items = items;
      invoice.totalAmount = this.computeTotal(items);
      await this.validateMinAmount(invoice.totalAmount, invoice.currency);
    }
    if (dto.invoiceDate) invoice.invoiceDate = new Date(dto.invoiceDate);

    if (
      dto.commissionPayer === 'customer' ||
      dto.commissionPayer === 'organization'
    ) {
      invoice.commissionPayer = dto.commissionPayer;
    }

    if (dto.status && dto.status !== invoice.status) {
      this.assertTransition(invoice.status, dto.status);
      invoice.status = dto.status;
      if (
        dto.status === InvoiceStatus.DRAFT ||
        dto.status === InvoiceStatus.ARCHIVED
      ) {
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
   * Marque manuellement une facture comme payée (sans transaction de paiement).
   * Le payeur peut ainsi régler la facture hors-ligne (espèces, virement, etc.)
   * et le commerçant la passe à l'état `payed` lui-même. Les informations du
   * payeur saisies dans le formulaire (nom, téléphone, email optionnel) sont
   * enregistrées sur la facture.
   */
  async markAsPaid(
    userId: string,
    invoiceId: string,
    dto: MarkInvoicePaidDto,
  ): Promise<Invoice> {
    const invoice = await this.invoiceModel.findOne({
      _id: this.toObjectId(invoiceId),
      userId,
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.payed) {
      throw new ConflictException('This invoice is already paid.');
    }
    if (invoice.status === InvoiceStatus.ARCHIVED) {
      throw new ConflictException(
        'An archived invoice cannot be marked as paid.',
      );
    }

    invoice.status = InvoiceStatus.PAYED;
    invoice.payed = true;
    invoice.paymentDate = new Date();
    invoice.paidManually = true;
    invoice.paymentStartedAt = undefined;
    invoice.paymentLink = undefined;
    invoice.payerName = dto.payerName;
    invoice.payerPhone = dto.payerPhone;
    invoice.payerEmail = dto.payerEmail;
    await invoice.save();

    this.auditLogService.record({
      actorId: String(userId),
      actorRole: 'user',
      action: 'invoice.marked_paid_manually',
      resourceType: 'invoice',
      resourceId: String(invoice._id),
      resourceLabel: this.label(invoice),
      method: 'POST',
      path: `/invoices/${invoiceId}/mark-paid`,
      statusCode: 200,
      metadata: {
        status: invoice.status,
        paidManually: true,
        paymentDate: invoice.paymentDate,
        totalAmount: invoice.totalAmount,
        payerName: invoice.payerName,
        payerPhone: invoice.payerPhone,
        payerEmail: invoice.payerEmail,
      },
    });

    return invoice;
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
    payer: {
      payerName: string;
      payerPhone?: string;
      payerEmail?: string;
      redirectUrl?: string;
      paymentMethod?: 'mobile_money' | 'card';
      /** Code de la méthode choisie → détermine le taux de frais (`taxesPayment`). */
      paymentMethodCode?: string;
      network?: string;
      deviceFingerprint?: string;
      clientIp?: string;
    },
  ): Promise<any> {
    const invoice = await this.invoiceModel.findById(
      this.toObjectId(invoiceId),
    );
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.payed) {
      throw new ConflictException('This invoice is already paid.');
    }
    if (
      invoice.status !== InvoiceStatus.COMPLETED &&
      invoice.status !== InvoiceStatus.PAYING
    ) {
      throw new ConflictException('This invoice is not payable.');
    }

    // Nouvelle tentative pendant qu'un paiement est déjà en cours :
    // on réutilise le lien de paiement existant sans créer de transaction.
    if (invoice.status === InvoiceStatus.PAYING && invoice.transactionId) {
      const existing = await this.transactionModel
        .findById(invoice.transactionId)
        .lean();
      if (existing) {
        let link = invoice.paymentLink || '';
        if (!link && existing.txRef) {
          const payin = await this.payinModel
            .findOne({ txRef: existing.txRef })
            .lean();
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

    // Frais = `taxesPayment` de la méthode choisie (repli sur `invoiceTaxes`
    // système). Le taux est dérivé côté SERVEUR depuis la méthode : il n'est
    // jamais lu dans le corps de la requête.
    //
    // Résolu AVANT la revendication atomique : une méthode invalide (devise ou
    // sens de paiement) doit échouer sans laisser la facture bloquée en `paying`.
    const taxRateOverride = await this.resolvePaymentMethodTaxRate(
      payer.paymentMethodCode,
      currency,
    );

    // Revendication ATOMIQUE avant toute charge.
    //
    // Deux requêtes parallèles passaient toutes deux le contrôle de statut
    // ci-dessus et déclenchaient deux tentatives de paiement. Sur le chemin
    // hébergé cela n'ouvrait que deux pages de paiement ; depuis l'ajout du
    // débit direct, cela pousse DEUX vraies demandes de paiement sur le
    // téléphone du payeur, donc un risque de double débit. Celui qui perd la
    // course s'arrête ici, sans rien émettre.
    const claim = await this.invoiceModel.findOneAndUpdate(
      {
        _id: invoice._id,
        status: InvoiceStatus.COMPLETED,
        payed: { $ne: true },
      },
      {
        $set: {
          status: InvoiceStatus.PAYING,
          paymentStartedAt: new Date(),
          payerName: payer.payerName,
          payerPhone: payer.payerPhone,
          payerEmail: payer.payerEmail || undefined,
        },
      },
      { new: true },
    );

    if (!claim) {
      throw new ConflictException(
        'A payment is already in progress for this invoice.',
      );
    }

    const transactionData = {
      transactionType: TransactionType.INVOICE,
      invoiceId: String(invoice._id),
      estimation: invoice.totalAmount,
      noFees: false,
      // Taux serveur dérivé de la méthode choisie (undefined → taux système).
      taxRateOverride,
      commissionPayer:
        invoice.commissionPayer ||
        (await this.commissionResolver.getCommissionPayer(
          String(invoice.userId),
        )),
      senderCurrency: currency,
      receiverCurrency: currency,
      senderName: payer.payerName || 'Client',
      senderContact: payer.payerPhone || '',
      senderEmail:
        payer.payerEmail || `${String(invoice._id)}@invoice.digikuntz.com`,
      receiverId: String(invoice.userId),
      receiverName:
        owner?.name || owner?.firstName || owner?.lastName || 'Merchant',
      receiverEmail: owner?.email || '',
      receiverContact: owner?.phone || '',
      raisonForTransfer: `Invoice ${String(invoice._id)}`,
      redirectUrl: payer.redirectUrl,
      status: 'transaction_payin_pending',
    };

    let payinResult: any;
    try {
      // Aiguillage unique (direct / hébergé) : la décision n'existe plus en double
      // ici, elle vit dans `PayinRouteService`.
      payinResult = await this.payinRoute.resolve(
        transactionData,
        {
          method: payer.paymentMethod,
          phone: payer.payerPhone,
          email: payer.payerEmail,
          name: payer.payerName,
          network: payer.network,
          deviceFingerprint: payer.deviceFingerprint,
          clientIp: payer.clientIp,
        },
        {
          flow: 'invoice',
          meta: { invoiceId: String(transactionData.invoiceId ?? '') },
          fallbackEmail: transactionData.senderEmail,
          label: `Invoice ${String(transactionData.invoiceId ?? '')}`,
        },
      );
    } catch (error) {
      // Libération de la revendication, avec un prédicat volontairement prudent.
      //
      // - Voie HÉBERGÉE : on restaure exactement le comportement d'avant (la
      //   facture redevenait payable), car une session de paiement en double est
      //   sans danger.
      // - Voie DIRECTE : on ne libère que si RIEN n'est parti (rejet pré-charge)
      //   ou si aucune transaction n'a été persistée. Sinon un débit peut être en
      //   vol : libérer permettrait une seconde charge, donc un double débit.
      //   Dans ce cas la facture reste PAYING et se résout par le cron (le payin
      //   est laissé `pending` exprès), ce qui évite le blocage de 8 h sans
      //   jamais risquer de re-débiter le payeur.
      const isDirectRoute = payer.paymentMethod === 'mobile_money';

      const created = await this.transactionModel
        .findOne({ invoiceId: String(invoice._id) })
        .lean();

      const safeToRelease =
        !isDirectRoute || isPreChargeRejection(error) || !created;

      if (safeToRelease) {
        await this.invoiceModel.updateOne(
          { _id: invoice._id, status: InvoiceStatus.PAYING },
          {
            $set: { status: InvoiceStatus.COMPLETED },
            $unset: { paymentStartedAt: 1 },
          },
        );
      }

      throw error;
    }

    // Échec synchrone : la charge est revenue, mais refusée. La facture ne doit
    // pas rester PAYING avec une transaction morte, sinon le payeur ne peut plus
    // réessayer (la branche de réutilisation lui renverrait un txRef inutilisable).
    //
    // `envelope` re-type la réponse (non typée à la source) en lecture sûre : les
    // valeurs restent `unknown` et ne sont jamais coercées.
    const envelope = payinResult as Record<string, unknown> | null | undefined;
    const chargeOutcome = readChargeOutcome(envelope?.chargeStatus);

    if (chargeOutcome === 'failed' || chargeOutcome === 'cancelled') {
      await this.invoiceModel.updateOne(
        { _id: invoice._id, status: InvoiceStatus.PAYING },
        {
          $set: { status: InvoiceStatus.COMPLETED },
          $unset: { paymentStartedAt: 1 },
        },
      );

      throw new BadGatewayException(
        typeof envelope?.message === 'string'
          ? envelope.message
          : 'The mobile money charge was refused. Please try again.',
      );
    }

    invoice.status = InvoiceStatus.PAYING;
    invoice.paymentStartedAt = new Date();
    invoice.paymentLink =
      payinResult?.redirect_url || payinResult?.link || payinResult?.url || '';
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
      metadata: {
        payerName: payer.payerName,
        payerPhone: payer.payerPhone,
        status: invoice.status,
      },
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
    return (
      typeof email === 'string' && email.endsWith('@invoice.digikuntz.com')
    );
  }

  /**
   * Notifie par email le payeur (si son email réel est connu) et le
   * propriétaire de la facture après un paiement réussi.
   */
  private async notifyPaymentSuccess(
    invoice: any,
    transaction: any,
  ): Promise<void> {
    try {
      const owner = await this.userService
        .getUserById(String(invoice.userId))
        .catch(() => null);
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
            name:
              owner?.name || owner?.firstName || owner?.lastName || 'Client',
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
   * Le montant minimal provient en priorité des limites de transaction
   * configurées par l'admin (`transactionLimits.minDeposit` pour la devise) ;
   * à défaut on retombe sur le `minAmount` des méthodes de paiement actives.
   */
  async getPaymentConfig(
    currency: string,
  ): Promise<{ minAmount: number; feesPercent: number }> {
    const [system, methods] = await Promise.all([
      this.systemService.getSystemData(),
      this.paymentMethodService.findAll({ limit: 1000 } as any),
    ]);

    const currencyMethods = (methods || []).filter(
      (m: any) =>
        m.currency === currency && m.statusPayin && m.minAmount != null,
    );

    // Les limites de transaction configurées par l'admin (minDeposit) sont
    // la référence pour l'encaissement : elles prennent le pas sur le
    // minAmount des méthodes de paiement, qui n'est qu'une valeur de repli.
    const systemLimit = (system?.transactionLimits || []).find(
      (l: any) => l.currency === currency,
    );
    const systemMin = Number(systemLimit?.minDeposit) || 0;

    let minAmount =
      systemMin > 0
        ? systemMin
        : currencyMethods.length
          ? Math.min(
              ...currencyMethods.map((m: any) => Number(m.minAmount) || 0),
            )
          : 0;

    const feesPercent = Number(system?.invoiceTaxes) || 0;
    return { minAmount, feesPercent };
  }

  /**
   * Taux de frais (`taxesPayment`) de la méthode de paiement sélectionnée, si
   * elle existe et encaisse bien dans cette devise. `undefined` → taux système.
   *
   * Lève une erreur si la méthode existe mais ne convient pas (devise, ou
   * `statusPayin` désactivé) : mieux vaut refuser tôt que facturer un taux
   * inattendu après avoir revendiqué la facture.
   */
  private async resolvePaymentMethodTaxRate(
    paymentMethodCode: string | undefined,
    currency: string,
  ): Promise<number | undefined> {
    const code = String(paymentMethodCode || '').trim();
    if (!code) return undefined;

    const method = await this.paymentMethodService.findByCode(
      code.toUpperCase(),
    );
    if (!method) return undefined;

    if (
      String(method.currency).toUpperCase() !== String(currency).toUpperCase()
    ) {
      throw new BadRequestException(
        `Payment method '${method.code}' is not available for ${currency}`,
      );
    }
    if (!method.statusPayin) {
      throw new BadRequestException(
        `Payment method '${method.code}' is not available for payin`,
      );
    }

    const rate = Number(method.taxesPayment);
    return Number.isFinite(rate) && rate >= 0 ? rate : undefined;
  }

  async getPaymentMetaForUser(
    userId: string,
  ): Promise<{ currency: string; minAmount: number; feesPercent: number }> {
    const user = await this.userService.getUserById(userId);
    const currency = user?.countryId?.currency || 'XAF';
    const { minAmount, feesPercent } = await this.getPaymentConfig(currency);
    return { currency, minAmount, feesPercent };
  }

  private async validateMinAmount(
    totalAmount: number,
    currency: string,
  ): Promise<void> {
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
    commissionPayer?: 'customer' | 'organization',
  ): Promise<{
    percent: number;
    amount: number;
    amountToPay: number;
    amountToReceive: number;
  }> {
    const { feesPercent } = await this.getPaymentConfig(currency);
    const base = Number(totalAmount);
    const amount = Math.ceil((base * feesPercent) / 100);
    const orgPays = commissionPayer === 'organization';
    // Same rule as the frontend CommissionService:
    // - customer pays: customer pays base + fees, organisation receives base
    // - organisation pays: customer pays base, organisation receives base - fees
    return {
      percent: feesPercent,
      amount,
      amountToPay: orgPays ? base : base + amount,
      amountToReceive: orgPays ? base - amount : base,
    };
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
        } else if (
          tx.status === TStatus.PAYINCLOSED ||
          tx.status === TStatus.PAYINERROR
        ) {
          await this.invoiceModel.updateOne(
            { _id: invoice._id },
            {
              $set: {
                status: InvoiceStatus.COMPLETED,
                payed: false,
                paymentStartedAt: undefined,
                paymentLink: undefined,
              },
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
          totalPrice:
            Number(item.totalPrice) > 0
              ? Number(item.totalPrice)
              : unitPrice * quantity,
        };
      })
      .filter(Boolean) as InvoiceItem[];
  }

  private computeTotal(items: InvoiceItem[]): number {
    return (
      Math.round(
        items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0) *
          100,
      ) / 100
    );
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
      throw new BadRequestException(
        `Invalid invoice status transition: ${from} -> ${to}`,
      );
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
