import fs from 'fs';
import path from 'path';
import { Job } from 'bullmq';
import { pinFile } from '../pinata/pin-file';
import { createHash } from 'crypto';
import { log } from '../../helpers';
import * as tf from '@tensorflow/tfjs';
import sharp from 'sharp';
import {
  analyzeFrame,
  extractFrame,
  getVideoMetadata,
  initFaceDetector,
} from './thumbnail-utils';

interface FrameStats {
  path: string;
  score: number;
}

/**
 * Downloads multiple frames from a video and selects the most visually diverse one
 * @param videoUrl URL of the video to extract frames from
 * @param outputDir Directory to save temporary frames
 * @param job Job object for logging
 * @returns IPFS URL of the selected thumbnail image
 */
export async function extractDiverseThumbnail(
  videoUrl: string,
  outputDir: string,
  job: Job
): Promise<string | null> {
  let framePaths: string[] = [];

  try {
    // Try WebGL first, fallback to CPU
    try {
      await tf.setBackend('webgl');
      log('Using WebGL backend', job);
    } catch (err) {
      log(`WebGL initialization failed: ${err}. Falling back to CPU`, job);
      await tf.setBackend('cpu');
      log('Using CPU backend', job);
    }
    log(`Starting thumbnail extraction for video: ${videoUrl}`, job);

    // Get video metadata
    log('Getting video metadata...', job);
    const metadata = await getVideoMetadata(videoUrl);
    const duration = metadata.format?.duration || 0;
    if (!duration)
      throw new Error('Could not determine video duration from metadata');
    log(`Video duration: ${duration} seconds`, job);

    // Determine number of frames based on duration
    const numFrames = Math.max(
      2,
      duration > 60 ? 20 : Math.min(25, Math.ceil(duration))
    );

    // Generate timestamps with special handling for very short videos
    let timestamps: number[];
    if (numFrames === 2) {
      timestamps = [0.1, Math.max(0.2, duration - 0.1)];
    } else {
      timestamps = Array.from({ length: numFrames }, (_, i) =>
        Math.min(duration - 0.1, 0.1 + ((duration - 0.2) * i) / (numFrames - 1))
      );
    }
    log(
      `Generated ${timestamps.length} timestamps for frame extraction: ${timestamps.join(', ')}`,
      job
    );

    // Initialize face detector once
    const detector = await initFaceDetector(job);
    if (!detector)
      throw new Error(
        'Failed to initialize face detector - check model availability'
      );

    // Extract and analyze frames
    const frameStats: FrameStats[] = [];
    const batchSize = 2;

    for (let i = 0; i < timestamps.length; i += batchSize) {
      const batchTimestamps = timestamps.slice(i, i + batchSize);
      await Promise.all(
        batchTimestamps.map(async (timestamp, batchIndex) => {
          const frameIndex = i + batchIndex;
          const outputPath = path.join(outputDir, `frame_${frameIndex}.jpg`);

          if (timestamp >= duration) {
            log(
              `Timestamp ${timestamp.toFixed(2)}s exceeds duration ${duration}s. Skipping.`,
              job
            );
            return null;
          }

          try {
            // Extract frame
            const framePath = await extractFrame(
              videoUrl,
              timestamp,
              outputPath,
              job
            );
            if (!framePath) {
              log(`Frame extraction failed at timestamp ${timestamp}s`, job);
              return null;
            }

            // Read and resize frame before analysis
            const imageBuffer = await fs.promises.readFile(framePath);
            const resizedBuffer = await sharp(imageBuffer)
              .resize({ width: 320 })
              .jpeg({ quality: 80 })
              .toBuffer();

            // Write resized buffer back
            await fs.promises.writeFile(framePath, resizedBuffer);

            // Analyze frame
            const stats = await analyzeFrame(framePath, detector, job);
            if (stats) {
              frameStats.push(stats);
              framePaths.push(framePath);
              log(`Frame analysis successful - score: ${stats.score}`, job);
            } else {
              log(
                `Frame analysis returned no stats for timestamp ${timestamp}s`,
                job
              );
            }
            return framePath;
          } catch (error: any) {
            log(
              `Failed to process frame ${frameIndex + 1} at ${timestamp}s: ${error.message}`,
              job
            );
            return null;
          }
        })
      );
    }

    if (frameStats.length === 0) {
      log('No valid frames found after processing all timestamps', job);
      return null;
    }

    // Select best frame
    const selectedFrame = frameStats.reduce((prev, curr) =>
      curr && curr.score > (prev?.score || 0) ? curr : prev
    );

    log(
      `Selected best frame with variance score: ${selectedFrame.score} from ${frameStats.length} valid frames`,
      job
    );

    // Process selected frame
    const imageBuffer = await fs.promises.readFile(selectedFrame.path);
    const hash = createHash('sha256').update(imageBuffer).digest('hex');
    const name = `video-thumbnail-${hash}`;

    // Upload to IPFS
    log('Pinning thumbnail to IPFS...', job);
    try {
      const pinnedUrl = await pinFile(imageBuffer, name, job);
      if (!pinnedUrl) throw new Error('IPFS pinning returned empty URL');
      log(`Successfully pinned thumbnail to IPFS: ${pinnedUrl}`, job);
      return pinnedUrl;
    } catch (error: any) {
      throw new Error(`Failed to pin thumbnail to IPFS: ${error.message}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Error extracting diverse thumbnail: ${errorMessage}`, job);
    throw err;
  } finally {
    // Cleanup temporary files
    await Promise.all(
      framePaths.map((path) =>
        fs.promises.unlink(path).catch((err) => {
          log(`Failed to cleanup temporary file ${path}: ${err}`, job);
        })
      )
    );
  }
}
