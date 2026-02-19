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

		// Track whether we are currently applying an edit from the webview
		// to prevent infinite update loops
		let isApplyingEdit = false;

		// Send initial content to webview once it's ready
		const onWebviewReady = webviewPanel.webview.onDidReceiveMessage(
			(message) => {
				if (message.type === 'ready') {
					webviewPanel.webview.postMessage({
						type: 'init',
						body: document.getText(),
					});
				}
			},
		);

		// Handle messages from the webview
		const onDidReceiveMessage = webviewPanel.webview.onDidReceiveMessage(
			(message) => {
				if (message.type === 'update') {
					const text = message.body as string;
					if (text === document.getText()) {
						return;
					}
					isApplyingEdit = true;
					const edit = new vscode.WorkspaceEdit();
					edit.replace(
						document.uri,
						new vscode.Range(0, 0, document.lineCount, 0),
						text,
					);
					vscode.workspace.applyEdit(edit).then(() => {
						isApplyingEdit = false;
					});
				}
			},
		);

		// Sync external changes to webview
		const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
			(e) => {
				if (e.document.uri.toString() !== document.uri.toString()) {
					return;
				}
				if (isApplyingEdit) {
					return;
				}
				webviewPanel.webview.postMessage({
					type: 'update',
					body: document.getText(),
				});
			},
		);

		webviewPanel.onDidDispose(() => {
			onWebviewReady.dispose();
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
		const nonce = getNonce();

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<link href="${styleUri}" rel="stylesheet">
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
