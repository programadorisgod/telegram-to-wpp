# Tesseract Pool Specification

## Purpose

Reuse Tesseract OCR workers instead of creating and destroying them per request, reducing initialization overhead and memory churn.

## Requirements

### Requirement: Tesseract Worker Pool

The TesseractOcrService MUST maintain a pool of pre-initialized workers that are reused across requests.

#### Scenario: Worker is reused across requests

- GIVEN a worker is initialized for the first OCR request
- WHEN a second OCR request arrives
- THEN the same worker MUST be reused (no new createWorker call)
- AND the worker MUST be returned to the pool after use

#### Scenario: Pool size is configurable

- GIVEN TESSERACT_POOL_SIZE=2 is configured
- WHEN the service initializes
- THEN exactly 2 workers MUST be pre-created
- AND additional requests MUST wait for an available worker

#### Scenario: Default pool size is 1

- GIVEN no TESSERACT_POOL_SIZE is configured
- WHEN the service initializes
- THEN exactly 1 worker MUST be created

### Requirement: Worker Health Check

Workers MUST be validated before use and recreated if terminated or corrupted.

#### Scenario: Terminated worker is replaced

- GIVEN a worker was terminated unexpectedly
- WHEN the next OCR request tries to use it
- THEN a new worker MUST be created automatically
- AND the pool MUST be updated with the new worker

#### Scenario: Worker initialization failure is handled

- GIVEN Tesseract.createWorker fails (e.g., missing language data)
- WHEN the pool tries to initialize
- THEN the error MUST be logged
- AND subsequent OCR requests MUST fail with a clear error message

### Requirement: Graceful Shutdown

All workers MUST be properly terminated when the application shuts down.

#### Scenario: Workers are terminated on app stop

- WHEN the application receives SIGTERM
- THEN all workers in the pool MUST be terminated
- AND no pending OCR requests MUST be left in-flight
