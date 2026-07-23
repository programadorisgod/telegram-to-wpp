export { createDatabase } from "./factory.js";
export type { DatabaseConfig, DatabaseDriver, DrizzleDB } from "./types.js";

// ── Schema ────────────────────────────────────────────────────
export { schema } from "./schema/index.js";
export { users } from "./schema/users.js";
export { tasks } from "./schema/tasks.js";
export { projects } from "./schema/projects.js";
export { imageReminders } from "./schema/image_reminders.js";
export { audioReminders } from "./schema/audio_reminders.js";
export { projectUpdates } from "./schema/project_updates.js";
export { notes } from "./schema/notes.js";
export { userStates } from "./schema/user_states.js";
export { reminderEvents } from "./schema/reminder_events.js";
export type {
    User,
    NewUser,
    Task,
    NewTask,
    Project,
    NewProject,
    ImageReminder,
    NewImageReminder,
    AudioReminder,
    NewAudioReminder,
    ProjectUpdate,
    NewProjectUpdate,
    Note,
    NewNote,
    UserState,
    NewUserState,
    ReminderEvent,
    NewReminderEvent,
} from "./schema/index.js";
