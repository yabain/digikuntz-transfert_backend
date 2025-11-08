import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  // Méthodes génériques
  async get<T>(key: string): Promise<T | undefined> {
    return await this.cacheManager.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl || 300);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  // Méthodes spécialisées pour les utilisateurs
  async getUserCache(userId: string) {
    return await this.get(`user:${userId}`);
  }

  async setUserCache(userId: string, user: any, ttl = 300) {
    // Cache conditionnel : seulement les utilisateurs actifs
    if (user.isActive !== false) {
      await this.set(`user:${userId}`, user, ttl);
    }
  }

  async invalidateUserCache(userId: string) {
    await this.del(`user:${userId}`);
    // Invalider aussi les caches liés
    await this.del(`user:profile:${userId}`);
    await this.del(`user:stats:${userId}`);
  }

  // Méthodes pour les services
  async getServiceCache(serviceId: string) {
    return await this.get(`service:${serviceId}`);
  }

  async setServiceCache(serviceId: string, service: any, ttl = 600) {
    await this.set(`service:${serviceId}`, service, ttl);
  }

  async invalidateServiceCache(serviceId: string) {
    await this.del(`service:${serviceId}`);
    await this.del(`service:list:${serviceId}`);
  }

  // Invalidation en masse
  async invalidatePattern(pattern: string) {
    // Note: Cette méthode nécessiterait Redis pour être pleinement fonctionnelle
    // Pour l'instant, on invalide les clés connues
    if (pattern.includes('user:')) {
      // Logique d'invalidation pour les utilisateurs
    }
  }
}