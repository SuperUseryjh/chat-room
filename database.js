const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const DB_PATH = './chat.db';
const saltRounds = 10;

let db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接错误:', err.message);
  } else {
    console.log('成功连接到 SQLite 数据库');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      isAdmin INTEGER DEFAULT 0 -- 0 for false, 1 for true
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      message TEXT,
      file_url TEXT,
      quoted_message TEXT, -- 新增字段，用于存储引用消息的 JSON 字符串
      mentions TEXT, -- 新增字段，用于存储提及用户的 JSON 字符串
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS invitation_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      max_uses INTEGER NOT NULL,
      current_uses INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS muted_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      is_muted INTEGER DEFAULT 1 -- 0 for false, 1 for true
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS user_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

// 注册用户
const registerUser = (username, password, isAdmin, callback) => {
  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      return callback(err);
    }
    db.run('INSERT INTO users (username, password, isAdmin) VALUES (?, ?, ?)', [username, hash, isAdmin ? 1 : 0], function(err) {
      if (err) {
        return callback(err);
      }
      callback(null, { id: this.lastID, username: username, isAdmin: isAdmin });
    });
  });
};

// 验证用户
const verifyUser = (username, password, callback) => {
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return callback(err);
    }
    if (!user) {
      return callback(null, false); // 用户不存在
    }
    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        return callback(err);
      }
      callback(null, result ? { username: user.username, isAdmin: user.isAdmin === 1, hashedPassword: user.password } : false); // result 为 true 或 false
    });
  });
};

// 更新用户密码
const updateUserPassword = (username, newHashedPassword, callback) => {
  db.run('UPDATE users SET password = ? WHERE username = ?', [newHashedPassword, username], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, this.changes > 0);
  });
};

// 保存消息
const saveMessage = (username, message, file_url, quotedMessage, mentions, callback) => {
  const quotedMessageJson = quotedMessage ? JSON.stringify(quotedMessage) : null;
  const mentionsJson = mentions && mentions.length > 0 ? JSON.stringify(mentions) : null;
  db.run('INSERT INTO messages (username, message, file_url, quoted_message, mentions) VALUES (?, ?, ?, ?, ?)', [username, message, file_url, quotedMessageJson, mentionsJson], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, { id: this.lastID, username: username, message: message, file_url: file_url, quoted_message: quotedMessage, mentions: mentions, timestamp: new Date().toISOString() });
  });
};

// 记录用户发言
const recordUserSpeech = (username, callback) => {
  db.run('INSERT INTO user_scores (username) VALUES (?)', [username], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, { id: this.lastID, username: username, timestamp: new Date().toISOString() });
  });
};

// 获取最近的消息
const getRecentMessages = (limit = 50, callback) => {
  db.all('SELECT username, message, file_url, quoted_message, mentions, timestamp FROM messages ORDER BY timestamp DESC LIMIT ?', [limit], (err, rows) => {
    if (err) {
      return callback(err);
    }
    const messagesWithParsedData = rows.map(row => ({
      ...row,
      quoted_message: row.quoted_message ? JSON.parse(row.quoted_message) : null,
      mentions: row.mentions ? JSON.parse(row.mentions) : [],
    }));
    callback(null, messagesWithParsedData.reverse()); // 返回按时间正序排列的消息
  });
};

// 获取所有用户
const getAllUsers = (callback) => {
  db.all('SELECT id, username, isAdmin FROM users', (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows.map(user => ({ ...user, isAdmin: user.isAdmin === 1 })));
  });
};

// 更新用户管理员状态
const updateUserAdminStatus = (username, isAdmin, callback) => {
  db.run('UPDATE users SET isAdmin = ? WHERE username = ?', [isAdmin ? 1 : 0, username], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, this.changes > 0);
  });
};

// 添加邀请码
const addInvitationCode = (code, maxUses, callback) => {
  db.run('INSERT INTO invitation_codes (code, max_uses, current_uses) VALUES (?, ?, 0)', [code, maxUses], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, { id: this.lastID, code: code, max_uses: maxUses, current_uses: 0 });
  });
};

// 获取邀请码
const getInvitationCode = (code, callback) => {
  db.get('SELECT * FROM invitation_codes WHERE code = ?', [code], (err, row) => {
    if (err) {
      return callback(err);
    }
    callback(null, row);
  });
};

// 递减邀请码使用次数
const decrementInvitationCodeUses = (code, callback) => {
  db.run('UPDATE invitation_codes SET current_uses = current_uses + 1 WHERE code = ? AND current_uses < max_uses', [code], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, this.changes > 0); // 如果 changes > 0，表示更新成功
  });
};

// 禁言用户
const muteUser = (username, callback) => {
  db.run('INSERT OR REPLACE INTO muted_users (username, is_muted) VALUES (?, 1)', [username], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, this.changes > 0);
  });
};

// 解禁用户
const unmuteUser = (username, callback) => {
  db.run('DELETE FROM muted_users WHERE username = ?', [username], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, this.changes > 0);
  });
};

// 检查用户是否被禁言
const isUserMuted = (username, callback) => {
  db.get('SELECT is_muted FROM muted_users WHERE username = ?', [username], (err, row) => {
    if (err) {
      return callback(err);
    }
    callback(null, row ? true : false);
  });
};

// 获取排行榜数据
const getLeaderboard = (timeframe, callback) => {
  let query = '';
  let params = [];
  const now = new Date();

  switch (timeframe) {
    case 'daily':
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      query = 'SELECT username, COUNT(*) AS score FROM user_scores WHERE timestamp >= ? GROUP BY username ORDER BY score DESC LIMIT 10';
      params = [startOfDay];
      break;
    case 'weekly':
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
      query = 'SELECT username, COUNT(*) AS score FROM user_scores WHERE timestamp >= ? GROUP BY username ORDER BY score DESC LIMIT 10';
      params = [startOfWeek];
      break;
    case 'monthly':
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      query = 'SELECT username, COUNT(*) AS score FROM user_scores WHERE timestamp >= ? GROUP BY username ORDER BY score DESC LIMIT 10';
      params = [startOfMonth];
      break;
    default:
      return callback(new Error('无效的时间范围'));
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows);
  });
};

// 获取所有邀请码
const getAllInvitationCodes = (callback) => {
  db.all('SELECT code, max_uses, current_uses FROM invitation_codes', (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows);
  });
};

// 获取所有邀请码
const getAllInvitationCodes = (callback) => {
  db.all('SELECT code, max_uses, current_uses FROM invitation_codes', (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows);
  });
};

// 获取所有旧图片的文件路径
const getOldImageFilePaths = (callback) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  db.all('SELECT file_url FROM messages WHERE file_url IS NOT NULL AND timestamp < ?', [sevenDaysAgo], (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows.map(row => row.file_url));
  });
};

// 删除旧图片的消息记录
const deleteOldImageMessages = (callback) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  db.run('DELETE FROM messages WHERE file_url IS NOT NULL AND timestamp < ?', [sevenDaysAgo], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, this.changes);
  });
};

module.exports = { db, registerUser, verifyUser, updateUserPassword, saveMessage, recordUserSpeech, getRecentMessages, getAllUsers, updateUserAdminStatus, addInvitationCode, getInvitationCode, decrementInvitationCodeUses, muteUser, unmuteUser, isUserMuted, getLeaderboard, getAllInvitationCodes, getOldImageFilePaths, deleteOldImageMessages };
