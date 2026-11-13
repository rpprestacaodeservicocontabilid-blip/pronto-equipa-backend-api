'use strict';

const permissions = [
  ['loans.applications.create', 'Submeter pedidos de empréstimo.', 'loans.applications', 'create'],
  ['loans.applications.read', 'Consultar pedidos de empréstimo.', 'loans.applications', 'read'],
  ['loans.applications.update', 'Alterar pedidos de empréstimo em rascunho.', 'loans.applications', 'update'],
  ['loans.applications.submit', 'Submeter pedidos de empréstimo para decisão.', 'loans.applications', 'submit'],
  ['loans.applications.decide', 'Decidir pedidos de empréstimo.', 'loans.applications', 'decide'],
  ['loans.applications.cancel', 'Cancelar pedidos de empréstimo.', 'loans.applications', 'cancel'],
  ['loans.loans.read', 'Consultar empréstimos e respectivos saldos.', 'loans.loans', 'read'],
  ['loans.loans.manage', 'Suspender ou retomar empréstimos.', 'loans.loans', 'manage'],
  ['loans.loans.settle', 'Liquidar empréstimos reconciliados.', 'loans.loans', 'settle'],
  ['loans.policies.read', 'Consultar políticas de empréstimo.', 'loans.policies', 'read'],
  ['loans.policies.manage', 'Configurar políticas de empréstimo.', 'loans.policies', 'manage'],
  ['loans.simulations.create', 'Simular planos de reembolso.', 'loans.simulations', 'create'],
  ['loans.disbursements.read', 'Consultar desembolsos de empréstimo.', 'loans.disbursements', 'read'],
  ['loans.disbursements.request', 'Solicitar o desembolso de empréstimos aprovados.', 'loans.disbursements', 'request'],
  ['loans.disbursements.confirm', 'Confirmar desembolsos efectivamente pagos.', 'loans.disbursements', 'confirm'],
  ['loans.repayments.read', 'Consultar amortizações de empréstimos.', 'loans.repayments', 'read'],
  ['loans.repayments.register', 'Registar pagamentos confirmados.', 'loans.repayments', 'register'],
  ['loans.repayments.reverse', 'Reverter pagamentos com referência de estorno.', 'loans.repayments', 'reverse'],
  ['loans.deductions.read', 'Consultar descontos salariais de empréstimos.', 'loans.deductions', 'read'],
  ['loans.deductions.request', 'Solicitar descontos à folha salarial.', 'loans.deductions', 'request'],
  ['loans.deductions.confirm', 'Confirmar descontos executados pela folha salarial.', 'loans.deductions', 'confirm'],
  ['loans.renegotiations.request', 'Solicitar renegociação de empréstimos.', 'loans.renegotiations', 'request'],
  ['loans.renegotiations.decide', 'Decidir pedidos de renegociação.', 'loans.renegotiations', 'decide'],
  ['loans.reports.read', 'Consultar relatórios de empréstimos.', 'loans.reports', 'read'],
];

module.exports = {
  async up(queryInterface) {
    const [existingRows] = await queryInterface.sequelize.query('SELECT name FROM permissions');
    const existing = new Set(existingRows.map((row) => row.name));
    const now = new Date();
    const missing = permissions
      .filter(([name]) => !existing.has(name))
      .map(([name, description, resource, action]) => ({
        name,
        description,
        resource,
        action,
        scope: 'TENANT',
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }));
    if (missing.length) await queryInterface.bulkInsert('permissions', missing);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', { name: permissions.map(([name]) => name) });
  },
};
