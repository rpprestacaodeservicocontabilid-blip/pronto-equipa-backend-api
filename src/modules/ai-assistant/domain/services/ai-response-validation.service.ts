export interface AiResponseValidationInput {
  answer: string;
  citations: ReadonlyArray<{ sourceId: string; reference: string }>;
  usedTools: readonly string[];
  expectedTools?: readonly string[];
  containsNumbers: boolean;
}

export interface AiResponseValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Validação de respostas estruturadas (RF-AI-059, RN-AI-011/012/014/015).
 *
 * Regras:
 *  - uma resposta que apresenta valores deve identificar a fonte;
 *  - sem evidência, a limitação deve ser declarada;
 *  - valores salariais oficiais nunca são atribuídos ao modelo;
 *  - respostas vazias ou meramente especulativas são inválidas.
 */
const UNCERTAINTY_MARKERS = [
  'não tenho informação',
  'nao tenho informacao',
  'não foi possível verificar',
  'nao foi possivel verificar',
  'não disponho de dados',
  'nao disponho de dados',
  'não sei',
  'nao sei',
  'estimativa',
  'não posso confirmar',
  'nao posso confirmar',
  'sem evidência',
  'sem evidencia',
];

const OFFICIAL_CALCULATION_MARKERS = [
  'valor final é',
  'o seu salário líquido é',
  'o salario liquido e',
  'deve pagar',
  'total a pagar',
];

export class AiResponseValidationService {
  validate(input: AiResponseValidationInput): AiResponseValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    const answer = String(input.answer ?? '').trim();
    const normalized = answer.toLowerCase();

    if (answer.length < 10) issues.push('EMPTY_ANSWER');
    if (answer.length > 32000) warnings.push('ANSWER_TOO_LONG');

    const declaresLimitation = UNCERTAINTY_MARKERS.some((marker) => normalized.includes(marker));

    // Valores numéricos exigem fonte (RN-AI-013).
    if (input.containsNumbers && input.citations.length === 0 && !declaresLimitation)
      issues.push('NUMERIC_ANSWER_WITHOUT_SOURCE');

    // Sem evidência, a limitação deve ser declarada (RN-AI-015).
    if (input.citations.length === 0 && input.usedTools.length === 0 && !declaresLimitation)
      issues.push('NO_EVIDENCE_AND_NO_LIMITATION');

    // O modelo não pode apresentar cálculos oficiais como seus (RN-AI-012).
    if (
      OFFICIAL_CALCULATION_MARKERS.some((marker) => normalized.includes(marker)) &&
      input.usedTools.length === 0 &&
      input.citations.length === 0
    )
      issues.push('OFFICIAL_CALCULATION_WITHOUT_ENGINE');

    // Ferramentas esperadas mas não executadas.
    for (const expected of input.expectedTools ?? []) {
      if (!input.usedTools.includes(expected)) warnings.push(`EXPECTED_TOOL_NOT_USED:${expected}`);
    }

    // Citações sem ferramenta correspondente são suspeitas.
    if (input.citations.length > 0 && input.usedTools.length === 0)
      warnings.push('CITATIONS_WITHOUT_TOOL');

    return { valid: issues.length === 0, issues, warnings };
  }

  /** Mensagem padrão quando não existe evidência suficiente. */
  noEvidenceMessage(): string {
    return 'Não disponho de informação autorizada para responder com segurança a esta pergunta. Posso ajudá-lo a localizar a secção correspondente na plataforma ou, se preferir, indicar os dados que necessito.';
  }

  /** Indica se uma resposta pode ser considerada estimativa. */
  isEstimate(answer: string): boolean {
    const normalized = String(answer ?? '').toLowerCase();
    return UNCERTAINTY_MARKERS.some((marker) => normalized.includes(marker));
  }
}
