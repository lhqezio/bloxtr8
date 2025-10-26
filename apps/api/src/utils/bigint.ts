/**
 * Utility functions for handling BigInt serialization
 *
 * JSON.stringify doesn't support BigInt natively, so we need custom serialization.
 * We convert BigInt values to strings for safe JSON serialization.
 */

/**
 * Recursively converts BigInt values to strings in an object
 */
export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return String(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * Custom JSON.stringify replacer for BigInt values
 */
export function bigIntReplacer(_key: string, value: any): any {
  return typeof value === 'bigint' ? value.toString() : value;
}
