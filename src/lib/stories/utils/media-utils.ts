import { Job } from 'bullmq';
import { RedisClientType } from 'redis';
import { describeImage } from '../../multi-media/image/describe-image';
import { getTokenMetadataForUrl } from '../../../database/queries/token-metadata/get-token-metadata-for-url';
import { pinByHash } from '../../multi-media/pinata/pin-file';
import { pullYoutubeThumbnail } from '../../multi-media/youtube/download';
import { extractDiverseThumbnail } from '../../multi-media/video/get-thumbnail';

export interface MediaInfo {
  url: string;
  description: string | null;
}

// Helper functions
const isUrlInArray = (url: string, imageUrls: string[]) => {
  return imageUrls.some((img) => img === url);
};

export const isImageUrl = (url: string) => {
  return (
    (url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
      url.includes('imagedelivery.net')) &&
    !url.includes('.m3u8')
  );
};

const isVideoUrl = (url: string) => {
  return url.includes('.m3u8');
};

export const getEmbedDescription = (
  embedSummaries: any[] | null,
  url: string
) => {
  if (!embedSummaries || !Array.isArray(embedSummaries)) return null;
  return embedSummaries.find((summary) => summary.includes(url)) || null;
};

export const processImageUrl = async (
  url: string,
  redisClient: RedisClientType,
  job: Job,
  embedSummaries?: any[] | null
): Promise<MediaInfo | null> => {
  let description = embedSummaries
    ? getEmbedDescription(embedSummaries, url)
    : null;
  if (!description) {
    description = await describeImage(url, redisClient, job);
  }
  return { url, description };
};

export const processVideoUrlForThumbnail = async (
  url: string,
  redisClient: RedisClientType,
  job: Job
) => {
  const thumbnailUrl = await extractDiverseThumbnail(url, '/tmp', job);
  if (!thumbnailUrl) return null;
  const description = await describeImage(thumbnailUrl, redisClient, job);
  return { url: thumbnailUrl, description };
};

export const getYoutubeThumbnail = async (
  url: string,
  job: Job,
  redisClient: RedisClientType
) => {
  const thumbnailUrl = await pullYoutubeThumbnail(url, job);
  if (!thumbnailUrl) return null;
  const description = await describeImage(thumbnailUrl, redisClient, job);
  return { url: thumbnailUrl, description };
};

export const processZoraUrl = async (
  url: string,
  redisClient: RedisClientType,
  job: Job
): Promise<MediaInfo | null> => {
  const metadata = await getTokenMetadataForUrl(url);
  if (!metadata?.image && !metadata?.animationUrl) return null;

  let imageResult: MediaInfo | null = null;
  let animationResult: MediaInfo | null = null;

  // Try image first
  if (metadata.image) {
    const image = metadata.image.split('?')[0];
    const imageRes = await pinByHash(
      image.split('/').pop()!,
      `zora-content-${image.split('/').pop()}`,
      job
    );
    if (imageRes) {
      const description = await describeImage(imageRes, redisClient, job);
      imageResult = { url: imageRes, description };
    }
  }

  // Also try animationUrl if available
  if (metadata.animationUrl) {
    // const animation = metadata.animationUrl.split('?')[0];
    // const animationRes = await pinByHash(
    //   animation.split('/').pop()!,
    //   `zora-content-${animation.split('/').pop()}`,
    //   job
    // );
    // if (animationRes) {
    //   const description = await describeVideo(animationRes, redisClient, job);
    //   animationResult = { url: animationRes, description };
    // }
  }

  return imageResult;
};

export const processEmbed = async (
  embed: any,
  existingUrls: string[],
  redisClient: RedisClientType,
  job: Job,
  imageOnly: boolean,
  embedSummaries?: any[] | null
): Promise<MediaInfo | null> => {
  let parsedEmbed;
  try {
    parsedEmbed = typeof embed === 'string' ? JSON.parse(embed) : embed;
  } catch (e) {
    console.log('Failed to parse embed:', embed);
    return null;
  }

  const embedsToProcess = Array.isArray(parsedEmbed)
    ? parsedEmbed
    : [parsedEmbed];

  for (const singleEmbed of embedsToProcess) {
    const url = singleEmbed.url || singleEmbed;
    if (typeof url !== 'string') continue;

    if (isImageUrl(url) && !isUrlInArray(url, existingUrls)) {
      return await processImageUrl(url, redisClient, job, embedSummaries);
    } else if (url.includes('zora.co') && !isUrlInArray(url, existingUrls)) {
      return await processZoraUrl(url, redisClient, job);
    } else if (url.includes('m3u8')) {
      // If we're only processing images, skip videos
      if (imageOnly)
        return await processVideoUrlForThumbnail(url, redisClient, job);

      return { url, description: null };
    } else if (isYoutubeUrl(url) && !isUrlInArray(url, existingUrls)) {
      return await getYoutubeThumbnail(url, job, redisClient);
    }
  }
  return null;
};

export const isYoutubeUrl = (url: string) => {
  const youtubeRegex =
    /^(?:https?:\/\/)?(?:www\.)?(?:m\.)?(youtube\.com|youtu\.be)/;
  return youtubeRegex.test(url);
};
