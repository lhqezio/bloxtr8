/* eslint-disable no-unused-vars */
import type { Message } from '@bufbuild/protobuf';

import { KafkaSerializationError } from './errors.js';

/**
 * Schema type with serialization methods
 */

export interface MessageSchema<T extends Message> {
  toBinary: (message: T) => Uint8Array;
  fromBinary: (bytes: Uint8Array) => T;
}

/**
 * Serialize a Protobuf message to Buffer
 */
export function serializeMessage<T extends Message>(
  message: T,
  schema: MessageSchema<T>
): Buffer {
  try {
    const bytes = schema.toBinary(message);
    return Buffer.from(bytes);
  } catch (error) {
    throw new KafkaSerializationError(
      `Failed to serialize message: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Deserialize a Buffer to a Protobuf message
 */
export function deserializeMessage<T extends Message>(
  buffer: Buffer,
  schema: MessageSchema<T>
): T {
  try {
    return schema.fromBinary(buffer);
  } catch (error) {
    throw new KafkaSerializationError(
      `Failed to deserialize message: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
