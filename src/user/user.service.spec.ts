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
});
