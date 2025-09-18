import { S3Client } from '@aws-sdk/client-s3';

export class StorageClient {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const endpoint = process.env.STORAGE_ENDPOINT || 'http://localhost:9000';
    const region = process.env.STORAGE_REGION || 'us-east-1';
    const accessKeyId = process.env.STORAGE_ACCESS_KEY || 'minioadmin';
    const secretAccessKey = process.env.STORAGE_SECRET_KEY || 'minioadmin123';

    this.bucket = process.env.STORAGE_BUCKET || 'contracts';

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  getClient(): S3Client {
    return this.client;
  }

  getBucket(): string {
    return this.bucket;
  }
}
