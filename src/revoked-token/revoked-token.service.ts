import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { RevokedToken } from './revoked-token.schema';
import { Model } from 'mongoose';

@Injectable()
export class RevokedTokenService {
  constructor(
    @InjectModel(RevokedToken.name)
    private revokedTokenModel: Model<RevokedToken>, // Injectez le modèle pour les tokens révoqués
  ) {}

  /**
   * Vérifie si un token est révoqué.
   * @param token - Le token JWT à vérifier.
   * @returns True si le token est révoqué, sinon false.
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    const revokedToken = await this.revokedTokenModel.findOne({ token });
    return !!revokedToken;
  }
}
