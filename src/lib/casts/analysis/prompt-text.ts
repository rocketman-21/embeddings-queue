import { GrantWithParent } from '../../../database/queries/grants/get-grant-by-addresses';

export function getGrantDescriptionSections(grants: GrantWithParent[]): string {
  return grants
    .map((grant) => {
      return `<grant_description>
  Grant ID: ${grant.id}
  Description: ${grant.description}
  Parent Flow Description: ${grant.parentGrant?.description}
  </grant_description>`;
    })
    .join('\n\n');
}

export function getTextFromCastContent(
  castContent: string,
  grants: GrantWithParent[],
  summaries: string[],
  profile: { fname: string | null; fid: number | null; bio: string | null },
  builderProfile: { content: string | null }
): string {
  const prompt = `You are an AI assistant tasked with analyzing social media posts ("casts") to determine if they qualify as updates for specific grants. Your goal is to accurately identify genuine grant updates while filtering out unrelated content or general comments about grant programs.
  
  Here's the information you'll be working with:
  
  1. Cast Author:
  Username: ${profile.fname}
  Farcaster ID: ${profile.fid}
  Bio: ${profile.bio}
  
  2. Cast Content:
  <cast>
  <content>
  ${castContent || 'NO CAST CONTENT PROVIDED'}
  </content>
  <attachments>
  ${
    summaries.length
      ? `The update contains the following attachments: ${summaries.join(', ')}`
      : 'The update contains no attachments'
  }
  </attachments>
  </cast>
  
  3. Grant Descriptions:
  ${getGrantDescriptionSections(grants)}
  
  4. Builder Profile:
  <builder_profile>
  ${builderProfile?.content}
  </builder_profile>
  
  Please analyze the cast content to determine if it qualifies as a grant update. Follow these steps in your analysis:
  
  1. Review the cast content, grant descriptions, and builder profile carefully.
  2. List relevant quotes from each source.
  3. Determine if the cast is related to the grant work described in the grant descriptions.
  3a. If the grant has a parent flow, also check if the cast satisfies the parent flow requirements.
  3b. If the cast fits as work for multiple grants that the builder is receiving, choose the most relevant grant ONLY.
  4. Verify that the work or activity described in the cast is being done by the grant recipient themselves.
  5. Check if the work falls within the scope of the grant and parent flow requirements.
  6. Consider any images or attachments mentioned in the cast as part of your analysis.
  7. List pros and cons for whether the cast qualifies as a grant update.
  8. Be absolutely sure that the work or impact being shared is not just re-posted work of others.
  9. If the cast quotes a post from another user, pay attention to the context of the quote and what the user is saying in the quoted post, especially if they tag the grant recipient in the quoted post.
  10. If the grant is an update, do not under any circumstances shorten the grantId in the output. This output will be used to update the database, and we need the full grantId.
  
  Wrap your analysis in <detailed_analysis> tags. After your analysis, provide your determination:
  
  <determination>
  grantId: [grantId if it's a grant update, empty string if not]. Be absolutely sure that the grantId is correct.
  confidence_score: [your confidence score if it's a grant update, on a scale of 0-100]
  explanation: [brief explanation of your decision]
  </determination>
  
  Important considerations:
  
  - If the cast content is not provided, there must be attachments to determine if it's a grant update
  - The cast must describe concrete actions, progress, or tangible contributions related to the grant's goals
  - If the cast is related to multiple grants, choose the most relevant grant ONLY
  - Do not count as updates:
    - Generic comments about grants program
    - Work not done by the grant recipient themselves
    - Token minting unless they authored the media
    - Statements only expressing:
      - General enthusiasm
      - Future intentions 
      - Motivational phrases
      - Slogans/catchphrases
      - Personal philosophies
    - Side projects mentioned in grant description
    - Be absolutely sure that the grantId is correct.
    
  - You can count as updates:
    - Community building activities involving others if led by recipient
    - Work within Nouns sub-cultures (Gnars DAO for extreme sports, Vrbs for public good/artists) if grant-related
    - Basic logical assumptions (e.g. buying supplies without mentioning grant)
  
  If unsure, err on the side of not counting it as an update. The builder profile may be a few days old.
  
  Please begin your analysis now.`;

  return prompt;
}
