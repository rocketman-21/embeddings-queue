import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { RedisClientType } from 'redis';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Job } from 'bullmq';
import { log } from '../../helpers';
import { videoDescriptionPrompt } from '../../prompts/media-descriptions';
import { downloadYoutubeVideo } from './download';
import { retryWithExponentialBackoff } from '../../retry/retry-fetch';
import { cacheYoutubeDescription, getCachedYoutubeDescription } from './cache';
import { uploadAndWaitForProcessing } from '../../google/ai-file-manager';

if (!process.env.GOOGLE_AI_STUDIO_KEY) {
  throw new Error('GOOGLE_AI_STUDIO_KEY environment variable is required');
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_KEY);
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_STUDIO_KEY);

/**
 * Analyzes a YouTube video from a URL and returns a description.
 * @param videoUrl - The URL of the YouTube video to analyze.
 * @param redisClient - Redis client for caching
 * @returns A promise that resolves to the description of the video.
 */
export async function describeYoutubeVideo(
  videoUrl: string,
  redisClient: RedisClientType,
  job: Job
): Promise<string | null> {
  log(`Starting YouTube video description process for: ${videoUrl}`, job);

  const cachedDescription = await getCachedYoutubeDescription(
    redisClient,
    videoUrl,
    job
  );
  if (cachedDescription) {
    log('Returning cached youtube video description', job);
    return cachedDescription;
  }

  // Create unique directory name based on video URL hash
  const videoHash = crypto.createHash('md5').update(videoUrl).digest('hex');
  const videoDir = path.resolve(__dirname, videoHash);
  const localFilePath = path.join(videoDir, 'yt-video.mp4');

  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }

    log(
      `Starting YouTube video download and processing for: ${videoUrl} saving to: ${localFilePath}`,
      job
    );
    // Download video using YouTube-specific downloader
    await downloadYoutubeVideo(videoUrl, localFilePath, job);

    // Upload video and wait for processing
    const uploadResponse = await uploadAndWaitForProcessing(
      fileManager,
      localFilePath,
      'video/mp4',
      job
    );

    // Clean up local video file after upload
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
      log('Deleted local video file after upload', job);
    }

    // Generate description using Gemini Flash with retries
    log('Generating video description with Gemini Flash', job);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await retryWithExponentialBackoff(async () => {
      return await model.generateContent([
        {
          fileData: {
            mimeType: uploadResponse.file.mimeType,
            fileUri: uploadResponse.file.uri,
          },
        },
        {
          text: videoDescriptionPrompt(),
        },
      ]);
    }, job);

    log(`Result from generateContent: ${JSON.stringify(result, null, 2)}`, job);

    const description = result.response.text();
    log('Generated description:' + description, job);

    // Cache and delete the file after processing
    if (description) {
      log('Caching video description', job);
      await cacheYoutubeDescription(redisClient, videoUrl, description, job);
    }
    log('Cleaning up Google AI Studio file', job);
    await fileManager.deleteFile(uploadResponse.file.name);

    return description;
  } catch (error) {
    log('Error describing YouTube video:' + error, job);
    return null;
  } finally {
    // Clean up local directory and files
    if (fs.existsSync(videoDir)) {
      log('Cleaning up local video directory', job);
      fs.rmSync(videoDir, { recursive: true, force: true });
    }
  }
}
