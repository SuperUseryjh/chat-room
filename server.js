const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { registerUser, verifyUser, updateUserPassword, saveMessage, recordUserSpeech, getRecentMessages, getAllUsers, updateUserAdminStatus, addInvitationCode, getInvitationCode, decrementInvitationCodeUses, muteUser, unmuteUser, isUserMuted, getLeaderboard, getAllInvitationCodes, getOldImageFilePaths, deleteOldImageMessages } = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const users = {}; // 存储在线用户 { socket.id: { username, isAdmin } }
const onlineUsernames = new Set(); // 存储在线用户的用户名
const initialAdminUsername = process.env.INITIAL_ADMIN_USERNAME || 'admin';
const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'adminpass';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const saltRounds = 10;

// 创建 uploads 目录（如果不存在）
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// 配置 multer 用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage: storage });

// 图片清理函数
const cleanupImages = () => {
  getOldImageFilePaths((err, fileUrls) => {
    if (err) {
      return console.error('获取旧图片文件路径失败:', err.message);
    }

    fileUrls.forEach(fileUrl => {
      const filePath = path.join(__dirname, 'public', fileUrl);
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error(`删除旧图片文件 ${filePath} 失败:`, unlinkErr.message);
        } else {
          console.log(`已删除旧图片文件: ${filePath}`);
        }
      });
    });

    deleteOldImageMessages((err, changes) => {
      if (err) {
        return console.error('删除旧图片消息记录失败:', err.message);
      }
      console.log(`已从数据库中删除 ${changes} 条旧图片消息记录。`);
    });
  });
};

// 首次启动时执行清理
cleanupImages();
// 每天执行一次清理 (24小时 * 60分钟 * 60秒 * 1000毫秒)
setInterval(cleanupImages, 24 * 60 * 60 * 1000);

// 初始化管理员账户
registerUser(initialAdminUsername, initialAdminPassword, true, (err, user) => {
  if (err && !err.message.includes('UNIQUE constraint failed')) {
    console.error('创建初始管理员失败:', err.message);
  } else if (!err) {
    console.log('初始管理员账户已创建或已存在');
  }
});

app.use(express.static('public'));
app.use(express.json()); // 用于解析 JSON 请求体

// 提供管理员面板页面
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 提供排行榜页面
app.get('/leaderboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
});

// JWT 认证中间件
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ success: false, message: '无效或过期的 token' });
      }
      req.user = user; // 将解码后的用户信息附加到请求对象
      next();
    });
  } else {
    res.status(401).json({ success: false, message: '未提供认证 token' });
  }
};

// 管理员权限检查中间件
const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({ success: false, message: '未经授权，需要管理员权限' });
  }
};

// 注册路由
app.post('/register', (req, res) => {
  const { username, password, invitationCode } = req.body;
  if (!username || !password || !invitationCode) {
    return res.status(400).json({ success: false, message: '用户名、密码和邀请码不能为空' });
  }

  getInvitationCode(invitationCode, (err, codeEntry) => {
    if (err || !codeEntry || codeEntry.current_uses >= codeEntry.max_uses) {
      return res.status(403).json({ success: false, message: '无效或已用尽的邀请码' });
    }

    registerUser(username, password, false, (err, user) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ success: false, message: '用户名已被占用' });
        }
        console.error('注册用户失败:', err.message);
        return res.status(500).json({ success: false, message: '注册失败' });
      }

      decrementInvitationCodeUses(invitationCode, (err, success) => {
        if (err || !success) {
          console.error('递减邀请码使用次数失败:', err ? err.message : '未知错误');
          // 注册成功但邀请码更新失败，需要处理回滚或日志记录
        }
        res.status(201).json({ success: true, message: '注册成功' });
      });
    });
  });
});

// 文件上传路由
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '没有文件被上传' });
  }
  // 返回可访问的图片 URL
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, fileUrl: fileUrl });
});

// 修改密码路由
app.post('/change-password', authenticateJWT, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const username = req.user.username; // 从 JWT 中获取用户名

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: '旧密码和新密码不能为空' });
  }

  verifyUser(username, oldPassword, (err, user) => {
    if (err) {
      console.error('验证旧密码失败:', err.message);
      return res.status(500).json({ success: false, message: '修改密码失败' });
    }
    if (!user) {
      return res.status(401).json({ success: false, message: '旧密码不正确' });
    }

    // 验证旧密码成功，哈希新密码并更新
    bcrypt.hash(newPassword, saltRounds, (err, newHashedPassword) => {
      if (err) {
        console.error('哈希新密码失败:', err.message);
        return res.status(500).json({ success: false, message: '修改密码失败' });
      }

      updateUserPassword(username, newHashedPassword, (err, success) => {
        if (err || !success) {
          console.error('更新用户密码失败:', err ? err.message : '未知错误');
          return res.status(500).json({ success: false, message: '修改密码失败' });
        }
        res.json({ success: true, message: '密码修改成功，请重新登录' });
      });
    });
  });
});

// 获取排行榜数据路由
app.get('/scores/:timeframe', authenticateJWT, (req, res) => {
  const { timeframe } = req.params;
  getLeaderboard(timeframe, (err, scores) => {
    if (err) {
      console.error('获取排行榜失败:', err.message);
      return res.status(500).json({ success: false, message: '获取排行榜失败' });
    }
    res.json({ success: true, scores: scores });
  });
});

// 管理员面板 API (现在使用 JWT 认证和管理员授权)
app.get('/admin/users', authenticateJWT, authorizeAdmin, (req, res) => {
  getAllUsers((err, users) => {
    if (err) {
      console.error('获取用户列表失败:', err.message);
      return res.status(500).json({ success: false, message: '获取用户列表失败' });
    }
    res.json({ success: true, users: users });
  });
});

app.post('/admin/mute', authenticateJWT, authorizeAdmin, (req, res) => {
  const { username, mute } = req.body;
  if (!username || typeof mute !== 'boolean') {
    return res.status(400).json({ success: false, message: '用户名和禁言状态不能为空' });
  }

  const action = mute ? muteUser : unmuteUser;
  action(username, (err, success) => {
    if (err || !success) {
      console.error(`${mute ? '禁言' : '解禁'}用户失败:`, err ? err.message : '未知错误');
      return res.status(500).json({ success: false, message: `${mute ? '禁言' : '解禁'}用户失败` });
    }
    io.emit('user muted status', { username, isMuted: mute }); // 通知所有客户端用户禁言状态变化
    res.json({ success: true, message: `${username} 已${mute ? '禁言' : '解禁'}` });
  });
});

app.post('/admin/invitation-codes', authenticateJWT, authorizeAdmin, (req, res) => {
  const { code, maxUses } = req.body;
  if (!code || !maxUses || maxUses <= 0) {
    return res.status(400).json({ success: false, message: '邀请码和有效使用次数不能为空且必须大于0' });
  }

  addInvitationCode(code, maxUses, (err, newCode) => {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ success: false, message: '邀请码已存在' });
      }
      console.error('添加邀请码失败:', err.message);
      return res.status(500).json({ success: false, message: '添加邀请码失败' });
    }
    res.status(201).json({ success: true, message: '邀请码添加成功', code: newCode });
  });
});

app.post('/admin/set-admin', authenticateJWT, authorizeAdmin, (req, res) => {
  const { username, isAdmin } = req.body;
  if (!username || typeof isAdmin !== 'boolean') {
    return res.status(400).json({ success: false, message: '用户名和管理员状态不能为空' });
  }

  if (username === initialAdminUsername && !isAdmin) {
    return res.status(403).json({ success: false, message: '初始管理员不能被取消管理员身份' });
  }

  updateUserAdminStatus(username, isAdmin, (err, success) => {
    if (err || !success) {
      console.error(`设置用户 ${username} 管理员状态失败:`, err ? err.message : '未知错误');
      return res.status(500).json({ success: false, message: `设置用户 ${username} 管理员状态失败` });
    }
    io.emit('user admin status', { username, isAdmin }); // 通知所有客户端用户管理员状态变化
    res.json({ success: true, message: `用户 ${username} 已${isAdmin ? '设置为' : '取消'}管理员` });
  });
});

// 获取所有邀请码的路由
app.get('/admin/invitation-codes-list', authenticateJWT, authorizeAdmin, (req, res) => {
  getAllInvitationCodes((err, codes) => {
    if (err) {
      console.error('获取邀请码列表失败:', err.message);
      return res.status(500).json({ success: false, message: '获取邀请码列表失败' });
    }
    res.json({ success: true, codes: codes });
  });
});

// 获取所有插件的路由
app.get('/admin/plugins', authenticateJWT, authorizeAdmin, (req, res) => {
  const pluginsInfo = loadedPlugins.map(plugin => ({
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    enabled: plugin.enabled !== false, // 默认启用
  }));
  res.json({ success: true, plugins: pluginsInfo });
});

// 切换插件状态的路由
app.post('/admin/plugins/toggle', authenticateJWT, authorizeAdmin, (req, res) => {
  const { name, enabled } = req.body;
  const pluginIndex = loadedPlugins.findIndex(p => p.name === name);

  if (pluginIndex === -1) {
    return res.status(404).json({ success: false, message: '插件未找到' });
  }

  const plugin = loadedPlugins[pluginIndex];
  plugin.enabled = enabled;

  // 重新加载插件以应用状态变化
  // 注意：这里只是简单地重新加载，实际生产环境可能需要更复杂的插件热插拔机制
  loadedPlugins = []; // 清空当前加载的插件
  loadPlugins(); // 重新加载所有插件

  res.json({ success: true, message: `插件 ${name} 已${enabled ? '启用' : '禁用'}` });
});

// 插件系统
const pluginsDir = path.join(__dirname, 'plugins');
let loadedPlugins = [];

const pluginApi = {
  sendMessage: (message, username = 'System', fileUrl = null, quotedMessage = null, mentions = []) => {
    // 模拟 io.emit('chat message')
    io.emit('chat message', { username, message, file_url: fileUrl, timestamp: new Date().toISOString(), quoted_message: quotedMessage, mentions: mentions });
  },
  getOnlineUsers: () => Array.from(onlineUsernames),
  getAdminUsers: async () => {
    return new Promise((resolve, reject) => {
      getAllUsers((err, users) => {
        if (err) return reject(err);
        resolve(users.filter(u => u.isAdmin).map(u => u.username));
      });
    });
  },
  muteUser: (username) => {
    return new Promise((resolve, reject) => {
      muteUser(username, (err, success) => {
        if (err) return reject(err);
        if (success) io.emit('user muted status', { username, isMuted: true });
        resolve(success);
      });
    });
  },
  unmuteUser: (username) => {
    return new Promise((resolve, reject) => {
      unmuteUser(username, (err, success) => {
        if (err) return reject(err);
        if (success) io.emit('user muted status', { username, isMuted: false });
        resolve(success);
      });
    });
  },
  isUserMuted: (username) => {
    return new Promise((resolve, reject) => {
      isUserMuted(username, (err, isMuted) => {
        if (err) return reject(err);
        resolve(isMuted);
      });
    });
  },
  // 简单的事件系统，用于插件内部通信
  _events: {},
  on: function(eventName, listener) {
    if (!this._events[eventName]) {
      this._events[eventName] = [];
    }
    this._events[eventName].push(listener);
  },
  off: function(eventName, listener) {
    if (!this._events[eventName]) return;
    this._events[eventName] = this._events[eventName].filter(l => l !== listener);
  },
  emit: function(eventName, ...args) {
    if (this._events[eventName]) {
      this._events[eventName].forEach(listener => listener(...args));
    }
  }
};

function loadPlugins() {
  if (!fs.existsSync(pluginsDir)) {
    console.warn('插件目录不存在: ', pluginsDir);
    return;
  }

  fs.readdirSync(pluginsDir).forEach(file => {
    if (file.endsWith('.js')) {
      const pluginPath = path.join(pluginsDir, file);
      try {
        // 清除 require 缓存，以便在开发过程中重新加载插件
        delete require.cache[require.resolve(pluginPath)];
        const plugin = require(pluginPath);
        if (plugin.name) {
          // 检查插件是否已启用 (默认为 true)
          if (plugin.enabled === undefined || plugin.enabled === true) {
            plugin.onLoad && plugin.onLoad(pluginApi);
            loadedPlugins.push(plugin);
            console.log(`插件加载成功: ${plugin.name} (版本: ${plugin.version || 'N/A'})`);
          } else {
            console.log(`插件 ${plugin.name} 已禁用，未加载。`);
          }
        } else {
          console.warn(`插件文件 ${file} 缺少 'name' 属性，跳过加载。`);
        }
      } catch (error) {
        console.error(`加载插件 ${file} 失败:`, error.message);
      }
    }
  });
}

// 在服务器启动时加载插件
loadPlugins();

io.on('connection', (socket) => {
  console.log('新用户连接:', socket.id);

  // 处理重新连接时的登录 (使用 JWT)
  socket.on('reconnect_login', (token, callback) => {
    if (!token) {
      return callback({ success: false, message: '未提供认证 token' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return callback({ success: false, message: '无效或过期的 token' });
      }

      if (Object.values(users).some(u => u.username === user.username)) {
        return callback({ success: false, message: '用户已在线' });
      }

      users[socket.id] = { username: user.username, isAdmin: user.isAdmin };
      onlineUsernames.add(user.username); // 添加到在线用户列表
      callback({ success: true, username: user.username, isAdmin: user.isAdmin });
      console.log(`用户 ${user.username} 重新登录成功 (管理员: ${user.isAdmin})`);

      // 发送最近的聊天记录给重新登录的用户
      getRecentMessages(50, (err, messages) => {
        if (err) {
          console.error('获取历史消息失败:', err.message);
          return;
        }
        socket.emit('history messages', messages);
      });
      io.emit('online users', Array.from(onlineUsernames)); // 广播更新后的在线用户列表
    });
  });

  // 处理登录 (生成 JWT)
  socket.on('login', (credentials, callback) => {
    const { username, password } = credentials;
    verifyUser(username, password, (err, user) => {
      if (err) {
        console.error('验证用户失败:', err.message);
        return callback({ success: false, message: '登录失败' });
      }
      if (user) {
        if (Object.values(users).some(u => u.username === user.username)) {
          return callback({ success: false, message: '用户已在线' });
        }

        // 生成 JWT
        const token = jwt.sign({ username: user.username, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '1h' });

        users[socket.id] = { username: user.username, isAdmin: user.isAdmin };
        onlineUsernames.add(user.username); // 添加到在线用户列表
        callback({ success: true, username: user.username, isAdmin: user.isAdmin, token: token });
        io.emit('user joined', user.username); // 通知所有客户端有新用户加入
        io.emit('online users', Array.from(onlineUsernames)); // 广播更新后的在线用户列表
        console.log(`用户 ${user.username} 登录成功 (管理员: ${user.isAdmin})`);

        // 发送最近的聊天记录给新登录的用户
        getRecentMessages(50, (err, messages) => {
          if (err) {
            console.error('获取历史消息失败:', err.message);
            return;
          }
          socket.emit('history messages', messages);
        });

      } else {
        callback({ success: false, message: '用户名或密码错误' });
      }
    });
  });

  // 处理聊天消息 (验证 JWT)
  socket.on('chat message', (messageData, callback) => {
    const { token, text, fileUrl, quotedMessage, mentions } = messageData;

    if (!token) {
      return callback && callback({ success: false, message: '未提供认证 token' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return callback && callback({ success: false, message: '无效或过期的 token' });
      }

      const username = user.username;
      // 确保用户仍然在线（虽然 JWT 验证了身份，但用户可能已断开 Socket 连接）
      if (!Object.values(users).some(u => u.username === username)) {
        return callback && callback({ success: false, message: '用户未在线' });
      }

      isUserMuted(username, (err, isMuted) => {
        if (err) {
          console.error('检查用户禁言状态失败:', err.message);
          return callback && callback({ success: false, message: '发送消息失败' });
        }
        if (isMuted) {
          return callback && callback({ success: false, message: '你已被禁言，无法发送消息。', isMuted: true });
        }

        // 插件消息预处理
        let messageHandledByPlugin = false;
        for (const plugin of loadedPlugins) {
          if (plugin.onChatMessage) {
            try {
              const result = plugin.onChatMessage(messageData, pluginApi);
              if (result === true) {
                messageHandledByPlugin = true;
                break;
              }
            } catch (pluginError) {
              console.error(`插件 ${plugin.name} 处理消息失败:`, pluginError.message);
            }
          }
        }

        if (messageHandledByPlugin) {
          return callback && callback({ success: true }); // 插件已处理消息，不再进行默认处理
        }

        // 记录用户发言
        recordUserSpeech(username, (err) => {
          if (err) {
            console.error('记录用户发言失败:', err.message);
            // 即使记录失败，也允许消息发送
          }
        });

        saveMessage(username, text, fileUrl, quotedMessage, mentions, (err, savedMsg) => {
          if (err) {
            console.error('保存消息失败:', err.message);
            return callback && callback({ success: false, message: '发送消息失败' });
          }
          io.emit('chat message', { username: username, message: text, file_url: fileUrl, timestamp: savedMsg.timestamp, quoted_message: quotedMessage, mentions: mentions }); // 广播消息给所有客户端
          console.log(`[${username}]: ${text || '[图片]'}`);
          callback && callback({ success: true });
        });
      });
    });
  });

  // 处理用户断开连接
  socket.on('disconnect', () => {
    // 找到并移除断开连接的用户
    let disconnectedUsername = null;
    for (const socketId in users) {
      if (socketId === socket.id) {
        disconnectedUsername = users[socketId].username;
        delete users[socketId];
        break;
      }
    }

    if (disconnectedUsername) {
      onlineUsernames.delete(disconnectedUsername); // 从在线用户列表中移除
      io.emit('user left', disconnectedUsername); // 通知所有客户端有用户离开
      io.emit('online users', Array.from(onlineUsernames)); // 广播更新后的在线用户列表
      console.log(`用户 ${disconnectedUsername} 断开连接`);
    }
    console.log('用户断开连接:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});