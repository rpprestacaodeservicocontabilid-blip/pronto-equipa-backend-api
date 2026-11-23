'use strict';
// Migration image uses environment variables only; no TypeScript loader or bundled credentials.
const required=['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`${key} is required for production migrations.`);
if(process.env.DB_DIALECT!=='postgres')throw new Error('Production audit migrations require DB_DIALECT=postgres.');
module.exports={production:{dialect:'postgres',host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:process.env.DB_NAME,username:process.env.DB_USER,password:process.env.DB_PASSWORD,logging:false,migrationStorageTableName:'sequelize_migrations',...(process.env.DB_SSL==='true'?{dialectOptions:{ssl:{require:true,rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=='false'}}}:{})}};
