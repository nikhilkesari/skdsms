#!/usr/bin/env node

/**
 * Android Build Script & Manifest Syntax Validator
 * Verifies syntax, required configuration blocks, and Indus AppStore requirements.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
let errors = 0;
let warnings = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    errors++;
  }
}

function warn(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.warn(`  ⚠ WARN: ${message}`);
    warnings++;
  }
}

function checkBalancedBraces(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let braceCount = 0;
  let parenCount = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    if (content[i] === '(') parenCount++;
    if (content[i] === ')') parenCount--;
  }
  return braceCount === 0 && parenCount === 0;
}

console.log('\n--- 1. Validating android/build.gradle ---');
const topBuildPath = path.join(rootDir, 'android', 'build.gradle');
if (fs.existsSync(topBuildPath)) {
  check(checkBalancedBraces(topBuildPath), 'Balanced braces and parentheses in android/build.gradle');
  const content = fs.readFileSync(topBuildPath, 'utf8');
  check(content.includes('buildscript'), 'Contains buildscript block');
  check(content.includes('com.android.tools.build:gradle'), 'Declares Android Gradle Plugin classpath');
  check(content.includes('kotlin-gradle-plugin'), 'Declares Kotlin Gradle Plugin classpath');
  check(content.includes('allprojects'), 'Contains allprojects block');
} else {
  check(false, 'android/build.gradle exists');
}

console.log('\n--- 2. Validating android/settings.gradle ---');
const settingsPath = path.join(rootDir, 'android', 'settings.gradle');
if (fs.existsSync(settingsPath)) {
  check(checkBalancedBraces(settingsPath), 'Balanced braces in android/settings.gradle');
  const content = fs.readFileSync(settingsPath, 'utf8');
  check(/rootProject\.name\s*=\s*['"]SkedSMS['"]/.test(content), 'rootProject.name is "SkedSMS"');
  check(content.includes("include ':app'"), "Includes ':app' subproject");
} else {
  check(false, 'android/settings.gradle exists');
}

console.log('\n--- 3. Validating android/app/build.gradle ---');
const appBuildPath = path.join(rootDir, 'android', 'app', 'build.gradle');
if (fs.existsSync(appBuildPath)) {
  check(checkBalancedBraces(appBuildPath), 'Balanced braces in android/app/build.gradle');
  const content = fs.readFileSync(appBuildPath, 'utf8');
  check(content.includes('com.android.application'), 'Applies com.android.application plugin');
  check(/namespace\s+['"]com\.skedsms['"]/.test(content), 'Declares namespace "com.skedsms"');
  check(/applicationId\s+['"]com\.skedsms['"]/.test(content), 'Declares applicationId "com.skedsms"');
  check(content.includes('signingConfigs'), 'Contains signingConfigs block');
  check(content.includes('release {') || content.includes('release{'), 'Contains release signingConfig');
  check(content.includes('buildTypes'), 'Contains buildTypes block');
} else {
  check(false, 'android/app/build.gradle exists');
}

console.log('\n--- 4. Validating android/app/src/main/AndroidManifest.xml ---');
const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  const content = fs.readFileSync(manifestPath, 'utf8');
  check(content.includes('<manifest') && content.includes('</manifest>'), 'Valid XML root element <manifest>');
  check(content.includes('package="com.skedsms"'), 'Package attribute is "com.skedsms"');

  const requiredPermissions = [
    'android.permission.SEND_SMS',
    'android.permission.READ_PHONE_STATE',
    'android.permission.READ_CONTACTS',
    'android.permission.SCHEDULE_EXACT_ALARM',
    'android.permission.USE_EXACT_ALARM',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.WAKE_LOCK',
    'android.permission.POST_NOTIFICATIONS',
  ];

  requiredPermissions.forEach(perm => {
    check(content.includes(perm), `Declares permission: ${perm}`);
  });

  check(content.includes('.MainActivity'), 'Declares MainActivity');
  check(content.includes('.SmsAlarmReceiver'), 'Declares SmsAlarmReceiver');
  check(content.includes('.BootReceiver'), 'Declares BootReceiver');
  check(content.includes('BOOT_COMPLETED'), 'BootReceiver filters BOOT_COMPLETED');
} else {
  check(false, 'AndroidManifest.xml exists');
}

console.log('\n--- 5. Validating strings.xml Branding ---');
const stringsPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
if (fs.existsSync(stringsPath)) {
  const content = fs.readFileSync(stringsPath, 'utf8');
  check(content.includes('<string name="app_name">Sked SMS</string>'), 'app_name is configured as "Sked SMS"');
} else {
  check(false, 'strings.xml exists');
}

console.log('\n--- Validation Summary ---');
if (errors === 0) {
  console.log(`SUCCESS: All Android build configurations are valid! (${warnings} warnings)\n`);
  process.exit(0);
} else {
  console.error(`FAILURE: Found ${errors} syntax or structural errors.\n`);
  process.exit(1);
}
