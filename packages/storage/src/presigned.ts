import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { StorageClient } from './client.js';

const storageClient = new StorageClient();

export async function createPresignedPutUrl(key: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: storageClient.getBucket(),
    Key: key,
    ContentType: 'application/pdf',
  });

  return await getSignedUrl(storageClient.getClient(), command, {
    expiresIn: 900,
  }); // 15 minutes
}

export async function createPresignedGetUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: storageClient.getBucket(),
    Key: key,
  });

  return await getSignedUrl(storageClient.getClient(), command, {
    expiresIn: 3600,
  }); // 1 hour
}

/**
 * Upload a buffer directly to S3
 */
export async function uploadBuffer(
  buffer: Uint8Array,
  key: string,
  contentType = 'application/octet-stream'
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: storageClient.getBucket(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await storageClient.getClient().send(command);
}

/**
 * Get public URL for a file (works with MinIO and S3)
 */
export function getPublicUrl(key: string): string {
  const endpoint = process.env.STORAGE_ENDPOINT || 'http://localhost:9000';
  const bucket = storageClient.getBucket();
  
  // For MinIO (local development), use path-style URL
  if (endpoint.includes('localhost') || endpoint.includes('127.0.0.1')) {
    return `${endpoint}/${bucket}/${key}`;
  }
  
  // For S3, use virtual-hosted-style URL
  const region = process.env.STORAGE_REGION || 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
