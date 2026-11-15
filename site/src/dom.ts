type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> | null;

function apply(element: Element, props: Props): void {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      element.setAttribute('class', String(value));
    } else if (key === 'dataset' && typeof value === 'object') {
      for (const [name, data] of Object.entries(value as Record<string, string>)) {
        (element as HTMLElement).dataset[name] = data;
      }
    } else {
      element.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

function append(element: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'object' ? child : String(child));
  }
}

/** Builds an element. Text is always inserted as text, never parsed as markup. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  apply(element, props ?? null);
  append(element, children);
  return element;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: Props,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  apply(element, props ?? null);
  append(element, children);
  return element;
}

/** Replaces `{token}` markers in a template with nodes (for example bold numbers). */
export function fill(template: string, values: Record<string, Node | string>): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const part of template.split(/(\{\w+\})/)) {
    const match = /^\{(\w+)\}$/.exec(part);
    const value = match?.[1] === undefined ? undefined : values[match[1]];
    if (value === undefined) {
      if (part) fragment.append(part);
    } else {
      fragment.append(typeof value === 'string' ? document.createTextNode(value) : value);
    }
  }
  return fragment;
}
