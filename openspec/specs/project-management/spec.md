# Project Management Specification

## Purpose

Define project-level task grouping with status tracking (completed/pending), priority ordering, and periodic reminders (daily/weekly).

## Requirements

### Requirement: Project Creation

The system MUST allow a registered user to create a project with a unique name within their scope, an optional description, and a priority order.

#### Scenario: Create project

- GIVEN a registered user
- WHEN the user provides a project name "Compras" and priority "1"
- THEN a project record is created with `{ chatId, name, priority, createdAt }`

#### Scenario: Duplicate project name rejected

- GIVEN the user already has a project named "Compras"
- WHEN they attempt to create another "Compras"
- THEN the system SHALL reject with "Ya tienes un proyecto con ese nombre"

### Requirement: Task-Project Association

The system MUST allow assigning a task to a project at creation time. A task SHALL belong to exactly zero or one project.

#### Scenario: Assign task to project

- GIVEN an existing project named "Compras"
- WHEN the user creates a task with `{ projectId: "Compras" }`
- THEN the task is linked to that project

#### Scenario: Unassigned task

- GIVEN no project is specified
- WHEN the user creates a task
- THEN `projectId` is null — task exists independently

### Requirement: Project Status Summary

The system MUST report completed vs pending task counts per project.

#### Scenario: Status query

- GIVEN a project with 5 tasks (2 completed, 3 pending)
- WHEN the user queries project status
- THEN the system responds with "Compras: 3 pendientes, 2 completadas"

### Requirement: Priority Ordering

Projects MUST be ordered by their `priority` field in listings. Lower numbers SHALL appear first.

#### Scenario: Priority sort

- GIVEN projects with priorities [3, 1, 2]
- WHEN the system lists all projects
- THEN they appear in order: priority 1 → priority 2 → priority 3

### Requirement: Periodic Reminders

The system MUST support daily and/or weekly periodic reminders per project. At the configured time, the system SHALL send a summary of pending tasks.

#### Scenario: Daily summary

- GIVEN a project with periodic reminder `{ type: "daily", time: "08:00" }`
- WHEN the cron fires at 08:00
- THEN the system sends "Recordatorio diario — Compras: 3 tareas pendientes"

#### Scenario: Weekly summary

- GIVEN a project with periodic reminder `{ type: "weekly", day: 1 (Monday), time: "09:00" }`
- WHEN the cron fires on Monday at 09:00
- THEN the system sends the weekly pending task summary

### Requirement: Mark Task Complete

The system MUST allow marking a task as completed, updating the project's pending/completed counts.

#### Scenario: Complete task

- GIVEN a pending task in project "Compras"
- WHEN the user marks it complete
- THEN `completed_at` is set
- AND the project's pending count decrements

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Validation | Project name MUST be 1–100 chars after trim. Priority MUST be a positive integer. |
| NF2 | Scheduler | Periodic reminders MUST re-register on process restart from DB state. |
| NF3 | Performance | Project listing with counts MUST complete in <100ms for <100 projects. |
