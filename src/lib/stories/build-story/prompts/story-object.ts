import { GrantStories } from '../../../../database/queries/stories/get-grant-stories';

export function getStoryObjectSystemMessage(): string {
  return `You are an expert JSON parser. Answer the user query.`;
}

export function getStoryObjectMessage(
  storyGenerationText: string,
  existingStories: GrantStories
): string {
  return `
    Return the relevant story objects in correct json format.
    Do not paraphrase the text or alter the data from the stories in any way.
    Include all the fields and data from within the <story> tags.
    DO NOT ALTER THE STORY IN ANY WAY.
    Do not under any circumstances alter the story summary. 
    You are transcribing the story word for word from the text provided.
    Here is the updated text to transcribe:
    <stories>
    ${storyGenerationText}
    </stories>

    Here are the existing stories:
    <existingStories>
    ${JSON.stringify(existingStories)}
    </existingStories>

    If the text contains story_update tags, update the matching stories from existingStories with the new information.
    For each story_update:
    - Find the story in existingStories with matching id
    - Incorporate the editedContent to the story's summary, incorporating it naturally into the existing story structure and specified section. 
    - However, try not to remove any information from an edited section, but instead add to it.
    - Add the newSources to the story's sources
    - Add the newCastHashes to the story's castHashes
    - Update the completenessScore of the story with the new completenessScore
    
    Otherwise, return any new stories using the schema provided.
    Do not paraphrase or alter any content. Do not ever change the title or tagline of an existing story.
    Return the stories as an array of objects in valid JSON format, not as a string.
    Example format:
    {
      "stories": [
        {
          "title": "Story Title",
          "summary": "Story summary...",
          ...
        }
      ]
    }
  `;
}
