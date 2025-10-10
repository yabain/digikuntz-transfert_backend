/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as fs from 'fs';
import * as QR from 'qrcode';

type ConnState =
  | 'NO_CLIENT'
  | 'INITIALIZING'
  | 'CONNECTED'
  | 'UNPAIRED'
  | 'TIMEOUT'
  | 'UNKNOWN';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);

  private client: Client | null = null;
  private ready = false;

  // mémoire: dernier QR + statut
  private lastQr: string | null = null;
  private lastState: ConnState = 'NO_CLIENT';

  async onModuleInit() {
    await this.boot();
  }

  /** Boot du client wwebjs avec LocalAuth (session persistée) */
  private async boot() {
    if (this.client) return; // idempotent
    this.lastState = 'INITIALIZING';

    const chromePath =
      process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)
        ? process.env.CHROME_PATH
        : undefined;

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: '.wwebjs_session',
        clientId: 'default', // change si multi-instances
      }), // persistance de session :contentReference[oaicite:4]{index=4}
      puppeteer: {
        headless: true,
        args:
          process.platform === 'linux'
            ? [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
              ]
            : [],
        executablePath: chromePath,
      },
      // cache de version web (index JSON maintenu côté communauté)
      webVersionCache: {
        type: 'remote',
        remotePath:
          'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/last.json',
      },
      restartOnAuthFail: true,
    });

    // events de base (doc Client/events)
    this.client.on('qr', (qr) => {
      this.logger.log('QR reçu — scanne-le dans WhatsApp > Appareils liés');
      this.lastQr = qr;
      this.ready = false;
      this.lastState = 'INITIALIZING';
    });

    this.client.on('authenticated', () => {
      this.logger.log('Authentifié');
      this.lastQr = null;
    });

    this.client.on('ready', () => {
      this.logger.log('Client prêt');
      this.ready = true;
      this.lastState = 'CONNECTED';
      this.lastQr = null;
    });

    this.client.on('change_state', (state) => {
      this.logger.warn(`État WhatsApp: ${state}`);
      // on mappe juste CONNECTED / UNPAIRED, etc.
      this.lastState = (state as ConnState) ?? 'UNKNOWN';
    });

    this.client.on('auth_failure', (msg) => {
      this.logger.error(`Échec auth: ${msg}`);
      this.ready = false;
      this.lastState = 'UNKNOWN';
      this.lastQr = null; // forcera un nouveau QR
    });

    this.client.on('disconnected', (reason) => {
      this.logger.warn(`Déconnecté: ${reason}`);
      this.ready = false;
      this.lastState = 'UNKNOWN';
      this.lastQr = null;
      // relance douce
      setTimeout(() => this.reinitialize().catch(() => {}), 1500);
    });

    await this.client.initialize();
  }

  private async reinitialize() {
    try {
      await this.client?.destroy();
    } catch {
      console.log('Failed to destroy client');
    }
    this.client = null;
    await this.boot();
  }

  /** ---- Public API (utilisées par le Controller) ---- */

  /** Renvoie le dernier QR (brut + dataURL PNG) */
  async getQr(): Promise<{ qr: string | null; pngDataUrl?: string }> {
    if (!this.lastQr) return { qr: null };
    const pngDataUrl = await QR.toDataURL(this.lastQr);
    return { qr: this.lastQr, pngDataUrl };
  }

  /** Statut courant */
  async getStatus(): Promise<{ status: boolean; state: ConnState }> {
    if (!this.client) return { status: false, state: 'NO_CLIENT' };
    try {
      const state = await (this.client as any).getState?.();
      const norm: ConnState = (state as ConnState) ?? 'UNKNOWN';
      this.lastState = norm;
      return { status: this.ready, state: norm };
    } catch {
      return { status: this.ready, state: this.lastState };
    }
  }

  /** Envoi d’un message texte */
  async sendText(to: string, message: string, countryCode?: string) {
    this.assertClient();
    await this.ensureInjectionReady();

    const phone = this.formatPhone(to, countryCode);
    const wid = await this.client!.getNumberId(phone); // null si non WhatsApp :contentReference[oaicite:5]{index=5}
    if (!wid?._serialized) {
      return { success: false, error: 'Recipient is not on WhatsApp' };
    }

    await this.client!.sendMessage(wid._serialized, message);
    return { success: true };
  }

  /** Envoi d’un média (via URL) + légende optionnelle */
  async sendMediaUrl(
    to: string,
    fileUrl: string,
    caption?: string,
    countryCode?: string,
  ) {
    this.assertClient();
    await this.ensureInjectionReady();

    const phone = this.formatPhone(to, countryCode);
    const wid = await this.client!.getNumberId(phone);
    if (!wid?._serialized) {
      return { success: false, error: 'Recipient is not on WhatsApp' };
    }

    // MessageMedia.fromUrl (doc)
    const media = await MessageMedia.fromUrl(fileUrl); // :contentReference[oaicite:6]{index=6}
    await this.client!.sendMessage(wid._serialized, media, { caption });
    return { success: true };
  }

  /** ---------- Helpers ---------- */
  private assertClient() {
    if (!this.client) throw new Error('Client not initialized');
    if (!this.ready)
      this.logger.warn('Client not ready yet, tentative d’envoi…');
  }

  /** ping d’injection: échoue tant que l’injection n’est pas prête */
  private async ensureInjectionReady(timeoutMs = 20_000) {
    if (!this.client) throw new Error('Client not initialized');
    const start = Date.now();
    let lastErr: any;
    while (Date.now() - start < timeoutMs) {
      try {
        await this.client.getChats(); // utilise l’API Client elle-même :contentReference[oaicite:7]{index=7}
        return;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    this.logger.error('Injection timeout: ' + (lastErr?.message ?? lastErr));
    throw new Error('Injection not ready');
  }

  private formatPhone(to: string, cc?: string) {
    let s = to.replace(/\D/g, '');
    if (cc && !s.startsWith(cc)) s = cc + s;
    return s;
  }
}
