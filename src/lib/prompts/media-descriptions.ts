export const videoDescriptionPrompt =
  () => `Please provide a detailed description of this video, focusing on all visible elements, their relationships, and the overall context. 
Be sure to describe the actions that are happening in the video at a high level, especially how they relate to people and how they interact with others in public or in their community. 
If there are red square glasses, please describe what the person is doing with them, and you can refer to them as noggles. 
The shape of the noggles are usually large and square, and may be red, blue, green, or other colors. They are often worn by people as glasses, but may also be used as a logo in other contexts, or on other objects, clothing items, or even as larger objects shaped as the glasses. 
Mention noggles if you see them in any of these contexts.
If you see any other branding/text make sure to include it, especially if it's about Nouns, Gnars, Vrbs or the nouns symbol ⌐◨-◨ (The nouns symbol is noggles, or the glasses referred to above).
Try to ascertain the locations of the people and places in the video.
"Flows" or "flows.wtf" is a decentralized grants platform for NounsDAO that streams money to the best builders in Nouns, every second.
Make sure to mention what types of activities are happening in the video,
or otherwise what type of work is being done.
If there are any things said in the video, make sure to include them in the description as quotes and who they are said by.
Always describe in vivid detail the people in the video and what they look like, from their facial features, hair color, height, weight, clothing, and anything else that might be relevant.
Ensure you describe the actions of the people in the video, and what they are doing.
Ensure if you are describing text seen in the video, make sure to describe whether the text is on an overlay over the video, or if it's part of the video itself, or if it's a recording of a website, app, or social platform.`;

export const imageDescriptionPrompt =
  () => `Please provide a detailed description of the following image, 
focusing on all visible elements, their relationships, and the overall context. 
Don't include too much data about the image, just the important details that contribute to the overall meaning.
Ensure that you first define what exactly you believe the image is, whether it's a photo, a painting, a drawing, screenshot of a web page etc.
"Flows" or "flows.wtf" is a decentralized grants platform for NounsDAO that streams money to the best builders in Nouns, every second.
Include information on subjects, actions, settings, emotions, and any inferred meanings to facilitate accurate embedding. 
If you see a person wearing square glasses, especially if they are red, they might be called noggles, so mention the word noggles if it's relevant.
Make sure to pay attention to glasses and these details, but you don't need to mention them in the description if they are not present in the image.
The information you share will be fed to an embedding model, so don't use new lines or other formatting. Make it all lowercase.
Don't forget to include the word noggles if you see big square glasses.
DO NOT return anything if you cannot access the image or it is otherwise unavilable. Just return an empty string.
Let us know the general quality of the image, and if it's blurry, low resolution, or otherwise not very good.
Do not return JSON, just return the text.
The shape of the noggles are usually large and square, and may be red, blue, green, or other colors. They are often worn by people as glasses, but may also be used as a logo in other contexts, or on other objects, clothing items, or even as larger objects shaped as the glasses. 
Mention noggles if you see them in any of these contexts.
Be thorough and detailed in your analysis of the image, what's going on, who is in the image, what they are doing, etc.
Always describe in vivid detail the people in the image and what they look like, from their facial features, hair color, height, weight, clothing, and anything else that might be relevant.
Ensure if the image is a screenshot of a website, or message, that you describe the content of the website or message.
Ensure if the image is a cross-post or repost of another image or person's content, that you make sure to mention that it is a repost or cross-post.
If an image appears that it is a screenshot of a website, app, or social platform, ensure you describe the content of the website, app, or social platform and feel free to make any other observations about what platform the image is from.`;
