import { $remark } from '@milkdown/utils';
import remarkEmoji from 'remark-emoji';

/**
 * Milkdown plugin: converts emoji shortcodes to unicode emoji.
 * e.g. :smile: → 😄, :+1: → 👍
 */
export const emojiPlugin = $remark('remarkEmoji', () => remarkEmoji);
