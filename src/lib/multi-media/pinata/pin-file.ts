import axios from 'axios';
import { Job } from 'bullmq';
import { log } from '../../helpers';
import { retryWithExponentialBackoff } from '../../retry/retry-fetch';

const jwt = process.env.PINATA_JWT;

type PinJobStatus =
  | 'prechecking'
  | 'retrieving'
  | 'expired'
  | 'over_free_limit'
  | 'over_max_size'
  | 'invalid_object'
  | 'bad_host_node'
  | 'pinned'
  | 'pinning';

interface PinJobResponse {
  count: number;
  rows: Array<{
    id: string;
    ipfs_pin_hash: string;
    date_queued: string;
    name: string;
    status: PinJobStatus;
    keyvalues: any;
    host_nodes: string[];
    pin_policy: {
      regions: Array<{
        id: string;
        desiredReplicationCount: number;
      }>;
      version: number;
    };
  }>;
}
/**
 * Helper function to check if content is already available on Pinata gateway
 */
async function checkGatewayAvailability(
  hash: string,
  job: Job
): Promise<string | null> {
  try {
    const gatewayUrl = `https://${process.env.PINATA_GATEWAY_URL}/ipfs/${hash}`;
    log(`Checking if content already available at ${gatewayUrl}`, job);

    const response = await axios.head(gatewayUrl, {
      headers: {
        'x-pinata-gateway-token': process.env.PINATA_GATEWAY_KEY,
      },
      timeout: 5000,
    });

    if (response.status === 200) {
      log('Content already available, skipping pin', job);
      return gatewayUrl;
    }
    return null;
  } catch (error) {
    log('Content not found in gateway, proceeding with pin', job);
    return null;
  }
}

/**
 * Pins content to IPFS via Pinata using a CID/hash and monitors the pin status
 */
export async function pinByHash(
  hash: string,
  name: string,
  job: Job
): Promise<string | false> {
  try {
    // Check if content is already available via gateway before pinning
    const existingUrl = await checkGatewayAvailability(hash, job);
    if (existingUrl) {
      return existingUrl;
    }
    // Start the pinning process
    await retryWithExponentialBackoff(
      async () => {
        const response = await axios.post(
          'https://api.pinata.cloud/pinning/pinByHash',
          {
            hashToPin: hash,
            pinataMetadata: {
              name,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        if (response.status !== 200) {
          throw new Error(`Failed to pin content: ${response.status}`);
        }

        return response.data;
      },
      job,
      3,
      1000
    );

    // Monitor pin status
    let attempts = 0;
    const maxAttempts = 30; // Increased from 10 to 30 attempts
    const delayMs = 5000; // Increased delay between checks to 5 seconds

    while (attempts < maxAttempts) {
      const statusResponse = await axios.get<PinJobResponse>(
        `https://api.pinata.cloud/pinning/pinJobs?ipfs_pin_hash=${hash}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
          timeout: 10000,
        }
      );

      if (statusResponse.data.rows.length > 0) {
        const pinStatus = statusResponse.data.rows[0].status;

        if (
          pinStatus === 'retrieving' ||
          pinStatus === 'prechecking' ||
          pinStatus === 'pinning'
        ) {
          log(`Pin status for ${hash}: ${pinStatus}`, job);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          attempts++;
          continue;
        }

        if (pinStatus === 'pinned') {
          log(`Successfully pinned content with hash ${hash}`, job);
          return `https://${process.env.PINATA_GATEWAY_URL}/ipfs/${hash}`;
        }

        if (
          pinStatus === 'expired' ||
          pinStatus === 'over_free_limit' ||
          pinStatus === 'over_max_size' ||
          pinStatus === 'invalid_object' ||
          pinStatus === 'bad_host_node'
        ) {
          log(`Pin failed with status: ${pinStatus}`, job);
          return false;
        }

        // If we get here, pinning was successful
        log(`Successfully pinned content with hash ${hash}`, job);
        return `https://${process.env.PINATA_GATEWAY_URL}/ipfs/${hash}`;
      } else {
        log(`No pin job found for hash ${hash}`, job);
        return `https://${process.env.PINATA_GATEWAY_URL}/ipfs/${hash}`;
      }
    }

    log(`Timed out waiting for pin status for hash ${hash}`, job);
    return false;
  } catch (error: any) {
    log(`Error pinning content: ${error.message}`, job);
    return false;
  }
}
