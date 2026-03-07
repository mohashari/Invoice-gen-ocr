import { Queue, QueueEvents } from 'bullmq'

const redisOpts = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null as null,
}

export const ocrQueue = new Queue('ocr-jobs', {
  connection: redisOpts,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

export const ocrQueueEvents = new QueueEvents('ocr-jobs', { connection: redisOpts })
