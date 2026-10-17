// PF2E — scripts/formula.mjs
// Safe evaluator for rule-element value expressions (no eval, no Function).
// Supports numbers, + - * /, parentheses, @path variables and a small set of functions.

const FUNCTIONS = {
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  max: (...a) => Math.max(...a),
  min: (...a) => Math.min(...a),
  gte: (a, b) => (a >= b ? 1 : 0),
  lte: (a, b) => (a <= b ? 1 : 0),
  gt: (a, b) => (a > b ? 1 : 0),
  lt: (a, b) => (a < b ? 1 : 0),
  eq: (a, b) => (a === b ? 1 : 0),
};

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) return null;
      tokens.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    if (ch === '@') {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_.\-]/.test(src[j])) j++;
      tokens.push({ t: 'var', v: src.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/(),'.includes(ch)) {
      tokens.push({ t: ch });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

function lookup(path, ctx) {
  let cur = ctx;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return null;
    cur = cur[part];
  }
  const n = Number(cur);
  return cur !== null && cur !== undefined && cur !== '' && Number.isFinite(n) ? n : null;
}

class Parser {
  constructor(tokens, ctx) {
    this.tokens = tokens;
    this.ctx = ctx;
    this.pos = 0;
    this.failed = false;
  }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  fail() { this.failed = true; return null; }

  parseExpression() {
    let left = this.parseTerm();
    while (!this.failed && this.peek() && (this.peek().t === '+' || this.peek().t === '-')) {
      const op = this.next().t;
      const right = this.parseTerm();
      if (left === null || right === null) return this.fail();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  parseTerm() {
    let left = this.parseUnary();
    while (!this.failed && this.peek() && (this.peek().t === '*' || this.peek().t === '/')) {
      const op = this.next().t;
      const right = this.parseUnary();
      if (left === null || right === null) return this.fail();
      if (op === '/' && right === 0) return this.fail();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  parseUnary() {
    const tok = this.peek();
    if (tok && tok.t === '-') {
      this.next();
      const v = this.parseUnary();
      return v === null ? this.fail() : -v;
    }
    if (tok && tok.t === '+') {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const tok = this.next();
    if (!tok) return this.fail();
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'var') {
      const v = lookup(tok.v, this.ctx);
      return v === null ? this.fail() : v;
    }
    if (tok.t === '(') {
      const v = this.parseExpression();
      if (!this.peek() || this.next().t !== ')') return this.fail();
      return v;
    }
    if (tok.t === 'id') {
      const name = tok.v.toLowerCase();
      if (!this.peek() || this.next().t !== '(') return this.fail();
      const args = [];
      if (this.peek() && this.peek().t === ')') {
        this.next();
      } else {
        for (;;) {
          const v = this.parseExpression();
          if (v === null) return this.fail();
          args.push(v);
          const sep = this.next();
          if (!sep) return this.fail();
          if (sep.t === ')') break;
          if (sep.t !== ',') return this.fail();
        }
      }
      if (name === 'ternary') {
        if (args.length !== 3) return this.fail();
        return args[0] ? args[1] : args[2];
      }
      const fn = FUNCTIONS[name];
      if (!fn || args.length === 0) return this.fail();
      return fn(...args);
    }
    return this.fail();
  }
}

/**
 * Evaluates a rule-element value. Returns a finite number, or null when the
 * value is not a number and cannot be resolved safely.
 *
 * @param {number|string|any} value Number, numeric string or expression string
 * @param {{ actor?: any, item?: any }} [ctx] Variables available as @actor.* / @item.*
 * @returns {number|null}
 */
export function evaluateValue(value, ctx = {}) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const src = value.trim();
  if (src === '') return null;
  const plain = Number(src);
  if (Number.isFinite(plain)) return plain;
  const tokens = tokenize(src);
  if (!tokens || tokens.length === 0) return null;
  const parser = new Parser(tokens, ctx);
  const result = parser.parseExpression();
  if (parser.failed || result === null || parser.pos !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}
