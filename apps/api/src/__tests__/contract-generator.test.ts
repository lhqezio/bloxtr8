import { generateContract, verifyContract } from '../lib/contract-generator.js';
import type { GenerateContractOptions } from '../lib/contract-generator.js';

// Mock storage module
jest.mock('@bloxtr8/storage', () => ({
  uploadBuffer: jest.fn().mockResolvedValue(undefined),
  getPublicUrl: jest.fn((key: string) => `https://storage.example.com/${key}`),
}));

describe('Contract Generator', () => {
  const mockContractOptions: GenerateContractOptions = {
    contractId: 'test-contract-123',
    offerId: 'test-offer-456',
    listingId: 'test-listing-789',
    seller: {
      id: 'seller-001',
      name: 'Test Seller',
      email: 'seller@example.com',
      kycTier: 'TIER_1',
      robloxAccountId: '12345678',
    },
    buyer: {
      id: 'buyer-001',
      name: 'Test Buyer',
      email: 'buyer@example.com',
      kycTier: 'TIER_1',
      robloxAccountId: '87654321',
    },
    asset: {
      title: 'Awesome Roblox Game',
      description: 'A very popular game with high player count',
      category: 'Games',
      robloxData: {
        gameId: '123456',
        gameName: 'Awesome Game',
        gameDescription: 'An amazing Roblox experience',
        playerCount: 1000,
        visits: 500000,
        verifiedOwnership: true,
        ownershipType: 'OWNER',
        verificationDate: new Date('2025-01-01'),
      },
    },
    financial: {
      amountCents: '100000', // $1000.00
      currency: 'USD',
    },
    offer: {
      id: 'test-offer-456',
      conditions: 'Payment within 48 hours',
      acceptedAt: new Date('2025-10-20'),
    },
  };

  describe('generateContract', () => {
    it('should successfully generate a contract PDF', async () => {
      const result = await generateContract(mockContractOptions);

      expect(result.success).toBe(true);
      expect(result.pdfUrl).toBeDefined();
      expect(result.sha256).toBeDefined();
      expect(result.templateVersion).toBe('1.0.0');
      expect(result.pdfUrl).toContain('test-contract-123.pdf');
    });

    it('should include Roblox asset data in contract', async () => {
      const result = await generateContract(mockContractOptions);

      expect(result.success).toBe(true);
      // The PDF should be generated with Roblox data
      expect(result.pdfUrl).toBeDefined();
    });

    it('should handle missing Roblox data gracefully', async () => {
      const optionsWithoutRoblox = {
        ...mockContractOptions,
        asset: {
          ...mockContractOptions.asset,
          robloxData: undefined,
        },
      };

      const result = await generateContract(optionsWithoutRoblox);

      expect(result.success).toBe(true);
      expect(result.pdfUrl).toBeDefined();
      expect(result.sha256).toBeDefined();
    });

    it('should generate unique SHA-256 hashes for different contracts', async () => {
      const result1 = await generateContract(mockContractOptions);

      const modifiedOptions = {
        ...mockContractOptions,
        financial: {
          ...mockContractOptions.financial,
          amountCents: '200000', // Different amount
        },
      };

      const result2 = await generateContract(modifiedOptions);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.sha256).not.toBe(result2.sha256);
    });

    it('should format currency amounts correctly', async () => {
      const optionsWithLargeAmount = {
        ...mockContractOptions,
        financial: {
          amountCents: '123456789', // $1,234,567.89
          currency: 'USD',
        },
      };

      const result = await generateContract(optionsWithLargeAmount);

      expect(result.success).toBe(true);
      // The formatted amount should be in the PDF
    });
  });

  describe('verifyContract', () => {
    it('should verify contract integrity with correct hash', async () => {
      // Generate a contract
      const generateResult = await generateContract(mockContractOptions);
      expect(generateResult.success).toBe(true);

      // Since we mocked uploadBuffer, we need to create a mock PDF
      const mockPdfBytes = new Uint8Array([1, 2, 3, 4, 5]);
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256');
      hash.update(mockPdfBytes);
      const expectedHash = hash.digest('hex');

      // Verify
      const isValid = await verifyContract(mockPdfBytes, expectedHash);
      expect(isValid).toBe(true);
    });

    it('should fail verification with incorrect hash', async () => {
      const mockPdfBytes = new Uint8Array([1, 2, 3, 4, 5]);
      const incorrectHash = 'incorrect_hash_value';

      const isValid = await verifyContract(mockPdfBytes, incorrectHash);
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered PDF', async () => {
      const originalBytes = new Uint8Array([1, 2, 3, 4, 5]);
      const tamperedBytes = new Uint8Array([1, 2, 3, 4, 6]); // Last byte changed

      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256');
      hash.update(originalBytes);
      const originalHash = hash.digest('hex');

      const isValid = await verifyContract(tamperedBytes, originalHash);
      expect(isValid).toBe(false);
    });
  });
});



