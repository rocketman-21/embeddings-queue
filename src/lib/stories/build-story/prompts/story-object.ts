import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from '@langchain/core/prompts';

export const constructStoryObjectSystemMessage: SystemMessagePromptTemplate =
  SystemMessagePromptTemplate.fromTemplate(
    'Answer the user query. Wrap the output in `json` tags\n{format_instructions}'
  );

export const constructStoryObjectUserMessage: HumanMessagePromptTemplate =
  HumanMessagePromptTemplate.fromTemplate(`
      Return the relevant story objects in correct json format.
      Do not paraphrase the text or alter the data from the stories in any way.
      Include all the fields and data from within the <story> tags.
      {storyGenerationText}`);

export const storyObjectPrompt = ChatPromptTemplate.fromMessages([
  constructStoryObjectSystemMessage,
  constructStoryObjectUserMessage,
]);
