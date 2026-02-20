import * as vscode from 'vscode';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'markdownLiveEditor.editor';

	constructor(private readonly context: vscode.ExtensionContext) {}

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new MarkdownEditorProvider(context);
		return vscode.window.registerCustomEditorProvider(
			MarkdownEditorProvider.viewType,
			provider,
			{
				webviewOptions: { retainContextWhenHidden: true },
			},
		);
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
		};

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// Counter to track in-flight edits from the webview.
		// Using a counter instead of a boolean prevents a race condition
		// where rapid consecutive updates could reset the flag prematurely.
		let pendingEdits = 0;

		// Handle all messages from the webview in a single listener
		const onDidReceiveMessage = webviewPanel.webview.onDidReceiveMessage(
			(message) => {
				switch (message.type) {
					case 'ready':
						webviewPanel.webview.postMessage({
							type: 'init',
							body: document.getText(),
						});
						break;
					case 'update': {
						const text = message.body as string;
						if (text === document.getText()) {
							return;
						}
						pendingEdits++;
						const edit = new vscode.WorkspaceEdit();
						edit.replace(
							document.uri,
							new vscode.Range(0, 0, document.lineCount, 0),
							text,
						);
						vscode.workspace.applyEdit(edit).then(
							() => {
								pendingEdits--;
							},
							() => {
								pendingEdits--;
							},
						);
						break;
					}
				}
			},
		);

		// Sync external changes to webview
		const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
			(e) => {
				if (e.document.uri.toString() !== document.uri.toString()) {
					return;
				}
				if (pendingEdits > 0) {
					return;
				}
				webviewPanel.webview.postMessage({
					type: 'update',
					body: document.getText(),
				});
			},
		);

		webviewPanel.onDidDispose(() => {
			onDidReceiveMessage.dispose();
			onDidChangeTextDocument.dispose();
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
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} https: data: blob:;">
	<link href="${katexCssUri}" rel="stylesheet">
	<link href="${styleUri}" rel="stylesheet">${customStyleTag}
	<title>Markdown Live Editor</title>
</head>
<body>
	<div id="editor"></div>
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
