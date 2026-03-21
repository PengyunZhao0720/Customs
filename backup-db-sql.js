const { Pool } = require('pg');
const fs = require('fs');

// Render 数据库连接字符串（External URL）
const DATABASE_URL = 'postgresql://customsqa_user:yDUgyf4Rdlr1AnlZxJJVZc60dWfqkgmT@dpg-d6v7kmdm5p6s73a6f3l0-a.oregon-postgres.render.com/customsqa';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

function escapeSQL(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return "'" + value.replace(/'/g, "''") + "'";
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return "'" + value.toISOString() + "'";
  return value;
}

async function exportTable(tableName) {
  const result = await pool.query(`SELECT * FROM ${tableName}`);
  const rows = result.rows;
  
  if (rows.length === 0) {
    console.log(`   ${tableName}: 0 条数据`);
    return '';
  }

  let sql = `-- ${tableName} 表数据 (${rows.length} 条)\n`;
  
  const columns = Object.keys(rows[0]);
  
  for (const row of rows) {
    const values = columns.map(col => escapeSQL(row[col]));
    sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
  }
  
  sql += '\n';
  console.log(`   ${tableName}: ${rows.length} 条数据`);
  return sql;
}

async function backupDatabase() {
  try {
    console.log('开始导出数据库...\n');

    let sqlContent = `-- 数据库备份\n`;
    sqlContent += `-- 生成时间: ${new Date().toISOString()}\n`;
    sqlContent += `-- 来源: Render PostgreSQL\n\n`;
    
    // 导出各表数据
    sqlContent += await exportTable('users');
    sqlContent += await exportTable('questions');
    sqlContent += await exportTable('answers');
    sqlContent += await exportTable('notifications');
    sqlContent += await exportTable('follows');

    // 保存为 SQL 文件
    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql`;
    fs.writeFileSync(filename, sqlContent);

    console.log(`\n✅ 导出成功！文件: ${filename}`);

  } catch (err) {
    console.error('\n❌ 导出失败:', err.message);
    console.log('\n💡 提示: Render 免费 PostgreSQL 可能不允许外部连接。');
    console.log('   请尝试在 Render Dashboard 的 Web Service Shell 中运行:');
    console.log('   node backup-db.js');
  } finally {
    await pool.end();
  }
}

backupDatabase();
