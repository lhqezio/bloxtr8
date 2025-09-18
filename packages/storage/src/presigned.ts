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

  return await getSignedUrl(storageClient.getClient(), command, { expiresIn: 900 }); // 15 minutes
}

export async function createPresignedGetUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: storageClient.getBucket(),
    Key: key,
  });

  return await getSignedUrl(storageClient.getClient(), command, { expiresIn: 3600 }); // 1 hour
}
