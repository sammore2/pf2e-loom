// PF2E — scripts/predicate.mjs
// Pure predicate evaluation for rule elements and modifiers (no SDK, no imports).

/**
 * Evaluates a single predicate statement against the provided options set.
 * Supports string match, `not:` prefix and boolean objects (and, or, nor, not).
 *
 * @param {any} statement
 * @param {Set<string>} optionsSet
 * @returns {boolean}
 */
function evaluateStatement(statement, optionsSet) {
  if (typeof statement === 'string') {
    const trimmed = statement.trim();
    if (trimmed.startsWith('not:')) {
      return !optionsSet.has(trimmed.slice(4).trim());
    }
    return optionsSet.has(trimmed);
  }

  if (statement && typeof statement === 'object' && !Array.isArray(statement)) {
    if (Array.isArray(statement.and)) {
      return statement.and.every((sub) => evaluateStatement(sub, optionsSet));
    }
    if (Array.isArray(statement.or)) {
      return statement.or.some((sub) => evaluateStatement(sub, optionsSet));
    }
    if (Array.isArray(statement.nor)) {
      return !statement.nor.some((sub) => evaluateStatement(sub, optionsSet));
    }
    if (statement.not !== undefined) {
      return !evaluateStatement(statement.not, optionsSet);
    }
  }

  // Unrecognized statement formats fail safely (the rule does not apply).
  return false;
}

/**
 * Evaluates whether a predicate is satisfied given a set or array of active roll options.
 *
 * @param {any} predicate Array of strings/objects or a single statement
 * @param {Set<string>|string[]} options Active roll options
 * @returns {boolean} True if the predicate is empty/absent or completely satisfied
 */
export function evaluatePredicate(predicate, options = new Set()) {
  if (!predicate) return true;
  if (Array.isArray(predicate) && predicate.length === 0) return true;

  const optionsSet = options instanceof Set ? options : new Set(Array.isArray(options) ? options : [options]);

  if (Array.isArray(predicate)) {
    return predicate.every((stmt) => evaluateStatement(stmt, optionsSet));
  }

  return evaluateStatement(predicate, optionsSet);
}
