import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'stream'

const s3AccessKey = process.env.S3_ACCESS_KEY
const s3SecretKey = process.env.S3_SECRET_KEY
if (!s3AccessKey || !s3SecretKey) {
  throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY environment variables are required')
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretKey,
  },
  forcePathStyle: true,
})

export const BUCKETS = {
  RAW: process.env.S3_BUCKET_RAW || 'invoices-raw',
  PROCESSED: process.env.S3_BUCKET_PROCESSED || 'invoices-processed',
  PDF: process.env.S3_BUCKET_PDF || 'invoices-pdf',
}

export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Readable,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  return `${bucket}/${key}`
}

export async function getPresignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  )
}

export async function deleteFile(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export function parseS3Path(path: string): { bucket: string; key: string } {
  const [bucket, ...rest] = path.split('/')
  return { bucket, key: rest.join('/') }
}
