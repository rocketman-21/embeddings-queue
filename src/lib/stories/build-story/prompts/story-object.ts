export function getSystemMessage(): string {
  return `You are an expert JSON parser. Answer the user query.`;
}

export function getUserMessage(storyGenerationText: string): string {
  return `
    Return the relevant story objects in correct json format.
    Do not paraphrase the text or alter the data from the stories in any way.
    Include all the fields and data from within the <story> tags.
    DO NOT ALTER THE STORY IN ANY WAY.
    Do not under any circumstances alter the story summary. 
    You are transcribing the story word for word from the text provided.

    Here is the text to transcribe:
    <stories>
    ${storyGenerationText}
    </stories>

    Return the stories using the schema provided, paraphrasing nothing.
  `;
}
