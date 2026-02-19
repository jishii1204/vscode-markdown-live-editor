import { Editor } from '@milkdown/core';
import { defaultValueCtx, rootCtx, editorViewCtx, serializerCtx, editorStateCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { listener, listenerCtx } from '@milkdown/plugin-listener';

declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

let editor: Editor | null = null;
let isUpdatingFromExtension = false;

async function createEditor(container: HTMLElement, markdown: string): Promise<Editor> {
	const instance = Editor.make()
		.config((ctx) => {
			ctx.set(rootCtx, container);
			ctx.set(defaultValueCtx, markdown);

			ctx.get(listenerCtx).markdownUpdated((_ctx, md, prevMd) => {
				if (isUpdatingFromExtension) {
					return;
				}
				if (md === prevMd) {
					return;
				}
				vscode.postMessage({ type: 'update', body: md });
			});
		})
		.use(commonmark)
		.use(gfm)
		.use(listener);

	await instance.create();
	return instance;
}

function replaceContent(newMarkdown: string): void {
	if (!editor) {
		return;
	}
	isUpdatingFromExtension = true;
	try {
		editor.action((ctx) => {
			const view = ctx.get(editorViewCtx);
			const serializer = ctx.get(serializerCtx);
			const currentMarkdown = serializer(ctx.get(editorStateCtx).doc);

			if (currentMarkdown === newMarkdown) {
				return;
			}

			// Use the parser to convert markdown to a ProseMirror document
			// then replace the entire content
			const { state } = view;
			const { tr } = state;
			tr.replaceWith(0, state.doc.content.size, []);
			view.dispatch(tr);

			// Re-create editor with new content to ensure proper parsing
			const container = document.getElementById('editor');
			if (container) {
				editor?.destroy();
				editor = null;
				isUpdatingFromExtension = true;
				createEditor(container, newMarkdown).then((e) => {
					editor = e;
					isUpdatingFromExtension = false;
				});
			}
		});
	} catch {
		isUpdatingFromExtension = false;
	}
}

// Handle messages from the extension host
window.addEventListener('message', (event) => {
	const message = event.data;
	switch (message.type) {
		case 'init': {
			const container = document.getElementById('editor');
			if (!container) {
				return;
			}
			createEditor(container, message.body).then((e) => {
				editor = e;
			});
			break;
		}
		case 'update': {
			replaceContent(message.body);
			break;
		}
	}
});

// Notify the extension host that the webview is ready
vscode.postMessage({ type: 'ready' });
