const mysql = require('mysql2');

function createDatabaseConnection(config) {
  const db = mysql.createConnection(config);

  db.connect((err) => {
    if (err) {
      console.error('⚠ MySQL 연결 실패:', err);
      return;
    }
    console.log('✅ MySQL 연결 성공');
  });

  return db;
}

module.exports = createDatabaseConnection;
