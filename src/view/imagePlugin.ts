import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

// ---------------------------------------------------------------------------
// State: document directory URI (set from extension host via init message)
// ---------------------------------------------------------------------------
let documentDirUri = '';

export function setDocumentDirUri(uri: string): void {
	documentDirUri = uri.endsWith('/') ? uri : `${uri}/`;
}

// ---------------------------------------------------------------------------
// Resolve image src: relative paths → webview URI
// ---------------------------------------------------------------------------
const ABSOLUTE_RE = /^(?:https?:|data:|blob:)/i;

function resolveImageSrc(src: string): string {
	if (!src) return '';
	if (ABSOLUTE_RE.test(src)) return src;
	if (!documentDirUri) return src;

	const cleaned = src.startsWith('./') ? src.slice(2) : src;
	// Encode each path segment to handle spaces, Japanese chars, etc.
	const encoded = cleaned
		.split('/')
		.map((s) => {
			try {
				s = decodeURIComponent(s);
			} catch {
				// already decoded or invalid sequence — use as-is
			}
			return encodeURIComponent(s);
		})
		.join('/');
	return `${documentDirUri}${encoded}`;
}

// ---------------------------------------------------------------------------
// NodeView: render image with resolved src
// ---------------------------------------------------------------------------
export const imageViewPlugin = $prose(() => {
	return new Plugin({
		key: new PluginKey('image-nodeview'),
		props: {
			nodeViews: {
				image: (node: Node) => {
					const container = document.createElement('span');
					container.className = 'image-container';

					const img = document.createElement('img');
					let currentSrc = (node.attrs.src as string) || '';
					let currentAlt = (node.attrs.alt as string) || '';
					let currentTitle = (node.attrs.title as string) || '';

					img.src = resolveImageSrc(currentSrc);
					img.alt = currentAlt;
					if (currentTitle) img.title = currentTitle;

					img.addEventListener('error', () => {
						if (img.parentNode === container) {
							const fallback = document.createElement('span');
							fallback.className = 'image-error';
							fallback.textContent =
								currentAlt || `Image not found: ${currentSrc}`;
							container.replaceChild(fallback, img);
						}
					});

					container.appendChild(img);

					return {
						dom: container,
						update(updatedNode: Node): boolean {
							if (updatedNode.type.name !== 'image') return false;

							const newSrc = (updatedNode.attrs.src as string) || '';
							const newAlt = (updatedNode.attrs.alt as string) || '';
							const newTitle = (updatedNode.attrs.title as string) || '';

							if (
								newSrc === currentSrc &&
								newAlt === currentAlt &&
								newTitle === currentTitle
							) {
								return true;
							}

							currentSrc = newSrc;
							currentAlt = newAlt;
							currentTitle = newTitle;

							// Reset to <img> if it was replaced with error fallback
							if (!container.querySelector('img')) {
								container.textContent = '';
								container.appendChild(img);
							}

							img.src = resolveImageSrc(currentSrc);
							img.alt = currentAlt;
							img.title = currentTitle;

							return true;
						},
						ignoreMutation: () => true,
					};
				},
			},
		},
	});
});
