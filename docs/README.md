# Hackbox Documentation Site

This is the official documentation and integration testing site for Hackbox.

## Features

### Documentation
- Getting started guide
- API reference
- Component library documentation
- Example use cases

### Interactive Playground
The playground provides a complete environment for testing Hackbox integrations:

#### Visual Builder
- Add and configure components (Text, Button, Choices, TextInput, Slider)
- Customize theme (colors, styling)
- Drag and reorder components
- Real-time preview

#### JSON Editor
- Direct JSON editing with syntax validation
- Syncs with visual builder
- Error highlighting

## Getting Started

### Installation

```bash
cd docs
npm install
```

### Development

```bash
# From docs directory
npm run dev

# Or from root directory
npm run dev-docs
```

The site will be available at `http://localhost:3001/`

## Using the Playground

### Testing on Real Devices

1. Navigate to `/playground`
2. Click "Create Room" to start a game server connection
3. Edit the payload in the builder/editor
4. Changes automatically sync to connected devices

**Note**: Requires the game server to be running on `http://localhost:9000`

```bash
# Start game server from root
npm run dev-backend
```

### Adding New Component Types

1. Add editor component in `components/editors/[Type]Editor.vue`
3. Update `ComponentBuilder.vue` to include the new type in `componentTypes` array
4. Add default configuration in the `addComponent` method
