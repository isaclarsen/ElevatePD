# ElevatePD

ElevatePD is a feature-rich Discord moderation and community management bot built for Elevate Discord Community. [`discord.js`](https://discord.js.org/). It provides staff teams with streamlined ticketing, detailed logging, automated giveaways, reaction-role utilities, and a full suite of slash-based moderation tools backed by persistent storage.

## Features
- **Automatic command & event loading** – Commands are discovered recursively from `src/commands` and registered on the client, while listeners from `src/events` are wired automatically on startup for maintainability.【F:src/main.js†L54-L96】
- **Persistent data with QuickDB** – Uses QuickDB (powered by `better-sqlite3`) to remember configuration, ticket metadata, giveaways, and warning history across restarts.【F:src/main.js†L42-L50】【F:src/commands/Tickets/ticket.js†L74-L139】【F:src/commands/User/warnings.js†L19-L66】【F:src/commands/Giveaway/giveaway.js†L10-L114】
- **Comprehensive logging** – Slash command `/setlogchannel` lets admins route message delete/edit logs. Event handlers capture single deletes, bulk purges, edits, and reaction role changes with rich embeds.【F:src/commands/Admin/setlogchannel.js†L6-L47】【F:src/events/messageDeleteLog.js†L1-L68】【F:src/events/messageDeleteBulkLog.js†L1-L68】【F:src/events/messageUpdateLog.js†L1-L54】【F:src/events/messageReactionAdd.js†L1-L120】【F:src/events/messageReactionRemove.js†L1-L132】
- **Ticket workflow** – `/ticket setup` publishes configurable button panels. Users open category-specific tickets that create private channels, apply role permissions, and DM a transcript on close.【F:src/commands/Tickets/ticket.js†L24-L199】【F:src/main.js†L98-L244】【F:src/main.js†L245-L358】
- **Giveaway automation** – `/giveaway` command schedules timed giveaways, resumes active ones after restarts, and announces winners automatically.【F:src/commands/Giveaway/giveaway.js†L1-L225】【F:src/main.js†L359-L472】
- **Reaction role embed builder** – `/reactionrole-embed` produces Dyno-style embeds with up to five button roles, storing configuration for ongoing management.【F:src/commands/reactionrole-embed.js†L1-L152】
- **Moderation suite** – Slash commands support banning, kicking, muting/unmuting, clearing messages, issuing warnings with auto-ban thresholds, and allowing members to view their own warnings.【F:src/commands/Moderation/ban.js†L1-L140】【F:src/commands/Moderation/kick.js†L1-L160】【F:src/commands/Moderation/mute.js†L1-L200】【F:src/commands/Moderation/unmute.js†L1-L120】【F:src/commands/Moderation/clear.js†L1-L120】【F:src/commands/Moderation/warn.js†L1-L260】【F:src/commands/User/warnings.js†L1-L74】

## Prerequisites
- Node.js 18 LTS or newer (Discord.js v14 requires Node 16.11+, Node 18+ recommended).
- A Discord application with a bot user and the OAuth2 `applications.commands` scope enabled.

## Slash command catalog
### Moderation
| Command | Summary | Required permission |
| --- | --- | --- |
| `/ban` | Ban a user by ID, optionally purge recent messages, and broadcast an embed log. | Ban Members【F:src/commands/Moderation/ban.js†L1-L136】 |
| `/kick` | Remove a member with hierarchical safety checks and optional DM notifications. | Kick Members【F:src/commands/Moderation/kick.js†L1-L112】 |
| `/mute` | Assigns a configured mute role for a timed or indefinite mute. | Moderate Members【F:src/commands/Moderation/mute.js†L1-L150】 |
| `/unmute` | Removes the mute role and clears scheduled unmutes. | Moderate Members【F:src/commands/Moderation/unmute.js†L1-L96】 |
| `/warn` | Issue, list, and manage warnings with optional auto-ban escalation. | Manage Messages【F:src/commands/Moderation/warn.js†L1-L240】 |
| `/clear` | Purge a batch of messages with logging integration. | Manage Messages【F:src/commands/Moderation/clear.js†L1-L88】 |

### Administration & utilities
| Command | Summary | Notes |
| --- | --- | --- |
| `/setlogchannel` | Configure or clear channels for delete/edit logging. | Requires Manage Guild.【F:src/commands/Admin/setlogchannel.js†L6-L47】 |
| `/ticket setup` | Publish a ticket panel with category-specific buttons and support roles. | Requires Manage Guild.【F:src/commands/Tickets/ticket.js†L24-L199】 |
| `/giveaway ...` | Start, edit, end, or reroll giveaways with persistent storage. | Requires Manage Messages.【F:src/commands/Giveaway/giveaway.js†L116-L225】 |
| `/reactionrole-embed` | Create a customizable button-based reaction-role embed. | Requires Manage Roles.【F:src/commands/reactionrole-embed.js†L1-L152】 |
| `/warnings` | Allow members to view their personal warning history. | Ephemeral response.【F:src/commands/User/warnings.js†L1-L66】 |

## Event-driven logging
The bot listens for Discord gateway events to keep staff informed:
- `messageDelete` / `messageDeleteBulk` – Captures deleted content, actor (via audit logs), and channel metadata.【F:src/events/messageDeleteLog.js†L1-L108】【F:src/events/messageDeleteBulkLog.js†L1-L89】
- `messageUpdate` – Stores before/after content in an embed via `utils/embeds.js`.【F:src/events/messageUpdateLog.js†L1-L61】【F:src/utils/embeds.js†L1-L28】
- `messageReactionAdd` & `messageReactionRemove` – Maintains role assignments for legacy emoji-based reaction roles stored in QuickDB.【F:src/events/messageReactionAdd.js†L1-L132】【F:src/events/messageReactionRemove.js†L1-L132】

Configure log channels with `/setlogchannel` before relying on these alerts.

## Data storage
QuickDB automatically creates a `json.sqlite` database in the project root. Tickets, giveaways, reaction-role mappings, warning histories, and configured channels persist across restarts without any extra setup.【F:src/main.js†L42-L50】【F:src/commands/Giveaway/giveaway.js†L12-L114】【F:src/commands/Tickets/ticket.js†L74-L199】 Back up this file if you migrate hosts.
