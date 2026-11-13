#!/usr/bin/ENV ts-node
/**
 * Script para testar conexão com o banco de dados
 *
 * Uso:
 * ts-node src/scripts/test-database.ts
 *
 * Mostra informações sobre:
 * - Dialect configurado
 * - Status da conexão
 * - Versão do banco de dados
 * - Tabelas existentes
 */

import { sequelize } from '../infra/database';
import { logger } from '../config/logger';
import { ENV } from '../config/env';

async function testDatabase() {
  try {
    logger.info('🔍 Iniciando teste de conexão com banco de dados...\n');

    // Mostrar configuração
    logger.info('📋 Configuração do Banco de Dados:');
    logger.info(`   Dialect: ${ENV.DB.DIALECT.toUpperCase()}`);

    if ('host' in ENV.DB) {
      logger.info(`   Host: ${ENV.DB.HOST}`);
      logger.info(`   Port: ${ENV.DB.PORT}`);
      logger.info(`   Database: ${ENV.DB.NAME}`);
      logger.info(`   User: ${ENV.DB.USER}`);
    } else if ('url' in ENV.DB) {
      const url = ENV.DB.url;
      logger.info(
        `   URL: ${typeof url === 'string' ? url.substring(0, 50) : 'n/a'}...`,
      );
    }
    logger.info('');

    // Testar autenticação
    logger.info('🔗 Testando conexão...');
    await sequelize.authenticate();
    logger.info('✅ Conexão autenticada com sucesso!\n');

    // Obter informações do banco
    logger.info('📊 Informações do Banco de Dados:');

    const dialect = ENV.DB.DIALECT;

    if (dialect === 'postgres') {
      const result = await sequelize.query(`
        SELECT version() as version
      `);
      logger.info(`   Versão: ${(result[0] as any)[0].version}`);
    } else if (dialect === 'mysql') {
      const result = await sequelize.query('SELECT VERSION() as version');
      logger.info(`   Versão: ${(result[0] as any)[0].version}`);
    } else if (dialect === 'oracle') {
      const result = await sequelize.query(
        "SELECT * FROM v$version WHERE banner LIKE '%Database%'",
      );
      if (result[0] && Array.isArray(result[0]) && result[0].length > 0) {
        logger.info(`   Versão: ${(result[0][0] as any).BANNER}`);
      }
    }
    logger.info('');

    // Listar tabelas
    logger.info('📋 Tabelas Existentes:');
    const tables = await sequelize.showAllSchemas({ logging: false });

    if (Array.isArray(tables) && tables.length > 0) {
      tables.forEach((table) => {
        const tableName = typeof table === 'string' ? table : (table as any).tableName;
        if (tableName && !tableName.includes('sequelize')) {
          logger.info(`   ✓ ${tableName}`);
        }
      });
    } else {
      logger.info('   ℹ️  Nenhuma tabela de aplicação encontrada');
    }
    logger.info('');

    // Verificar migrations
    logger.info('📦 Status das Migrações:');
    try {
      const migrations = await sequelize.query('SELECT name FROM sequelize_meta ORDER BY name', {
        raw: true,
      });
      if (Array.isArray(migrations) && migrations.length > 0) {
        (migrations[0] as any[]).forEach((m: any) => {
          const migrationName = m.name || m.NAME;
          logger.info(`   ✓ ${migrationName}`);
        });
      } else {
        logger.info('   ℹ️  Nenhuma migração executada ainda');
      }
    } catch (error) {
      logger.info('   ℹ️  Tabela de migrações não encontrada');
    }
    logger.info('');

    // Status final
    logger.info('✅ Teste de conexão concluído com sucesso!');
    logger.info(`🚀 Seu banco de dados ${ENV.DB.DIALECT.toUpperCase()} está pronto para usar!`);
  } catch (error) {
    logger.error('❌ Erro ao testar conexão:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Executar
testDatabase();
