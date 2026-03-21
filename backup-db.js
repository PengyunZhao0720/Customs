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

async function backupDatabase() {
  try {
    console.log('开始备份数据库...');

    // 获取所有表数据
    const users = await pool.query('SELECT * FROM users ORDER BY id');
    const questions = await pool.query('SELECT * FROM questions ORDER BY id');
    const answers = await pool.query('SELECT * FROM answers ORDER BY id');
    const notifications = await pool.query('SELECT * FROM notifications ORDER BY id');
    const follows = await pool.query('SELECT * FROM follows ORDER BY id');

    const backup = {
      backup_date: new Date().toISOString(),
      tables: {
        users: users.rows,
        questions: questions.rows,
        answers: answers.rows,
        notifications: notifications.rows,
        follows: follows.rows
      }
    };

    // 保存为 JSON 文件
    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    fs.writeFileSync(filename, JSON.stringify(backup, null, 2));

    console.log(`✅ 备份成功！文件: ${filename}`);
    console.log(`📊 数据统计:`);
    console.log(`   - 用户: ${users.rows.length} 条`);
    console.log(`   - 问题: ${questions.rows.length} 条`);
    console.log(`   - 回答: ${answers.rows.length} 条`);
    console.log(`   - 通知: ${notifications.rows.length} 条`);
    console.log(`   - 关注: ${follows.rows.length} 条`);

  } catch (err) {
    console.error('❌ 备份失败:', err.message);
  } finally {
    await pool.end();
  }
}

backupDatabase();
