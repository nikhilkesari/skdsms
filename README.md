# Sked SMS 📱⏰

[![React Native](https://img.shields.io/badge/React%20Native-0.87.1-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Android](https://img.shields.io/badge/Platform-Android%208.0%2B%20(API%2024--34)-3DDC84?logo=android&logoColor=white)](https://developer.android.com/)
[![Tests](https://img.shields.io/badge/Tests-642%20Passing-success?logo=jest&logoColor=white)](https://jestjs.io/)
[![License](https://img.shields.io/badge/License-Private-lightgrey.svg)]()

**Sked SMS** is a production-grade, background-resilient Android application built with **React Native** and **Kotlin** for scheduling and dispatching automated SMS messages. It enables users to compose messages, select contacts directly from their device address book, configure exact delivery times or daily repeating cycles, and guarantee on-time delivery even when the app is closed, the screen is off, or the device has been rebooted.

---

## 🤝 Project Retrospective: Built with Google Gemini Teamwork Preview

> **Engineering Note**: This entire application — from domain architecture and React Native components to native Android background alarm receivers, build scripts, and a 642-test automated suite — was architected and implemented using **Google Gemini's Teamwork Preview** (`/teamwork-preview`), Google DeepMind's multi-agent autonomous software engineering system.

### How It Worked
Google Gemini Teamwork Preview coordinates a hierarchy of autonomous, specialized AI agents operating in parallel to tackle large, complex software engineering tasks that exceed single-agent capabilities:

1. **Autonomous Milestone Decomposition**:
   Starting from raw functional requirements, the system autonomously broke down the application into five structured milestones:
   - **M1: Scaffolding & Build Configuration** (Gradle, React Native 0.87.1, Indus AppStore package configuration, release keystores).
   - **M2: Domain Models, Persistence & Validation** (E.164 phone normalization, daily recurrence math, storage repositories).
   - **M3: Native Background Scheduling & Telephony** (Kotlin `SmsModule`, `AlarmManager.RTC_WAKEUP` exact alarm dispatching, `BootReceiver`).
   - **M4: User Interface & Schedule Lifecycle** (Material Design UI, contact picker integration, GSM-7/Unicode segment counter, CRUD actions).
   - **M5: End-to-End Verification & Adversarial Hardening** (Opaque-box multi-tier test pass & challenger stress loops).

2. **Specialized Multi-Agent Hierarchy & Management**:
   The development process was managed through distinct, collaborating agent personas:
   - **👑 Orchestrator & Sub-Orchestrators**: Decomposed high-level goals into dependency DAGs, assigned tasks to worker pools, tracked milestone criteria, and enforced architectural consistency across commits.
   - **🔍 Spec Miner**: Analyzed raw requirements, platform docs, and Android guidelines to extract formal specifications, interface contracts, and non-obvious constraints (e.g., Doze mode, Android 12+ `SCHEDULE_EXACT_ALARM` permissions, multi-part SMS splitting).
   - **🧭 Explorer**: Surveyed codebase structure, verified external library compatibility, and explored Android native APIs before implementation began.
   - **💻 Worker Agents**: Implemented modular, strongly-typed code in parallel branches — writing TypeScript business logic, React Native screens, and native Kotlin broadcast receivers.
   - **🥊 Challenger Agents (Adversarial Quality Assurance)**: Built stress tests, boundary checks, concurrent schedule simulations, and fault-injection cases specifically engineered to find edge cases and break worker implementations.
   - **🔎 Reviewer Agents**: Conducted rigorous pull-request reviews, verifying TypeScript strictness, lint cleanliness, and regression safety.
   - **🛡️ Sentinel & Victory Auditor**: Autonomous gatekeepers that continuously ran `npm test` and build validators (`scripts/validate-android-build.js`), rejecting regressions and ensuring all milestone quality gates were 100% satisfied before proceeding.

### Key Features of Teamwork Preview Utilized
- **Parallel Subagent Workspaces**: Workers, Challengers, and Reviewers worked simultaneously in isolated branches without blocking the main branch or context window.
- **Reactive Event Loop & Autonomous Messaging**: Agents notified each other upon milestone completion without polling, handing off artifacts seamlessly.
- **Continuous Project Memory**: Preserved state and architectural contracts in `PROJECT.md` and `.agents/` across sessions, ensuring multi-turn continuity.
- **Automated Quality Gates**: Guaranteed that no code reached the final build without passing all 642 tests across 30 suites and completing clean Android build validation.

### Why It Was Helpful
- **Eliminated Implementation Gaps**: The adversarial Worker ↔ Challenger loop caught real-world mobile edge cases early — such as `SecurityException` on Android 12+ exact alarms, date parsing variations, and restoring missed alarms after device reboot.
- **Production-Ready Quality**: Generated clean, production-grade code adhering to Clean Architecture principles with complete test coverage, type safety, and comprehensive documentation in a fraction of traditional development time.

---

## 📖 Table of Contents

- [Built with Google Gemini Teamwork Preview](#-project-retrospective-built-with-google-gemini-teamwork-preview)
- [What It Does](#-what-it-does)
- [Key Features](#-key-features)
- [Architecture & Design](#-architecture--design)
- [Project Structure](#-project-structure)
- [Next Upgrades: WhatsApp Automation](#-next-upgrades-whatsapp-automation)
- [Getting Started](#-getting-started)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Android Permissions & Distribution](#-android-permissions--distribution)
- [Configuration & Build](#-configuration--build)

---

## 🚀 What It Does

Most scheduling applications require a continuous active internet connection, third-party cloud gateways (e.g., Twilio, AWS SNS), or keep the screen awake to trigger dispatches.

**Sked SMS** operates completely on-device:
1. **Schedules Offline & Native**: Utilizes Android's native `AlarmManager` with exact wake alarms (`RTC_WAKEUP`) to wake the CPU at the exact scheduled millisecond.
2. **Direct Telephony Integration**: Dispatches SMS directly through the device carrier via Android `SmsManager` without requiring external cloud accounts or internet access.
3. **Survives Doze Mode & Background Restrictions**: Integrates partial wake locks (`PowerManager.PARTIAL_WAKE_LOCK`) and `setExactAndAllowWhileIdle` to cut through Android battery optimization (Doze mode).
4. **Survives Device Reboots**: Registers a native `BootReceiver` that listens for `BOOT_COMPLETED` to immediately re-arm all pending alarms and roll over missed daily occurrences.
5. **Daily Recurrence Engine**: Automatically increments scheduled dispatches by 24 hours after execution or device boot, honoring optional end-date boundaries.

---

## ✨ Key Features

### 📅 Precision Scheduling & Form Validation
- Set any future date and time down to the exact minute.
- Strict client-side validation prevents scheduling past dates or dates within a 30-second buffer.
- When editing or toggling recurrence on an existing schedule whose original time was earlier in the day, the engine automatically rolls the date forward to the next future 24-hour cycle at that same time.

### 🔁 Daily Recurrence Engine
- Toggle **Repeat Daily** to automatically repeat dispatches every 24 hours at the exact designated time.
- Optional **End Date** boundary: Schedule recurring messages until a specific date (inclusive to 23:59:59.999 UTC), after which the schedule transitions cleanly to `completed`.
- Full state synchronization between native Android storage (`SharedPreferences`) and React Native (`AsyncStorage`).

### 📱 Native Contact Picker & Phone Normalization
- Open the native Android contact picker with one tap (`Intent.ACTION_PICK` via `ContactPickerModule.kt`).
- Fallback manual entry with real-time ITU-T E.164 sanitization and formatting.
- Auto-extracts contact names and telephone numbers.

### 🔢 Live SMS Segment & Character Counter
- Computes character counts and message encoding dynamically.
- Detects GSM-7 standard characters (160 chars / segment; 153 chars for multipart).
- Detects Unicode / Emoji content (70 chars / segment; 67 chars for multipart).
- Displays real-time segment usage to prevent unexpected carrier segment charges.

### ⚡ Android 12+ (API 31+) & Android 14 (API 34) Ready
- Safe permission checks for `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM`.
- Graceful fallback to `setAndAllowWhileIdle` if exact alarm privileges are revoked by the user, preventing `SecurityException` crashes.

### 📋 Complete Schedule Lifecycle Management (CRUD)
- Visual schedule list with real-time status badges: `pending`, `sent`, `failed`, `cancelled`, and `completed`.
- Floating Action Button (FAB) at the bottom-right corner for quick schedule creation.
- Pre-filled modal for editing existing schedules.
- Deletion with native confirmation dialogs and automatic alarm cancellation.

---

## 🏗 Architecture & Design

Sked SMS employs a 4-tier decoupled architecture:

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
│  - ScheduleManager Orchestrator                                        │
│  - Validation Service (Past date blocking, phone E.164, mandatory msg) │
│  - Recurrence Engine (Daily calculation, optional end date bounds)     │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
┌──────────────────▼──────────────┐ ┌──────────────▼─────────────────────┐
│    Persistence Abstraction      │ │      SMS Dispatcher Abstraction     │
│  - ScheduleRepository           │ │  - SmsDispatcher Interface          │
│    ├── AsyncStorageScheduleRepo │ │    ├── MockSmsDispatcher (Tests/CI)│
│    └── InMemoryScheduleRepo     │ │    └── NativeSmsDispatcher (Prod)  │
└─────────────────────────────────┘ └──────────────┬─────────────────────┘
                                                   │
┌──────────────────────────────────────────────────▼─────────────────────┐
│                     Android Native Platform Layer                      │
│  - SmsModule.kt (Bridges to android.telephony.SmsManager)              │
│  - SmsAlarmReceiver.kt (Triggered by AlarmManager.RTC_WAKEUP)          │
│  - AlarmSchedulerModule.kt (Alarm registration & state sync)           │
│  - BootReceiver.kt (Reschedules alarms on BOOT_COMPLETED)              │
│  - ContactPickerModule.kt (Native contact picker intent)               │
│  - AlarmStorage.kt (Low-level native alarm persistence)                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
teamwork-preview/
├── android/                             # Native Android project
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml      # Permissions, activities, receivers
│   │   │   ├── java/com/skedsms/
│   │   │   │   ├── MainActivity.kt      # Main React Native activity
│   │   │   │   ├── MainApplication.kt   # React Native application & package setup
│   │   │   │   ├── SkedSmsPackage.kt    # Native module package registrar
│   │   │   │   ├── SmsModule.kt         # Direct SMS dispatch bridge
│   │   │   │   ├── SmsAlarmReceiver.kt  # Background AlarmManager receiver & re-armer
│   │   │   │   ├── AlarmSchedulerModule.kt # React Native bridge for AlarmManager
│   │   │   │   ├── AlarmStorage.kt      # Persistent SharedPreferences mirror
│   │   │   │   ├── BootReceiver.kt      # Reboot alarm restoration receiver
│   │   │   │   └── ContactPickerModule.kt # Native contact picker intent
│   │   │   └── res/values/strings.xml   # App branding ("Sked SMS")
│   │   └── build.gradle                 # App-level build config (Target SDK 34)
│   └── build.gradle                     # Top-level Gradle config
├── src/                                 # TypeScript source code
│   ├── components/                      # React Native UI components
│   │   ├── AppHeader.tsx                # Branding header
│   │   ├── ContactPickerInput.tsx       # Contact selector & manual input
│   │   ├── DateTimePickerInput.tsx      # Native Date & Time picker wrappers
│   │   ├── EmptyState.tsx               # Empty schedule illustration
│   │   ├── FAB.tsx                      # Floating Action Button
│   │   ├── ScheduleFormModal.tsx        # Create / Edit schedule modal
│   │   ├── ScheduleItemCard.tsx         # Schedule summary card
│   │   └── ScheduleList.tsx             # Scrollable list of schedules
│   ├── context/
│   │   └── ScheduleContext.tsx          # Application state & lifecycle context
│   ├── repositories/                    # Persistence implementations
│   │   ├── ScheduleRepository.ts        # Abstract repository interface
│   │   ├── AsyncStorageScheduleRepository.ts # AsyncStorage implementation
│   │   └── InMemoryScheduleRepository.ts     # In-memory test repository
│   ├── services/
│   │   ├── scheduler/                   # Core business logic
│   │   │   ├── ScheduleManager.ts       # Central scheduler coordinator
│   │   │   ├── recurrence.ts            # Daily rollover calculation engine
│   │   │   └── NativeAlarmBridge.ts     # TypeScript bridge to AlarmSchedulerModule
│   │   └── sms/                         # SMS delivery services
│   │       ├── types.ts                 # Dispatcher and scheduler contracts
│   │       ├── NativeSmsDispatcher.ts   # Production native SMS dispatcher
│   │       ├── MockSmsDispatcher.ts     # In-memory mock dispatcher for tests
│   │       └── index.ts                 # Dispatcher factory
│   ├── types/
│   │   └── schedule.ts                  # Domain models (ScheduledMessage, RecurrenceRule)
│   └── utils/
│       ├── smsCalculator.ts             # GSM-7 / Unicode SMS segment calculator
│       └── validation.ts                # Date, phone, and text validators
├── __tests__/                           # Comprehensive test suites (642 tests)
│   ├── unit/                            # Unit tests for manager, recurrence, validation
│   ├── components/                      # Component rendering & interaction tests
│   └── e2e/                             # End-to-end multi-tier scenario tests
├── scripts/
│   └── validate-android-build.js        # Android build & manifest validator
├── App.tsx                              # Root React component
├── package.json                         # Dependencies and scripts
└── tsconfig.json                        # TypeScript compiler options
```

---

## 🔮 Next Upgrades: WhatsApp Automation

The roadmap for Sked SMS introduces **WhatsApp & WhatsApp Business Automation**, broadening automated communication beyond SMS to the world's most popular messaging platform.

### Planned WhatsApp Features

1. **Multi-Channel Dispatch Selector**:
   - In the **Schedule New Message** modal, users will be able to select the dispatch channel:
     - 💬 **SMS Only**: Dispatched via standard carrier cellular network.
     - 🟢 **WhatsApp Only**: Dispatched directly via WhatsApp.
     - 🔀 **Smart Fallback (WhatsApp → SMS)**: Attempts delivery via WhatsApp; if the recipient does not have WhatsApp or delivery fails, automatically falls back to SMS.

2. **Automated WhatsApp Delivery Mechanisms**:
   - **Deep Link & Direct Intent Dispatch**: Formats international telephone numbers and payload text into `whatsapp://send?phone=...&text=...` URI intents.
   - **Android AccessibilityService Dispatch**: An optional, permission-gated background service that navigates the WhatsApp chat interface and automates the send button click without requiring manual user interaction at trigger time.
   - **WhatsApp Business API Integration**: Optional webhook/API bridge for businesses wishing to send verified WhatsApp Business template messages at scheduled times.

3. **Rich Media & Template Support**:
   - Schedule image, PDF, and voice note attachments alongside standard text.
   - Support for reusable message templates (e.g., appointment reminders, birthdays, follow-ups).

4. **Group & Broadcast Scheduling**:
   - Schedule messages directly to saved WhatsApp groups or predefined broadcast lists.

---

## 🛠 Getting Started

### Prerequisites
- **Node.js**: `>= 18.x`
- **npm**: `>= 9.x`
- **JDK**: Java Development Kit `17`
- **Android Studio** with:
  - Android SDK Platform 34 (`Android 14`)
  - Android SDK Build-Tools `34.0.0`
  - Android NDK & CMake

### Installation
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Verify Android build configurations:
   ```bash
   npm run validate:android
   ```

3. Start the Metro development bundler:
   ```bash
   npm start
   ```

4. In a separate terminal, launch the application on a connected Android device or emulator:
   ```bash
   npm run android
   ```

---

## 🧪 Testing & Quality Assurance

Sked SMS features an exhaustive test harness consisting of **642 automated tests across 30 test suites**:

```bash
# Run the complete test suite
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run End-to-End multi-tier tests
npm run test:e2e

# Run TypeScript static type check
npm run typecheck
```

### Test Suite Structure
- **Unit Tests**: Validate phone normalization (E.164), 24-hour recurrence math, leap year boundaries, GSM-7/Unicode segment calculations, and repository abstractions.
- **Component Tests**: Validate UI behavior, form validation feedback, character counters, modals, and FAB triggers.
- **E2E Tests (Tiers 1–4)**: Multi-schedule concurrent executions, lifecycle state transitions, edit/reschedule flows, and edge cases.
- **Adversarial Hardening**: Verifies resilience against background crashes, missing exact alarm permissions, and device reboots.

---

## 🔒 Android Permissions & Distribution

Configured in `android/app/src/main/AndroidManifest.xml` for distribution on stores like the **Indus AppStore** and **Google Play**:

| Permission | Reason / Usage |
|---|---|
| `android.permission.SEND_SMS` | Dispatches scheduled SMS messages natively from the device. |
| `android.permission.READ_PHONE_STATE` | Checks SIM status and telephony availability prior to transmission. |
| `android.permission.READ_CONTACTS` | Launches native contact picker and auto-fills recipient name and number. |
| `android.permission.SCHEDULE_EXACT_ALARM` | Permits setting exact wake alarms on Android 12+ (API 31+). |
| `android.permission.USE_EXACT_ALARM` | Ensures exact alarm privilege on Android 13+ (API 33+) for alarms & timers. |
| `android.permission.RECEIVE_BOOT_COMPLETED` | Restores pending alarms and daily repeat cycles upon device reboot. |
| `android.permission.WAKE_LOCK` | Holds a brief partial wake lock during alarm execution to avoid sleep drops. |
| `android.permission.POST_NOTIFICATIONS` | Delivers status notifications upon successful or failed dispatches. |

---

## 📦 Configuration & Build

To assemble a signed release APK ready for device installation or store publishing:

```bash
cd android
./gradlew assembleRelease
```

The output APK will be generated at:
```
android/app/build/outputs/apk/release/app-release.apk
```

---

## 📄 License

Proprietary — Developed for **Sked SMS**. All rights reserved.
