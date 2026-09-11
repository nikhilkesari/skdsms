# Project: Sked SMS

## Architecture
Sked SMS is an Android mobile application built with React Native for scheduling automated SMS messages to selected contacts at specified dates and times. It features a clean separation between pure TypeScript business domain logic, abstract I/O interfaces, React Native UI components, and native Android platform services.

```
┌────────────────────────────────────────────────────────────────────────┐
│                         React Native UI Layer                          │
│  - AppHeader & ScheduleList (FlatList, EmptyState, ScheduleCard)       │
│  - FloatingActionButton (FAB, bottom-right corner)                     │
│  - ScheduleFormModal (Create/Edit dialog, validation feedback)         │
│  - ContactPickerInput (READ_CONTACTS, Intent.ACTION_PICK, manual)      │
│  - DateTimePickerInput (DatePickerDialog, TimePickerDialog)            │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                     Domain & State Management Layer                    │
│  - ScheduleContext & useSchedules Hook                                 │
│  - Validation Service (Past date blocking, phone E.164, mandatory msg) │
│  - Recurrence Engine (Daily calculation, optional end date bounds)     │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
┌──────────────────▼──────────────┐ ┌──────────────▼─────────────────────┐
│    Persistence Abstraction      │ │      SMS Dispatcher Abstraction     │
│  - IStorageAdapter              │ │  - SmsDispatcher Interface          │
│    ├── AsyncStorageAdapter      │ │    ├── MockSmsDispatcher (Tests/CI)│
│    └── InMemoryStorageAdapter   │ │    └── NativeSmsDispatcher (Prod)  │
└─────────────────────────────────┘ └──────────────┬─────────────────────┘
                                                   │
┌──────────────────────────────────────────────────▼─────────────────────┐
│                     Android Native Platform Layer                      │
│  - SmsModule.kt (Bridges to android.telephony.SmsManager)              │
│  - SmsAlarmReceiver.kt (Triggered by AlarmManager.RTC_WAKEUP)          │
│  - BootReceiver.kt (Reschedules alarms on BOOT_COMPLETED)              │
│  - ContactPickerModule.kt (Native contact picker intent)               │
│  - Indus AppStore Release Config (com.skedsms, release keystore, AGP)  │
└────────────────────────────────────────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Project Scaffolding & Config | React Native, TypeScript, package.json, tsconfig, jest configs | M1 | Survey 1 |
| 2 | Android Native App Skeleton | Android project layout, package `com.skedsms`, app branding "Sked SMS" in strings.xml/app.json | M1 | Survey 1, R4 |
| 3 | Indus AppStore Permissions | Declare `SEND_SMS`, `READ_PHONE_STATE`, `READ_CONTACTS`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `POST_NOTIFICATIONS` in AndroidManifest.xml | M1 | Survey 1/2, R4 |
| 4 | Release Signing & Build Script | Release keystore, signingConfigs, and gradle build setup ready for `./gradlew assembleRelease` | M1 | Survey 1, R4 |
| 5 | Schedule Data Model | TypeScript interface for `ScheduledMessage`, `RecurrenceRule`, status enum, timestamps | M2 | Survey 2/3, R2 |
| 6 | Past Date & Time Validation | Validation rule blocking selection or submission of past dates/times with lead buffer | M2 | Survey 3, R1 |
| 7 | Mandatory Fields Validation | Validation ensuring recipient selection/number and message text are non-empty | M2 | Survey 3, R1 |
| 8 | Phone Number Normalization | Normalization and validation for ITU-T E.164 and local dialable phone digits | M2 | Survey 3, R1 |
| 9 | Daily Recurrence Math | Algorithm calculating next 24-hour run timestamp and respecting optional end date bounds | M2 | Survey 2/3, R2 |
| 10 | Persistence Repository | `ScheduleRepository` / `IStorageAdapter` with `AsyncStorage` and in-memory test implementation | M2 | Survey 2/3, R2 |
| 11 | SmsDispatcher Interface | Core abstraction layer contract `sendSms` and `isAvailable` | M3 | Survey 1/2, R3 |
| 12 | MockSmsDispatcher | In-memory mock dispatcher supporting test assertions, fault injection, and delay simulation | M3 | Survey 1/2, R3 |
| 13 | NativeSmsDispatcher | React Native bridge client calling native `SmsModule` on Android | M3 | Survey 1/2, R3 |
| 14 | Android Native SmsModule | Kotlin module utilizing `SmsManager` for single and multipart message transmission | M3 | Survey 1/2, R3 |
| 15 | Exact Background Alarm Dispatch | `SmsAlarmReceiver` triggered by `AlarmManager.setExactAndAllowWhileIdle(RTC_WAKEUP)` | M3 | Survey 2, R3 |
| 16 | Boot Persistence Receiver | `BootReceiver` restoring pending active schedule alarms on `BOOT_COMPLETED` | M3 | Survey 2, R3 |
| 17 | Floating Action Button (FAB) | Material Design FAB positioned at bottom-right corner triggering scheduler modal | M4 | Survey 3, R1 |
| 18 | Contact Picker Integration | UI for selecting contact from device with `READ_CONTACTS` permission and manual fallback | M4 | Survey 3, R1 |
| 19 | Message Input & Segment Counter | Multiline input with live character and SMS segment counter (160 GSM-7 / 70 Unicode) | M4 | Survey 3, R1 |
| 20 | Date & Time Picker UI | UI triggers for native DatePicker and TimePicker dialogs with inline validation error banner | M4 | Survey 3, R1 |
| 21 | Active Schedule List & Empty State | FlatList displaying active scheduled messages, empty state illustration, and countdown badges | M4 | Survey 3, R2 |
| 22 | Schedule Card Presentation | Visual card displaying recipient, formatted phone, message preview, recurrence, and status | M4 | Survey 3, R2 |
| 23 | Edit & Reschedule Workflow | Selecting item opens pre-filled modal, enforces future validation on save, updates storage/alarm | M4 | Survey 3, R2 |
| 24 | Delete Workflow & Confirmation | Delete action with native confirmation alert dialog, disarming pending alarm and removing record | M4 | Survey 3, R2 |
| 25 | Concurrent Schedules Support | Concurrent execution of multiple distinct schedules via unique UUIDs and integer alarm codes | M4 | Survey 2/3, R2 |
| 26 | Daily Recurring Options UI | Form controls for daily recurrence toggle and optional end date picker | M4 | Survey 3, R2 |
| 27 | E2E Test Suite Pass (Tiers 1-4) | Pass 100% of the opaque-box requirement-driven E2E test suite across all 4 tiers | M5 | Project Spec |
| 28 | Adversarial Coverage Hardening | White-box adversarial testing (Tier 5) closing coverage gaps and fixing edge case bugs | M5 | Project Spec |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Scaffolding & Build Configuration | Project layout, package.json, TypeScript, Android app skeleton (`com.skedsms`), Indus AppStore branding ("Sked SMS"), permissions, release signing keystore, `./gradlew assembleRelease` setup, Jest test harness | none | DONE |
| 2 | M2: Domain Engine, Persistence & Validation | TypeScript data models, input validation (past date/time blocking, mandatory fields, phone normalization), daily recurrence engine, repository persistence abstraction (AsyncStorage & InMemory), unit tests | M1 | DONE |
| 3 | M3: SMS Dispatcher Abstraction & Native Background Scheduling | `SmsDispatcher` interface, `MockSmsDispatcher` test harness, `NativeSmsDispatcher`, Android Kotlin `SmsModule` (SmsManager), `SmsAlarmReceiver` (AlarmManager exact alarm), `BootReceiver` | M1, M2 | PLANNED |
| 4 | M4: Schedule UI, Contact Selection & Management List | Bottom-right FAB, Contact Picker with manual fallback, Date/Time pickers with validation error banner, Message input with segment counter, Schedule List with Empty State, Edit/Reschedule/Delete workflows | M2, M3 | PLANNED |
| 5 | M5: E2E Test Verification & Adversarial Hardening | Phase 1: 100% pass of E2E test suite (Tiers 1-4). Phase 2: Adversarial coverage hardening (Tier 5) via Challenger-Worker-Reviewer loop | M4, E2E Track | PLANNED |

## Interface Contracts

### Domain Models (`src/types/schedule.ts`)
```typescript
export type ScheduleStatus = 'pending' | 'sent' | 'failed' | 'cancelled' | 'completed';
export type RecurrenceType = 'none' | 'daily';

export interface RecurrenceRule {
  type: RecurrenceType;
  hasEndDate?: boolean;
  endDate?: string | null; // ISO 8601 YYYY-MM-DD
}

export interface Recipient {
  name: string;
  phoneNumber: string; // Sanitized E.164 or digits
}

export interface ScheduledMessage {
  id: string; // UUID v4
  recipient: Recipient;
  messageText: string;
  scheduledAt: string; // ISO 8601 UTC timestamp
  recurrence: RecurrenceRule;
  status: ScheduleStatus;
  alarmRequestCode: number;
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string | null;
  errorMessage?: string | null;
}
```

### SMS Dispatcher Abstraction (`src/services/sms/types.ts`)
```typescript
export interface SendSmsParams {
  id: string;
  recipient: Recipient;
  messageText: string;
  subscriptionId?: number;
}

export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  timestamp: string;
  partsCount: number;
  carrierErrorCode?: number | null;
  errorMessage?: string | null;
}

export interface SmsDispatcher {
  sendSms(params: SendSmsParams): Promise<SmsDispatchResult>;
  isAvailable(): Promise<boolean>;
}
```

### Persistence Repository (`src/repositories/ScheduleRepository.ts`)
```typescript
export interface ScheduleRepository {
  getAll(): Promise<ScheduledMessage[]>;
  getById(id: string): Promise<ScheduledMessage | null>;
  getActivePending(): Promise<ScheduledMessage[]>;
  create(input: CreateScheduleInput): Promise<ScheduledMessage>;
  update(id: string, input: UpdateScheduleInput): Promise<ScheduledMessage>;
  delete(id: string): Promise<boolean>;
  clearAll(): Promise<void>;
}
```

### Validation Contract (`src/utils/validation.ts`)
```typescript
export interface ValidationResult {
  isValid: boolean;
  errors: {
    recipient?: string;
    phoneNumber?: string;
    message?: string;
    scheduledAt?: string;
    recurrence?: string;
  };
}

export function validateScheduleInput(
  input: {
    recipientName: string;
    phoneNumber: string;
    messageText: string;
    scheduledDate: Date;
    recurrence?: RecurrenceRule;
  },
  now?: Date
): ValidationResult;
```

## Code Layout
```
/Users/nikhilskesari/workspace/teamwork-preview/
├── android/
│   ├── app/
│   │   ├── build.gradle
│   │   ├── skedsms-release.keystore
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/com/skedsms/
│   │       │   ├── MainActivity.kt
│   │       │   ├── MainApplication.kt
│   │       │   ├── SmsModule.kt
│   │       │   ├── SmsPackage.kt
│   │       │   ├── ContactPickerModule.kt
│   │       │   ├── SmsAlarmReceiver.kt
│   │       │   └── BootReceiver.kt
│   │       └── res/values/strings.xml
│   ├── build.gradle
│   ├── settings.gradle
│   └── gradlew
├── src/
│   ├── components/
│   │   ├── FloatingActionButton.tsx
│   │   ├── ScheduleFormModal.tsx
│   │   ├── ContactPickerInput.tsx
│   │   ├── DateTimePickerInput.tsx
│   │   ├── ScheduleItemCard.tsx
│   │   ├── ScheduleList.tsx
│   │   └── EmptyState.tsx
│   ├── context/
│   │   └── ScheduleContext.tsx
│   ├── services/
│   │   ├── sms/
│   │   │   ├── types.ts
│   │   │   ├── MockSmsDispatcher.ts
│   │   │   └── NativeSmsDispatcher.ts
│   │   └── scheduler/
│   │       ├── ScheduleManager.ts
│   │       └── NativeAlarmBridge.ts
│   ├── repositories/
│   │   ├── ScheduleRepository.ts
│   │   ├── AsyncStorageScheduleRepository.ts
│   │   └── InMemoryScheduleRepository.ts
│   ├── types/
│   │   └── schedule.ts
│   └── utils/
│       ├── validation.ts
│       └── smsCalculator.ts
├── __tests__/
│   ├── e2e/
│   │   ├── tier1_features.test.ts
│   │   ├── tier2_boundaries.test.ts
│   │   ├── tier3_combinations.test.ts
│   │   └── tier4_workloads.test.ts
│   ├── unit/
│   │   ├── validation.test.ts
│   │   ├── recurrence.test.ts
│   │   ├── repository.test.ts
│   │   └── mock_dispatcher.test.ts
│   └── components/
│       ├── FAB.test.tsx
│       └── ScheduleList.test.tsx
├── App.tsx
├── index.js
├── app.json
├── package.json
├── tsconfig.json
├── jest.config.js
└── babel.config.js
```
