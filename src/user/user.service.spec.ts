import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { getModelToken } from '@nestjs/mongoose';
import { User, UserType } from './user.schema';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateUserDto } from './create-user.dto';
import * as bcrypt from 'bcryptjs';

// Mock dependencies
const mockUserModel = {
  create: jest.fn<Promise<any>, [Record<string, any>]>(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};

type MockUserModel = typeof mockUserModel;

const mockConfigService = {
  get: jest.fn(),
};

const mockCacheService = {
  setUserCache: jest.fn(),
  invalidateUserCache: jest.fn(),
};

const mockAuditLogService = {
  record: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;
  let userModel: MockUserModel;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userModel = module.get(getModelToken(User.name));
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a standard user without vip or verified privileges', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        accountType: UserType.PERSONAL,
        balance: 0,
        agreeTerms: true,
        cityId: 'a-city-id',
        countryId: 'a-country-id',
        phone: '123456789',
        language: 'en',
      } as CreateUserDto;

      const expectedUser = {
        ...createUserDto,
        active: true,
        sole: 0,
      };

      // Mock the result of the create call
      mockUserModel.create.mockResolvedValue(expectedUser as any);

      // We need to mock bcrypt hash
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedpassword' as never);

      await service.createUser(createUserDto);

      // Get the arguments passed to userModel.create
      const userModelCallArgs = userModel.create.mock.calls[0]?.[0];

      // Assert that the create method was called
      expect(userModel.create).toHaveBeenCalled();

      // Assert that the user is created with active:true and sole:0
      expect(userModelCallArgs).toHaveProperty('active', true);
      expect(userModelCallArgs).toHaveProperty('sole', 0);

      // CRITICAL: Assert that special privileges are NOT being added
      expect(userModelCallArgs).not.toHaveProperty('vip');
      expect(userModelCallArgs).not.toHaveProperty('verified');

      // Assert that the password is not stored in plain text
      expect(userModelCallArgs).toHaveProperty('password', 'hashedpassword');
    });

    it('should NOT grant vip or verified status even for special emails', async () => {
      const specialEmailUserDto: CreateUserDto = {
        email: 'flambel55@gmail.com', // An email that previously got special treatment
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        accountType: UserType.PERSONAL,
        balance: 0,
        agreeTerms: true,
        cityId: 'a-city-id',
        countryId: 'a-country-id',
        phone: '123456789',
        language: 'en',
      } as CreateUserDto;

      const expectedUser = {
        ...specialEmailUserDto,
        active: true,
        sole: 0,
      };

      mockUserModel.create.mockResolvedValue(expectedUser as any);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedpassword' as never);

      await service.createUser(specialEmailUserDto);

      const userModelCallArgs = userModel.create.mock.calls[0]?.[0];

      // CRITICAL: Assert that special privileges are NOT added, even for this email
      expect(userModelCallArgs).not.toHaveProperty('vip');
      expect(userModelCallArgs).not.toHaveProperty('verified');
      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'flambel55@gmail.com',
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should clear lockout fields when activating a previously locked account', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const lockedUser = {
        _id: userId,
        isActive: false,
        loginAttempts: 5,
        lockoutUntil: new Date(Date.now() + 60 * 60 * 1000),
        firstFailedAttemptAt: new Date(),
        toObject: () => ({
          _id: userId,
          isActive: true,
          loginAttempts: 0,
          lockoutUntil: null,
          firstFailedAttemptAt: null,
        }),
      };

      mockUserModel.findById.mockResolvedValue(lockedUser as any);
      mockUserModel.findByIdAndUpdate.mockResolvedValue(
        lockedUser.toObject() as any,
      );

      await service.updateStatus(userId);

      // findByIdAndUpdate doit être appelé avec le reset du lockout
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          isActive: true,
          lockoutUntil: null,
          loginAttempts: 0,
          firstFailedAttemptAt: null,
        }),
        expect.objectContaining({ new: true }),
      );

      // Le cache doit être invalidé
      expect(mockCacheService.invalidateUserCache).toHaveBeenCalledWith(userId);
      // Un audit log doit être enregistré
      expect(mockAuditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.status_updated',
          resourceId: String(userId),
        }),
      );
    });

    it('should invalidate sessions when deactivating an account', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const activeUser = {
        _id: userId,
        isActive: true,
        toObject: () => ({
          _id: userId,
          isActive: false,
          sessionInvalidatedAt: expect.any(Date),
        }),
      };

      mockUserModel.findById.mockResolvedValue(activeUser as any);
      mockUserModel.findByIdAndUpdate.mockResolvedValue(
        activeUser.toObject() as any,
      );

      await service.updateStatus(userId);

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          isActive: false,
          sessionInvalidatedAt: expect.any(Date),
        }),
        expect.objectContaining({ new: true }),
      );
    });
  });
});
