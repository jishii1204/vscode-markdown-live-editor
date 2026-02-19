# Markdown Live Editor

A WYSIWYG Markdown editor extension for Visual Studio Code.
Edit your Markdown files visually — what you see is what you get.

> **Note:** This project is in early development.

## Features (Planned)

- WYSIWYG editing of Markdown files directly in VS Code
- Bidirectional sync between source and visual editor
- GFM (GitHub Flavored Markdown) support: tables, task lists, strikethrough
- Slash commands for quick formatting

## Development

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
git clone https://github.com/jishii1204/vscode-markdown-live.git
cd vscode-markdown-live
npm install
```

### Run in Development

1. Open this project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Run the command `Markdown Live Editor: Hello World` from the Command Palette

### Build

```bash
npm run compile
```

## Tech Stack

- TypeScript
- VS Code Extension API (CustomTextEditorProvider)
- esbuild

## License

[MIT](LICENSE)
