import { PayrollEngineError } from '../errors/payroll-engine.error';
import { Money } from '../value-objects/money.vo';

export type RuleExpression =
  | { op: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE' | 'MIN' | 'MAX'; args: RuleExpression[] }
  | { op: 'ROUND'; mode: 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP'; value: RuleExpression }
  | { op: 'PERCENTAGE'; value: RuleExpression; rate: string }
  | { op: 'LOOKUP'; key: string; table: Record<string, string> }
  | {
      op: 'IF';
      condition: {
        op: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ';
        left: RuleExpression;
        right: RuleExpression;
      };
      then: RuleExpression;
      else: RuleExpression;
    }
  | { op: 'VALUE'; value: string };

const MAX_NODES = 200;

export function evaluateRule(expression: RuleExpression): Money {
  let visits = 0;
  const evaluate = (node: RuleExpression): Money => {
    if (++visits > MAX_NODES)
      throw new PayrollEngineError('Rule expression is too complex.', 'RULE_LIMIT_EXCEEDED');
    if (!node || typeof node !== 'object' || !('op' in node))
      throw new PayrollEngineError('Malformed declarative rule.', 'INVALID_RULE_EXPRESSION');
    switch (node.op) {
      case 'VALUE':
        return Money.parse(node.value);
      case 'LOOKUP': {
        if (!Object.prototype.hasOwnProperty.call(node.table, node.key))
          throw new PayrollEngineError('Rule lookup key is not defined.', 'RULE_LOOKUP_MISSING');
        return Money.parse(node.table[node.key]);
      }
      case 'ROUND':
        return evaluate(node.value).round(node.mode);
      case 'PERCENTAGE':
        return evaluate(node.value).multiplyRate(node.rate);
      case 'IF': {
        const left = evaluate(node.condition.left).micros;
        const right = evaluate(node.condition.right).micros;
        const matches =
          node.condition.op === 'GT'
            ? left > right
            : node.condition.op === 'GTE'
              ? left >= right
              : node.condition.op === 'LT'
                ? left < right
                : node.condition.op === 'LTE'
                  ? left <= right
                  : left === right;
        return evaluate(matches ? node.then : node.else);
      }
      case 'ADD':
      case 'SUBTRACT':
      case 'MULTIPLY':
      case 'DIVIDE':
      case 'MIN':
      case 'MAX': {
        if (node.args.length < 2)
          throw new PayrollEngineError(
            'Arithmetic rule requires at least two operands.',
            'INVALID_RULE_EXPRESSION',
          );
        const values = node.args.map(evaluate);
        if (node.op === 'ADD') return values.reduce((sum, value) => sum.add(value), Money.zero());
        if (node.op === 'SUBTRACT')
          return values.slice(1).reduce((sum, value) => sum.subtract(value), values[0]);
        if (node.op === 'MIN') return values.reduce((a, b) => a.min(b));
        if (node.op === 'MAX') return values.reduce((a, b) => a.max(b));
        if (node.op === 'MULTIPLY')
          return values
            .slice(1)
            .reduce((a, b) => a.multiplyFraction(b.micros, 1_000_000n), values[0]);
        return values.slice(1).reduce((a, b) => a.divide(b.micros), values[0]);
      }
      default:
        throw new PayrollEngineError(
          'Unsupported declarative rule operation.',
          'UNSUPPORTED_RULE_OPERATION',
        );
    }
  };
  return evaluate(expression);
}
