import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        ttl: 300, // 5 minutes par défaut
        max: 1000, // nombre maximum d'éléments en cache
        // Configuration Redis (optionnelle si Redis n'est pas installé)
        // store: 'redis',
        // host: configService.get('REDIS_HOST', 'localhost'),
        // port: configService.get('REDIS_PORT', 6379),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [CacheService],
  exports: [CacheModule, CacheService],
})
export class AppCacheModule {}