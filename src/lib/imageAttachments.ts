import type { ChatMessage } from './messageTypes';

export function extractImageUrls(messages: ChatMessage[]): string[] {
  return messages.flatMap(message => (message.attachments || [])
    .map(attachment => attachment.content)
    .filter((content): content is string => content?.startsWith('data:image/') === true));
}
