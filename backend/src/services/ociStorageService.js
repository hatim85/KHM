import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import ApiError from '../utils/ApiError.js';

let s3ClientInstance = null;

export const getS3Client = () => {
  if (s3ClientInstance) return s3ClientInstance;
  
  if (!process.env.OCI_ACCESS_KEY_ID || !process.env.OCI_SECRET_ACCESS_KEY || !process.env.OCI_NAMESPACE) {
    console.warn('[OCI] Storage credentials missing. Skipping OCI S3 client initialization.');
    return null;
  }

  const region = process.env.OCI_REGION || 'ap-mumbai-1';
  const namespace = process.env.OCI_NAMESPACE;
  // Use S3 compatibility API endpoint
  const endpoint = `https://${namespace}.compat.objectstorage.${region}.oraclecloud.com`;

  s3ClientInstance = new S3Client({
    region: region,
    endpoint: endpoint,
    credentials: {
      accessKeyId: process.env.OCI_ACCESS_KEY_ID,
      secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  return s3ClientInstance;
};

export const getObjectStream = async (objectKey) => {
  const client = getS3Client();
  if (!client) {
    throw new ApiError(500, 'Storage service not configured', 'STORAGE_NOT_CONFIGURED');
  }

  if (!process.env.OCI_BUCKET_NAME) {
    throw new ApiError(500, 'Storage bucket not configured', 'STORAGE_BUCKET_MISSING');
  }

  const command = new GetObjectCommand({
    Bucket: process.env.OCI_BUCKET_NAME,
    Key: objectKey,
  });

  try {
    const response = await client.send(command);
    return {
      stream: response.Body,
      contentType: response.ContentType,
      contentLength: response.ContentLength
    };
  } catch (error) {
    console.error(`[OCI] Error retrieving object ${objectKey}:`, error.message);
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      throw new ApiError(404, 'PDF file not found in storage', 'FILE_NOT_FOUND');
    }
    if (error.name === 'AccessDenied') {
        throw new ApiError(500, 'Storage access denied. Check backend credentials.', 'STORAGE_ACCESS_DENIED');
    }
    throw new ApiError(500, 'Failed to retrieve PDF from storage', 'STORAGE_RETRIEVAL_ERROR');
  }
};
