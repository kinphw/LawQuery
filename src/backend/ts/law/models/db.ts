import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'ldbuser',
  password: '1226',
  database: 'ldb',
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
