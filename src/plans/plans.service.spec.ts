import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PlansService } from './plans.service';
import { Plans } from './plans.schema';
import { ItemService } from './item/item.service';
import { OptionsService } from './options/options.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { AuthService } from 'src/auth/auth.service';
import { SubscriptionService } from './subscription/subscription.service';
import { WhatsappService } from 'src/wa/whatsapp.service';
import { UserService } from 'src/user/user.service';
import { EmailService } from 'src/email/email.service';

const mockPlansModel = {
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  db: { startSession: jest.fn() },
};

const mockItemService = {};
const mockOptionsService = {};
const mockFlutterwaveService = {};
const mockAuthService = {};
const mockSubscriptionService = {};
const mockWhatsappService = {};
const mockUserService = {};
const mockEmailService = {};

describe('PlansService', () => {
  let service: PlansService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        {
          provide: getModelToken(Plans.name),
          useValue: mockPlansModel,
        },
        {
          provide: ItemService,
          useValue: mockItemService,
        },
        {
          provide: OptionsService,
          useValue: mockOptionsService,
        },
        {
          provide: FlutterwaveService,
          useValue: mockFlutterwaveService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: SubscriptionService,
          useValue: mockSubscriptionService,
        },
        {
          provide: WhatsappService,
          useValue: mockWhatsappService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
