# ElevatePD

ElevatePD is a feature-rich Discord moderation and community management bot built for Elevate Discord Community. [`discord.js`](https://discord.js.org/). It provides staff teams with streamlined ticketing, detailed logging, automated giveaways, reaction-role utilities, and a full suite of slash-based moderation tools backed by persistent storage.

## Features
- **Automatic command & event loading** – Commands are discovered recursively from `src/commands` and registered on the client, while listeners from `src/events` are wired automatically on startup for maintainability.
- **Persistent data with QuickDB** – Uses QuickDB (powered by `better-sqlite3`) to remember configuration, ticket metadata, giveaways, and warning history across restarts.
- **Comprehensive logging** – Slash command `/setlogchannel` lets admins route message delete/edit logs. Event handlers capture single deletes, bulk purges, edits, and reaction role changes with rich embeds.
- **Ticket workflow** – `/ticket setup` publishes configurable button panels. Users open category-specific tickets that create private channels, apply role permissions, and DM a transcript on close.
- **Giveaway automation** – `/giveaway` command schedules timed giveaways, resumes active ones after restarts, and announces winners automatically.
- **Reaction role embed builder** – `/reactionrole-embed` produces Dyno-style embeds with up to five button roles, storing configuration for ongoing management.
- **Moderation suite** – Slash commands support banning, kicking, muting/unmuting, clearing messages, issuing warnings with auto-ban thresholds, and allowing members to view their own warnings.

## Prerequisites
- Node.js 18 LTS or newer (Discord.js v14 requires Node 16.11+, Node 18+ recommended).
- A Discord application with a bot user and the OAuth2 `applications.commands` scope enabled.

## Slash command catalog
### Moderation
| Command | Summary | Required permission |
| --- | --- | --- |
| `/ban` | Ban a user by ID, optionally purge recent messages, and broadcast an embed log. | Ban Members |
| `/kick` | Remove a member with hierarchical safety checks and optional DM notifications. | Kick Members |
| `/mute` | Assigns a configured mute role for a timed or indefinite mute. | Moderate Members |
| `/unmute` | Removes the mute role and clears scheduled unmutes. | Moderate Members |
| `/warn` | Issue, list, and manage warnings with optional auto-ban escalation. | Manage Messages |
| `/clear` | Purge a batch of messages with logging integration. | Manage Messages |

### Administration & utilities
| Command | Summary | Notes |
| --- | --- | --- |
| `/setlogchannel` | Configure or clear channels for delete/edit logging. | Requires Manage Guild. |
| `/ticket setup` | Publish a ticket panel with category-specific buttons and support roles. | Requires Manage Guild. |
| `/giveaway ...` | Start, edit, end, or reroll giveaways with persistent storage. | Requires Manage Messages. |
| `/reactionrole-embed` | Create a customizable button-based reaction-role embed. | Requires Manage Roles. |
| `/warnings` | Allow members to view their personal warning history. | Ephemeral response. |

## Event-driven logging
The bot listens for Discord gateway events to keep staff informed:
- `messageDelete` / `messageDeleteBulk` – Captures deleted content, actor (via audit logs), and channel metadata.
- `messageUpdate` – Stores before/after content in an embed via `utils/embeds.js`.
- `messageReactionAdd` & `messageReactionRemove` – Maintains role assignments for legacy emoji-based reaction roles stored in QuickDB.

Configure log channels with `/setlogchannel` before relying on these alerts.

## Data storage
QuickDB automatically creates a `json.sqlite` database in the project root. Tickets, giveaways, reaction-role mappings, warning histories, and configured channels persist across restarts without any extra setup.
