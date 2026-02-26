import * as vscode from 'vscode';
import type { HeadingItem, OutlineProvider } from './outlineProvider';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'markdownLiveEditor.editor';

	private activeWebviewPanel: vscode.WebviewPanel | null = null;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outlineProvider: OutlineProvider,
	) {}

	public static register(
		context: vscode.ExtensionContext,
		outlineProvider: OutlineProvider,
	): vscode.Disposable {
		const provider = new MarkdownEditorProvider(context, outlineProvider);

		const disposables: vscode.Disposable[] = [];

		disposables.push(
			vscode.window.registerCustomEditorProvider(
				MarkdownEditorProvider.viewType,
				provider,
				{
					webviewOptions: { retainContextWhenHidden: true },
				},
			),
		);

		disposables.push(
			vscode.commands.registerCommand(
				'markdownLiveEditor.scrollToHeading',
				(pos: number) => {
					provider.activeWebviewPanel?.webview.postMessage({
						type: 'scrollToHeading',
						pos,
					});
				},
			),
		);

		return vscode.Disposable.from(...disposables);
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		const documentDir = vscode.Uri.joinPath(document.uri, '..');
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(
			document.uri,
		)?.uri;
		const localResourceRoots = [this.context.extensionUri, documentDir];
		if (workspaceFolder) {
			localResourceRoots.push(workspaceFolder);
		}
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots,
		};

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// Track active panel for outline and scroll commands
		this.activeWebviewPanel = webviewPanel;
		vscode.commands.executeCommand(
			'setContext',
			'markdownLiveEditor.outlineAvailable',
			true,
		);

		// Track the last content received from the webview to prevent
		// echo: when onDidChangeTextDocument fires for our own edit,
		// we compare against this value instead of relying solely on
		// pendingEdits (which can race with microtask timing).
		let lastWebviewContent = '';

		// Handle all messages from the webview in a single listener
		const onDidReceiveMessage = webviewPanel.webview.onDidReceiveMessage(
			(message) => {
				switch (message.type) {
					case 'ready': {
						const documentDirUri = webviewPanel.webview
							.asWebviewUri(documentDir)
							.toString();
						webviewPanel.webview.postMessage({
							type: 'init',
							body: document.getText(),
							documentDirUri,
						});
						break;
					}
					case 'update': {
						const text = message.body as string;
						if (text === document.getText()) {
							return;
						}
						lastWebviewContent = text;
						const edit = new vscode.WorkspaceEdit();
						edit.replace(
							document.uri,
							new vscode.Range(0, 0, document.lineCount, 0),
							text,
						);
						vscode.workspace.applyEdit(edit);
						break;
					}
					case 'headings': {
						if (this.activeWebviewPanel === webviewPanel) {
							const items = message.items as HeadingItem[];
							this.outlineProvider.updateHeadings(items);
						}
						break;
					}
				}
			},
		);

		// Sync external changes (e.g. from text editor) to webview.
		// Skip if the content matches what the webview last sent us
		// (i.e. the change originated from the webview itself).
		const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
			(e) => {
				if (e.document.uri.toString() !== document.uri.toString()) {
					return;
				}
				const currentText = document.getText();
				if (currentText === lastWebviewContent) {
					return;
				}
				webviewPanel.webview.postMessage({
					type: 'update',
					body: currentText,
				});
			},
		);

		// Track focus changes across multiple editor tabs
		const onDidChangeViewState = webviewPanel.onDidChangeViewState((e) => {
			if (e.webviewPanel.active) {
				this.activeWebviewPanel = webviewPanel;
				vscode.commands.executeCommand(
					'setContext',
					'markdownLiveEditor.outlineAvailable',
					true,
				);
				webviewPanel.webview.postMessage({ type: 'requestHeadings' });
			}
		});

		webviewPanel.onDidDispose(() => {
			onDidReceiveMessage.dispose();
			onDidChangeTextDocument.dispose();
			onDidChangeViewState.dispose();

			if (this.activeWebviewPanel === webviewPanel) {
				this.activeWebviewPanel = null;
				this.outlineProvider.clear();
				vscode.commands.executeCommand(
					'setContext',
					'markdownLiveEditor.outlineAvailable',
					false,
				);
			}
		});
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'view.js'),
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css'),
		);
		const katexCssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'katex.min.css'),
		);
		const mermaidUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mermaid.js'),
		);
		const nonce = getNonce();

		const config = vscode.workspace.getConfiguration('markdownLiveEditor');
		const customCss = config.get<string>('customCss', '');
		const customStyleTag = customCss
			? `\n\t<style nonce="${nonce}">${customCss}</style>`
			: '';

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval'; img-src ${webview.cspSource} https: data: blob:;">
	<link href="${katexCssUri}" rel="stylesheet">
	<link href="${styleUri}" rel="stylesheet">${customStyleTag}
	<title>Markdown Live Editor</title>
</head>
<body>
	<div id="editor" data-mermaid-uri="${mermaidUri}"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = '';
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
