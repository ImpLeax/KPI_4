// Small DOM helpers. Text always goes through textContent, never innerHTML.

/**
 * Create an element.
 * @param {string} tag
 * @param {{class?: string, text?: string, attrs?: Record<string, string|number|boolean|null|undefined>, dataset?: Record<string, string>, on?: Record<string, EventListener>}} [options]
 * @param {Array<Node|string|null|undefined|false>} [children]
 */
export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined && options.text !== null) node.textContent = String(options.text);
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value === false || value === null || value === undefined) continue;
      node.setAttribute(name, value === true ? '' : String(value));
    }
  }
  if (options.dataset) Object.assign(node.dataset, options.dataset);
  if (options.on) {
    for (const [event, handler] of Object.entries(options.on))
      node.addEventListener(event, handler);
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return parent;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function show(node, visible = true) {
  node.hidden = !visible;
}

export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
