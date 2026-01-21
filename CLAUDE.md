# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hackbox is a real-time multiplayer game platform with three main components in a monorepo structure:

1. **player-client** - Vue 3 + TypeScript player interface (runs on mobile devices)
2. **game-server** - Node.js + Express + Socket.io backend
3. **admin** - Nuxt 3 admin panel for viewing stats

## Development Commands

### Running the full stack
```bash
npm run dev  # Runs all three services concurrently
```

### Individual services
```bash
npm run dev:player    # Start player client (Vite dev server)
npm run dev:server    # Start game server on port 9000
npm run dev:docs      # Start docs and playground
```

### Player Client (player-client/)
```bash
cd player-client
npm run dev           # Start Vite dev server
npm run build         # Type check + build for production
npm run type-check    # Run TypeScript compiler check
npm run test:unit     # Run Vitest unit tests
npm run lint          # Run ESLint with auto-fix
```

### Game Server (game-server/)
```bash
cd game-server
npm run dev           # Watch mode: compile TS + auto-restart on port 9000
npm run build         # Compile TypeScript + upload Sentry sourcemaps
npm start             # Run compiled code from dist/
```

## Architecture

### Real-time Communication Flow

The application uses Socket.io for bidirectional communication between players and hosts:

1. **Players** connect via mobile devices → Socket.io → **Game Server** → **Host** (presentation layer)
2. Host sends UI state updates → Game Server → Individual players
3. Players send interactions (button clicks, text input) → Game Server → Host

### Game Server (game-server/)

**Entry Point**: `index.ts` - Sets up Express server, Socket.io, and Sentry monitoring

**Core Architecture**: `RoomService/RoomService.ts`
- Central orchestrator for all game room operations
- Manages bidirectional communication between hosts and players (members)
- Handles socket connection routing via `RoomService.join()` static method
- Maintains separate socket handlers for hosts vs members

**Socket Handlers**:
- `RoomService/hostSocket.ts` - Listens for host commands (`member.update`, `reload`)
- `RoomService/memberSocket.ts` - Listens for player events (`msg`, `change`, `disconnect`)

**Data Models**: `models/`
- `Room.ts` - Game room with 4-letter consonant code (e.g., "BCKD"), host ID, settings
- `Member.ts` - Player in a room with state (UI configuration), online status, metadata

**Database**: `db.ts`
- Drizzle ORM with PostgreSQL
- Two tables: `rooms` and `members`
- Connection string from `DATABASE_URL` environment variable

**Key Concepts**:
- **Member State**: JSON object defining the player's UI (components, theme, layout) - see `helpers.ts:defaultMemberState()`
- **Room Codes**: 4-character consonant codes generated in `models/Room.ts:generateRoomCode()`
- **Host Updates**: Host sends state updates to specific players via `member.update` event
- **Member Messages**: Players send events (`msg`, `change`) that get forwarded to host

### Player Client (player-client/)

**Framework**: Vue 3 with Composition API, TypeScript, Vite

**Entry Point**: `src/main.ts`

**Routes** (`src/router/index.ts`):
- `/` - Lobby view (enter room code)
- `/play` - Active player view (renders dynamic UI components)
- `/twitch-auth-callback` - OAuth redirect handler

**Socket Connection**: `src/lib/sockets/playerSocket.ts`
- Initializes Socket.io client with userId, userName, roomCode from browser storage
- Receives `state.member` events with UI configuration
- Reactive state object that drives the UI rendering

**Dynamic Component System**: `src/views/PlayerView.vue`
- Receives component definitions from server in `state.ui.main.components`
- Dynamically renders components based on `type` field (e.g., "Text", "Button", "Choices")
- Components located in `src/components/` (ButtonComponent.vue, TextComponent.vue, etc.)

**State Management**:
- No Vuex/Pinia - uses Vue's reactive() API
- State structure defined in `src/types.ts` (PlayerState, ThemeState, UiState)
- State helpers in `src/lib/stateHelpers.ts` for processing server state

**Key Files**:
- `src/types.ts` - TypeScript interfaces for state and components
- `src/lib/browserStorage.ts` - LocalStorage helpers for userId, userName, roomCode, Twitch tokens
- `src/lib/markdown.ts` - Markdown rendering utilities
- `src/components/index.ts` - Component exports

### Shared Database Schema

Both game-server and admin connect to the same PostgreSQL database:

**Rooms Table**:
- `code` (primary key) - 4-letter room code
- `hostId` - UUID of room creator
- `closed` - Whether new players can join
- `twitchRequired` - Whether Twitch auth is required
- `persistent` - Whether room persists after host disconnect

**Members Table**:
- `id` (UUID primary key)
- `roomCode` - Foreign key to rooms
- `userId`, `userName` - Player identification
- `state` (JSON) - Player UI configuration
- `online` - Connection status
- `metadata` (JSON) - Additional data (e.g., Twitch info)

## Database Management

The game-server uses Drizzle ORM. Schema is defined in `game-server/db.ts`.

To run database migrations or updates, use drizzle-kit (installed in game-server):
```bash
cd game-server
npx drizzle-kit generate  # Generate migrations
npx drizzle-kit push      # Push schema changes
```

## Environment Variables

### Game Server
- `PORT` - Server port (default: 9000 in dev)
- `DATABASE_URL` - PostgreSQL connection string
- Sentry configuration for error tracking

### Player Client
Vite environment variables in `.env` files following Vite conventions (`VITE_` prefix).

### Admin Panel
- `DATABASE_URL` - PostgreSQL connection string

## Node Version

This project requires Node.js >= 20.12.1 (see `.node-version` and `engines` in package.json files).

## Testing

Player client has Vitest configured:
```bash
cd player-client
npm run test:unit  # Run unit tests with jsdom environment
```

## Important Patterns

### Adding New Player Components

1. Create component in `player-client/src/components/` (e.g., `NewComponent.vue`)
2. Export from `player-client/src/components/index.ts`
3. Component receives `custom` prop with configuration from server
4. Emit socket events via `inject("socket")` for user interactions
5. Host receives events in `RoomService/hostSocket.ts` via `msg` or `change` events

### Updating Member State from Host

Host sends state updates via Socket.io:
```typescript
socket.emit('member.update', {
  to: userId,  // or array of userIds
  data: {
    theme: { /* theme config */ },
    ui: { /* UI config */ }
  }
});
```

Server processes in `game-server/RoomService/hostSocket.ts` and calls `roomService.updateMemberStates()`.
