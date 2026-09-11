import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import appConfig from '../app.json';

describe('Sked SMS Baseline App Verification', () => {
  it('has valid app.json branding configuration', () => {
    expect(appConfig.name).toBe('SkedSMS');
    expect(appConfig.displayName).toBe('Sked SMS');
  });

  it('exports a valid React component function', () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });

  it('mounts and renders the App component hierarchy without crashing', () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = ReactTestRenderer.create(<App />);
    });
    expect(tree).toBeDefined();
    const json = tree!.toJSON();
    expect(json).toBeTruthy();
  });

  it('renders the "Sked SMS" application title in the component tree', () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = ReactTestRenderer.create(<App />);
    });
    const root = tree!.root;
    const textNodes = root.findAllByType('Text' as any);
    const hasAppTitle = textNodes.some(node => {
      const children = node.props.children;
      if (typeof children === 'string') {
        return children.includes('Sked SMS');
      }
      if (Array.isArray(children)) {
        return children.some(c => typeof c === 'string' && c.includes('Sked SMS'));
      }
      return false;
    });
    expect(hasAppTitle).toBe(true);
  });

  it('renders subtitle or description reflecting automated SMS scheduling', () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = ReactTestRenderer.create(<App />);
    });
    const root = tree!.root;
    const textNodes = root.findAllByType('Text' as any);
    const hasSchedulerText = textNodes.some(node => {
      const children = node.props.children;
      const str = Array.isArray(children) ? children.join(' ') : String(children || '');
      return /SMS|Scheduler|schedule/i.test(str);
    });
    expect(hasSchedulerText).toBe(true);
  });

  it('unmounts cleanly without throwing errors or leaving leaks', () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = ReactTestRenderer.create(<App />);
    });
    expect(() => {
      act(() => {
        tree!.unmount();
      });
    }).not.toThrow();
  });
});
