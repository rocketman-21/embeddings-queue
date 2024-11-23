import { getAllGrantRecipients } from '../../../database/queries/grants/get-all-grant-recipients';
import { getFarcasterProfilesByFnames } from '../../../database/queries/profiles/get-profile';

export async function buildParticipantsMap(object: {
  stories: Array<{
    participants: string[];
  }>;
}) {
  const participantUsernames = object.stories.flatMap(
    (story) => story.participants
  );

  const participantProfiles =
    await getFarcasterProfilesByFnames(participantUsernames);

  const allRecipients = await getAllGrantRecipients();
  const recipientAddresses = new Set(allRecipients.map((r) => r.address));

  const usernameToVerifiedAddress = participantProfiles
    .filter((profile) => profile?.fname)
    .reduce(
      (acc, profile) => {
        const addresses = profile.verifiedAddresses || [];
        const recipientAddress = addresses.find((addr) =>
          recipientAddresses.has(addr)
        );
        acc[profile.fname as string] = recipientAddress || addresses[0] || '';
        return acc;
      },
      {} as Record<string, string>
    );

  return usernameToVerifiedAddress;
}
