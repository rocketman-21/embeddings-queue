import { Job } from 'bullmq';
import { GrantStories } from '../../../database/queries/stories/get-grant-stories';
import { getStoryObjectSchema, storyEditsSchema } from './schemas';
import { log } from '../../helpers';
import { generateObject } from 'ai';
import {
  anthropicModel,
  googleAiStudioModel,
  openAIModel,
  retryAiCallWithBackoff,
} from '../../ai';
import { DR_GONZO_ADDRESS } from '../../config';
import { LimitedStory } from './populate-story-data';

// Processes edits for stories by comparing existing and new stories
export async function processStories(
  existingStories: GrantStories,
  stories: (typeof getStoryObjectSchema)['_type']['stories'],
  job: Job
): Promise<LimitedStory[]> {
  // Create map of existing stories by title+tagline for faster lookup
  const existingStoriesMap = new Map(
    existingStories.map((story) => [`${story.title}:${story.tagline}`, story])
  );
  const processedStories = stories.map((story) => {
    const key = `${story.title}:${story.tagline}`;
    const existingStory = existingStoriesMap.get(key);
    return {
      ...story,
      participants: existingStory?.participants || [],
      headerImage: existingStory?.headerImage || '',
    };
  });

  // Find matching stories and generate edits
  const editsMap = new Map<
    string,
    {
      timestamp: string;
      message: string;
      address: string;
    }[]
  >();

  for (const story of stories) {
    const key = `${story.title}:${story.tagline}`;
    const existingStory = existingStoriesMap.get(key);

    if (existingStory) {
      const storyEdits = await generateEditsForStory(existingStory, story, job);
      editsMap.set(existingStory.id, storyEdits);
    }
  }

  if (editsMap.size === 0) {
    log('No existing stories found, skipping edits', job);
    return processedStories;
  }

  const totalEdits = Array.from(editsMap.values()).reduce(
    (sum, edits) => sum + edits.length,
    0
  );
  log(`Generated ${totalEdits} edits`, job);

  // Add generated edits to stories
  return processedStories.map((story) => {
    const key = `${story.title}:${story.tagline}`;
    const existingStory = existingStoriesMap.get(key);
    const storyEdits = existingStory ? editsMap.get(existingStory.id) : [];

    console.log({ storyEdits });

    return {
      ...story,
      edits: storyEdits || [],
      id: existingStory?.id,
    };
  });
}

// function that generates edits per story
export async function generateEditsForStory(
  existingStory: GrantStories[number] | undefined,
  story: (typeof getStoryObjectSchema)['_type']['stories'][number],
  job: Job
): Promise<
  {
    timestamp: string;
    message: string;
    address: string;
  }[]
> {
  if (!existingStory) {
    return [];
  }

  log(`Generating edits for story ${story.title}`, job);

  const { object } = await retryAiCallWithBackoff(
    (model) => () =>
      generateObject({
        model,
        schema: storyEditsSchema,
        messages: [
          {
            role: 'system',
            content:
              'Generate edit records for story changes. Focus on meaningful updates to content.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Generate edit records for the following story changes. The edits should only reflect differences between the new story and the existing story.
                  
                  <New story>
                  ${JSON.stringify({
                    ...story,
                    completeness: Number(story.completeness).toFixed(2), // Normalize completeness format
                  })}
                  </New story>  
                  
                  <Existing story>
                  ${JSON.stringify({
                    id: existingStory.id,
                    title: existingStory.title,
                    summary: existingStory.summary,
                    keyPoints: existingStory.keyPoints,
                    tagline: existingStory.tagline,
                    timeline: existingStory.timeline,
                    castHashes: existingStory.castHashes,
                    sentiment: existingStory.sentiment,
                    completeness: Number(existingStory.completeness).toFixed(2), // Normalize completeness format
                    complete: existingStory.complete,
                    sources: existingStory.sources,
                    infoNeededToComplete: existingStory.infoNeededToComplete,
                    mintUrls: existingStory.mintUrls,
                    author: existingStory.author,
                  })}
                  </Existing story>
  
                  <Existing edits>
                  ${JSON.stringify(existingStory.edits)}
                  </Existing edits>
  
                  
                  Generate edit records focusing on changes to the story. If there are already edits for the story, make sure to include them in the edit records.
                  Include timestamp, descriptive message, and author address (${DR_GONZO_ADDRESS}). Leave timestamp blank if you don't have the exact timestamp from an existing edit. If adding a new edit, the current timestamp is ${new Date().toISOString()}.

                  If there are no changes to the story, just return the existing edits. Do not return any new edits if there are no changes.
                  `,
              },
            ],
          },
        ],
      }),
    job,
    [anthropicModel, openAIModel, googleAiStudioModel]
  );

  return object.edits;
}
