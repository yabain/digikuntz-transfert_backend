import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/user/user.schema';

export type CommissionPayer = 'customer' | 'organization';

@Injectable()
export class CommissionResolverService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
  ) {}

  /**
   * Résout qui paie la commission pour un utilisateur donné.
   * - Si l'utilisateur est une organisation : retourne son commissionPayer
   * - Si l'utilisateur est un utilisateur personnel : vérifie s'il appartient à une organisation
   * - Par défaut : 'customer'
   */
  async getCommissionPayer(userId: string): Promise<'customer' | 'organization'> {
    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) return 'customer';

    // Si c'est une organisation, utiliser sa config
    if (user.accountType === 'organisation') {
      return user.commissionPayer || 'customer';
    }

    // Si c'est un user personnel, on pourrait vérifier s'il appartient à une org
    // Pour l'instant, par défaut customer pour les users personnels
    // (si besoin plus tard, on peut ajouter une relation user->organisation)
    return 'customer';
  }

  /**
   * Version synchrone si on a déjà l'objet user
   */
  getCommissionPayerFromUser(user: any): 'customer' | 'organization' {
    if (!user) return 'customer';
    if (user.accountType === 'organisation') {
      return user.commissionPayer || 'customer';
    }
    return 'customer';
  }
}