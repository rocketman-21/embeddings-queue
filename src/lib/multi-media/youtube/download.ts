import { Job } from 'bullmq';
import { log } from '../../helpers';
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs';
import { dirname } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ytdl from '@distube/ytdl-core';
import { ffmpegPath, ffprobePath } from '../video/utils';
import { downloadAndProcessImage } from '../image/utils';
import { pinByHash, pinFile } from '../pinata/pin-file';
import { createHash } from 'crypto';

const MAX_RETRIES = 3;
const DOWNLOAD_TIMEOUT = 30000; // 30 seconds
const RETRY_DELAY = 5000; // 5 seconds

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadStream(
  url: string,
  outputPath: string,
  options: ytdl.downloadOptions,
  streamType: 'audio' | 'video',
  job: Job
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const stream = ytdl(url, {
          ...options,
          requestOptions: {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          },
        });

        let lastProgress = Date.now();
        let hasStarted = false;
        let lastLoggedPercent = -1;
        const progressTimeout = setInterval(() => {
          if (hasStarted && Date.now() - lastProgress > DOWNLOAD_TIMEOUT) {
            clearInterval(progressTimeout);
            stream.destroy();
            reject(new Error(`${streamType} download stalled`));
          }
        }, 5000);

        const writer = createWriteStream(outputPath);

        stream.once('response', () => {
          hasStarted = true;
          log(`${streamType} stream started`, job);
        });

        stream.on('progress', (_, downloaded, total) => {
          lastProgress = Date.now();
          const percent = Math.round((downloaded / total) * 100);
          if (percent % 10 === 0 && percent !== lastLoggedPercent) {
            // Log every 10% but only once
            lastLoggedPercent = percent;
            log(`${streamType} download progress: ${percent}%`, job);
          }
        });

        stream.on('error', (err) => {
          clearInterval(progressTimeout);
          writer.destroy();
          reject(err);
        });

        writer.on('finish', () => {
          clearInterval(progressTimeout);
          log(`${streamType} download completed`, job);
          resolve(true);
        });

        writer.on('error', (err) => {
          clearInterval(progressTimeout);
          stream.destroy();
          reject(err);
        });

        stream.pipe(writer);
      });

      return; // Success - exit retry loop
    } catch (err: any) {
      log(
        `${streamType} download attempt ${attempt} failed: ${err.message}`,
        job
      );

      if (attempt < MAX_RETRIES) {
        log(
          `Retrying ${streamType} download in ${RETRY_DELAY / 1000} seconds...`,
          job
        );
        await delay(RETRY_DELAY);
      } else {
        throw new Error(
          `${streamType} download failed after ${MAX_RETRIES} attempts`
        );
      }
    }
  }
}

export async function downloadYoutubeVideo(
  url: string,
  outputPath: string,
  job: Job
): Promise<void> {
  log(`Downloading YouTube video from ${url} to ${outputPath}`, job);

  if (!ytdl.validateURL(url)) {
    throw new Error('Invalid YouTube URL provided');
  }

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    log('Output directory created: ' + outputDir, job);
  }

  const tempAudioPath = `${outputPath}.audio.mp4`;
  const tempVideoPath = `${outputPath}.video.mp4`;

  const cleanup = () => {
    [tempAudioPath, tempVideoPath].forEach((path) => {
      if (existsSync(path)) {
        unlinkSync(path);
        log(`Cleaned up: ${path}`, job);
      }
    });
  };

  try {
    // Get video info first
    const videoInfo = await ytdl.getInfo(url);
    log(`Video title: ${videoInfo.videoDetails.title}`, job);

    // Select lowest quality audio format that's still audible
    const audioFormat = ytdl.chooseFormat(videoInfo.formats, {
      quality: 'lowestaudio',
      filter: 'audioonly',
    });
    log(`Selected audio format: ${audioFormat.mimeType}`, job);

    // Download audio
    await downloadStream(
      url,
      tempAudioPath,
      {
        format: audioFormat,
        filter: 'audioonly',
      },
      'audio',
      job
    );

    // Log all available video qualities
    const videoFormats = ytdl.filterFormats(videoInfo.formats, 'videoonly');

    // Sort formats by resolution (highest to lowest) and deduplicate
    const sortedFormats = Array.from(
      new Set(videoFormats.map((f) => f.qualityLabel))
    ).sort((a, b) => {
      const aRes = parseInt(a.replace('p', ''));
      const bRes = parseInt(b.replace('p', ''));
      return bRes - aRes;
    });

    log(`Available video formats: ${sortedFormats.join(', ')}`, job);

    // Select 720p if available, otherwise highest quality under 720p
    const targetQuality =
      sortedFormats.find((q) => parseInt(q) <= 720) ||
      sortedFormats[sortedFormats.length - 1];
    const videoFormat = ytdl.chooseFormat(videoInfo.formats, {
      filter: (format) => format.qualityLabel === targetQuality,
    });
    if (!videoFormat) {
      throw new Error(`No video format found for quality: ${targetQuality}`);
    }
    log(
      `Selected video format: ${videoFormat.mimeType} (${videoFormat.qualityLabel})`,
      job
    );

    // Download video
    await downloadStream(
      url,
      tempVideoPath,
      {
        format: videoFormat,
        filter: 'videoonly',
      },
      'video',
      job
    );

    // Merge streams
    log('Merging audio and video streams...', job);
    await new Promise((resolve, reject) => {
      // Ensure output directory exists
      const outputDir = dirname(outputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      ffmpeg()
        .setFfmpegPath(ffmpegPath)
        .setFfprobePath(ffprobePath)
        .input(tempVideoPath)
        .input(tempAudioPath)
        .outputOptions(['-c:v', 'copy', '-c:a', 'aac'])
        .toFormat('mp4') // Explicitly set output format
        .save(outputPath)
        .on('start', (commandLine) => {
          log(`FFmpeg started with command: ${commandLine}`, job);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            log(`Merge progress: ${Math.round(progress.percent)}%`, job);
          }
        })
        .on('end', () => {
          log('Merge completed successfully', job);
          cleanup();
          resolve(true);
        })
        .on('error', (err) => {
          log(`FFmpeg error: ${err.message}`, job);
          cleanup(); // Ensure cleanup happens on error too
          reject(err);
        });
    });
  } catch (err: any) {
    cleanup();
    throw new Error(`YouTube download failed: ${err.message}`);
  }
}
export const pullYoutubeThumbnail = async (url: string, job: Job) => {
  try {
    const info = await ytdl.getInfo(url);
    const thumbnails = info.videoDetails.thumbnails;

    // Get highest quality thumbnail
    const bestThumbnail = thumbnails.reduce((prev, current) => {
      return prev.width > current.width ? prev : current;
    });

    log(`Found YouTube thumbnail: ${bestThumbnail.url}`, job);

    // Download and process the thumbnail image
    const processedImage = await downloadAndProcessImage(
      bestThumbnail.url,
      job
    );
    if (!processedImage) {
      log('Failed to process thumbnail image', job);
      return null;
    }

    // Create hash from buffer for pinata
    const hash = createHash('sha256')
      .update(processedImage.buffer)
      .digest('hex');
    const name = `youtube-thumbnail-${hash}`;

    // Pin to IPFS via Pinata
    const pinnedUrl = await pinFile(processedImage.buffer, name, job);
    if (!pinnedUrl) {
      log('Failed to pin thumbnail to IPFS', job);
      return null;
    }

    return pinnedUrl;
  } catch (err: any) {
    log(`Error getting YouTube thumbnail: ${err.message}`, job);
    return null;
  }
};
