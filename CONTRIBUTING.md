# Contributing

## Prerequisites

- Node.js 22+
- npm

## Setup

```bash
git clone https://github.com/jishii1204/vscode-markdown-live.git
cd vscode-markdown-live
npm install
```

## Run in Development

1. Open this project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Open any `.md` file, then use the command palette or context menu to open it with Markdown Live Editor

## Build

```bash
npm run compile
```

## Lint

```bash
npm run lint        # Check
npm run lint:fix    # Auto-fix
```

## Tech Stack

- TypeScript
- VS Code Extension API (CustomTextEditorProvider)
- [Milkdown](https://milkdown.dev/) — WYSIWYG Markdown editor framework
- [ProseMirror](https://prosemirror.net/) — Rich text editing toolkit
- [highlight.js](https://highlightjs.org/) — Syntax highlighting
- [Mermaid](https://mermaid.js.org/) — Diagram rendering
- [KaTeX](https://katex.org/) — Math typesetting
- [esbuild](https://esbuild.github.io/) — Bundler
- [Biome](https://biomejs.dev/) — Linter & formatter
