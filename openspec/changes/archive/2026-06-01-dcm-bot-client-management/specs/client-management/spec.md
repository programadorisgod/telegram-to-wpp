# Client Management Specification

## Purpose

Define the WhatsApp-based CRUD behavior for managing tailoring clients, including step-by-step registration with 12 body measurements via the REST API at `http://localhost:4000/api/v1/users`.

## Requirements

### Requirement: Submenu Navigation
The system MUST present the Clientes submenu with options 1.1–1.5, 2 (Ayuda), and 0 (Volver) when the user selects option 1 from the main menu.

#### Scenario: Navigate to submenu
- GIVEN the user is at the main DCM menu
- WHEN they select option 1 (Clientes)
- THEN the system displays the Clientes submenu with all CRUD options

#### Scenario: Invalid submenu option
- GIVEN the user is on the Clientes submenu
- WHEN they send a number not in the valid options
- THEN the system replies "Opción inválida" and re-displays the submenu

### Requirement: Create Client
The system MUST guide the user through a sequential flow: name → email → phone → 12 measurements (format: `AE:42 TD:43 ... LSH:38`). After collecting all data, it MUST POST to `POST /api/v1/users/create`. On success, it confirms. On failure, it shows an error and offers to retry.

#### Scenario: Full creation flow
- GIVEN the user selected 1.1 (Crear cliente nuevo)
- WHEN they provide valid name, email, phone, and all 12 measurements in the expected format
- AND the API responds with 201 and the new user object
- THEN the system confirms "Cliente {name} creado exitosamente" and returns to the submenu

#### Scenario: Duplicate email rejected
- GIVEN the user is in the creation flow and provided an email
- WHEN the API responds with a 409 or duplicate error
- THEN the system shows "El email ya está registrado. Ingrese otro email:" and re-prompts

#### Scenario: Invalid measurement format
- GIVEN the user is providing measurements
- WHEN any value is missing, non-numeric, or outside a reasonable range
- THEN the system rejects with "Formato inválido. Use: AE:42 TD:43 TE:48 CP:100 ALB:28 SB:20 CC:75 CK:98 ALK:22 LT:70 LM:60 LSH:38" and re-prompts

### Requirement: List Clients
The system MUST fetch all clients via `GET /api/v1/users` and display them as a numbered list.

#### Scenario: Clients exist
- GIVEN the user selected 1.2 (Ver todos los clientes)
- WHEN the API returns one or more users
- THEN the system shows each as "{N}. {name} — {email}" and prompts to select one for detail

#### Scenario: No clients registered
- GIVEN the user selected 1.2
- WHEN the API returns an empty array
- THEN the system shows "No hay clientes registrados" and returns to the submenu

### Requirement: View Client Detail
The system MUST fetch a single client via `GET /api/v1/users/:id` and display all fields including measurements with Spanish labels.

#### Scenario: Client exists
- GIVEN the user selected 1.3 and chose a client from the list
- WHEN the API returns the user object
- THEN the system displays name, email, phone, and all 12 measurements using their Spanish names (e.g., AE: Ancho de Espalda, TD: Talle Delantero)

#### Scenario: API returns error
- GIVEN the user requested client details
- WHEN the API returns a 404 or error
- THEN the system shows "Cliente no encontrado" and returns to the submenu

### Requirement: Update Client Field
The system MUST let the user select a client, choose a field to update (name, email, phone, or any of the 12 measurements), provide the new value, and PATCH via `PATCH /api/v1/users/update/:id`.

#### Scenario: Field updated successfully
- GIVEN the user selected 1.4 (Actualizar cliente), picked a client, and chose a field
- WHEN they provide a valid new value
- AND the API responds with the updated user
- THEN the system confirms "{field} actualizado a {value}" and returns to the submenu

#### Scenario: Invalid measurement value
- GIVEN the user is updating a measurement field
- WHEN they provide a non-numeric or out-of-range value
- THEN the system rejects and re-prompts with the expected format for that measurement

### Requirement: Delete Client
The system MUST require explicit confirmation before sending `DELETE /api/v1/users/delete/:id`.

#### Scenario: Confirmed deletion
- GIVEN the user selected 1.5 (Eliminar cliente) and picked a client
- WHEN they respond "Sí" to "¿Está seguro de eliminar a {name}?"
- AND the API confirms deletion
- THEN the system shows "Cliente {name} eliminado" and returns to the submenu

#### Scenario: Cancelled deletion
- GIVEN the user is on the delete confirmation prompt
- WHEN they respond "No" or any non-confirmatory message
- THEN the system does NOT call the API and returns to the submenu

### Requirement: API Error Handling
The system MUST handle connectivity and server errors gracefully across all CRUD operations without crashing the conversation.

#### Scenario: Server unavailable
- GIVEN any CRUD operation is in progress
- WHEN the API request fails with a network or 5xx error
- THEN the system shows "Error del servidor. Intente nuevamente." and returns to the submenu
