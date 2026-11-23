'use strict';
const schema = require('../helpers/ai-schema.cjs');
module.exports = {
  async up(q, S) {
    const dialect = q.sequelize.getDialect();
    if (!['postgres','sqlite'].includes(dialect)) throw new Error('AI requires PostgreSQL; SQLite is supported for isolated tests.');
    const definitions = schema(S);
    await q.sequelize.transaction(async transaction => {
      for (const definition of definitions) {
        const columns = definition.columns;
        columns.createdAt ||= {type:S.DATE,allowNull:false};
        if (definition.updated) columns.updatedAt ||= {type:S.DATE,allowNull:false};
        await q.createTable(definition.table, columns, {transaction});
        for (const index of definition.indexes) await q.addIndex(definition.table,index.fields,{...index,transaction});
        if (columns.companyId && columns.id) await q.addIndex(definition.table,['companyId','id'],{unique:true,name:`${definition.table}_scope_id`,transaction});
        if (dialect === 'postgres' && columns.companyId) {
          const table = q.queryGenerator.quoteIdentifier(definition.table);
          const shared = ['ai_knowledge_sources','ai_knowledge_chunks'].includes(definition.table);
          const predicate = '"companyId"=NULLIF(current_setting(\'app.current_tenant\',true),\'\')::integer';
          await q.sequelize.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY; CREATE POLICY ai_tenant ON ${table} USING (${predicate}${shared ? ' OR "companyId" IS NULL' : ''}) WITH CHECK (${predicate});`,{transaction});
        }
      }
      for (const [child, column, parent] of [
        ['ai_messages','conversationId','ai_conversations'],
        ['ai_interactions','conversationId','ai_conversations'],
        ['ai_message_citations','messageId','ai_messages'],
        ['ai_context_snapshots','interactionId','ai_interactions'],
        ['ai_model_invocations','interactionId','ai_interactions'],
        ['ai_feedback','interactionId','ai_interactions'],
        ['ai_tool_executions','interactionId','ai_interactions'],
      ]) {
        await q.addConstraint(child,{fields:['companyId',column],type:'foreign key',name:`${child}_${column}_scope_fk`,references:{table:parent,fields:['companyId','id']},onDelete:'CASCADE',transaction});
      }
    });
  },
  async down() { throw new Error('AI history requires an explicit retention/export plan; automatic destructive rollback is disabled.'); },
};
