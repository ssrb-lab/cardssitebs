const mysql = require('mysql2/promise');

async function test() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'OloloBodilaHlo3',
      port: 3306
    });
    console.log('Connected to MySQL server!');
    await connection.query('CREATE DATABASE IF NOT EXISTS cardgame_local;');
    console.log('Database cardgame_local created or already exists.');
    connection.end();
  } catch(e) {
    console.error('Error connecting to MySQL:', e.message);
  }
}

test();
