import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { UsersService } from "./users.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "@emulfast/db";

// ─── Mock argon2 ─────────────────────────────────────────────────────────────
jest.mock("argon2", () => ({
  argon2id: 2,
  verify: jest.fn(),
  hash: jest.fn(),
}));

import * as argon2 from "argon2";
const mockArgon2Verify = argon2.verify as jest.MockedFunction<typeof argon2.verify>;
const mockArgon2Hash = argon2.hash as jest.MockedFunction<typeof argon2.hash>;

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockWallet = {
  id: "wallet_001",
  userId: "user_001",
  balance: new Prisma.Decimal("200.0000"),
  lockedBalance: new Prisma.Decimal("0"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockUser = {
  id: "user_001",
  email: "test@example.com",
  displayName: "Test User",
  phone: null,
  avatarUrl: null,
  passwordHash: "hashed_password",
  role: "user" as const,
  status: "active" as const,
  locale: "th" as const,
  emailVerifiedAt: null,
  membershipTierCode: null,
  membershipPoints: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  lastLoginAt: null,
  membershipTier: null,
  wallet: mockWallet,
};

// ─── Mock PrismaService ───────────────────────────────────────────────────────
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe("UsersService", () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ─── getProfile ─────────────────────────────────────────────────────────────

  describe("getProfile", () => {
    it("returns profile with membership and wallet", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile("user_001");

      expect(result.id).toBe("user_001");
      expect(result.email).toBe("test@example.com");
      expect(result.wallet).toEqual({
        balance: "200",
        walletId: "wallet_001",
      });
      expect(result.membership).toMatchObject({
        tierCode: null,
        points: 0,
        nextTierCode: "silver",
        pointsToNextTier: 1000,
      });
    });

    it("throws NotFoundException when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns platinum next tier as null when at max tier", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        membershipPoints: 20000,
        membershipTier: { code: "platinum" },
      });

      const result = await service.getProfile("user_001");
      expect(result.membership?.nextTierCode).toBeNull();
      expect(result.membership?.pointsToNextTier).toBeNull();
    });
  });

  // ─── updateProfile ──────────────────────────────────────────────────────────

  describe("updateProfile", () => {
    it("updates displayName and phone", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        displayName: "Updated Name",
        phone: "+66812345678",
      });

      const result = await service.updateProfile("user_001", {
        displayName: "Updated Name",
        phone: "+66812345678",
      });

      expect(result.displayName).toBe("Updated Name");
      expect(result.phone).toBe("+66812345678");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user_001" },
          data: { displayName: "Updated Name", phone: "+66812345678" },
        }),
      );
    });

    it("throws NotFoundException when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile("nonexistent", { displayName: "X" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── changePassword ─────────────────────────────────────────────────────────

  describe("changePassword", () => {
    it("changes password successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockArgon2Verify.mockResolvedValue(true);
      mockArgon2Hash.mockResolvedValue("new_hashed_password");
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, passwordHash: "new_hashed_password" });

      const result = await service.changePassword("user_001", {
        oldPassword: "OldPass1",
        newPassword: "NewPass1",
      });

      expect(result).toEqual({ ok: true });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user_001" },
          data: { passwordHash: "new_hashed_password" },
        }),
      );
    });

    it("throws UnauthorizedException on wrong old password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockArgon2Verify.mockResolvedValue(false);

      await expect(
        service.changePassword("user_001", {
          oldPassword: "WrongPass",
          newPassword: "NewPass1",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws BadRequestException when old and new password are same", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockArgon2Verify.mockResolvedValue(true);

      await expect(
        service.changePassword("user_001", {
          oldPassword: "SamePass1",
          newPassword: "SamePass1",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword("nonexistent", {
          oldPassword: "OldPass1",
          newPassword: "NewPass1",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
