# Hackbox Docs

Official documentation and interactive playground for Hackbox, built with [Docus](https://docus.dev).

## Features

### Documentation

Built with Docus, providing:

- Modern, responsive design with dark mode
- Full-text search
- Automatic navigation from content structure
- MDC (Markdown Components) support

Content includes:

- Getting started guide
- API reference
- Component library documentation
- Interactive playground guide

### Interactive Playground

The playground (`/playground`) provides a complete environment for testing Hackbox integrations:

- **JSON Editor** - Direct JSON editing with syntax validation
- **Live Device Testing** - Real-time sync with connected mobile devices

## Getting Started

### Installation

```bash
cd docs
npm install
```

### Development

It's preferred to run all hackbox services at once.

```bash
# From the root directory
npm run dev
```

The server is available at `http://localhost:9000`
The client is available at `http://localhost:9001`
The documentation site will be available at `http://localhost:9002/`

## Using the Playground

### Testing on Real Devices

1. Navigate to `/docs/playground`
2. Click "Create Room" to start a server connection
3. Edit the payload in the builder/editor
4. Changes automatically sync to connected devices=
