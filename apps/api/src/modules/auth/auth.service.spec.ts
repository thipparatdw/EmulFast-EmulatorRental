import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

// Mock argon2
jest.mock("argon2");

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockUser = {
  id: "cuid_user_001",
  email: "test@example.com",
  passwordHash: "hashed_password",
  displayName: "Test User",
  phone: null,
  avatarUrl: null,
  role: "user" as const,
  status: "active" as const,
  locale: "th",
  emailVerifiedAt: null,
  membershipTierId: null,
  membershipPoints: 0,
  lastLoginAt: null,
  lastLoginIp: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
  membershipTier: null,
};

const mockRegisterInput = {
  email: "newuser@example.com",
  password: "Password123",
  displayName: "New User",
  phone: undefined,
  locale: "th" as const,
  acceptTerms: true as const,
};

const mockLoginInput = {
  email: "test@example.com",
  password: "Password123",
};

// ─── Mock PrismaService ───────────────────────────────────────────────────────

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  wallet: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ─── Mock JwtService ──────────────────────────────────────────────────────────

const mockJwtService = {
  sign: jest.fn().mockReturnValue("mock_access_token"),
};

// ─── Mock ConfigService ───────────────────────────────────────────────────────

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === "JWT_SECRET") return "test_jwt_secret";
    if (key === "JWT_REFRESH_SECRET") return "test_refresh_secret";
    return undefined;
  }),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── register ───────────────────────────────────────────────────────────────

  describe("register", () => {
    it("should register new user and return accessToken", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
      mockedArgon2.hash.mockResolvedValueOnce("argon2id_hash");

      const createdUser = { ...mockUser, email: mockRegisterInput.email, id: "cuid_new_001" };
      mockPrismaService.$transaction.mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: (tx: any) => Promise<typeof createdUser>) => {
          const tx = {
            user: { create: jest.fn().mockResolvedValueOnce(createdUser) },
            wallet: { create: jest.fn().mockResolvedValueOnce({ id: "wallet_001" }) },
          };
          return fn(tx);
        },
      );

      // Act
      const result = await service.register(mockRegisterInput);

      // Assert
      expect(result.user.email).toBe(mockRegisterInput.email);
      expect(result.accessToken).toBe("mock_access_token");
      expect(result.accessTokenExpiresAt).toBeDefined();
      expect(mockedArgon2.hash).toHaveBeenCalledWith(
        mockRegisterInput.password,
        expect.objectContaining({ type: argon2.argon2id }),
      );
    });

    it("should throw ConflictException when email already exists", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

      // Act & Assert
      await expect(service.register(mockRegisterInput)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────────

  describe("login", () => {
    it("should login successfully and return accessToken", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockedArgon2.verify.mockResolvedValueOnce(true);
      mockPrismaService.user.update.mockResolvedValueOnce(mockUser);

      // Act
      const result = await service.login(mockLoginInput);

      // Assert
      expect(result.user.email).toBe(mockUser.email);
      expect(result.accessToken).toBe("mock_access_token");
      expect(result.accessTokenExpiresAt).toBeDefined();
      expect(mockedArgon2.verify).toHaveBeenCalledWith(
        mockUser.passwordHash,
        mockLoginInput.password,
      );
    });

    it("should throw UnauthorizedException when email not found", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.login(mockLoginInput)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException when password is wrong", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockedArgon2.verify.mockResolvedValueOnce(false);

      // Act & Assert
      await expect(service.login(mockLoginInput)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException when account is not active", async () => {
      // Arrange
      const suspendedUser = { ...mockUser, status: "suspended" as const };
      mockPrismaService.user.findUnique.mockResolvedValueOnce(suspendedUser);
      mockedArgon2.verify.mockResolvedValueOnce(true);

      // Act & Assert
      await expect(service.login(mockLoginInput)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── refreshToken ────────────────────────────────────────────────────────────

  describe("refreshToken", () => {
    it("should issue new accessToken for valid userId", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        status: mockUser.status,
      });

      // Act
      const result = await service.refreshToken(mockUser.id);

      // Assert
      expect(result.accessToken).toBe("mock_access_token");
      expect(result.accessTokenExpiresAt).toBeDefined();
    });

    it("should throw UnauthorizedException when user not found", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.refreshToken("non_existent_id")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── getMe ───────────────────────────────────────────────────────────────────

  describe("getMe", () => {
    it("should return user profile", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

      // Act
      const result = await service.getMe(mockUser.id);

      // Assert
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.role).toBe(mockUser.role);
    });

    it("should throw UnauthorizedException when user not found", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.getMe("missing_id")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── issueRefreshToken ────────────────────────────────────────────────────────

  describe("issueRefreshToken", () => {
    it("should call jwtService.sign with refresh secret", () => {
      // Act
      const token = service.issueRefreshToken({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Assert
      expect(token).toBe("mock_access_token");
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: mockUser.id, email: mockUser.email }),
        expect.objectContaining({ secret: "test_refresh_secret" }),
      );
    });
  });
});
