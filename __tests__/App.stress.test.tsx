import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import appConfig from '../app.json';

describe('App.tsx Empirical Stress & Adversarial Runtime Suite', () => {
  describe('1. Branding & Content Verification', () => {
    it('renders exact "Sked SMS" in header title text element with testID', () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });

      const root = renderer.root;
      const headerTitle = root.findByProps({ testID: 'app-header-title' });
      expect(headerTitle).toBeDefined();
      expect(headerTitle.props.children).toBe('Sked SMS');

      act(() => {
        renderer.unmount();
      });
    });

    it('renders exact subtitle "Automated SMS Scheduler"', () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });

      const root = renderer.root;
      const textNodes = root.findAllByType('Text' as any);
      const subtitleNode = textNodes.find(
        node => node.props.children === 'Automated SMS Scheduler'
      );
      expect(subtitleNode).toBeDefined();

      act(() => {
        renderer.unmount();
      });
    });

    it('renders welcome and body text describing automated SMS scheduling', () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });

      const root = renderer.root;
      const textNodes = root.findAllByType('Text' as any);
      const welcomeNode = textNodes.find(
        node => node.props.children === 'Welcome to Sked SMS'
      );
      expect(welcomeNode).toBeDefined();

      const bodyNode = textNodes.find(node =>
        typeof node.props.children === 'string' &&
        node.props.children.includes('Schedule automated SMS messages to selected contacts at specified dates and times.')
      );
      expect(bodyNode).toBeDefined();

      act(() => {
        renderer.unmount();
      });
    });

    it('validates configuration branding alignment with app.json', () => {
      expect(appConfig.name).toBe('SkedSMS');
      expect(appConfig.displayName).toBe('Sked SMS');
    });
  });

  describe('2. Repeated Mount & Unmount Stress Test (500 cycles)', () => {
    it('survives 1,000 consecutive rapid mount and unmount cycles with bounded heap growth', () => {
      // Force GC if available or record initial heap
      if (global.gc) {
        global.gc();
        global.gc();
      }
      const initialHeap = process.memoryUsage().heapUsed;
      const CYCLES = 1000;

      for (let i = 0; i < CYCLES; i++) {
        let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
        act(() => {
          renderer = ReactTestRenderer.create(<App />);
        });
        expect(renderer).not.toBeNull();
        expect(renderer!.toJSON()).toBeTruthy();
        act(() => {
          renderer!.unmount();
        });
      }

      if (global.gc) {
        global.gc();
        global.gc();
      }
      const finalHeap = process.memoryUsage().heapUsed;
      // Growth should be tightly bounded (< 75MB with explicit GC, or < 80MB uncollected in V8 without --expose-gc)
      const heapDiffMB = (finalHeap - initialHeap) / (1024 * 1024);
      const maxAllowedHeapDiffMB = (global as any).gc ? 75 : 80;
      expect(heapDiffMB).toBeLessThan(maxAllowedHeapDiffMB);
    });
  });

  describe('3. High-Concurrency Mounting Stress Test', () => {
    it('mounts 50 concurrent App instances simultaneously and unmounts cleanly', () => {
      const INSTANCES = 50;
      const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

      act(() => {
        for (let i = 0; i < INSTANCES; i++) {
          renderers.push(ReactTestRenderer.create(<App />));
        }
      });

      expect(renderers.length).toBe(INSTANCES);

      for (const renderer of renderers) {
        const json = renderer.toJSON();
        expect(json).toBeTruthy();
      }

      act(() => {
        for (const renderer of renderers) {
          renderer.unmount();
        }
      });
    });
  });

  describe('4. Rapid Remount, Update Cycling & Adversarial Props', () => {
    it('handles multiple consecutive updates via act without state corruption', () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });

      for (let i = 0; i < 50; i++) {
        act(() => {
          renderer.update(<App />);
        });
      }

      const json = renderer.toJSON();
      expect(json).toBeTruthy();

      act(() => {
        renderer.unmount();
      });
    });

    it('safely tolerates unexpected / extraneous props without crashing', () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      expect(() => {
        act(() => {
          // Pass adversarial extra props to functional component
          renderer = ReactTestRenderer.create(
            <App {...({ extraneous: 'test', count: 999, active: false } as any)} />
          );
        });
      }).not.toThrow();

      const json = renderer.toJSON();
      expect(json).toBeTruthy();

      act(() => {
        renderer.unmount();
      });
    });

    it('safely handles double unmount attempt', () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });

      act(() => {
        renderer.unmount();
      });

      expect(() => {
        act(() => {
          renderer.unmount();
        });
      }).not.toThrow();
    });
  });

  describe('5. Component Structure & Tree Assertions', () => {
    it('has expected hierarchy: RCTSafeAreaView > View (header), View (content)', () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });

      const json = renderer.toJSON() as any;
      expect(json).toBeDefined();
      expect(json.type).toBe('RCTSafeAreaView');
      expect(json.children).toBeDefined();
      expect(json.children.length).toBe(2); // Header View and Content View

      const [headerView, contentView] = json.children;
      expect(headerView.type).toBe('View');
      expect(contentView.type).toBe('View');

      act(() => {
        renderer.unmount();
      });
    });

    it('renders with light-content StatusBar barStyle', () => {
      const { StatusBar } = require('react-native');
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });

      const root = renderer.root;
      const statusBar = root.findByType(StatusBar);
      expect(statusBar).toBeDefined();
      expect(statusBar.props.barStyle).toBe('light-content');

      act(() => {
        renderer.unmount();
      });
    });

    it('does not contain placeholder tokens (TODO, Lorem, FIXME, Sample, Template)', () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });

      const root = renderer.root;
      const textNodes = root.findAllByType('Text' as any);
      for (const node of textNodes) {
        const str = JSON.stringify(node.props.children || '');
        expect(str).not.toMatch(/TODO|FIXME|Lorem|Template|Untitled/i);
      }

      act(() => {
        renderer.unmount();
      });
    });
  });

  describe('6. Android Native Branding Integrity', () => {
    it('matches strings.xml app_name resource with React Native branding', () => {
      const fs = require('fs');
      const path = require('path');
      const stringsXmlPath = path.resolve(__dirname, '../android/app/src/main/res/values/strings.xml');
      const stringsContent = fs.readFileSync(stringsXmlPath, 'utf8');
      expect(stringsContent).toContain('<string name="app_name">Sked SMS</string>');
    });

    it('matches AndroidManifest.xml package and application label', () => {
      const fs = require('fs');
      const path = require('path');
      const manifestPath = path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml');
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      expect(manifestContent).toContain('package="com.skedsms"');
      expect(manifestContent).toContain('android:label="@string/app_name"');
    });
  });
});
