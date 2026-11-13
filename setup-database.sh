#!/bin/bash

# Script de Configuração Rápida para Sequelize Multi-Banco
# Uso: bash setup-database.sh

clear

echo "========================================"
echo "  🚀 Sequelize Multi-Database Setup"
echo "========================================"
echo ""

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado. Instale Node.js primeiro."
    exit 1
fi

echo "✅ Node.js/npm encontrado"
echo ""

# Perguntar qual banco de dados usar
echo "Qual banco de dados você deseja usar?"
echo ""
echo "1) PostgreSQL (padrão, recomendado)"
echo "2) MySQL"
echo "3) Oracle"
echo ""
read -p "Escolha (1-3): " choice

case $choice in
    1)
        DIALECT="postgres"
        HOST="localhost"
        PORT="5432"
        USER="postgres"
        PASSWORD="postgres"
        DB_NAME="peladeiro"
        DOCKER_CMD="docker run --name peladeiro-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=peladeiro -p 5432:5432 -d postgres:15"
        ;;
    2)
        DIALECT="mysql"
        HOST="localhost"
        PORT="3306"
        USER="root"
        PASSWORD="root"
        DB_NAME="peladeiro"
        DOCKER_CMD="docker run --name peladeiro-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=peladeiro -p 3306:3306 -d mysql:8.0"
        ;;
    3)
        DIALECT="oracle"
        HOST="localhost"
        PORT="1521"
        USER="system"
        PASSWORD="oracle"
        DB_NAME="XE"
        DOCKER_CMD="docker run --name peladeiro-oracle -e ORACLE_PWD=oracle -p 1521:1521 -d gvenzl/oracle-xe"
        ;;
    *)
        echo "❌ Opção inválida"
        exit 1
        ;;
esac

echo ""
echo "========================================"
echo "  Configuração para: $DIALECT"
echo "========================================"
echo ""

# Criar .env
if [ ! -f .env ]; then
    echo "📝 Criando arquivo .env..."
    cat > .env << EOF
# Banco de Dados
DB_DIALECT=$DIALECT
DB_HOST=$HOST
DB_PORT=$PORT
DB_USER=$USER
DB_PASSWORD=$PASSWORD
DB_NAME=$DB_NAME

# Servidor
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=secret-key-change-in-production
EOF
    echo "✅ Arquivo .env criado"
else
    echo "ℹ️  Arquivo .env já existe"
fi

echo ""

# Instalar dependências
read -p "Instalar/atualizar dependências npm? (y/n): " install_deps

if [ "$install_deps" = "y" ] || [ "$install_deps" = "Y" ]; then
    echo "📦 Instalando dependências..."
    npm install
    echo "✅ Dependências instaladas"
else
    echo "⏭️  Pulando instalação de dependências"
fi

echo ""

# Perguntar sobre Docker
read -p "Deseja usar Docker para o banco de dados? (y/n): " use_docker

if [ "$use_docker" = "y" ] || [ "$use_docker" = "Y" ]; then
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker não encontrado"
    else
        echo "🐳 Iniciando container Docker..."
        eval $DOCKER_CMD
        echo "✅ Container iniciado"
        
        if [ "$DIALECT" = "oracle" ]; then
            echo "⏳ Aguardando inicialização do Oracle (1-2 minutos)..."
            sleep 30
        else
            sleep 5
        fi
    fi
fi

echo ""

# Testar conexão
read -p "Testar conexão com o banco de dados? (y/n): " test_conn

if [ "$test_conn" = "y" ] || [ "$test_conn" = "Y" ]; then
    echo ""
    echo "🔍 Testando conexão..."
    echo ""
    npx ts-node src/scripts/test-database.ts
fi

echo ""
echo "========================================"
echo "  ✅ Configuração Concluída!"
echo "========================================"
echo ""
echo "Próximos passos:"
echo ""
echo "1. Executar migrações:"
echo "   npm run sequelize db:migrate"
echo ""
echo "2. Iniciar servidor:"
echo "   npm run dev"
echo ""
echo "3. Ver documentação:"
echo "   - DATABASE_SETUP.md (guia completo)"
echo "   - SEQUELIZE_SETUP_COMPLETE.md (resumo)"
echo ""
echo "========================================"
