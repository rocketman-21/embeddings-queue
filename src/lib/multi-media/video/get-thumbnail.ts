import fs from 'fs';
import path from 'path';
import { Job } from 'bullmq';
import { pinFile } from '../pinata/pin-file';
import { createHash } from 'crypto';
import { log } from '../../helpers';
import * as tf from '@tensorflow/tfjs';
import {
  analyzeFrame,
  extractFrame,
  getVideoMetadata,
  initFaceDetector,
} from './thumbnail-utils';

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
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      await tf.setBackend('cpu');
      log(`Starting thumbnail extraction for video: ${videoUrl}`, job);

      // Get video metadata
      log('Getting video metadata...', job);
      const metadata = await getVideoMetadata(videoUrl);
      const duration = metadata.format?.duration || 0;
      if (!duration) throw new Error('Could not determine video duration');
      log(`Video duration: ${duration} seconds`, job);

      // Generate timestamps including start and end of video
      const numFrames = 50;
      const timestamps = Array.from(
        { length: numFrames },
        (_, i) => Math.min(duration - 0.1, (duration * i) / (numFrames - 1)) // Subtract a small epsilon to stay within bounds
      );
      log(
        `Generated ${timestamps.length} timestamps for frame extraction`,
        job
      );

      // Extract frames in batches of 5
      log('Extracting frames in batches of 5...', job);
      const framePaths: string[] = [];
      for (let i = 0; i < timestamps.length; i += 5) {
        const batchTimestamps = timestamps.slice(i, i + 5);
        const batchPromises = batchTimestamps.map(
          async (timestamp, batchIndex) => {
            const frameIndex = i + batchIndex;
            const outputPath = path.join(outputDir, `frame_${frameIndex}.jpg`);

            // Safety check: Ensure timestamp is within video duration
            if (timestamp >= duration) {
              log(
                `Timestamp ${timestamp.toFixed(2)}s exceeds video duration. Skipping frame ${frameIndex + 1}.`,
                job
              );
              return null;
            }

            log(
              `Extracting frame ${frameIndex + 1}/${numFrames} at timestamp ${timestamp.toFixed(2)}s`,
              job
            );
            try {
              return await extractFrame(videoUrl, timestamp, outputPath, job);
            } catch (error: any) {
              log(
                `Failed to extract frame ${frameIndex + 1} at ${timestamp.toFixed(2)}s: ${error.message}`,
                job
              );
              return null;
            }
          }
        );

        const batchFramePaths = await Promise.all(batchPromises);
        framePaths.push(...(batchFramePaths.filter(Boolean) as string[]));
      }

      log(`Successfully extracted ${framePaths.length} frames`, job);

      // Analyze frames
      log(
        'Analyzing frames for visual diversity, quality and face detection...',
        job
      );
      const detector = await initFaceDetector(job);
      const frameStats = await Promise.all(
        framePaths.map((framePath) => analyzeFrame(framePath, detector, job))
      );

      // Select best frame
      const selectedFrame = frameStats.reduce((prev, curr) =>
        curr && curr.score > (prev?.score || 0) ? curr : prev
      );

      if (!selectedFrame) throw new Error('No valid frames found');

      log(
        `Selected best frame with variance score: ${selectedFrame.score}`,
        job
      );

      // Process selected frame
      log('Reading selected frame into buffer...', job);
      const imageBuffer = await fs.promises.readFile(selectedFrame.path);
      const hash = createHash('sha256').update(imageBuffer).digest('hex');
      const name = `video-thumbnail-${hash}`;

      // Upload to IPFS
      log('Pinning thumbnail to IPFS...', job);
      const pinnedUrl = await pinFile(imageBuffer, name, job);
      if (!pinnedUrl) throw new Error('Failed to pin thumbnail to IPFS');
      log(`Successfully pinned thumbnail to IPFS: ${pinnedUrl}`, job);

      // Cleanup
      log('Cleaning up temporary frame files...', job);
      //   await Promise.all(framePaths.map((path) => fs.promises.unlink(path)));
      log('Cleanup complete', job);

      resolve(pinnedUrl);
    } catch (err) {
      log('Error extracting diverse thumbnail: ' + err, job);
      reject(err);
    }
  });
}
