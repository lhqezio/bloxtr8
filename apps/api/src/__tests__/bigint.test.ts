import { bigIntReplacer, serializeBigInt } from '../utils/bigint.js';

describe('BigInt Utilities', () => {
  describe('serializeBigInt', () => {
    it('should handle null and undefined', () => {
      expect(serializeBigInt(null)).toBe(null);
      expect(serializeBigInt(undefined)).toBe(undefined);
    });

    it('should convert BigInt to string', () => {
      const bigIntValue = BigInt(123456789);
      const result = serializeBigInt(bigIntValue);
      expect(result).toBe('123456789');
    });

    it('should serialize BigInt in arrays', () => {
      const array = [BigInt(100), BigInt(200), 'test'];
      const result = serializeBigInt(array);
      expect(result).toEqual(['100', '200', 'test']);
    });

    it('should serialize BigInt in objects', () => {
      const obj = {
        price: BigInt(50000),
        amount: BigInt(100000),
        name: 'test',
      };
      const result = serializeBigInt(obj);
      expect(result).toEqual({
        price: '50000',
        amount: '100000',
        name: 'test',
      });
    });

    it('should handle nested objects with BigInt', () => {
      const obj = {
        offer: {
          amount: BigInt(50000),
          user: {
            id: 'user-1',
            balance: BigInt(1000),
          },
        },
      };
      const result = serializeBigInt(obj);
      expect(result).toEqual({
        offer: {
          amount: '50000',
          user: {
            id: 'user-1',
            balance: '1000',
          },
        },
      });
    });

    it('should handle arrays of objects with BigInt', () => {
      const array = [
        { id: '1', price: BigInt(100) },
        { id: '2', price: BigInt(200) },
      ];
      const result = serializeBigInt(array);
      expect(result).toEqual([
        { id: '1', price: '100' },
        { id: '2', price: '200' },
      ]);
    });

    it('should handle regular values without modification', () => {
      expect(serializeBigInt('test')).toBe('test');
      expect(serializeBigInt(123)).toBe(123);
      expect(serializeBigInt(true)).toBe(true);
      expect(serializeBigInt(false)).toBe(false);
    });
  });

  describe('bigIntReplacer', () => {
    it('should convert BigInt to string', () => {
      const result = bigIntReplacer('price', BigInt(123456789));
      expect(result).toBe('123456789');
    });

    it('should return other values unchanged', () => {
      expect(bigIntReplacer('name', 'test')).toBe('test');
      expect(bigIntReplacer('age', 25)).toBe(25);
      expect(bigIntReplacer('active', true)).toBe(true);
      expect(bigIntReplacer('data', null)).toBe(null);
      expect(bigIntReplacer('items', [1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('should work with JSON.stringify', () => {
      const obj = {
        name: 'test',
        price: BigInt(50000),
        amount: BigInt(100000),
      };
      const json = JSON.stringify(obj, bigIntReplacer);
      const parsed = JSON.parse(json);
      expect(parsed.price).toBe('50000');
      expect(parsed.amount).toBe('100000');
      expect(parsed.name).toBe('test');
    });
  });
});
