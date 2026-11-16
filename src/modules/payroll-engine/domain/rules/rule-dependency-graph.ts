import { PayrollEngineError } from '../errors/payroll-engine.error';

export interface CalculationRuleNode {
  code: string;
  dependsOn: string[];
}

export class RuleDependencyGraph {
  order(nodes: CalculationRuleNode[]): string[] {
    const byCode = new Map(nodes.map((node) => [node.code, node]));
    if (byCode.size !== nodes.length)
      throw new PayrollEngineError('Calculation rule codes must be unique.', 'DUPLICATE_RULE_CODE');
    for (const node of nodes) {
      for (const dependency of node.dependsOn) {
        if (!byCode.has(dependency))
          throw new PayrollEngineError(
            `Unknown rule dependency: ${dependency}.`,
            'RULE_DEPENDENCY_MISSING',
          );
        if (dependency === node.code)
          throw new PayrollEngineError('A rule cannot depend on itself.', 'RULE_DEPENDENCY_CYCLE');
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const result: string[] = [];
    const visit = (code: string) => {
      if (visiting.has(code))
        throw new PayrollEngineError(
          'Calculation rule dependencies contain a cycle.',
          'RULE_DEPENDENCY_CYCLE',
        );
      if (visited.has(code)) return;
      visiting.add(code);
      for (const dependency of byCode.get(code)!.dependsOn) visit(dependency);
      visiting.delete(code);
      visited.add(code);
      result.push(code);
    };
    for (const node of nodes) visit(node.code);
    return result;
  }
}
