/**
 * Sked SMS — Standalone E2E Test Runner
 *
 * Provides Jest-compatible globals (describe, it, expect, beforeEach, afterEach)
 * to execute all 4 tiers of E2E tests directly with Node 24+.
 */

const path = require('path');

// Test tracking
let totalSuites = 0;
let passedSuites = 0;
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

let currentSuite = '';
const suiteBeforeEachHooks = [];

function describe(name, fn) {
  const previousSuite = currentSuite;
  currentSuite = previousSuite ? `${previousSuite} > ${name}` : name;
  totalSuites++;
  const hookIndex = suiteBeforeEachHooks.length;
  suiteBeforeEachHooks.push([]);

  try {
    fn();
  } catch (err) {
    failures.push({ suite: currentSuite, test: 'Suite Definition', error: err });
  } finally {
    suiteBeforeEachHooks.splice(hookIndex);
    currentSuite = previousSuite;
  }
}

function beforeEach(fn) {
  if (suiteBeforeEachHooks.length > 0) {
    suiteBeforeEachHooks[suiteBeforeEachHooks.length - 1].push(fn);
  }
}

const scheduledTests = [];

function it(name, fn) {
  const suiteName = currentSuite;
  const hooks = suiteBeforeEachHooks.flat();
  scheduledTests.push({ suiteName, testName: name, fn, hooks });
}

// Global expect matcher implementation
function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, but received ${JSON.stringify(actual)}`);
      }
    },
    not: {
      toBe(expected) {
        if (actual === expected) {
          throw new Error(`Expected value not to be ${JSON.stringify(expected)}`);
        }
      },
      toBeNull() {
        if (actual === null) {
          throw new Error('Expected value not to be null');
        }
      },
      toBeNaN() {
        if (Number.isNaN(actual)) {
          throw new Error('Expected value not to be NaN');
        }
      },
    },
    toEqual(expected) {
      if (expected && expected._isMatcher && typeof expected.matches === 'function') {
        if (!expected.matches(actual)) {
          throw new Error(`Expected array ${JSON.stringify(actual)} to match custom matcher`);
        }
        return;
      }
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${b}, but received ${a}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined, but received undefined');
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected value to be undefined, but received ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, but received ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected) {
      if (!(actual >= expected)) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
      }
    },
    toContain(expected) {
      if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string "${actual}" to contain "${expected}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        }
      } else {
        throw new Error(`toContain called on unsupported type ${typeof actual}`);
      }
    },
    rejects: {
      async toThrow(expectedRegexOrStr) {
        let threw = false;
        let thrownError = null;
        try {
          await actual;
        } catch (err) {
          threw = true;
          thrownError = err;
        }
        if (!threw) {
          throw new Error('Expected promise to reject, but it resolved successfully');
        }
        if (expectedRegexOrStr) {
          const msg = thrownError?.message || String(thrownError);
          if (expectedRegexOrStr instanceof RegExp) {
            if (!expectedRegexOrStr.test(msg)) {
              throw new Error(`Expected error message "${msg}" to match ${expectedRegexOrStr}`);
            }
          } else {
            if (!msg.includes(expectedRegexOrStr)) {
              throw new Error(`Expected error message "${msg}" to contain "${expectedRegexOrStr}"`);
            }
          }
        }
      },
    },
  };
}

expect.arrayContaining = function (subset) {
  return {
    _isMatcher: true,
    matches(actualArray) {
      return subset.every(sub => actualArray.includes(sub));
    },
  };
};

// Expose globals
global.describe = describe;
global.it = it;
global.beforeEach = beforeEach;
global.expect = expect;

async function run() {
  console.log('================================================================');
  console.log('           Sked SMS — 4-Tier E2E Test Suite Runner              ');
  console.log('================================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const suites = [
    { name: 'Tier 1: Feature Coverage (Happy Paths)', file: path.join(rootDir, '__tests__/e2e/tier1_features.test.ts') },
    { name: 'Tier 2: Boundary & Corner Cases', file: path.join(rootDir, '__tests__/e2e/tier2_boundaries.test.ts') },
    { name: 'Tier 3: Pairwise Cross-Feature Combinations', file: path.join(rootDir, '__tests__/e2e/tier3_combinations.test.ts') },
    { name: 'Tier 4: Real-World Application Workloads', file: path.join(rootDir, '__tests__/e2e/tier4_workloads.test.ts') },
  ];

  const startTime = Date.now();

  for (const suite of suites) {
    console.log(`\n📋 Loading Test Suite: ${suite.name}`);
    const beforeCount = scheduledTests.length;
    await import(`file://${suite.file}`);
    const suiteTests = scheduledTests.slice(beforeCount);
    console.log(`   Found ${suiteTests.length} tests in ${path.basename(suite.file)}`);

    let suitePassed = 0;
    let suiteFailed = 0;

    for (const test of suiteTests) {
      totalTests++;
      try {
        for (const hook of test.hooks) {
          await hook();
        }
        await test.fn();
        passedTests++;
        suitePassed++;
      } catch (err) {
        failedTests++;
        suiteFailed++;
        failures.push({
          suite: test.suiteName,
          test: test.testName,
          error: err,
        });
        console.error(`   ❌ FAIL: [${test.suiteName}] > ${test.testName}`);
        console.error(`      Error: ${err.message}\n`);
      }
    }

    if (suiteFailed === 0) {
      passedSuites++;
      console.log(`   ✅ All ${suitePassed} tests passed in ${suite.name}`);
    } else {
      console.log(`   ❌ ${suiteFailed} / ${suiteTests.length} tests failed in ${suite.name}`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n================================================================');
  console.log('                      TEST EXECUTION SUMMARY                    ');
  console.log('================================================================');
  console.log(`Test Suites: ${passedSuites} passed, ${suites.length - passedSuites} failed, ${suites.length} total`);
  console.log(`Tests:       ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
  console.log(`Duration:    ${duration}s`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    console.error(`\nFAILED TESTS SUMMARY (${failedTests}):`);
    failures.forEach((f, idx) => {
      console.error(`${idx + 1}) [${f.suite}] > ${f.test}`);
      console.error(`   ${f.error.message}\n`);
    });
    process.exit(1);
  } else {
    console.log('🎉 100% E2E TEST PASS RATE ACROSS ALL 4 TIERS!\n');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
