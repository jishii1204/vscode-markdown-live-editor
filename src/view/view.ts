import {
	defaultValueCtx,
	Editor,
	editorStateCtx,
	editorViewCtx,
	parserCtx,
	rootCtx,
	serializerCtx,
} from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { alertPlugin } from './alertPlugin';
import { emojiPlugin } from './emojiPlugin';
import {
	mathDisplaySchema,
	mathInlineSchema,
	mathViewPlugin,
	remarkMathPlugin,
} from './katexPlugin';
import { mermaidPlugin } from './mermaidPlugin';

declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// Global error handler — show errors visually in the webview
function showError(msg: string): void {
	console.error(`[view] ${msg}`);
	const el = document.createElement('pre');
	el.style.cssText =
		'color:#f44;background:#1e1e1e;padding:16px;margin:16px;border:2px solid #f44;font-size:13px;white-space:pre-wrap;';
	el.textContent = msg;
	document.body.prepend(el);
}
window.onerror = (_msg, _src, _line, _col, err) => {
	showError(`Uncaught: ${err?.stack || err || _msg}`);
};
window.addEventListener('unhandledrejection', (e) => {
	showError(`Unhandled rejection: ${e.reason?.stack || e.reason}`);
});

let editor: Editor | null = null;
let isUpdatingFromExtension = false;

// We compare against the normalized baseline to detect real user changes.
// This prevents the file from being dirtied just by opening it in the editor.
let normalizedBaseline = '';
let isInitializing = false;

async function createEditor(
	container: HTMLElement,
	markdown: string,
): Promise<Editor> {
	isInitializing = true;

	const instance = Editor.make()
		.config((ctx) => {
			ctx.set(rootCtx, container);
			ctx.set(defaultValueCtx, markdown);

			ctx.get(listenerCtx).markdownUpdated((_ctx, md, prevMd) => {
				// During initialization, capture the normalized baseline
				// but don't send any update to the extension host
				if (isInitializing) {
					normalizedBaseline = md;
					return;
				}

				if (isUpdatingFromExtension) {
					return;
				}
				if (md === prevMd) {
					return;
				}

				// Only send if the content actually changed from baseline
				if (md === normalizedBaseline) {
					return;
				}

				vscode.postMessage({ type: 'update', body: md });
				normalizedBaseline = md;
			});
		})
		.use(commonmark)
		.use(gfm)
		.use(remarkMathPlugin)
		.use(mathInlineSchema)
		.use(mathDisplaySchema)
		.use(emojiPlugin)
		.use(listener)
		.use(mermaidPlugin)
		.use(alertPlugin)
		.use(mathViewPlugin);

	await instance.create();

	// Capture the normalized baseline after editor is fully initialized
	instance.action((ctx) => {
		const serializer = ctx.get(serializerCtx);
		normalizedBaseline = serializer(ctx.get(editorStateCtx).doc);
	});

	isInitializing = false;
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
				isUpdatingFromExtension = false;
				return;
			}

			const parser = ctx.get(parserCtx);
			const newDoc = parser(newMarkdown);
			const { tr } = view.state;
			tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
			view.dispatch(tr);

			// Update baseline to the new normalized content
			normalizedBaseline = serializer(ctx.get(editorStateCtx).doc);
			isUpdatingFromExtension = false;
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
			createEditor(container, message.body)
				.then((e) => {
					editor = e;
				})
				.catch((err) => {
					showError(`Editor init failed: ${err?.stack || err}`);
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
