import {
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from '@langchain/core/prompts';

export const storySelectionSystemMessage: SystemMessagePromptTemplate =
  SystemMessagePromptTemplate.fromTemplate(
    `You are an AI assistant that analyzes images to select the best header image for a story.

Please analyze these images and select the best one for the story header based on:
1. Image quality and resolution
2. Relevance to story content 
3. Visual appeal and composition
4. Professional appearance
5. Ability to capture reader attention
6. Minimize the amount of text in the image
7. Prefer horizontal images over vertical images

Select the image that best represents the story's main theme or impact. Return empty string if:
- The images are screenshots of websites, receipts, or other utilitarian content
- The images contain mostly text
- The images are low quality or poorly composed
- The images don't visually represent the story's key themes
- No images meet the quality and relevance criteria above

Return a JSON object with:
- bestImageUrl: string - URL of the best image, or empty string if none are suitable
- reason: string - Brief explanation of why the image was selected or why all were rejected`
  );

export const storyDataPrompt: HumanMessagePromptTemplate =
  HumanMessagePromptTemplate.fromTemplate(
    `Story Title: {title}
Story Summary: {summary}
Available Images: {images}

{format_instructions}

Return a valid JSON object without any markdown formatting or code blocks.`
  );
