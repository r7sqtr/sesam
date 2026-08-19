export interface Binding<A extends string> {
  seq: string[];
  action: A;
}

interface TrieNode<A extends string> {
  action?: A;
  children: Map<string, TrieNode<A>>;
}

const PENDING_TIMEOUT_MS = 600;

export function normalizeKey(event: KeyboardEvent): string | null {
  const key = event.key;
  if (key === "Control" || key === "Meta" || key === "Alt" || key === "Shift") {
    return null;
  }
  const mods: string[] = [];
  if (event.ctrlKey) mods.push("ctrl");
  if (event.metaKey) mods.push("cmd");
  if (event.altKey) mods.push("alt");
  if (event.shiftKey && key.length > 1) mods.push("shift");
  if (mods.length > 0) {
    return `${mods.join("+")}+${key.length === 1 ? key.toLowerCase() : key}`;
  }
  return key;
}

export interface KeyEngine {
  handleKeyDown: (event: KeyboardEvent) => boolean;
  reset: () => void;
}

export function createKeyEngine<A extends string>(
  bindings: Binding<A>[],
  onAction: (action: A, count: number) => void,
  onPendingChange: (pending: string) => void,
): KeyEngine {
  const root: TrieNode<A> = { children: new Map() };
  for (const binding of bindings) {
    let node = root;
    for (const token of binding.seq) {
      let child = node.children.get(token);
      if (!child) {
        child = { children: new Map() };
        node.children.set(token, child);
      }
      node = child;
    }
    node.action = binding.action;
  }

  let pendingNode: TrieNode<A> | null = null;
  let pendingTokens: string[] = [];
  let countDigits = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const notify = () => {
    onPendingChange(countDigits + pendingTokens.join(""));
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const reset = () => {
    clearTimer();
    pendingNode = null;
    pendingTokens = [];
    countDigits = "";
    notify();
  };

  const armTimer = () => {
    clearTimer();
    timer = setTimeout(() => {
      pendingNode = null;
      pendingTokens = [];
      countDigits = "";
      notify();
    }, PENDING_TIMEOUT_MS);
  };

  const feed = (token: string): boolean => {
    if (
      pendingTokens.length === 0 &&
      /^\d$/.test(token) &&
      (countDigits.length > 0 || token !== "0")
    ) {
      countDigits += token;
      armTimer();
      notify();
      return true;
    }

    const base = pendingNode ?? root;
    const next = base.children.get(token);

    if (!next) {
      const retry = pendingNode !== null && root.children.has(token);
      reset();
      if (retry) {
        return feed(token);
      }
      return false;
    }

    if (next.action !== undefined && next.children.size === 0) {
      const count = countDigits ? parseInt(countDigits, 10) : 1;
      const action = next.action;
      reset();
      onAction(action, count);
      return true;
    }

    pendingNode = next;
    pendingTokens.push(token);
    armTimer();
    notify();
    return true;
  };

  return {
    handleKeyDown: (event: KeyboardEvent) => {
      const token = normalizeKey(event);
      if (token === null) return false;
      const handled = feed(token);
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
    reset,
  };
}
