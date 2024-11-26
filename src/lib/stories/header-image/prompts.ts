import {
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from '@langchain/core/prompts';

export const storySelectionSystemMessage =
  SystemMessagePromptTemplate.fromTemplate(
    `You are an AI assistant that analyzes images to select the best header image for a story.

Please analyze these images and select the best one for the story header based on:
1. Image quality and resolution
2. Relevance to story content 
3. Visual appeal and composition
4. Professional appearance
5. Ability to capture reader attention
6. Minimize the amount of text in the image

Select the image that best represents the story's main theme or impact. If there is no image that meets the criteria, return null.`
  );

export const storyDataPrompt = HumanMessagePromptTemplate.fromTemplate(
  `Story Title: {{title}}
Story Summary: {{summary}}
Available Images: {{images}}

{{format_instructions}}`
);
