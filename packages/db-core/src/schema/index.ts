import { users } from "./users.js";
import { tasks } from "./tasks.js";
import { projects } from "./projects.js";
import { imageReminders } from "./image_reminders.js";
import { audioReminders } from "./audio_reminders.js";
import { projectUpdates } from "./project_updates.js";
import { notes } from "./notes.js";
import { userStates } from "./user_states.js";
import { reminderEvents } from "./reminder_events.js";

export const schema = {
    users,
    tasks,
    projects,
    imageReminders,
    audioReminders,
    projectUpdates,
    notes,
    userStates,
    reminderEvents,
} as const;

export { users } from "./users.js";
export { tasks } from "./tasks.js";
export { projects } from "./projects.js";
export { imageReminders } from "./image_reminders.js";
export { audioReminders } from "./audio_reminders.js";
export { projectUpdates } from "./project_updates.js";
export { notes } from "./notes.js";
export { userStates } from "./user_states.js";
export { reminderEvents } from "./reminder_events.js";

export type { User, NewUser } from "./users.js";
export type { Task, NewTask } from "./tasks.js";
export type { Project, NewProject } from "./projects.js";
export type { ImageReminder, NewImageReminder } from "./image_reminders.js";
export type { AudioReminder, NewAudioReminder } from "./audio_reminders.js";
export type { ProjectUpdate, NewProjectUpdate } from "./project_updates.js";
export type { Note, NewNote } from "./notes.js";
export type { UserState, NewUserState } from "./user_states.js";
export type { ReminderEvent, NewReminderEvent } from "./reminder_events.js";
