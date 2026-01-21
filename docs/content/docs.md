# Getting Started with Hackbox

Hackbox is a real-time multiplayer game platform that enables developers to create interactive experiences where players use their mobile devices as controllers.

## Overview

Hackbox consists of three main components:

1. **Game Server** - Node.js backend with Socket.io for real-time communication
2. **Player Client** - Vue 3 mobile interface that renders dynamic UI components
3. **Your Host Application** - Custom application that controls the game flow

## How It Works

### Architecture

```
[Host Application] ←→ [Game Server] ←→ [Player Devices]
     (You build)      (Socket.io)     (Mobile browsers)
```

### Basic Flow

1. **Create a Room**: Your host application creates a room via the game server
2. **Players Join**: Players navigate to the player client URL and enter the room code
3. **Send UI Updates**: Your host sends JSON payloads that define what players see on their screens
4. **Receive Player Input**: Players interact with components (buttons, text input, etc.) and events are sent to your host

## Key Concepts

### Member State

The "member state" is a JSON object that defines what a player sees on their device. It includes:

- **Theme**: Colors, fonts, and styling
- **UI Configuration**: Layout and components
- **Components**: Buttons, text, choices, sliders, etc.

### Components

Players see dynamic components rendered from your host's payloads:

- `Text` - Display text with markdown support
- `Button` - Clickable buttons that send events
- `Choices` - Single or multiple choice selection
- `TextInput` - Text entry fields
- `Slider` - Numeric input sliders
- And more...

### Events

Communication is bidirectional:

**Host → Players**: `member.update` event with state changes
**Players → Host**: `msg` and `change` events with user interactions

## Quick Start

### 1. Connect to the Game Server

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:9000');
```

### 2. Create a Room

```typescript
socket.emit('room.create', {
  hostId: 'your-unique-host-id'
}, (response) => {
  console.log('Room code:', response.roomCode);
});
```

### 3. Send UI to Players

```typescript
socket.emit('member.update', {
  to: ['player-user-id'],
  data: {
    theme: {
      mainColor: '#3b82f6',
      backgroundColor: '#ffffff'
    },
    ui: {
      main: {
        components: [
          {
            type: 'Text',
            custom: {
              text: 'Hello, Player!',
              size: 'large'
            }
          },
          {
            type: 'Button',
            custom: {
              text: 'Click Me',
              value: 'button-clicked'
            }
          }
        ]
      }
    }
  }
});
```

### 4. Receive Player Events

```typescript
socket.on('member.msg', (data) => {
  console.log('Player event:', data);
  // { userId: 'player-user-id', value: 'button-clicked', ... }
});
```

## Next Steps

- **[API Reference](#)** - Detailed documentation of all events and payloads
- **[Component Library](#)** - All available UI components and their options
- **[Try the Playground](/playground)** - Interactive tool to test payloads

## Example Use Cases

- **Trivia Games**: Show questions on a shared screen, collect answers from players
- **Party Games**: Custom minigames with phone controls
- **Live Polling**: Real-time audience interaction
- **Collaborative Apps**: Multi-user interactive experiences
