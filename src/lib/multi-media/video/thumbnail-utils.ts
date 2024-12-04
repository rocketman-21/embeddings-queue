import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { Job } from 'bullmq';
import { log } from '../../helpers';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';

// Helper functions
export async function getVideoMetadata(
  videoUrl: string
): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoUrl, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export async function extractFrame(
  videoUrl: string,
  timestamp: number,
  outputPath: string,
  job: Job
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoUrl)
      .seekInput(timestamp)
      .outputOptions(['-vframes 1', '-q:v 2', '-vf scale=1280:-1'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

export async function initFaceDetector(job: Job) {
  try {
    const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
    return await faceDetection.createDetector(model, {
      runtime: 'tfjs',
      modelType: 'short',
      maxFaces: 1,
    });
  } catch (err) {
    log(`Warning: Face detection initialization failed: ${err}`, job);
    return null;
  }
}

export async function analyzeFrame(framePath: string, detector: any, job: Job) {
  let tensor: tf.Tensor3D | null = null;
  try {
    log(`Analyzing frame: ${framePath}`, job);

    const image = await sharp(framePath);
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      throw new Error('Invalid image dimensions');
    }

    const imageData = await image.removeAlpha().raw().toBuffer();

    // Create tensor for analysis
    tensor = tf.tensor3d(new Uint8Array(imageData), [height, width, 3]);
    let hasFaces = false;
    let facePosition = null;

    if (detector) {
      try {
        const faces = await detector.estimateFaces(tensor as tf.Tensor3D);
        hasFaces = faces.length > 0;
        log(`Faces detected: ${faces.length}`, job);

        if (hasFaces) {
          // Extract face bounding box
          facePosition = faces[0].box;
        }
      } catch (err) {
        log(`Warning: Face detection failed for frame: ${err}`, job);
      }
    }

    // Analyze motion blur
    const blurLevel = await estimateMotionBlur(imageData, width, height);
    log(`Estimated Blur Level: ${blurLevel}`, job);

    // Analyze edge density (visual complexity)
    const edgeDensity = await estimateEdgeDensity(imageData, width, height);
    log(`Edge Density: ${edgeDensity}`, job);

    // Analyze rule of thirds compliance
    const ruleOfThirdsScore = evaluateRuleOfThirds(facePosition, width, height);
    log(`Rule of Thirds Score: ${ruleOfThirdsScore}`, job);

    // Analyze image quality
    const stats = await image.stats();
    const { channels, isOpaque, entropy, sharpness } = stats;

    const totalVariance = channels.reduce(
      (sum, channel) => sum + channel.stdev,
      0
    );
    const totalRange = channels.reduce(
      (sum, channel) => sum + (channel.max - channel.min),
      0
    );
    const luminance = channels[0].mean;
    const contrast =
      channels.reduce(
        (sum, channel) => sum + (channel.max - channel.min) / channel.mean,
        0
      ) / channels.length;

    // Estimate noise level
    const noiseLevel = await estimateNoiseLevel(framePath);
    log(`Estimated Noise Level: ${noiseLevel}`, job);

    // Adjusted quality score calculation
    const qualityScore =
      (hasFaces ? 25.0 : 0) + // Bonus for faces
      Math.min(totalVariance, 100) * 0.1 +
      Math.min(totalRange, 500) * 0.1 +
      entropy * 0.1 +
      Math.min(sharpness, 5) * 0.1 +
      (1 - Math.abs(0.5 - luminance / 255)) * 0.1 +
      contrast * 0.05 +
      (isOpaque ? 0.05 : 0) -
      Math.min(noiseLevel, 10) * 0.5 - // Penalty for noise
      Math.min(blurLevel, 10) * 0.5 - // Penalty for motion blur
      (edgeDensity > 0.5 ? 5 : 0) + // Penalize high edge density (clutter)
      ruleOfThirdsScore * 5; // Bonus for rule of thirds compliance

    log(`Quality Score for frame ${framePath}: ${qualityScore}`, job);

    return {
      path: framePath,
      score: qualityScore,
      hasFaces,
    };
  } catch (err) {
    log(`Error analyzing frame ${framePath}: ${err}`, job);
    return null;
  } finally {
    if (tensor) tensor.dispose();
  }
}

// Helper function to estimate motion blur
async function estimateMotionBlur(
  imageData: Buffer,
  width: number,
  height: number
): Promise<number> {
  let imgTensor: tf.Tensor3D | null = null;
  let grayTensor: tf.Tensor | null = null;
  let laplacianKernel: tf.Tensor2D | null = null;
  let edges: tf.Tensor4D | null = null;

  try {
    imgTensor = tf.tensor3d(
      new Uint8Array(imageData),
      [height, width, 3],
      'float32'
    );
    grayTensor = tf.mean(imgTensor, 2);
    laplacianKernel = tf.tensor2d(
      [
        [0, 1, 0],
        [1, -4, 1],
        [0, 1, 0],
      ],
      [3, 3]
    );
    edges = tf.conv2d(
      grayTensor.expandDims(-1) as tf.Tensor4D,
      laplacianKernel.expandDims(-1).expandDims(-1) as tf.Tensor4D,
      1,
      'same'
    );
    const variance = (await tf.moments(edges).variance.data())[0];
    return Math.sqrt(variance);
  } finally {
    if (imgTensor) imgTensor.dispose();
    if (grayTensor) grayTensor.dispose();
    if (laplacianKernel) laplacianKernel.dispose();
    if (edges) edges.dispose();
  }
}

// Helper function to estimate edge density
async function estimateEdgeDensity(
  imageData: Buffer,
  width: number,
  height: number
): Promise<number> {
  let imgTensor: tf.Tensor3D | null = null;
  let grayTensor: tf.Tensor | null = null;
  let sobelX: tf.Tensor2D | null = null;
  let sobelY: tf.Tensor2D | null = null;
  let gradX: tf.Tensor4D | null = null;
  let gradY: tf.Tensor4D | null = null;
  let magnitude: tf.Tensor | null = null;

  try {
    imgTensor = tf.tensor3d(
      new Uint8Array(imageData),
      [height, width, 3],
      'float32'
    );
    grayTensor = tf.mean(imgTensor, 2);
    sobelX = tf.tensor2d([
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1],
    ]);
    sobelY = tf.tensor2d([
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1],
    ]);

    gradX = tf.conv2d(
      grayTensor.expandDims(-1) as tf.Tensor4D,
      sobelX.expandDims(-1).expandDims(-1) as tf.Tensor4D,
      1,
      'same'
    );
    gradY = tf.conv2d(
      grayTensor.expandDims(-1) as tf.Tensor4D,
      sobelY.expandDims(-1).expandDims(-1) as tf.Tensor4D,
      1,
      'same'
    );

    magnitude = tf.sqrt(tf.add(tf.square(gradX), tf.square(gradY)));
    const meanMagnitude = (await tf.mean(magnitude).data())[0];
    return meanMagnitude;
  } finally {
    if (imgTensor) imgTensor.dispose();
    if (grayTensor) grayTensor.dispose();
    if (sobelX) sobelX.dispose();
    if (sobelY) sobelY.dispose();
    if (gradX) gradX.dispose();
    if (gradY) gradY.dispose();
    if (magnitude) magnitude.dispose();
  }
}

// Helper function to evaluate Rule of Thirds compliance
function evaluateRuleOfThirds(
  facePosition: any,
  width: number,
  height: number
): number {
  if (!facePosition) {
    return 0; // No face detected
  }

  const thirdWidth = width / 3;
  const thirdHeight = height / 3;

  const faceCenterX = facePosition.xMin + facePosition.width / 2;
  const faceCenterY = facePosition.yMin + facePosition.height / 2;

  const isOnThirdX =
    Math.abs(faceCenterX - thirdWidth) < width * 0.05 ||
    Math.abs(faceCenterX - 2 * thirdWidth) < width * 0.05;
  const isOnThirdY =
    Math.abs(faceCenterY - thirdHeight) < height * 0.05 ||
    Math.abs(faceCenterY - 2 * thirdHeight) < height * 0.05;

  return isOnThirdX && isOnThirdY ? 1 : 0;
}

// Helper function to estimate noise level
async function estimateNoiseLevel(imagePath: string): Promise<number> {
  const image = await sharp(imagePath).greyscale().toBuffer();
  const { data, info } = await sharp(image)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelData = new Uint8Array(data);
  const mean =
    pixelData.reduce((sum, value) => sum + value, 0) / pixelData.length;

  const variance =
    pixelData.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    pixelData.length;

  // High variance in greyscale image can indicate high noise
  return Math.sqrt(variance);
}
