import { Indexed } from './viz';
import * as wasmCode from 'wasm/code';
import { h, Fragment } from 'preact';
import * as preact from 'preact';
import * as preactCompat from 'preact/compat';
import * as d3 from 'd3';
import * as webtreemap from 'webtreemap/build/webtreemap';

export function showCodeTreemap(
  headers: Indexed<wasmCode.FunctionHeader>[],
  nameMap: Map<number, string>
) {
  const root = new FunctionNode('code');

  let nameToPath = (name: string) => name.split('.');
  const names = Array.from(nameMap.values());
  if (names.includes('go.buildid')) {
    // Likely Go binary
    nameToPath = (name: string) => name.split(/[._:]/);
  } else if (names.some((name) => name.startsWith('std::'))) {
    // Likely C++ binary
    nameToPath = (name: string) =>
      name
        // Trim off function parameter name lists
        .replace(/\(.*\)/, '')
        // And template parameters.
        .replace(/<.*>/, '')
        .split(':');
  }

  for (const header of headers) {
    const name = nameMap.get(header.index);
    const path = name
      ? nameToPath(name).filter((p) => p)
      : ['unknown', String(header.index)];
    root.addFunction(header, path);
  }
  root.sort();

  const container = document.createElement('div');
  container.className = 'code-treemap-container';
  document.body.appendChild(container);
  preact.render(
    <Treemap
      root={root}
      onDone={() => {
        preactCompat.unmountComponentAtNode(container);
        container.remove();
      }}
    />,
    container
  );
}

interface TreemapProps {
  root: webtreemap.Node;
  onDone: () => void;
}

class Treemap extends preact.Component<TreemapProps> {
  containerRef = preact.createRef();

  render() {
    const { onDone } = this.props;
    return (
      <>
        <button className='code-treemap-done' onClick={onDone}>
          ❌
        </button>
        <div className='code-treemap' ref={this.containerRef} />
      </>
    );
  }

  componentDidMount() {
    const { current: container } = this.containerRef;
    if (!container) {
      return;
    }
    const { root } = this.props;
    webtreemap.render(container, root, {
      caption(node) {
        return `${node.id} (${d3.format(',')(node.size)}))`;
      },
    });
  }
}
class FunctionNode implements webtreemap.Node {
  id: string;
  size: number;
  children: webtreemap.Node[] = [];
  childrenByName = new Map<string, FunctionNode>();

  constructor(id: string, size: number = 0) {
    this.id = id;
    this.size = size;
  }

  addFunction(func: wasmCode.FunctionHeader, path: string[]) {
    this.size += func.len;
    if (path.length === 1) {
      const child = new FunctionNode(path[0], func.len);
      this.children.push(child);
      return;
    }
    const [head, ...tail] = path;
    let child = this.childrenByName.get(head);
    if (!child) {
      child = new FunctionNode(head);
      this.children.push(child);
      this.childrenByName.set(head, child);
    }
    child.addFunction(func, tail);
  }

  sort() {
    this.children.sort((a, b) => d3.descending(a.size, b.size));
    for (const child of this.childrenByName.values()) {
      child.sort();
    }
  }
}
