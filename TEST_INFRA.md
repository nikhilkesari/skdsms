# Sked SMS — E2E Test Infrastructure & Methodology

## 1. Overview & Test Architecture

Sked SMS is an automated SMS scheduling application for Android built with React Native. To guarantee absolute functional correctness, timing reliability, and data persistence across the application lifecycle, this project employs a comprehensive, opaque-box, requirement-driven 4-Tier End-to-End (E2E) Test Suite.

### 1.1 Architecture & Layers Under Test

The test suite exercises the system across all core layers defined in `PROJECT.md`:
```
┌────────────────────────────────────────────────────────────────────────┐
│                        E2E Test Specifications                         │
│  Tier 1: Features | Tier 2: Boundaries | Tier 3: Pairs | Tier 4: Real   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                       E2E Test Harness & Facade                        │
│  - E2ETestContext (ScheduleManager, Alarm Bridge Simulator)             │
│  - Validation Service (Past date blocking, phone E.164, mandatory msg) │
│  - Recurrence Engine (Daily +24h math, optional end-date boundaries)   │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
┌──────────────────▼──────────────┐ ┌──────────────▼─────────────────────┐
│    Persistence Abstraction      │ │      SMS Dispatcher Abstraction     │
│  - ScheduleRepository           │ │  - SmsDispatcher Interface          │
│  - InMemoryScheduleRepository   │ │  - MockSmsDispatcher (Assertions,   │
│  - (AsyncStorage Adapter)       │ │    fault injection, part counter)   │
└─────────────────────────────────┘ └────────────────────────────────────┘
```

### 1.2 Test Runner & Execution Semantics

- **Primary Command**: `npm test` or `npm run test:e2e`
- **Framework Compatibility**:
  - Jest / React Native testing framework (`jest.config.js`)
  - Direct execution via Node test runner: `node __tests__/run_all.js`
- **Isolation & Independence**:
  - Every test case instantiates its own isolated `E2ETestContext` with a clean in-memory persistence repository, mock SMS dispatcher, and alarm manager simulator.
  - Zero shared mutable state across tests. Tests can execute concurrently or in any arbitrary order.
- **Deterministic Expectations**:
  - All test expectations are directly derived from authoritative requirements in `ORIGINAL_REQUEST.md` (R1, R2, R3, R4) and the interface contracts in `PROJECT.md`.
  - Non-deterministic elements (such as UUID generation and current timestamps) are controlled via injected clock baselines (`now`) and UUID validators.

---

## 2. 4-Tier Test Methodology

The test suite is structured into four distinct, progressive tiers designed to validate every dimension of the specification:

### Tier 1: Feature Coverage (Happy Paths)
- **Criterion**: $\ge 5$ tests per inventoried feature covering positive, happy-path flows.
- **Scope**: Verifies that every requirement behaves as expected under valid inputs and standard operating workflows.
- **Test File**: `__tests__/e2e/tier1_features.test.ts`
- **Target Count**: 60 test cases (12 features $\times$ 5 tests).

### Tier 2: Boundary & Corner Cases
- **Criterion**: $\ge 5$ tests per inventoried feature covering extreme limits, error conditions, and adversarial inputs.
- **Scope**: Past dates and boundary buffer windows, whitespace and empty messages, maximum length text, special and control characters, Unicode emojis, non-Latin scripts, malformed phone numbers, duplicate concurrent times, and zero/negative thresholds.
- **Test File**: `__tests__/e2e/tier2_boundaries.test.ts`
- **Target Count**: 60 test cases (12 features $\times$ 5 tests).

### Tier 3: Pairwise Cross-Feature Combinations
- **Criterion**: Systematic combinatorial testing of interacting feature pairs.
- **Scope**: Validates that interactions between subsystems do not cause unexpected side effects or race conditions:
  1. Daily Recurrence + In-Flight Edit / Reschedule
  2. Concurrent Schedules + Mock Dispatch at Identical Timestamps
  3. Schedule Deletion + Alarm Cancellation Verification
  4. Phone Number Normalization + Multipart SMS Segmentation
  5. Past-Date Boundary Validation + Recurrence Rollover
  6. Carrier Failure Injection + Manual Reschedule Workflow
  7. Schedule Status Transitions during Rapid CRUD Operations
  8. Device Reboot Recovery (BootReceiver) + Active Queue Filtering
  9. Recurring Schedule with End Date Reached + Dispatch Termination
  10. Concurrency with Multi-Recipient Broadcast vs Single-Recipient Multi-Schedule
- **Test File**: `__tests__/e2e/tier3_combinations.test.ts`
- **Target Count**: $\ge 10$ test cases.

### Tier 4: Real-World Application Workloads
- **Criterion**: $\ge 5$ comprehensive, multi-step scenarios emulating actual user application workflows from start to finish.
- **Scope**:
  - **Workload 1 (Daily Routine Notification)**: Setting a morning message at 08:00 and an evening message at 21:00 concurrently, triggering the morning dispatch, verifying rollover to the next day, and ensuring the evening schedule remains armed.
  - **Workload 2 (Finite Treatment / Medication Reminder)**: Daily recurring reminder with an optional end date (7 days); verifying daily dispatch and rollover until the end date is exceeded, at which point the schedule transitions to `completed` with no further alarms.
  - **Workload 3 (Carrier Outage Recovery)**: Dispatch fails due to simulated carrier error (`RESULT_ERROR_RADIO_OFF`); status transitions to `failed`; user reschedules the message to a future time; subsequent dispatch succeeds.
  - **Workload 4 (Event Invitation Blast)**: Creating multiple concurrent schedules for distinct contacts across staggered time slots, inspecting the chronological queue, and verifying sequential dispatches.
  - **Workload 5 (Full Lifecycle with Device Reboot)**: Creating schedules, editing text and recipient, triggering a simulated device reboot (`BOOT_COMPLETED`), verifying that pending alarms are re-registered while past/completed schedules are ignored, and finally deleting an active schedule.
- **Test File**: `__tests__/e2e/tier4_workloads.test.ts`
- **Target Count**: $\ge 5$ comprehensive workloads.

---

## 3. Feature Inventory Coverage Mapping

| # | Feature Identifier | Requirement Source | Tier 1 (Happy) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|--------------------|--------------------|----------------|-------------------|-------------------|-------------------|
| F1 | Schedule Creation & Mandatory Validation | `ORIGINAL_REQUEST.md` R1 | T1.F1.1 – T1.F1.5 | T2.F1.1 – T2.F1.5 | T3.1, T3.4 | W1, W2, W4 |
| F2 | Past Date & Time Validation | `ORIGINAL_REQUEST.md` R1 | T1.F2.1 – T1.F2.5 | T2.F2.1 – T2.F2.5 | T3.5 | W1, W3 |
| F3 | Phone Number Normalization & Contact Picker | `ORIGINAL_REQUEST.md` R1 | T1.F3.1 – T1.F3.5 | T2.F3.1 – T2.F3.5 | T3.4 | W4 |
| F4 | Schedule Persistence & Active Queue Retrieval | `ORIGINAL_REQUEST.md` R2 | T1.F4.1 – T1.F4.5 | T2.F4.1 – T2.F4.5 | T3.7, T3.8 | W1, W4, W5 |
| F5 | Edit & Reschedule Lifecycle | `ORIGINAL_REQUEST.md` R2 | T1.F5.1 – T1.F5.5 | T2.F5.1 – T2.F5.5 | T3.1, T3.6 | W3, W5 |
| F6 | Schedule Deletion & Alarm Cancellation | `ORIGINAL_REQUEST.md` R2 | T1.F6.1 – T1.F6.5 | T2.F6.1 – T2.F6.5 | T3.3 | W5 |
| F7 | Concurrent Multiple Schedules Support | `ORIGINAL_REQUEST.md` R2 | T1.F7.1 – T1.F7.5 | T2.F7.1 – T2.F7.5 | T3.2, T3.10 | W1, W4 |
| F8 | Daily Recurrence Engine & End-Date Bounds | `ORIGINAL_REQUEST.md` R2 | T1.F8.1 – T1.F8.5 | T2.F8.1 – T2.F8.5 | T3.1, T3.9 | W1, W2 |
| F9 | SMS Dispatcher Abstraction & Mock Dispatch | `ORIGINAL_REQUEST.md` R3 | T1.F9.1 – T1.F9.5 | T2.F9.1 – T2.F9.5 | T3.2 | W1, W2, W3 |
| F10 | SMS Message Segmentation (GSM-7 / UCS-2) | `ORIGINAL_REQUEST.md` R3 | T1.F10.1 – T1.F10.5 | T2.F10.1 – T2.F10.5 | T3.4 | W4 |
| F11 | Carrier Error Handling & Fault Injection | `ORIGINAL_REQUEST.md` R3 | T1.F11.1 – T1.F11.5 | T2.F11.1 – T2.F11.5 | T3.6 | W3 |
| F12 | Device Reboot Recovery (BootReceiver) | `ORIGINAL_REQUEST.md` R3 | T1.F12.1 – T1.F12.5 | T2.F12.1 – T2.F12.5 | T3.8 | W5 |

**Total Test Suite Volume**: 135+ automated end-to-end tests across 4 tiers.

---

## 4. Running the Tests

To run the complete E2E test suite:

```bash
# Via npm test (standard project runner)
npm test

# Via dedicated E2E script
npm run test:e2e

# Direct standalone runner (zero configuration)
node __tests__/run_all.js
```
